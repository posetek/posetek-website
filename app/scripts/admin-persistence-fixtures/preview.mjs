// Loopback-only synthetic preview; no production build input.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from '../../node_modules/vite/dist/node/index.js';
import { activityFixtureDocument } from '../admin-activity-fixtures/install.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
assert.ok(process.env.ADMIN_PERSISTENCE_CACHE, 'Set ADMIN_PERSISTENCE_CACHE to a verified, isolated external cache directory.');
const port = Number(process.env.ADMIN_PERSISTENCE_PORT || 4278);
assert.ok(Number.isSafeInteger(port) && port > 1024 && port < 65536);
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(process.env.ADMIN_PERSISTENCE_CACHE), server: { host: '127.0.0.1', port, strictPort: true }, plugins: [{ name: 'synthetic-persistence-boundary', configureServer(vite) { vite.middlewares.use((request, response, next) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.statusCode = 405; response.end('Synthetic reads only.'); return; }
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  let body, contentType;
  if (url.pathname === '/src/lib/firebase.ts') { contentType = 'text/javascript'; body = "export { auth, db, cloud, storage, directorySource, default } from '/scripts/admin-persistence-fixtures/runtime.ts';"; }
  if (request.headers['sec-fetch-dest'] === 'document' || request.headers.accept?.includes('text/html')) { contentType = 'text/html'; body = activityFixtureDocument(); }
  if (body === undefined) return next();
  response.setHeader('Content-Type', contentType); response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
  response.end(request.method === 'HEAD' ? undefined : body);
}); } }] });
await server.listen(); console.log(`Synthetic persistence preview http://127.0.0.1:${port}${'/admin/accounts?orgId=northfield&directoryLevel=teams'}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
