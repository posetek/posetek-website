import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [host, fragmentFile, count, privateDir] = process.argv.slice(2);
if (!privateDir || !/^[a-z0-9-]+\.netlify\.app$/.test(host) || !/^[1-9]\d*$/.test(count)) {
  throw new Error("Usage: node prepare-function.mjs <demo-hostname> <fragment-file> <team-count> <new-private-function-dir>");
}
const fragment = (await readFile(fragmentFile, "utf8")).trim();
if (!/^[a-zA-Z0-9_-]{43}$/.test(fragment)) throw new Error("Invalid demo fragment file.");
const hash = text => createHash("sha256").update(text).digest("hex");
const config = { host, linkId: hash(host).slice(0, 24), proofHash: hash(hash("coach-usage-v1:" + fragment)), teamCount: Number(count) };
await mkdir(privateDir, { mode: 0o700 });
const functions = join(privateDir, "functions");
await mkdir(functions);
await copyFile(new URL("collector.mjs", import.meta.url), join(privateDir, "collector.mjs"));
await writeFile(join(privateDir, "package.json"), JSON.stringify({ private: true, dependencies: { "@netlify/blobs": "11.1.7" } }));
await writeFile(join(functions, "coach-usage.mjs"),
  'import { collector } from "../collector.mjs";\nexport default collector(' + JSON.stringify(config) + ');\n');
