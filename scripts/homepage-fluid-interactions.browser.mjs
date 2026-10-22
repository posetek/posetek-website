// First-activation regressions against compiled local marketing. No production
// credentials, external traffic, form submissions or remote mutations are used.
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';

let server, browser, origin;
before(async () => {
  const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
  server = createHomepagePreviewServer({ marketingRoot: output, referenceRoot: output });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.POSETEK_BROWSER_EXECUTABLE || undefined });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function pageFor(t, options) {
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'no-preference', ...options });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.goto(origin);
  await page.locator('[data-showcase-enhanced="true"]').waitFor();
  return page;
}

for (const width of [360, 390, 430, 768, 1440, 1920]) {
  test(`footer sign-in follows the first mouse activation at ${width}px`, { timeout: 30_000 }, async t => {
    const page = await pageFor(t, { viewport: { width, height: 900 } });
    // The link starts outside the viewport. The scroll, reveal and focus that
    // precede this single pointer click reproduced the old narrow-screen defect.
    await page.locator('.marketing-footer-secondary').click();
    await page.waitForURL(origin + '/signin');
  });
}

for (const [name, selector] of [
  ['booking', '.marketing-footer-cta'],
  ['audience preview', '.marketing-footer-next'],
  ['sign-in', '.marketing-footer-secondary'],
]) {
  test(`footer ${name} follows the first touch activation`, { timeout: 30_000 }, async t => {
    const page = await pageFor(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const link = page.locator(selector), destination = new URL(await link.getAttribute('href'), origin).href;
    await link.tap();
    await page.waitForURL(destination);
  });
}

test('footer link geometry stays stationary when focusing during an entering or reversed reveal', { timeout: 30_000 }, async t => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 } });
  const result = await page.locator('.marketing-footer-secondary').evaluate(link => {
    const footer = link.closest('footer');
    const rectangles = [];
    for (const phase of ['before', 'out', 'in']) {
      footer.dataset.footerMotion = 'true'; footer.dataset.footerState = phase;
      footer.style.setProperty('--footer-grid-progress', '.35');
      link.blur(); const before = link.getBoundingClientRect().toJSON();
      link.focus({ preventScroll: true }); const after = link.getBoundingClientRect().toJSON();
      rectangles.push({ before, after });
    }
    return rectangles;
  });
  for (const { before, after } of result) {
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < .5, `${key} moved on focus`);
  }
});

test('menu dismissal preserves subsequent section and demo activation', { timeout: 30_000 }, async t => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.locator('summary.pt-marketing-menu-button').tap();
  await page.locator('.pt-menu-sections a[href="#training"]').tap();
  await page.locator('.pt-marketing-menu').waitFor({ state: 'hidden' });
  await page.locator('.showcase-action[data-showcase-open="training"]').tap();
  await page.locator('#demo-panel-training').waitFor({ state: 'visible' });
  await page.locator('#demo-panel-training .showcase-panel-header button').tap();
  await page.locator('#demo-panel-training').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.showcase-action[data-showcase-open="training"]').evaluate(node => node === document.activeElement), true);
});
