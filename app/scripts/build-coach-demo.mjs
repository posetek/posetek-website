import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { coachDemoVersion, createCoachDemoSnapshot } from "./coach-demo-snapshot.mjs";
import { inlineReaderAssets } from "./standalone-coach-review.mjs";

if (process.argv.length !== 3 || !process.argv[2] || process.argv[2].startsWith("-")) {
  throw new Error("Usage: node scripts/build-coach-demo.mjs <new-output-dir>");
}
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error("Use an empty output directory for the public demo.");

const temporary = await mkdtemp(join(tmpdir(), "synthetic-coach-demo-"));
try {
  await build({
    root: fileURLToPath(new URL("../src/pages/coach-view/share/", import.meta.url)),
    configFile: false, publicDir: false, envDir: false, base: "./",
    define: {
      "import.meta.env.VITE_COACH_NOTES": JSON.stringify("demo"),
      "import.meta.env.VITE_COACH_DEMO_USAGE": JSON.stringify("0"),
    },
    build: { outDir: temporary, emptyOutDir: false, target: "es2020", sourcemap: false, modulePreload: false },
  });
  const { script, css, csp } = await inlineReaderAssets(temporary);
  const sample = JSON.stringify({ version: coachDemoVersion, snapshot: createCoachDemoSnapshot() }).replaceAll("<", "\\u003c");
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="posetek-report-kind" content="synthetic-coach-demo">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="icon" href="data:,"><title>Coach demo · Sample data | PoseTek</title><style>${css}</style></head>
<body><div id="root"><main class="locked"><p id="status" role="status">Opening the coach demo…</p>
<noscript>Enable JavaScript to explore the sample team.</noscript></main></div>
<script type="application/json" id="coach-demo-data">${sample}</script><script type="module">${script}</script></body></html>`;
  await writeFile(join(output, "index.html"), html, { flag: "wx" });
  console.log("Public synthetic coach demo:", join(output, "index.html"));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
