import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { coachNotesHandler } from "../app/scripts/coach-share-functions/notes.mjs";
import { readPublishTree, reviewHost } from "../app/scripts/coach-review-host/server.mjs";

const notesHost = "synthetic--example.netlify.app";
const reviewHostName = "synthetic.example";
const route = "/.netlify/functions/coach-notes?team=0";
const origin = "https://" + reviewHostName;
const policyFile = new URL("../app/src/pages/coach-view/share/public/_headers", import.meta.url);

async function fixture(t) {
  const proof = randomBytes(32).toString("base64url");
  const rows = new Map();
  const calls = [];
  const upstream = coachNotesHandler({
    host: notesHost, teamCount: 2, verifier: createHash("sha256").update(proof).digest("hex"),
  }, () => ({
    list: async ({ prefix }) => ({ blobs: [...rows.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }),
    get: async key => rows.get(key) ?? null,
    set: async (key, value) => {
      if (rows.has(key)) return { modified: false };
      rows.set(key, value);
      return { modified: true };
    },
  }));

  const directory = await mkdtemp(join(tmpdir(), "fictional-review-host-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = randomBytes(200);
  await mkdir(join(directory, "assets"));
  await Promise.all([
    copyFile(policyFile, join(directory, "_headers")),
    writeFile(join(directory, "index.html"), '<script src="./assets/index-1234abcd.js"></script><link href="./assets/index-1234abcd.css">'),
    writeFile(join(directory, "assets/index-1234abcd.js"), "/* synthetic */"),
    writeFile(join(directory, "assets/index-1234abcd.css"), "/* synthetic */"),
    writeFile(join(directory, "robots.txt"), "User-agent: *\nDisallow: /\n"),
    writeFile(join(directory, "view.bin"), bytes),
  ]);
  const files = await readPublishTree(directory);
  const server = reviewHost({ files, notesHost, reviewHostName, fetchNotes: async (url, options) => {
    const req = new Request(url, options);
    calls.push({ url: req.url, method: req.method, headers: Object.fromEntries(req.headers) });
    assert.equal(req.redirect, "error");
    return upstream(req);
  } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  function send({ path = route, method = "GET", body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: server.address().port, path, method,
        headers: { Host: reviewHostName, Authorization: "Bearer " + proof, ...headers } }, res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }
  return { proof, send, calls, directory, bytes };
}

test("preserves the bound encrypted notes and their retry semantics", async t => {
  const { proof, send, calls } = await fixture(t);
  const first = { id: randomUUID(), sealed: randomBytes(95).toString("base64url") };
  const headers = { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", Cookie: "private=fictional" };
  const post = row => send({ method: "POST", body: JSON.stringify(row), headers });
  assert.equal((await post(first)).status, 201);
  const duplicate = await post({ ...first, sealed: randomBytes(95).toString("base64url") });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(JSON.parse(duplicate.body), first);
  const list = await send();
  assert.equal(list.status, 200);
  assert.deepEqual(JSON.parse(list.body), [first]);
  assert.deepEqual(JSON.parse((await send({ path: route.replace("team=0", "team=1") })).body), []);
  assert.equal((await send({ headers: { Authorization: "Bearer " + randomBytes(32).toString("base64url") } })).status, 403);
  assert.deepEqual(calls[0], { method: "POST", url: "https://" + notesHost + route,
    headers: { authorization: "Bearer " + proof, "content-type": "application/json", origin: "https://" + notesHost } });
  assert.equal(list.headers["cache-control"], "private, no-store");
});

test("rejects foreign origins, unrelated routes, incorrect teams and malformed notes", async t => {
  const { send, calls } = await fixture(t);
  const post = { method: "POST", body: "{}", headers: { "Content-Type": "application/json", Origin: origin } };
  for (const [options, status] of [
    [{ headers: { Origin: "https://foreign.example" } }, 403],
    [{ headers: { Host: "foreign.example" } }, 403],
    [{ headers: { "Sec-Fetch-Site": "cross-site" } }, 403],
    [{ headers: { Authorization: "" } }, 403],
    [{ ...post, headers: { "Content-Type": "application/json" } }, 403],
    [{ ...post, headers: { Origin: "https://foreign.example" } }, 403],
    [{ method: "DELETE" }, 405],
    [{ path: route + "&extra=1" }, 400],
    [{ path: route + "?else" }, 400],
    [{ path: route + "1" }, 400],
    [{ ...post, headers: { Origin: origin, "Content-Type": "text/plain" } }, 415],
    [{ ...post, body: "invalid" }, 400],
    [{ ...post, body: JSON.stringify({ id: randomUUID(), sealed: "z".repeat(60), text: "plaintext" }) }, 400],
    [{ ...post, body: "a".repeat(12289) }, 413],
  ]) assert.equal((await send(options)).status, status);
  assert.equal(calls.length, 0);
});

test("only returns the approved static routes with their bytes and private headers intact", async t => {
  const { directory, send, bytes, calls } = await fixture(t);
  const root = await send({ path: "/" });
  const file = await send({ path: "/view.bin" });
  assert.deepEqual(file.body, bytes);
  assert.deepEqual(root.body, await readFile(join(directory, "index.html")));
  assert.equal(file.headers["content-type"], "application/octet-stream");
  assert.equal(root.headers["referrer-policy"], "no-referrer");
  assert.match(root.headers["content-security-policy"], /frame-ancestors 'none'/);
  for (const path of ["/fragment.key", "/offline.html", "/_headers", "/x", "/assets/index-unlisted.js"]) {
    assert.equal((await send({ path })).status, 404);
  }
  const head = await send({ path: "/view.bin", method: "HEAD" });
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers["content-length"]), bytes.length);
  assert.equal(calls.length, 0);
  await writeFile(join(directory, "fragment.key"), "fictional");
  await assert.rejects(readPublishTree(directory), /Unexpected review publish tree/);
});
