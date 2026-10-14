/** Synthetic DEV preview only. Start Astro on loopback, then run:
 * POSETEK_PREVIEW_URL=http://127.0.0.1:4320 node --test scripts/coach-overview-browser.mjs
 * External requests are blocked; no sign-in or production records are used. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from '../app/node_modules/playwright/index.mjs';
const origin = new URL(process.env.POSETEK_PREVIEW_URL || 'http://127.0.0.1:4320');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Preview tests require loopback.');
const route = '/insights?preview=1&orgId=northfield&teamId=harbor&start=2026-09-01&end=2026-10-14&timezone=America%2FLos_Angeles';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });
async function pageFor(t, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  await context.route('**/*', request => new URL(request.request().url()).origin === origin.origin ? request.continue() : request.abort());
  await context.routeWebSocket(/.*/, socket => socket.close());
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No application exceptions'));
  await page.goto(new URL(route, origin).href, { waitUntil: 'networkidle' });
  await page.getByRole('region', { name: 'Team snapshot', exact: true }).waitFor();
  return page;
}
const selector = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) });
const entries = page => page.locator('.coach-evidence-players > li');
const noOverflow = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

for (const width of [1440, 360, 390, 430]) test(`coach overview at ${width}px: visible evidence, wrapping and touch targets`, async t => {
  const page = await pageFor(t, width);
  assert.equal(await selector(page, 'Results to review').getAttribute('aria-pressed'), 'true');
  assert.equal(await entries(page).count(), 5);
  await noOverflow(page);
  for (const element of await page.locator('.coach-overview-selector, .coach-evidence-player a, .coach-overview-show-all').all()) {
    assert.ok((await element.boundingBox()).height >= 44);
  }
  const geometry = await page.locator('.coach-overview-selector').evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
  assert.equal(width > 580 ? new Set(geometry.map(item => item.y)).size : new Set(geometry.map(item => item.x)).size, 1);
  await page.getByLabel('Preview state').selectOption('longNames');
  await page.getByRole('button', { name: /^Show all/ }).click();
  const longName = page.locator('.coach-evidence-player a').filter({ hasText: 'Alexandria-Catherine Montgomery de la Cruz-Wellington' });
  assert.equal(await longName.count(), 1);
  await noOverflow(page);
  if (process.env.POSETEK_CAPTURE_DIR) {
    await mkdir(process.env.POSETEK_CAPTURE_DIR, { recursive: true });
    await page.getByLabel('Preview state').selectOption('normal');
    await page.getByRole('button', { name: 'Show fewer players' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${process.env.POSETEK_CAPTURE_DIR}/coach-${width}.png` });
    await page.locator('.coach-overview-snapshot').scrollIntoViewIfNeeded();
    // Keep the sticky header above, rather than obscuring the first metric.
    await page.evaluate(() => scrollTo(0, document.querySelector('.coach-overview-snapshot').getBoundingClientRect().top + scrollY - 90));
    await page.screenshot({ path: `${process.env.POSETEK_CAPTURE_DIR}/evidence-${width}.png` });
    await page.evaluate(() => scrollTo(0, document.querySelector('.coach-roster').getBoundingClientRect().top + scrollY - 90));
    await page.screenshot({ path: `${process.env.POSETEK_CAPTURE_DIR}/roster-${width}.png` });
  }
});

test('metric selectors, expansion and methodology work with the keyboard; selection survives refresh and search', async t => {
  const page = await pageFor(t, 390);
  const workout = selector(page, 'No completed workouts');
  await workout.focus(); await page.keyboard.press('Enter');
  assert.equal(await workout.getAttribute('aria-pressed'), 'true');
  const show = page.getByRole('button', { name: /^Show all/ });
  const count = Number((await show.innerText()).split(' ').at(-1));
  await show.focus(); await page.keyboard.press('Space');
  assert.equal(await entries(page).count(), count);
  const method = page.locator('.coach-overview-method > summary');
  await method.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.coach-overview-method').getAttribute('open'), '');
  const focus = await method.evaluate(node => ({ outline: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }));
  assert.equal(focus.outline, 'solid'); assert.equal(focus.width, '2px');
  await page.getByRole('button', { name: 'Refresh Insights', exact: true }).click();
  assert.equal(await workout.getAttribute('aria-pressed'), 'true');
  assert.equal(await entries(page).count(), count);
  const totals = await page.locator('.coach-overview-selectors').innerText();
  await page.getByLabel('Find a player').fill('No match'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  assert.equal(await page.locator('.coach-overview-selectors').innerText(), totals);
  assert.equal(await entries(page).count(), count);
  assert.ok((await page.locator('.coach-roster').innerText()).includes('No players match that name'));
  const link = new URL(await page.locator('.coach-evidence-player a').first().getAttribute('href'), origin);
  for (const [key, value] of [['orgId', 'northfield'], ['teamId', 'harbor'], ['start', '2026-09-01'], ['end', '2026-10-14']]) assert.equal(link.searchParams.get(key), value);
});

test('displayed measurements match the synthetic source response, including mixed results and older dates', async t => {
  const page = await pageFor(t);
  const expected = await page.evaluate(async () => {
    const { previewInsights } = await import('/src/pages/insights/lib/preview.ts');
    const { expandedRequest } = await import('/src/pages/insights/lib/expandedQuery.ts');
    const { get } = await import('/src/lib/benchmarks.ts');
    const { measuredChange, evidenceDate } = await import('/src/pages/insights/lib/coachTesting.ts');
    const summary = previewInsights(expandedRequest(location.search), 0, 'normal', 'coach').overview.coachTesting;
    return { count: summary.reviewPlayers.length, players: summary.reviewPlayers.map(player => ({ name: player.name, status: player.status,
      metrics: player.measuredTests.flatMap(test => test.metrics.map(metric => [get(metric.key).format(metric.previous), get(metric.key).format(metric.current), evidenceDate(test.previousTestDate), evidenceDate(test.lastTestDate), measuredChange(metric)])) })) };
  });
  await page.getByRole('button', { name: `Show all ${expected.count}` }).click();
  assert.equal(await entries(page).count(), expected.count);
  for (const player of expected.players) {
    const row = entries(page).filter({ has: page.getByRole('link', { name: player.name, exact: true }) });
    const text = await row.innerText();
    if (player.status === 'mixed') assert.ok(text.includes('Mixed results'));
    for (const values of player.metrics) for (const value of values) assert.ok(text.includes(value), `Evidence includes ${value}`);
  }
  assert.ok(expected.players.some(player => player.metrics.some(values => values.some(value => value.includes('Aug ')))));
});

test('missing evidence stays unavailable, empty roster stays zero, and role changes reset selection', async t => {
  const page = await pageFor(t, 360);
  await page.getByLabel('Preview state').selectOption('unavailable');
  assert.equal(await page.locator('.coach-overview-number.is-unavailable').count(), 2);
  await selector(page, 'Players improving').click();
  assert.ok((await page.locator('.coach-overview-empty').innerText()).startsWith('Unavailable.'));
  await noOverflow(page);
  await page.getByLabel('Preview state').selectOption('empty');
  assert.deepEqual(await page.locator('.coach-overview-number').allTextContents(), ['0', '0', '0']);
  await page.getByLabel('Preview state').selectOption('normal');
  await page.getByLabel('Preview role').selectOption('manager');
  assert.equal(await page.locator('.is-coach-workspace').count(), 0);
  await page.getByLabel('Preview role').selectOption('coach');
  assert.equal(await selector(page, 'Results to review').getAttribute('aria-pressed'), 'true');
  await page.getByRole('tab', { name: 'Testing', exact: true }).click();
  assert.equal(await page.locator('.is-coach-workspace').count(), 1);
  assert.equal(await page.locator('.is-coach-overview').count(), 0);
});
