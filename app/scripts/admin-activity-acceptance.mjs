// New activity-reporting acceptance, separate from preserved admin suites.
// Start loopback Vite, then node app/scripts/admin-activity-acceptance.mjs.
// No real authentication/data: the real UI and report hooks use an in-memory
// Firebase adapter. Network writes, external HTTP and all sockets are blocked.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium, webkit } from '../node_modules/playwright/index.mjs';
import { installActivityFixture } from './admin-activity-fixtures/install.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = new URL(process.env.POSETEK_ADMIN_PREVIEW_URL || 'http://127.0.0.1:4195').origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Only a local synthetic Vite origin is permitted.');
const artifacts = resolve(root, process.env.ADMIN_ACTIVITY_ARTIFACTS || 'artifacts/admin-activity/acceptance');
const only = process.env.ADMIN_ACTIVITY_ONLY ? new RegExp(process.env.ADMIN_ACTIVITY_ONLY, 'i') : null;
const engineFilter = process.env.ADMIN_ACTIVITY_ENGINE;
const evidence = { origin, methodology: 'Real admin UI and reporting hooks with browser-local invented transport responses; no real Auth or persisted data.',
  limitations: ['No deployed backend, actual authentication/authorization, or production acceptance is established.', 'Headless desktop Chromium/WebKit with viewport/touch emulation; no physical-phone or native-zoom claim.', 'Directory navigation to other tools is URL-only; independent tools retain their own acceptance.'], results: [], screenshots: [] };
await mkdir(artifacts, { recursive: true });
const initialPath = '/admin/accounts?orgId=northfield&directoryLevel=teams&directoryPane=report&reportView=overview&reportStart=2026-10-07&reportEnd=2026-11-03&reportTimezone=America%2FLos_Angeles';
const url = path => new URL(path, origin).href;
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const report = page => page.locator('.admin-activity-report');
const table = page => page.getByRole('table', { name: 'Player activity in this reporting scope', exact: true });
const playerRows = page => table(page).locator('tbody > tr:not(.activity-expanded-row)');
const tabs = page => page.getByRole('tablist', { name: 'Directory and reporting views' });
const header = page => page.locator('[aria-label="Selected organization and team"]');
const pagination = page => page.getByRole('navigation', { name: 'Activity player pages' });
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function ready(page) { await report(page).waitFor(); await page.waitForFunction(() => document.querySelector('.admin-activity-report')?.getAttribute('aria-busy') === 'false'); await frames(page); }
async function view(page, name) { await tabs(page).getByRole('tab', { name, exact: true }).click(); await ready(page); }
async function query(page, key, value) { await page.waitForFunction(([key, value]) => new URLSearchParams(location.search).get(key) === value, [key, value]); await frames(page); }
async function requestLog(page) { return page.evaluate(() => window.__adminActivity.requests.map(({ sequence, kind, input, uid, state, code }) => ({ sequence, kind, input, uid, state, code }))); }
async function capture(page, name, target) {
  await frames(page);
  const path = resolve(artifacts, `${slug(name)}.png`);
  if (target) await target.screenshot({ path }); else await page.screenshot({ path, fullPage: false });
  evidence.screenshots.push(path);
}
async function noOverflow(page) {
  const result = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(result.document <= result.viewport + 1 && result.body <= result.viewport + 1, JSON.stringify(result));
}
async function assertHeader(page, expected) {
  await header(page).getByRole('heading', { name: expected, exact: true }).waitFor();
  assert.equal(await header(page).getByRole('tablist', { name: 'Directory and reporting views' }).count(), 1, 'Tabs stay within the selected-scope header.');
  assert.match(await header(page).innerText(), /2026-10-07.*2026-11-03/);
  const heading = await header(page).getByRole('heading', { name: expected, exact: true }).boundingBox();
  const navigation = await header(page).getByRole('tablist', { name: 'Directory and reporting views' }).boundingBox();
  assert.ok(heading.y + heading.height <= navigation.y + 1, 'Selected scope appears above the reporting tabs.');
}
async function fixture(browser, width, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : 1000 }, hasTouch: width <= 768, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const network = await installActivityFixture(context, origin, options);
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, network, errors };
}
async function check(browser, engine, width, name, run, options) {
  const title = `${engine} ${width}px ${name}`;
  if (only && !only.test(title)) return;
  const state = await fixture(browser, width, options), started = Date.now();
  try {
    await run(state.page, title);
    assert.deepEqual(state.errors, [], 'Unexpected page errors.');
    assert.deepEqual(state.network.writesBlocked, [], 'The UI attempted a network write, even though it was blocked.');
    assert.deepEqual(state.network.unexpected, [], 'The UI attempted an unmocked local service endpoint.');
    assert.deepEqual(await state.page.evaluate(() => window.__adminActivity.denied), [], 'The UI attempted an unmocked or mutating data operation.');
    evidence.results.push({ title, status: 'passed', milliseconds: Date.now() - started, requests: await requestLog(state.page), network: state.network });
    console.log(`PASS ${title}`);
  } catch (error) {
    try { await capture(state.page, `${title}-failure`); } catch { /* Preserve the original assertion. */ }
    evidence.results.push({ title, status: 'failed', milliseconds: Date.now() - started, message: String(error.stack || error), url: state.page.url(), errors: state.errors,
      requests: await requestLog(state.page).catch(() => []), network: state.network });
    console.error(`FAIL ${title}: ${error.message}`);
  } finally {
    await state.context.close();
    await writeFile(resolve(artifacts, 'acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
}

for (const [engine, driver] of [['chromium', chromium], ['webkit', webkit]]) {
  if (engineFilter && engineFilter !== engine) continue;
  const browser = await driver.launch({ headless: true });
  try {
    for (const width of [360, 390, 430, 768, 1440, 1920]) {
      await check(browser, engine, width, 'scope header and readable responsive reports', async (page, title) => {
        await page.goto(url(initialPath)); await ready(page); await assertHeader(page, 'Northfield FC');
        for (const name of ['Overview', 'Workouts', 'Usage']) {
          if (name !== 'Overview') await view(page, name);
          await assertHeader(page, 'Northfield FC'); await noOverflow(page);
          assert.ok(await playerRows(page).count() > 0, `${name} has actual player rows.`);
          const targets = await page.locator('.admin-activity-report :is(button,input,select), .workspace-scope-header [role="tab"]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').map(node => ({ label: node.getAttribute('aria-label') || node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
          assert.ok(targets.every(target => target.width >= 43.5 && target.height >= 43.5), `Activity controls must remain at least44px: ${JSON.stringify(targets.filter(target => target.width < 43.5 || target.height < 43.5))}`);
          const truncated = await page.locator('.activity-roster-toolbar :is(button,label), .workspace-scope-header h2').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
          assert.deepEqual(truncated, [], 'Long labels may wrap, never disappear outside their controls.');
          await capture(page, `${title}-${name}`);
          await playerRows(page).first().scrollIntoViewIfNeeded(); await frames(page);
          await capture(page, `${title}-${name}-players`);
        }
        assert.equal((await requestLog(page)).filter(entry => entry.kind === 'history').length, 0, 'Closed recent histories perform no private reads.');
        assert.equal((await requestLog(page)).filter(entry => entry.kind === 'getWorkoutNotificationStatus').length, 0, 'Closed exact sessions perform no observation reads.');
        if (width === 390) {
          await page.setViewportSize({ width: 844, height: 390 }); await frames(page); await noOverflow(page);
          await capture(page, `${title}-landscape`);
        }
      });
    }
    for (const width of [390, 1440]) {
      await check(browser, engine, width, 'summary actions select all positive activity including returning players', async (page, title) => {
        await page.goto(url(initialPath)); await ready(page);
        for (const name of ['Overview', 'Usage']) {
          if (name !== 'Overview') await view(page, name);
          await page.getByRole('button', { name: 'Show players: Active players', exact: true }).click(); await ready(page);
          await query(page, 'reportAdminFollowUp', 'active');
          assert.equal(await page.evaluate(() => document.activeElement?.id), 'activity-people-title', 'Summary activation focuses the matching people heading.');
          const values = await table(page).locator('[data-label="Estimated app use"] strong').allTextContents();
          assert.ok(values.length > 0 && values.every(value => Number.parseFloat(value.replaceAll(',', '')) > 0), 'Active summary excludes measured zero and unknown collection.');
          await table(page).getByRole('link', { name: 'Alexandria-Catherine Montgomery de la Cruz-Wellington', exact: true }).waitFor();
          assert.equal((await requestLog(page)).filter(entry => entry.kind === 'getClubInsightsV2').at(-1).input.adminReporting.followUp, 'active', 'Positive-use returning players share the active request.');
          await page.getByRole('button', { name: 'Show players: Estimated app use', exact: true }).click(); await ready(page);
          await query(page, 'reportAdminSort', 'activeMinutes');
          assert.match(await playerRows(page).first().innerText(), /Zara Complete Roster Leader/);
          await capture(page, `${title}-${name}`);
          await page.getByRole('button', { name: 'Show players: Players in this selection', exact: true }).click(); await ready(page);
          await query(page, 'reportAdminFollowUp', 'all'); await query(page, 'reportAdminSort', 'name');
          assert.equal(new URL(page.url()).searchParams.has('reportCursor'), false);
        }
      });

      await check(browser, engine, width, 'complete roster rankings and distinct follow-up evidence', async page => {
        await page.goto(url(initialPath)); await ready(page);
        for (const name of ['Most workout timer time', 'Most estimated app use']) {
          const ranking = page.getByRole('region', { name, exact: true });
          assert.match(await ranking.locator('li').first().innerText(), /Zara Complete Roster Leader/);
        }
        assert.doesNotMatch(await table(page).innerText(), /Zara Complete Roster Leader/, 'Leader is deliberately outside page1; rankings must cover the complete cohort.');
        const groups = page.getByRole('group', { name: 'Explore follow-up groups' });
        await groups.getByRole('button', { name: /No recorded sign-in/ }).click(); await ready(page);
        await query(page, 'reportAdminFollowUp', 'noSignIn');
        const signIns = await table(page).locator('[data-label="Recorded sign-in"]').allTextContents();
        assert.ok(signIns.length > 0 && signIns.every(text => /No sign-in recorded|Account not linked/.test(text) && !/unavailable|Sign-in recorded/.test(text)), 'Unknown sign-in must not become no recorded sign-in.');
        await groups.getByRole('button', { name: /No collected active use/ }).click(); await ready(page);
        await query(page, 'reportAdminFollowUp', 'noActivity');
        const use = await table(page).locator('[data-label="Estimated app use"]').allTextContents();
        assert.ok(use.length > 0 && use.every(text => !/unavailable|Not collected/i.test(text) && /0/.test(text)), 'Missing collection must not be classified as observed zero activity.');
        await groups.getByRole('button', { name: /Unfinished assigned workouts/ }).click(); await ready(page);
        const assignments = await table(page).locator('[data-label="Assigned work"]').allTextContents();
        assert.ok(assignments.length > 0 && assignments.every(text => /[1-9]\d* remaining/.test(text) && !/unavailable|No active plan/.test(text)), 'Only observed current-week remaining work enters this group.');
        await groups.getByRole('button', { name: /No completed workouts/ }).click(); await ready(page);
        assert.ok((await table(page).locator('[data-label="Workouts completed"] strong').allTextContents()).every(text => text === '0'));
        await report(page).getByRole('button', { name: 'Clear', exact: true }).click(); await ready(page);
        await pagination(page).getByRole('button', { name: 'Next', exact: true }).click(); await ready(page);
        await query(page, 'reportPage', '1'); assert.ok(new URL(page.url()).searchParams.get('reportCursor'));
        await page.getByRole('combobox', { name: 'Sort players', exact: true }).selectOption('workoutMinutes'); await ready(page);
        assert.equal(new URL(page.url()).searchParams.has('reportCursor'), false, 'Changing sort clears the old opaque cursor.');
        assert.match(await playerRows(page).first().innerText(), /Zara Complete Roster Leader/);
        await page.getByRole('searchbox', { name: 'Find a player in this report' }).fill('Alexandria');
        await report(page).getByRole('button', { name: 'Search', exact: true }).click(); await ready(page);
        assert.equal(await playerRows(page).count(), 1); assert.match(await playerRows(page).first().innerText(), /Alexandria-Catherine/);
        await page.reload(); await ready(page); assert.equal(await page.getByRole('searchbox', { name: 'Find a player in this report' }).inputValue(), 'Alexandria');
        await page.goBack(); await ready(page); await query(page, 'reportSearch', null);
        await page.goForward(); await ready(page); await query(page, 'reportSearch', 'Alexandria');
      });

      await check(browser, engine, width, 'scope transitions preserve period and native history', async page => {
        await page.goto(url(initialPath)); await ready(page);
        await page.getByRole('table', { name: 'Team activity in this reporting scope' }).getByRole('link', { name: 'Harbor U15', exact: true }).click();
        await query(page, 'teamId', 'harbor');
        await tabs(page).getByRole('tab', { name: 'Overview', exact: true }).click(); await ready(page);
        await assertHeader(page, 'Harbor U15');
        assert.equal(await page.getByRole('table', { name: 'Team activity in this reporting scope' }).count(), 0, 'Team scope does not show organization comparison as team totals.');
        const rows = await table(page).locator('.activity-person-scope').allTextContents();
        assert.ok(rows.every(text => text.includes('Harbor U15')));
        await view(page, 'Workouts'); await view(page, 'Usage');
        await page.goBack(); await ready(page); await query(page, 'reportView', 'workouts'); await assertHeader(page, 'Harbor U15');
        await page.goForward(); await ready(page); await query(page, 'reportView', 'usage'); await assertHeader(page, 'Harbor U15');
        await page.reload(); await ready(page); await assertHeader(page, 'Harbor U15');
        await page.goto(url(initialPath.replace('directoryLevel=teams', 'directoryLevel=people&teamId=removed-team')));
        await page.getByRole('heading', { name: 'Team unavailable', exact: true }).waitFor();
        assert.equal(await report(page).count(), 0, 'An unavailable team never silently broadens to organization totals.');
      });

      await check(browser, engine, width, 'one inline history and explicitly selected session observations', async (page, title) => {
        await page.goto(url(initialPath.replace('reportView=overview', 'reportView=workouts'))); await ready(page);
        const originalUrl = page.url(), first = page.getByRole('button', { name: /^Show recent workouts for / }).first();
        assert.equal((await requestLog(page)).filter(entry => ['history', 'getWorkoutNotificationStatus'].includes(entry.kind)).length, 0);
        await first.click();
        let region = page.getByRole('region', { name: /^Recent workouts for / });
        await region.getByRole('heading', { name: 'Recorded workouts', exact: true }).waitFor();
        await region.getByRole('button', { name: /^View activity and email status for / }).first().waitFor();
        assert.equal(await region.count(), 1);
        assert.equal((await requestLog(page)).filter(entry => entry.kind === 'history').length, 2, 'Exactly the selected player assigned+personal history is read.');
        assert.equal((await requestLog(page)).filter(entry => entry.kind === 'getWorkoutNotificationStatus').length, 0);
        await region.getByRole('button', { name: /^View activity and email status for / }).first().click();
        await region.getByRole('region', { name: 'Observed activity and email notifications' }).getByText('Synthetic close-control drill', { exact: true }).waitFor();
        assert.equal(page.url(), originalUrl, 'Local session selection preserves directory query/history.');
        let observed = (await requestLog(page)).filter(entry => entry.kind === 'getWorkoutNotificationStatus');
        assert.equal(observed.length, 1); assert.match(observed[0].input.logId, new RegExp(observed[0].input.playerId));
        await capture(page, `${title}-expanded`);
        await page.getByRole('button', { name: /^Show recent workouts for / }).first().click();
        region = page.getByRole('region', { name: /^Recent workouts for / });
        await region.getByRole('heading', { name: 'Recorded workouts', exact: true }).waitFor();
        assert.equal(await region.count(), 1, 'Opening a second player removes the previous expansion.');
        observed = (await requestLog(page)).filter(entry => entry.kind === 'getWorkoutNotificationStatus');
        assert.equal(observed.length, 1, 'A different player expansion does not auto-read a previously selected session.');
        await view(page, 'Usage'); assert.equal(await page.getByRole('region', { name: /^Recent workouts for / }).count(), 0);
      });
    }

    await check(browser, engine, 390, 'retry preserves scope and unknown remains unavailable', async page => {
      await page.goto(url(initialPath));
      await page.getByRole('alert').filter({ hasText: 'Synthetic activity read unavailable.' }).waitFor({ timeout: 20_000 });
      assert.equal(await table(page).count(), 0);
      await page.evaluate(() => window.__adminActivity.setReportMode('normal'));
      await page.getByRole('button', { name: 'Try again', exact: true }).click(); await ready(page); await assertHeader(page, 'Northfield FC');
      await page.evaluate(() => window.__adminActivity.setReportMode('missing-extension'));
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click(); await ready(page);
      await page.getByText(/Detailed account activity is unavailable in this report/).waitFor();
      assert.equal(await page.getByRole('group', { name: 'Explore follow-up groups' }).count(), 0, 'Absent additive data is not fabricated as zero follow-up counts.');
      assert.equal(await page.getByRole('combobox', { name: 'Sort players', exact: true }).isDisabled(), true);
      await page.evaluate(() => window.__adminActivity.setReportMode('denied'));
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Synthetic admin access changed.' }).waitFor();
      assert.equal(await table(page).count(), 0, 'Permission denial clears earlier private report data rather than keeping it as stale.');
    }, { reportMode: 'error' });

    await check(browser, engine, 1440, 'late previous scope response cannot broaden team reporting', async page => {
      await page.goto(url(initialPath)); await ready(page);
      await page.evaluate(() => window.__adminActivity.holdNextReport());
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click();
      await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
      await page.getByRole('table', { name: 'Team activity in this reporting scope' }).getByRole('link', { name: 'Harbor U15', exact: true }).click();
      await query(page, 'teamId', 'harbor');
      await tabs(page).getByRole('tab', { name: 'Overview', exact: true }).click(); await ready(page);
      await assertHeader(page, 'Harbor U15');
      await page.evaluate(() => window.__adminActivity.releaseReports()); await frames(page);
      assert.ok((await table(page).locator('.activity-person-scope').allTextContents()).every(text => text.includes('Harbor U15')));
      assert.equal(await page.getByRole('table', { name: 'Team activity in this reporting scope' }).count(), 0);
    });

    await check(browser, engine, 1440, 'late previous account responses cannot restore private activity', async page => {
      await page.goto(url(initialPath)); await ready(page);
      await page.evaluate(() => window.__adminActivity.holdNextReport());
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click();
      await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
      await page.evaluate(() => window.__adminActivity.setAccount('synthetic-admin-two'));
      await ready(page);
      assert.ok((await playerRows(page).locator('th').allTextContents()).every(text => text.includes('Second account')));
      await page.evaluate(() => window.__adminActivity.releaseReports()); await frames(page);
      assert.ok((await playerRows(page).locator('th').allTextContents()).every(text => text.includes('Second account')), 'Late first-account response never replaces current identity data.');
      await page.evaluate(() => window.__adminActivity.setAccount(null));
      await page.getByRole('heading', { name: 'Synthetic signed-out state' }).waitFor();
      assert.equal(await report(page).count(), 0, 'Sign-out removes all private reporting.');
    });
  } finally { await browser.close(); }
}
evidence.passed = evidence.results.filter(result => result.status === 'passed').length;
evidence.failed = evidence.results.filter(result => result.status === 'failed').length;
await writeFile(resolve(artifacts, 'acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ passed: evidence.passed, failed: evidence.failed, screenshots: evidence.screenshots.length, artifacts }));
if (evidence.failed) process.exitCode = 1;
