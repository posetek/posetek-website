// Exercise the visible text itself: clicking an anchor's empty padding misses
// WebKit's lost-click regression when a decorative label replaces its text node.
// Compiled local pages only; external traffic and all writes are blocked.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';

let server, origin;
const browsers = new Map();
before(async () => {
  const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
  server = createHomepagePreviewServer({ marketingRoot: output, referenceRoot: output });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  for (const browser of browsers.values()) await browser.close();
  if (server) await new Promise(done => server.close(done));
});

async function pageFor(t, engine, route = '/', touch = false) {
  if (!browsers.has(engine)) browsers.set(engine, await ({ chromium, webkit })[engine].launch());
  const context = await browsers.get(engine).newContext({
    viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: touch, hasTouch: touch, reducedMotion: 'no-preference', serviceWorkers: 'block',
  });
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort('blockedbyclient');
    if (new URL(request.url()).origin === origin) return route.continue();
    if (request.resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  // This is the actual enhancement which used to replace the hit text node
  // during pointerdown; an unhydrated static link cannot exercise that defect.
  await page.locator('[data-marketing-header][data-polished="true"]').waitFor();
  return page;
}

async function activateText(page, selector, touch = false) {
  const link = page.locator(selector);
  const destination = new URL(await link.getAttribute('href'), page.url()).href;
  const label = link.locator('.interaction-text-visual');
  assert.equal(await label.count(), 1, `${selector} must expose one decorative label`);
  await label.scrollIntoViewIfNeeded();
  const box = await label.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'visible text has a hit region');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  // Exactly one physical activation, without locator retry/stability behavior
  // or script-generated click(). The normal browser anchor action must survive.
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y, { delay: 70 });
  await page.waitForURL(destination, { waitUntil: 'domcontentloaded', timeout: 4_000 });
  assert.equal(page.url(), destination);
}

for (const engine of ['chromium', 'webkit']) {
  for (const [name, route] of [['Players', '/index.html'], ['Coaches', '/coaches']]) {
    test(`${engine} desktop ${name} header Sign in follows one text click`, { timeout: 20_000 }, async t => {
      const page = await pageFor(t, engine, route);
      await activateText(page, '.pt-marketing-signin');
    });
  }
  test(`${engine} desktop booking follows one text click`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine);
    await activateText(page, '.pt-marketing-cta');
  });
  test(`${engine} desktop menu Sign in follows one text click`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine);
    await page.locator('summary.pt-marketing-menu-button').click();
    await activateText(page, '.pt-menu-account a[href="/signin"]');
  });
  test(`${engine} desktop menu section follows one text click and closes`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine);
    await page.locator('summary.pt-marketing-menu-button').click();
    await activateText(page, '.pt-menu-sections a[href="#training"]');
    await page.locator('.pt-marketing-menu').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#training')?.contains(document.activeElement) && document.activeElement.matches('h2'));
  });
  test(`${engine} phone menu section follows one text tap and closes`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine, '/', true);
    await page.locator('summary.pt-marketing-menu-button').tap();
    await activateText(page, '.pt-menu-sections a[href="#training"]', true);
    await page.locator('.pt-marketing-menu').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#training')?.contains(document.activeElement) && document.activeElement.matches('h2'));
  });
  test(`${engine} phone menu Sign in follows one text tap`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine, '/', true);
    await page.locator('summary.pt-marketing-menu-button').tap();
    await activateText(page, '.pt-menu-account a[href="/signin"]', true);
  });
  test(`${engine} phone closing Sign in follows one text tap`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine, '/', true);
    await activateText(page, '.marketing-footer-secondary', true);
  });
  test(`${engine} header Sign in preserves keyboard activation`, { timeout: 20_000 }, async t => {
    const page = await pageFor(t, engine);
    await page.locator('.pt-marketing-signin').press('Enter');
    await page.waitForURL(origin + '/signin', { waitUntil: 'domcontentloaded' });
  });
}
