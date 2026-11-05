// Isolated synthetic acceptance; no authentication, external service, or persisted writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from '../node_modules/playwright/index.mjs';
import { installActivityFixture } from './admin-activity-fixtures/install.mjs';
const origin = process.env.POSETEK_ADMIN_PREVIEW_URL || 'http://127.0.0.1:4276';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const output = process.env.ADMIN_REPORTING_ARTIFACTS;
assert.ok(output, 'Set external evidence output path.');
await mkdir(output, { recursive: true });
const results = [];
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const network = await installActivityFixture(context, origin);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const initial = `${origin}/admin/accounts?orgId=northfield&directoryLevel=teams&directoryPane=report&reportView=overview&reportStart=2026-10-07&reportEnd=2026-11-03&reportTimezone=America%2FLos_Angeles`;
      await page.goto(initial);
      assert.equal(await page.locator('.directory-period-summary').count(), 0);
      for (const view of ['Overview', 'Testing', 'Workouts', 'Usage']) {
        if (view !== 'Overview') await page.getByRole('tab', { name: view, exact: true }).click();
        const panel = page.getByRole('tabpanel', { name: view, exact: true });
        await panel.waitFor();
        await page.waitForFunction(() => !document.body.textContent.includes('Loading activity reporting…'));
        if (view === 'Testing') {
          await panel.getByRole('heading', { name: 'Results by age', exact: true }).waitFor();
          const select = panel.getByRole('combobox', { name: 'Results by age drill' });
          await select.selectOption('sprint');
          await panel.getByRole('group', { name: /Sprint results by current age/ }).waitFor();
          assert.equal(await panel.getByRole('heading', { name: 'Qualified performance by week', exact: true }).count(), 0);
          assert.equal(await panel.getByRole('table', { name: 'Players matching the current filters' }).count(), 0);
          const headings = await panel.locator('h2').allTextContents();
          assert.ok(headings.indexOf('Station analytics') < headings.indexOf('Testing activity by week'));
          assert.equal(await panel.locator('.workspace-testing-summary .insights-tile').count(), 6);
        } else {
          await panel.locator('.admin-activity-report[aria-busy="false"]').waitFor();
          assert.equal(await panel.getByRole('heading', { name: 'People to follow up with', exact: true }).count(), 0);
          if (view === 'Overview' || view === 'Usage') {
            assert.equal(await panel.locator('.activity-summary-six .activity-stat').count(), 6);
            const repeat = panel.locator('.activity-summary-six .activity-stat').filter({ has: page.getByText('Repeat users', { exact: true }) });
            assert.equal(await repeat.locator('.activity-stat-value').innerText(), '14');
            assert.equal(await repeat.locator('.activity-stat-note').innerText(), 'Active on 2+ days in the shown week');
          }
          if (view === 'Overview') assert.equal(await panel.getByRole('heading', { name: 'Compare teams', exact: true }).count(), 0);
          if (view === 'Workouts') {
            assert.equal(await panel.getByRole('heading', { name: 'Work completed', exact: true }).count(), 0);
            const order = await panel.locator('h2').allTextContents();
            assert.ok(order.indexOf('Workout activity by week') < order.indexOf('Player workouts'));
          }
          if (view === 'Usage') {
            await panel.getByRole('heading', { name: 'Estimated active use by day', exact: true }).waitFor();
            const daily = panel.locator('.daily-usage');
            for (const range of ['1 week', '2 weeks', '1 month', '2 months']) await daily.getByRole('button', { name: range, exact: true }).click();
            await daily.getByRole('button', { name: 'Total', exact: true }).click();
            await daily.getByRole('button', { name: 'By category', exact: true }).click();
            const order = await panel.locator('h2').allTextContents();
            assert.ok(order.indexOf('Estimated active use by week') < order.indexOf('Estimated active use by day'));
            assert.ok(order.indexOf('Estimated active use by day') < order.indexOf('Player app usage'));
            assert.equal(await daily.getByText('Daily category detail unavailable', { exact: false }).count(), 0);
          }
        }
        const extent = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        assert.ok(extent.document <= width + 1 && extent.body <= width + 1, JSON.stringify(extent));
        const file = resolve(output, `${engineName}-${width}-${view.toLowerCase()}.png`);
        await page.screenshot({ path: file, fullPage: true });
        if (width === 1440 && view === 'Overview') await page.locator('[aria-label="Participation and usage summary"]').screenshot({ path: resolve(output, `${engineName}-summary-cards.png`) });
        results.push({ engine: engineName, width, view, status: 'passed', screenshot: file });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(network.writesBlocked, []);
      assert.deepEqual(network.unexpected, []);
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile(resolve(output, 'results.json'), JSON.stringify({ results, limitations: ['Synthetic data and auth adapter; no live metric or deployed acceptance.', 'Headless desktop engines; no physical-device acceptance.'] }, null, 2));
console.log(JSON.stringify({ passed: results.length, output }));
