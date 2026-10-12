'use strict';
// Scoped operator tooling. Never writes plans, logs, rules, gateway or Storage.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');
const { cloud, DOCUMENTS, decode, encode } = require('./training-cloud.cjs');
const { snapshot, sameTypedValues } = require('./training-access-catalog.cjs');
const { canonical, sha256 } = require('./training-access-lib.cjs');
const ROOT = 'projects/kickai-69dd0/databases/(default)/documents/';
const MANIFEST = path.join(__dirname, '../content/training-rest/adjustments.json');
const DEFAULT_PLAN = '.netlify/training-rest/catalog-plan.json';
const KIND = 'authored-lower-bound-rest-and-demo-withdrawal';
const OPERATOR = 'operator:training-rest-and-demo-withdrawal';
const TARGETS = {
  'COD-002': [60, 90], 'COD-003': [60, 120], 'COD-004': [90, 120],
  'HJP-002': [90, 120], 'HJP-003': [120, 180], 'HJP-004': [60, 90],
  'SPD-002': [60, 120], 'SPD-003': [60, 90], 'SPD-004': [90, 120], 'SPD-009': [90, 150],
  'STR-001': [60, 90], 'STR-007': [90, 120], 'VJP-002': [60, 90], 'VJP-004': [45, 90],
  'VJP-005': [90, 120], 'VJP-006': [45, 75], 'VJP-007': [60, 90], 'VJP-008': [90, 150],
};
const unpack = doc => decode({ mapValue: { fields: doc.fields || {} } });
const typed = value => encode(value).mapValue.fields;
const idOf = doc => { assert.ok(doc.name.startsWith(ROOT)); return doc.name.slice(ROOT.length).split('/')[1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// Load the actual website contracts using Node 22's built-in TS support. The
// temporary resolver handles only their extensionless vocabulary import.
const contractsDir = path.join(__dirname, '../app/src/lib/contracts');
const contractNames = ['types.ts', 'expectedMinutes.ts', 'drillV2.ts'];
function contractHashes() {
  return Object.fromEntries(contractNames.map(name => [name, sha256(fs.readFileSync(path.join(contractsDir, name), 'utf8'))]));
}
function loadContracts() {
  const parents = new Set(contractNames.map(name => pathToFileURL(path.join(contractsDir, name)).href));
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === './types' && parents.has(context.parentURL)) {
      return { url: pathToFileURL(path.join(contractsDir, 'types.ts')).href, shortCircuit: true };
    }
    return next(specifier, context);
  } });
  try {
    return { ...require(path.join(contractsDir, 'expectedMinutes.ts')), ...require(path.join(contractsDir, 'drillV2.ts')) };
  } finally { hook.deregister(); }
}
const contract = loadContracts();

function validateManifest(manifest) {
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.kind, KIND);
  assert.deepEqual(manifest.records.map(r => r.drillId).sort(), Object.keys(TARGETS).sort());
  for (const r of manifest.records) {
    const [lower, upper] = TARGETS[r.drillId];
    assert.equal(r.restSecondsAfter, lower);
    assert.equal(r.doseBefore.restSecondsMin, lower); assert.equal(r.doseBefore.restSecondsMax, upper);
    assert.ok(r.name && [1, 2].includes(r.schemaVersion));
    assert.ok(r.evidenceIds.length && r.evidenceIds.every(id => manifest.evidence.some(e => e.id === id)));
  }
  assert.deepEqual(manifest.withdrawal, { drillId: 'DRB-010', name: 'Speed dribble with stop zone', statusAfter: 'draft', primaryDemoStatusAfter: 'pending', reason: 'User reported corrupted demonstration video; retain object for repair.' });
  return { restChanges: 18, withdrawals: 1 };
}
function ordinaryBoundary(raw, before, id) {
  assert.ok(!raw.productionBatchId && !raw.trainingPolicy, `${id}: managed content requires its author/reviewer workflow`);
  assert.ok(!before.authors.some(d => idOf(d) === id), `${id}: private authoring exists`);
  for (const [key, value] of Object.entries(raw)) {
    if (/review/i.test(key)) assert.ok(value == null, `${id}: existing review must not be carried across this edit`);
  }
  assert.ok(raw.status === 'published' || ((raw.schemaVersion ?? 1) === 1 && raw.status == null), `${id}: publication state changed`);
}
function rangeMinutes(dose, bound) {
  const defaults = contract.catalogTimeDefaults(dose, dose.repUnit);
  const input = { sets: dose['sets' + bound], reps: dose['reps' + bound], repUnit: dose.repUnit,
    perSide: dose.perSide, ...defaults, restSeconds: dose['restSeconds' + bound],
    restBetweenSetsSeconds: dose['restBetweenSetsSeconds' + bound] ?? defaults.restBetweenSetsSeconds };
  assert.deepEqual(contract.blockInputErrors(input), [], 'Invalid duration inputs; re-audit the dose');
  return contract.blockEstimatedMinutes(input);
}
function buildPlan(manifest, before) {
  validateManifest(manifest);
  assert.equal(before.catalog.length, 208); assert.equal(new Set(before.catalog.map(d => d.name)).size, 208);
  assert.equal(unpack(before.config).wholeBodyTraining?.mobileVerified, false);
  const held = before.catalog.map(unpack).filter(r => r.productionBatchId === 'whole-body-2026-09');
  assert.equal(held.length, 80);
  assert.ok(held.every(r => r.status === 'draft' && r.trainingPolicy?.reviewStatus === 'pending' && !Object.keys(r.media || {}).length));
  const oldVersion = unpack(before.meta).catalogVersion; assert.match(oldVersion, /^\d+\.\d+\.\d+$/);
  const parts = oldVersion.split('.').map(Number); parts[2]++;
  const catalogVersionAfter = parts.join('.');
  const byId = new Map(before.catalog.map(d => [idOf(d), d]));
  const audit = { catalogVersion: catalogVersionAfter, updatedBy: OPERATOR };
  const patches = manifest.records.map(r => {
    const doc = byId.get(r.drillId); assert.ok(doc); const raw = unpack(doc);
    ordinaryBoundary(raw, before, r.drillId);
    assert.equal(raw.name, r.name); assert.equal(raw.schemaVersion, r.schemaVersion);
    assert.equal(raw.status ?? null, r.statusBefore);
    assert.equal(canonical(raw.dose), canonical(r.doseBefore), `${r.drillId}: authored dose changed`);
    assert.equal(canonical(raw.estimatedMinutes), canonical(r.estimatedMinutesBefore), `${r.drillId}: duration changed`);
    const dose = { ...raw.dose, restSecondsMax: r.restSecondsAfter };
    return { id: r.drillId, name: doc.name, expectedUpdateTime: doc.updateTime,
      fields: { dose: { restSecondsMax: dose.restSecondsMax, restText: contract.formatRestText(dose) },
        estimatedMinutes: { min: rangeMinutes(dose, 'Min'), max: rangeMinutes(dose, 'Max') }, ...audit },
      fieldPaths: ['dose.restSecondsMax', 'dose.restText', 'estimatedMinutes.min', 'estimatedMinutes.max', ...Object.keys(audit)],
      transforms: ['updatedAt'] };
  });
  const doc = byId.get('DRB-010'); assert.ok(doc); const raw = unpack(doc);
  ordinaryBoundary(raw, before, 'DRB-010'); assert.equal(raw.name, manifest.withdrawal.name);
  assert.equal(raw.status, 'published'); assert.equal(raw.schemaVersion, 2);
  const media = raw.media?.primaryDemo;
  assert.equal(media?.status, 'approved'); assert.ok(media.storagePath && media.generation && media.bytes > 0);
  patches.push({ id: 'DRB-010', name: doc.name, expectedUpdateTime: doc.updateTime,
    fields: { status: 'draft', media: { primaryDemo: { status: 'pending' } }, ...audit },
    fieldPaths: ['status', 'media.primaryDemo.status', ...Object.keys(audit)], transforms: ['updatedAt', 'mediaPublishedAt'] });
  return { schemaVersion: 1, kind: KIND, project: 'kickai-69dd0', createdAt: new Date().toISOString(),
    manifestSha256: sha256(manifest), contractHashes: contractHashes(), before, patches, catalogVersionAfter };
}
function verifyPlan(plan, manifest) {
  assert.equal(plan.schemaVersion, 1); assert.equal(plan.kind, KIND); assert.equal(plan.project, 'kickai-69dd0');
  assert.equal(plan.manifestSha256, sha256(manifest)); assert.deepEqual(plan.contractHashes, contractHashes());
  const expected = buildPlan(manifest, plan.before);
  assert.equal(canonical(plan.patches), canonical(expected.patches), 'Writes differ from the approved manifest');
  assert.equal(plan.catalogVersionAfter, expected.catalogVersionAfter);
}
function metaPatch(plan) {
  return { catalogVersion: plan.catalogVersionAfter, updatedBy: OPERATOR,
    lastChange: { kind: KIND, restChangeCount: 18, withdrawnDrillId: 'DRB-010', manifestSha256: plan.manifestSha256 } };
}
function writesFor(plan) {
  const writes = plan.patches.map(p => ({ update: { name: p.name, fields: typed(p.fields) },
    updateMask: { fieldPaths: p.fieldPaths }, currentDocument: { updateTime: p.expectedUpdateTime },
    updateTransforms: p.transforms.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }));
  const meta = metaPatch(plan);
  writes.push({ update: { name: plan.before.meta.name, fields: typed(meta) }, updateMask: { fieldPaths: Object.keys(meta) },
    currentDocument: { updateTime: plan.before.meta.updateTime }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] });
  return writes;
}
function patchedTypedFields(original, patch) {
  const result = structuredClone(original), values = typed(patch.fields);
  for (const field of patch.fieldPaths) {
    const keys = field.split('.'); let dest = result, source = values;
    for (const key of keys.slice(0, -1)) { dest = dest[key].mapValue.fields; source = source[key].mapValue.fields; }
    const leaf = keys.at(-1); dest[leaf] = source[leaf];
  }
  return result;
}
function counts(value) {
  const rows = value.catalog.map(unpack), published = r => !['draft', 'archived'].includes(r.status);
  const demo = r => r.media?.primaryDemo?.storagePath && r.media.primaryDemo.status === 'approved';
  return { total: rows.length, websitePublished: rows.filter(published).length,
    explicitPublished: rows.filter(r => r.status === 'published').length, legacyMissingStatus: rows.filter(r => r.status == null).length,
    drafts: rows.filter(r => r.status === 'draft').length, approvedDemoDrills: rows.filter(demo).length,
    publishedDemoDrills: rows.filter(r => published(r) && demo(r)).length };
}
function verifyAfter(plan, after) {
  assert.equal(after.catalog.length, 208); const byName = new Map(after.catalog.map(d => [d.name, d]));
  assert.equal(byName.size, 208); const patches = new Map(plan.patches.map(p => [p.name, p]));
  let serverAuditTime;
  const checkAuditTime = (value, actual, previous) => {
    // REQUEST_TIME is the request's millisecond timestamp; updateTime is the
    // later microsecond commit timestamp. They need not be identical.
    assert.ok(typeof value?.timestampValue === 'string');
    const time = value.timestampValue;
    assert.ok(Number.isFinite(Date.parse(time)) && Date.parse(time) >= Date.parse(previous.updateTime) && Date.parse(time) <= Date.parse(actual.updateTime));
    if (serverAuditTime === undefined) serverAuditTime = time;
    else assert.equal(time, serverAuditTime, 'All transaction audit transforms must share REQUEST_TIME');
  };
  for (const previous of plan.before.catalog) {
    const actual = byName.get(previous.name); assert.ok(actual);
    const patch = patches.get(previous.name);
    if (!patch) { sameTypedValues(actual, previous, `${idOf(previous)} changed unexpectedly`); continue; }
    const expected = patchedTypedFields(previous.fields, patch), actualFields = { ...actual.fields };
    for (const key of patch.transforms) {
      checkAuditTime(actualFields[key], actual, previous);
      delete expected[key]; delete actualFields[key];
    }
    assert.equal(actual.createTime, previous.createTime);
    sameTypedValues(actualFields, expected, `${patch.id}: field outside the approved patch changed`);
  }
  sameTypedValues(after.authors, plan.before.authors, 'Private authoring/reviews changed');
  sameTypedValues(after.config, plan.before.config, 'Configuration changed');
  const expected = { ...plan.before.meta.fields, ...typed(metaPatch(plan)) }; delete expected.updatedAt;
  const { updatedAt, ...actual } = after.meta.fields; checkAuditTime(updatedAt, after.meta, plan.before.meta);
  assert.equal(after.meta.createTime, plan.before.meta.createTime);
  sameTypedValues(actual, expected, 'Unexpected metadata change');
  return { status: 'verified', verifiedAt: new Date().toISOString(), catalogVersion: plan.catalogVersionAfter,
    restChanges: 18, withdrawal: 'DRB-010', unrelatedRecordsExact: 189, before: counts(plan.before), after: counts(after),
    privateAuthoringAndConfigurationExact: true, heldDraftsExact: 80, mobileVerified: false, planSha256: sha256(plan) };
}
async function applyPlan(c, plan, manifest, { onAttempt, onCommitted }) {
  verifyPlan(plan, manifest);
  const { transaction } = await c.api(DOCUMENTS + ':beginTransaction', 'POST', { options: { readWrite: {} } });
  let acknowledged = false;
  try {
    const fresh = await snapshot(c, transaction);
    sameTypedValues(fresh, plan.before, 'Live snapshot changed; stop and prepare a fresh plan');
    onAttempt({ status: 'commit-attempted', attemptedAt: new Date().toISOString(), planSha256: sha256(plan), writesSha256: sha256(writesFor(plan)) });
    const result = await c.api(DOCUMENTS + ':commit', 'POST', { transaction, writes: writesFor(plan) }); acknowledged = true;
    onCommitted({ status: 'commit-acknowledged', planSha256: sha256(plan), result });
    return verifyAfter(plan, await snapshot(c));
  } finally { if (!acknowledged) await c.api(DOCUMENTS + ':rollback', 'POST', { transaction }).catch(() => {}); }
}
async function main() {
  const args = process.argv.slice(2), option = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
  const manifest = read(MANIFEST); validateManifest(manifest);
  const file = path.resolve(option('--plan') || DEFAULT_PLAN);
  assert.ok(file.startsWith(path.resolve('.netlify') + path.sep), 'Private plans must remain in ignored .netlify/');
  const save = (suffix, value) => fs.writeFileSync(file.replace(/\.json$/, suffix + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const c = await cloud();
  if (args.includes('--verify')) {
    const plan = read(file); verifyPlan(plan, manifest); const result = verifyAfter(plan, await snapshot(c));
    save('.verified-' + Date.now(), result); console.log(JSON.stringify(result)); return;
  }
  if (args.includes('--apply')) {
    const plan = read(file); verifyPlan(plan, manifest);
    assert.equal(option('--expected-plan-sha'), sha256(plan), 'Apply requires the exact reviewed plan digest');
    assert.ok(!fs.existsSync(file.replace(/\.json$/, '.attempt.json')), 'An attempt exists; verify without replaying it');
    const result = await applyPlan(c, plan, manifest, { onAttempt: v => save('.attempt', v), onCommitted: v => save('.committed', v) });
    save('.applied', result); console.log(JSON.stringify(result)); return;
  }
  const plan = buildPlan(manifest, await snapshot(c)); fs.mkdirSync(path.dirname(file), { recursive: true });
  save('', plan);
  console.log(JSON.stringify({ status: 'prepared-no-write', planSha256: sha256(plan), before: counts(plan.before), nextVersion: plan.catalogVersionAfter,
    changes: plan.patches.map(p => ({ drillId: p.id, restSeconds: p.fields.dose?.restSecondsMax, estimatedMinutes: p.fields.estimatedMinutes, status: p.fields.status })) }));
}
module.exports = { TARGETS, KIND, buildPlan, validateManifest, verifyPlan, rangeMinutes, writesFor, metaPatch, patchedTypedFields, counts, verifyAfter, applyPlan };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
