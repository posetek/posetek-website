import { activityFixtureDocument } from '../admin-activity-fixtures/install.mjs';
// Only the local Firebase boundary and bootstrap document are replaced. In
// particular useAccountLoad/useWorkspaceMetrics and their caches are real source.
export async function installPersistenceFixture(context, origin, options = {}) {
  const base = new URL(origin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw Error('Persistence fixtures require loopback Vite.');
  await context.addInitScript(value => { window.__adminPersistenceOptions = value; }, options);
  const network = { externalBlocked: [], writesBlocked: [], unexpected: [] };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) { network.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
    if (!['GET', 'HEAD'].includes(request.method())) { network.writesBlocked.push({ method: request.method(), path: url.pathname }); return route.abort(); }
    if (/^\/(?:api(?:\/|$)|__\/auth|\.netlify(?:\/|$))/.test(url.pathname)) { network.unexpected.push(url.pathname); return route.abort(); }
    if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body: "export { auth, db, cloud, storage, directorySource, default } from '/scripts/admin-persistence-fixtures/runtime.ts';" });
    if (request.isNavigationRequest() && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: activityFixtureDocument() });
    return route.continue();
  });
  return network;
}
