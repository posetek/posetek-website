/**
 * Local-only signed-in landing regression. Usage:
 *   node scripts/existing-session-browser.mjs --baseline
 *   node scripts/existing-session-browser.mjs
 * For the baseline: copy app/ outside Git, replace only its LandingPage.tsx
 * with `git show 52775b7:app/src/pages/landing/LandingPage.tsx`, then set
 * POSETEK_APP_DIR to that copy. Set FIREBASE_BIN to an absolute local
 * firebase-tools CLI entry when `firebase` is not on PATH. This
 * harness uses real Firebase Auth and Firestore emulators, a synthetic player,
 * and a loopback-stubbed getClubContext callable. No hosted service is called.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import { chromium } from '../app/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = resolve(process.env.POSETEK_APP_DIR || join(root, 'app'));
const baseline = process.argv.includes('--baseline');
const captureDir = resolve(process.env.POSETEK_CAPTURE_DIR || join(tmpdir(), 'posetek-existing-session-captures'));
const host = '127.0.0.1';
const project = 'demo-posetek-website-e2e';
const portOffset = 1200;
const ports = { auth: 20299, firestore: 19289, functions: 16201, storage: 20499, astro: 14322, hub: 16400, logging: 16500, websocket: 16150 };
const origin = `http://${host}:${ports.astro}`;
const cli = process.env.FIREBASE_BIN || 'firebase';
if (cli !== 'firebase' && !isAbsolute(cli)) throw new Error('FIREBASE_BIN must be an absolute local path');
const email = 'synthetic-existing-session@example.test';
const password = 'SyntheticOnly123!';
const playerId = 'synthetic-existing-session-player';

async function freePorts() {
  for (const port of Object.values(ports)) {
    const server = net.createServer();
    await new Promise((resolveReady, reject) => server.once('error', reject).listen(port, host, resolveReady));
    await new Promise(resolveClosed => server.close(resolveClosed));
  }
}
async function waitHttp(url, child, anyStatus = false) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}: ${url}`);
    try { const response = await fetch(url); if (anyStatus || response.ok) return; } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function stop(child) { if (child && child.exitCode === null) child.kill('SIGTERM'); }
async function awaitExit(child) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), delay(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
function localEnvironment() {
  const keys = ['PATH', 'TMPDIR', 'USER', 'LANG', 'LC_ALL', 'TERM', 'JAVA_HOME', 'FIREBASE_EMULATORS_PATH', 'PLAYWRIGHT_BROWSERS_PATH'];
  const env = Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return { ...env, CI: '1', NO_UPDATE_NOTIFIER: '1', GOOGLE_CLOUD_PROJECT: project, GCLOUD_PROJECT: project };
}
function callableResponse(role = 'none') {
  return JSON.stringify({ result: { role, organizations: [], organization: null, teams: [], staff: [], invitations: [], players: [] } });
}

await freePorts();
await mkdir(captureDir, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'posetek-existing-session-'));
let firebase, astro, browser, context;
const browserErrors = [];
const blocked = [];
let passwordAuthRequests = 0;
let callableMode = 'normal';
let heldCallable;
let releaseCallable;
try {
  const config = join(temp, 'firebase.json');
  const rules = join(temp, 'firestore.rules');
  // Only this throwaway demo project uses permissive rules. Nothing is published.
  await writeFile(rules, 'rules_version = "2"; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if true; } } }');
  await writeFile(config, JSON.stringify({ firestore: { rules }, emulators: {
    auth: { host, port: ports.auth }, firestore: { host, port: ports.firestore, websocketPort: ports.websocket },
    hub: { host, port: ports.hub }, logging: { host, port: ports.logging }, ui: { enabled: false },
  } }));
  firebase = spawn(cli === 'firebase' ? cli : process.execPath,
    [...(cli === 'firebase' ? [] : [cli]), 'emulators:start', '--only', 'auth,firestore', '--project', project, '--config', config],
    { cwd: temp, env: localEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  let firebaseOutput = '';
  for (const stream of [firebase.stdout, firebase.stderr]) stream.on('data', chunk => { firebaseOutput += chunk.toString(); });
  await waitHttp(`http://${host}:${ports.auth}/`, firebase, true).catch(error => { throw new Error(`${error.message}\n${firebaseOutput.slice(-3000)}`); });
  await waitHttp(`http://${host}:${ports.firestore}/`, firebase, true).catch(error => { throw new Error(`${error.message}\n${firebaseOutput.slice(-3000)}`); });
  const viteFixture = join(temp, 'vite.session.config.mjs');
  await writeFile(viteFixture, `import base from ${JSON.stringify(join(app, 'vite.config.ts'))};\nexport default { ...base, envPrefix: ['VITE_', 'PUBLIC_'], server: { fs: { allow: [${JSON.stringify(app)}, ${JSON.stringify(await realpath(join(app, 'node_modules')))}] } } };\n`);
  astro = spawn('npm', ['run', 'dev', '--', '--config', viteFixture, '--host', host, '--port', String(ports.astro), '--mode', 'posetek-emulator-e2e'],
    { cwd: app, env: { ...localEnvironment(), PUBLIC_FIREBASE_EMULATOR_PORT_OFFSET: String(portOffset) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let astroOutput = '';
  for (const stream of [astro.stdout, astro.stderr]) stream.on('data', chunk => { astroOutput += chunk.toString(); });
  await waitHttp(origin + '/signin', astro).catch(error => { throw new Error(`${error.message}\n${astroOutput.slice(-3000)}`); });

  browser = await chromium.launch();
  context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const allowed = new Set([origin, `http://${host}:${ports.auth}`, `http://${host}:${ports.firestore}`]);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === `http://${host}:${ports.auth}` && url.pathname.includes('accounts:signInWithPassword')) passwordAuthRequests++;
    if (url.origin === `http://${host}:${ports.functions}` && url.pathname.endsWith('/getClubContext')) {
      if (callableMode === 'fail') {
        callableMode = 'normal';
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Synthetic local failure' } }) });
      }
      if (callableMode === 'hold') {
        heldCallable?.();
        await new Promise(resolveHeld => { releaseCallable = resolveHeld; });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: callableResponse() });
    }
    if (allowed.has(url.origin)) return route.continue();
    blocked.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.hostname === host && [ports.astro, ports.firestore, ports.websocket].includes(Number(url.port))) return socket.connectToServer();
    blocked.push(socket.url()); socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(origin + '/signin');
  await page.locator('#loginForm').waitFor({ state: 'visible' }).catch(async error => { throw new Error(`Sign-in UI did not appear: ${JSON.stringify({ url: page.url(), body: (await page.locator('body').innerText().catch(() => '')).slice(0, 1200), errors: browserErrors, astroOutput: astroOutput.slice(-1200) })}`, { cause: error }); });
  assert.equal(await page.locator('.existing-session').count(), 0);

  // Create the synthetic Auth identity in the real local emulator and seed its
  // canonical player profile in the real local Firestore emulator.
  const uid = await page.evaluate(async ({ email, password, playerId }) => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('players').doc(playerId).set({ firstName: 'Synthetic', lastName: 'Athlete', authenticationUID: credential.user.uid, userUID: credential.user.uid });
    return credential.user.uid;
  }, { email, password, playerId });
  assert.ok(uid);
  await page.reload();
  const restored = await page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return await new Promise(resolveAuth => auth.onAuthStateChanged(user => resolveAuth(user?.uid || null)));
  });
  assert.equal(restored, uid, 'real Auth emulator session survived reload');

  if (baseline) {
    await page.locator('#loginForm').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: 'Continue with signed-in account' }).count(), 0);
    assert.equal(await page.locator('#password').isVisible(), true);
    await page.screenshot({ path: join(captureDir, 'before-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(captureDir, 'before-mobile.png') });
    console.log(`BEFORE reproduced: UID ${uid} restored, but /signin shows only password form.`);
  } else {
    const continuation = page.getByRole('button', { name: 'Continue with signed-in account' });
    await continuation.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#loginForm').count(), 0);
    await page.screenshot({ path: join(captureDir, 'after-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(captureDir, 'after-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile session panel fits viewport');

    // A failed account-context read leaves Auth intact and permits retry.
    callableMode = 'fail';
    await continuation.click();
    await page.locator('#loginError').getByText(/could not load|connection/i).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(async () => (await import('/src/lib/firebase.ts')).auth.currentUser?.uid), uid);
    await continuation.waitFor({ state: 'visible' });

    // An allowlisted return is followed and its feedback query is sanitized.
    await page.goto(origin + '/signin?returnTo=' + encodeURIComponent('/feedback?source=workout&extra=secret'));
    await continuation.click();
    await page.waitForURL('**/feedback?source=workout');
    assert.equal(new URL(page.url()).searchParams.has('extra'), false);

    // A cross-origin return is rejected; the player gets their own route.
    await page.goto(origin + '/signin?returnTo=' + encodeURIComponent('https://outside.example/athlete'));
    await continuation.click();
    await page.waitForURL(`**/feed?player=${playerId}&userType=player`);
    assert.equal(passwordAuthRequests, 0, 'Continue never submitted a password sign-in request');
    const profileAfterContinue = await page.evaluate(async playerId => {
      const { db } = await import('/src/lib/firebase.ts');
      return (await db.collection('players').doc(playerId).get()).data();
    }, playerId);
    assert.equal(Object.hasOwn(profileAfterContinue, 'lastLogin'), false, 'Continue did not write lastLogin');

    // A reload restores Auth and offers continuation again without password.
    await page.goto(origin + '/signin');
    await page.reload();
    await continuation.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#loginForm').count(), 0);

    // Delay access resolution, switch accounts, then release the old response.
    callableMode = 'hold';
    const entered = new Promise(resolveEntered => { heldCallable = resolveEntered; });
    await continuation.click();
    await entered;
    await page.getByRole('button', { name: 'Use a different account' }).click();
    await page.locator('#loginForm').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(async () => (await import('/src/lib/firebase.ts')).auth.currentUser), null);
    assert.equal(await page.locator('#email').inputValue(), '');
    assert.equal(await page.locator('#password').inputValue(), '');
    releaseCallable?.();
    callableMode = 'normal';
    await delay(500);
    assert.equal(new URL(page.url()).pathname, '/signin', 'stale access result did not redirect');
    assert.equal(await page.locator('.existing-session').count(), 0);

    // Ordinary signed-out password sign-in remains usable.
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#loginSubmit').click();
    await page.waitForURL(`**/feed?player=${playerId}&userType=player`);
    assert.equal(await page.evaluate(async () => (await import('/src/lib/firebase.ts')).auth.currentUser?.uid), uid);
    console.log('AFTER passed: continuation, retry, safe/unsafe return, reload, stale switch, signed-out password flow.');
  }
  assert.deepEqual(browserErrors, [], 'no browser exceptions');
  assert.deepEqual(blocked.filter(url => !['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/', 'https://images.unsplash.com/'].some(prefix => url.startsWith(prefix))), [], 'all nonlocal application traffic was blocked');
  console.log(`Blocked ${blocked.length} external font/image requests before network access.`);
  console.log(`Captures: ${captureDir}`);
} finally {
  releaseCallable?.();
  await context?.close();
  await browser?.close();
  stop(astro); stop(firebase);
  await Promise.all([awaitExit(astro), awaitExit(firebase)]);
  await rm(temp, { recursive: true, force: true });
}
