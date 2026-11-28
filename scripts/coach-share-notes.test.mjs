import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { coachNotesHandler } from "../app/scripts/coach-share-functions/notes.mjs";

const host = "review--posetek.netlify.app";
const proof = randomBytes(32).toString("base64url");
const hash = value => createHash("sha256").update(value).digest("hex");

function fixture() {
  const entries = new Map();
  const store = {
    list: async ({ prefix }) => ({ blobs: Array.from(entries.keys()).filter(k => k.startsWith(prefix)).map(key => ({ key })) }),
    get: async key => entries.get(key) ?? null,
    set: async (key, value, options) => {
      assert.equal(options.onlyIfNew, true);
      if (entries.has(key)) return { modified: false };
      entries.set(key, value);
      return { modified: true };
    },
  };
  const handler = coachNotesHandler({ host, verifier: hash(proof), teamCount: 2 }, () => store);
  const send = (team, row, token = proof, origin = "https://" + host) => handler(new Request(
    "https://" + host + "/.netlify/functions/coach-notes?team=" + team,
    { method: row ? "POST" : "GET", body: row && JSON.stringify(row),
      headers: { Authorization: "Bearer " + token, Origin: origin, "Content-Type": "application/json" } }));
  return { send, entries };
}

const envelope = () => ({ id: randomUUID(), sealed: randomBytes(80).toString("base64url") });

test("denies unauthorized read and write, foreign origin, invalid team, and plaintext payload", async () => {
  const { send, entries } = fixture();
  assert.equal((await send(0, undefined, "invalid")).status, 403);
  assert.equal((await send(0, envelope(), randomBytes(32).toString("base64url"))).status, 403);
  assert.equal((await send(0, envelope(), proof, "https://other.example")).status, 403);
  assert.equal((await send(2, envelope())).status, 400);
  assert.equal((await send(0, { ...envelope(), comment: "plaintext" })).status, 400);
  assert.equal(entries.size, 0);
});

test("concurrent distinct submissions survive, retries return original ciphertext, teams remain separate", async () => {
  const { send } = fixture();
  const left = envelope(), right = envelope();
  const results = await Promise.all([send(0, left), send(0, right), send(0, { ...left, sealed: envelope().sealed }), send(1, left)]);
  assert.deepEqual(results.map(result => result.status), [201, 201, 200, 201]);
  assert.deepEqual(await results[2].json(), left);
  assert.deepEqual(await (await send(0)).json(), [left, right]);
  assert.deepEqual(await (await send(1)).json(), [left]);
});
