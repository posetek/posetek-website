"use strict";
// Explicit cross-repository lane. A missing canonical source is a failure.
// This file deliberately does not match the self-contained *.test.js CI glob.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const FRONTEND = path.join(__dirname, "..", "app", "src", "pages", "admin", "lib", "__fixtures__", "device-performance-v1");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function listFiles(root, prefix = "") {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .flatMap((entry) => (entry.isDirectory() ? listFiles(root, path.join(prefix, entry.name)) : [path.join(prefix, entry.name)]))
    .sort();
}
// The pin covers the executable contract only: schema.json and fixtures/**.
// README.md is refreshed by copy but never hashed, so a prose-only change on
// mobile never fails this repository (decision D-2026-09-29-24, as D-20 F2).
function pinnedContractFiles(root) {
  return listFiles(root).filter((file) => file === "schema.json" || file.startsWith(`fixtures${path.sep}`));
}

test("the frontend schema and fixtures match canonical mobile bytes and the pinned digest table", () => {
  const repo = process.env.POSETEK_MOBILE_REPO || path.resolve(__dirname, "..", "..", "PoseTek-mobile-app");
  const canonical = path.join(repo, "tools", "contracts", "device-performance-v1");
  if (!fs.existsSync(path.join(canonical, "schema.json"))) {
    assert.fail(`Canonical device-performance contract not found at ${canonical}. Set POSETEK_MOBILE_REPO to the reviewed source; frontend parity fails rather than skips.`);
  }
  const files = pinnedContractFiles(canonical);
  assert.deepEqual(pinnedContractFiles(FRONTEND), files, "frontend schema and fixture names match canonical source");
  for (const file of files) {
    assert.equal(sha256File(path.join(FRONTEND, file)), sha256File(path.join(canonical, file)), `${file} differs in frontend copy`);
  }
  const digests = JSON.parse(fs.readFileSync(path.join(__dirname, 'device-performance-contract-digests.json'), 'utf8'));
  assert.ok(Object.keys(digests).length >= 19, "pinned digest table covers the contract files");
  for (const [file, digest] of Object.entries(digests)) {
    assert.equal(sha256File(path.join(FRONTEND, file)), digest, `${file} differs from pinned digest`);
  }
});
