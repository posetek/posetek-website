// Loopback-only browser acceptance for parent accounts, against the in-memory Firebase stand-in in
// runtime.ts (the admin fixture pattern). It renders the real sign-in page, /family and a parent's
// Home in Chromium, so effects run. Every request off loopback is aborted.
// Usage (from app/): PARENT_FIXTURE_CACHE=<absolute cache dir> node scripts/parent-accounts-fixtures/acceptance.mjs
import assert from 'node:assert/strict';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../node_modules/vite/dist/node/index.js';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = process.env.PARENT_FIXTURE_CACHE;
assert.ok(cache && isAbsolute(cache), 'Set PARENT_FIXTURE_CACHE to an isolated absolute cache directory.');
const port = Number(process.env.PARENT_FIXTURE_PORT || 4298);
const runtime = '/scripts/parent-accounts-fixtures/runtime.ts';
const firebase = resolve(root, 'src/lib/firebase.ts');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic parent accounts</title></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/scripts/parent-accounts-fixtures/mount.tsx');</script></body></html>`;

const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), cacheDir: cache, logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
  plugins: [{ name: 'synthetic-parent-accounts', enforce: 'pre',
    load(id) { return id.split('?')[0] === firebase ? `export * from '${runtime}'; export { default } from '${runtime}';` : null; },
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.headers['sec-fetch-dest'] === 'document' || request.headers.accept?.includes('text/html')) {
          response.setHeader('Content-Type', 'text/html'); response.setHeader('Cache-Control', 'no-store'); response.end(html); return;
        }
        next();
      });
    } }] });
await server.listen();
const base = `http://127.0.0.1:${port}`;
const CODE = 'PAR-' + '0123456789ABCDEF'.repeat(2);
const browser = await chromium.launch({ headless: true });
const results = [];
async function scenario(name, path, run) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(base + path, { waitUntil: 'networkidle' });
  const calls = () => page.evaluate(() => window.__parentFixture.calls.map(call => call.name));
  try { await run(page, calls); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
  assert.deepEqual(errors, [], `${name}: page errors`);
  await page.close();
}
const signIn = async (page, email) => {
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).first().click();
  await page.locator('#email').fill(email); await page.locator('#password').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
};
const guidance = kind => `This sign-in is ${kind}. To create a parent account, sign out and use a different email.`;

try {
  await scenario('existing parent signs in from the Parent panel, then Add to my account redeems the waiting link', `/signin#parentCode=${CODE}`, async (page, calls) => {
    await page.locator('#parentCodeTab.active').waitFor();
    await signIn(page, 'parent@example.test');
    await page.getByRole('button', { name: 'Add to my account' }).waitFor();
    assert.ok(!(await calls()).includes('redeemGuardianInvitation'), 'nothing redeemed before the action');
    await page.getByRole('button', { name: 'Add to my account' }).click();
    await page.waitForURL(url => url.pathname.startsWith('/athlete'));
    assert.equal(new URL(page.url()).searchParams.get('player'), 'child-a');
    assert.ok((await calls()).includes('redeemGuardianInvitation'));
  });
  for (const [email, kind] of [['other@example.test', 'a player account'], ['coach@example.test', 'a coach or staff account'], ['synthetic.admin@posetek.net', 'a PoseTek admin account']]) {
    await scenario(`${email} signing in on a parent link gets guidance and stays signed in`, `/signin#parentCode=${CODE}`, async (page, calls) => {
      await page.locator('#parentCodeTab.active').waitFor();
      await signIn(page, email);
      await page.getByText(guidance(kind)).waitFor();
      await page.getByRole('button', { name: 'Use a different account' }).first().waitFor();
      assert.equal(new URL(page.url()).pathname, '/signin');
      assert.ok(!(await calls()).includes('redeemGuardianInvitation'));
    });
  }
  await scenario('a signed-in parent opening a link sees one action', `/signin?as=parent#parentCode=${CODE}`, async page => {
    await page.getByRole('button', { name: 'Add to my account' }).waitFor();
    assert.equal(await page.locator('#parentCodeForm').count(), 0);
  });
  await scenario('switching accounts on the Parent panel re-checks the new sign-in', `/signin?as=other-player#parentCode=${CODE}`, async page => {
    await page.getByText(guidance('a player account')).waitFor();
    await page.locator('#parentCodeTab').getByRole('button', { name: 'Use a different account' }).click();
    await signIn(page, 'parent@example.test');
    await page.getByRole('button', { name: 'Add to my account' }).waitFor();
  });
  await scenario('a player holding a parent link sees the guidance once, then Continue reaches its own home', `/signin#parentCode=${CODE}`, async page => {
    await page.locator('#parentCodeTab.active').waitFor();
    await signIn(page, 'other@example.test');
    await page.getByText(guidance('a player account')).waitFor();
    await page.locator('#closeSignupModal').click();
    await page.getByRole('button', { name: 'Continue with signed-in account' }).click();
    await page.waitForURL(url => url.pathname === '/athlete');
    assert.equal(new URL(page.url()).searchParams.get('player'), 'other-child');
  });
  await scenario('a restored player session on a parent link is never trapped: Continue goes home', `/signin?as=other-player#parentCode=${CODE}`, async page => {
    await page.getByText(guidance('a player account')).waitFor();
    await page.locator('#closeSignupModal').click();
    await page.getByRole('button', { name: 'Continue with signed-in account' }).click();
    await page.waitForURL(url => url.pathname === '/athlete');
    assert.equal(new URL(page.url()).searchParams.get('player'), 'other-child');
  });
  await scenario("a parent already linked to the report's child, with an unused code, gets Add to my account", `/signin?as=parent&reportPlayer=child-a#parentCode=${CODE}`, async page => {
    await page.getByRole('button', { name: 'Add to my account' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/signin');
  });
  await scenario("a parent already linked to the report's child, with a used code, continues to that child", `/signin?as=parent&reportPlayer=child-a#parentCode=PAR-${'F'.repeat(32)}`, async page => {
    await page.waitForURL(url => url.pathname === '/athlete');
    assert.equal(new URL(page.url()).searchParams.get('player'), 'child-a');
    assert.equal(new URL(page.url()).searchParams.get('view'), 'training');
  });
  await scenario("the child's own login keeps auto-continuing on a report that carries a parent link", `/signin?as=child&reportPlayer=child-b#parentCode=${CODE}`, async page => {
    await page.waitForURL(url => url.pathname === '/athlete');
    assert.equal(new URL(page.url()).searchParams.get('player'), 'child-b');
  });
  await scenario('/family lists a parent\'s children with time on PoseTek', '/family?as=parent', async page => {
    await page.getByText('Avery Synthetic').waitFor();
    await page.getByText('Time on PoseTek · 2 h 5 min').waitFor();
    await page.getByRole('button', { name: 'Add player' }).waitFor();
  });
  await scenario('/family sends a non-parent to sign-in, even with preview parameters', '/family?as=other-player&previewParent=synthetic-parent&fromPlayer=child-a', async (page, calls) => {
    await page.waitForURL(url => url.pathname === '/signin');
    assert.ok(!(await calls()).includes('getPlayerGuardians'));
  });
  await scenario('/family previews a parent for an admin, read-only', '/family?as=admin&previewParent=synthetic-parent&fromPlayer=child-a', async page => {
    await page.getByText('Parent view · parent@example.test').waitFor();
    await page.getByText('Avery Synthetic').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add player' }).count(), 0);
    assert.equal(await page.locator('a.family-row').first().getAttribute('href'), '/athlete?player=child-a&workspace=player');
  });
  await scenario("a parent's Home, rendered in the browser, makes no social call and has no feed section", '/parent-home?as=parent', async (page, calls) => {
    await page.getByText('Time on PoseTek').waitFor();
    await page.waitForTimeout(500);
    const names = await calls();
    assert.deepEqual(names.filter(name => /Social/.test(name)), []);
    assert.equal(await page.getByText('Organization activity').count(), 0);
    await page.getByRole('button', { name: 'Add player' }).waitFor();
  });
} finally { await browser.close(); await server.close(); }
console.log(JSON.stringify(results, null, 2));
process.exit(results.every(result => result.ok) ? 0 : 1);
