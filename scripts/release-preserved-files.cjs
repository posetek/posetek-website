// The preserved-file check of test-production-entry.cjs. Every baseline file must be
// byte-identical in production-dist, except the documents an application release's receipt
// names as replaced: /application.html always, and /player-signin.html only when the release
// was built with --replace-player-signin. Without a receipt the check stays strict.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const hash = bytes => createHash('sha1').update(bytes).digest('hex');
const navigation = /\n<!-- homepage-navigation:start -->[\s\S]*?<!-- homepage-navigation:end -->\n/g;

function reviewedRecord(record, path, label) {
  assert.equal(record?.path, path, `Release receipt must name the ${label}`);
  assert.match(record.sha, /^[a-f0-9]{40}$/, 'Release receipt needs a SHA-1');
  assert.ok(Number.isSafeInteger(record.size) && record.size > 0, 'Release receipt needs an exact positive size');
  return record;
}

/** Documents the receipt reviewed as replaced, keyed by path. */
function reviewedDocuments(manifest, receipt) {
  const reviewed = new Map();
  if (!receipt) return reviewed;
  assert.equal(receipt.baselineDeploymentId, manifest.deploymentId, 'Release receipt belongs to another baseline');
  reviewed.set('/application.html', reviewedRecord(receipt.application, '/application.html', 'application document'));
  if (receipt.playerSignInReplaced === true) {
    reviewed.set('/player-signin.html', reviewedRecord(receipt.playerSignIn?.document, '/player-signin.html', 'replaced sign-in document'));
  } else assert.ok(receipt.playerSignInReplaced === undefined, 'Release receipt has an unexpected sign-in replacement value');
  return reviewed;
}

/** Asserts every baseline file against the baseline or, for a reviewed document, the receipt. */
function verifyPreservedFiles({ manifest, receipt = null, read }) {
  const preserveApplicationEntry = (manifest.applicationPath ?? '/index.html') === '/application.html';
  const reviewed = reviewedDocuments(manifest, receipt);
  for (const file of manifest.files) {
    const expected = reviewed.get(file.path) || file;
    const legacyShell = !preserveApplicationEntry && file.path === '/index.html';
    let bytes = read(legacyShell ? '/application.html' : file.path);
    if (legacyShell) bytes = bytes.toString('utf8').replace(navigation, '');
    assert.equal(typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length, expected.size, 'Verified file size changed: ' + file.path);
    assert.equal(hash(bytes), expected.sha, 'Verified file changed: ' + file.path);
  }
  return [...reviewed.values()];
}

module.exports = { reviewedDocuments, verifyPreservedFiles };
