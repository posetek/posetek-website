// Actual admin directory/report hooks against synthetic source boundaries only.
// Start loopback Vite with an isolated cache; see the companion README.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from '../node_modules/playwright/index.mjs';
import { installPersistenceFixture } from './admin-persistence-fixtures/install.mjs';
const origin = new URL(process.env.POSETEK_ADMIN_PREVIEW_URL || 'http://127.0.0.1:4278').origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname));
const artifacts = resolve(process.env.ADMIN_PERSISTENCE_ARTIFACTS || 'artifacts/admin-persistence');
await mkdir(artifacts, { recursive: true });
const only = process.env.ADMIN_PERSISTENCE_ONLY ? new RegExp(process.env.ADMIN_PERSISTENCE_ONLY, 'i') : null;
const base = '/admin/accounts?orgId=northfield&directoryLevel=teams&directoryPane=report&reportView=overview&reportStart=2026-10-07&reportEnd=2026-11-03&reportTimezone=America%2FLos_Angeles';
const evidence = { methodology: 'Actual MonitorAccounts/DirectoryManagement/useAccountLoad/useWorkspaceMetrics and request validation with synthetic auth/source/callable boundaries. All external HTTP, WebSockets and writes blocked.', limitations: ['No real Firebase Auth or backend authorization, production data, deployment, billing or live latency claims.', 'Headless desktop/phone-size Chromium and WebKit; no physical device claim.'], results: [] };
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const log = page => page.evaluate(() => window.__adminActivity.requests.map(({ sequence, kind, uid, state, input }) => ({ sequence, kind, uid, state, input })));
const counts = async page => (await log(page)).reduce((out, row) => ({ ...out, [row.kind]: (out[row.kind] || 0) + 1 }), {});
const reportCount = async page => (await counts(page)).getClubInsightsV2 || 0;
async function ready(page) {
  await frames(page);
  await page.waitForFunction(() => {
    const selected = document.querySelector('[id^="directory-tab-"][aria-selected="true"]')?.id;
    if (selected === 'directory-tab-staff') return document.body.textContent.includes(new URLSearchParams(location.search).has('orgId') ? 'No staff have activated access yet.' : 'No coaches in this selection.');
    if (selected === 'directory-tab-teams') return !!document.querySelector('.directory-management-table');
    if (selected === 'directory-tab-settings') return !!document.querySelector('.directory-settings');
    return !!document.querySelector('.admin-activity-report, .workspace-testing, .activity-team-comparison, .directory-player-table') && !document.querySelector('.admin-activity-report[aria-busy="true"]') && ![...document.querySelectorAll('[role="status"]')].some(node => /Loading activity reporting|Loading player details|Updating organization and teams|Updating activity|Preparing .*report/.test(node.textContent || ''));
  });
  await frames(page);
}
async function directory(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.getByRole('tab', { name, exact: true, selected: true }).waitFor();
  await ready(page);
}
async function view(page, name) {
  const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
  await tabs.getByRole('tab', { name, exact: true }).click();
  await tabs.getByRole('tab', { name, exact: true, selected: true }).waitFor();
  await ready(page);
}
async function watch(page, includeReports = true) { await page.evaluate(include => window.__adminPersistence.observeLoading(include), includeReports); }
async function visibleError(page, message) {
  const error = page.getByText(message, { exact: true });
  await error.waitFor({ state: 'attached' });
  const disclosure = page.locator('.directory-navigator details');
  if (await disclosure.count() && !await disclosure.evaluate(node => node.open)) await disclosure.locator('summary').click();
  await error.waitFor();
}
async function noFlashes(page) { await frames(page); assert.deepEqual(await page.evaluate(() => window.__adminPersistence.flashes), [], 'Fresh reused data must render without a loading/refreshing flash.'); }
async function navigate(page, path) { await page.evaluate(path => window.__adminPersistence.navigate(path), path); await ready(page); }
async function check(browser, engine, width, name, run, options = {}) {
  const title = `${engine} ${width} ${name}`;
  if (only && !only.test(title)) return;
  const context = await browser.newContext({ viewport: { width, height: 960 }, hasTouch: width === 390, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const network = await installPersistenceFixture(context, origin, options), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(12_000); page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  try {
    await run(page);
    assert.deepEqual(errors, []); assert.deepEqual(network.writesBlocked, []); assert.deepEqual(network.unexpected, []);
    assert.deepEqual(await page.evaluate(() => window.__adminActivity.denied), []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow.');
    await page.screenshot({ path: resolve(artifacts, title.replaceAll(' ', '-') + '.png') });
    evidence.results.push({ title, passed: true, requests: await log(page), network }); console.log('PASS ' + title);
  } catch (error) {
    await page.screenshot({ path: resolve(artifacts, title.replaceAll(' ', '-') + '-failed.png') }).catch(() => {});
    evidence.results.push({ title, passed: false, error: String(error.stack || error), loadingTrace: await page.evaluate(() => window.__adminPersistence.loadingTrace || []).catch(() => []), requests: await log(page).catch(() => []), errors, network }); console.error('FAIL ' + title + ': ' + error.message);
  } finally { await context.close(); await writeFile(resolve(artifacts, 'acceptance.json'), JSON.stringify(evidence, null, 2) + '\n'); }
}
// Summary continuity is separate from exact player-detail readiness. These
// helpers deliberately never call ready() while a source response is held.
const playerRows = page => page.locator('table.activity-table').filter({ has: page.locator('caption', { hasText: 'Player activity in this reporting scope' }) }).locator('tbody tr');
const summaryMeasurements = page => page.locator('.activity-summary .activity-stat > dd:first-of-type, .workspace-testing-summary .insights-tile-value strong');
async function summaryVisible(page, name) {
  const selector = name === 'Testing' ? '.workspace-testing-summary' : name === 'Workouts' ? '.admin-activity-report > .activity-summary' : '[aria-label="Participation and usage summary"] .activity-summary';
  const cards = page.locator(selector);
  await cards.waitFor();
  const values = await cards.locator(name === 'Testing' ? '.insights-tile-value strong' : '.activity-stat > dd:first-of-type').allTextContents();
  assert.equal(values.length, name === 'Workouts' ? 3 : 6, `${name} keeps its complete high-level card row.`);
  assert.ok(values.slice(0, name === 'Testing' ? 4 : values.length).every(value => /\d/.test(value)), `${name} retains measured aggregate values, not placeholder-only cards: ${JSON.stringify(values)}`);
  return values;
}
async function noPlayerDetails(page) {
  await frames(page);
  assert.equal(await playerRows(page).count(), 0, 'A previous payload must never stand in for the newly selected player rows.');
  assert.equal(await page.locator('.activity-pagination').count(), 0, 'Player pagination must wait for the exact selected response.');
}
async function summaryCleared(page) {
  await frames(page);
  const values = await summaryMeasurements(page).allTextContents();
  assert.ok(values.every(value => !/\d/.test(value)), `Invalidated cohort/account must not retain numeric summaries: ${JSON.stringify(values)}`);
  await noPlayerDetails(page);
}
async function holdView(page, name) {
  await page.evaluate(() => window.__adminActivity.holdNextReport());
  const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
  await tabs.getByRole('tab', { name, exact: true }).click();
  await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
  await frames(page);
}
async function releaseReport(page) { await page.evaluate(() => window.__adminActivity.releaseReports()); await ready(page); }

for (const [engine, driver] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.ADMIN_PERSISTENCE_ENGINE && process.env.ADMIN_PERSISTENCE_ENGINE !== engine) continue;
  const browser = await driver.launch();
  try { for (const width of [390, 1440]) {
    await check(browser, engine, width, 'first load and shared directory tabs', async page => {
      await page.goto(origin + base);
      await page.getByText('Loading organization and teams…', { exact: true }).waitFor();
      assert.equal((await counts(page)).context, 1); assert.equal((await counts(page)).roster || 0, 0);
      await page.getByRole('tab', { name: 'Staff', exact: true }).click();
      await page.getByText('Loading staff access…', { exact: true }).waitFor();
      assert.equal((await counts(page)).context, 1, 'Concurrent tab mounts share the pending context.');
      await page.evaluate(() => window.__adminPersistence.releaseDirectory()); await ready(page);
      await watch(page, false);
      for (const name of ['Manage teams', 'Organization settings', 'Staff']) await directory(page, name);
      await noFlashes(page);
      await directory(page, 'Players');
      await watch(page);
      for (const name of ['Staff', 'Manage teams', 'Organization settings', 'Players']) await directory(page, name);
      await noFlashes(page);
      const reads = await counts(page); assert.equal(reads.organizations, 1); assert.equal(reads.context, 1); assert.equal(reads.roster, 1);
    }, { hold: ['context'] });

    await check(browser, engine, width, 'report variants retained without loading flashes', async page => {
      await page.goto(origin + base); await ready(page);
      const stamps = {};
      for (const name of ['Overview', 'Testing', 'Workouts', 'Usage']) {
        const before = await reportCount(page); if (name !== 'Overview') await view(page, name);
        assert.ok([before, before + 1].includes(await reportCount(page)), 'A tab may reuse an identical payload or fetch a genuinely distinct payload once.');
        stamps[name] = await page.getByText(/^Report checked /).innerText();
      }
      const before = await counts(page); await watch(page);
      for (const name of ['Overview', 'Testing', 'Workouts', 'Usage', 'Testing', 'Overview']) {
        await view(page, name); assert.equal(await page.getByText(/^Report checked /).innerText(), stamps[name], 'Reuse preserves original observation time.');
      }
      for (const name of ['Staff', 'Manage teams', 'Organization settings', 'Players']) await directory(page, name);
      await noFlashes(page); assert.deepEqual(await counts(page), before, 'Roundtrips issue no organization, context, roster or report reads.');
      const reports = (await log(page)).filter(row => row.kind === 'getClubInsightsV2');
      assert.equal(new Set(reports.map(row => JSON.stringify(row.input))).size, reports.length, 'Every distinct request payload is fetched only once.');
      assert.equal(reports.filter(row => row.input.includeLastFeatureEvidence).length, 1, 'Only initial Usage obtains feature detail.');
      assert.equal(reports.filter(row => row.input.includeTestingAnalytics).length, 1, 'Only initial Testing obtains station analytics; its exact variant is retained.');
    });

    await check(browser, engine, width, 'expiry and explicit refresh obtain new observations', async page => {
      await page.goto(origin + base); await ready(page);
      await view(page, 'Workouts'); await view(page, 'Overview');
      const initial = await counts(page), stamp = await page.getByText(/^Report checked /).innerText();
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click(); await ready(page);
      assert.equal(await reportCount(page), initial.getClubInsightsV2 + 1);
      assert.notEqual(await page.getByText(/^Report checked /).innerText(), stamp);
      await view(page, 'Workouts');
      assert.equal(await reportCount(page), initial.getClubInsightsV2 + 2, 'Refreshing shared totals also invalidates the other retained tab variants.');
      await view(page, 'Overview');
      assert.equal(await reportCount(page), initial.getClubInsightsV2 + 2);
      await directory(page, 'Staff');
      await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 60_001);
      await directory(page, 'Players');
      const after = await counts(page); assert.equal(after.context, initial.context + 1); assert.equal(after.roster, initial.roster + 1); assert.equal(after.getClubInsightsV2, initial.getClubInsightsV2 + 3);
      await watch(page); for (const name of ['Staff', 'Players']) await directory(page, name); await noFlashes(page); assert.deepEqual(await counts(page), after);
    });

    await check(browser, engine, width, 'roster expires with its oldest shared context', async page => {
      await page.goto(origin + base + '&directoryTab=staff'); await ready(page);
      assert.equal((await counts(page)).context, 1); assert.equal((await counts(page)).roster || 0, 0);
      await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 40_000);
      await directory(page, 'Players'); assert.equal((await counts(page)).context, 1); assert.equal((await counts(page)).roster, 1);
      await directory(page, 'Staff');
      await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 20_001);
      await directory(page, 'Players');
      assert.equal((await counts(page)).context, 2); assert.equal((await counts(page)).roster, 2, 'A younger roster cannot extend the lifetime of its original context.');
    });

    await check(browser, engine, width, 'global invalidation and refresh do not duplicate reads', async page => {
      await page.goto(origin + base); await ready(page); const before = await counts(page);
      await page.evaluate(() => window.__adminPersistence.invalidate()); await ready(page);
      const after = await counts(page); assert.equal(after.context, before.context + 1); assert.equal(after.roster, before.roster + 1); assert.equal(after.getClubInsightsV2, before.getClubInsightsV2 + 1);
      await page.getByRole('button', { name: 'Refresh organizations', exact: true }).click(); await ready(page);
      assert.equal((await counts(page)).organizations, after.organizations + 1);
      await watch(page); for (const name of ['Staff', 'Organization settings', 'Players']) await directory(page, name); await noFlashes(page);
    });

    await check(browser, engine, width, 'invalidated pending response cannot refill cache', async page => {
      await page.goto(origin + base); await ready(page);
      await page.evaluate(() => window.__adminActivity.holdNextReport());
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click();
      await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
      const before = await reportCount(page);
      await page.evaluate(() => window.__adminPersistence.invalidate()); await ready(page);
      assert.equal(await reportCount(page), before + 1);
      const stamp = await page.getByText(/^Report checked /).innerText();
      await page.evaluate(() => window.__adminActivity.releaseReports()); await frames(page);
      await watch(page); for (const name of ['Staff', 'Players']) await directory(page, name); await noFlashes(page);
      assert.equal(await page.getByText(/^Report checked /).innerText(), stamp); assert.equal(await reportCount(page), before + 1);
      await page.evaluate(() => { window.__adminPersistence.holdNextDirectory('context'); });
      await page.evaluate(() => window.__adminPersistence.invalidate());
      await page.waitForFunction(() => window.__adminPersistence.pending.length === 1);
      const contextBefore = (await counts(page)).context;
      await page.evaluate(() => window.__adminPersistence.invalidate()); await ready(page);
      assert.equal((await counts(page)).context, contextBefore + 1);
      await directory(page, 'Organization settings');
      const website = await page.locator('.directory-settings').innerText();
      await page.evaluate(() => window.__adminPersistence.releaseDirectory()); await frames(page);
      await directory(page, 'Staff'); await directory(page, 'Organization settings');
      assert.equal(await page.locator('.directory-settings').innerText(), website, 'An old context response cannot replace the newer observation.');
      await directory(page, 'Players');
      const final = await counts(page); await watch(page); for (const name of ['Staff', 'Players']) await directory(page, name); await noFlashes(page); assert.deepEqual(await counts(page), final);
    });

    await check(browser, engine, width, 'global report survives directory tab roundtrip', async page => {
      await page.goto(origin + base.replace('orgId=northfield&', '')); await ready(page);
      assert.equal(await reportCount(page), 1); assert.equal((await log(page)).find(row => row.kind === 'getClubInsightsV2').input.scope.kind, 'global');
      await directory(page, 'Staff'); await page.getByRole('tab', { name: 'Players', exact: true }).click(); await ready(page);
      const before = await counts(page); await watch(page);
      for (const name of ['Staff', 'Players']) await directory(page, name);
      await noFlashes(page); assert.equal(await reportCount(page), 1); assert.equal((await counts(page)).organizations, before.organizations);
      assert.equal((await counts(page)).context || 0, 0); assert.equal((await counts(page)).roster || 0, 0);
    });

    await check(browser, engine, width, 'permission failure removes retained directory and report data', async page => {
      await page.goto(origin + base); await ready(page);
      await page.evaluate(() => window.__adminActivity.setReportMode('denied'));
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click();
      await visibleError(page, 'Synthetic admin access changed.');
      const deniedReads = await counts(page);
      for (const name of ['Staff', 'Organization settings', 'Players']) {
        await page.getByRole('tab', { name, exact: true }).click(); await frames(page);
        await visibleError(page, 'Synthetic admin access changed.');
        assert.equal(await page.locator('.directory-player-name, .directory-settings, .directory-management-table, .admin-activity-report').count(), 0, 'Known report access denial clears private directory context too.');
      }
      assert.deepEqual(await counts(page), deniedReads, 'Known denial does not trigger automatic retries on tab navigation.');
      await page.evaluate(() => window.__adminActivity.setReportMode('normal'));
      await page.getByRole('button', { name: 'Refresh organizations', exact: true }).click(); await ready(page);
      assert.ok(await page.locator('.admin-activity-report').count(), 'Explicit refresh restores the current authorized report after the synthetic denial is removed.');
      assert.match(await page.getByText(/^Report checked /).innerText(), /^Report checked .+/, 'The restored report includes its observation timestamp.');
      assert.equal(await page.getByText('Synthetic admin access changed.', { exact: true }).count(), 0, 'The previous denial is cleared after an authorized refresh.');
      await page.evaluate(() => { window.__adminActivity.setReportMode('normal'); window.__adminPersistence.setDirectoryMode('denied'); });
      await page.evaluate(() => window.__adminPersistence.invalidate());
      await visibleError(page, 'Synthetic directory permission denied.'); await frames(page);
      const count = (await counts(page)).context;
      for (const name of ['Staff', 'Organization settings', 'Players']) {
        await page.getByRole('tab', { name, exact: true }).click(); await frames(page);
        await visibleError(page, 'Synthetic directory permission denied.');
        assert.equal(await page.locator('.directory-player-name, .directory-settings, .directory-management-table, .admin-activity-report').count(), 0);
      }
      assert.equal((await counts(page)).context, count, 'Denied context remains fail-closed without an automatic request loop.');
      await page.evaluate(() => window.__adminPersistence.setDirectoryMode('normal'));
      await page.getByRole('button', { name: 'Refresh organizations', exact: true }).click(); await ready(page);
    });

    await check(browser, engine, width, 'scope and account switches clear old observations', async page => {
      await page.goto(origin + base); await ready(page); const before = await counts(page);
      await directory(page, 'Staff');
      await navigate(page, base.replace('orgId=northfield', 'orgId=riverside').replace('directoryPane=report', 'directoryPane=report&directoryTab=staff'));
      await navigate(page, base);
      assert.equal((await counts(page)).context, before.context + 2, 'Leaving and returning to an organization refetches its access/context.');
      assert.equal((await counts(page)).roster, before.roster + 1); assert.equal(await reportCount(page), before.getClubInsightsV2 + 1, 'Old reporting scope was cleared even while unmounted on Staff.');
      await navigate(page, base.replace('directoryLevel=teams', 'directoryLevel=people&teamId=harbor')); await ready(page);
      const teamReport = (await log(page)).filter(row => row.kind === 'getClubInsightsV2').at(-1); assert.equal(teamReport.input.scope.teamId, 'harbor');
      await navigate(page, base); assert.equal((await log(page)).filter(row => row.kind === 'getClubInsightsV2').at(-1).input.scope.kind, 'organization');
      const oldCount = await reportCount(page);
      await page.evaluate(() => window.__adminActivity.setAccount('synthetic-admin-two')); await ready(page);
      assert.equal(await reportCount(page), oldCount + 1); assert.equal((await log(page)).at(-1).uid, 'synthetic-admin-two');
      await page.getByText(/Second account/).first().waitFor();
      await page.evaluate(() => window.__adminActivity.setAccount(null)); await page.getByRole('heading', { name: 'Synthetic signed-out state' }).waitFor();
      await page.evaluate(() => window.__adminActivity.setAccount('synthetic-admin-one')); await ready(page);
      assert.equal(await page.getByText(/Second account/).count(), 0, 'No previous account content remains.');
    });

    await check(browser, engine, width, 'continuity held first visits retain totals without stale player details', async page => {
      await page.goto(origin + base); await ready(page);
      assert.ok(await playerRows(page).count() > 0, 'The starting Overview has actual player rows to fence.');
      for (const name of ['Testing', 'Workouts', 'Usage']) {
        if (name !== 'Testing') await view(page, 'Overview');
        await holdView(page, name);
        await summaryVisible(page, name); await noPlayerDetails(page);
        await page.getByRole('status').filter({ hasText: 'Updating activity… Showing the last successful report.' }).waitFor();
        if (name === 'Testing') {
          const pending = await page.locator('.workspace-testing').innerText();
          assert.match(pending, /Loading/i, 'Testing-only analytics are loading on their first request.');
          assert.doesNotMatch(pending, /Results by age are unavailable|Station timing is unavailable|Previous week: Unavailable/, 'An in-flight first Testing request is not unavailable evidence.');
          assert.equal(await page.locator('.workspace-testing-chart circle').count(), 0, 'No unrequested age analytics are fabricated.');
        } else await page.getByRole('status').filter({ hasText: 'Loading player details…' }).waitFor();
        await releaseReport(page); await summaryVisible(page, name);
        if (name === 'Testing') assert.ok(await page.locator('.workspace-testing-chart circle').count() > 0);
        else assert.ok(await playerRows(page).count() > 0, 'Rows arrive only after the exact selected response resolves.');
      }
    });

    await check(browser, engine, width, 'continuity held expired report return keeps only same-cohort summaries', async page => {
      await page.goto(origin + base); await ready(page); await view(page, 'Workouts');
      const values = await summaryVisible(page, 'Workouts');
      await view(page, 'Testing');
      await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 60_001);
      await holdView(page, 'Workouts');
      assert.deepEqual(await summaryVisible(page, 'Workouts'), values, 'Expired detail does not erase the last observed same-cohort totals.');
      await noPlayerDetails(page);
      await page.getByRole('status').filter({ hasText: 'Loading player details…' }).waitFor();
      await releaseReport(page); assert.ok(await playerRows(page).count() > 0);
    });

    await check(browser, engine, width, 'continuity held directory expiry restores summary shell without management access', async page => {
      await page.goto(origin + base); await ready(page);
      const values = await summaryVisible(page, 'Overview');
      await directory(page, 'Staff');
      await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + 60_001);
      await page.evaluate(() => { window.__adminPersistence.holdNextDirectory('context'); window.__adminActivity.holdNextReport(); });
      await page.getByRole('tab', { name: 'Players', exact: true }).click();
      await page.waitForFunction(() => window.__adminPersistence.pending.length === 1);
      assert.deepEqual(await summaryVisible(page, 'Overview'), values);
      await noPlayerDetails(page);
      assert.equal(await page.locator('.directory-settings, .directory-management-table, .directory-player-table, .directory-player-tools, .directory-form').count(), 0, 'Expired authorization context does not retain management or account roster controls.');
      await page.evaluate(() => window.__adminPersistence.releaseDirectory());
      await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
      await summaryVisible(page, 'Overview'); await noPlayerDetails(page);
      await releaseReport(page); assert.ok(await playerRows(page).count() > 0);
    });

    await check(browser, engine, width, 'continuity transient failure keeps aggregate evidence and clears detail rows', async page => {
      await page.goto(origin + base); await ready(page);
      const values = await summaryVisible(page, 'Overview');
      await page.evaluate(() => window.__adminActivity.setReportMode('error'));
      // A failed first Usage request has no exact Usage rows to preserve. This
      // is distinct from a same-payload refresh retaining explicitly stale rows.
      await page.getByRole('tablist', { name: 'Directory and reporting views' }).getByRole('tab', { name: 'Usage', exact: true }).click();
      await page.getByText('Refresh failed. These figures are from the last successful report. Refresh reporting to retry.', { exact: true }).waitFor();
      assert.deepEqual(await summaryVisible(page, 'Usage'), values);
      await noPlayerDetails(page);
      await page.evaluate(() => window.__adminActivity.setReportMode('normal'));
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click(); await ready(page);
      assert.ok(await playerRows(page).count() > 0);
    });

    await check(browser, engine, width, 'continuity scope date and filter changes invalidate old summaries', async page => {
      await page.goto(origin + base); await ready(page);
      for (const next of [base.replace('orgId=northfield', 'orgId=riverside'), base.replace('reportStart=2026-10-07', 'reportStart=2026-10-14'), base + '&reportDivision=girls']) {
        await page.evaluate(() => window.__adminActivity.holdNextReport());
        await page.evaluate(path => window.__adminPersistence.navigate(path), next);
        await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
        await summaryCleared(page);
        await releaseReport(page); await summaryVisible(page, 'Overview');
        // Return to a settled reference before checking a different boundary.
        await navigate(page, base); await summaryVisible(page, 'Overview');
      }
    });

    await check(browser, engine, width, 'continuity auth lifecycle and permission failure erase summary evidence', async page => {
      await page.goto(origin + base); await ready(page); await summaryVisible(page, 'Overview');
      await page.evaluate(() => { window.__adminActivity.holdNextReport(); window.__adminActivity.setAccount('synthetic-admin-two'); });
      await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
      await summaryCleared(page);
      await releaseReport(page); await summaryVisible(page, 'Overview');
      await page.evaluate(() => window.__adminActivity.setAccount(null));
      await page.getByRole('heading', { name: 'Synthetic signed-out state' }).waitFor(); await summaryCleared(page);
      await page.evaluate(() => { window.__adminActivity.holdNextReport(); window.__adminActivity.setAccount('synthetic-admin-two'); });
      await page.waitForFunction(() => window.__adminActivity.pending.length === 1);
      await summaryCleared(page); await releaseReport(page);
      await page.evaluate(() => window.__adminActivity.setReportMode('denied'));
      await page.getByRole('button', { name: 'Refresh reporting', exact: true }).click();
      await visibleError(page, 'Synthetic admin access changed.'); await summaryCleared(page);
    });
  } } finally { await browser.close(); }
}
const failed = evidence.results.filter(row => !row.passed); console.log(`${evidence.results.length - failed.length}/${evidence.results.length} persistence scenarios passed`); if (failed.length) process.exitCode = 1;
