"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore, FieldValue, HttpsError } = require("./test-support/fake-firestore");
const { createAccountDeletion } = require("./account-deletion");
const token = "a".repeat(64);
const payload = { confirmation: "DELETE", receiptToken: token };
const baseTime = 1800000000000;
const actor = (uid = "athlete") => ({ uid, authTime: baseTime / 1000, isAnonymous: false });
const admin = { ...actor("admin"), email: "owner@posetek.net", emailVerified: true };
function harness(seed = {}, objects = []) {
  let time = baseTime, failStorage = false;
  const db = new FakeFirestore({ "config/accountDeletion": { enabled: true, verifiedManifestVersion: 1, warehouseReviewed: true, bigQueryTables: [] },
    "players/profile": { userUID: "athlete", authenticationUID: "athlete", firstName: "A" },
    "players/other": { userUID: "other" }, ...seed });
  db.recursiveDelete = async ref => {
    for (const path of [...db.docs.keys()]) if (path === ref.path || path.startsWith(ref.path + "/")) db.docs.delete(path);
  };
  const remaining = new Set(objects), authActions = [];
  const bucket = { getFiles: async ({ prefix, versions, maxResults }) => {
    assert.equal(versions, true);
    return [[...remaining].filter(p => p.startsWith(prefix)).slice(0, maxResults).map(name => ({ delete: async () => {
      if (failStorage) throw new Error("storage unavailable"); remaining.delete(name);
    } }))];
  } };
  const authDirectory = Object.fromEntries(["updateUser", "revokeRefreshTokens", "deleteUser"].map(method => [method, async uid => authActions.push([method, uid])]));
  const api = createAccountDeletion({ db, FieldValue, HttpsError, bucket, authDirectory, eraseWarehouse: async () => {}, now: () => time });
  return { api, db, remaining, authActions, advance: ms => time += ms, failStorage: value => { failStorage = value; },
    key: () => [...db.docs.keys()].find(p => p.startsWith("accountDeletionJobs/")).split("/")[1] };
}

test("self request binds canonical profile IDs and receipt exposes no identity", async () => {
  const h = harness();
  assert.equal((await h.api.request(payload, actor())).accepted, true);
  const job = h.db.snapshot(`accountDeletionJobs/${h.key()}`);
  assert.deepEqual(job.playerIds, ["profile"]);
  assert.equal(h.db.snapshot("players/profile").accountDeletionPending, true);
  const status = await h.api.status({ receiptToken: token });
  assert.deepEqual(Object.keys(status).sort(), ["completedAtMillis", "requestedAtMillis", "state"]);
  assert.equal(JSON.stringify([...h.db.docs.values()]).includes(token), false);
  await assert.rejects(h.api.status({ receiptToken: "b".repeat(64) }), { code: "not-found" });
});
test("players and coaches cannot submit a target, unverified admin cannot impersonate admin", async () => {
  for (const caller of [actor(), actor("coach"), { ...admin, emailVerified: false }]) {
    const h = harness();
    await assert.rejects(h.api.request({ ...payload, targetType: "player", targetId: "other" }, caller), { code: "permission-denied" });
    assert.equal(h.db.snapshot("players/other").accountDeletionPending, undefined);
  }
});
test("reject stale authentication, anonymous callers, invalid confirmation and disabled release gate", async () => {
  for (const [p, a, code] of [[payload, { ...actor(), authTime: baseTime / 1000 - 301 }, "unauthenticated"],
    [payload, { ...actor(), isAnonymous: true }, "unauthenticated"], [{ ...payload, confirmation: "" }, actor(), "invalid-argument"]]) {
    await assert.rejects(harness().api.request(p, a), { code });
  }
  await assert.rejects(harness({ "config/accountDeletion": { enabled: false } }).api.request(payload, actor()), { code: "failed-precondition" });
});
test("conflicting ownership fails closed without changing either profile", async () => {
  const h = harness({ "players/profile": { userUID: "athlete", authenticationUID: "other" } });
  await assert.rejects(h.api.request(payload, actor()), { code: "failed-precondition" });
  assert.equal(h.db.snapshot("players/profile").accountDeletionPending, undefined);
});
test("duplicate consistent profiles are all included; repeated request is idempotent", async () => {
  const h = harness({ "players/duplicate": { authenticationUID: "athlete" } });
  await h.api.request(payload, actor()); await h.api.request(payload, actor());
  assert.deepEqual(new Set(h.db.snapshot(`accountDeletionJobs/${h.key()}`).playerIds), new Set(["profile", "duplicate"]));
  assert.equal([...h.db.docs.keys()].filter(p => p.startsWith("accountDeletionJobs/")).length, 1);
});
test("admin can delete unclaimed player without guessing an Auth UID", async () => {
  const h = harness({ "players/unclaimed": { registered: false } });
  await h.api.request({ ...payload, targetType: "player", targetId: "unclaimed" }, admin);
  await h.api.process(h.key());
  assert.equal(h.db.snapshot("players/unclaimed"), undefined);
  assert.deepEqual(h.authActions, []);
});
test("recursive cleanup deletes recordings and aliases but preserves other athletes and shared assets", async () => {
  const h = harness({
    "players/profile/reps/rep": { media: true }, "players/profile/aiConversations/chat/messages/m": { text: "personal" },
    "players/other/reps/rep": { keep: true },
    "teams/team": { playerIds: ["profile", "other"], coachUIDs: ["coach"] },
    "coaches/coach": { members: ["profile", "other"], numberMembers: 2 },
    "llmJobs/j": { playerId: "profile" }, "llmJobs/other": { playerId: "other" },
    "failureCases/failure": { playerDocumentID: "profile" },
  }, ["profile/sprint/session1/kick1/video.mov", "profile/sprint/session1/kick1/metrics.json", "profile-extra/video.mov",
    "other/sprint/video.mov", "failure_cases/failure/video.mov", "drillCatalogMedia/shared/video.mov"]);
  await h.api.request(payload, actor()); await h.api.process(h.key());
  assert.equal(h.db.snapshot("players/profile"), undefined);
  assert.equal(h.db.snapshot("players/profile/aiConversations/chat/messages/m"), undefined);
  assert.deepEqual(h.db.snapshot("teams/team").playerIds, ["other"]);
  assert.equal(h.db.snapshot("coaches/coach").numberMembers, 1);
  assert.ok(h.db.snapshot("players/other/reps/rep")); assert.ok(h.db.snapshot("llmJobs/other"));
  assert.deepEqual([...h.remaining].sort(), ["drillCatalogMedia/shared/video.mov", "other/sprint/video.mov", "profile-extra/video.mov"]);
  assert.equal((await h.api.status({ receiptToken: token })).state, "verifying");
  // Simulate a late server projection; the verification sweep removes it.
  h.db.write("players/profile/reps/late", { media: true }, { merge: false });
  h.advance(86400001); await h.api.process(h.key());
  assert.equal(h.db.snapshot("players/profile/reps/late"), undefined);
  assert.equal((await h.api.status({ receiptToken: token })).state, "completed");
});
test("a storage failure is retryable and never reports completion or deletes Auth early", async () => {
  const h = harness({}, ["profile/sprint/video.mov"]);
  await h.api.request(payload, actor()); h.failStorage(true);
  await assert.rejects(h.api.process(h.key()));
  assert.equal((await h.api.status({ receiptToken: token })).state, "retrying");
  assert.equal(h.authActions.some(([method]) => method === "deleteUser"), false);
  h.failStorage(false); await h.api.process(h.key());
  assert.equal(h.remaining.size, 0);
});
test("deleting coach detaches pointers but never deletes coached athletes or their recordings", async () => {
  const h = harness({ "coaches/c": { userUID: "coach", members: ["other"] },
    "players/other": { userUID: "other", coachUID: "coach", coachDocId: "c" },
    "organizations/org/members/coach": { userUID: "coach" },
    "teams/t": { coachUIDs: ["coach", "coach2"], playerIds: ["other"] },
  }, ["other/sprint/video.mov"]);
  await h.api.request({ ...payload, targetType: "coach", targetId: "c" }, admin);
  await h.api.process(h.key());
  assert.deepEqual(h.db.snapshot("players/other"), { userUID: "other" });
  assert.deepEqual(h.db.snapshot("teams/t").coachUIDs, ["coach2"]);
  assert.ok(h.remaining.has("other/sprint/video.mov"));
});

test("reserved storage roots cannot be treated as an account prefix", async () => {
  const h = harness();
  await assert.rejects(h.api.request({ ...payload, targetType: "uid", targetId: "config" }, admin), { code: "invalid-argument" });
});
test("directory denies ordinary callers and never exposes Auth hashes or provider tokens", async () => {
  const h = harness();
  await assert.rejects(h.api.listAccounts({}, actor()), { code: "permission-denied" });
  const api = createAccountDeletion({ db: h.db, FieldValue, HttpsError, authDirectory: {
    listUsers: async (limit, page) => { assert.equal(limit, 50); assert.equal(page, "next");
      return { users: [{ uid: "a", email: "a@example.test", passwordHash: "secret", customClaims: { secret: true } }], pageToken: "more" }; }
  } });
  assert.deepEqual(await api.listAccounts({ pageToken: "next" }, admin), {
    accounts: [{ uid: "a", displayName: "a@example.test", email: "a@example.test", disabled: false }], nextPageToken: "more"
  });
});
test("shared callable barrier denies stale tokens and deleting athletes before handler runs", async () => {
  const { withAccountDeletionBarrier } = require("./account-deletion-barrier");
  const db = new FakeFirestore({ "accountDeletionLocks/deleting": {}, "playerDeletionLocks/p": {} });
  const sdk = { https: { HttpsError, onCall: h => h }, firestore: { marker: true }, runWith() { return this; } };
  const wrapped = withAccountDeletionBarrier(sdk, db);
  let called = 0;
  const handler = wrapped.runWith({ timeoutSeconds: 20 }).https.onCall(() => ++called);
  await assert.rejects(handler({}, { auth: { uid: "deleting" } }), { code: "permission-denied" });
  await assert.rejects(handler({ playerId: "p" }, { auth: { uid: "coach" } }), { code: "failed-precondition" });
  assert.equal(called, 0);
  assert.equal(await handler({ playerId: "other" }, { auth: { uid: "coach" } }), 1);
  assert.equal(await handler({}, {}), 2);
  assert.equal(wrapped.firestore.marker, true);
});


test("warehouse erasure parameterizes athlete IDs and rejects unsafe destinations", async () => {
  const { createWarehouseEraser } = require("./account-deletion-warehouse");
  const calls = [];
  const erase = createWarehouseEraser({ accessToken: async () => "synthetic", fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ jobComplete: true }) };
  } });
  await erase(["player-a"], ["demo-project.metrics.reps"]);
  assert.equal(calls[0].body.query.includes("player-a"), false);
  assert.deepEqual(calls[0].body.queryParameters[0].parameterValue.arrayValues, [{ value: "player-a" }]);
  await assert.rejects(erase(["p"], ["demo-project.metrics.reps`; DROP TABLE x"]));
  const pending = createWarehouseEraser({ accessToken: async () => "synthetic", fetchImpl: async () => ({ ok: true, json: async () => ({ jobComplete: false }) }) });
  await assert.rejects(pending(["p"], ["demo-project.metrics.reps"]));
});


test("deletion removes UID-attributed feedback, recovery grants and usage descendants", async () => {
  const h = harness({
    "appFeedbackResponsesV1/session": { author: { uid: "athlete" }, answers: { private: true } },
    "appFeedbackSessionsV1/session": { diagnostic: true },
    "appFeedbackResponsesV1/anonymous": { identityMode: "anonymous" },
    "accountAccessGrants/grant": { targetUID: "athlete" },
    "accountAccessTargets/hashed": { grantId: "grant" },
    "insightUsageDays/profile/insightUsageDaily/day": { seconds: 30 },
    "devicePerformanceRuns/run": { authority: { playerDocumentID: "profile", reporterUid: "coach" } },
    "players/other/aiConversations/private-coach-chat": { createdByUid: "athlete" },
  });
  await h.api.request(payload, actor()); await h.api.process(h.key());
  for (const path of ["appFeedbackResponsesV1/session", "appFeedbackSessionsV1/session", "accountAccessGrants/grant", "accountAccessTargets/hashed",
    "insightUsageDays/profile/insightUsageDaily/day", "devicePerformanceRuns/run", "players/other/aiConversations/private-coach-chat"]) {
    assert.equal(h.db.snapshot(path), undefined, path);
  }
  assert.ok(h.db.snapshot("appFeedbackResponsesV1/anonymous")); assert.ok(h.db.snapshot("players/other"));
});

test("deletes actual reporter schema and paired issue artifacts without erasing shared triage", async () => {
  const h = harness({
    "userIssueOccurrences/owned": { reporterUid: "athlete", issueId: "shared", reporterName: "Personal name" },
    "userIssueOccurrences/owned/observations/o": { reporterUid: "athlete" },
    "userIssueOccurrences/other": { reporterUid: "other", issueId: "shared" },
    "userIssueOutbox/owned": { contactSnapshot: { player: { id: "profile" } } },
    "userIssueSourceClaims/claim": { occurrenceId: "owned" },
    "userIssues/shared": { latestOccurrenceId: "owned", latestUser: "Personal name", state: "investigating", occurrences: 2 },
    "aiSharingConsents/athlete": { accepted: true },
    "aiSharingConsents/other": { accepted: true },
  });
  await h.api.request(payload, actor()); await h.api.process(h.key());
  for (const path of ["userIssueOccurrences/owned", "userIssueOccurrences/owned/observations/o", "userIssueOutbox/owned", "userIssueSourceClaims/claim", "aiSharingConsents/athlete"]) assert.equal(h.db.snapshot(path), undefined, path);
  assert.deepEqual(h.db.snapshot("userIssues/shared"), { state: "investigating", occurrences: 2 });
  assert.ok(h.db.snapshot("userIssueOccurrences/other"));
  assert.ok(h.db.snapshot("aiSharingConsents/other"));
});


test("coach cleanup releases only owned event leases and preserves shared athlete evidence", async () => {
  const h = harness({
    "coaches/c": { userUID: "coach" },
    "testingEvents/event": { ownerUid: "coach", operatorUids: ["coach", "other"], closedByUid: "other" },
    "testingEvents/event/stations/owned": { claimedByUid: "coach", claimedDeviceId: "device", leaseExpiresAtMillis: baseTime + 10000, drills: ["sprint"] },
    "testingEvents/event/stations/other": { claimedByUid: "other", claimedDeviceId: "keep", leaseExpiresAtMillis: baseTime + 10000 },
    "testingEvents/event/devices/device": { operatorUid: "coach" },
    "testingEvents/event/devices/keep": { operatorUid: "other" },
    "testingEvents/event/checkIns/other": { playerDocId: "other", checkedInByUid: "coach", ordinal: 1 },
    "testingEvents/event/protocolChanges/change": { playerId: "other", changedByUid: "coach", repCounts: { sprint: 3 } },
    "testingEventInvites/invite": { createdByUid: "coach" },
    "testingEventInvites/keep": { createdByUid: "other" },
  });
  await h.api.request({ ...payload, targetType: "coach", targetId: "c" }, admin);
  await h.api.process(h.key());
  assert.deepEqual(h.db.snapshot("testingEvents/event"), { operatorUids: ["other"], closedByUid: "other" });
  assert.deepEqual(h.db.snapshot("testingEvents/event/stations/owned"), { claimedByUid: null, claimedDeviceId: null, leaseExpiresAtMillis: 0, drills: ["sprint"] });
  assert.equal(h.db.snapshot("testingEvents/event/stations/other").claimedDeviceId, "keep");
  assert.equal(h.db.snapshot("testingEvents/event/devices/device"), undefined);
  assert.ok(h.db.snapshot("testingEvents/event/devices/keep"));
  assert.deepEqual(h.db.snapshot("testingEvents/event/checkIns/other"), { playerDocId: "other", ordinal: 1 });
  assert.deepEqual(h.db.snapshot("testingEvents/event/protocolChanges/change"), { playerId: "other", repCounts: { sprint: 3 } });
  assert.equal(h.db.snapshot("testingEventInvites/invite"), undefined);
  assert.ok(h.db.snapshot("testingEventInvites/keep"));
});


test("removes deterministic issue identity records but preserves other daily actors", async () => {
  const hash = require("./user-issue-model").hash;
  const h = harness({
    "userIssueRequestIdentities/owned": { actorKey: hash("athlete"), requestId: "private-request" },
    "userIssueRequestIdentities/other": { actorKey: hash("other") },
    "userIssueDays/day": { incidents: 2 },
    [`userIssueDays/day/actors/${hash("athlete")}`]: { firstAtMillis: 1 },
    [`userIssueDays/day/actors/${hash("other")}`]: { firstAtMillis: 1 },
  });
  await h.api.request(payload, actor()); await h.api.process(h.key());
  assert.equal(h.db.snapshot("userIssueRequestIdentities/owned"), undefined);
  assert.equal(h.db.snapshot(`userIssueDays/day/actors/${hash("athlete")}`), undefined);
  assert.ok(h.db.snapshot("userIssueRequestIdentities/other"));
  assert.ok(h.db.snapshot(`userIssueDays/day/actors/${hash("other")}`));
  assert.deepEqual(h.db.snapshot("userIssueDays/day"), { incidents: 2 });
});

test("an active worker lease prevents overlapping cleanup and an expired lease is recoverable", async () => {
  const h = harness({}, ["profile/sprint/video.mov"]);
  await h.api.request(payload, actor());
  await h.db.doc(`accountDeletionJobs/${h.key()}`).update({ state: "deleting", lease: "old-worker", leaseUntilMillis: baseTime + 600000 });
  await h.api.process(h.key());
  assert.deepEqual(h.authActions, []);
  assert.ok(h.remaining.has("profile/sprint/video.mov"));
  h.advance(600001);
  await h.api.process(h.key());
  assert.equal(h.remaining.size, 0);
  assert.equal((await h.api.status({ receiptToken: token })).state, "verifying");
  assert.notEqual(h.db.snapshot(`accountDeletionJobs/${h.key()}`).lease, "old-worker");
});

test("tracker external-copy hold cannot be mistaken for completed account erasure", async () => {
  const h = harness({
    "userIssueOccurrences/report": { reporterUid: "athlete" },
    "issueTrackerRows/row": { group: "instances", key: "report", value: { values: { "Recorded actor UID": "athlete", "User who acted / reported": "Private name" } } },
  });
  await h.api.request(payload, actor());
  await assert.rejects(h.api.process(h.key()), /cleanup needs retry/);
  assert.equal(h.db.snapshot("issueTrackerRows/row"), undefined);
  assert.equal(h.db.snapshot("players/profile"), undefined);
  assert.equal((await h.api.status({ receiptToken: token })).state, "retrying");
  assert.equal(h.authActions.some(([method]) => method === "deleteUser"), false);
  h.advance(86400001);
  await assert.rejects(h.api.process(h.key()), /cleanup needs retry/);
  assert.equal((await h.api.status({ receiptToken: token })).completedAtMillis, null);
  assert.equal(h.db.snapshot("issueTrackerState/writer").privacyErasurePending, true);
});

for (const targetType of ["player", "coach"]) test(`${targetType} aliases cannot bypass reserved account-root validation`, async () => {
  for (const reserved of ["config", "users", "players", "coaches", "admins", "organizations", "teams", "llmJobs", "processing_attempts", "ProfessionalOverlay"]) {
    for (const alias of ["authenticationUID", "userUID"]) {
      const path = `${targetType === "player" ? "players" : "coaches"}/target`;
      const h = harness({ [path]: { [alias]: reserved } }, [`${reserved}/shared.mov`]);
      await assert.rejects(h.api.request({ ...payload, targetType, targetId: "target" }, admin), { code: "invalid-argument" });
      assert.deepEqual(h.db.snapshot(path), { [alias]: reserved });
      assert.equal([...h.db.docs.keys()].some(path => /^(accountDeletionJobs|accountDeletionLocks|playerDeletionLocks|accountDeletionReceipts)\//.test(path)), false);
      assert.deepEqual(h.authActions, []);
      assert.ok(h.remaining.has(`${reserved}/shared.mov`));
    }
  }
});

test("ordinary player and coach UID aliases retain exact cleanup scope", async () => {
  for (const [targetType, aliases] of [["player", { authenticationUID: "target-uid" }], ["player", { userUID: "target-uid" }],
    ["coach", { userUID: "target-uid" }], ["coach", { userUID: "target-uid", authenticationUID: "target-uid" }]]) {
    const path = `${targetType === "player" ? "players" : "coaches"}/target`;
    const h = harness({ [path]: aliases }, ["target-uid/private.mov", "other/private.mov"]);
    await h.api.request({ ...payload, targetType, targetId: "target" }, admin);
    assert.equal(h.db.snapshot(`accountDeletionJobs/${h.key()}`).uid, "target-uid");
    await h.api.process(h.key());
    assert.equal(h.db.snapshot(path), undefined);
    assert.deepEqual([...h.remaining], ["other/private.mov"]);
    assert.deepEqual(h.authActions.map(([method, uid]) => uid), ["target-uid", "target-uid", "target-uid"]);
  }
});

test("legacy queued jobs with reserved UID cannot reach Auth or Storage cleanup", async () => {
  const h = harness({ "accountDeletionJobs/legacy": { uid: "config", playerIds: [], coachIds: [], state: "queued", leaseUntilMillis: 0 } }, ["config/shared.mov"]);
  await assert.rejects(h.api.process("legacy"), { code: "invalid-argument" });
  assert.deepEqual(h.authActions, []);
  assert.ok(h.remaining.has("config/shared.mov"));
  assert.equal(h.db.snapshot("accountDeletionJobs/legacy").state, "queued");
});

test("unsupported authenticationUID-only coaches fail before any partial deletion", async () => {
  for (const target of [
    { targetType: "coach", targetId: "legacy" },
    { targetType: "uid", targetId: "athlete" },
    {},
  ]) {
    const h = harness({ "coaches/legacy": { authenticationUID: "athlete", members: ["other"] } }, ["athlete/private.mov", "other/private.mov"]);
    await assert.rejects(h.api.request({ ...payload, ...target }, target.targetType ? admin : actor()), { code: "failed-precondition" });
    assert.deepEqual(h.db.snapshot("coaches/legacy"), { authenticationUID: "athlete", members: ["other"] });
    assert.ok(h.db.snapshot("players/profile"));
    assert.equal(h.db.snapshot("players/profile").accountDeletionPending, undefined);
    assert.equal([...h.db.docs.keys()].some(path => /^(accountDeletionJobs|accountDeletionLocks|playerDeletionLocks|accountDeletionReceipts)\//.test(path)), false);
    assert.deepEqual(h.authActions, []);
    assert.deepEqual([...h.remaining], ["athlete/private.mov", "other/private.mov"]);
  }
});

test("conflicting coach aliases cannot be silently ignored during self deletion", async () => {
  const h = harness({ "coaches/legacy": { authenticationUID: "athlete", userUID: "other", members: ["other"] } });
  await assert.rejects(h.api.request(payload, actor()), { code: "failed-precondition" });
  assert.equal(h.db.snapshot("players/profile").accountDeletionPending, undefined);
  assert.deepEqual(h.authActions, []);
});
