import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from '../app/node_modules/playwright/index.mjs';
import { createServer } from '../app/node_modules/vite/dist/node/index.js';

const app = fileURLToPath(new URL('../app', import.meta.url));
const vite = await createServer({ root: app, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const signIn = await vite.transformIndexHtml('/player-signin.html', `<!doctype html><html><body><div id="root"></div><script type="module">
  import { createElement } from 'react';
  import { createRoot } from 'react-dom/client';
  import PlayerSignInRoot from '/src/astro/PlayerSignInRoot.tsx';
  createRoot(document.getElementById('root')).render(createElement(PlayerSignInRoot));
</script></body></html>`);
const playerId = 'synthetic-journey-player';
const ownerUid = 'synthetic-journey-actor';

const firebase = `
const playerId = ${JSON.stringify(playerId)}, uid = ${JSON.stringify(ownerUid)};
const player = {firstName:'Synthetic', lastName:'Athlete', authenticationUID:uid, userUID:uid, organizationId:'test-club', teamId:'test-team'};
const user = {uid,email:'journey@example.test',reload:async()=>{},getIdTokenResult:async()=>({claims:{email:'journey@example.test'}})};
const listeners = new Set();
export const auth = {
  currentUser: sessionStorage.getItem('fixture-auth') ? user : null,
  onAuthStateChanged(fn) { listeners.add(fn); queueMicrotask(()=>{ if(listeners.has(fn)) fn(auth.currentUser); }); return ()=>listeners.delete(fn); },
  async signInWithEmailAndPassword() { sessionStorage.setItem('fixture-auth','1'); auth.currentUser=user; listeners.forEach(fn=>fn(user)); return {user}; },
  async signOut() { sessionStorage.removeItem('fixture-auth'); auth.currentUser=null; listeners.forEach(fn=>fn(null)); },
  async setPersistence() {},
};
const playerDoc = {id:playerId,exists:true,data:()=>player};
const empty = {docs:[],empty:true};
function collection(path) {
  const query = {
    where(){return query}, limit(){return query}, orderBy(){return query},
    get: async()=>path==='players' ? {docs:[playerDoc],empty:false} : empty,
    onSnapshot(){return ()=>{}},
    doc(id) {
      const snapshot = path==='players' && id===playerId ? playerDoc : {id,exists:false,data:()=>undefined};
      return {id,get:async()=>snapshot,update:async()=>{},collection:name=>collection(path+'/'+id+'/'+name),onSnapshot(){return ()=>{}}};
    },
  };
  return query;
}
export const db = {collection,doc:path=>collection('').doc(path)};
export const storage = {ref:()=>({listAll:async()=>({items:[],prefixes:[]})})};
window.fixtureCalls = [];
export const cloud = {httpsCallable:name=>async input=>{
  if(name==='getClubContext') return {data:{role:'player',organization:{id:'test-club',name:'Synthetic Club',schemaVersion:2},organizations:[],teams:[],players:[{id:playerId}]}};
  if(name==='getAthleteEffectiveResults') return {data:{reps:[]}};
  if(name.startsWith('record')) {
    window.fixtureCalls.push({name,input});
    if(window.fixtureJourneyOutage && name==='recordPlayerJourney') throw {code:'functions/unavailable'};
    return {data:{accepted:true}};
  }
  return {data:{}};
}};
export default {auth:Object.assign(()=>auth,{Auth:{Persistence:{LOCAL:'local',SESSION:'session'}}}),firestore:{FieldValue:{serverTimestamp:()=>0}}};`;

async function install(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body: firebase });
    if (url.pathname === '/player-signin.html') return route.fulfill({ contentType: 'text/html', body: signIn });
    return route.continue();
  });
}

try {
  for (const [label, engine, options, clientKind] of [
    ['Chromium desktop', chromium, { viewport: { width: 1280, height: 900 } }, 'desktop_web'],
    ['WebKit iPhone', webkit, devices['iPhone 13'], 'mobile_web'],
  ]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      await install(context);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/player-signin.html`);
      await page.locator('#loginForm').getByLabel('Email', { exact: true }).fill('journey@example.test');
      await page.locator('#loginForm').getByLabel('Password', { exact: true }).fill('SyntheticFixturePassword');
      await page.locator('#loginForm button[type=submit]').click();
      await page.waitForURL(/\/athlete\?/);
      await page.getByRole('heading', { name: 'Stats', exact: true }).waitFor();
      await page.waitForFunction(() => window.fixtureCalls?.some(call => call.name === 'recordPlayerJourney'));
      const first = await page.evaluate(() => window.fixtureCalls.find(call => call.name === 'recordPlayerJourney').input);
      assert.equal(first.entry, 'sign_in');
      assert.equal(first.clientKind, clientKind);
      assert.equal(first.playerId, playerId);
      assert.equal(first.sequence, 0);
      assert.deepEqual(first.events.map(event => [event.kind, event.page]), [['page_view', 'stats']]);
      const work = page.getByRole('navigation', { name: 'Player tabs' }).getByRole('link', { name: 'Workouts' });
      if (options.hasTouch) await work.tap();
      else { await work.focus(); await page.keyboard.press('Enter'); }
      await page.getByRole('heading', { name: 'Workouts', exact: true }).waitFor();
      await page.waitForFunction(() => window.fixtureCalls.filter(call => call.name === 'recordPlayerJourney').flatMap(call => call.input.events)
        .some(event => event.kind === 'page_view' && event.page === 'workouts'), undefined, { timeout: 25000 }).catch(async error => {
        const evidence = await page.evaluate(() => ({ calls: window.fixtureCalls, focused: document.hasFocus(), visibility: document.visibilityState }));
        throw new Error(`${label} did not record the Workouts transition: ${JSON.stringify({ evidence, errors })}`, { cause: error });
      });
      const events = await page.evaluate(() => window.fixtureCalls.filter(call => call.name === 'recordPlayerJourney').flatMap(call => call.input.events));
      assert.equal(events.filter(event => event.kind === 'click' && event.page === 'stats' && event.target === 'workouts').length, 1);
      assert.equal(events.filter(event => event.kind === 'page_view' && event.page === 'stats').length, 1);
      await page.goBack();
      await page.getByRole('heading', { name: 'Stats', exact: true }).waitFor();
      await page.waitForFunction(() => window.fixtureCalls.some(call => call.name === 'recordInsightUsage'), undefined, { timeout: 35000 });
      const usage = await page.evaluate(() => window.fixtureCalls.find(call => call.name === 'recordInsightUsage').input);
      assert.equal(usage.schemaVersion, 2);
      assert.equal(usage.platform, 'web');
      assert.equal(usage.clientKind, clientKind);
      const wire = JSON.stringify({ first, usage, events });
      for (const privateValue of [ownerUid, 'journey@example.test', 'SyntheticFixturePassword', 'userAgent', '/athlete?', 'reportPlayer']) {
        assert.equal(wire.includes(privateValue), false, `${privateValue} must stay out of the wire payload`);
      }

      await page.evaluate(() => {
        window.fixtureJourneyOutage = true;
        window.fixtureOutageStartsAt = window.fixtureCalls.length;
      });
      await page.getByRole('button', { name: /Ask the AI Coach/ }).click();
      await page.getByRole('heading', { name: 'Coach', exact: true }).first().waitFor();
      await page.waitForFunction(() => window.fixtureCalls.slice(window.fixtureOutageStartsAt)
        .some(call => call.name === 'recordPlayerJourney'), undefined, { timeout: 25000 });
      assert.equal(new URL(page.url()).searchParams.get('view'), 'coach');

      const preview = await context.newPage();
      await preview.goto(`${origin}/athlete?preview=1&view=stats`);
      await preview.getByRole('heading', { name: 'Stats', exact: true }).waitFor();
      assert.equal(await preview.evaluate(() => window.fixtureCalls.some(call => call.name === 'recordPlayerJourney')), false);
      await preview.close();
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`${label} player journey passed`);
    } finally { await browser.close(); }
  }
} finally { await vite.close(); }
