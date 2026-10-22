// Read-only browser acceptance for the actual admin directory with synthetic data.
// Start Vite on 4195, then: node scripts/admin-directory.browser.mjs
// Add --reporting-retry-only for the focused initial-failure regression.
// The shared fixture blocks external requests and denies unmocked data access.
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { installDirectoryFixture } from '../app/scripts/admin-lightning-fixture.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL(process.env.POSETEK_ADMIN_PREVIEW_URL || 'http://127.0.0.1:4195/');
if (base.hostname !== '127.0.0.1') throw new Error('Use the synthetic preview at 127.0.0.1; hosted application access is forbidden.');
const out = join(root, 'artifacts/admin-directory-browser');
await mkdir(out, { recursive: true });
const retryOnly = process.argv.includes('--reporting-retry-only');
const results = [], widths = retryOnly ? [390, 1440] : [360, 390, 430, 768, 1440, 1920];
const scope = '/admin/accounts?orgId=northfield&teamId=harbor&directoryLevel=people&reportStart=2026-09-01&reportEnd=2026-10-22';
const url = path => new URL(path, base).href;
const query = page => new URL(page.url()).searchParams;
async function settled(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function assertQuery(page, key, value) { await page.waitForFunction(([key, value]) => new URLSearchParams(location.search).get(key) === value, [key, value]); await settled(page); }
async function noOverflow(page) { return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
async function tabsFitLabels(page) { return page.locator('.directory-workspace-tabs button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth + 1)); }
async function openHierarchy(page) { const disclosure = page.locator('.directory-navigator details'); if (!await disclosure.evaluate(element => element.open)) await disclosure.locator('summary').click(); }

for (const [engine, engineName] of [[chromium, 'chromium'], [webkit, 'webkit']]) {
 const browser = await engine.launch({ headless: true });
 try {
  for (const width of widths) {
   if (!retryOnly) {
   const context = await browser.newContext({ viewport: { width, height: 960 }, hasTouch: width <= 768 });
   const page = await context.newPage(), checks = [], pageErrors = [];
   const check = (condition, label) => { if (!condition) throw new Error(`${engineName} ${width}: ${label}`); checks.push(label); };
   const activate = locator => width <= 768 ? locator.tap() : locator.click();
   const capture = async name => { await settled(page); await page.screenshot({ path: join(out, `${engineName}-${width}-${name}.png`), fullPage: false }); };
   page.on('pageerror', error => pageErrors.push(error.message));
   try {
    await installDirectoryFixture(page);
    await page.goto(url(scope));
    await page.locator('.directory-player-name').first().waitFor();
    await settled(page);
    check(await noOverflow(page), 'initial directory has no page overflow');
    check(await page.locator('.directory-player-name').filter({ hasText: 'Alexandria-Catherine' }).count() === 1, 'long name is present in actual roster');
    const firstRow = await page.locator('.directory-player-table tbody tr').first().boundingBox();
    const initialGeometry = { firstRowY: firstRow.y, firstRowHeight: firstRow.height, width };
    await capture('people');
    const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
    await tabs.getByRole('tab', { name: 'People', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    check(await tabs.getByRole('tab', { name: 'People', exact: true }).getAttribute('aria-selected') === 'true', 'arrow focus does not prematurely switch report view');
    await page.keyboard.press('Space');
    await assertQuery(page, 'directoryPane', 'report');
    check(await tabs.getByRole('tab', { name: 'Overview', exact: true }).getAttribute('aria-selected') === 'true', 'keyboard activation opens Overview');
    for (const view of ['Testing', 'Workouts', 'Usage']) {
      await tabs.getByRole('tab', { name: view, exact: true }).click();
      await assertQuery(page, 'reportView', view.toLowerCase());
      await page.locator(`#workspace-report-panel-${view.toLowerCase()}`).waitFor({state:'visible'});
      check(await page.locator(`#workspace-report-panel-${view.toLowerCase()}`).isVisible(), `${view} report remains available`);
      check(await noOverflow(page), `${view} report has no page overflow`);
    }
    await page.goBack(); await assertQuery(page, 'reportView', 'workouts');
    await page.goForward(); await assertQuery(page, 'reportView', 'usage');
    await page.reload(); await page.locator('#workspace-report-tab-usage[aria-selected="true"]').waitFor();
    check(query(page).get('directoryPane') === 'report', 'reload and Back/Forward preserve report selection');
    await capture('usage');
    await tabs.getByRole('tab', { name: 'People', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Find a player in this organization' });
    await search.fill('Alexandria');
    await page.waitForFunction(() => document.querySelectorAll('.directory-player-name').length === 1);
    check(query(page).get('search') === 'Alexandria', 'name search updates the retained directory query');
    await page.reload(); await page.locator('.directory-player-name').first().waitFor();
    check(await search.inputValue() === 'Alexandria', 'reload restores the directory search');
    await search.fill('A name that cannot match');
    await page.getByText('No players match this search.', { exact: true }).waitFor();
    check(await page.locator('.directory-player-name').count() === 0, 'no-match search stays distinct from loading');
    await search.fill(''); await page.waitForFunction(() => document.querySelectorAll('.directory-player-name').length > 1);
    const row = page.locator('.directory-player-table tbody tr').first();
    await activate(row.locator('summary'));
    await page.keyboard.press('Escape');
    check(await row.locator('details').evaluate(element => !element.open && element.querySelector('summary') === document.activeElement), 'row action Escape restores its control');
    await activate(row.locator('summary'));
    await activate(row.getByRole('link', { name: /^Workouts for / }));
    await page.getByRole('heading', { name: 'Synthetic record destination' }).waitFor();
    check(query(page).get('playerTab') === 'workouts' && query(page).get('returnTo')?.startsWith('/admin/accounts?'), 'row Workouts keeps explicit panel and validated directory return');
    await page.getByRole('link', { name: 'Back to directory' }).click();
    await page.locator('.directory-player-name').first().waitFor();
    const filters = page.getByRole('button', { name: 'Filters & period', exact: true });
    await activate(filters);
    let dialog = page.locator('dialog.directory-filter-dialog[open]');
    await dialog.waitFor();
    check(await dialog.locator('select').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 44)), 'filter selectors retain 44px touch targets');
    await dialog.evaluate(element=>{window.__directoryDialog=element});
    await page.keyboard.press('Shift+Tab');
    check(await dialog.evaluate(element => element.contains(document.activeElement)), 'filter sheet contains backward focus');
    await page.keyboard.press('Tab');
    check(await dialog.evaluate(element => element.contains(document.activeElement)), 'filter sheet contains forward focus');
    await page.keyboard.press('Escape');
    check(await filters.evaluate(element => element === document.activeElement), 'filter Escape restores opener');
    await activate(filters);
    dialog = page.locator('dialog.directory-filter-dialog[open]');
    await dialog.getByRole('button', { name: '4 weeks', exact: true }).click();
    await assertQuery(page, 'reportWeeks', '4');
    await dialog.getByLabel('Reporting timezone').selectOption('America/New_York');
    await assertQuery(page, 'reportTimezone', 'America/New_York');
    await dialog.getByRole('button', { name: 'Selected period only', exact: true }).click();
    await assertQuery(page, 'reportTestingWindow', 'period');
    await dialog.getByRole('button', { name: 'Selected period only', exact: true }).focus();
    for (let step = 0; step < 20 && !await dialog.locator('.workspace-custom-period summary').evaluate(element => element === document.activeElement); step++) await page.keyboard.press('Tab');
    check(await dialog.locator('.workspace-custom-period summary').evaluate(element => element === document.activeElement), 'Custom dates is reachable through the modal keyboard order');
    await page.keyboard.press('Enter');
    await dialog.getByLabel('From', { exact: true }).fill('2026-10-01');
    await dialog.getByLabel('Through', { exact: true }).fill('2026-10-22');
    await dialog.getByRole('button', { name: 'Apply dates', exact: true }).click();
    await assertQuery(page, 'reportStart', '2026-10-01');
    check(await dialog.isVisible(), 'period edits preserve the open sheet');
    await dialog.getByRole('combobox', { name: 'Testing status', exact: true }).focus();
    await dialog.getByRole('combobox', { name: 'Testing status', exact: true }).selectOption('noRecordedTests');
    await assertQuery(page, 'reportTestingStatus', 'noRecordedTests');
    await settled(page);
    check(await dialog.evaluate(element=>element===window.__directoryDialog), 'adding a player filter preserves the same open sheet');
    check(await dialog.getByRole('combobox', { name: 'Testing status', exact: true }).evaluate(element => element === document.activeElement), 'filter edits retain the focused select');
    await dialog.getByRole('combobox', { name: 'Workout status', exact: true }).selectOption('none');
    await assertQuery(page, 'reportWorkoutStatus', 'none');
    check(await dialog.isVisible(), 'a second filter can be added without reopening');
    await capture('filters');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('.directory-active-filters [aria-label="Active player filters"]').waitFor();
    check(await page.locator('.directory-active-filters [aria-label="Active player filters"] button').count() === 2, 'active filters remain visible beside the list');
    await page.reload(); await page.locator('.directory-active-filters [aria-label="Active player filters"]').waitFor();
    check(query(page).get('reportWorkoutStatus') === 'none', 'reload retains player filters');
    await activate(filters);
    dialog = page.locator('dialog.directory-filter-dialog[open]');
    await dialog.getByRole('button', { name: 'Clear all filters', exact: true }).click();
    await assertQuery(page, 'reportTestingStatus', null);
    await settled(page);
    check(await dialog.isVisible(), 'clearing filters preserves the sheet and current period');
    check(query(page).get('reportStart') === '2026-10-01' && query(page).get('reportTimezone') === 'America/New_York', 'clearing filters does not reset period or timezone');
    await page.keyboard.press('Escape');
    await openHierarchy(page);
    await page.getByRole('navigation', { name: 'Organization hierarchy' }).getByRole('button', { name: 'Riverside Athletic', exact: true }).click();
    await assertQuery(page, 'orgId', 'riverside');
    await page.getByRole('heading', { name: 'Teams in Riverside Athletic' }).waitFor();
    check(query(page).get('teamId') === null && query(page).get('reportStart') === '2026-10-01', 'organization transition clears team and preserves report dates');
    await page.locator('.directory-team-card').filter({ hasText: 'Cedar U13' }).click();
    await assertQuery(page, 'teamId', 'cedar');
    await page.locator('.directory-player-name').first().waitFor();
    check(query(page).get('directoryPane') === 'list', 'team selection opens its people list');
    await capture('scope');
    if (width <= 768) {
      await page.setViewportSize({ width: 960, height: width }); await settled(page);
      check(await noOverflow(page), 'landscape has no page overflow');
      await capture('landscape');
      await page.setViewportSize({ width, height: 960 }); await settled(page);
      check(await noOverflow(page), 'portrait restoration has no page overflow');
    }
    if (width === 1440) {
      // 720 CSS px at 2x density is the reflow-equivalent viewport for 1440px/200%.
      // This is explicitly not a claim of driving a browser's native zoom menu.
      await page.setViewportSize({ width: 720, height: 480 }); await settled(page);
      check(await noOverflow(page), '200%-zoom-equivalent reflow has no page overflow');
      await activate(filters); await dialog.waitFor();
      check(await dialog.evaluate(element => { const box = element.getBoundingClientRect(); return box.width <= innerWidth && box.height <= innerHeight + 1; }), 'filter sheet fits the zoom-equivalent viewport');
      await capture('zoom-equivalent');
      await page.keyboard.press('Escape');
    }
    check(pageErrors.length === 0, 'normal journeys have no page errors');
    results.push({ engine: engineName, width, state: 'normal and long names', checks, initialGeometry, pageErrors });
    console.log(`${engineName} ${width}px: ${checks.length} directory checks passed`);
   } catch (error) {
    await page.screenshot({ path: join(out, `${engineName}-${width}-failure.png`), fullPage: false });
    await writeFile(join(out, 'failure.json'), JSON.stringify({ engine: engineName, width, url: page.url(), message: String(error), checks, pageErrors }, null, 2));
    throw error;
   } finally { await context.close(); }
   for (const state of ['loading', 'empty', 'error']) {
    const context = await browser.newContext({ viewport: { width, height: 960 } }), page = await context.newPage(), errors = [];
    try {
      page.on('pageerror', error => errors.push(error.message));
      await installDirectoryFixture(page, { state });
      await page.goto(url('/admin/accounts'));
      await page.getByRole('heading', { name: 'People & organizations', exact: true }).waitFor();
      await openHierarchy(page);
      const text = state === 'loading' ? 'Loading organizations…' : state === 'empty' ? 'No organizations yet. Add one in Organization settings.' : 'Synthetic directory unavailable. Retry this read.';
      await page.getByText(text, { exact: true }).first().waitFor();
      if (!await noOverflow(page) || errors.length) throw new Error(`${engineName} ${width} ${state}: overflow or page errors`);
      if (!await tabsFitLabels(page)) throw new Error(`${engineName} ${width} ${state}: tab label overflows its target`);
      await page.screenshot({ path: join(out, `${engineName}-${width}-${state}.png`), fullPage: false });
      results.push({ engine: engineName, width, state, checks: ['state is explicit', 'no page overflow', 'tab labels fit their targets', 'no page errors'], pageErrors: errors });
    } finally { await context.close(); }
   }
   }
   if ([390, 1440].includes(width)) for (const queue of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, hasTouch: width === 390 });
    const page = await context.newPage(), checks = [], errors = [], state = queue ? 'reporting retry in filtered queue' : 'reporting retry in People';
    const check = (condition, label) => { if (!condition) throw new Error(`${engineName} ${width} ${state}: ${label}`); checks.push(label); };
    try {
      page.on('pageerror', error => errors.push(error.message));
      await installDirectoryFixture(page, { state: 'reporting-error-first' });
      await page.goto(url(scope + (queue ? '&directoryPane=list&reportMode=attention&reportView=testing&reportTestingStatus=partiallyTested' : '&directoryPane=list')));
      const alert = page.getByRole('alert').filter({ hasText: 'Synthetic reporting unavailable.' });
      await alert.waitFor({ state: 'visible' });
      check(await page.getByRole('tab', { name: 'People', exact: true }).getAttribute('aria-selected') === 'true', 'initial reporting failure is exposed without opening reports');
      const rows = page.locator('.directory-player-table tbody tr');
      check(queue ? await rows.count() === 0 : await rows.count() > 0, queue ? 'failed queue does not present invented rows' : 'reporting failure retains account roster');
      if (!queue) check(await rows.first().locator('.directory-metric').allTextContents().then(values => values.every(value => value === 'Unavailable')), 'failed metrics remain unavailable');
      await alert.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(out, `${engineName}-${width}-${queue ? 'queue' : 'people'}-reporting-error.png`), fullPage: false });
      const retry = alert.locator('..').getByRole('button', { name: 'Try again', exact: true });
      if (width === 390) await retry.tap(); else await retry.click();
      await alert.waitFor({ state: 'detached' });
      await rows.first().waitFor({ state: 'visible' });
      check(await rows.first().locator('[data-label="Testing"]').innerText().then(value => value.includes('Partially tested') && value.includes('/6 exercises')), 'retry restores recorded metric cells');
      check(query(page).get('orgId') === 'northfield' && query(page).get('teamId') === 'harbor' && query(page).get('directoryPane') === 'list' && (!queue || query(page).get('reportTestingStatus') === 'partiallyTested'), 'retry retains scope, list selection and active filter');
      check(await noOverflow(page), 'retry state has no page overflow');
      check(errors.length === 0, 'retry journey has no page errors');
      await rows.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(out, `${engineName}-${width}-${queue ? 'queue' : 'people'}-reporting-recovered.png`), fullPage: false });
      results.push({ engine: engineName, width, state, checks, pageErrors: errors });
      console.log(`${engineName} ${width}px: ${checks.length} ${state} checks passed`);
    } finally { await context.close(); }
   }
  }
 } finally { await browser.close(); }
}
await writeFile(join(out, retryOnly ? 'reporting-retry-results.json' : 'results.json'), JSON.stringify({ limitations: ['Synthetic transport and report fixture; no real accounts or writes.', 'Record destinations are URL-only surrogates, not actual PlayerDetail acceptance.', 'Headless Chromium/WebKit; not physical phones.', 'Zoom scenario is viewport reflow equivalent, not native browser zoom.'], results }, null, 2) + '\n');
