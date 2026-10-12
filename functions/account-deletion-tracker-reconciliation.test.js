"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const { FakeFirestore, FieldValue, HttpsError } = require("./test-support/fake-firestore");
const { createTrackerReconciliation } = require("./account-deletion-tracker-reconciliation");
const { createTrackerErasure } = require("./account-deletion-tracker");
const { normalizeIssueTracker } = require("./issue-tracker-normalize");
const { createSeedStore } = require("./issue-tracker-bridge-seed");
const jobPath = `accountDeletionJobs/${crypto.createHash("sha256").update("uid:owner").digest("hex")}`;
const now = 10000, sha = "a".repeat(64);
function fixture(verify) {
  const seed = normalizeIssueTracker().nextSeed;
  const db = new FakeFirestore({ [jobPath]: { uid: "owner", playerIds: [], coachIds: [], state: "retrying", trackerErasure: { pending: true, sourceIds: ["old"], emailIds: ["mail"], providerIds: ["provider"] } },
    "issueTrackerState/seed": seed, "issueTrackerState/writer": { revision: 4, privacyErasurePending: true, leaseId: null },
    "issueTrackerSettings/current": { seedStorageVersion: 2, workbookKey: "book", mailbox: "dylank@posetek.net" },
    "issueTrackerQueue/unrelated": { sourceId: "other" } });
  const service = createTrackerReconciliation({ db, now: () => now, verifyExternalEvidence: verify });
  return { db, service, seed };
}
const verified = async ({ plan }) => ({ planSha256: plan.planSha256, seedSha256: plan.seedSha256, workbookKey: plan.workbookKey, mailbox: plan.mailbox, revision: plan.revision,
  scopeSha256: sha, retentionResultSha256: sha, settledSendsSha256: sha, readbackSha256: sha, verifierId: "test-only-authenticated-adapter", verifiedAtMillis: now });
test("default verifier and partial or boolean evidence cannot release holds", async () => {
  for (const verifier of [undefined, async () => true, async ({ plan }) => ({ planSha256: plan.planSha256 })]) {
    const f = fixture(verifier), plan = await f.service.prepare({ seed: f.seed, revision: 5 });
    await assert.rejects(f.service.reconcile({ plan, evidence: { verified: true } }), /tracker_external/);
    assert.equal(f.db.snapshot(jobPath).trackerErasure.pending, true);
  }
});
test("verified recovery retains suppression and normal retry/final sweeps do not re-hold", async () => {
  const f = fixture(verified), plan = await f.service.prepare({ seed: f.seed, revision: 5 });
  await f.service.reconcile({ plan });
  assert.equal(f.db.snapshot(jobPath).state, "retrying", "recovery must not mark account complete");
  assert.equal(f.db.snapshot(jobPath).trackerErasure.pending, false);
  assert.deepEqual(f.db.snapshot(jobPath).trackerErasure.sourceIds, ["old"]);
  assert.deepEqual(f.db.snapshot("issueTrackerQueue/unrelated"), { sourceId: "other" });
  await createSeedStore(f.db).load(f.db.snapshot("issueTrackerState/seed"));
  const erase = createTrackerErasure({ db: f.db });
  assert.deepEqual(await erase({ uid: "owner", playerIds: [] }), { pending: false });
  assert.deepEqual(await erase({ uid: "owner", playerIds: [] }), { pending: false });
  await f.db.doc("config/accountDeletion").set({ enabled: true, verifiedManifestVersion: 1, warehouseReviewed: true, bigQueryTables: [] });
  f.db.recursiveDelete = async ref => { for (const path of [...f.db.docs.keys()]) if (path === ref.path || path.startsWith(ref.path + "/")) f.db.docs.delete(path); };
  let time = now;
  const worker = require("./account-deletion").createAccountDeletion({ db: f.db, FieldValue, HttpsError, now: () => time,
    bucket: { getFiles: async () => [[]] }, eraseGatewayStorage: async () => {}, eraseWarehouse: async () => {},
    authDirectory: { updateUser: async () => {}, revokeRefreshTokens: async () => {}, deleteUser: async () => {} } });
  await worker.process(jobPath.split("/")[1]);
  assert.equal(f.db.snapshot(jobPath).state, "verifying");
  time += 25 * 3600000;
  await worker.process(jobPath.split("/")[1]);
  assert.equal(f.db.snapshot(jobPath).state, "completed");
  await assert.rejects(require("./issue-tracker-evidence").createEvidenceArchive(f.db)("outlook", "dylank@posetek.net/mail", { body: "late" }), { code: "tracker_subject_deleting" });
});
test("new holds during trusted verification invalidate recovery atomically", async () => {
  let f;
  f = fixture(async input => { await f.db.doc("accountDeletionJobs/new").set({ trackerErasure: { pending: true } }); return verified(input); });
  const plan = await f.service.prepare({ seed: f.seed, revision: 5 });
  await assert.rejects(f.service.reconcile({ plan }), /snapshot_changed/);
  assert.equal(f.db.snapshot(jobPath).trackerErasure.pending, true);
});
test("mixed frozen payload without surviving seed refuses recovery and preserves content", async () => {
  const f = fixture(verified);
  await f.db.doc("issueTrackerBatches/mixed").set({ state: "privacy-erased", payload: { changes: { instances: [{ key: "unrelated", values: { Secret: "keep" } }] } } });
  await assert.rejects(f.service.prepare({ seed: f.seed, revision: 5 }), /missing_survivor_seed/);
  assert.equal(f.db.snapshot("issueTrackerBatches/mixed").payload.changes.instances[0].key, "unrelated");
});

test("legacy settings require explicit reviewed storage cutover before recovery", async () => {
  const f = fixture(verified);
  await f.db.doc("issueTrackerSettings/current").update({ seedStorageVersion: 1 });
  await assert.rejects(f.service.prepare({ seed: f.seed, revision: 5 }), /not_held/);
  assert.equal(f.db.snapshot(jobPath).trackerErasure.pending, true);
});

test("reconciliation preserves unrelated populated seed rows and exact joins", async () => {
  const f = fixture(verified);
  const seed = normalizeIssueTracker({ occurrences: [{ id: "other-source", issueId: "other-issue", reporterUid: "other", source: "client", message: "Synthetic failure", occurredAtMillis: now }],
    outbox: [{ id: "other-source", issueId: "other-issue", type: "incident", status: "pending", createdAtMillis: now }] }).nextSeed;
  await f.db.doc("issueTrackerState/seed").set(seed);
  const plan = await f.service.prepare({ seed, revision: 5 });
  await f.service.reconcile({ plan });
  const store = createSeedStore(f.db), loaded = await store.load(f.db.snapshot("issueTrackerState/seed"));
  for (const group of ["actions", "instances", "emails", "dailyRows"]) for (const [key, row] of Object.entries(seed.rows[group])) {
    await store.hydrate(loaded, group, key); assert.deepEqual(loaded.rows[group][key], row);
  }
  assert.deepEqual({ ...loaded.outboxOccurrences }, { ...seed.outboxOccurrences });
});
