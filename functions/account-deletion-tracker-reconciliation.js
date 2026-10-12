"use strict";
// Deliberately not exported as a deployed endpoint. A trusted verifier adapter
// must independently authenticate external readback, scope and settled sends.
const M = require("./issue-tracker-bridge-model");
const S = require("./issue-tracker-bridge-seed");
const { normalizeIssueTracker } = require("./issue-tracker-normalize");
const { MAILBOX } = require("./issue-tracker-graph-reader");
const clone = value => JSON.parse(M.canonical(value));
const SHA = /^[a-f0-9]{64}$/;
const COLLECTIONS = ["accountDeletionJobs", "issueTrackerRows", "issueTrackerBatches", "issueTrackerIndices", "issueTrackerIndexBases"];
function createTrackerReconciliation({ db, verifyExternalEvidence, now = Date.now }) {
  async function snapshot(tx) {
    const entries = [];
    const get = ref => tx ? tx.get(ref) : ref.get();
    for (const path of ["issueTrackerSettings/current", "issueTrackerState/writer", "issueTrackerState/seed"]) {
      const doc = await get(db.doc(path)); entries.push([path, doc.data() || null]);
    }
    for (const collection of COLLECTIONS) {
      const docs = await get(db.collection(collection).orderBy("__name__").limit(301));
      for (const doc of docs.docs) {
        entries.push([doc.ref.path, doc.data()]);
        if (collection === "issueTrackerBatches") for (const child of ["rows", "indices"]) {
          const children = await get(doc.ref.collection(child).orderBy("__name__").limit(301));
          for (const row of children.docs) entries.push([row.ref.path, row.data()]);
        }
      }
    }
    if (entries.length > 150 || Buffer.byteLength(M.canonical(entries)) > 4000000) M.fail("tracker_reconciliation_capacity");
    return entries;
  }
  function planFor(entries, inputSeed, revision) {
    const docs = Object.fromEntries(entries), settings = docs["issueTrackerSettings/current"], writer = docs["issueTrackerState/writer"];
    if (!writer?.privacyErasurePending || writer.leaseId || !settings?.workbookKey || settings.mailbox !== MAILBOX || settings.seedStorageVersion !== 2
      || !Number.isSafeInteger(revision) || revision < writer.revision) M.fail("tracker_reconciliation_not_held");
    const jobs = entries.filter(([path, value]) => /^accountDeletionJobs\/[^/]+$/.test(path) && value.trackerErasure?.pending === true);
    if (!jobs.length) M.fail("tracker_reconciliation_missing_jobs");
    const normalized = normalizeIssueTracker({ seed: clone(inputSeed) });
    if (M.GROUPS.some(group => normalized.changes[group].length)) M.fail("tracker_reconciliation_invalid_seed");
    const seed = normalized.nextSeed, survivors = new Map();
    function retain(group, key, value) {
      const id = `${group}/${key}`;
      if (survivors.has(id) && M.canonical(survivors.get(id)) !== M.canonical(value)) M.fail("tracker_reconciliation_conflicting_survivors");
      survivors.set(id, value);
    }
    for (const [path, value] of entries) {
      if (/^issueTrackerRows\/[^/]+$/.test(path) || /^issueTrackerBatches\/[^/]+\/rows\/[^/]+$/.test(path)) retain(value.group, value.key, value.value);
      if (path === "issueTrackerState/seed" || /^issueTrackerBatches\/[^/]+$/.test(path)) {
        const metadata = path === "issueTrackerState/seed" ? value : value.nextSeedMetadata;
        for (const [group, rows] of Object.entries(metadata?.rows || {})) for (const [key, row] of Object.entries(rows)) retain(group, key, row);
        // Payload-only frozen rows cannot prove a complete seed snapshot.
        if (path.startsWith("issueTrackerBatches/") && Object.values(value.payload?.changes || {}).some(rows => rows.length)
          && !entries.some(([child]) => child.startsWith(`${path}/rows/`))) M.fail("tracker_reconciliation_missing_survivor_seed");
      }
    }
    const current = docs["issueTrackerState/seed"] || {};
    const base = current.storageVersion === 2 ? docs[`issueTrackerIndexBases/${current.indexBaseSha256}`]?.maps : current;
    if (!base) M.fail("tracker_reconciliation_missing_index_base");
    const maps = Object.fromEntries(S.INDEX_GROUPS.map(group => [group, clone(base[group] || {})]));
    for (const [path, value] of entries) if (/^issueTrackerIndices\/[^/]+$/.test(path) && value.baseSha256 === current.indexBaseSha256) {
      if (!S.INDEX_GROUPS.includes(value.group)) M.fail("tracker_reconciliation_invalid_index");
      if (value.deleted) delete maps[value.group][value.key]; else Object.defineProperty(maps[value.group], value.key, { value: value.value, enumerable: true, writable: true, configurable: true });
    }
    // A frozen batch with new joins needs explicit conflict reconciliation;
    // never infer that an unacknowledged remote write did or did not apply.
    for (const [path, value] of entries) if (/^issueTrackerBatches\/[^/]+\/indices\/[^/]+$/.test(path)) {
      if (!S.INDEX_GROUPS.includes(value.group) || value.deleted || M.canonical(maps[value.group][value.key] ?? null) !== M.canonical(value.value)) M.fail("tracker_reconciliation_conflicting_survivors");
    }
    for (const group of S.INDEX_GROUPS) if (M.canonical(maps[group]) !== M.canonical(seed[group] || {})) M.fail("tracker_reconciliation_survivor_mismatch");
    const supplied = new Map();
    for (const group of M.GROUPS) for (const [key, value] of Object.entries(seed.rows[group])) supplied.set(`${group}/${key}`, value);
    if (supplied.size !== survivors.size) M.fail("tracker_reconciliation_survivor_mismatch");
    for (const [id, value] of survivors) if (M.canonical(supplied.get(id) || null) !== M.canonical(value)) M.fail("tracker_reconciliation_survivor_mismatch");
    // Retained joins remain suppression tombstones, including after release.
    for (const [, job] of jobs) {
      const erased = job.trackerErasure, sources = new Set(erased.sourceIds || []), emails = new Set(erased.emailIds || []), providers = new Set(erased.providerIds || []);
      for (const [key, row] of Object.entries(seed.rows.instances)) if (sources.has(key) || job.uid && row.values?.["Recorded actor UID"] === job.uid || job.playerIds?.includes(row.values?.["Target player ID"])) M.fail("tracker_reconciliation_erased_subject");
      for (const key of Object.keys(seed.rows.dailyRows)) if (sources.has(key)) M.fail("tracker_reconciliation_erased_subject");
      for (const [key, row] of Object.entries(seed.rows.emails)) if (emails.has(key) || sources.has(row.eventRef)) M.fail("tracker_reconciliation_erased_subject");
      if (Object.entries(seed.outboxOccurrences || {}).some(([key, value]) => sources.has(key) || sources.has(value))
        || Object.entries(seed.providerOccurrences || {}).some(([key, value]) => providers.has(key) || sources.has(value))
        || Object.keys(seed.emailLinks || {}).some(key => sources.has(key))
        || Object.values(seed.emailAliases || {}).some(value => emails.has(value))
        || Object.values(seed.emailCanonicalItems || {}).some(value => emails.has(value.primaryId))) M.fail("tracker_reconciliation_erased_subject");
    }
    return { schemaVersion: 1, snapshotSha256: M.digest(entries), seedSha256: M.digest(seed), workbookKey: settings.workbookKey,
      mailbox: MAILBOX, revision, jobPaths: jobs.map(([path]) => path), seed };
  }
  async function prepare({ seed, revision }) {
    const plan = planFor(await snapshot(), seed, revision);
    return { ...plan, planSha256: M.digest(plan) };
  }
  async function reconcile({ plan, evidence }) {
    if (typeof verifyExternalEvidence !== "function") M.fail("tracker_external_verifier_unavailable");
    const { planSha256, ...body } = plan || {};
    if (!SHA.test(planSha256 || "") || M.digest(body) !== planSha256) M.fail("tracker_reconciliation_plan_changed");
    // No boolean/config flag is evidence. The adapter is trusted code, never a
    // request callback. It must verify provider/authenticated operator records.
    const receipt = await verifyExternalEvidence({ plan: clone(plan), evidence });
    if (!receipt || receipt.planSha256 !== planSha256 || receipt.seedSha256 !== plan.seedSha256
      || receipt.workbookKey !== plan.workbookKey || receipt.mailbox !== plan.mailbox || receipt.revision !== plan.revision
      || !["scopeSha256", "retentionResultSha256", "settledSendsSha256", "readbackSha256"].every(key => SHA.test(receipt[key] || ""))
      || typeof receipt.verifierId !== "string" || !receipt.verifierId || !Number.isSafeInteger(receipt.verifiedAtMillis)
      || receipt.verifiedAtMillis > now() || now() - receipt.verifiedAtMillis > 300000) M.fail("tracker_external_evidence_invalid");
    return db.runTransaction(async tx => {
      const entries = await snapshot(tx), fresh = planFor(entries, plan.seed, plan.revision);
      if (M.digest(fresh) !== planSha256) M.fail("tracker_reconciliation_snapshot_changed");
      const seed = clone(plan.seed); delete seed.privacyErased;
      const base = { schemaVersion: 1, maps: Object.fromEntries(S.INDEX_GROUPS.map(group => [group, seed[group] || {}])) };
      const metadata = S.splitSeed(seed).metadata;
      for (const group of S.INDEX_GROUPS) delete metadata[group];
      Object.assign(metadata, { storageVersion: 2, indexBaseSha256: M.digest(base), indexStateSha256: M.digest(base.maps), indexEntryCounts: Object.fromEntries(S.INDEX_GROUPS.map(group => [group, Object.keys(base.maps[group]).length])) });
      tx.set(db.doc(`issueTrackerIndexBases/${metadata.indexBaseSha256}`), base);
      tx.set(db.doc("issueTrackerState/seed"), metadata);
      for (const row of S.splitSeed(seed).changedRows) { const { id, ...value } = row; tx.set(db.doc(`issueTrackerRows/${id}`), value); }
      for (const [path] of entries) if (/^issueTrackerIndices\/[^/]+$/.test(path)) tx.delete(db.doc(path));
      for (const path of plan.jobPaths) tx.update(db.doc(path), { "trackerErasure.pending": false, "trackerErasure.reconciliationSha256": planSha256 });
      for (const [path, value] of entries) if (/^issueTrackerBatches\/[^/]+$/.test(path) && value.state !== "applied") tx.update(db.doc(path), { state: "privacy-reconciled", reconciliationSha256: planSha256 });
      tx.update(db.doc("issueTrackerState/writer"), { privacyErasurePending: false, privacyErasureReason: null, activeBatchId: null, leaseId: null, leaseUntilMillis: 0, revision: plan.revision, reconciliationSha256: planSha256 });
      tx.create(db.doc(`issueTrackerReconciliations/${planSha256}`), { ...receipt, jobPaths: plan.jobPaths });
      return { reconciled: true, planSha256 };
    });
  }
  return { prepare, reconcile };
}
module.exports = { createTrackerReconciliation };
