import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const actions = new Set(["open", "team", "standings-test", "one-pager", "notes", "messages", "recipient", "group", "send-one", "send-all"]);

// Configuration is generated per private demo and stays in the server bundle.
export function collector({ host, linkId, proofHash, teamCount }) {
  return async request => {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (request.headers.get("origin") !== "https://" + host || new URL(request.url).hostname !== host) {
      return new Response(null, { status: 403 });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
    const raw = await request.text();
    if (raw.length > 512) return new Response(null, { status: 413 });
    let e;
    try { e = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
    if (!e || Object.keys(e).sort().join(",") !== "action,proof,seq,team,visit" || !actions.has(e.action) ||
        !Number.isInteger(e.team) || e.team < 0 || e.team >= teamCount ||
        !Number.isInteger(e.seq) || e.seq < 1 || e.seq > 500 ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(e.visit) || !/^[a-f0-9]{64}$/.test(e.proof)) {
      return new Response(null, { status: 400 });
    }
    if (createHash("sha256").update(e.proof).digest("hex") !== proofHash) return new Response(null, { status: 403 });
    const key = [linkId, new Date().toISOString().slice(0, 10), e.visit, e.seq, e.team, e.action].join("/");
    await getStore("coach-demo-usage-v1").set(key, new Date().toISOString(), { onlyIfNew: true });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  };
}
