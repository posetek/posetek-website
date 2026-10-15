"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { FakeFirestore } = require("./test-support/fake-firestore");
const { createTrackerErasure } = require("./account-deletion-tracker");
const { createIssueTrackerBridge } = require("./issue-tracker-bridge");
const subject = { uid: "owner", playerIds: ["p"], coachIds: [] };
const jobPath = `accountDeletionJobs/${crypto.createHash("sha256").update("uid:owner").digest("hex")}`;
const instance = (uid, player) => ({ values: { "Recorded actor UID": uid, "Target player ID": player, "User who acted / reported": `Name ${uid}` }, hash: "old-hash" });
function fixture(extra = {}) {
  const owned = instance("owner", "p"), other = instance("other", "q");
  const db = new FakeFirestore({
    [jobPath]: { ...subject, state: "deleting" }, "accountDeletionLocks/owner": {}, "playerDeletionLocks/p": {},
    "userIssueOccurrences/owned": { reporterUid: "owner", player: { id: "p" } },
    "userIssueOccurrences/other": { reporterUid: "other", player: { id: "q" } },
    "issueTrackerState/writer": { revision: 4, activeBatchId: "mixed", leaseId: "old", leaseUntilMillis: 9999 },
    "issueTrackerQueue/outbox-owned": { source: "occurrence", sourceId: "owned" },
    "issueTrackerQueue/outbox-other": { source: "occurrence", sourceId: "other" },
    "issueTrackerRows/owned": { group: "instances", key: "owned", value: owned },
    "issueTrackerRows/other": { group: "instances", key: "other", value: other },
    "issueTrackerRows/mail": { group: "emails", key: "mail", value: { eventRef: "owned", values: { Subject: "private" } } },
    "issueTrackerRows/action": { group: "actions", key: "AC-001", value: { values: { Problem: "Shared failure" } } },
    "issueTrackerState/seed": { storageVersion: 1, counter: 8, counts: { instances: 2 }, outboxOccurrences: { owned: "owned", other: "other" }, emailAliases: { alias: "mail", otherAlias: "other-mail" } },
    "issueTrackerIndexBases/base": { schemaVersion: 1, maps: { outboxOccurrences: { owned: "owned", other: "other" }, emailCanonicalItems: { group: { primaryId: "mail" } }, emailCanonicalAliases: { alias: "group" } } },
    "issueTrackerIndices/owned": { group: "providerOccurrences", key: "provider", value: "owned", sha256: "old" },
    "issueTrackerIndices/other": { group: "providerOccurrences", key: "other-provider", value: "other", sha256: "keep" },
    "issueTrackerIndices/alias": { group: "emailCanonicalAliases", key: "alias", value: "group" },
    "issueTrackerBatches/mixed": { state: "prepared", payload: { batchId: "mixed", payloadSha256: "old-seal", changes: { instances: [{ key: "owned", ...owned }, { key: "other", ...other }], emails: [] } },
      nextSeedMetadata: { outboxOccurrences: { owned: "owned", other: "other" } }, seedRowIds: ["owned", "other"], seedIndexIds: ["owned", "other"], receipt: { verified: true } },
    "issueTrackerBatches/mixed/rows/owned": { group: "instances", key: "owned", value: owned },
    "issueTrackerBatches/mixed/rows/other": { group: "instances", key: "other", value: other },
    "issueTrackerBatches/mixed/indices/owned": { group: "outboxOccurrences", key: "owned", value: "owned" },
    "issueTrackerBatches/mixed/indices/other": { group: "outboxOccurrences", key: "other", value: "other" },
    ...extra,
  });
  db.recursiveDelete = async ref => { for (const path of [...db.docs.keys()]) if (path === ref.path || path.startsWith(ref.path + "/")) db.docs.delete(path); };
  return { db, erase: createTrackerErasure({ db, now: () => 1000 }) };
}

const operator = { redactPublicationState: true };
test("operator redaction preserves mixed-user cells and holds invalidated publication", async () => {
  const { db, erase } = fixture();
  const keep = ["issueTrackerQueue/outbox-other", "issueTrackerRows/other", "issueTrackerRows/action", "issueTrackerIndices/other", "issueTrackerBatches/mixed/rows/other", "issueTrackerBatches/mixed/indices/other"];
  const before = Object.fromEntries(keep.map(path => [path, db.snapshot(path)]));
  assert.deepEqual(await erase(subject, operator), { pending: true });
  for (const path of keep) assert.deepEqual(db.snapshot(path), before[path], path);
  for (const path of ["issueTrackerQueue/outbox-owned", "issueTrackerRows/owned", "issueTrackerRows/mail", "issueTrackerIndices/owned", "issueTrackerIndices/alias", "issueTrackerBatches/mixed/rows/owned", "issueTrackerBatches/mixed/indices/owned"]) assert.equal(db.snapshot(path), undefined, path);
  const batch = db.snapshot("issueTrackerBatches/mixed");
  assert.equal(batch.state, "privacy-erased");
  assert.deepEqual(batch.payload.changes.instances.map(row => row.key), ["other"]);
  assert.equal(batch.payload.payloadSha256, undefined);
  assert.equal(batch.receipt, undefined);
  assert.deepEqual(db.snapshot("issueTrackerIndexBases/base").maps.outboxOccurrences, { other: "other" });
  assert.deepEqual(db.snapshot("issueTrackerState/seed").outboxOccurrences, { other: "other" });
  assert.equal(db.snapshot("issueTrackerState/writer").privacyErasurePending, true);
  assert.equal(db.snapshot("issueTrackerState/writer").leaseId, null);
  assert.equal(JSON.stringify(db.snapshot(jobPath)).includes("Name owner"), false);
  await db.doc("userIssueOccurrences/owned").delete();
  const erased = JSON.stringify([...db.docs]);
  assert.deepEqual(await erase(subject, operator), { pending: true });
  assert.equal(JSON.stringify([...db.docs]), erased, "retry must neither restore data nor drop the hold");
});

test("operator publication hold is explicit while unrelated source ingestion stays available", async () => {
  const { db, erase } = fixture({ "issueTrackerSettings/current": { enabled: true, seedVerified: true, connectionVerified: true, workbookKey: "book" } });
  await erase(subject, operator);
  const other = "b".repeat(64);
  await db.doc(`userIssueOccurrences/${other}`).set({ reporterUid: "other", issueId: "issue" });
  const bridge = createIssueTrackerBridge({ db, now: () => 1000, scheduleTask: async () => {}, normalize: async () => { throw new Error("must not normalize held seed"); }, transport: { send: async () => { throw new Error("must not send"); } } });
  assert.equal((await bridge.observeOccurrence(other)).queued, true);
  await assert.rejects(bridge.drain(), { code: "tracker_privacy_erasure_pending" });
});

test("automatic erasure removes personal copies, releases an unsent blocked batch and never holds the writer", async () => {
  const { db, erase } = fixture();
  const sealed = ["issueTrackerState/seed", "issueTrackerIndexBases/base", "issueTrackerIndices/owned", "issueTrackerIndices/other", "issueTrackerIndices/alias"];
  const keep = ["issueTrackerQueue/outbox-other", "issueTrackerRows/other", "issueTrackerRows/action", "issueTrackerBatches/mixed/rows/other", "issueTrackerBatches/mixed/indices/other", ...sealed];
  const before = Object.fromEntries(keep.map(path => [path, db.snapshot(path)]));
  assert.deepEqual(await erase(subject), { pending: true });
  for (const path of keep) assert.deepEqual(db.snapshot(path), before[path], path);
  for (const path of ["issueTrackerQueue/outbox-owned", "issueTrackerRows/owned", "issueTrackerRows/mail", "issueTrackerBatches/mixed/rows/owned", "issueTrackerBatches/mixed/indices/owned"]) assert.equal(db.snapshot(path), undefined, path);
  const writer = db.snapshot("issueTrackerState/writer");
  assert.equal(writer.privacyErasurePending, undefined, "unrelated publication must not freeze");
  assert.equal(writer.activeBatchId, null, "a never-sent batch carrying the subject is released");
  assert.equal(writer.revision, 4);
  const batch = db.snapshot("issueTrackerBatches/mixed");
  assert.equal(batch.state, "privacy-erased");
  assert.deepEqual(batch.payload.changes.instances.map(row => row.key), ["other"]);
  assert.equal(batch.payload.payloadSha256, undefined);
  const job = db.snapshot(jobPath);
  assert.equal(job.trackerErasure.pending, true);
  assert.deepEqual(job.trackerErasure.sourceIds, ["owned"]);
  assert.deepEqual(job.trackerErasure.manualItems, ["external-workbook-and-mailbox", "publication-joins"]);
  assert.equal(JSON.stringify(job).includes("Name owner"), false);
  const erased = JSON.stringify([...db.docs]);
  assert.deepEqual(await erase(subject), { pending: true });
  assert.equal(JSON.stringify([...db.docs]), erased, "retry is idempotent");
});

test("an attempted active batch with the subject stays intact for an operator without a global hold", async () => {
  const { db, erase } = fixture();
  await db.doc("issueTrackerBatches/mixed").update({ attempts: 1, lastAttemptAtMillis: 900 });
  const batch = db.snapshot("issueTrackerBatches/mixed"), row = db.snapshot("issueTrackerBatches/mixed/rows/owned");
  assert.deepEqual(await erase(subject), { pending: true });
  assert.deepEqual(db.snapshot("issueTrackerBatches/mixed"), batch, "unknown remote outcome keeps the sealed payload");
  assert.deepEqual(db.snapshot("issueTrackerBatches/mixed/rows/owned"), row);
  assert.equal(db.snapshot("issueTrackerState/writer").activeBatchId, "mixed");
  assert.equal(db.snapshot("issueTrackerState/writer").privacyErasurePending, undefined);
  assert.equal(db.snapshot("issueTrackerRows/owned"), undefined);
  assert.deepEqual(db.snapshot(jobPath).trackerErasure.manualItems, ["active-batch-unknown-outcome", "external-workbook-and-mailbox", "publication-joins"]);
});

test("only actual tracker presence creates manual follow-up; sealed joins alone are recorded, not rewritten", async () => {
  const none = new FakeFirestore({ [jobPath]: { ...subject, state: "deleting" }, "userIssueOccurrences/owned": { reporterUid: "owner" },
    "issueTrackerRows/other": { group: "instances", key: "other", value: instance("other", "q") } });
  assert.deepEqual(await createTrackerErasure({ db: none })(subject), { pending: false });
  assert.equal(none.snapshot(jobPath).trackerErasure, undefined);
  const index = { group: "providerOccurrences", key: "provider", value: "owned", sha256: "old" };
  const joins = new FakeFirestore({ [jobPath]: { ...subject, state: "deleting" }, "userIssueOccurrences/owned": { reporterUid: "owner" }, "issueTrackerIndices/owned": index });
  assert.deepEqual(await createTrackerErasure({ db: joins, now: () => 1000 })(subject), { pending: true });
  assert.deepEqual(joins.snapshot("issueTrackerIndices/owned"), index);
  assert.deepEqual(joins.snapshot(jobPath).trackerErasure, { pending: true, sourceIds: ["owned"], emailIds: [], providerIds: ["provider"], requestedAtMillis: 1000,
    manualItems: ["external-workbook-and-mailbox", "publication-joins"] });
});

test("ambiguous names never authorize deleting unrelated tracker records", async () => {
  const { db, erase } = fixture({ "issueTrackerRows/ambiguous": { group: "instances", key: "ambiguous", value: { values: { "User who acted / reported": "Name owner" } } } });
  const before = db.snapshot("issueTrackerRows/ambiguous");
  await erase(subject);
  assert.deepEqual(db.snapshot("issueTrackerRows/ambiguous"), before);
});

test("operator redaction of legacy seed-only identity discovers linked mail and indices without surviving source records", async () => {
  const db = new FakeFirestore({
    [jobPath]: { ...subject, state: "deleting" },
    "issueTrackerState/seed": { counter: 4, rows: { instances: { lost: instance("owner", "p"), keep: instance("other", "q") },
      emails: { mail: { eventRef: "lost", values: { Subject: "Private mail" } }, unrelated: { eventRef: "keep", values: { Subject: "Other mail" } } } },
      outboxOccurrences: { lost: "lost", keep: "keep" }, emailCanonicalItems: { canonical: { primaryId: "mail" } }, emailCanonicalAliases: { alias: "canonical" } },
    "issueTrackerBatches/legacy": { nextSeedMetadata: { rows: { instances: { archived: instance("owner", "p") }, emails: { archivedMail: { eventRef: "archived" } } }, outboxOccurrences: { archived: "archived", keep: "keep" } } },
    "issueTrackerIndices/link": { group: "providerOccurrences", key: "provider", value: "lost" },
    "issueTrackerIndices/alias": { group: "emailCanonicalAliases", key: "alias", value: "canonical" },
  });
  db.recursiveDelete = async ref => { db.docs.delete(ref.path); };
  assert.equal((await createTrackerErasure({ db })(subject, operator)).pending, true);
  const seed = db.snapshot("issueTrackerState/seed");
  assert.deepEqual(Object.keys(seed.rows.instances), ["keep"]);
  assert.deepEqual(Object.keys(seed.rows.emails), ["unrelated"]);
  assert.deepEqual(seed.outboxOccurrences, { keep: "keep" });
  assert.deepEqual(seed.emailCanonicalItems, {});
  assert.deepEqual(seed.emailCanonicalAliases, {});
  assert.equal(db.snapshot("issueTrackerIndices/link"), undefined);
  assert.equal(db.snapshot("issueTrackerIndices/alias"), undefined);
  assert.equal(db.snapshot("issueTrackerBatches/legacy").privacyErased, true);
  assert.deepEqual(db.snapshot("issueTrackerBatches/legacy").nextSeedMetadata.rows.emails, {});
});

test("archive-only source identity erases exact raw copies and retains unrelated archives", async () => {
  const { createEvidenceArchive } = require("./issue-tracker-evidence");
  const { MAILBOX } = require("./issue-tracker-graph-reader");
  const db = new FakeFirestore({});
  const archive = createEvidenceArchive(db);
  const own = await archive("backend-outbox", "legacy", { reporterUid: "owner", providerId: "provider-legacy" });
  const other = await archive("backend-outbox", "other", { reporterUid: "other" });
  const mail = await archive("outlook", `${MAILBOX}/mail-legacy`, { body: "private" });
  await db.doc(jobPath).set({ ...subject, state: "deleting" });
  await db.doc("issueTrackerQueue/mail").set({ message: { id: "mail-legacy", exactJoin: { type: "providerId", value: "provider-legacy" } } });
  db.recursiveDelete = async ref => { for (const path of [...db.docs.keys()]) if (path === ref.path || path.startsWith(ref.path + "/")) db.docs.delete(path); };
  await createTrackerErasure({ db })(subject);
  for (const id of [own.id, mail.id]) assert.equal([...db.docs.keys()].some(path => path.startsWith(`issueTrackerEvidence/${id}`)), false);
  assert.equal(db.snapshot(`issueTrackerEvidence/${other.id}`).complete, true);
  await assert.rejects(archive("outlook", `${MAILBOX}/mail-legacy`, { body: "late" }), { code: "tracker_subject_deleting" });
});

test("archive deletion fences each chunk and leaves interrupted parent discoverable", async () => {
  const { createEvidenceArchive } = require("./issue-tracker-evidence");
  const db = new FakeFirestore({});
  const transaction = db.runTransaction.bind(db); let count = 0;
  db.runTransaction = async callback => {
    const result = await transaction(callback);
    if (++count === 1) await db.doc("accountDeletionLocks/owner").set({});
    return result;
  };
  await assert.rejects(createEvidenceArchive(db)("backend-occurrence", "late", { reporterUid: "owner", body: "x".repeat(150000) }), { code: "tracker_subject_deleting" });
  const parents = [...db.docs.entries()].filter(([path]) => path.startsWith("issueTrackerEvidence/"));
  assert.equal(parents.length, 1); assert.equal(parents[0][1].complete, false);
  assert.equal(parents[0][1].sourceId, "late");
});

test("malformed legacy archive source IDs fail closed without deleting unrelated copies", async () => {
  const { db, erase } = fixture({
    "issueTrackerEvidence/owned-invalid": { source: "backend-outbox", sourceId: null, identity: { reporterUid: "owner" }, complete: false },
    "issueTrackerEvidence/unrelated-invalid": { source: "backend-outbox", sourceId: null, identity: { reporterUid: "other" }, complete: false },
  });
  await assert.rejects(erase(subject), /Invalid tracker evidence source identity/);
  assert.ok(db.snapshot("issueTrackerEvidence/unrelated-invalid"));
});

test("empty legacy provider identity cannot erase unrelated malformed mail", async () => {
  const { db, erase } = fixture({ "userIssueOutbox/owned": { reporterUid: "owner", providerId: "" },
    "issueTrackerQueue/ambiguous-mail": { message: { id: "unrelated", exactJoin: { type: "providerId", value: "" } } } });
  await assert.rejects(erase(subject), /Invalid tracker external join/);
  assert.ok(db.snapshot("issueTrackerQueue/ambiguous-mail"));
});
