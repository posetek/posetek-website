"use strict";
const { playerSegment } = require("./athlete-storage-paths");

// Pass the current transaction at every write/claim boundary. A direct read is
// useful immediately before an external request, but cannot recall an in-flight
// request already accepted by a provider.
async function deletionLocked(db, tx, subject = {}) {
  const uids = new Set([subject.uid, subject.actorUid, subject.reporterUid, subject.authenticationUID,
    subject.userUID, subject.contactSnapshot?.actorUid].filter(playerSegment));
  const players = new Set([subject.playerId, subject.player?.id, subject.contactSnapshot?.player?.id].filter(playerSegment));
  for (const [root, ids] of [["accountDeletionLocks", uids], ["playerDeletionLocks", players]]) {
    for (const id of ids) {
      const ref = db.doc(`${root}/${id}`);
      if ((await (tx ? tx.get(ref) : ref.get())).exists) return true;
    }
  }
  return false;
}
module.exports = { deletionLocked };
