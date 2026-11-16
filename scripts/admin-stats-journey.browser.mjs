import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { createServer } from '../app/node_modules/vite/dist/node/index.js';
import { installDirectoryFixture } from '../app/scripts/admin-lightning-fixture.mjs';

// The admin Journey tab over synthetic Stats page visits (app/scripts/admin-lightning-fixture.mjs).
const vite = await createServer({ root: fileURLToPath(new URL('../app', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const url = path => origin + '/admin/accounts?journeyView=stats&' + path;
const club = 'orgId=northfield&directoryLevel=people';
const vacaville = 'orgId=vacaville-united-soccer-club&directoryLevel=people';
try {
  for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await installDirectoryFixture(page, { journey: true });
      await page.goto(url(club + '&directoryPane=report&reportView=usage'));
      const tabs = page.getByRole('tablist', { name: 'Directory and reporting views' });
      const usage = tabs.getByRole('tab', { name: 'Usage', exact: true });
      const journey = tabs.getByRole('tab', { name: 'Journey', exact: true });
      await usage.waitFor();
      // Last in the row, after One-pager tracking where that is shown.
      assert.deepEqual((await tabs.getByRole('tab').allTextContents()).slice(-3), ['Usage', 'One-pager tracking', 'Journey']);
      await usage.focus();
      await page.keyboard.press('End');
      assert(await journey.evaluate(node => node === document.activeElement));
      await page.keyboard.press('ArrowRight');
      assert(await tabs.getByRole('tab').first().evaluate(node => node === document.activeElement));
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      const panel = page.getByRole('tabpanel', { name: 'Journey' });
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();
      assert.equal(await journey.getAttribute('aria-selected'), 'true');
      assert.equal(new URL(page.url()).searchParams.get('directoryPane'), 'journey');
      assert.deepEqual(await page.evaluate(() => window.fixtureJourneyRequests.at(-1)), { organizationId: 'northfield', days: 30 });
      await page.reload();
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();
      await page.goBack();
      await page.locator('#workspace-report-tab-usage[aria-selected="true"]').waitFor();
      await page.goForward();
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();

      const cards = region => panel.getByRole('region', { name: region }).locator('.workspace-summary-card');
      const cardValues = async region => Object.fromEntries(await cards(region).evaluateAll(nodes => nodes.map(node => [node.querySelector('span').textContent, [node.querySelector('strong').textContent, node.querySelector('p')?.textContent ?? null]])));
      const split = index => cards('Funnel').nth(index).locator('.stats-journey-split li').allTextContents();
      // Landed is the base, so it carries no share; every other step says what its share is of.
      assert.deepEqual(await cardValues('Funnel'), { 'Landed on Stats': ['5', null], 'Reached the buttons': ['4', '80% of landed'], 'Clicked a button': ['3', '60% of landed'], 'Followed through': ['2', '40% of landed'] });
      assert.deepEqual(await split(2), ['Ask the AI Coach1', 'Build my 6-week plan1', 'Start a workout now1']);
      assert.deepEqual(await split(3), ['Messaged the coach1', 'Asked for a plan1', 'Started a workout0']);
      assert.deepEqual(await cardValues('Time on Stats'), { 'All visits': ['40 sec', '7 visits'], 'With a button click': ['1 min 35 sec', '3 visits'], 'Without a click': ['15 sec', '4 visits'] });
      const rows = table => panel.getByRole('table', { name: table }).locator('tbody tr').evaluateAll(nodes => nodes.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)));
      assert.deepEqual(await rows('Next stop'), [['Coach', '1', '17%', '1', '0'], ['Workouts', '1', '17%', '1', '0'], ['Home', '1', '17%', '0', '1'],
        ['Plan', '1', '17%', '1', '0'], ['Other page', '1', '17%', '0', '0'], ['Last observed on Stats', '1', '17%', '—', '—']]);
      await panel.getByText('1 visit from the last 30 minutes with no next stop yet is not counted.', { exact: true }).waitFor();
      const players = await rows('Players');
      assert.deepEqual(players.map(row => row[0]), ['Journey Athlete C', 'Journey Athlete E', 'Journey Athlete A', 'Journey Athlete B', 'Journey Athlete D']);
      assert.deepEqual(players[2].filter((_, index) => index !== 3), ['Journey Athlete A', 'Harbor U15', '2', '1 min 55 sec', 'Yes', 'Ask the AI Coach', 'Home', 'Messaged the coach']);
      // Pacific, the One-pager tracking tab's format ("Nov 10, 2026, 1:31 PM"; WebKit writes "at").
      assert.match(players[2][3], /^[A-Z][a-z]{2} \d{1,2}, \d{4},? (at )?\d{1,2}:\d{2}\s[AP]M$/);
      assert.deepEqual(players[0].slice(1, 3).concat(players[0].slice(4)), ['Summit U17', '2', '15 sec', 'No', 'None', 'Last observed on Stats', 'No']);
      assert.deepEqual(players[1].slice(1, 3), ['Unassigned', '1']);
      // A coach message with no click on the Stats page is not a follow-through.
      assert.equal(players[1].at(-1), 'No');
      assert.equal(await panel.getByRole('region', { name: 'From the one-pager' }).count(), 0);

      // A shorter period asks the server again and leaves the 20-day-old visit out.
      const period = panel.getByRole('combobox', { name: 'Period' });
      assert.equal(await period.inputValue(), '30');
      await period.selectOption({ label: 'Last 7 days' });
      await panel.getByText('4 players · 6 visits', { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixtureJourneyRequests.at(-1)), { organizationId: 'northfield', days: 7 });
      await period.selectOption({ label: 'Last 30 days' });
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();

      // Staff visits count only when asked for, and show in the Visits cell.
      const staff = panel.getByRole('checkbox', { name: 'Include staff' });
      assert.equal(await staff.isChecked(), false);
      await staff.click();
      await panel.getByText('6 players · 9 visits', { exact: true }).waitFor();
      assert.equal(await staff.isChecked(), true);
      assert.deepEqual((await cardValues('Funnel'))['Followed through'], ['3', '50% of landed']);
      const withStaff = await rows('Players');
      assert.equal(withStaff.find(row => row[0] === 'Journey Athlete B')[2], '2 (1 staff)');
      assert.equal(withStaff.find(row => row[0] === 'Journey Athlete A')[2], '2');
      await staff.click();
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();

      // Phone width: no sideways scroll, and stacked rows use the whole width.
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const widths = await panel.getByRole('table', { name: 'Players' }).locator('tbody tr').first().evaluate(row => [row.querySelector('td').getBoundingClientRect().width, row.getBoundingClientRect().width]);
      assert(widths[0] > widths[1] * 0.9, 'The first cell of a stacked row spans the row');
      await page.setViewportSize({ width: 1280, height: 900 });

      const refresh = panel.getByRole('button', { name: 'Refresh', exact: true });
      const choose = async state => { await page.evaluate(value => { window.fixtureJourneyState = value; }, state); await refresh.click(); };
      await choose('error');
      await panel.getByRole('alert').getByText('Could not load the Stats page journey. Use Refresh to retry.', { exact: true }).waitFor();
      await choose('empty');
      await panel.getByText('No visits recorded yet.', { exact: true }).waitFor();
      assert.equal(await panel.getByRole('table').count(), 0);
      await choose('incomplete');
      await panel.getByText('5 players · 7 visits · Only the newest 5,000 visits are counted.', { exact: true }).waitFor();
      await choose('normal');
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();

      // One team: only its visits, and no Team column. The organization's teams level shows all of it.
      await page.goto(url('orgId=northfield&teamId=harbor&directoryPane=journey'));
      await panel.getByText('2 players · 3 visits', { exact: true }).waitFor();
      assert.equal(await panel.getByRole('table', { name: 'Players' }).getByRole('columnheader', { name: 'Team', exact: true }).count(), 0);
      // Without One-pager tracking (a team is selected), Journey follows Usage.
      assert.deepEqual((await tabs.getByRole('tab').allTextContents()).slice(-2), ['Usage', 'Journey']);
      await page.goto(url('orgId=northfield&directoryPane=journey'));
      await panel.getByText('5 players · 7 visits', { exact: true }).waitFor();
      assert.equal(await panel.getByRole('table', { name: 'Players' }).getByRole('columnheader', { name: 'Team', exact: true }).count(), 1);
      // Never at the all-organizations level; a link there opens the list.
      await page.goto(url('directoryLevel=people&directoryPane=journey'));
      await tabs.waitFor();
      assert.equal(await journey.count(), 0);
      assert.equal(await page.getByText('Stats page journey').count(), 0);

      // With one-pager cohorts: Journey follows One-pager tracking, and the reports are followed onto Stats.
      const reports = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await installDirectoryFixture(reports, { journey: true, onePagers: true, trackingState: 'active' });
      await reports.goto(url(vacaville + '&directoryPane=journey'));
      const reportTabs = reports.getByRole('tablist', { name: 'Directory and reporting views' });
      const reportPanel = reports.getByRole('tabpanel', { name: 'Journey' });
      await reportPanel.getByText('2 players · 2 visits', { exact: true }).waitFor();
      assert.deepEqual((await reportTabs.getByRole('tab').allTextContents()).slice(-3), ['Usage', 'One-pager tracking', 'Journey']);
      const fromOnePager = reportPanel.getByRole('region', { name: 'From the one-pager' });
      await fromOnePager.waitFor();
      assert.deepEqual(await fromOnePager.locator('li').allTextContents(), ['Reports sent 33', 'Opened 3', 'Landed on Stats after opening 2', 'Clicked a button 1']);
      await fromOnePager.getByText('Landings and clicks are those in the selected period.', { exact: true }).waitFor();
      // A failing one-pager service hides that block and nothing else.
      await reports.evaluate(() => { window.fixtureTrackingState = 'list-error'; });
      await reportPanel.getByRole('button', { name: 'Refresh', exact: true }).click();
      await reportPanel.getByText('2 players · 2 visits', { exact: true }).waitFor();
      await fromOnePager.waitFor({ state: 'detached' });
      assert.equal(await reportPanel.getByRole('alert').count(), 0);
      await reports.close();
      console.log(`${name}: journey placement, navigation, counts, period, staff, team scope, one-pager and error states passed`);
    } finally { await browser.close(); }
  }
} finally { await vite.close(); }
