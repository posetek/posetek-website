import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { buildPrivateParentReport } from './build-private-parent-report.mjs';

const sha = bytes => createHash('sha1').update(bytes).digest('hex');
const files = {
  '/index.html': 'original homepage', '/coaches/index.html': 'original coaches',
  '/feedback.html': 'original feedback', '/application.html': 'original app',
  '/assets/prior.js': 'original dependency',
};
async function put(root, path, bytes) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), bytes);
}
async function fixture(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'private-report-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidenceDirectory = join(root, '.netlify/evidence');
  const predecessor = join(evidenceDirectory, 'previous-artifact');
  const rows = Object.entries({ ...files, '/netlify.toml': 'provider metadata' }).map(([path, text]) => ({
    path, deploy_id: 'prior-deploy', sha: sha(text), size: Buffer.byteLength(text),
  }));
  const baseline = { deploymentId: 'prior-deploy', files: rows.filter(row => ['/application.html', '/assets/prior.js'].includes(row.path)), platformConfig: rows.at(-1) };
  for (const [name, text] of Object.entries(files)) await put(predecessor, name, text);
  for (const name of ['index.html', 'report.css', 'render.mjs', 'crypto.mjs', 'loader.mjs']) {
    await put(root, 'app/private-report/' + name, 'static ' + name);
  }
  await put(root, 'app/private-report/not-for-publication.json', '{"private":"must not copy"}');
  await put(root, 'deployment/homepage-baseline.json', JSON.stringify(baseline));
  await put(evidenceDirectory, 'before-inventory.json', JSON.stringify(rows));
  await put(root, 'scripts/build-production.mjs', `
    import { mkdir, writeFile, rm } from 'node:fs/promises';
    import { dirname, join } from 'node:path';
    const output = join(process.cwd(), 'production-dist');
    await rm(output, {recursive:true, force:true});
    for (const [name, text] of Object.entries(${JSON.stringify({ ...files, '/index.html': 'new marketing candidate', '/coaches/index.html': 'new coaches candidate', '/new-generated.js': 'held code', '/report/raw.json': '{"private":"held"}' })})) {
      const target = join(output, name); await mkdir(dirname(target), {recursive:true}); await writeFile(target, text);
    }
    await writeFile(${JSON.stringify(join(evidenceDirectory, 'guard-ran'))}, 'yes');
  `);
  return { root, evidenceDirectory, predecessor, rows, baseline,
    run: overrides => buildPrivateParentReport({ root, evidenceDirectory, ...overrides }),
    saveRows: () => put(evidenceDirectory, 'before-inventory.json', JSON.stringify(rows)),
  };
}
async function names(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = prefix + '/' + entry.name;
    result.push(...(entry.isDirectory() ? await names(join(root, entry.name), path) : [path]));
  }
  return result.sort();
}

async function addExistingReports(f) {
  const existing = {};
  for (const name of ['index.html', 'report.css', 'render.mjs', 'crypto.mjs', 'loader.mjs']) {
    existing['/report/' + name] = await readFile(join(f.root, 'app/private-report', name));
  }
  existing['/report/data/' + 'b'.repeat(32) + '.bin'] = Buffer.concat([Buffer.from([1]), Buffer.alloc(50, 87)]);
  for (const [path, bytes] of Object.entries(existing)) {
    const row = { path, deploy_id: 'prior-deploy', sha: sha(bytes), size: bytes.length };
    f.rows.push(row); f.baseline.files.push(row);
    await put(f.predecessor, path, bytes);
  }
  await f.saveRows();
  await put(f.root, 'deployment/homepage-baseline.json', JSON.stringify(f.baseline));
  return existing;
}

async function initialReaderTransitionFixture(t, pathway = false) {
  const f = await fixture(t), existing = await addExistingReports(f);
  for (const name of ['index.html', 'render.mjs', 'report.css']) {
    const path = '/report/' + name;
    const oldBytes = await readFile(new URL('./fixtures/private-parent-report-reader-v1/' + name, import.meta.url));
    const newBytes = await readFile(new URL((pathway ? '../app/private-report/' : './fixtures/private-parent-report-reader-workouts-v1/') + name, import.meta.url));
    existing[path] = oldBytes;
    Object.assign(f.rows.find(row => row.path === path), { sha: sha(oldBytes), size: oldBytes.length });
    await put(f.predecessor, path, oldBytes);
    await put(f.root, 'app/private-report/' + name, newBytes);
  }
  await f.saveRows();
  await put(f.root, 'deployment/homepage-baseline.json', JSON.stringify(f.baseline));
  const sealedDirectory = join(f.root, '.netlify/sealed');
  await put(sealedDirectory, 'c'.repeat(32) + '.bin', Buffer.concat([Buffer.from([1]), Buffer.alloc(40)]));
  return { ...f, existing, sealedDirectory };
}

test('explicit workout transition preserves all other files and old ciphertext while replacing only three pinned reader files', async t => {
  const f = await initialReaderTransitionFixture(t);
  await assert.rejects(f.run({ sealedDirectory: f.sealedDirectory, append: true }), /existing unchanged report reader/);
  const receipt = await f.run({ sealedDirectory: f.sealedDirectory, append: true, updateWorkoutEntry: true });
  assert.equal(receipt.readerTransition, 'workouts-v1');
  assert.equal(receipt.requiresSeparateNativeAcceptance, true);
  assert.deepEqual(receipt.changedFiles, ['/report/index.html', '/report/render.mjs', '/report/report.css']);
  assert.equal(receipt.preservedFiles, Object.keys(files).length + Object.keys(f.existing).length - 3);
  assert.equal(receipt.existingEncryptedReportsUnchanged, true);
  assert.equal(receipt.allPredecessorFilesUnchanged, false);
  assert.equal(receipt.addedFiles.length, 1);
  for (const [path, oldBytes] of Object.entries(f.existing)) {
    const expected = receipt.changedFiles.includes(path)
      ? await readFile(join(f.root, 'app/private-report', path.split('/').at(-1))) : oldBytes;
    assert.deepEqual(await readFile(join(f.root, 'production-dist', path)), expected);
  }
  for (const [path, text] of Object.entries(files)) assert.equal(await readFile(join(f.root, 'production-dist', path), 'utf8'), text);
});

test('workout transition rejects changed predecessor or replacement bytes before the guard', async t => {
  for (const location of ['predecessor', 'source']) {
    for (const name of ['index.html', 'render.mjs', 'report.css']) {
      const f = await initialReaderTransitionFixture(t), path = '/report/' + name;
      if (location === 'predecessor') {
        const changed = Buffer.concat([f.existing[path], Buffer.from('\nchanged')]);
        Object.assign(f.rows.find(row => row.path === path), { sha: sha(changed), size: changed.length });
        await put(f.predecessor, path, changed);
        await f.saveRows(); await put(f.root, 'deployment/homepage-baseline.json', JSON.stringify(f.baseline));
      } else {
        const target = join(f.root, 'app/private-report', name);
        await writeFile(target, Buffer.concat([await readFile(target), Buffer.from('\nchanged')]));
      }
      await assert.rejects(f.run({ sealedDirectory: f.sealedDirectory, append: true, updateWorkoutEntry: true }), /pinned original and reviewed replacement/);
      await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), { code: 'ENOENT' });
    }
  }
});

test('workout transition is explicit, mutually exclusive and cannot replace other reader files', async t => {
  const f = await initialReaderTransitionFixture(t), sealedDirectory = f.sealedDirectory;
  await assert.rejects(f.run({ sealedDirectory, updateWorkoutEntry: true }), /requires explicit append/);
  await assert.rejects(f.run({ sealedDirectory, append: true, updateWorkoutEntry: 'true' }), /requires explicit append/);
  await assert.rejects(f.run({ sealedDirectory, append: true, updateWorkoutEntry: true, updateEntryLabel: true }), /only one pinned reader transition/);
  await put(f.root, 'app/private-report/crypto.mjs', 'unreviewed crypto change');
  await assert.rejects(f.run({ sealedDirectory, append: true, updateWorkoutEntry: true }), /existing unchanged report reader/);
  await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), { code: 'ENOENT' });
});

test('explicit append preserves the complete reader and old reports; adds only new encrypted snapshots', async t => {
  const f = await fixture(t), existing = await addExistingReports(f);
  const sealedDirectory = join(f.root, '.netlify/sealed');
  const envelope = Buffer.concat([Buffer.from([1]), Buffer.alloc(45, 23)]);
  for (const id of ['c'.repeat(32), 'd'.repeat(32)]) await put(sealedDirectory, id + '.bin', envelope);
  const receipt = await f.run({ sealedDirectory, append: true });
  assert.equal(receipt.mode, 'append-encrypted-reports');
  assert.equal(receipt.addedFiles.length, 2);
  assert(receipt.addedFiles.every(path => path.endsWith('.bin')));
  assert.equal(receipt.preservedFiles, Object.keys(files).length + Object.keys(existing).length);
  for (const [name, bytes] of Object.entries(existing)) assert.deepEqual(await readFile(join(f.root, 'production-dist', name)), bytes);
  for (const [name, text] of Object.entries(files)) assert.equal(await readFile(join(f.root, 'production-dist', name), 'utf8'), text);
  await assert.rejects(readFile(join(f.root, 'production-dist/report/raw.json')), { code: 'ENOENT' });
});

test('append rejects prior encrypted ID collisions including provider case folding before the guard', async t => {
  for (const id of ['b'.repeat(32), 'B'.repeat(32)]) {
    const f = await fixture(t); await addExistingReports(f);
    const sealedDirectory = join(f.root, '.netlify/sealed');
    await put(sealedDirectory, id + '.bin', Buffer.concat([Buffer.from([1]), Buffer.alloc(40)]));
    await assert.rejects(f.run({ sealedDirectory, append: true }), /Report path collision/);
    await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), { code: 'ENOENT' });
  }
});

test('append requires an existing byte-identical reader and at least one new sealed report', async t => {
  for (const variant of ['missing-reader', 'changed-reader', 'empty-batch', 'missing-batch']) {
    const f = await fixture(t);
    if (variant !== 'missing-reader') await addExistingReports(f);
    const sealedDirectory = join(f.root, '.netlify/sealed');
    await mkdir(sealedDirectory, { recursive: true });
    if (variant === 'changed-reader') await put(f.root, 'app/private-report/loader.mjs', 'new unreviewed reader');
    if (variant !== 'empty-batch') await put(sealedDirectory, 'c'.repeat(32) + '.bin', Buffer.concat([Buffer.from([1]), Buffer.alloc(40)]));
    await assert.rejects(f.run({ sealedDirectory: variant === 'missing-batch' ? undefined : sealedDirectory, append: true }), /existing unchanged report reader|requires new sealed reports/);
    await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), { code: 'ENOENT' });
  }
});

test('explicit pinned label transition changes only the known report entry and accounts for the changed file', async t => {
  const f = await fixture(t), existing = await addExistingReports(f);
  const newEntry = await readFile(new URL('../app/private-report/index.html', import.meta.url));
  const oldEntry = Buffer.from(newEntry.toString().replace('Private player report', 'Private review preview · not sent'));
  assert.equal(sha(oldEntry), '23b667dda974035fc22bc0d59a15efda25c02f82');
  const entryRow = f.rows.find(row => row.path === '/report/index.html');
  Object.assign(entryRow, { sha: sha(oldEntry), size: oldEntry.length });
  await put(f.predecessor, '/report/index.html', oldEntry);
  await put(f.root, 'app/private-report/index.html', newEntry);
  await f.saveRows(); await put(f.root, 'deployment/homepage-baseline.json', JSON.stringify(f.baseline));
  const sealedDirectory = join(f.root, '.netlify/sealed');
  await put(sealedDirectory, 'c'.repeat(32) + '.bin', Buffer.concat([Buffer.from([1]), Buffer.alloc(40)]));
  await assert.rejects(f.run({ sealedDirectory, append: true }), /existing unchanged report reader/);
  const receipt = await f.run({ sealedDirectory, append: true, updateEntryLabel: true });
  assert.deepEqual(receipt.changedFiles, ['/report/index.html']);
  assert.equal(receipt.allPredecessorFilesUnchanged, false);
  assert.equal(receipt.preservedFiles, Object.keys(files).length + Object.keys(existing).length - 1);
  assert.deepEqual(await readFile(join(f.root, 'production-dist/report/index.html')), newEntry);
  for (const [path, bytes] of Object.entries(existing)) if (path !== '/report/index.html') assert.deepEqual(await readFile(join(f.root, 'production-dist', path)), bytes);
  await put(f.root, 'app/private-report/index.html', Buffer.concat([newEntry, Buffer.from('unreviewed')]));
  await assert.rejects(f.run({ sealedDirectory, append: true, updateEntryLabel: true }), /pinned original and reviewed replacement/);
});

test('entry label switch cannot update an arbitrary predecessor or be used without append', async t => {
  const f = await fixture(t); await addExistingReports(f);
  const sealedDirectory = join(f.root, '.netlify/sealed');
  await put(sealedDirectory, 'c'.repeat(32) + '.bin', Buffer.concat([Buffer.from([1]), Buffer.alloc(40)]));
  await assert.rejects(f.run({ sealedDirectory, updateEntryLabel: true }), /requires explicit append/);
  await assert.rejects(f.run({ sealedDirectory, append: true, updateEntryLabel: true }), /pinned original and reviewed replacement/);
  await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), { code: 'ENOENT' });
});

test('preserves every predecessor document and asset; discards generated changes; adds only shell and sealed data', async t => {
  const f = await fixture(t), sealedDirectory = join(f.root, '.netlify/sealed');
  const id = 'A'.repeat(32), envelope = Buffer.concat([Buffer.from([1]), Buffer.alloc(60, 153)]);
  await put(sealedDirectory, id + '.bin', envelope);
  const receipt = await f.run({ sealedDirectory });
  assert.equal(await readFile(join(f.evidenceDirectory, 'guard-ran'), 'utf8'), 'yes');
  const output = join(f.root, 'production-dist');
  for (const [name, text] of Object.entries(files)) assert.equal(await readFile(join(output, name), 'utf8'), text);
  assert.deepEqual(await readFile(join(output, 'report/data/' + id + '.bin')), envelope);
  const manifest = JSON.parse(await readFile(join(f.evidenceDirectory, 'artifact-manifest.json')));
  assert.deepEqual(await names(output), manifest.map(row => row.path));
  assert.equal(manifest.length, Object.keys(files).length + 6);
  assert.equal(receipt.preservedFiles, Object.keys(files).length);
  assert.deepEqual(receipt.excludedProviderMetadata, ['/netlify.toml']);
  assert(receipt.removedGuardGeneratedFiles.includes('/new-generated.js'));
  assert(receipt.removedGuardGeneratedFiles.includes('/report/raw.json'));
  assert(!manifest.some(row => /json|netlify\.toml|not-for-publication/.test(row.path)));
  for (const row of manifest) assert.equal(sha(await readFile(join(output, row.path))), row.sha);
});

test('shell-only build succeeds without encrypted input or provider metadata file on disk', async t => {
  const f = await fixture(t), receipt = await f.run();
  assert.equal(receipt.requiresSeparateNativeAcceptance, true);
  assert.equal(receipt.addedFiles.length, 5);
  assert.equal(receipt.artifactFiles, Object.keys(files).length + 5);
});

test('failing production guard prevents report assembly and success receipt', async t => {
  const f = await fixture(t);
  await f.run(); // Rebuilding must invalidate the earlier success receipt.
  await put(f.root, 'production-dist/keep.txt', 'untouched');
  await put(f.root, 'scripts/build-production.mjs', 'process.exit(7);');
  await assert.rejects(f.run(), /Guarded preservation build failed/);
  assert.equal(await readFile(join(f.root, 'production-dist/keep.txt'), 'utf8'), 'untouched');
  await assert.rejects(readFile(join(f.evidenceDirectory, 'build-receipt.json')), { code: 'ENOENT' });
});

test('rejects stale deployment ID and baseline/provider byte mismatch before guard', async t => {
  for (const mutation of [f => { f.rows[0].deploy_id = 'other'; }, f => { f.rows.find(row => row.path === '/application.html').sha = '0'.repeat(40); }]) {
    const f = await fixture(t); mutation(f); await f.saveRows();
    await assert.rejects(f.run(), /stale predecessor|Baseline differs/);
    await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), { code: 'ENOENT' });
  }
});

test('rejects missing, corrupt, or unexpected predecessor artifact files', async t => {
  for (const mutation of [
    f => rm(join(f.predecessor, 'feedback.html')),
    f => put(f.predecessor, 'index.html', 'changed'),
    f => put(f.predecessor, 'extra.json', 'not inventoried'),
  ]) {
    const f = await fixture(t); await mutation(f);
    await assert.rejects(f.run(), /Missing predecessor|artifact differs/);
  }
});

test('rejects traversal, encoded paths, duplicate case paths, file/directory collisions and prior report namespace', async t => {
  for (const path of ['/../escape', '/%2e%2e/escape', '/INDEX.html', '/assets', '/Report/old.html']) {
    const f = await fixture(t);
    f.rows.push({ ...f.rows[0], path }); await f.saveRows();
    await assert.rejects(f.run(), /Invalid artifact path|collision|namespace already exists/);
  }
});

test('rejects links in predecessor, selected source, output, and evidence receipt', async t => {
  for (const location of ['previous', 'source', 'output', 'receipt']) {
    const f = await fixture(t);
    const path = location === 'previous' ? join(f.predecessor, 'index.html')
      : location === 'source' ? join(f.root, 'app/private-report/index.html')
        : location === 'output' ? join(f.root, 'production-dist') : join(f.evidenceDirectory, 'build-receipt.json');
    await rm(path, { force: true, recursive: true });
    await symlink(location === 'output' ? f.predecessor : join(f.predecessor, 'application.html'), path);
    await assert.rejects(f.run(), /Linked/);
  }
});

test('sealed directory rejects plaintext, key records, nested files, links and oversized envelopes', async t => {
  const id = 'A'.repeat(32), envelope = Buffer.concat([Buffer.from([1]), Buffer.alloc(40)]);
  for (const variant of ['json', 'nested', 'plaintext-bin', 'link', 'oversized']) {
    const f = await fixture(t), sealedDirectory = join(f.root, '.netlify/sealed');
    await put(sealedDirectory, id + '.bin', variant === 'plaintext-bin' ? '{"private":"not encrypted"}' : envelope);
    if (variant === 'json') await put(sealedDirectory, 'link-private.json', '{"key":"do not ship"}');
    if (variant === 'nested') await put(sealedDirectory, 'nested/' + id + '.bin', envelope);
    if (variant === 'oversized') await put(sealedDirectory, id + '.bin', Buffer.concat([Buffer.from([1]), Buffer.alloc(2_000_000)]));
    if (variant === 'link') { await rm(join(sealedDirectory, id + '.bin')); await symlink(join(f.predecessor, 'index.html'), join(sealedDirectory, id + '.bin')); }
    await assert.rejects(f.run({ sealedDirectory }), /only report-id|Invalid sealed|Linked|collision/);
  }
});

test('detects predecessor tampering during the guard, leaves no partial report output', async t => {
  const f = await fixture(t), guard = join(f.root, 'scripts/build-production.mjs');
  await writeFile(guard, (await readFile(guard, 'utf8')) + `\nawait writeFile(${JSON.stringify(join(f.predecessor, 'index.html'))}, 'tampered');`);
  await assert.rejects(f.run(), /Predecessor changed during build/);
  await assert.rejects(readFile(join(f.root, 'production-dist/report/loader.mjs')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(f.evidenceDirectory, 'build-receipt.json')), { code: 'ENOENT' });
  await assert.rejects(readdir(join(f.root, '.private-parent-report-stage')), { code: 'ENOENT' });
});


test('explicit pathway transition preserves all predecessor content outside the three pinned reader files', async t => {
  const f = await initialReaderTransitionFixture(t, true);
  await assert.rejects(f.run({sealedDirectory: f.sealedDirectory, append: true, updateWorkoutEntry: true}), /pinned original and reviewed replacement/);
  const receipt = await f.run({sealedDirectory: f.sealedDirectory, append: true, updatePathwayCharts: true});
  assert.equal(receipt.readerTransition, 'pathways-v1');
  assert.equal(receipt.requiresSeparateNativeAcceptance, true);
  assert.deepEqual(receipt.changedFiles, ['/report/index.html', '/report/render.mjs', '/report/report.css']);
  assert.equal(receipt.addedFiles.length, 1);
  assert.equal(receipt.existingEncryptedReportsUnchanged, true);
  for (const [path, bytes] of Object.entries(f.existing)) {
    if (!receipt.changedFiles.includes(path)) assert.deepEqual(await readFile(join(f.root, 'production-dist', path)), bytes);
  }
  for (const [path, value] of Object.entries(files)) assert.equal(await readFile(join(f.root, 'production-dist', path), 'utf8'), value);
});

test('pathway transition cannot bypass explicit selection, predecessor pins, or source pins', async t => {
  const f = await initialReaderTransitionFixture(t, true), sealedDirectory = f.sealedDirectory;
  await assert.rejects(f.run({sealedDirectory, updatePathwayCharts: true}), /requires explicit append/);
  await assert.rejects(f.run({sealedDirectory, append: true, updatePathwayCharts: 'true'}), /requires explicit append/);
  await assert.rejects(f.run({sealedDirectory, append: true, updatePathwayCharts: true, updateWorkoutEntry: true}), /only one pinned/);
  await assert.rejects(f.run({sealedDirectory, append: true, updatePathwayCharts: true, updateEntryLabel: true}), /only one pinned/);
  const target = join(f.root, 'app/private-report/render.mjs');
  await writeFile(target, (await readFile(target)) + '\nchanged');
  await assert.rejects(f.run({sealedDirectory, append: true, updatePathwayCharts: true}), /pinned original and reviewed replacement/);
  await assert.rejects(readFile(join(f.evidenceDirectory, 'guard-ran')), {code: 'ENOENT'});
});

async function signupFixture(t) {
 const f=await initialReaderTransitionFixture(t,true);
 await put(f.root,'deployment/private-player-signup.netlify.toml',await readFile(new URL('../deployment/private-player-signup.netlify.toml',import.meta.url)));
 await put(f.root,'app/node_modules/astro/bin/astro.mjs','// Synthetic compiler boundary. Only prepared fixture output may be packaged.');
 await put(f.root,'app/player-signin-dist/player-signin.html','<!-- posetek-player-signin-entry --><script>window.__posetekPlayerInvitation=null</script><astro-island component-url="/_astro/PlayerSignInRoot.fixture.js"></astro-island>');
 await put(f.root,'app/player-signin-dist/_astro/PlayerSignInRoot.fixture.js','export const fixture=true;');
 await put(f.root,'app/player-signin-dist/_astro/AdminPage.unused.js','neverPackage();');
 return f;
}
test('explicit signup assembly preserves predecessor SPA and packages only the isolated closure with pinned candidate configuration',async t=>{
 const f=await signupFixture(t);
 const receipt=await f.run({sealedDirectory:f.sealedDirectory,append:true,updatePathwayCharts:true,withPlayerSignup:true});
 assert.equal(receipt.isolatedPlayerSignupEntry,true);assert.equal(receipt.configurationPath,'deployment/private-player-signup.netlify.toml');
 assert.equal(receipt.addedFiles.length,3);assert(receipt.addedFiles.includes('/player-signin.html'));
 assert.equal(await readFile(join(f.root,'production-dist/application.html'),'utf8'),files['/application.html']);
 assert(!receipt.addedFiles.some(path=>/AdminPage/.test(path)));
});
test('signup packaging requires explicit mode and exact reviewed routing before running the guard',async t=>{
 const f=await signupFixture(t),sealedDirectory=f.sealedDirectory;
 await assert.rejects(f.run({sealedDirectory,append:true,withPlayerSignup:true}),/explicit reviewed/);
 await put(f.root,'deployment/private-player-signup.netlify.toml','unreviewed route');
 await assert.rejects(f.run({sealedDirectory,append:true,updatePathwayCharts:true,withPlayerSignup:true}),/reviewed configuration/);
 await assert.rejects(readFile(join(f.evidenceDirectory,'guard-ran')),{code:'ENOENT'});
});
test('signup closure collision cannot replace an existing predecessor asset',async t=>{
 const f=await signupFixture(t),path='/_astro/PlayerSignInRoot.fixture.js',bytes=Buffer.from('previous application module');
 const row={path,deploy_id:'prior-deploy',sha:sha(bytes),size:bytes.length};f.rows.push(row);f.baseline.files.push(row);
 await put(f.predecessor,path,bytes);await f.saveRows();await put(f.root,'deployment/homepage-baseline.json',JSON.stringify(f.baseline));
 await assert.rejects(f.run({sealedDirectory:f.sealedDirectory,append:true,updatePathwayCharts:true,withPlayerSignup:true}),/collides with predecessor/);
 await assert.rejects(readFile(join(f.evidenceDirectory,'build-receipt.json')),{code:'ENOENT'});
});
