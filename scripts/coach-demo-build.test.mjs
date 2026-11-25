import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { coachDemoVersion, createCoachDemoSnapshot } from "../app/scripts/coach-demo-snapshot.mjs";

const execute = promisify(execFile);
const app = fileURLToPath(new URL("../app/", import.meta.url));

test("builds one offline-capable public page using only the generated roster", async t => {
  const output = await mkdtemp(join(tmpdir(), "test-public-coach-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  await execute(process.execPath, ["scripts/build-coach-demo.mjs", output], {
    cwd: app, env: { ...process.env, VITE_COACH_NOTES: "1", VITE_COACH_DEMO_USAGE: "1" },
  });
  assert.deepEqual(await readdir(output), ["index.html"]);
  const page = await readFile(join(output, "index.html"), "utf8");
  const data = page.match(/<script type="application\/json" id="coach-demo-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data), { version: coachDemoVersion, snapshot: createCoachDemoSnapshot() });
  assert.match(page, /<meta name="posetek-report-kind" content="synthetic-coach-demo">/);
  const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(page.includes("script-src 'sha256-" + hash + "'"));
  assert.ok(page.includes("connect-src 'none'"));
  assert.doesNotMatch(page, /<script[^>]*\ssrc=|<(?:iframe|link)[^>]+https?:|offline-report|\/\.netlify\/functions\/|view\.bin/);
});

test("keeps private data outside the public build entry point and preserves existing output", async t => {
  const output = await mkdtemp(join(tmpdir(), "test-public-coach-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const input = join(output, "sample.json");
  await writeFile(input, "{}");
  await assert.rejects(execute(process.execPath, ["scripts/build-coach-demo.mjs", output, input], { cwd: app }), /Usage:/);
  await assert.rejects(execute(process.execPath, ["scripts/build-coach-demo.mjs", output], { cwd: app }), /empty output directory/);
  await assert.rejects(execute(process.execPath, ["scripts/build-coach-share.mjs", input], {
    cwd: app, env: { ...process.env, VITE_COACH_NOTES: "demo" },
  }), /synthetic coach demo/);
  assert.deepEqual(await readdir(output), ["sample.json"]);
});
