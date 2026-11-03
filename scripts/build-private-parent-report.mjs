// Add only the isolated report shell and sealed envelopes. Never rebuild or
// replace the predecessor application/marketing as part of a report release.
import { readFile, writeFile, readdir, mkdir, rm, lstat, rename } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const REPORT_FILES = ['index.html', 'report.css', 'render.mjs', 'crypto.mjs', 'loader.mjs'];
const METADATA = '/netlify.toml';
const hash = bytes => createHash('sha1').update(bytes).digest('hex');
const collisionKey = name => name.normalize('NFC').toLowerCase();
const fail = message => { throw new Error(message); };

function artifactPath(directory, name) {
  if (typeof name !== 'string' || !name.startsWith('/') || name.endsWith('/') ||
      /[\\%?#\x00-\x1f\x7f]/.test(name) || name.slice(1).split('/').some(part => !part || part === '.' || part === '..')) {
    fail('Invalid artifact path: ' + name);
  }
  const target = resolve(directory, '.' + name), rel = relative(directory, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail('Path escapes artifact: ' + name);
  return target;
}

async function noLinks(target, allowMissing = false) {
  const full = resolve(target), base = parse(full).root;
  let current = base;
  for (const part of full.slice(base.length).split('/').filter(Boolean)) {
    current = join(current, part);
    let info;
    try { info = await lstat(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) fail('Linked path is not allowed: ' + current);
  }
}

async function regularFile(target) {
  await noLinks(target);
  if (!(await lstat(target)).isFile()) fail('Expected regular file: ' + target);
  return readFile(target);
}

async function listFiles(directory, allowMissing = false) {
  await noLinks(directory, allowMissing);
  let info;
  try { info = await lstat(directory); } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return [];
    throw error;
  }
  if (!info.isDirectory()) fail('Expected directory: ' + directory);
  const files = [];
  async function visit(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const name = prefix + '/' + entry.name, target = artifactPath(directory, name);
      if (entry.isSymbolicLink()) fail('Linked artifact path: ' + name);
      if (entry.isDirectory()) await visit(target, name);
      else if (entry.isFile()) files.push(name);
      else fail('Non-regular artifact path: ' + name);
    }
  }
  await visit(directory, '');
  return files.sort();
}

function validateRows(rows, directory, deploymentId) {
  if (!Array.isArray(rows) || !rows.length) fail('Empty or invalid predecessor inventory');
  const byPath = new Map(), folded = new Map();
  for (const row of rows) {
    artifactPath(directory, row.path);
    if (row.deploy_id !== deploymentId || !/^[a-f0-9]{40}$/.test(row.sha) ||
        !Number.isSafeInteger(row.size) || row.size < 0) fail('Invalid or stale predecessor row: ' + row.path);
    const key = collisionKey(row.path);
    if (folded.has(key)) fail('Predecessor path collision: ' + row.path);
    folded.set(key, row.path);
    byPath.set(row.path, row);
  }
  for (const key of folded.keys()) {
    let parent = key.slice(0, key.lastIndexOf('/'));
    while (parent) {
      if (folded.has(parent)) fail('Predecessor file/directory collision: ' + key);
      parent = parent.slice(0, parent.lastIndexOf('/'));
    }
    if (key === '/report' || key.startsWith('/report/')) fail('Report namespace already exists; this builder is additive only');
  }
  return byPath;
}

function matches(bytes, row) { return bytes.length === row.size && hash(bytes) === row.sha; }
function overlaps(a, b) {
  const rel = relative(a, b);
  return !rel || (!rel.startsWith('..') && !isAbsolute(rel));
}

// root is injectable only through this module API for filesystem fixture tests.
// The CLI always uses this repository and has no guard-skip option.
export async function buildPrivateParentReport({ root = repository, evidenceDirectory, sealedDirectory }) {
  root = resolve(root);
  if (!evidenceDirectory) fail('An evidence directory is required');
  const evidence = resolve(root, evidenceDirectory), output = join(root, 'production-dist');
  const predecessor = join(evidence, 'previous-artifact'), source = join(root, 'app/private-report');
  const stage = join(root, '.private-parent-report-stage');
  if (overlaps(output, evidence) || overlaps(evidence, output) || overlaps(stage, evidence) || overlaps(evidence, stage) ||
      overlaps(source, evidence) || overlaps(evidence, source)) {
    fail('Evidence must be separate from generated output');
  }
  await noLinks(evidence);
  await listFiles(output, true); // Refuse links before the existing guard can remove output.
  await noLinks(stage, true);
  try { await lstat(stage); fail('Report staging directory already exists'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const name of ['artifact-manifest.json', 'build-receipt.json']) await noLinks(join(evidence, name), true);
  const inventoryBytes = await regularFile(join(evidence, 'before-inventory.json'));
  const baselineBytes = await regularFile(join(root, 'deployment/homepage-baseline.json'));
  const baseline = JSON.parse(baselineBytes), before = JSON.parse(inventoryBytes);
  if (typeof baseline.deploymentId !== 'string' || !baseline.deploymentId || !Array.isArray(baseline.files) || !baseline.files.length) {
    fail('Invalid preservation baseline');
  }
  const prior = validateRows(before, predecessor, baseline.deploymentId);
  for (const row of [...baseline.files, ...(baseline.platformConfig ? [baseline.platformConfig] : [])]) {
    const expected = prior.get(row.path);
    if (!expected || expected.sha !== row.sha || expected.size !== row.size) fail('Baseline differs from predecessor inventory: ' + row.path);
  }
  const predecessorFiles = await listFiles(predecessor);
  for (const name of predecessorFiles) {
    const expected = prior.get(name);
    if (!expected || !matches(await regularFile(artifactPath(predecessor, name)), expected)) {
      fail('Predecessor artifact differs from inventory: ' + name);
    }
  }
  const actualPrior = new Set(predecessorFiles);
  for (const name of prior.keys()) {
    if (name !== METADATA && !actualPrior.has(name)) fail('Missing predecessor artifact: ' + name);
  }
  await listFiles(source); // Reject links, but never copy unallowlisted source files.
  const additions = new Map();
  for (const name of REPORT_FILES) additions.set('/report/' + name, await regularFile(join(source, name)));
  if (sealedDirectory) {
    const sealed = resolve(root, sealedDirectory);
    if (overlaps(output, sealed) || overlaps(stage, sealed) || overlaps(source, sealed)) fail('Sealed input must be outside output and report source');
    for (const name of await listFiles(sealed)) {
      if (!/^\/[A-Za-z0-9_-]{32}\.bin$/.test(name)) fail('Sealed directory must contain only report-id .bin envelopes');
      const bytes = await regularFile(artifactPath(sealed, name));
      // Shape only: AES-GCM authenticity is checked by the recipient, with the
      // private key. No key or plaintext is read by this builder.
      if (bytes.length < 30 || bytes.length > 2_000_000 || bytes[0] !== 1) fail('Invalid sealed report envelope: ' + name);
      additions.set('/report/data' + name, bytes);
    }
  }
  const additionKeys = new Set();
  for (const name of additions.keys()) {
    const key = collisionKey(name);
    if (additionKeys.has(key)) fail('Report path collision: ' + name);
    additionKeys.add(key);
  }

  const guard = join(root, 'scripts/build-production.mjs');
  const guardBytes = await regularFile(guard);
  // A failed rebuild must not leave a previous success receipt beside its
  // changed output. These two files are generated evidence, never inputs.
  for (const name of ['artifact-manifest.json', 'build-receipt.json']) await rm(join(evidence, name), { force: true });
  const result = spawnSync(process.execPath, [guard], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) fail('Guarded preservation build failed');
  if (!(await regularFile(guard)).equals(guardBytes) || !(await regularFile(join(root, 'deployment/homepage-baseline.json'))).equals(baselineBytes)) {
    fail('Guard or baseline changed during build');
  }
  const generated = await listFiles(output);
  const preserved = [...prior.values()].filter(row => row.path !== METADATA);
  await mkdir(stage, { mode: 0o700 });
  try {
    // Restore every provider file, including all public documents, from the
    // verified predecessor. No newly generated marketing/app asset survives.
    for (const row of preserved) {
      const bytes = await regularFile(artifactPath(predecessor, row.path));
      if (!matches(bytes, row)) fail('Predecessor changed during build: ' + row.path);
      const target = artifactPath(stage, row.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
    }
    for (const [name, bytes] of additions) {
      const target = artifactPath(stage, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
    }
    const manifest = [];
    for (const name of await listFiles(stage)) {
      const bytes = await regularFile(artifactPath(stage, name)), expected = prior.get(name);
      if (expected ? !matches(bytes, expected) : !additions.has(name)) fail('Unexpected assembled file: ' + name);
      manifest.push({ path: name, sha: hash(bytes), size: bytes.length });
    }
    if (manifest.length !== preserved.length + additions.size) fail('Assembled file count differs');
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const receipt = {
      previousDeploymentId: baseline.deploymentId,
      inventorySha256: createHash('sha256').update(inventoryBytes).digest('hex'),
      baselineSha256: createHash('sha256').update(baselineBytes).digest('hex'),
      guardSha256: createHash('sha256').update(guardBytes).digest('hex'),
      artifactManifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      preservedFiles: preserved.length, artifactFiles: manifest.length,
      addedFiles: [...additions.keys()].sort(),
      removedGuardGeneratedFiles: generated.filter(name => !prior.has(name)).sort(),
      excludedProviderMetadata: prior.has(METADATA) ? [METADATA] : [],
      allPredecessorFilesUnchanged: true, publicDocumentsUnchanged: true,
      applicationUnchanged: true, plaintextOrKeysPackaged: false,
      sealedValidation: 'v1 envelope shape; recipient verifies AES-GCM authenticity',
    };
    await listFiles(output); // No links introduced after the guard.
    await rm(output, { recursive: true });
    await rename(stage, output);
    await writeFile(join(evidence, 'artifact-manifest.json'), manifestBytes, { mode: 0o600 });
    await writeFile(join(evidence, 'build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    return receipt;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [evidenceDirectory, flag, sealedDirectory, ...extra] = process.argv.slice(2);
  if (!evidenceDirectory || (flag && (flag !== '--sealed-dir' || !sealedDirectory)) || extra.length) {
    fail('Use: build-private-parent-report.mjs <evidence-directory> [--sealed-dir <binary-only-directory>]');
  }
  const receipt = await buildPrivateParentReport({ evidenceDirectory, sealedDirectory });
  console.log(`[private-report] Preserved ${receipt.preservedFiles} predecessor files; added ${receipt.addedFiles.length} report files. No upload performed.`);
}
