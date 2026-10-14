import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'app/src/contracts/backend/v1');
test('backend client bundle is data-only, allowlisted and hash pinned', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  const names = ['D1Benchmarks.json', 'athlete-profile-spec.json', 'scoring-vectors.json', 'workout-vectors.json'];
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceRepository, 'posetek/posetek-backend');
  assert.match(manifest.importedFrom.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(manifest.files).sort(), names.sort());
  assert.deepEqual(fs.readdirSync(dir).sort(), [...names, 'manifest.json'].sort());
  for (const [name, hash] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(dir, name));
    JSON.parse(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'D1Benchmarks.json'))),
    JSON.parse(fs.readFileSync(path.join(root, 'app/src/pages/athlete-portal/player/D1Benchmarks.json'))));
});
test('frontend cannot import private Functions implementation', () => {
  const visit = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? visit(path.join(directory, e.name)) : [path.join(directory, e.name)]);
  for (const file of visit(path.join(root, 'app/src')).filter(file => /\.[cm]?[jt]sx?$/.test(file))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /(?:from\s*|require\s*\(|import\s*\()\s*['"][^'"]*\.\.\/[^'"]*functions\//,
      `Private server import in ${path.relative(root, file)}`);
  }
});
