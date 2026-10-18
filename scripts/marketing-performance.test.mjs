import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { workerScriptAccounting, verifyDerivedBrandShape } from './marketing-performance-metrics.mjs';

const path = '/_astro/renderer.worker-example.js';
const files = [{ path: path.slice(1), bytes: 1200, sha256: 'fixture' }];

test('worker bytes remain counted when document Resource Timing omits them', () => {
  const accounting = workerScriptAccounting([path, path, '/_astro/page.js'], [], files);
  assert.equal(accounting.requestCount, 2);
  assert.equal(accounting.observedBodyBytes, 2400);
  assert.equal(accounting.uniqueBodyBytes, 1200);
  assert.deepEqual(accounting.omittedFromDocumentResourceTiming, [path]);
  assert.equal(workerScriptAccounting([path], [{ name: 'http://localhost' + path }], files).resources[0].documentResourceTimingEntries, 1);
  assert.throws(() => workerScriptAccounting([path], [], []), /immutable served inventory/);
});

test('derived geometry exception rejects altered approved source or contour', () => {
  const source = Buffer.from('<svg><path d="M0 0L4 5Z"/></svg>');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const derived = { source: 'app/astro/public/brand/posetek-p.svg', sha256: digest(source), commands: [['M', 0, 0], ['L', 4, 5], ['Z']] };
  verifyDerivedBrandShape(derived, source, digest);
  assert.throws(() => verifyDerivedBrandShape({ ...derived, sha256: 'wrong' }, source, digest), /source bytes/);
  assert.throws(() => verifyDerivedBrandShape({ ...derived, commands: [['M', 0, 0], ['L', 5, 5], ['Z']] }, source, digest), /approved contour/);
});
