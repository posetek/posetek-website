'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { encode } = require('./training-cloud.cjs');
const { sourceHash } = require('./training-access-lib.cjs');
const { buildPlan, validateManifest, verifyPlan, writesFor, metaPatch, patchedTypedFields, verifyAfter, applyPlan } = require('./training-rest-catalog.cjs');
const manifest = JSON.parse(fs.readFileSync('content/training-rest/adjustments.json', 'utf8'));
const inventory = JSON.parse(fs.readFileSync('content/training-access/requirements.json', 'utf8')).inventory;
const ROOT = 'projects/kickai-69dd0/databases/(default)/documents/';
const typed = data => encode(data).mapValue.fields;
const doc = (name, data) => ({ name: ROOT + name, fields: typed(data), createTime: '2026-09-01T00:00:00Z', updateTime: '2026-10-12T00:00:00Z' });
const TIME = '2026-10-12T01:00:00Z';
function fixture() {
  const targets = new Map(manifest.records.map(r => [r.drillId, r]));
  const catalog = inventory.map(row => {
    const r = targets.get(row.drillId);
    const data = r ? { drillId: r.drillId, name: r.name, schemaVersion: r.schemaVersion,
      ...(r.statusBefore == null ? {} : { status: r.statusBefore }), dose: r.doseBefore, estimatedMinutes: r.estimatedMinutesBefore } :
      { drillId: row.drillId, name: row.name, status: 'draft', schemaVersion: 2 };
    if (row.classification === 'whole-body-draft') Object.assign(data, { productionBatchId: 'whole-body-2026-09', trainingPolicy: { reviewStatus: 'pending' } });
    data.media = row.drillId === 'DRB-010' ? { primaryDemo: { status: 'approved', storagePath: 'retained/video.mp4', generation: '123', bytes: 400, uploadedAt: 'retained' } } : {};
    if (row.drillId === 'DRB-010') Object.assign(data, { name: manifest.withdrawal.name, status: 'published', dose: { restSecondsMax: 90 }, estimatedMinutes: { min: 4, max: 12 } });
    data.accessRequirements = { sourceHash: 'keep', schemaVersion: 1 };
    const result = doc('drillCatalog/' + row.drillId, data);
    result.fields.unrelatedTimestamp = { timestampValue: '2026-09-02T00:00:00Z' };
    return result;
  }).sort((a, b) => a.name.localeCompare(b.name));
  const before = { catalog, authors: [doc('drillCatalogAuthoring/STR-503', { reviewStatus: 'pending' })],
    config: doc('config/llm', { wholeBodyTraining: { mobileVerified: false }, unrelated: true }),
    meta: doc('drillCatalogMeta/current', { catalogVersion: '1.0.95', unrelated: true }) };
  return { before, plan: buildPlan(manifest, before) };
}
function applied(plan) {
  const after = structuredClone(plan.before);
  for (const p of plan.patches) {
    const d = after.catalog.find(d => d.name === p.name); d.fields = patchedTypedFields(d.fields, p);
    for (const field of p.transforms) d.fields[field] = { timestampValue: TIME };
    d.updateTime = TIME;
  }
  Object.assign(after.meta.fields, typed(metaPatch(plan)), { updatedAt: { timestampValue: TIME } }); after.meta.updateTime = TIME;
  return after;
}
test('18 lower-bound rests preserve scope, volume, source hashes and three legacy schemas', () => {
  const { plan } = fixture(); verifyPlan(plan, manifest);
  assert.equal(plan.catalogVersionAfter, '1.0.96'); assert.equal(plan.patches.length, 19);
  for (const r of manifest.records) {
    const p = plan.patches.find(p => p.id === r.drillId);
    const dose = { ...r.doseBefore, ...p.fields.dose };
    assert.equal(dose.restSecondsMin, dose.restSecondsMax); assert.equal(dose.restScope, r.doseBefore.restScope);
    assert.equal(dose.setsMax, r.doseBefore.setsMax); assert.equal(dose.repsMax, r.doseBefore.repsMax);
    assert.equal(sourceHash(r.drillId, { name: r.name, dose }), sourceHash(r.drillId, { name: r.name, dose: r.doseBefore }));
    assert.equal(p.fields.schemaVersion, undefined); assert.equal(p.fields.status, undefined);
  }
  const byId = id => plan.patches.find(p => p.id === id);
  assert.deepEqual(byId('HJP-003').fields.estimatedMinutes, { min: 5, max: 9 }); // single-set per-repetition recovery
  assert.deepEqual(byId('COD-003').fields.estimatedMinutes, { min: 4, max: 10 }); // both sides and interset recovery
  assert.deepEqual(byId('VJP-004').fields.estimatedMinutes, { min: 2, max: 5 }); // contacts, not eight-second repetitions
  assert.equal(byId('DRB-010').fields.dose, undefined);
});
test('20 guarded leaf writes preserve the video object and all unrelated typed fields', () => {
  const { plan } = fixture(); const writes = writesFor(plan);
  assert.equal(writes.length, 20);
  assert.ok(writes.every(w => w.currentDocument.updateTime && !w.delete));
  assert.deepEqual(writes.find(w => w.update.name.endsWith('/DRB-010')).updateMask.fieldPaths,
    ['status', 'media.primaryDemo.status', 'catalogVersion', 'updatedBy']);
  assert.equal(verifyAfter(plan, applied(plan)).unrelatedRecordsExact, 189);
  const legacy = applied(plan).catalog.find(d => d.name.endsWith('/STR-001'));
  assert.equal(legacy.fields.schemaVersion.integerValue, '1'); assert.equal(legacy.fields.status, undefined);
});
test('scope widening, below-bound rest, altered doses and newly managed reviews fail closed', () => {
  for (const mutate of [m => m.records[0].restSecondsAfter = 30, m => m.records.push(m.records[0]), m => m.withdrawal.statusAfter = 'published']) {
    const m = structuredClone(manifest); mutate(m); assert.throws(() => validateManifest(m));
  }
  for (const mutate of [d => d.fields.trainingPolicy = typed({ reviewStatus: 'approved' }).reviewStatus,
    d => d.fields.reviewedBy = { stringValue: 'reviewer' }, d => d.fields.dose.mapValue.fields.repsMax = { integerValue: '100' }]) {
    const { before } = fixture(); mutate(before.catalog.find(d => d.name.endsWith('/COD-002')));
    assert.throws(() => buildPlan(manifest, before));
  }
  const { before } = fixture(); before.authors.push(doc('drillCatalogAuthoring/COD-002', { reviewStatus: 'approved' }));
  assert.throws(() => buildPlan(manifest, before));
});
test('readback detects unrelated changes, altered video generations and accidental legacy migration', () => {
  for (const mutate of [after => after.catalog[0].fields.name = { stringValue: 'changed' },
    after => after.catalog.find(d => d.name.endsWith('/DRB-010')).fields.media.mapValue.fields.primaryDemo.mapValue.fields.generation = { stringValue: 'new' },
    after => after.catalog.find(d => d.name.endsWith('/STR-001')).fields.status = { stringValue: 'published' },
    after => after.config.fields.unrelated = { booleanValue: false }]) {
    const { plan } = fixture(), after = applied(plan); mutate(after); assert.throws(() => verifyAfter(plan, after));
  }
});
test('REQUEST_TIME may precede the microsecond commit time, but inconsistent transforms fail', () => {
  const { plan } = fixture(), after = applied(plan);
  for (const patch of plan.patches) after.catalog.find(d => d.name === patch.name).updateTime = '2026-10-12T01:00:00.075123Z';
  after.meta.updateTime = '2026-10-12T01:00:00.075123Z';
  assert.equal(verifyAfter(plan, after).status, 'verified');
  after.catalog.find(d => d.name.endsWith('/DRB-010')).fields.mediaPublishedAt.timestampValue = '2026-10-12T01:00:00.001Z';
  assert.throws(() => verifyAfter(plan, after), /REQUEST_TIME/);
});
function fakeCloud(fresh, events, outcome = 'fail') {
  return { api: async (url, method, body) => {
    if (url.endsWith(':beginTransaction')) return { transaction: 'synthetic-transaction' };
    if (url.endsWith(':rollback')) { events.push('rollback'); return {}; }
    if (url.endsWith(':runQuery')) return (body.structuredQuery.from[0].collectionId === 'drillCatalog' ? fresh.catalog : fresh.authors).map(document => ({ document }));
    if (url.includes('/drillCatalogMeta/current')) return fresh.meta;
    if (url.includes('/config/llm')) return fresh.config;
    if (url.endsWith(':commit')) { events.push('commit'); assert.equal(body.writes.length, 20); if (outcome === 'fail') throw Error('Acknowledgment lost'); return {}; }
    throw Error('Unexpected request');
  } };
}
test('concurrent catalog or review changes abort before the durable attempt and commit', async () => {
  const { plan } = fixture(), fresh = structuredClone(plan.before), events = [];
  fresh.authors.push(doc('drillCatalogAuthoring/COD-002', { reviewStatus: 'approved' }));
  await assert.rejects(applyPlan(fakeCloud(fresh, events), plan, manifest, { onAttempt: () => events.push('attempt'), onCommitted: () => events.push('ack') }));
  assert.deepEqual(events, ['rollback']);
});
test('uncertain commit keeps attempt evidence and is never automatically retried', async () => {
  const { plan } = fixture(), events = [];
  await assert.rejects(applyPlan(fakeCloud(plan.before, events), plan, manifest, { onAttempt: () => events.push('attempt'), onCommitted: () => events.push('ack') }), /Acknowledgment lost/);
  assert.deepEqual(events, ['attempt', 'commit', 'rollback']);
});
test('failure to durably journal the attempt prevents the commit', async () => {
  const { plan } = fixture(), events = [];
  await assert.rejects(applyPlan(fakeCloud(plan.before, events), plan, manifest, { onAttempt: () => { throw Error('disk failure'); }, onCommitted: () => {} }), /disk failure/);
  assert.deepEqual(events, ['rollback']);
});
