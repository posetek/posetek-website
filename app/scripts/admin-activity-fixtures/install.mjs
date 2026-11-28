// Local Vite-only fixture. The real admin UI/read hooks run against invented,
// in-memory data; no Auth account, Firebase service, or persisted record exists.
export const firebaseFixtureModule = `export { auth, db, cloud, storage, directorySource, default } from '/scripts/admin-activity-fixtures/runtime.ts';`;
export function activityFixtureDocument(interactive = false, fontPath) {
  const entry = interactive ? "workspace-entry.ts" : "mount.tsx";
  const font = fontPath ? `<style>@font-face{font-family:"Material Symbols Outlined";font-style:normal;font-weight:100 700;font-display:swap;src:url("${fontPath}") format("woff2")}</style>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PoseTek · Synthetic admin activity preview</title><meta name="viewport" content="width=device-width,initial-scale=1">${font}</head><body><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;const { mountActivityFixture }=await import('/scripts/admin-activity-fixtures/${entry}');mountActivityFixture();</script></body></html>`;
}
export async function installActivityFixture(context, origin, options = {}) {
  const base = new URL(origin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw Error('Activity fixtures require loopback Vite.');
  const network = { externalBlocked: [], writesBlocked: [], socketsBlocked: [], unexpected: [] };
  await context.addInitScript(value => { window.__adminActivityOptions = value; }, options);
  await context.routeWebSocket('**/*', socket => {
    network.socketsBlocked.push(socket.url());
    socket.close();
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) { network.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
    if (!['GET', 'HEAD'].includes(request.method())) { network.writesBlocked.push({ method: request.method(), path: url.pathname }); return route.abort(); }
    if (/^\/(?:api(?:\/|$)|__\/auth|\.netlify(?:\/|$))/.test(url.pathname)) { network.unexpected.push(url.pathname); return route.abort(); }
    if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body: firebaseFixtureModule });
    if (request.isNavigationRequest() && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: activityFixtureDocument() });
    return route.continue();
  });
  return network;
}
