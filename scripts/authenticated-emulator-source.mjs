// Resolve only explicitly reviewed private Backend rules for local test use.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const canonicalRemotes = new Set([
  'git@github.com:posetek/posetek-backend.git',
  'https://github.com/posetek/posetek-backend.git',
  'https://github.com/posetek/posetek-backend',
  'ssh://git@github.com/posetek/posetek-backend.git',
]);
const ruleNames = ['firestore.rules', 'storage.rules'];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function reviewedBackendRules(repoInput, shaInput) {
  assert.ok(repoInput && path.isAbsolute(repoInput), 'POSETEK_BACKEND_REPO must be an explicit absolute Backend checkout path');
  assert.match(shaInput || '', /^[0-9a-f]{40}$/, 'POSETEK_BACKEND_SHA must be the reviewed full lowercase commit SHA');
  const repo = realpathSync(repoInput);
  assert.equal(realpathSync(git(repo, 'rev-parse', '--show-toplevel')), repo,
    'POSETEK_BACKEND_REPO must name the Backend repository root');
  assert.ok(canonicalRemotes.has(git(repo, 'remote', 'get-url', 'origin')),
    'Backend checkout origin must be the canonical posetek/posetek-backend repository');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), shaInput, 'Backend checkout HEAD differs from POSETEK_BACKEND_SHA');
  const firebase = path.join(repo, 'firebase');
  assert.equal(lstatSync(firebase).isSymbolicLink(), false, 'Backend firebase directory cannot be a symlink');
  const rules = Object.fromEntries(ruleNames.map(name => {
    const relative = `firebase/${name}`;
    const file = path.join(firebase, name);
    assert.equal(lstatSync(file).isSymbolicLink(), false, `${relative} cannot be a symlink`);
    assert.equal(lstatSync(file).isFile(), true, `${relative} must be a file`);
    assert.equal(git(repo, 'ls-files', '--error-unmatch', '--', relative), relative,
      `${relative} must be tracked at the reviewed commit`);
    assert.equal(git(repo, 'status', '--porcelain', '--', relative), '',
      `${relative} differs from the reviewed commit`);
    const reviewedBytes = execFileSync('git', ['show', `${shaInput}:${relative}`],
      { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(readFileSync(file).equals(reviewedBytes), true,
      `${relative} bytes differ from the reviewed commit`);
    return [name === 'firestore.rules' ? 'firestore' : 'storage', file];
  }));
  return { repo, sha: shaInput, ...rules };
}
