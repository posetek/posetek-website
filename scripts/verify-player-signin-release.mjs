// Post-deploy check for a release built with --replace-player-signin: /signin and
// /player-signin.html on the given host serve exactly the receipt's sign-in document, with the
// private sign-in headers, and every hashed asset of its closure loads byte-exact. Read-only.
//   node scripts/verify-player-signin-release.mjs <https-origin> [receipt-path]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha1 = bytes => createHash("sha1").update(bytes).digest("hex");

export async function verifyPlayerSignInRelease(origin, receipt, { fetchImpl = fetch } = {}) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol) || base.pathname !== "/" || base.search || base.hash) throw new Error("Give the site origin only, for example https://posetek.net");
  if (receipt?.playerSignInReplaced !== true || receipt.playerSignIn?.document?.path !== "/player-signin.html") throw new Error("This receipt did not replace the sign-in entry");
  const { document, assets } = receipt.playerSignIn;
  const read = async path => {
    const response = await fetchImpl(new URL(path, base), { cache: "no-store", redirect: "manual", headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(30000) });
    return { response, bytes: Buffer.from(await response.arrayBuffer()) };
  };
  const checked = [];
  for (const path of ["/signin", "/player-signin.html"]) {
    const { response, bytes } = await read(path);
    if (response.status !== 200) throw new Error(`${path} answered ${response.status}`);
    if (sha1(bytes) !== document.sha || bytes.length !== document.size) throw new Error(`${path} does not serve the released sign-in document (${sha1(bytes)} ${bytes.length}, expected ${document.sha} ${document.size})`);
    const csp = response.headers.get("content-security-policy") || "", cache = response.headers.get("cache-control") || "";
    if (!csp.startsWith("default-src 'self';") || !csp.includes("https://us-central1-kickai-69dd0.cloudfunctions.net") || !csp.includes("https://firestore.googleapis.com")) throw new Error(`${path} lost its sign-in Content-Security-Policy`);
    if (!/private/.test(cache) || !/no-store/.test(cache)) throw new Error(`${path} lost its private Cache-Control`);
    checked.push({ path, sha: document.sha });
  }
  for (const asset of assets) {
    const { response, bytes } = await read(asset.path);
    if (response.status !== 200) throw new Error(`${asset.path} answered ${response.status}`);
    if (sha1(bytes) !== asset.sha || bytes.length !== asset.size) throw new Error(`${asset.path} bytes differ from the release`);
    checked.push({ path: asset.path, sha: asset.sha });
  }
  return { origin: base.origin, document: document.sha, checked };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [origin, receiptPath = ".netlify/application-release-build.json"] = process.argv.slice(2);
  if (!origin) throw new Error("Usage: node scripts/verify-player-signin-release.mjs <https-origin> [receipt-path]");
  const receipt = JSON.parse(await readFile(resolve(receiptPath), "utf8"));
  const result = await verifyPlayerSignInRelease(origin, receipt);
  console.log(JSON.stringify({ ...result, verified: result.checked.length }, null, 2));
}
