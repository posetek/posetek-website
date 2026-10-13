"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { FakeFirestore, FieldValue, HttpsError } = require("./test-support/fake-firestore");
const { createClubs } = require("./clubs");
const { createCoachEnrollment, TTL } = require("./coach-enrollment");
const NOW = 1791907200000;
const admin = { uid: "admin", email: "dylan@posetek.net", emailVerified: true, authTime: NOW / 1000 };
const recipient = { uid: "new", email: "coach@example.test", emailVerified: false, authTime: NOW / 1000 };
const seed = {
  "organizations/club": { name: "Club", schemaVersion: 2, memberUIDs: ["manager"] },
  "organizations/club/members/manager": { userUID: "manager", role: "manager", status: "active", teamIds: [], email: "manager@example.test" },
  "organizations/other": { name: "Other", schemaVersion: 2, memberUIDs: [] },
  "teams/boys": { organizationId: "club", name: "Boys", playerIds: ["p1"], coachUIDs: [] },
  "teams/girls": { organizationId: "club", name: "Girls", playerIds: ["p2"], coachUIDs: [] },
  "teams/foreign": { organizationId: "other", name: "Foreign" },
  "players/p1": { organizationId: "club", teamId: "boys", firstName: "Player", lastName: "One" },
  "players/p2": { organizationId: "club", teamId: "girls", firstName: "Player", lastName: "Two" },
};
function harness(extra = {}) {
  const db = new FakeFirestore({ ...seed, ...extra });
  const users = new Map([admin, recipient, { uid: "manager", email: "manager@example.test", emailVerified: false }, { uid: "second", email: "second@example.test", emailVerified: false }].map(a => [a.uid, { ...a, disabled: false }]));
  const authDirectory = { async getUser(uid) { const user = users.get(uid); if (!user) throw Object.assign(Error("Missing"), { code: "auth/user-not-found" }); return user; } };
  let clock = NOW;
  const clubs = createClubs({ db, FieldValue, HttpsError, now: () => clock });
  const api = createCoachEnrollment({ db, clubs, authDirectory, FieldValue, HttpsError, now: () => clock });
  return { db, api, users, advance: ms => { clock += ms; } };
}
const create = (h, patch = {}, actor = admin) => h.api.create({ label: "Coach Niall", organizationId: "club", teamIds: ["boys", "girls"], requestId: crypto.randomUUID(), ...patch }, actor);
const claim = (h, link, actor = recipient, patch = {}) => h.api.claim({ code: link.code, firstName: "Niall", lastName: "Entered", ...patch }, actor);

test("a coach supplies their own name; both teams and projections bind atomically to one Auth account", async () => {
  const h = harness(), before = h.db.snapshot("players/p1"), link = await create(h);
  assert.equal(link.expiresAtMillis, NOW + TTL);
  assert.match(link.code, /^COACH-[A-F0-9]{32}-[A-F0-9]{64}$/);
  const stored = h.db.snapshot(`coachEnrollmentLinks/${link.id}`);
  assert.equal(stored.code, undefined); assert.notEqual(stored.codeHash, link.code); assert.equal(stored.email, undefined);
  assert.deepEqual((await h.api.inspect({ code: link.code })).teamNames, ["Boys", "Girls"]);
  assert.deepEqual(await claim(h, link), { status: "claimed", organizationId: "club", role: "coach", teamIds: ["boys", "girls"] });
  const member = h.db.snapshot("organizations/club/members/new");
  assert.equal(member.firstName, "Niall"); assert.equal(member.lastName, "Entered"); assert.equal(member.email, recipient.email);
  assert.equal(member.role, "coach"); assert.deepEqual(h.db.snapshot("coaches/new").members, ["p1", "p2"]);
  assert.deepEqual(h.db.snapshot("teams/boys").coachUIDs, ["new"]);
  assert.deepEqual(h.db.snapshot("players/p1"), before);
});
test("lost claim responses retry for that same UID without duplicating membership or rewriting names", async () => {
  const h = harness(), link = await create(h); await claim(h, link);
  const before = h.db.snapshot("organizations/club/members/new");
  await claim(h, link, recipient, { firstName: "Attempted change" });
  assert.deepEqual(h.db.snapshot("organizations/club/members/new"), before);
  assert.deepEqual(await h.api.inspect({ code: link.code }), { status: "claimed" });
  await assert.rejects(claim(h, link, { ...recipient, uid: "second", email: "second@example.test" }), { code: "permission-denied" });
});
test("two accounts competing for one link yield exactly one canonical coach", async () => {
  const h = harness(), link = await create(h);
  const outcomes = await Promise.allSettled([claim(h, link), claim(h, link, { ...recipient, uid: "second", email: "second@example.test" })]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(["new", "second"].filter(uid => h.db.snapshot(`organizations/club/members/${uid}`)).length, 1);
});
test("one account racing invitations across organizations cannot obtain both memberships", async () => {
  const h = harness();
  const [a, b] = await Promise.all([create(h), create(h, { organizationId: "other", teamIds: ["foreign"], label: "Other coach" })]);
  const results = await Promise.allSettled([claim(h, a), claim(h, b)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
});
test("client role, team and email fields cannot escalate the prescribed coach scope", async () => {
  const h = harness(), link = await create(h, { teamIds: ["boys"], role: "manager" });
  await claim(h, link, recipient, { role: "manager", teamIds: ["foreign"], organizationId: "other", email: admin.email });
  const member = h.db.snapshot("organizations/club/members/new");
  assert.equal(member.role, "coach"); assert.equal(member.email, recipient.email); assert.deepEqual(member.teamIds, ["boys"]);
  assert.deepEqual(h.db.snapshot("coaches/new").members, ["p1"]);
});
for (const [label, patch] of [ ["foreign teams", { teamIds: ["foreign"] }], ["empty teams", { teamIds: [] }], ["missing label", { label: "" }], ["malformed request ID", { requestId: "arbitrary" }] ]) {
  test("issuance rejects " + label, async () => { const h = harness(); await assert.rejects(create(h, patch), { code: "invalid-argument" }); });
}
test("only current admins or canonical managers issue, list and revoke coach invitations", async () => {
  const h = harness(), link = await create(h);
  for (const op of [() => create(h, {}, recipient), () => h.api.list({ organizationId: "club" }, recipient), () => h.api.revoke({ id: link.id, organizationId: "club" }, recipient)]) await assert.rejects(op(), { code: "permission-denied" });
  const manager = { uid: "manager", email: "manager@example.test", emailVerified: false, authTime: NOW / 1000 };
  assert.equal((await h.api.list({ organizationId: "club" }, manager)).links.length, 1);
  await h.api.revoke({ id: link.id, organizationId: "club" }, manager);
  await assert.rejects(claim(h, link), { code: "failed-precondition" });
});
test("repeat issuance uses stable request identity and rejects an existing label; lost secrets stay hashed", async () => {
  const h = harness(), requestId = crypto.randomUUID(), link = await create(h, { requestId });
  await assert.rejects(create(h, { requestId }), { code: "already-exists" });
  await assert.rejects(create(h), { code: "already-exists" });
  const listing = (await h.api.list({ organizationId: "club" }, admin)).links;
  assert.equal(listing.length, 1); assert.equal(listing[0].code, undefined); assert.equal(listing[0].codeHash, undefined);
  await h.api.revoke({ id: link.id, organizationId: "club" }, admin);
  assert.ok(await create(h));
});
test("expired or tampered links cannot inspect or claim", async () => {
  const h = harness(), link = await create(h);
  await assert.rejects(h.api.inspect({ code: link.code.slice(0, -1) + (link.code.endsWith("F") ? "E" : "F") }), { code: "not-found" });
  h.advance(TTL);
  await assert.rejects(h.api.inspect({ code: link.code }), { code: "failed-precondition" });
  await assert.rejects(claim(h, link, { ...recipient, authTime: (NOW + TTL) / 1000 }), { code: "failed-precondition" });
  assert.equal(h.db.snapshot("organizations/club/members/new"), undefined);
});
test("issuer disablement and lost manager authority invalidate unused invitations", async () => {
  const h = harness(), by = { uid: "manager", email: "manager@example.test", authTime: NOW / 1000, emailVerified: false }, link = await create(h, {}, by);
  await h.db.doc("organizations/club/members/manager").update({ status: "inactive" });
  await assert.rejects(h.api.inspect({ code: link.code }), { code: "permission-denied" });
  await assert.rejects(claim(h, link), { code: "permission-denied" });
  h.users.get("manager").disabled = true;
  await assert.rejects(claim(h, link), { code: "permission-denied" });
});
for (const [label, extra] of [
  ["player", { "players/existing": { authenticationUID: "new" } }],
  ["player alias", { "players/existing": { userUID: "new" } }],
  ["direct player", { "players/new": {} }],
  ["populated independent roster", { "coaches/new": { userUID: "new", members: ["existing"] } }],
  ["cross-organization staff", { "organizations/other": { name: "Other", schemaVersion: 2, memberUIDs: ["new"] } }],
  ["UID alias", { "coaches/alias": { userUID: "new" } }],
  ["pending email-bound invitation", { "clubStaffInvitations/old": { email: recipient.email, status: "pending", expiresAtMillis: NOW + TTL } }],
  ["unfinished access write", { [`accountAccessTargets/${crypto.createHash("sha256").update(recipient.email).digest("hex")}`]: { activeGrantId: "old" }, "accountAccessGrants/old": { status: "blocked" } }],
]) test("claim preserves existing " + label + " boundaries", async () => { const h = harness(extra), link = await create(h); await assert.rejects(claim(h, link), { code: "failed-precondition" }); assert.equal(h.db.snapshot(`coachEnrollmentLinks/${link.id}`).status, "pending"); });
test("deletion locks fence issuance and claims inside their transaction", async () => {
  const h = harness(), link = await create(h);
  await h.db.doc("accountDeletionLocks/new").set({ accepted: true });
  await assert.rejects(claim(h, link), { code: "permission-denied" });
  await h.db.doc("accountDeletionLocks/admin").set({ accepted: true });
  await assert.rejects(create(h, { label: "Other" }), { code: "permission-denied" });
});
test("new invitations never set or change Auth passwords, verification or enabled state", async () => {
  const h = harness(), old = structuredClone(h.users.get("new")), link = await create(h);
  await claim(h, link); assert.deepEqual(h.users.get("new"), old);
  await assert.rejects(create(h, { label: "Stale" }, { ...admin, authTime: NOW / 1000 - 301 }), { code: "failed-precondition" });
  await assert.rejects(claim(h, link, { ...recipient, email: "spoof@example.test" }), { code: "unauthenticated" });
});
test("replay cannot restore deactivated or reassigned coach access", async () => {
  const h = harness(), link = await create(h); await claim(h, link);
  await h.db.doc("organizations/club/members/new").update({ status: "inactive" });
  await assert.rejects(claim(h, link), { code: "failed-precondition" });
  await assert.rejects(h.api.revoke({ id: link.id, organizationId: "club" }, admin), { code: "failed-precondition" });
});
test("public transport is rate limited and validates network identity without storing codes", async () => {
  const h = harness();
  for (let i = 0; i < 60; i++) await h.api.rate({ ip: "127.0.0.1" }, null, "inspect");
  await assert.rejects(h.api.rate({ ip: "127.0.0.1" }, null, "inspect"), { code: "resource-exhausted" });
  await assert.rejects(h.api.rate({ ip: "not-an-ip" }, null, "inspect"), { code: "failed-precondition" });
});
