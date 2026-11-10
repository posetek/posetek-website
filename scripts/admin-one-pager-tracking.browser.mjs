import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { createServer } from '../app/node_modules/vite/dist/node/index.js';
import { installDirectoryFixture } from '../app/scripts/admin-lightning-fixture.mjs';

const vite = await createServer({ root: fileURLToPath(new URL('../app', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const url = path => origin + '/admin/accounts?' + path;
const club = 'orgId=vacaville-united-soccer-club&directoryLevel=people';
const trackingPath = club + '&directoryPane=one-pagers';
const original = 'vacaville-2026-11-04-05', next = 'vacaville-2026-11-09';
try {
  for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await installDirectoryFixture(page, { onePagers: true });
      await page.goto(url(club + '&directoryPane=report&reportView=usage'));
      const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
      const usage = tabs.getByRole('tab', { name: 'Usage', exact: true });
      const tracking = tabs.getByRole('tab', { name: 'One-pager tracking', exact: true });
      await usage.waitFor();
      assert.deepEqual((await tabs.getByRole('tab').allTextContents()).slice(-2), ['Usage', 'One-pager tracking']);
      await usage.focus();
      await page.keyboard.press('ArrowRight');
      assert(await tracking.evaluate(node => node === document.activeElement));
      assert.equal(await usage.getAttribute('aria-selected'), 'true');
      await page.keyboard.press('Enter');
      const panel = page.getByRole('tabpanel', { name: 'One-pager tracking' });
      await panel.getByText('Tracking has yet to start.').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('directoryPane'), 'one-pagers');
      assert.equal(new URL(page.url()).searchParams.get('orgId'), 'vacaville-united-soccer-club');
      await page.reload();
      await panel.getByText('Tracking has yet to start.').waitFor();
      await page.goBack();
      await page.locator('#workspace-report-tab-usage[aria-selected="true"]').waitFor();
      await page.goForward();
      await panel.getByText('Tracking has yet to start.').waitFor();
      const refresh = panel.getByRole('button', { name: 'Refresh tracking' });
      const choose = async value => { await page.evaluate(state => { window.fixtureTrackingState = state; }, value); await refresh.click(); };
      await choose('active');
      await panel.getByText(/Tracking started Nov 8, 2026.*12:00\s*PM Pacific/).waitFor();
      assert.equal(await panel.getByText('1 of 33', { exact: true }).count(), 1);
      assert.equal(await panel.getByText('0 of 33', { exact: true }).count(), 2);
      assert.equal(await panel.locator('tbody tr').count(), 33);
      assert.equal(await page.getByRole('button', { name: 'Filters & period' }).count(), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await choose('expired');
      await panel.getByText('The 90-day tracking period has ended.').waitFor();
      await choose('error');
      await panel.getByRole('alert').getByText('Could not load this cohort.', { exact: false }).waitFor();
      await choose('list-error');
      await panel.getByRole('alert').getByText('Could not load one-pager tracking.', { exact: false }).waitFor();
      await page.evaluate(() => { window.fixtureTrackingState = 'active'; window.fixtureNewCohort = true; });
      await refresh.click();
      const selector = panel.getByRole('combobox', { name: 'Cohort' });
      await panel.getByText('New Athlete 1').waitFor();
      assert.equal(await selector.inputValue(), next);
      assert.equal(await panel.getByText('0 of 2', { exact: true }).count(), 3);
      await selector.selectOption(original);
      await panel.getByText('Synthetic Athlete 1', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('onePagerCohort'), original);
      assert.equal(await panel.getByText('1 of 33', { exact: true }).count(), 1);
      await page.goBack();
      await panel.getByText('New Athlete 1').waitFor();
      await page.goForward();
      await panel.getByText('Synthetic Athlete 1', { exact: true }).waitFor();

      const deepLink = await browser.newPage();
      await installDirectoryFixture(deepLink, { onePagers: true, newCohort: true });
      await deepLink.goto(url(trackingPath + '&onePagerCohort=' + next));
      await deepLink.getByText('New Athlete 1').waitFor();
      await deepLink.reload();
      await deepLink.getByText('New Athlete 1').waitFor();
      await deepLink.goto(url(trackingPath + '&onePagerCohort=unknown-cohort'));
      await deepLink.getByText('This cohort is unavailable in the selected organization.').waitFor();
      await deepLink.close();

      for (const scope of [club + '&teamId=synthetic-team', 'orgId=vacaville-united-soccer-club', club + '&directoryLookup=unassigned']) {
        await page.goto(url(scope + '&directoryPane=one-pagers'));
        await tabs.waitFor();
        assert.equal(await tracking.count(), 0);
      }
      await page.goto(url('orgId=northfield&directoryLevel=people&directoryPane=one-pagers'));
      await panel.getByText('No sent one-pager cohorts for this organization yet.').waitFor();
      console.log(`${name}: one-pager placement, navigation, counts, scope and error states passed`);
    } finally { await browser.close(); }
  }
} finally { await vite.close(); }
