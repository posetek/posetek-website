import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { createServer } from '../app/node_modules/vite/dist/node/index.js';
import { installDirectoryFixture } from '../app/scripts/admin-lightning-fixture.mjs';
import { installPersistenceFixture } from '../app/scripts/admin-persistence-fixtures/install.mjs';

const vite = await createServer({ root: fileURLToPath(new URL('../app', import.meta.url)), server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const base = `${origin}/admin/accounts?orgId=northfield&directoryLevel=people&reportStart=2026-11-09&reportEnd=2026-11-16`;
const evidence = process.env.USAGE_STORY_SCREENSHOTS;
if (evidence) await mkdir(evidence, { recursive: true });

// The visual fixture above replaces the reporting hook. This separate context
// exercises the actual directory, report hook, validation and retained transport.
async function verifyUsageRequestReuse(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const network = await installPersistenceFixture(context, origin);
  await context.addInitScript(() => { window.__adminActivityOptions = { holdInitialReport: true }; });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = () => page.evaluate(() => window.__adminActivity.requests.filter(row => row.kind === 'getClubInsightsV2'));
  try {
    await page.goto(base + '&directoryPane=report&reportView=usage');
    await page.waitForFunction(() => window.__adminActivity?.pending.length === 1);
    await page.getByText('Loading activity reporting…', { exact: true }).waitFor();
    const pending = await requests();
    assert.equal(pending.length, 1, 'Initial Usage issues one report request while the server is pending.');
    assert.equal(pending[0].input.includeUsageCohorts, true);
    assert.equal(pending[0].input.includeLastFeatureEvidence, true);
    await page.evaluate(() => window.__adminActivity.releaseReports());
    await page.getByText(/^Report checked /).waitFor();
    assert.equal((await requests()).length, 1, 'Finishing the first Usage response does not start a second report.');
    const observation = await page.getByText(/^Report checked /).innerText();
    const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
    await tabs.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.waitForFunction(() => {
      const reports = window.__adminActivity.requests.filter(row => row.kind === 'getClubInsightsV2');
      return reports.length === 2 && reports.every(row => row.state === 'resolved')
        && document.querySelector('.admin-activity-report')?.getAttribute('aria-busy') === 'false'
        && ![...document.querySelectorAll('[role="status"]')].some(node => /Loading activity reporting|Updating activity/.test(node.textContent || ''));
    });
    await page.evaluate(() => window.__adminPersistence.observeLoading());
    await tabs.getByRole('tab', { name: 'Usage', exact: true }).click();
    await tabs.getByRole('tab', { name: 'Usage', exact: true, selected: true }).waitFor();
    // A click can finish before React commits the restored tab. Require the
    // retained observation itself, rather than assuming two frames are enough.
    await page.getByText(observation, { exact: true }).waitFor();
    assert.equal((await requests()).length, 2, 'Returning to fresh Usage reuses its exact observation.');
    assert.equal(await page.getByText(/^Report checked /).innerText(), observation, 'Reuse keeps the original observation time.');
    assert.deepEqual(await page.evaluate(() => window.__adminPersistence.flashes), [], 'A fresh Usage tab return does not show loading again.');
    assert.deepEqual(errors, []);
    assert.deepEqual(network.writesBlocked, []);
    assert.deepEqual(network.unexpected, []);
    console.log(`${engineName}: actual Usage hooks issue one initial request, show pending feedback and reuse a fresh tab return`);
  } finally { await context.close(); }
}
try {
  for (const [engineName, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await installDirectoryFixture(page, { usageStory: true, journey: true });
      await page.goto(base + '&directoryPane=report&reportView=usage');
      const weekly = page.getByRole('region', { name: 'Weekly participation', exact: true });
      await weekly.getByText('20% of 5 weekly active players').first().waitFor();
      assert.match(await weekly.textContent(), /Week to date · 2026-11-16 – 2026-11-16/);
      await weekly.getByRole('button', { name: /^Previous repeat users · returned on one day/ }).click();
      await page.waitForFunction(() => document.querySelector('table[aria-label="Weekly participation players"] tbody')?.children.length === 1);
      await weekly.getByRole('table', { name: 'Weekly participation players' }).getByRole('rowheader', { name: /Story Player 3/ }).waitFor();
      assert.equal(await weekly.getByRole('table').locator('tbody tr').count(), 1);
      assert.equal(new URL(page.url()).searchParams.get('reportUsageCohortGroup'), 'repeat_returned_once');
      await page.reload();
      await weekly.getByRole('table').getByRole('rowheader', { name: /Story Player 3/ }).waitFor();
      await weekly.getByRole('combobox', { name: 'Participation platform' }).selectOption('mobile_web');
      await weekly.getByText('100% of 2 weekly active players').waitFor();
      await weekly.getByRole('combobox', { name: 'Participation platform' }).selectOption('ios');
      await weekly.getByText('A weekly comparison is not yet available for this platform.').waitFor();
      await weekly.getByText(/Verified iOS builds for this breakdown: none recorded yet/).waitFor();
      await page.goBack();
      await weekly.getByText('100% of 2 weekly active players').waitFor();
      await weekly.getByRole('combobox', { name: 'Participation platform' }).selectOption('desktop_web');
      await weekly.getByRole('link', { name: 'View journey' }).first().click();
      const journey = page.getByRole('tabpanel', { name: 'Journey', exact: true });
      await journey.getByRole('heading', { name: 'Story Player 1 · recent sessions' }).waitFor();
      assert.equal(await page.evaluate(() => window.fixturePlayerJourneyRequests.at(-1).pageSize), 10);
      await journey.locator('summary').filter({ hasText: 'After explicit sign-in' }).click();
      await journey.getByRole('list', { name: 'Session activity' }).getByText(/Pressed Start workout on Stats/).waitFor();
      await journey.getByText('Observed outcomes: Workout started (1)', { exact: true }).waitFor();
      assert.match(await journey.textContent(), /Last observed here · Workouts/);
      await journey.getByRole('link', { name: 'Pages', exact: true }).click();
      await journey.getByRole('table', { name: 'Page activity' }).getByText('25%', { exact: true }).waitFor();
      await journey.getByRole('columnheader', { name: 'Session-end rate' }).waitFor();
      await journey.getByText('Last observed here: 1 / 4 ended sessions that visited this page', { exact: true }).waitFor();
      await journey.getByRole('link', { name: 'Paths', exact: true }).click();
      await journey.getByRole('table', { name: 'Common player paths' }).getByText('Stats → Workouts', { exact: true }).waitFor();
      const requestsBeforeFilters = await page.evaluate(() => window.fixturePlayerJourneyRequests.length);
      await journey.getByRole('combobox', { name: 'Player history', exact: true }).selectOption('existing');
      await journey.getByRole('combobox', { name: 'Entry', exact: true }).selectOption('sign_in');
      // The previous Paths table can still be present while the new request starts.
      const filteredRequest = await page.waitForFunction(before => {
        const requests = window.fixturePlayerJourneyRequests;
        const request = requests.at(-1);
        return requests.length > before && request?.cohort === 'existing' && request.entryFilter === 'sign_in'
          && request.clientKind === 'desktop_web' && request;
      }, requestsBeforeFilters);
      await journey.getByRole('table', { name: 'Common player paths' }).waitFor();
      assert.equal((await filteredRequest.jsonValue()).organizationId, 'northfield');
      await page.reload();
      assert.equal(await journey.getByRole('combobox', { name: 'Entry', exact: true }).inputValue(), 'sign_in');
      await journey.getByRole('link', { name: 'Players', exact: true }).click();
      await journey.getByRole('table', { name: 'Journey players' }).getByRole('link', { name: 'Story Player 1' }).click();
      await journey.getByRole('heading', { name: 'Story Player 1 · recent sessions' }).waitFor();
      await journey.getByRole('link', { name: 'Pages', exact: true }).click();
      await page.evaluate(() => { window.fixturePlayerJourneyState = 'error'; });
      await journey.getByRole('button', { name: 'Refresh journeys' }).click();
      await journey.getByRole('alert').getByText(/Could not load player journeys/).waitFor();
      assert.equal(await journey.getByRole('table').count(), 0);
      await page.evaluate(() => { window.fixturePlayerJourneyState = 'incomplete'; });
      await journey.getByRole('button', { name: 'Refresh journeys' }).click();
      await journey.getByRole('alert').getByText(/Incomplete report/).waitFor();
      await journey.getByRole('combobox', { name: 'Journey platform' }).selectOption('ios');
      await journey.getByText(/No journeys recorded for this platform/).waitFor();
      await journey.getByText(/Verified iOS builds for journeys: none recorded yet/).waitFor();
      await page.evaluate(() => { window.fixturePlayerJourneyState = 'normal'; });
      await journey.getByRole('combobox', { name: 'Journey platform' }).selectOption('mobile_web');
      await journey.getByRole('table', { name: 'Page activity' }).waitFor();
      if (evidence) await journey.screenshot({ path: `${evidence}/${engineName.toLowerCase()}-journey-desktop.png`, animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('#admin-navigation')?.inert === true);
      const narrowLayout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (narrowLayout.scrollWidth > narrowLayout.width + 1) {
        // Keep the original strict measurement; report only structural fixture
        // geometry so a hosted-only failure can be diagnosed without a retry.
        console.error('Journey narrow layout:', await page.evaluate(() => ({
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth, fonts: document.fonts.status,
          animations: document.getAnimations().map(animation => ({ state: animation.playState, target: animation.effect?.target?.className })),
          overflow: [...document.querySelectorAll('body *')].map(element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width,
              overflowX: style.overflowX, position: style.position };
          }).filter(element => element.right > innerWidth + 1).slice(0, 20),
        })));
      }
      assert(narrowLayout.scrollWidth <= narrowLayout.width + 1, `Journey fits narrow viewport: ${JSON.stringify(narrowLayout)}`);
      if (evidence) await page.screenshot({ path: `${evidence}/${engineName.toLowerCase()}-journey-mobile.png`, fullPage: true, animations: 'disabled' });
      await page.goto(base + '&teamId=harbor&directoryPane=journey&journeyView=pages');
      await journey.getByRole('table', { name: 'Page activity' }).waitFor();
      assert.equal(await page.evaluate(() => window.fixturePlayerJourneyRequests.at(-1).teamId), 'harbor');
      const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
      await tabs.getByRole('tab', { name: 'Usage', exact: true }).focus();
      await page.keyboard.press('End');
      assert(await tabs.getByRole('tab', { name: 'Journey', exact: true }).evaluate(node => node === document.activeElement));
      await page.goto(base + '&directoryPane=report&reportView=usage');
      await weekly.getByRole('table', { name: 'Weekly participation players' }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Participation fits narrow viewport');
      if (evidence) await page.screenshot({ path: `${evidence}/${engineName.toLowerCase()}-participation-mobile.png`, fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, []);
      console.log(`${engineName}: participation, platform separation, named paths, periods, persistence, coverage, error, scope and narrow layout passed`);
      await verifyUsageRequestReuse(browser, engineName);
    } finally { await browser.close(); }
  }
} finally { await vite.close(); }
