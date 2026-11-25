// Interactive local source preview only. This file is never bundled or deployed.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { activityFixtureDocument, firebaseFixtureModule } from './install.mjs';

const upstream = new URL(process.env.ADMIN_ACTIVITY_VITE || 'http://127.0.0.1:4196');
const port = Number(process.env.ADMIN_ACTIVITY_PREVIEW_PORT || 4197);
assert.ok(upstream.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname), 'The source Vite server must use loopback HTTP.');
assert.ok(Number.isSafeInteger(port) && port > 1024 && port < 65536);
assert.ok(port !== Number(upstream.port || 80), 'The preview proxy and Vite require separate ports.');
const origin = `http://127.0.0.1:${port}`;
const interactive = process.argv.includes('--workspace');
const fontPath = '/preview-fonts/material-symbols-outlined.woff2';
let symbols = null;
if (interactive) {
  try {
    symbols = await readFile(new URL('../../../artifacts/admin-preview-fonts/material-symbols-outlined.woff2', import.meta.url));
    const checksum = createHash('sha256').update(symbols).digest('hex');
    assert.equal(checksum, '3ae08513a06396b0258cf1d1a1091c2d336977518fb755ea5b4a13aacdbdc6ef', 'Unexpected local Material Symbols font');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const initial = interactive ? '/admin/accounts' : '/admin/accounts?orgId=northfield&directoryLevel=teams&directoryPane=report&reportView=overview&reportStart=2026-10-07&reportEnd=2026-11-03&reportTimezone=America%2FLos_Angeles';
const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const server = http.createServer(async (request, response) => {
  const send = (status, type, body) => { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff' }); response.end(request.method === 'HEAD' ? undefined : body); };
  if (!['GET', 'HEAD'].includes(request.method || '')) return send(405, 'text/plain', 'This synthetic preview permits GET and HEAD only.');
  let target;
  try { target = new URL(request.url || '/', origin); } catch { return send(400, 'text/plain', 'Invalid local path.'); }
  if (target.origin !== origin || /^\/(?:api(?:\/|$)|__\/auth|\.netlify(?:\/|$))/.test(target.pathname)) return send(403, 'text/plain', 'External and service access is disabled in this synthetic preview.');
  if (target.pathname === fontPath) return symbols ? send(200, 'font/woff2', symbols) : send(404, 'text/plain', 'The optional local font is unavailable.');
  if (target.pathname === '/') { response.writeHead(302, { Location: initial, 'Cache-Control': 'no-store' }); return response.end(); }
  // The simulated session runs the real InsightsWorkspace. Forward its established
  // admin role to the normal shell, with the same sample-data label as other routes.
  if (interactive && target.pathname === '/src/pages/insights/AdminInsightsLayout.tsx' && !target.searchParams.has('fixture-original')) {
    return send(200, 'text/javascript', [
      "import React from '/@id/react';",
      "export * from '/src/pages/insights/AdminInsightsLayout.tsx?fixture-original';",
      "import Layout from '/src/pages/insights/AdminInsightsLayout.tsx?fixture-original';",
      "export default function SampleInsightsLayout(props) { return React.createElement(Layout, { ...props, preview: true }); }",
    ].join('\n'));
  }
  if (target.pathname === '/src/lib/firebase.ts') {
    const module = interactive ? "export { auth, db, cloud, storage, directorySource, default } from '/scripts/admin-activity-fixtures/workspace-data.ts';" : firebaseFixtureModule;
    return send(200, 'text/javascript', module);
  }
  if (request.headers.accept?.includes('text/html') && !/\.(?:[cm]?[jt]sx?|css|scss|png|svg|webp|jpg|ico)$/.test(target.pathname)) return send(200, 'text/html', activityFixtureDocument(interactive, symbols ? fontPath : undefined));
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
