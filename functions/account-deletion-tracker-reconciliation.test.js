"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const { FakeFirestore } = require("./test-support/fake-firestore");
const { createTrackerReconciliation } = require("./account-deletion-tracker-reconciliation");
const { createTrackerErasure } = require("./account-deletion-tracker");
const { normalizeIssueTracker } = require("./issue-tracker-normalize");
const { createSeedStore } = require("./issue-tracker-bridge-seed");
const jobPath = `accountDeletionJobs/${crypto.createHash("sha256").update("uid:owner").digest("hex")}`;
const now = 10000, sha = "a".repeat(64);
function fixture(verify) {
  const seed = normalizeIssueTracker().nextSeed;
  const db = new FakeFirestore({ [jobPath]: { uid: "owner", playerIds: [], state: "retrying", trackerErasure: { pending: true, sourceIds: ["old"], emailIds: ["mail"], providerIds: ["provider"] } },
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
