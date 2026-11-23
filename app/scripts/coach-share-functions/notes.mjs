import { createHash, timingSafeEqual } from "node:crypto";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBodyBytes = 12288;
const headers = { "Cache-Control": "private, no-store", "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" };
const reply = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers });

// A snapshot gets its own namespace and verifier. Only a complete link can derive
// both the request credential and the separate encryption key used by the browser.
export function coachNotesHandler({ host, verifier, teamCount }, openStore) {
  return async request => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const credential = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "");
    if (url.hostname !== host || (origin && origin !== "https://" + host) || !credential ||
        !timingSafeEqual(createHash("sha256").update(credential[1]).digest(), Buffer.from(verifier, "hex"))) return reply(403);
    const rawTeam = url.searchParams.get("team");
    if (!/^(0|[1-9][0-9]*)$/.test(rawTeam || "") || Number(rawTeam) >= teamCount) return reply(400);
    const prefix = verifier + "/" + rawTeam + "/";
    try {
      const store = openStore();
      if (request.method === "GET") {
        const { blobs } = await store.list({ prefix });
        const items = await Promise.all(blobs.map(async ({ key }) => {
          const sealed = await store.get(key);
          if (sealed === null) throw new Error("Missing note");
          return { id: key.slice(prefix.length), sealed };
        }));
        return reply(200, items);
      }
      if (request.method !== "POST") return reply(405);
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply(415);
      if (Number(request.headers.get("content-length")) > maximumBodyBytes) return reply(413);
      const body = await request.text();
      if (Buffer.byteLength(body) > maximumBodyBytes) return reply(413);
      let row;
      try { row = JSON.parse(body); } catch { return reply(400); }
      if (!row || Object.keys(row).sort().join(",") !== "id,sealed" || typeof row.id !== "string" ||
          !uuid.test(row.id) || typeof row.sealed !== "string" || !/^[A-Za-z0-9_-]{40,11000}$/.test(row.sealed)) return reply(400);
      const key = prefix + row.id;
      const { modified } = await store.set(key, row.sealed, { onlyIfNew: true });
      if (modified) return reply(201);
      const existing = await store.get(key);
      if (existing === null) return reply(503);
      return reply(200, { id: row.id, sealed: existing });
    } catch {
      return reply(503);
    }
  };
}
