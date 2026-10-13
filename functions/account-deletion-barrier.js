"use strict";

// Wrap the Functions builder without mutating the Firebase SDK. All website
// callables (including factories and runWith builders) reject stale tokens for
// accounts whose deletion was accepted. Rules alone cannot protect Admin SDK
// writes. Public deletion-status and idempotent request handlers opt out.
function withAccountDeletionBarrier(sdk, db, HttpsError = sdk.https.HttpsError) {
  const valid = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const wrap = builder => new Proxy(builder, {
    get(target, key) {
      if (key === "runWith") return options => wrap(target.runWith(options));
      if (key !== "https") return Reflect.get(target, key);
      return new Proxy(target.https, {
        get(https, name) {
          if (name !== "onCall") return Reflect.get(https, name);
          return handler => https.onCall(async (data, context) => {
            const uid = context?.auth?.uid;
            if (valid(uid) && (await db.doc(`accountDeletionLocks/${uid}`).get()).exists) {
              throw new HttpsError("permission-denied", "This account is being deleted.");
            }
            const players = new Set([data?.playerId, data?.playerDocId, data?.playerDocumentID, data?.viewAsPlayerId].filter(valid));
            if (Array.isArray(data?.playerIds)) {
              // Existing team operations already have bounded participant lists.
              if (data.playerIds.length > 2000) throw new HttpsError("invalid-argument", "Too many players.");
              for (const pid of data.playerIds) if (valid(pid)) players.add(pid);
            }
            for (const pid of players) if ((await db.doc(`playerDeletionLocks/${pid}`).get()).exists) {
              throw new HttpsError("failed-precondition", "This player's account is being deleted.");
            }
            return handler(data, context);
          });
        },
      });
    },
  });
  return wrap(sdk);
}

module.exports = { withAccountDeletionBarrier };
