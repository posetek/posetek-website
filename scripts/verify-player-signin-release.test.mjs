import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyPlayerSignInRelease } from "./verify-player-signin-release.mjs";

const sha1 = value => createHash("sha1").update(value).digest("hex");
const record = (path, bytes) => ({ path, sha: sha1(bytes), size: Buffer.byteLength(bytes) });
const page = "<!-- posetek-player-signin-entry --> parent panel";
const chunk = "export const parentPanel = true;";
const receipt = { playerSignInReplaced: true, playerSignIn: { document: record("/player-signin.html", page), assets: [record("/_astro/PlayerSignInRoot.Abcd1234.js", chunk)] } };
const headers = { "content-security-policy": "default-src 'self'; connect-src 'self' https://us-central1-kickai-69dd0.cloudfunctions.net https://firestore.googleapis.com", "cache-control": "private,no-store,max-age=0" };

function site(overrides = {}) {
  const files = { "/signin": page, "/player-signin.html": page, "/_astro/PlayerSignInRoot.Abcd1234.js": chunk, ...overrides.files };
  return async url => {
    const path = new URL(url).pathname, body = files[path];
    return new Response(body ?? "missing", { status: body === undefined ? 404 : 200, headers: path.startsWith("/_astro/") ? {} : { ...headers, ...overrides.headers } });
  };
}

test("passes when /signin, /player-signin.html and every asset serve the released bytes with the private headers", async () => {
  const result = await verifyPlayerSignInRelease("https://draft--posetek.netlify.app", receipt, { fetchImpl: site() });
  assert.deepEqual(result.checked.map(row => row.path), ["/signin", "/player-signin.html", "/_astro/PlayerSignInRoot.Abcd1234.js"]);
});

test("fails on the old page, a missing asset, changed asset bytes or lost headers", async () => {
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net", receipt, { fetchImpl: site({ files: { "/signin": "old live page" } }) }), /\/signin does not serve the released sign-in document/);
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net", receipt, { fetchImpl: site({ files: { "/_astro/PlayerSignInRoot.Abcd1234.js": undefined } }) }), /answered 404/);
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net", receipt, { fetchImpl: site({ files: { "/_astro/PlayerSignInRoot.Abcd1234.js": "other" } }) }), /bytes differ/);
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net", receipt, { fetchImpl: site({ headers: { "content-security-policy": "" } }) }), /Content-Security-Policy/);
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net", receipt, { fetchImpl: site({ headers: { "cache-control": "public, max-age=60" } }) }), /private Cache-Control/);
});

test("refuses a receipt that did not replace the sign-in entry, or a non-origin URL", async () => {
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net", { application: {} }, { fetchImpl: site() }), /did not replace the sign-in entry/);
  await assert.rejects(verifyPlayerSignInRelease("https://posetek.net/signin", receipt, { fetchImpl: site() }), /origin only/);
});
