import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const policy = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
};
const notesPath = "/.netlify/functions/coach-notes";
const maxBody = 12288;
const readerAsset = /^assets\/index-[A-Za-z0-9_-]{8,64}\.(?:js|css)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types = { html: "text/html; charset=utf-8", txt: "text/plain; charset=utf-8", bin: "application/octet-stream", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8" };

export async function readPublishTree(directory) {
  const top = await readdir(directory, { withFileTypes: true });
  const rootFiles = ["_headers", "assets", "index.html", "robots.txt", "view.bin"];
  if (top.length !== rootFiles.length || top.some(entry => !rootFiles.includes(entry.name) ||
      (entry.name === "assets" ? !entry.isDirectory() : !entry.isFile()))) {
    throw new Error("Unexpected review publish tree.");
  }
  const rules = (await readFile(join(directory, "_headers"), "utf8")).trim().split(/\r?\n/).map(line => line.trim());
  const expected = Object.entries(policy).map(([key, value]) => key + ": " + value);
  if (rules.shift() !== "/*" || rules.length !== expected.length || expected.some(rule => !rules.includes(rule))) {
    throw new Error("Unexpected review response headers.");
  }
  const html = await readFile(join(directory, "index.html"), "utf8");
  const assets = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map(match => match[1]);
  const disk = await readdir(join(directory, "assets"), { withFileTypes: true });
  if (assets.length !== 2 || !assets.some(name => name.endsWith(".css")) || !assets.some(name => name.endsWith(".js")) ||
      !assets.every(name => readerAsset.test(name)) || disk.length !== assets.length ||
      disk.some(entry => !entry.isFile() || !assets.includes("assets/" + entry.name))) {
    throw new Error("Unexpected review assets.");
  }
  const files = new Map();
  for (const name of ["index.html", "robots.txt", "view.bin", ...assets]) {
    const bytes = await readFile(join(directory, name));
    files.set("/" + name, { bytes, type: types[name.split(".").pop()] });
  }
  files.set("/", files.get("/index.html"));
  return files;
}

function finish(res, status) {
  res.writeHead(status, { ...policy, "Content-Type": "application/json" }).end();
}

async function getEnvelope(req) {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") return { status: 415 };
  if (Number(req.headers["content-length"]) > maxBody) return { status: 413 };
  let total = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    total += chunk.length;
    if (total > maxBody) return { status: 413 };
    chunks.push(chunk);
  }
  let row;
  try { row = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return { status: 400 }; }
  if (!row || Object.keys(row).sort().join(",") !== "id,sealed" || typeof row.id !== "string" || !uuid.test(row.id) ||
      typeof row.sealed !== "string" || !/^[A-Za-z0-9_-]{40,11000}$/.test(row.sealed)) return { status: 400 };
  return { body: JSON.stringify({ id: row.id, sealed: row.sealed }) };
}

export function reviewHost({ files, notesHost, reviewHostName, fetchNotes = fetch }) {
  if (!/^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(notesHost) ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(reviewHostName)) {
    throw new Error("Set the exact original notes hostname and review hostname.");
  }
  const origin = "https://" + reviewHostName;
  const notesOrigin = "https://" + notesHost;
  return createServer(async (req, res) => {
    try {
      const pathname = req.url.split("?", 1)[0];
      if (pathname !== notesPath) {
        const file = files.get(pathname);
        if (!file) return finish(res, 404);
        if (req.method !== "GET" && req.method !== "HEAD") return finish(res, 405);
        res.writeHead(200, { ...policy, "Content-Type": file.type, "Content-Length": file.bytes.length });
        return res.end(req.method === "HEAD" ? undefined : file.bytes);
      }
      if (req.method !== "GET" && req.method !== "POST") return finish(res, 405);
      const caller = req.headers.origin;
      const site = req.headers["sec-fetch-site"];
      if (req.headers.host !== reviewHostName || (caller !== undefined && caller !== origin) ||
          (req.method === "POST" && caller !== origin) || (site !== undefined && site !== "same-origin")) return finish(res, 403);
      const bearer = req.headers.authorization;
      if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer ?? "")) return finish(res, 403);
      const query = req.url.slice(pathname.length + 1);
      const team = /^team=(0|[1-9][0-9]*)$/.exec(query)?.[1];
      if (team === undefined || !Number.isSafeInteger(Number(team))) return finish(res, 400);
      if (req.method === "GET" && (req.headers["transfer-encoding"] || Number(req.headers["content-length"]) > 0)) return finish(res, 400);
      const headers = { Authorization: bearer, Origin: notesOrigin };
      let body;
      if (req.method === "POST") {
        const envelope = await getEnvelope(req);
        if (envelope.status) return finish(res, envelope.status);
        body = envelope.body;
        headers["Content-Type"] = "application/json";
      }
      const upstream = await fetchNotes(notesOrigin + notesPath + "?team=" + team, {
        method: req.method, headers, body, redirect: "error", signal: AbortSignal.timeout(20000),
      });
      if (upstream.status !== 200) {
        await upstream.body?.cancel();
        return finish(res, upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status);
      }
      if (upstream.headers.get("content-type")?.split(";")[0] !== "application/json" || !upstream.body) {
        await upstream.body?.cancel();
        return finish(res, 502);
      }
      res.writeHead(200, { ...policy, "Content-Type": "application/json" });
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch {
      if (!res.headersSent) finish(res, 502);
      else res.destroy();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await readPublishTree(fileURLToPath(new URL("./publish/", import.meta.url)));
  if (!process.argv.includes("--check")) {
    reviewHost({ files, notesHost: process.env.COACH_NOTES_HOST, reviewHostName: process.env.COACH_REVIEW_HOST })
      .listen(Number(process.env.PORT || 8080), "0.0.0.0");
  }
}
