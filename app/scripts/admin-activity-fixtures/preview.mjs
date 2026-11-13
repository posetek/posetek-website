// Interactive local source preview only. This file is never bundled or deployed.
import assert from 'node:assert/strict';
import http from 'node:http';
import { activityFixtureDocument, firebaseFixtureModule } from './install.mjs';

const upstream = new URL(process.env.ADMIN_ACTIVITY_VITE || 'http://127.0.0.1:4196');
const port = Number(process.env.ADMIN_ACTIVITY_PREVIEW_PORT || 4197);
assert.ok(upstream.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname), 'The source Vite server must use loopback HTTP.');
assert.ok(Number.isSafeInteger(port) && port > 1024 && port < 65536);
assert.ok(port !== Number(upstream.port || 80), 'The preview proxy and Vite require separate ports.');
const origin = `http://127.0.0.1:${port}`;
const initial = '/admin/accounts?orgId=northfield&directoryLevel=teams&directoryPane=report&reportView=overview&reportStart=2026-10-07&reportEnd=2026-11-03&reportTimezone=America%2FLos_Angeles';
const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const server = http.createServer(async (request, response) => {
  const send = (status, type, body) => { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff' }); response.end(request.method === 'HEAD' ? undefined : body); };
  if (!['GET', 'HEAD'].includes(request.method || '')) return send(405, 'text/plain', 'This synthetic preview permits GET and HEAD only.');
  let target;
  try { target = new URL(request.url || '/', origin); } catch { return send(400, 'text/plain', 'Invalid local path.'); }
  if (target.origin !== origin || /^\/(?:api(?:\/|$)|__\/auth|\.netlify(?:\/|$))/.test(target.pathname)) return send(403, 'text/plain', 'External and service access is disabled in this synthetic preview.');
  if (target.pathname === '/') { response.writeHead(302, { Location: initial, 'Cache-Control': 'no-store' }); return response.end(); }
  if (target.pathname === '/src/lib/firebase.ts') return send(200, 'text/javascript', firebaseFixtureModule);
  if (request.headers.accept?.includes('text/html') && !/\.(?:[cm]?[jt]sx?|css|scss|png|svg|webp|jpg|ico)$/.test(target.pathname)) return send(200, 'text/html', activityFixtureDocument());
  try {
    const source = new URL(target.pathname + target.search, upstream.origin);
    const result = await fetch(source, { method: request.method, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (result.status >= 300 && result.status < 400) return send(502, 'text/plain', 'Upstream redirects are disabled.');
    return send(result.status, result.headers.get('content-type') || 'application/octet-stream', Buffer.from(await result.arrayBuffer()));
  } catch { return send(502, 'text/plain', 'The loopback Vite source server is unavailable. Start Vite before opening this preview.'); }
});
server.on('upgrade', (_request, socket) => socket.destroy());
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ preview: origin + initial, source: upstream.origin, safety: 'Synthetic data; loopback only; GET/HEAD only; external services and WebSockets disabled.' })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
