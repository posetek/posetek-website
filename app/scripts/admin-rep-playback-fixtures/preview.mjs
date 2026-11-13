// Loopback-only Vite source preview. Only invented in-memory data is served.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
import { createServer } from '../../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = process.env.ADMIN_REP_PLAYBACK_CACHE;
const video = process.env.ADMIN_REP_PLAYBACK_VIDEO;
assert.ok(cache && isAbsolute(cache), 'Set ADMIN_REP_PLAYBACK_CACHE to an isolated absolute cache directory.');
assert.ok(video && isAbsolute(video), 'Set ADMIN_REP_PLAYBACK_VIDEO to the generated synthetic MP4.');
const videoBytes = await readFile(video);
const port = Number(process.env.ADMIN_REP_PLAYBACK_PORT || 4284);
assert.ok(Number.isSafeInteger(port) && port > 1024 && port < 65536);
const runtime = '/scripts/admin-rep-playback-fixtures/runtime.ts';
const replacement = new Map([
  ['/src/pages/admin/lib/accounts.ts', `export { loadPlayer } from '${runtime}';`],
  ['/src/pages/admin/lib/repToolsData.ts', `export { loadRep, loadRepArtifacts, loadRepRevisions, pushRepRevision, restoreRepRevision, pushJumpTechnique } from '${runtime}';`],
  ['/src/lib/firebase.ts', `export { auth, db, storage, cloud, default } from '${runtime}';`],
]);
const document = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic RepTools playback</title></head><body><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/scripts/admin-rep-playback-fixtures/mount.tsx');</script></body></html>`;
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), cacheDir: cache,
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
  plugins: [{ name: 'synthetic-rep-playback-boundary', configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (!['GET', 'HEAD'].includes(request.method)) { response.statusCode = 405; response.end('Read-only fixture.'); return; }
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'");
      if (/^\/(?:api(?:\/|$)|__\/auth|\.netlify(?:\/|$))/.test(url.pathname)) { response.statusCode = 403; response.end('Service access disabled.'); return; }
      if (url.pathname === '/__rep-playback/synthetic.mp4') {
        response.setHeader('Content-Type', 'video/mp4'); response.setHeader('Accept-Ranges', 'bytes');
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
        if (match) {
          const from = Number(match[1]), to = Math.min(Number(match[2] || videoBytes.length - 1), videoBytes.length - 1);
          if (from > to || from >= videoBytes.length) { response.statusCode = 416; response.end(); return; }
          response.statusCode = 206; response.setHeader('Content-Range', `bytes ${from}-${to}/${videoBytes.length}`);
          response.setHeader('Content-Length', to - from + 1); response.end(request.method === 'HEAD' ? undefined : videoBytes.subarray(from, to + 1)); return;
        }
        response.setHeader('Content-Length', videoBytes.length); response.end(request.method === 'HEAD' ? undefined : videoBytes); return;
      }
      let body = replacement.get(url.pathname), contentType = 'text/javascript';
      if (request.headers['sec-fetch-dest'] === 'document' || request.headers.accept?.includes('text/html')) { body = document; contentType = 'text/html'; }
      if (body === undefined) return next();
      response.setHeader('Content-Type', contentType); response.end(request.method === 'HEAD' ? undefined : body);
    });
  } }] });
await server.listen();
console.log(`Synthetic RepTools preview http://127.0.0.1:${port}/admin/accounts/player/synthetic-athlete/results/dribbling/tracking`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
