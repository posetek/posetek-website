// Add one isolated coach entry to the exact currently served website. The app,
// marketing, feedback and held policy candidate retain their publication gates.
import { readFile, writeFile, readdir, mkdir, rm, copyFile } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "app/package.json"));
const lexer = require("es-module-lexer"); await lexer.init;
const run = resolve(root, process.argv[2] || ""), output = join(root, "production-dist"), source = join(root, "app/astro-dist");
if (!relative(join(root, ".netlify"), run) || relative(join(root, ".netlify"), run).startsWith("..") || isAbsolute(relative(join(root, ".netlify"), run))) throw Error("Use a private .netlify release directory");
const before = JSON.parse(await readFile(join(run, "before-inventory.json"), "utf8"));
const baseline = JSON.parse(await readFile(join(root, "deployment/homepage-baseline.json"), "utf8"));
if (!before.length || before.some(row => row.deploy_id !== baseline.deploymentId) || before.some(row => row.path === "/coach-join.html")) throw Error("This additive release requires a fresh predecessor inventory");
const result = spawnSync(process.execPath, [join(root, "scripts/build-production.mjs")], { cwd: root, stdio: "inherit", windowsHide: true });
if (result.status !== 0 || result.error) throw Error("Guarded preservation build failed");
const sha = data => createHash("sha1").update(data).digest("hex");
function contained(dir, filename) { const target = resolve(dir, "." + filename), rel = relative(dir, target); if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw Error("Path escapes artifact"); return target; }
for (const filename of ["/index.html", "/coaches/index.html", "/feedback.html"]) {
  const bytes = await readFile(contained(join(run, "approved-public"), filename)), expected = before.find(row => row.path === filename);
  if (!expected || bytes.length !== expected.size || sha(bytes) !== expected.sha) throw Error("Approved public document differs");
  await copyFile(contained(join(run, "approved-public"), filename), contained(output, filename));
}
const closure = new Set(), pending = ["/coach-join.html"];
while (pending.length) {
  const filename = pending.pop(); if (closure.has(filename)) continue;
  if (filename !== "/coach-join.html" && !/^\/_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(filename)) throw Error("Unexpected coach dependency: " + filename);
  const bytes = await readFile(contained(source, filename)), text = bytes.toString("utf8"); closure.add(filename);
  if (filename === "/coach-join.html" && (!text.includes("<!-- posetek-coach-enrollment-entry -->") || !text.includes("__posetekCoachInvite") || (text.match(/<astro-island\b/g) || []).length !== 1 || /clarity|google-analytics|googletagmanager|home-navigation\.js|fonts\.googleapis/i.test(text))) throw Error("Coach entry isolation differs");
  const references = filename.endsWith(".html")
    ? [...text.matchAll(/["'](\/_astro\/[A-Za-z0-9_.-]+\.(?:js|css))["']/g)].map(match => match[1])
    : filename.endsWith(".js") ? lexer.parse(text)[0].filter(entry => entry.n).map(entry => entry.n) : [];
  // Vite's preload map includes CSS alongside JS imports. Only generated files
  // in that map count; arbitrary strings inside the Auth SDK are not imports.
  if (filename.endsWith(".js")) for (const match of text.matchAll(/["']((?:\.\/)?[A-Za-z0-9_.-]+\.css)["']/g)) references.push(match[1]);
  for (const reference of references) {
    const dependency = reference.startsWith("/") ? reference : posix.resolve(posix.dirname(filename), reference);
    if (!dependency.startsWith("/_astro/")) throw Error("Coach module has an undeclared runtime dependency");
    if (!closure.has(dependency)) pending.push(dependency);
  }
}
const protectedPaths = new Set(before.map(row => row.path.toLowerCase()));
async function clean(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = prefix + "/" + entry.name, target = contained(output, filename);
    if (entry.isSymbolicLink()) throw Error("Linked artifact path");
    if (entry.isDirectory()) await clean(target, filename);
    else if (!protectedPaths.has(filename.toLowerCase()) && !closure.has(filename)) await rm(target);
  }
}
await clean(output);
for (const filename of closure) {
  const bytes = await readFile(contained(source, filename)), prior = before.find(row => row.path.toLowerCase() === filename.toLowerCase());
  if (prior && (sha(bytes) !== prior.sha || bytes.length !== prior.size)) throw Error("Coach dependency collides with protected predecessor bytes");
  await mkdir(dirname(contained(output, filename)), { recursive: true }); await writeFile(contained(output, filename), bytes);
}
for (const row of before.filter(row => row.path !== "/netlify.toml")) {
  const bytes = await readFile(contained(output, row.path)); if (bytes.length !== row.size || sha(bytes) !== row.sha) throw Error("A predecessor file changed: " + row.path);
}
const receipt = { previousDeploymentId: baseline.deploymentId, preservedFiles: before.length - 1, newEntry: "/coach-join.html", dependencyClosure: [...closure].sort(), appEntryUnchanged: true, publicDocumentsUnchanged: true, policyCandidateNotPublished: true };
await writeFile(join(run, "build-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
