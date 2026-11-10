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
      const cards = panel.getByRole('region', { name: 'One-pager engagement totals' }).locator('.workspace-summary-card');
      const cardValues = async () => Object.fromEntries(await cards.evaluateAll(nodes => nodes.map(node => [node.querySelector('span').textContent, node.querySelector('strong').textContent])));
      assert.deepEqual(await cardValues(), { 'Reports sent': '33', 'Reports opened': '3 of 33', 'Workout button clicks': '1 of 33',
        'TestFlight clicks': '1 of 33', 'Average time on page': '2 min 30 sec' });
      await cards.last().getByText('2 reports with recorded time · 5 min in total', { exact: true }).waitFor();
      const players = panel.getByRole('table', { name: 'First recorded activity per player report' }).locator('tbody tr');
      assert.equal(await players.count(), 33);
      assert.equal(await players.nth(0).locator('td').last().textContent(), '4 min 10 sec');
      assert.equal(await players.nth(2).locator('td').last().textContent(), 'None recorded');
      // The chart runs from the start of tracking to now: sent stays level and each line steps at a first event.
      const trend = panel.getByRole('region', { name: 'Opens and clicks over time' });
      assert.deepEqual(await trend.locator('.one-pager-legend li').allTextContents(),
        ['Reports sent33', 'Reports opened3', 'Workout button clicks1', 'TestFlight clicks1']);
      const painted = await trend.locator('canvas').evaluate(node => {
        const pixels = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
        let drawn = 0; for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) drawn++;
        return { width: node.clientWidth, drawn };
      });
      assert(painted.width > 300 && painted.drawn > 500, 'The trend chart is drawn');
      await trend.getByText('View chart data', { exact: true }).click();
      const changes = trend.locator('details tbody tr');
      assert.equal(await changes.count(), 7);
      const cells = row => changes.nth(row).locator('td').allTextContents();
      assert.match((await cells(0))[0], /^Nov 8, 12:00\s*PM$/);
      assert.deepEqual((await cells(0)).slice(1), ['33', '0', '0', '0']);
      assert.match((await cells(2))[0], /^Nov 8, 2:00\s*PM$/);
      assert.deepEqual((await cells(2)).slice(1), ['33', '1', '1', '0']);
      assert.deepEqual((await cells(6)).slice(1), ['33', '3', '1', '1']);
      assert.equal(await page.getByRole('button', { name: 'Filters & period' }).count(), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      // A tracking service published before time on page reports it as unavailable, never as zero.
      await choose('legacy');
      await cards.last().getByText('Time on page is not being collected yet.', { exact: true }).waitFor();
      assert.equal((await cardValues())['Average time on page'], 'Not available');
      assert.equal((await cardValues())['Reports opened'], '1 of 33');
      assert.equal(await players.nth(0).locator('td').last().textContent(), 'Not available');
      await choose('expired');
      await panel.getByText('The 90-day tracking period has ended.').waitFor();
      await choose('error');
      await panel.getByRole('alert').getByText('Could not load one-pager tracking.', { exact: false }).waitFor();
      for (const scope of [club + '&teamId=synthetic-team', 'orgId=vacaville-united-soccer-club', 'orgId=northfield&directoryLevel=people']) {
        await page.goto(url(scope + '&directoryPane=one-pagers'));
        await tabs.waitFor();
        assert.equal(await tracking.count(), 0);
      }
      console.log(`${name}: one-pager placement, navigation, counts, scope and error states passed`);
    } finally { await browser.close(); }
  }
} finally { await vite.close(); }
