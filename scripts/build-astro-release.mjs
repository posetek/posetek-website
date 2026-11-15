// Deliberate full-site application release. First run the ordinary live-drift
// guard, then replace only Astro's three declared documents. All historical
// assets and public files remain checksum protected. With
// --replace-player-signin (which needs both preservation flags) the release also
// rebuilds the isolated sign-in entry from the committed source and replaces the
// live /player-signin.html with it and its hashed assets; nothing else changes.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sha1, containedPath, assertPlainPath, mergeAstroAssets } from "./astro-assets.mjs";
import { readAstroMarketingSnapshot } from "./astro-marketing-snapshot.mjs";
import { ICON_ASSETS } from "./website-icons.mjs";
import { playerSignInAssets } from "./private-player-signin-assets.mjs";

// The standalone sign-in entry (/signin is rewritten to it). A release keeps the
// live bytes unless it explicitly replaces them with a fresh isolated build.
export const PLAYER_SIGNIN_PATH = "/player-signin.html";
export const PLAYER_SIGNIN_STAMP = ".posetek-signin-source.json";
const sha256 = value => createHash("sha256").update(value).digest("hex");

/** The committed app/ tree the isolated sign-in entry is built from; uncommitted sources never ship. */
export function playerSignInSourceStamp(root) {
  const git = args => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  const status = git(["status", "--porcelain", "--", "app"]);
  if (status.status !== 0) throw new Error("Sign-in source state could not be read");
  if (status.stdout.trim()) throw new Error("Sign-in replacement refused: app/ has uncommitted changes, so the built entry cannot be tied to a source");
  const tree = git(["rev-parse", "HEAD:app"]);
  if (tree.status !== 0 || !/^[0-9a-f]{40,64}$/.test(tree.stdout.trim())) throw new Error("Sign-in source tree could not be read");
  return tree.stdout.trim();
}

// The /signin rewrite and the private headers of both sign-in paths must stay
// exactly as they are; a replacement only changes the document and its assets.
export function playerSignInRouting(netlifyToml) {
  const blocks = netlifyToml.split(/\n(?=\[\[)/);
  const rewrite = blocks.filter(block => /^\[\[redirects\]\]/.test(block) && /from = "\/signin"/.test(block));
  if (rewrite.length !== 1 || !/to = "\/player-signin\.html"/.test(rewrite[0]) || !/status = 200/.test(rewrite[0])) throw new Error("Sign-in replacement refused: the /signin rewrite to /player-signin.html is missing or changed");
  const headers = {};
  for (const path of ["/signin", PLAYER_SIGNIN_PATH]) {
    const found = blocks.filter(block => /^\[\[headers\]\]/.test(block) && block.includes(`for = "${path}"`));
    if (found.length !== 1) throw new Error(`Sign-in replacement refused: private headers for ${path} are missing or duplicated`);
    const block = found[0].trimEnd();
    if (!/Cache-Control = "private, no-store, max-age=0"/.test(block) || !/X-Robots-Tag = "noindex/.test(block) || !/Content-Security-Policy = "default-src 'self';/.test(block)) {
      throw new Error(`Sign-in replacement refused: private headers for ${path} changed`);
    }
    headers[path] = sha256(block);
  }
  return { rewrite: sha256(rewrite[0].trimEnd()), headers };
}

/**
 * The fresh isolated sign-in build as release records: the verified document and its hashed
 * closure. Refuses a missing build, a build not stamped from the current committed source, or
 * an asset that would overwrite any protected or already-emitted file.
 */
async function preparePlayerSignIn(root, protectedFiles, output, sourceStamp) {
  const source = join(root, "app/player-signin-dist");
  let stamp;
  try { stamp = JSON.parse(await readFile(join(source, PLAYER_SIGNIN_STAMP), "utf8")); }
  catch { throw new Error("Sign-in replacement refused: no isolated sign-in build with a source stamp in app/player-signin-dist"); }
  const current = await sourceStamp(root);
  if (stamp?.appTree !== current) throw new Error("Sign-in replacement refused: the isolated sign-in build is stale against the current source");
  let closure;
  try { closure = await playerSignInAssets(source); }
  catch (error) { throw new Error("Sign-in replacement refused: " + error.message); }
  const document = closure.get(PLAYER_SIGNIN_PATH);
  if (!document) throw new Error("Sign-in replacement refused: the isolated sign-in document is missing");
  const assets = [];
  for (const [path, bytes] of closure) {
    if (path === PLAYER_SIGNIN_PATH) continue;
    if (!/^\/_astro\/[A-Za-z0-9_.-]+\.[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(path)) throw new Error("Sign-in replacement refused: unexpected dependency " + path);
    const record = { path, sha: sha1(bytes), size: bytes.length }, prior = protectedFiles.get(path.toLowerCase());
    if (prior) {
      if (prior.sha !== record.sha || prior.size !== record.size) throw new Error("Sign-in replacement refused: it would change protected file " + prior.path);
      continue;
    }
    // Neither the preserved output nor the application build may hold other bytes at this path.
    for (const [directory, label] of [[output, "release output"], [join(root, "app/astro-dist"), "application build"]]) {
      const target = containedPath(directory, path);
      await assertPlainPath(directory, target);
      try {
        const existing = await readFile(target);
        if (sha1(existing) !== record.sha || existing.length !== record.size) throw new Error(`Sign-in replacement refused: ${path} collides with the ${label}`);
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    assets.push({ ...record, bytes });
  }
  return { document: { path: PLAYER_SIGNIN_PATH, sha: sha1(document), size: document.length, bytes: document }, assets, appTree: current };
}

const entries = new Map([
  ["/index.html", "<!-- posetek-marketing-entry -->"],
  ["/coaches/index.html", "<!-- posetek-coaches-entry -->"],
  ["/application.html", "<!-- posetek-astro-application-entry -->"],
  ["/feedback.html", "<!-- posetek-feedback-entry -->"],
  ["/coach-join.html", "<!-- posetek-coach-enrollment-entry -->"],
]);

const isolatedEntries = new Set(["/feedback.html", "/coach-join.html"]);

export async function composeAstroRelease(root, { marketingSnapshot, preserveIsolatedEntries = false, replacePlayerSignIn = false, fetchImpl = fetch, sourceStamp = playerSignInSourceStamp } = {}) {
  root = resolve(root);
  const source = join(root, "app/astro-dist"), output = join(root, "production-dist");
  // Replacing the sign-in entry is an application-plus-sign-in release: every other
  // document stays exactly live, so both preservation modes are required.
  if (replacePlayerSignIn && (!marketingSnapshot || !preserveIsolatedEntries)) {
    throw new Error("Sign-in replacement refused: it requires --preserve-marketing and --preserve-isolated-entries so no other protected document changes");
  }
  const baseline = JSON.parse(await readFile(join(root, "deployment/homepage-baseline.json"), "utf8"));
  const protectedFiles = new Map(), preservedIsolated = new Map();
  for (const file of baseline.files) {
    const key = file.path.toLowerCase(), prior = protectedFiles.get(key);
    if (prior && (prior.sha !== file.sha || prior.size !== file.size)) throw new Error("Conflicting folded baseline path");
    protectedFiles.set(key, file);
    const target = resolve(output, "." + file.path);
    await assertPlainPath(output, target);
    const bytes = await readFile(target);
    if (sha1(bytes) !== file.sha || bytes.length !== file.size) throw new Error("Baseline not verified: " + file.path);
    if (preserveIsolatedEntries && isolatedEntries.has(file.path)) preservedIsolated.set(file.path, { path: file.path, sha: file.sha, size: file.size, bytes });
  }
  if (preserveIsolatedEntries && preservedIsolated.size !== isolatedEntries.size) throw new Error("Both isolated entries require verified baseline records");
  let signIn = null, routing = null;
  if (replacePlayerSignIn) {
    const previous = protectedFiles.get(PLAYER_SIGNIN_PATH);
    if (!previous || previous.path !== PLAYER_SIGNIN_PATH) throw new Error("Sign-in replacement refused: the baseline has no verified /player-signin.html to replace");
    routing = playerSignInRouting(await readFile(join(root, "netlify.toml"), "utf8"));
    signIn = { previous, ...(await preparePlayerSignIn(root, protectedFiles, output, sourceStamp)) };
  }
  const marketing = marketingSnapshot ? await readAstroMarketingSnapshot(root, marketingSnapshot, protectedFiles, { fetchImpl }) : null;
  const prepared = [];
  async function inspect(directory, prefix = "") {
    await assertPlainPath(source, directory);
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + "/" + item.name;
      if (path === "/_astro" && item.isDirectory()) continue;
      if (path === "/brand" && item.isDirectory()) { await inspect(join(directory, item.name), path); continue; }
      if (path === "/coaches" && item.isDirectory()) { await inspect(join(directory, item.name), path); continue; }
      if (item.isFile() && ICON_ASSETS.includes(path)) {
        const expected = await readFile(containedPath(source, path));
        const actual = await readFile(containedPath(output, path));
        if (sha1(expected) !== sha1(actual) || expected.length !== actual.length) throw Error("Website icon not verified: " + path);
        continue;
      }
      if (!item.isFile() || !entries.has(path)) throw new Error("Unexpected Astro release output: " + path);
      const bytes = await readFile(containedPath(source, path)), html = bytes.toString("utf8");
      if (!html.includes(entries.get(path)) || !html.includes('id="root"') || !html.includes("/_astro/") || /(?:src|href)=["']\/src\//.test(html)) throw new Error("Uncompiled Astro document: " + path);
      if (path === "/application.html" && (!html.includes('client="only"') || (html.match(/<astro-island\b/g) || []).length !== 1 || !html.includes("/marketing/home-navigation.js"))) throw new Error("Application must be one client-only root with its navigation bridge");
      if (path === "/feedback.html" && (!html.includes('client="only"') || (html.match(/<astro-island\b/g) || []).length !== 1 || /clarity|googletagmanager|google-analytics|fonts\.googleapis|home-navigation\.js/i.test(html))) throw new Error("Feedback must be an isolated client-only document");
      if (path === "/coach-join.html" && (!html.includes('client="only"') || (html.match(/<astro-island\b/g) || []).length !== 1 || /clarity|googletagmanager|google-analytics|fonts\.googleapis|home-navigation\.js/i.test(html))) throw new Error("Coach enrollment must be an isolated client-only document");
      prepared.push({ path, bytes, sha: sha1(bytes), size: bytes.length });
    }
  }
  await inspect(source);
  if (prepared.length !== entries.size) throw new Error("All declared Astro documents are required");
  if (marketing) for (const entry of marketing.documents) {
    const index = prepared.findIndex(row => row.path === entry.path);
    prepared[index] = entry;
  }
  for (const entry of preservedIsolated.values()) prepared[prepared.findIndex(row => row.path === entry.path)] = entry;
  const added = await mergeAstroAssets(source, output, [...protectedFiles.values()]);
  for (const entry of prepared) {
    const target = containedPath(output, entry.path);
    await assertPlainPath(output, target); await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, entry.bytes);
  }
  if (signIn) {
    for (const entry of [...signIn.assets, signIn.document]) {
      const target = containedPath(output, entry.path);
      await assertPlainPath(output, target); await mkdir(join(target, ".."), { recursive: true });
      try {
        const existing = await readFile(target);
        if (entry.path !== PLAYER_SIGNIN_PATH && (sha1(existing) !== entry.sha || existing.length !== entry.size)) throw new Error("Sign-in replacement refused: asset collision " + entry.path);
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      await writeFile(target, entry.bytes);
    }
  }
  let preservedFiles = 0;
  for (const file of protectedFiles.values()) {
    if (file.path === "/application.html" || signIn && file.path === PLAYER_SIGNIN_PATH || !preservedIsolated.has(file.path) && (file.path === "/feedback.html" || !marketing && entries.has(file.path))) continue;
    const bytes = await readFile(resolve(output, "." + file.path));
    if (sha1(bytes) !== file.sha || bytes.length !== file.size) throw new Error("Unrelated file changed: " + file.path);
    preservedFiles++;
  }
  const documents = prepared.map(({ bytes, ...record }) => record);
  const receipt = { framework: "astro", baselineDeploymentId: baseline.deploymentId, preservedFiles, documents, added,
    ...(marketing ? { marketingPreserved: true, marketingDeploymentId: marketing.deploymentId, marketingLiveVerification: marketing.served,
      preservedMarketing: marketing.documents.map(({ bytes, ...record }) => record) } : {}),
    ...(preserveIsolatedEntries ? { isolatedEntriesPreserved: true, preservedIsolatedEntries: [...preservedIsolated.values()].map(({ bytes, ...record }) => record) } : {}),
    ...(signIn ? {
      playerSignInReplaced: true,
      playerSignIn: { previous: { path: signIn.previous.path, sha: signIn.previous.sha, size: signIn.previous.size },
        document: { path: signIn.document.path, sha: signIn.document.sha, size: signIn.document.size },
        assets: signIn.assets.map(({ bytes, ...record }) => record), appTree: signIn.appTree, routingSha256: routing },
    } : {}),
    // What an artifact-versus-live comparison must find, and nothing else: the entries
    // this release replaces, plus new hashed assets.
    expectedChanges: {
      changed: ["/application.html", ...(signIn ? [PLAYER_SIGNIN_PATH] : []),
        ...documents.filter(entry => entry.path !== "/application.html" && !(marketing && ["/index.html", "/coaches/index.html"].includes(entry.path)) && !preservedIsolated.has(entry.path)).map(entry => entry.path)],
      added: [...new Set([...added, ...(signIn ? signIn.assets : [])].map(entry => entry.path))].sort(),
    },
    application: documents.find(entry => entry.path === "/application.html"),
    homepageSha: documents.find(entry => entry.path === "/index.html").sha,
    coachesSha: documents.find(entry => entry.path === "/coaches/index.html").sha };
  await mkdir(join(root, ".netlify"), { recursive: true });
  await writeFile(join(root, ".netlify/application-release-build.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

export function parseAstroReleaseArgs(args) {
  const options = {}, usage = "Usage: node scripts/build-astro-release.mjs [--preserve-marketing <manifest-path>] [--preserve-isolated-entries] [--replace-player-signin]";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--preserve-marketing" && !options.marketingSnapshot) {
      const path = args[++index];
      if (!path || path.startsWith("--")) throw new Error(usage);
      options.marketingSnapshot = resolve(path);
    } else if (args[index] === "--preserve-isolated-entries" && !options.preserveIsolatedEntries) options.preserveIsolatedEntries = true;
    else if (args[index] === "--replace-player-signin" && !options.replacePlayerSignIn) options.replacePlayerSignIn = true;
    else throw new Error(usage);
  }
  return options;
}

/** Builds the isolated sign-in entry from the committed source and stamps the build with that source. */
export async function buildPlayerSignIn(root, { run = spawnSync, sourceStamp = playerSignInSourceStamp } = {}) {
  const appTree = await sourceStamp(root);
  const app = join(root, "app");
  const result = run(process.execPath, [join(app, "node_modules/astro/bin/astro.mjs"), "build", "--config", "astro.player-signin.config.mjs"],
    { cwd: app, stdio: "inherit", windowsHide: true, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Isolated sign-in build failed");
  if (await sourceStamp(root) !== appTree) throw new Error("Sign-in source changed during its build");
  await writeFile(join(app, "player-signin-dist", PLAYER_SIGNIN_STAMP), JSON.stringify({ appTree }) + "\n");
  return appTree;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseAstroReleaseArgs(process.argv.slice(2));
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (options.replacePlayerSignIn && (!options.marketingSnapshot || !options.preserveIsolatedEntries)) throw new Error("--replace-player-signin requires --preserve-marketing and --preserve-isolated-entries");
  if (options.replacePlayerSignIn) playerSignInSourceStamp(root);
  const result = spawnSync(process.execPath, [join(root, "scripts/build-production.mjs")], {
    cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Ordinary preservation build failed");
  if (options.replacePlayerSignIn) await buildPlayerSignIn(root);
  const receipt = await composeAstroRelease(root, options);
  console.log(JSON.stringify({ framework: receipt.framework, preservedFiles: receipt.preservedFiles, addedAssets: receipt.added.length, documents: receipt.documents,
    ...(receipt.playerSignInReplaced ? { playerSignIn: receipt.playerSignIn } : {}), expectedChanges: receipt.expectedChanges }));
}
