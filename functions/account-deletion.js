"use strict";

const crypto = require("node:crypto");
const { isClubAdmin } = require("./club-access");
const { playerSegment } = require("./athlete-storage-paths");
const DAY = 86400000;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const RESERVED_ROOTS = new Set(["config", "users", "players", "coaches", "admins", "organizations", "teams", "llmJobs",
  "processing_attempts", "diagnostics", "failure_cases", "trainingPlanContexts", "drillCatalogMedia", "kicking-analysis", "ProfessionalOverlay"]);
const JOBS = "accountDeletionJobs";
const RECEIPTS = "accountDeletionReceipts";

// Exact ownership selectors only. Never match email, names, arbitrary strings,
// or a media URL supplied by a client. Whole player subtrees are removed too.
const PLAYER_RECORDS = {
  accountRecoveryRequests: ["playerId"],
  llmJobs: ["playerId"], llmUsage: ["playerId"], aiIncidents: ["playerId"],
  kickAnalysisQueue: ["playerId", "playerDocumentID"],
  failureCases: ["playerDocumentID"], processingAttempts: ["playerDocumentID"],
  fieldReports: ["playerDocumentID", "playerId"],
  socialActivities: ["playerId"], athleteResultSharesV2: ["playerDocId"],
  playerSignupCodes: ["playerId"], playerSignupInvitations: ["playerId"],
  workoutNotificationActivity: ["playerId"], workoutNotificationOutbox: ["playerId"],
  insightUsageIntervals: ["playerId"], userIssueOccurrences: ["player.id", "contactSnapshot.player.id"],
};
const USER_RECORDS = {
  accountRecoveryRequests: ["targetUID"],
  llmJobs: ["requestedByUid"], llmUsage: ["requestedByUid", "uid"], aiIncidents: ["requestedByUid"],
  failureCases: ["reportedByUid", "uploadedByUID", "userUID"], processingAttempts: ["reportedByUid", "uploadedByUID", "userUID"],
  socialActivities: ["authorUid"], socialReports: ["reporterUid"],
  testingEventInvites: ["createdByUid", "usedByUid"],
  appFeedbackResponsesV1: ["author.uid"],
  clubStaffInvitations: ["claimedByUID", "claimedByUid", "redeemedByUid"],
  accountAccessTargets: ["targetUID"], accountAccessGrants: ["targetUID"], accountAccessAudit: ["targetUID", "actorUID"],
  insightUsageIntervals: ["actorUid"], userIssueOccurrences: ["reporterUid", "actorUid", "uid", "contactSnapshot.actorUid"],
  userIssueActors: ["uid"], userIssueOutbox: ["actorUid"],
};
for (const root of ["devicePerformanceAttempts", "devicePerformanceRuns", "devicePerformanceUploadGroups", "devicePerformanceTransfers", "devicePerformanceDevices"]) {
  PLAYER_RECORDS[root] = ["authority.playerDocumentID"];
  USER_RECORDS[root] = ["authority.reporterUid"];
}
const USER_DOCUMENTS = ["admins", "users", "socialPreferences", "socialRateLimits", "admissionAttempts", "insightUsageActors", "aiSharingConsents"];

function createAccountDeletion({ db, authDirectory, bucket, FieldValue, HttpsError,
  eraseGatewayStorage = async () => { throw new Error("Gateway storage eraser is not configured"); },
  eraseWarehouse = async () => { throw new Error("Warehouse eraser is not configured"); },
  now = () => Date.now(), randomId = () => crypto.randomBytes(16).toString("hex") }) {
  const eraseTracker = require("./account-deletion-tracker").createTrackerErasure({ db, now });
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const id = value => playerSegment(value) && !RESERVED_ROOTS.has(value) ? value : fail("invalid-argument", "Choose a valid account.");
  const jobRef = key => db.collection(JOBS).doc(key);
  const lockRef = uid => db.collection("accountDeletionLocks").doc(uid);
  const receiptRef = token => db.collection(RECEIPTS).doc(digest(token));
  function token(value) {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("invalid-argument", "A valid deletion receipt is required.");
    return value;
  }
  async function enabled() {
    const config = (await db.doc("config/accountDeletion").get()).data();
    // Release gate: never accept irreversible jobs before the cross-service
    // inventory, write barriers, retention and device acceptance are verified.
    if (config?.enabled !== true || config?.verifiedManifestVersion !== 1 || config?.warehouseReviewed !== true || !Array.isArray(config?.bigQueryTables)) {
      fail("failed-precondition", "Account deletion is not available yet. Please try again later.");
    }
    try { await eraseGatewayStorage({ kind: "verify" }); } catch { fail("failed-precondition", "Account deletion storage coverage is not configured."); }
  }
  function recent(caller) {
    if (!caller?.uid || caller.isAnonymous) fail("unauthenticated", "Sign in to continue.");
    const age = now() / 1000 - caller.authTime;
    if (!Number.isFinite(age) || age < -60 || age > 300) fail("unauthenticated", "Sign in again to confirm account deletion.");
  }
  async function identity(tx, uid) {
    const result = { uid, playerIds: [], coachIds: [] };
    for (const [collection, fields, output] of [["players", ["authenticationUID", "userUID"], "playerIds"], ["coaches", ["userUID", "authenticationUID"], "coachIds"]]) {
      const found = new Map();
      for (const field of fields) {
        const matches = await tx.get(db.collection(collection).where(field, "==", uid).limit(51));
        if (matches.size > 50) fail("failed-precondition", "This account's identity records need repair before deletion.");
        for (const row of matches.docs) found.set(row.id, row);
      }
      const direct = await tx.get(db.collection(collection).doc(uid));
      if (direct.exists) found.set(direct.id, direct);
      for (const row of found.values()) {
        const data = row.data();
        // Coach writers/access contracts require userUID. Query the legacy
        // alias to detect incomplete identities, never to silently skip them.
        if (collection === "coaches" && data.userUID !== uid) {
          fail("failed-precondition", "The coach account identity needs repair.");
        }
        if (fields.some(field => Object.hasOwn(data, field) && data[field] !== uid)) {
          fail("failed-precondition", "Conflicting account ownership must be repaired before deletion.");
        }
        result[output].push(id(row.id));
      }
    }
    return result;
  }
  async function request(data, caller) {
    recent(caller);
    if (data?.confirmation !== "DELETE") fail("invalid-argument", "Confirm permanent account deletion.");
    const receiptToken = token(data.receiptToken);
    await enabled();
    return db.runTransaction(async tx => {
      let uid = id(caller.uid), unclaimedPlayer = null;
      if (data.targetType || data.targetId) {
        if (!isClubAdmin(caller)) fail("permission-denied", "Only PoseTek admins can delete another account.");
        const targetId = id(data.targetId);
        if (data.targetType === "uid") uid = targetId;
        else if (["player", "coach"].includes(data.targetType)) {
          const target = await tx.get(db.collection(data.targetType === "player" ? "players" : "coaches").doc(targetId));
          if (!target.exists) fail("not-found", "The account no longer exists.");
          const p = target.data(), aliases = [p.authenticationUID, p.userUID].filter(v => v !== undefined);
          if (aliases.some(v => !playerSegment(v)) || new Set(aliases).size > 1) fail("failed-precondition", "Conflicting account ownership must be repaired before deletion.");
          // Profile aliases become top-level Storage prefixes too. Apply the
          // same reserved-root validation as self and direct-UID requests.
          uid = aliases.length ? id(aliases[0]) : null;
          if (data.targetType === "coach" && (!uid || p.userUID !== uid)) fail("failed-precondition", "The coach account identity needs repair.");
          if (!uid) {
            if (p.registered === true) fail("failed-precondition", "The registered player identity needs repair.");
            unclaimedPlayer = targetId;
          }
        } else fail("invalid-argument", "Choose a valid account type.");
      }
      const key = digest(uid ? `uid:${uid}` : `player:${unclaimedPlayer}`);
      const ref = jobRef(key), previous = await tx.get(ref);
      const receipt = await tx.get(receiptRef(receiptToken));
      if (receipt.exists && receipt.data().jobId !== key) fail("already-exists", "Use a new deletion receipt.");
      const subject = previous.exists ? previous.data() : uid ? await identity(tx, uid) : { uid: null, playerIds: [unclaimedPlayer], coachIds: [] };
      if (!previous.exists) {
        tx.create(ref, { ...subject, state: "queued", createdAtMillis: now(), updatedAtMillis: now(), leaseUntilMillis: 0, manifestVersion: 1 });
        if (uid) tx.set(lockRef(uid), { jobId: key, createdAtMillis: now() });
        for (const pid of subject.playerIds) {
          tx.set(db.doc(`playerDeletionLocks/${pid}`), { jobId: key, createdAtMillis: now() });
          tx.update(db.doc(`players/${pid}`), { accountDeletionPending: true });
        }
      }
      tx.set(receiptRef(receiptToken), { jobId: key, createdAtMillis: now() });
      return { accepted: true, deletingCaller: uid === caller.uid, state: previous.data()?.state || "queued", receiptToken,
        message: "Deletion requested. Your account and personal data, including recordings, will be deleted within 30 days. Keep this receipt to check completion." };
    });
  }
  async function status(data) {
    // An unguessable receipt survives sign-out/Auth deletion. It reveals no UID,
    // email, name, profile, or inventory; store only its SHA-256 server-side.
    const receipt = await receiptRef(token(data?.receiptToken)).get();
    if (!receipt.exists) fail("not-found", "Deletion receipt not found.");
    const job = await jobRef(receipt.data().jobId).get();
    if (!job.exists) fail("not-found", "Deletion receipt has expired.");
    return { state: job.data().state, requestedAtMillis: job.data().createdAtMillis,
      completedAtMillis: job.data().completedAtMillis || null };
  }
  async function listAccounts(data, caller) {
    if (!isClubAdmin(caller)) fail("permission-denied", "Only PoseTek admins can manage accounts.");
    if (data?.pageToken !== undefined && (typeof data.pageToken !== "string" || data.pageToken.length > 2048)) fail("invalid-argument", "Invalid account page.");
    const page = await authDirectory.listUsers(50, data?.pageToken || undefined);
    return { accounts: page.users.map(user => ({ uid: user.uid, displayName: user.displayName || user.email || "Account",
      email: user.email || null, disabled: user.disabled === true })), nextPageToken: page.pageToken || null };
  }
  async function erase(ref) { await db.recursiveDelete(ref); }
  async function erasePrefix(prefix) {
    // Include live and noncurrent generations. Bucket-managed soft-deleted
    // generations expire under the separately verified bucket retention policy.
    for (;;) {
      const [files] = await bucket.getFiles({ prefix, versions: true, maxResults: 100, autoPaginate: false });
      if (!files.length) return;
      for (const file of files) await file.delete({ ignoreNotFound: true });
    }
  }
  async function eraseRecord(doc, storageJobRef) {
    const root = doc.ref.path.split("/")[0];
    // Capture paths before deleting their authoritative record; never follow
    // arbitrary storagePath/URL fields into another user's or shared media.
    if (root === "llmJobs") {
      const artifactJobId = id(doc.id);
      if (!storageJobRef) throw new Error("Gateway artifact erasure requires a durable deletion job");
      await db.runTransaction(async tx => {
        const job = await tx.get(storageJobRef);
        if (!job.exists) throw new Error("Missing durable deletion job");
        tx.update(storageJobRef, { gatewayArtifactJobIds: [...new Set([...(job.data().gatewayArtifactJobIds || []), artifactJobId])] });
      });
      await eraseGatewayStorage({ kind: "job", id: artifactJobId });
    }
    if (root === "failureCases") await erasePrefix(`failure_cases/${id(doc.id)}/`);
    if (root === "processingAttempts") {
      const p = doc.data(), uploader = p.reportedByUid || p.uploadedByUID || p.userUID;
      if (playerSegment(uploader)) await erasePrefix(`processing_attempts/${uploader}/${id(doc.id)}/`);
    }
    if (root === "socialActivities") {
      await erase(db.doc(`socialActivitySettings/${doc.id}`));
      await eraseMatches("socialReports", "activityId", doc.id);
    }
    if (root === "appFeedbackResponsesV1") await erase(db.doc(`appFeedbackSessionsV1/${doc.id}`));
    if (root === "accountAccessGrants") for (const field of ["activeGrantId", "grantId"]) await eraseMatches("accountAccessTargets", field, doc.id);
    if (root === "userIssueOccurrences") {
      await eraseMatches("userIssueSourceClaims", "occurrenceId", doc.id);
      await erase(db.doc(`userIssueOutbox/${doc.id}`));
      const issueId = doc.data().issueId;
      if (playerSegment(issueId)) await db.runTransaction(async tx => {
        const ref = db.doc(`userIssues/${issueId}`), issue = await tx.get(ref);
        // Keep aggregate triage and other reporters, but remove the deleted
        // reporter's cached display label and now-invalid occurrence pointer.
        if (issue.exists && issue.data().latestOccurrenceId === doc.id) {
          tx.update(ref, { latestUser: FieldValue.delete(), latestOccurrenceId: FieldValue.delete() });
        }
      });
    }
    await erase(doc.ref);
  }
  async function eraseMatches(collection, field, value, operator = "==", storageJobRef) {
    for (;;) {
      const page = await db.collection(collection).where(field, operator, value).limit(100).get();
      if (page.empty) return;
      for (const doc of page.docs) await eraseRecord(doc, storageJobRef);
    }
  }
  async function scan(collection, handler) {
    let cursor;
    for (;;) {
      let q = db.collection(collection).orderBy("__name__").limit(100);
      if (cursor) q = q.startAfter(cursor);
      const page = await q.get();
      if (page.empty) return;
      for (const doc of page.docs) await handler(doc);
      cursor = page.docs.at(-1).id;
    }
  }
  async function detach(subject) {
    const players = new Set(subject.playerIds), coaches = new Set(subject.coachIds), uid = subject.uid;
    // Shared documents are edited in transactions to preserve concurrent joins
    // and unrelated athletes. Never delete a team, organization or event.
    for (const collection of ["coaches", "teams", "organizations"]) await scan(collection, async doc => {
      await db.runTransaction(async tx => {
        const fresh = await tx.get(doc.ref); if (!fresh.exists) return;
        const p = fresh.data(), patch = {};
        for (const key of ["members", "playerIds", "players"]) if (Array.isArray(p[key])) {
          const remaining = p[key].filter(v => !players.has(v));
          if (remaining.length !== p[key].length) { patch[key] = remaining; if (key === "members") patch.numberMembers = remaining.length; }
        }
        for (const key of ["coachUIDs", "memberUIDs", "managerUIDs", "coaches"]) if (Array.isArray(p[key])) {
          const remaining = p[key].filter(v => v !== uid && !coaches.has(v));
          if (remaining.length !== p[key].length) patch[key] = remaining;
        }
        for (const key of ["ownerUID", "ownerUid", "createdByUid", "createdByUID"]) if (uid && p[key] === uid) patch[key] = FieldValue.delete();
        if (Object.keys(patch).length) tx.update(doc.ref, patch);
      });
      if (collection === "organizations" && uid) await erase(doc.ref.collection("members").doc(uid));
    });
    if (uid) await scan("players", async doc => {
      if (players.has(doc.id)) return;
      for (const child of ["aiConversations", "workoutDrafts", "personalizedPlanDrafts", "personalizedPlanDraftViews"]) {
        await eraseMatches(`${doc.ref.path}/${child}`, "createdByUid", uid);
      }
      await db.runTransaction(async tx => {
        const fresh = await tx.get(doc.ref); if (!fresh.exists) return;
        const patch = {}, p = fresh.data();
        for (const key of ["coachUID", "coachId", "coachDocId"]) if (p[key] === uid || coaches.has(p[key])) patch[key] = FieldValue.delete();
        if (Object.keys(patch).length) tx.update(doc.ref, patch);
      });
    });
    await scan("testingEvents", async event => {
      if (uid) {
        // Events and their other athletes survive coach deletion. Remove only
        // the exact operator's attribution and release their station lease.
        async function scrub(ref, fields, station = false) {
          await db.runTransaction(async tx => {
            const fresh = await tx.get(ref); if (!fresh.exists) return;
            const data = fresh.data(), patch = {};
            for (const field of fields) if (data[field] === uid) patch[field] = FieldValue.delete();
            if (Array.isArray(data.operatorUids) && data.operatorUids.includes(uid)) {
              patch.operatorUids = data.operatorUids.filter(value => value !== uid);
            }
            if (station && data.claimedByUid === uid) Object.assign(patch, {
              claimedByUid: null, claimedDeviceId: null, leaseExpiresAt: FieldValue.delete(), leaseExpiresAtMillis: 0,
            });
            if (Object.keys(patch).length) tx.update(ref, patch);
          });
        }
        await scrub(event.ref, ["ownerUid", "closedByUid"]);
        await scan(`${event.ref.path}/stations`, doc => scrub(doc.ref, ["claimedByUid"], true));
        await eraseMatches(`${event.ref.path}/devices`, "operatorUid", uid);
        await scan(`${event.ref.path}/checkIns`, doc => scrub(doc.ref, ["checkedInByUid"]));
        await scan(`${event.ref.path}/protocolChanges`, doc => scrub(doc.ref, ["changedByUid"]));
      }
      for (const pid of players) {
        await erase(event.ref.collection("participants").doc(pid));
        await erase(event.ref.collection("projectionDirty").doc(pid));
        await erase(event.ref.collection("checkIns").doc(pid));
        for (const field of ["playerId", "playerDocId"]) await eraseMatches(`${event.ref.path}/sessionReservations`, field, pid);
        await erase(event.ref.collection("projectionFinalizations").doc(pid));
        for (const child of ["repLinks", "progress", "committedReps", "protocolChanges"]) {
          for (const field of ["playerId", "playerDocId"]) await eraseMatches(`${event.ref.path}/${child}`, field, pid);
        }
      }
    });
    if (uid) await scan("socialActivities", async activity => {
      await erase(activity.ref.collection("kudos").doc(uid));
      await eraseMatches(`${activity.ref.path}/comments`, "uid", uid);
    });
  }
  async function sweepSubject(subject) {
    const { uid, playerIds, coachIds } = subject;
    if (uid) id(uid);
    for (const value of [...playerIds, ...coachIds]) id(value);
    await eraseGatewayStorage({ kind: "verify" });
    const storageJobRef = jobRef(crypto.createHash("sha256").update(uid ? `uid:${uid}` : `player:${playerIds[0]}`).digest("hex"));
    const durable = (await storageJobRef.get()).data();
    for (const artifactJobId of durable?.gatewayArtifactJobIds || []) await eraseGatewayStorage({ kind: "job", id: id(artifactJobId) });
    const tracker = await eraseTracker(subject);
    await detach(subject);
    for (const pid of playerIds) {
      await eraseGatewayStorage({ kind: "player", id: pid });
      for (const [collection, fields] of Object.entries(PLAYER_RECORDS)) for (const field of fields) await eraseMatches(collection, field, pid, "==", storageJobRef);
      for (const prefix of [`${pid}/`, `diagnostics/${pid}/`, `trainingPlanContexts/${pid}/`]) await erasePrefix(prefix);
      await erase(db.doc(`insightUsageDays/${pid}`));
      await erase(db.doc(`players/${pid}`));
    }
    if (uid) {
      for (const [collection, fields] of Object.entries(USER_RECORDS)) for (const field of fields) await eraseMatches(collection, field, uid, "==", storageJobRef);
      await eraseMatches("socialConnections", "participants", uid, "array-contains");
      await scan("accountRecoveryRequests", async request => {
        await db.runTransaction(async tx => {
          const fresh = await tx.get(request.ref);
          if (fresh.data()?.updatedByUID === uid) tx.update(request.ref, { updatedByUID: FieldValue.delete() });
        });
      });
      const issueActorKey = require("./user-issue-model").hash(uid);
      await eraseMatches("userIssueRequestIdentities", "actorKey", issueActorKey);
      await scan("userIssueDays", day => erase(day.ref.collection("actors").doc(issueActorKey)));
      for (const root of USER_DOCUMENTS) await erase(db.doc(`${root}/${uid}`));
      for (const prefix of [`${uid}/`, `processing_attempts/${uid}/`, `kicking-analysis/${uid}/`, `diagnostics/${uid}/`]) await erasePrefix(prefix);
    }
    for (const cid of coachIds) await erase(db.doc(`coaches/${cid}`));
    return tracker;
  }
  async function process(key) {
    await enabled();
    const ref = jobRef(key), lease = randomId();
    const subject = await db.runTransaction(async tx => {
      const doc = await tx.get(ref); if (!doc.exists) return null;
      const job = doc.data();
      if (job.state === "completed" || job.leaseUntilMillis > now()) return null;
      // Revalidate durable jobs before Auth or Storage actions, including jobs
      // accepted by an older version of the request handler.
      if (job.uid) id(job.uid);
      for (const value of [...job.playerIds, ...job.coachIds]) id(value);
      tx.update(ref, { lease, leaseUntilMillis: now() + 10 * 60000, state: "deleting", updatedAtMillis: now() });
      return job;
    });
    if (!subject) return;
    try {
      if (subject.uid) {
        try {
          await authDirectory.updateUser(subject.uid, { disabled: true });
          await authDirectory.revokeRefreshTokens(subject.uid);
        } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
      }
      const tracker = await sweepSubject(subject);
      const coverage = (await db.doc("config/accountDeletion").get()).data();
      await eraseWarehouse(subject.playerIds, coverage.bigQueryTables);
      if (tracker.pending) throw new Error("Tracker external erasure and reconciliation required");
      if (subject.uid) {
        try { await authDirectory.deleteUser(subject.uid); }
        catch (e) { if (e.code !== "auth/user-not-found") throw e; }
      }
      // A second pass after the worker grace period catches asynchronous
      // projections and in-flight uploads. Cross-service barriers are a release
      // prerequisite, not replaced by this cleanup pass.
      const completed = subject.firstSweepAtMillis && now() - subject.firstSweepAtMillis >= DAY;
      await db.runTransaction(async tx => {
        const latest = await tx.get(ref);
        if (latest.data()?.lease !== lease) return;
        tx.update(ref, { state: completed ? "completed" : "verifying", leaseUntilMillis: 0,
          firstSweepAtMillis: subject.firstSweepAtMillis || now(), updatedAtMillis: now(),
          ...(completed ? { completedAtMillis: now() } : {}) });
      });
    } catch (error) {
      await db.runTransaction(async tx => {
        const latest = await tx.get(ref);
        if (latest.data()?.lease === lease) tx.update(ref, { state: "retrying", leaseUntilMillis: 0, updatedAtMillis: now() });
      });
      // Do not place provider errors (which can contain PII) in receipts/logs.
      throw new Error("Account deletion cleanup needs retry");
    }
  }
  async function runPending() {
    const config = (await db.doc("config/accountDeletion").get()).data();
    if (config?.enabled !== true || config?.verifiedManifestVersion !== 1 || config?.warehouseReviewed !== true || !Array.isArray(config?.bigQueryTables)) return;
    // Ordered traversal avoids a persistent failed job starving later requests.
    await scan(JOBS, async doc => { if (doc.data().state !== "completed") {
        // Fan out through the document trigger: a large/failed account must
        // not consume the scheduler's runtime and starve unrelated requests.
        await doc.ref.update({ retryRequestedAtMillis: now() });
      }
      else if (now() - doc.data().completedAtMillis >= 90 * DAY) {
        // Match the backup restoration-suppression window. Receipts expose
        // only status; job identity and lock metadata are removed after 90 days.
        await eraseMatches(RECEIPTS, "jobId", doc.id);
        if (doc.data().uid) await erase(lockRef(doc.data().uid));
        for (const pid of doc.data().playerIds) await erase(db.doc(`playerDeletionLocks/${pid}`));
        await erase(doc.ref);
      } });
  }
  return { request, status, listAccounts, process, runPending, sweepSubject };
}

module.exports = { createAccountDeletion, PLAYER_RECORDS, USER_RECORDS };
