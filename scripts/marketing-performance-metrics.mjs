import assert from 'node:assert/strict';

export const workerScriptPattern = /\/renderer\.worker[-.][^/]+\.js$/;

/** Worker fetches need not appear in the document's Resource Timing timeline. */
export function workerScriptAccounting(requestPaths, resourceEntries, files) {
  const requested = requestPaths.filter(path => workerScriptPattern.test(path));
  const timed = resourceEntries.map(entry => new URL(entry.name).pathname).filter(path => workerScriptPattern.test(path));
  const resources = [...new Set(requested)].map(path => {
    const artifact = files.find(file => '/' + file.path === path);
    assert.ok(artifact, `Observed worker script is absent from the immutable served inventory: ${path}`);
    return { path, requests: requested.filter(item => item === path).length, artifactBodyBytes: artifact.bytes, sha256: artifact.sha256, documentResourceTimingEntries: timed.filter(item => item === path).length };
  });
  return {
    requestCount: requested.length,
    observedBodyBytes: resources.reduce((sum, item) => sum + item.requests * item.artifactBodyBytes, 0),
    uniqueBodyBytes: resources.reduce((sum, item) => sum + item.artifactBodyBytes, 0),
    omittedFromDocumentResourceTiming: resources.filter(item => item.documentResourceTimingEntries === 0).map(item => item.path),
    resources,
  };
}

export function verifyDerivedBrandShape(derived, approvedBytes, sha256) {
  assert.equal(derived.source, 'app/astro/public/brand/posetek-p.svg');
  assert.equal(derived.sha256, sha256(approvedBytes), 'Derived P geometry must identify the exact approved source bytes.');
  const path = approvedBytes.toString().match(/<path\b[^>]*\bd="([^"]+)"/)?.[1];
  assert.ok(path, 'Approved badge path exists.');
  assert.deepEqual(derived.commands.flat().map(String), path.match(/[MLQZ]|-?\d+(?:\.\d+)?/g), 'Derived commands must preserve the approved contour.');
}
