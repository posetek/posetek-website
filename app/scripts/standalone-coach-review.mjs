import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function inlineReaderAssets(publishDir) {
  const assets = join(publishDir, "assets");
  const files = await readdir(assets);
  const scripts = files.filter(name => name.endsWith(".js"));
  const styles = files.filter(name => name.endsWith(".css"));
  if (scripts.length !== 1 || styles.length !== 1) throw new Error("Expected one standalone reader script and stylesheet.");
  const script = (await readFile(join(assets, scripts[0]), "utf8")).replace(/<\/script/gi, "<\\/script");
  const css = await readFile(join(assets, styles[0]), "utf8");
  const hash = createHash("sha256").update(script).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  return { script, css, csp };
}

// This private file carries its own decryption key. Keep it outside the publish directory.
export async function writeOfflineReview(privateDir, publishDir, key, encrypted) {
  const { script, css, csp } = await inlineReaderAssets(publishDir);
  const data = JSON.stringify({ key: key.toString("base64url"), snapshot: encrypted.toString("base64") });
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Offline coach review | PoseTek</title><style>${css}</style></head>
<body><div id="root"><main class="locked"><p id="status" role="status">Opening your offline team review…</p></main></div>
<script type="application/json" id="offline-report">${data}</script><script type="module">${script}</script></body></html>`;
  await writeFile(join(privateDir, "offline.html"), html, { mode: 0o600, flag: "wx" });
}
