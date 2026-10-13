"use strict";

const crypto = require("node:crypto");
const { isIP } = require("node:net");
const { playerSegment } = require("./athlete-storage-paths");
const { activeMember } = require("./club-access");
const { deletionLocked } = require("./account-deletion-state");
const TTL = 7 * 86400000;
const RECENT = 5 * 60000;
const digest = text => crypto.createHash("sha256").update(text).digest("hex");

function createCoachEnrollment({ db, clubs, authDirectory, FieldValue, HttpsError, now = () => Date.now(), randomBytes = crypto.randomBytes }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const ref = id => db.doc(`coachEnrollmentLinks/${id}`);
  function token(value) {
    if (typeof value !== "string" || !/^COACH-[A-F0-9]{32}-[A-F0-9]{64}$/.test(value)) fail("invalid-argument", "Open the private coach invitation that PoseTek shared with you.");
    return { code: value, id: value.slice(6, 38).toLowerCase() };
  }
  function checked(doc, code) {
    const g = doc.data();
    if (!g || g.schemaVersion !== 1 || g.role !== "coach" || !playerSegment(g.organizationId) || !playerSegment(g.createdByUID)
      || !Array.isArray(g.teamIds) || !g.teamIds.length || g.teamIds.length > 100 || g.teamIds.some(id => !playerSegment(id))
      || !Number.isSafeInteger(g.expiresAtMillis) || !["pending", "claimed", "revoked"].includes(g.status)
      || (code && (typeof g.codeHash !== "string" || !/^[a-f0-9]{64}$/.test(g.codeHash)
        || !crypto.timingSafeEqual(Buffer.from(digest(code)), Buffer.from(g.codeHash))))) {
      fail("not-found", "This coach invitation could not be found. Ask PoseTek for a new link.");
    }
    return g;
  }
  async function current(auth, recent = false) {
    if (!playerSegment(auth?.uid) || auth.isAnonymous || typeof auth.email !== "string") fail("unauthenticated", "Sign in with your account to continue.");
    let user;
    try { user = await authDirectory.getUser(auth.uid); } catch (e) { if (e.code === "auth/user-not-found") fail("permission-denied", "This account is no longer available."); throw e; }
    if (user.disabled || user.email?.toLowerCase() !== auth.email.toLowerCase()
      || (Number.isFinite(Date.parse(user.tokensValidAfterTime || "")) && (!Number.isFinite(Number(auth.authTime)) || Number(auth.authTime) * 1000 < Date.parse(user.tokensValidAfterTime)))) {
      fail("unauthenticated", "Your account changed. Sign in again to continue.");
    }
    if (recent && (!Number.isFinite(Number(auth.authTime)) || now() - Number(auth.authTime) * 1000 > RECENT || Number(auth.authTime) * 1000 > now() + 30000)) {
      fail("failed-precondition", "Sign in again, then use this invitation within five minutes.");
    }
    return { uid: user.uid, email: user.email, emailVerified: user.emailVerified === true && auth.emailVerified === true, isAnonymous: false };
  }
  async function issuer(g) {
    let user;
    try { user = await authDirectory.getUser(g.createdByUID); } catch (e) { if (e.code === "auth/user-not-found") fail("permission-denied", "This invitation is no longer authorized. Ask PoseTek for a new link."); throw e; }
    if (user.disabled) fail("permission-denied", "This invitation is no longer authorized. Ask PoseTek for a new link.");
    return { uid: user.uid, email: user.email, emailVerified: user.emailVerified === true, isAnonymous: false };
  }
  async function unlocked(tx, ...uids) {
    for (const uid of uids) if (await deletionLocked(db, tx, { uid })) fail("permission-denied", "This account is being deleted.");
  }
  function available(g) {
    if (g.status !== "pending" || g.expiresAtMillis <= now()) fail("failed-precondition", "This invitation has been used, revoked or expired. Sign in normally if you already activated your account; otherwise ask PoseTek for a new link.");
  }
  function summary(doc, g) {
    return { id: doc.id, label: g.label, organizationId: g.organizationId, role: "coach", teamIds: g.teamIds,
      status: g.status === "pending" && g.expiresAtMillis <= now() ? "expired" : g.status,
      createdAtMillis: g.createdAtMillis, expiresAtMillis: g.expiresAtMillis };
  }
  async function rate(rawRequest, auth, kind) {
    let ip = rawRequest?.ip;
    if (typeof ip !== "string" || ip.length > 64 || !isIP(ip)) fail("failed-precondition", "The connection could not be checked. Try again.");
    const key = digest(`coach-enrollment:${kind}:${ip.toLowerCase()}:${playerSegment(auth?.uid) ? auth.uid : "visitor"}`);
    const r = db.doc(`accountAccessRateLimits/${key}`), window = 3600000;
    await db.runTransaction(async tx => {
      const old = (await tx.get(r)).data();
      if (old && (!Number.isSafeInteger(old.count) || old.count < 0 || !Number.isSafeInteger(old.windowStartMillis) || old.windowStartMillis > now())) fail("resource-exhausted", "Coach invitations are temporarily unavailable.");
      const active = old && now() - old.windowStartMillis < window, count = active ? old.count : 0;
      if (count >= (kind === "inspect" ? 60 : 20)) fail("resource-exhausted", "Too many attempts. Try again later.");
      const windowStartMillis = active ? old.windowStartMillis : now();
      tx.set(r, { count: count + 1, windowStartMillis, expiresAt: new Date(windowStartMillis + 2 * window) });
    });
  }
  async function create(data, auth) {
    const actor = await current(auth, true);
    if (typeof data?.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.requestId)) fail("invalid-argument", "A new invitation request identifier is required.");
    if (typeof data.label !== "string" || !data.label.trim() || data.label.trim().length > 80) fail("invalid-argument", "Enter a short name for this invitation.");
    const id = data.requestId.replaceAll("-", "").toLowerCase();
    const code = `COACH-${id.toUpperCase()}-${randomBytes(32).toString("hex").toUpperCase()}`;
    let expiresAtMillis;
    await db.runTransaction(async tx => {
      await unlocked(tx, actor.uid);
      const scope = await clubs.coachEnrollmentScope(tx, data, actor);
      if (!scope.teamIds.length) fail("invalid-argument", "Choose at least one team for this coach.");
      const old = await tx.get(ref(id));
      if (old.exists) fail("already-exists", "This invitation request was already saved. Check its status; replace a lost link rather than creating duplicates.");
      const pending = await tx.get(db.collection("coachEnrollmentLinks").where("organizationId", "==", data.organizationId).limit(201));
      if (pending.size >= 200) fail("resource-exhausted", "Review the existing invitations before issuing more.");
      if (pending.docs.some(doc => doc.data().status === "pending" && doc.data().expiresAtMillis > now() && doc.data().label?.toLowerCase() === data.label.trim().toLowerCase())) {
        fail("already-exists", "There is already a pending link with this name. Revoke it before replacing it.");
      }
      expiresAtMillis = now() + TTL;
      tx.create(ref(id), { schemaVersion: 1, codeHash: digest(code), role: "coach", organizationId: data.organizationId,
        teamIds: scope.teamIds, label: data.label.trim(), createdByUID: actor.uid, status: "pending", createdAtMillis: now(), expiresAtMillis });
      tx.create(db.collection("accountAccessAudit").doc(), { action: "coach_enrollment_issued", purpose: "coach_enrollment", grantId: id, actorUID: actor.uid, atMillis: now() });
    });
    return { id, code, activationUrl: `https://posetek.net/coach-join#coachInvite=${code}`, expiresAtMillis };
  }
  async function inspect(data) {
    const { code, id } = token(data?.code);
    const g = checked(await ref(id).get(), code);
    if (g.status === "claimed") return { status: "claimed" };
    available(g);
    const by = await issuer(g);
    return db.runTransaction(async tx => {
      const fresh = checked(await tx.get(ref(id)), code); available(fresh);
      await unlocked(tx, by.uid);
      const scope = await clubs.coachEnrollmentScope(tx, fresh, by);
      return { status: "ready", label: fresh.label, role: "coach", organizationName: scope.organizationName,
        teamNames: scope.teamNames, expiresAtMillis: fresh.expiresAtMillis };
    });
  }
  async function claim(data, auth) {
    const actor = await current(auth, true);
    if (/^[^@]+@posetek\.net$/i.test(actor.email)) fail("permission-denied", "Use the coach's own email account for this invitation.");
    const { code, id } = token(data?.code);
    const g = checked(await ref(id).get(), code);
    const by = g.status === "claimed" ? null : await issuer(g);
    return db.runTransaction(async tx => {
      const fresh = checked(await tx.get(ref(id)), code);
      await unlocked(tx, actor.uid, ...(by ? [by.uid] : []));
      if (fresh.status === "claimed") {
        if (fresh.claimedByUID !== actor.uid) fail("permission-denied", "This invitation has already been used by another account.");
        const member = (await tx.get(db.doc(`organizations/${fresh.organizationId}/members/${actor.uid}`))).data();
        if (!activeMember(member, actor.uid) || member.role !== "coach" || member.enrollmentId !== id
          || JSON.stringify([...member.teamIds].sort()) !== JSON.stringify([...fresh.teamIds].sort())) {
          fail("failed-precondition", "Your access changed after activation. Sign in normally or contact PoseTek.");
        }
        return { status: "claimed", organizationId: fresh.organizationId, role: "coach", teamIds: fresh.teamIds };
      }
      available(fresh);
      const scope = await clubs.coachEnrollmentScope(tx, fresh, by);
      const result = await clubs.claimCoachEnrollmentMembership(tx, scope, actor, data, id);
      tx.update(ref(id), { status: "claimed", claimedByUID: actor.uid, claimedAtMillis: now() });
      tx.create(db.collection("accountAccessAudit").doc(), { action: "coach_enrollment_claimed", purpose: "coach_enrollment", grantId: id, actorUID: actor.uid, targetUID: actor.uid, atMillis: now() });
      return { status: "claimed", ...result };
    });
  }
  async function list(data, auth) {
    const actor = await current(auth);
    return db.runTransaction(async tx => {
      await unlocked(tx, actor.uid);
      await clubs.coachEnrollmentScope(tx, { organizationId: data?.organizationId }, actor);
      const rows = await tx.get(db.collection("coachEnrollmentLinks").where("organizationId", "==", data.organizationId).limit(200));
      return { links: rows.docs.map(doc => summary(doc, checked(doc))).sort((a, b) => b.createdAtMillis - a.createdAtMillis) };
    });
  }
  async function revoke(data, auth) {
    const actor = await current(auth, true);
    if (typeof data?.id !== "string" || !/^[a-f0-9]{32}$/.test(data.id)) fail("invalid-argument", "Choose a valid invitation.");
    return db.runTransaction(async tx => {
      await unlocked(tx, actor.uid);
      const doc = await tx.get(ref(data.id)), g = checked(doc);
      if (data.organizationId !== g.organizationId) fail("permission-denied", "This invitation belongs to a different organization.");
      await clubs.coachEnrollmentScope(tx, { organizationId: g.organizationId }, actor);
      if (g.status === "claimed") fail("failed-precondition", "This coach is already active. Manage their existing staff access instead.");
      if (g.status !== "revoked") {
        tx.update(ref(data.id), { status: "revoked", revokedByUID: actor.uid, revokedAtMillis: now() });
        tx.create(db.collection("accountAccessAudit").doc(), { action: "coach_enrollment_revoked", purpose: "coach_enrollment", grantId: data.id, actorUID: actor.uid, atMillis: now() });
      }
      return { status: "revoked" };
    });
  }
  return { create, inspect, claim, list, revoke, rate };
}
module.exports = { createCoachEnrollment, TTL };
