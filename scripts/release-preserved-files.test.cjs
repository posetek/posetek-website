const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { verifyPreservedFiles } = require('./release-preserved-files.cjs');

const sha1 = value => createHash('sha1').update(value).digest('hex');
const record = (path, bytes) => ({ path, sha: sha1(bytes), size: Buffer.byteLength(bytes) });
const live = { '/application.html': 'live app', '/player-signin.html': 'live sign-in', '/assets/old.js': 'legacy asset' };
const manifest = { deploymentId: 'live-deploy', applicationPath: '/application.html', files: Object.entries(live).map(([path, bytes]) => record(path, bytes)) };

function run(dist, receipt) {
  return verifyPreservedFiles({ manifest, receipt, read: path => Buffer.from(dist[path]) });
}
const built = { ...live, '/application.html': 'new app', '/player-signin.html': 'new sign-in with the Parent panel' };
const applicationReceipt = { baselineDeploymentId: 'live-deploy', application: record('/application.html', built['/application.html']) };
const signInReceipt = { ...applicationReceipt, playerSignInReplaced: true, playerSignIn: { document: record('/player-signin.html', built['/player-signin.html']) } };

test('a replaced sign-in page passes when the receipt names exactly its bytes', () => {
  const reviewed = run(built, signInReceipt);
  assert.deepEqual(reviewed.map(row => row.path), ['/application.html', '/player-signin.html']);
});

test('a replaced sign-in page fails when the receipt names other bytes or no document', () => {
  const otherBytes = { ...signInReceipt, playerSignIn: { document: record('/player-signin.html', 'something else') } };
  assert.throws(() => run(built, otherBytes), /Verified file (size )?changed: \/player-signin.html/);
  assert.throws(() => run(built, { ...signInReceipt, playerSignIn: {} }), /replaced sign-in document/);
  assert.throws(() => run(built, { ...signInReceipt, playerSignInReplaced: 'yes' }), /unexpected sign-in replacement value/);
});

test('without the sign-in replacement in the receipt, a changed sign-in page still fails', () => {
  assert.throws(() => run(built, applicationReceipt), /Verified file (size )?changed: \/player-signin.html/);
  assert.throws(() => run(built, null), /Verified file (size )?changed: \/application.html/);
  // The ordinary strict check is unchanged: an untouched artifact passes with no receipt.
  assert.deepEqual(run(live, null), []);
});

test('every other baseline file is still checked against the baseline', () => {
  assert.throws(() => run({ ...built, '/assets/old.js': 'edited legacy asset' }, signInReceipt), /Verified file (size )?changed: \/assets\/old.js/);
  assert.throws(() => run(built, { ...signInReceipt, baselineDeploymentId: 'other-deploy' }), /another baseline/);
});
