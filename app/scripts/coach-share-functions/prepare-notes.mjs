import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export async function prepareCoachNotes({ privateDir, fragment, teamCount, host, modules }) {
  if (!host || !/^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(host)) {
    throw new Error("Set COACH_NOTES_HOST to the review alias hostname.");
  }
  modules ??= fileURLToPath(new URL("./node_modules", import.meta.url));
  if (basename(resolve(modules)) !== "node_modules") {
    throw new Error("Set COACH_NOTES_NODE_MODULES to the Netlify CLI node_modules containing esbuild and @netlify/blobs 11.1.7.");
  }
  const deps = resolve(modules);
  const version = JSON.parse(await readFile(join(deps, "@netlify/blobs/package.json"), "utf8")).version;
  if (version !== "11.1.7") throw new Error("This function requires @netlify/blobs 11.1.7.");
  const proof = createHash("sha256").update("coach-notes-access-v1:" + fragment).digest("base64url");
  const verifier = createHash("sha256").update(proof).digest("hex");
  const config = JSON.stringify({ host, verifier, teamCount });
  const handler = fileURLToPath(new URL("notes.mjs", import.meta.url));
  const entry = join(privateDir, "notes-entry.mjs");
  await writeFile(entry, [
    'import { getStore } from "@netlify/blobs";',
    'import { coachNotesHandler } from ' + JSON.stringify(handler) + ";",
    'export default coachNotesHandler(' + config + ', () => getStore({ name: "coach-input-v1", consistency: "strong" }));',
  ].join("\n"), { mode: 0o600, flag: "wx" });
  const functions = join(privateDir, "functions");
  await mkdir(functions, { mode: 0o700 });
  await promisify(execFile)(join(deps, "esbuild/bin/esbuild"), [
    entry, "--bundle", "--format=esm", "--platform=node", "--target=node22",
    "--outfile=" + join(functions, "coach-notes.mjs"),
  ], { env: { ...process.env, NODE_PATH: deps } });
  console.log("Private coach notes functions:", functions);
}
