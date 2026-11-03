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
