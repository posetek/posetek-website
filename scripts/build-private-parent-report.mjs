// Add only the isolated report shell and sealed envelopes. Never rebuild or
// replace the predecessor application/marketing as part of a report release.
import { readFile, writeFile, readdir, mkdir, rm, lstat, rename } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { playerSignInAssets } from './private-player-signin-assets.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const REPORT_FILES = ['index.html', 'report.css', 'render.mjs', 'crypto.mjs', 'loader.mjs'];
const METADATA = '/netlify.toml';
// One reviewed text-only transition from the initial unsent sample label.
// This is not a general viewer replacement or guard override.
const ENTRY_LABEL_UPDATE = {
  before: { sha: '23b667dda974035fc22bc0d59a15efda25c02f82', size: 829 },
  after: { sha: '52284a92871e0e2f795cfbc060e2f80746a90230', size: 816 },
};
// This transition is limited to the reviewed initial reader and app-entry bytes.
// Source integration is separate from a compatible native release and device
// acceptance; this option does not establish either or authorize outreach.
const WORKOUT_ENTRY_UPDATE = {
  'index.html': ENTRY_LABEL_UPDATE,
  'render.mjs': {
    before: { sha: 'e9e2bf1dad26d359ff7348add11d39fc109976fb', size: 9742 },
    after: { sha: '95946611eac53eb8306805769214ce1b1e840db1', size: 12720 },
  },
  'report.css': {
    before: { sha: 'fedb70b7ab63577b7a8713b63273b539f84e33e3', size: 6793 },
    after: { sha: '639290753226a76116f97d83d77515088af8e7ad', size: 7708 },
  },
};
// Separate, pinned November 7 age-group chart transition; no arbitrary viewer replacement.
const PATHWAY_CHART_UPDATE = {
  "index.html": {before: WORKOUT_ENTRY_UPDATE["index.html"].before, after: {"sha": "52284a92871e0e2f795cfbc060e2f80746a90230", "size": 816}},
  "render.mjs": {before: WORKOUT_ENTRY_UPDATE["render.mjs"].before, after: {"sha": "a433ddae33c57ce7fb966a70934ccea8925b9b6e", "size": 27303}},
  "report.css": {before: WORKOUT_ENTRY_UPDATE["report.css"].before, after: {"sha": "32d2fbcf52202c9731968b078416df86b1592ec3", "size": 10279}},
};
// Adopt only the two reviewed score-card assets over the serving v1 reader.
const SCORE_COMPARISON_UPDATE = {
  'render.mjs': {
    before: { sha: '86c58ad9d2d668872548d39399fb8041faa5f134', size: 38722 },
    after: { sha: '80cc4d65b1b9efb0584c29c9cda7caf5f580012f', size: 50465 },
  },
  'report.css': {
    before: { sha: '2ac57f2f9e42208b5b9f7efe84c7b1181509bd0c', size: 14870 },
    after: { sha: 'a671eaf00a90778ec535f290fb360028ff7f0079', size: 17976 },
  },
};
const PLAYER_SIGNUP_CONFIG_SHA256 = '3b4ad4637ba331ff415ad5843279e17a6d1f1a81c3e7628bef1c5e16f4166947';
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

function validateRows(rows, directory, deploymentId, append) {
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
    if (!append && (key === '/report' || key.startsWith('/report/'))) fail('Report namespace already exists; use explicit append mode for new encrypted snapshots');
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
export async function buildPrivateParentReport({ root = repository, evidenceDirectory, sealedDirectory, append = false, updateEntryLabel = false, updateWorkoutEntry = false, updatePathwayCharts = false, updateScoreComparisons = false, withPlayerSignup = false }) {
  root = resolve(root);
  if (typeof withPlayerSignup !== 'boolean' || withPlayerSignup && (!append || !updatePathwayCharts)) fail('Player signup entry requires the explicit reviewed reader transition');
  if (typeof append !== 'boolean') fail('Append mode must be boolean');
  if (typeof updateEntryLabel !== 'boolean' || (updateEntryLabel && !append)) fail('Entry label transition requires explicit append mode');
  if (typeof updateWorkoutEntry !== 'boolean' || (updateWorkoutEntry && !append)) fail('Workout entry transition requires explicit append mode');
  if (typeof updatePathwayCharts !== 'boolean' || (updatePathwayCharts && !append)) fail('Pathway chart transition requires explicit append mode');
  if (typeof updateScoreComparisons !== 'boolean' || (updateScoreComparisons && !append)) fail('Score comparison transition requires explicit append mode');
  if ([updateEntryLabel, updateWorkoutEntry, updatePathwayCharts, updateScoreComparisons].filter(Boolean).length > 1) fail('Choose only one pinned reader transition');
  if (append && !sealedDirectory) fail('Append mode requires new sealed reports');
  if (!evidenceDirectory) fail('An evidence directory is required');
  const evidence = resolve(root, evidenceDirectory), output = join(root, 'production-dist');
  const predecessor = join(evidence, 'previous-artifact'), source = join(root, 'app/private-report');
  const signupConfig = withPlayerSignup ? await regularFile(join(root, 'deployment/private-player-signup.netlify.toml')) : null;
  if (signupConfig && createHash('sha256').update(signupConfig).digest('hex') !== PLAYER_SIGNUP_CONFIG_SHA256) fail('Player signup routing must match reviewed configuration');
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
  const prior = validateRows(before, predecessor, baseline.deploymentId, append);
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
  const additions = new Map(), replacements = new Map();
  for (const name of REPORT_FILES) {
    const path = '/report/' + name, bytes = await regularFile(join(source, name));
    if (append) {
      // Normal append cannot replace the viewer. Each explicit transition pins
      // both its old and new bytes, with no arbitrary replacement option.
      const previous = prior.get(path);
      const transition = updateScoreComparisons ? SCORE_COMPARISON_UPDATE[name]
        : updatePathwayCharts ? PATHWAY_CHART_UPDATE[name] : updateWorkoutEntry ? WORKOUT_ENTRY_UPDATE[name]
        : name === 'index.html' && updateEntryLabel ? ENTRY_LABEL_UPDATE : null;
      if (transition) {
        if (!previous || previous.sha !== transition.before.sha || previous.size !== transition.before.size ||
            !matches(bytes, transition.after)) fail('Reader transition must match the pinned original and reviewed replacement: ' + path);
        replacements.set(path, bytes);
      } else if (!previous || !matches(bytes, previous)) fail('Append requires the existing unchanged report reader: ' + path);
    } else additions.set(path, bytes);
  }
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
  const priorKeys = new Set([...prior.keys()].map(collisionKey));
  for (const name of additions.keys()) {
    const key = collisionKey(name);
    if (additionKeys.has(key) || priorKeys.has(key) || [...priorKeys].some(path => key.startsWith(path + '/') || path.startsWith(key + '/'))) {
      fail('Report path collision: ' + name);
    }
    additionKeys.add(key);
  }
  if (append && additions.size === 0) fail('Append mode requires new sealed reports');

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
  if (withPlayerSignup) {
    if (prior.has('/player-signin.html')) fail('This signup transition requires an additive entry');
    const build = spawnSync(process.execPath, [join(root, 'app/node_modules/astro/bin/astro.mjs'), 'build', '--config', 'astro.player-signin.config.mjs'], {cwd: join(root, 'app'), stdio: 'inherit', env: {...process.env, ASTRO_TELEMETRY_DISABLED: '1'}});
    if (build.error || build.status !== 0) fail('Isolated player signup build failed');
    if (!(await regularFile(join(root, 'deployment/private-player-signup.netlify.toml'))).equals(signupConfig)) fail('Signup configuration changed during build');
    const closure = await playerSignInAssets(join(root, 'app/player-signin-dist'));
    for (const [path, bytes] of closure) {
      const previous = [...prior.values()].find(row => collisionKey(row.path) === collisionKey(path));
      if (previous) { if (!matches(bytes, previous)) fail('Signup dependency collides with predecessor'); continue; }
      if (additionKeys.has(collisionKey(path))) fail('Signup path collides with report addition');
      additionKeys.add(collisionKey(path)); additions.set(path, bytes);
    }
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
      await writeFile(target, replacements.get(row.path) || bytes, { flag: 'wx' });
    }
    for (const [name, bytes] of additions) {
      const target = artifactPath(stage, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
    }
    const manifest = [];
    for (const name of await listFiles(stage)) {
      const bytes = await regularFile(artifactPath(stage, name)), expected = prior.get(name);
      const replacement = replacements.get(name);
      if (replacement ? !bytes.equals(replacement) : expected ? !matches(bytes, expected) : !additions.has(name)) fail('Unexpected assembled file: ' + name);
      manifest.push({ path: name, sha: hash(bytes), size: bytes.length });
    }
    if (manifest.length !== preserved.length + additions.size) fail('Assembled file count differs');
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const receipt = {
      mode: append ? 'append-encrypted-reports' : 'initial-reader',
      isolatedPlayerSignupEntry: withPlayerSignup,
      configurationPath: withPlayerSignup ? 'deployment/private-player-signup.netlify.toml' : null,
      configurationSha256: signupConfig ? createHash('sha256').update(signupConfig).digest('hex') : null,
      readerTransition: updateScoreComparisons ? 'score-cards-v2' : updatePathwayCharts ? 'pathways-v1' : updateWorkoutEntry ? 'workouts-v1' : updateEntryLabel ? 'neutral-label' : null,
      requiresSeparateNativeAcceptance: !append || updateWorkoutEntry || updatePathwayCharts,
      previousDeploymentId: baseline.deploymentId,
      inventorySha256: createHash('sha256').update(inventoryBytes).digest('hex'),
      baselineSha256: createHash('sha256').update(baselineBytes).digest('hex'),
      guardSha256: createHash('sha256').update(guardBytes).digest('hex'),
      artifactManifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      predecessorFiles: preserved.length,
      preservedFiles: preserved.length - replacements.size, artifactFiles: manifest.length,
      addedFiles: [...additions.keys()].sort(),
      changedFiles: [...replacements.keys()].sort(),
      removedGuardGeneratedFiles: generated.filter(name => !prior.has(name)).sort(),
      excludedProviderMetadata: prior.has(METADATA) ? [METADATA] : [],
      allPredecessorFilesUnchanged: replacements.size === 0, publicDocumentsUnchanged: true,
      applicationUnchanged: true, plaintextOrKeysPackaged: false,
      existingEncryptedReportsUnchanged: true,
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
  const args = process.argv.slice(2), withPlayerSignup = args.at(-1) === '--with-player-signup';
  if (withPlayerSignup) args.pop();
  const updateScoreComparisons = args.at(-1) === '--update-score-comparisons';
  if (updateScoreComparisons) args.pop();
  const updatePathwayCharts = args.at(-1) === '--update-pathway-charts';
  if (updatePathwayCharts) args.pop();
  const updateWorkoutEntry = args.at(-1) === '--update-workout-entry';
  if (updateWorkoutEntry) args.pop();
  const updateEntryLabel = args.at(-1) === '--update-entry-label';
  if (updateEntryLabel) args.pop();
  const append = args.at(-1) === '--append';
  if (append) args.pop();
  const [evidenceDirectory, flag, sealedDirectory, ...extra] = args;
  if (!evidenceDirectory || (flag && (flag !== '--sealed-dir' || !sealedDirectory)) || extra.length) {
    fail('Use: build-private-parent-report.mjs <evidence-directory> [--sealed-dir <binary-only-directory>] [--append] [--update-entry-label | --update-workout-entry | --update-pathway-charts | --update-score-comparisons] [--with-player-signup]');
  }
  const receipt = await buildPrivateParentReport({ evidenceDirectory, sealedDirectory, append, updateEntryLabel, updateWorkoutEntry, updatePathwayCharts, updateScoreComparisons, withPlayerSignup });
  console.log(`[private-report] Preserved ${receipt.preservedFiles} predecessor files; added ${receipt.addedFiles.length} report files. No upload performed.`);
}
