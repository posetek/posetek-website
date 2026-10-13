"use strict";

// Exact source keys and structured identity columns only. Never match names,
// email text, substrings or arbitrary serialized cell content. Tracker seals
// describe an external workbook revision: redaction intentionally invalidates
// affected seals and holds publication until an operator reconciles that copy.
const crypto = require("node:crypto");
const { digest } = require("./issue-tracker-bridge-model");
const { MAILBOX } = require("./issue-tracker-graph-reader");
const { playerSegment } = require("./athlete-storage-paths");
const copy = value => JSON.parse(JSON.stringify(value));
const keyFor = subject => crypto.createHash("sha256").update(subject.uid ? `uid:${subject.uid}` : `player:${subject.playerIds[0]}`).digest("hex");

function createTrackerErasure({ db, now = Date.now }) {
  const writerRef = db.doc("issueTrackerState/writer");
  async function scan(collection, visit) {
    let cursor;
    for (;;) {
      let query = db.collection(collection).orderBy("__name__").limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) return;
      for (const doc of page.docs) await visit(doc);
      cursor = page.docs.at(-1).id;
    }
  }
  return async function eraseTracker(subject) {
    const jobRef = db.doc(`accountDeletionJobs/${keyFor(subject)}`);
    const prior = (await jobRef.get()).data()?.trackerErasure;
    const sources = new Set(prior?.sourceIds || []), emails = new Set(prior?.emailIds || []);
    const players = new Set(subject.playerIds || []), canonicalGroups = new Set(), providers = new Set(prior?.providerIds || []);
    const owned = value => Boolean(value && (
      subject.uid && [value.reporterUid, value.actorUid, value.uid, value.contactSnapshot?.actorUid,
        value.values?.["Recorded actor UID"]].includes(subject.uid)
      || [value.player?.id, value.contactSnapshot?.player?.id, value.values?.["Target player ID"]].some(id => players.has(id))));
    const ownRow = (group, key, value) => group === "instances" && (sources.has(key) || owned(value))
      || group === "dailyRows" && sources.has(key)
      || group === "emails" && (emails.has(key) || sources.has(value?.eventRef));

    // Capture joins before ordinary occurrence/outbox erasure. On retry the
    // job retains only opaque source IDs, never copied names, contact or cells.
    await scan("userIssueOccurrences", doc => { if (owned(doc.data())) sources.add(doc.id); });
    await scan("userIssueOutbox", doc => { if (owned(doc.data())) { sources.add(doc.id); if (typeof doc.data().providerId === "string") providers.add(doc.data().providerId); } });
    // Recover exact identities from complete legacy archives even after their
    // original documents have disappeared. Reject corrupt archives; never guess.
    await scan("issueTrackerEvidence", async doc => {
      const row = doc.data();
      if (!["backend-occurrence", "backend-outbox"].includes(row.source)) return;
      if (!playerSegment(row.sourceId)) throw new Error("Invalid tracker evidence source identity");
      if (owned(row.identity)) sources.add(row.sourceId);
      if (!row.complete) return;
      if (!Number.isSafeInteger(row.chunks) || row.chunks < 1 || row.chunks > 121) throw new Error("Invalid tracker evidence archive");
      let content = "";
      for (let i = 0; i < row.chunks; i++) {
        const chunk = (await doc.ref.collection("chunks").doc(String(i).padStart(6, "0")).get()).data();
        if (chunk?.index !== i || typeof chunk.content !== "string") throw new Error("Incomplete tracker evidence archive");
        content += chunk.content;
      }
      const value = JSON.parse(content);
      if (Buffer.byteLength(content) !== row.bytes || digest(value) !== row.sha256) throw new Error("Invalid tracker evidence archive hash");
      if (owned(value)) { sources.add(row.sourceId); if (typeof value.providerId === "string") providers.add(value.providerId); }
    });
    function discoverRow(group, key, value) {
      if (group === "instances" && owned(value) && playerSegment(key)) sources.add(key);
      if (group === "emails" && sources.has(value?.eventRef)) emails.add(key);
    }
    async function discover(collection) {
      await scan(collection, doc => { const row = doc.data(); discoverRow(row.group, row.key, row.value); });
    }
    function discoverMetadata(value) {
      for (const group of ["instances", "dailyRows", "emails"]) {
        for (const [key, row] of Object.entries(value?.rows?.[group] || {})) discoverRow(group, key, row);
      }
    }
    discoverMetadata((await db.doc("issueTrackerState/seed").get()).data());
    await discover("issueTrackerRows");
    await scan("issueTrackerBatches", async doc => {
      discoverMetadata(doc.data().nextSeedMetadata);
      for (const [group, rows] of Object.entries(doc.data().payload?.changes || {})) {
        for (const row of Array.isArray(rows) ? rows : []) discoverRow(group, row.key, row);
      }
      await discover(`${doc.ref.path}/rows`);
    });
    // A second pass resolves emails after all instance identities are known.
    await discover("issueTrackerRows");
    discoverMetadata((await db.doc("issueTrackerState/seed").get()).data());
    await scan("issueTrackerBatches", async doc => {
      discoverMetadata(doc.data().nextSeedMetadata);
      await discover(`${doc.ref.path}/rows`);
    });
    function discoverMapRelations(value) {
      for (const [key, row] of Object.entries(value?.providerOccurrences || {})) if (sources.has(row)) providers.add(key);
      for (const [key, row] of Object.entries(value?.emailCanonicalItems || {})) if (emails.has(row?.primaryId)) canonicalGroups.add(key);
    }
    discoverMapRelations((await db.doc("issueTrackerState/seed").get()).data());
    await scan("issueTrackerBatches", doc => discoverMapRelations(doc.data().nextSeedMetadata));

    async function discoverGroups(collection) {
      await scan(collection, doc => {
        const row = doc.data();
        if (row.group === "emailCanonicalItems" && emails.has(row.value?.primaryId)) canonicalGroups.add(row.key);
        for (const [key, value] of Object.entries(row.maps?.emailCanonicalItems || {})) if (emails.has(value?.primaryId)) canonicalGroups.add(key);
      });
    }
    await scan("issueTrackerIndexBases", doc => {
      for (const [key, value] of Object.entries(doc.data().maps?.providerOccurrences || {})) if (sources.has(value)) providers.add(key);
    });
    await scan("issueTrackerIndices", doc => { const row = doc.data(); if (row.group === "providerOccurrences" && sources.has(row.value)) providers.add(row.key); });
    await scan("issueTrackerQueue", doc => {
      const message = doc.data().message, join = message?.exactJoin;
      if ((["occurrenceId", "outboxId"].includes(join?.type) && sources.has(join.value)) || join?.type === "providerId" && providers.has(join.value)) {
        for (const id of [message.id, message.originalId, message.immutableId]) if (typeof id === "string") emails.add(id);
      }
    });
    await discoverGroups("issueTrackerIndexBases");
    await discoverGroups("issueTrackerIndices");
    await scan("issueTrackerBatches", doc => discoverGroups(`${doc.ref.path}/indices`));
    for (const key of sources) if (!playerSegment(key)) throw new Error("Invalid tracker source join");
    for (const key of [...emails, ...providers]) if (typeof key !== "string" || !key.trim() || key.length > 4096 || /[\u0000-\u001f]/.test(key)) throw new Error("Invalid tracker external join");
    let touched = prior?.pending === true, held = false;
    async function hold() {
      if (held) return;
      await db.runTransaction(async tx => {
        const job = await tx.get(jobRef);
        if (!job.exists) throw new Error("Tracker erasure requires a durable deletion job");
        const writer = await tx.get(writerRef);
        tx.update(jobRef, { trackerErasure: { pending: true, sourceIds: [...sources].sort(), emailIds: [...emails].sort(), providerIds: [...providers].sort(), requestedAtMillis: prior?.requestedAtMillis || now() } });
        tx.set(writerRef, { ...(writer.exists ? {} : { revision: 0 }), privacyErasurePending: true,
          privacyErasureReason: "External workbook erasure and seed reconciliation required", leaseId: null, leaseUntilMillis: 0 }, { merge: true });
      });
      touched = true; held = true;
    }
    async function remove(ref) {
      await hold();
      await db.recursiveDelete(ref);
    }
    async function rewrite(ref, transform) {
      const snapshot = await ref.get();
      if (!snapshot.exists || !transform(copy(snapshot.data()))) return;
      await hold();
      await db.runTransaction(async tx => {
        const fresh = await tx.get(ref);
        if (!fresh.exists) return;
        const next = copy(fresh.data());
        if (transform(next)) tx.set(ref, next);
      });
    }
    function maps(value) {
      if (!value || typeof value !== "object") return false;
      let changed = false;
      const drop = (group, predicate) => {
        for (const [key, row] of Object.entries(value[group] || {})) if (predicate(key, row)) { delete value[group][key]; changed = true; }
      };
      drop("outboxOccurrences", (key, row) => sources.has(key) || sources.has(row));
      drop("providerOccurrences", (_, row) => sources.has(row));
      drop("emailLinks", key => sources.has(key));
      drop("emailAliases", (_, row) => emails.has(row));
      const groups = new Set([...canonicalGroups, ...Object.entries(value.emailCanonicalItems || {}).filter(([, row]) => emails.has(row?.primaryId)).map(([key]) => key)]);
      drop("emailCanonicalItems", key => groups.has(key));
      drop("emailCanonicalAliases", (_, row) => groups.has(row));
      return changed;
    }
    function metadata(value) {
      if (!value || typeof value !== "object") return false;
      let changed = maps(value);
      for (const [group, rows] of Object.entries(value.rows || {})) {
        for (const [key, row] of Object.entries(rows || {})) if (ownRow(group, key, row)) { delete rows[key]; changed = true; }
      }
      if (changed) value.privacyErased = true;
      return changed;
    }

    const mailboxPrefix = `${MAILBOX}/`;
    await scan("issueTrackerEvidence", async doc => {
      const row = doc.data();
      if (["backend-occurrence", "backend-outbox"].includes(row.source) && sources.has(row.sourceId)
        || ["outlook", "outlook_alias_verification"].includes(row.source) && mailboxPrefix
          && row.sourceId?.startsWith(mailboxPrefix) && emails.has(row.sourceId.slice(mailboxPrefix.length))) await remove(doc.ref);
    });
    await scan("issueTrackerQueue", async doc => {
      const row = doc.data(), join = row.message?.exactJoin;
      if ((["occurrence", "outbox"].includes(row.source) && sources.has(row.sourceId))
        || [row.message?.id, row.message?.originalId, row.message?.immutableId].some(id => emails.has(id))
        || (["occurrenceId", "outboxId"].includes(join?.type) && sources.has(join.value)) || join?.type === "providerId" && providers.has(join.value)) await remove(doc.ref);
    });
    await scan("issueTrackerRows", async doc => {
      const row = doc.data(); if (ownRow(row.group, row.key, row.value)) await remove(doc.ref);
    });
    await rewrite(db.doc("issueTrackerState/seed"), metadata);
    await scan("issueTrackerIndexBases", doc => rewrite(doc.ref, value => {
      if (!maps(value.maps)) return false;
      value.privacyErased = true; return true;
    }));
    // Shards are removed by exact semantic key/value, never by digest-prefix.
    function ownedIndex(row) {
      return row.group === "outboxOccurrences" && (sources.has(row.key) || sources.has(row.value))
        || row.group === "providerOccurrences" && sources.has(row.value)
        || row.group === "emailLinks" && sources.has(row.key)
        || row.group === "emailAliases" && emails.has(row.value)
        || row.group === "emailCanonicalItems" && emails.has(row.value?.primaryId)
        || row.group === "emailCanonicalAliases" && canonicalGroups.has(row.value);
    }
    await scan("issueTrackerIndices", async doc => { if (ownedIndex(doc.data())) await remove(doc.ref); });
    await scan("issueTrackerBatches", async doc => {
      const removedRows = new Set(), removedIndices = new Set();
      await scan(`${doc.ref.path}/rows`, async row => {
        const value = row.data(); if (ownRow(value.group, value.key, value.value)) { removedRows.add(row.id); await remove(row.ref); }
      });
      await scan(`${doc.ref.path}/indices`, async row => {
        if (ownedIndex(row.data())) { removedIndices.add(row.id); await remove(row.ref); }
      });
      await rewrite(doc.ref, value => {
        let changed = metadata(value.nextSeedMetadata);
        for (const [group, rows] of Object.entries(value.payload?.changes || {})) {
          const retained = rows.filter(row => !ownRow(group, row.key, row));
          if (retained.length !== rows.length) { value.payload.changes[group] = retained; changed = true; }
        }
        for (const [field, removed] of [["seedRowIds", removedRows], ["seedIndexIds", removedIndices]]) if (Array.isArray(value[field])) {
          const retained = value[field].filter(id => !removed.has(id));
          if (retained.length !== value[field].length) { value[field] = retained; changed = true; }
        }
        if (!changed) return false;
        // The old receipt is not evidence for the redacted payload. Retain
        // unrelated cell values, but make this batch permanently non-sendable.
        value.state = "privacy-erased"; value.privacyErased = true;
        delete value.receipt; if (value.payload) delete value.payload.payloadSha256;
        delete value.seedRowsSha256; delete value.seedTransitionSha256;
        return true;
      });
    });
    return { pending: touched };
  };
}
module.exports = { createTrackerErasure };
