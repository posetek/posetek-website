// Synthetic local presentation checks. Never execute a custom scheme or contact a live service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { sealReport } from './seal-parent-report.mjs';
import { pathwayFixture } from './fixtures/private-parent-pathway.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.netlify', 'private-parent-pathway-browser', new Date().toISOString().replaceAll(':', '-'));
await mkdir(output, {recursive: true});
const sample = {
  version: 1, name: 'Sample Athlete', firstName: 'Sample', team: 'Example Team', coach: 'Example Coach', testDate: 'Oct 29, 2026',
  focusTitle: 'This week: ball control', focusText: 'Small touches through turns.', playerId: 'synthetic_Player-123',
  metrics: [{label: 'Dribble', result: '7.10 s', percentile: 50, band: 'middle', average: '7.20 s', count: 12},
    {label: 'Broad jump', result: null, percentile: null, band: 'retest', average: '1.10 m', count: 10, note: 'Another recording is needed.'}],
  summary: [{label: 'Team middle', text: 'Dribble'}],
  exercises: [{title: 'Figure-8 dribble', tag: 'Optional example', dose: '3 × 20 sec · rest 60 sec', instruction: 'Walk the ball through turns.'}],
  methodNotes: ['Further right means a more favorable result.'],
  pdfBase64: Buffer.from('%PDF-1.4\n% Synthetic fixture\n%%EOF').toString('base64'),
};
const legacy = sealReport({...sample, firstName: 'Legacy', playerId: 'player.1'});
sample.pathwayVersion = 1; sample.pathwayCharts = pathwayFixture();
sample.pathwayCoverage = {broaderComparisonsPending: true, note: 'Broader Vacaville comparisons pending; only corrected groups shown.'};
const sealed = sealReport(sample);
const boysSample = structuredClone(sample); boysSample.firstName = 'Boys';
for (const chart of boysSample.pathwayCharts) {chart.reference.sexReferenceGroup = 'boys';chart.athlete = {ageGroup: 17, value: chart.athlete.value, percentile: null, placementStatus: 'no-reference'};}
const boys = sealReport(boysSample);
const invalidSample = structuredClone(sample); invalidSample.pathwayCharts[0].athlete.percentile = 101;
const invalid = sealReport(invalidSample);
const browserURL = 'https://posetek.net/athlete?player=synthetic_Player-123&view=training';
const nativeURL = 'posetek-workouts-v1://athlete?player=synthetic_Player-123&view=training';
const installURL = 'https://testflight.apple.com/join/3byuBWYW';
const requestHeaders = [];
const headers = {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"};
const server = createServer(async (request, response) => {
  requestHeaders.push({url: request.url, referer: request.headers.referer, cookie: request.headers.cookie});
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    const report = [sealed, legacy, boys, invalid].find(item => path === `/report/data/${item.id}.bin`);
    if (report) {
      response.writeHead(200, {...headers, 'Content-Type': 'application/octet-stream'});
      response.end(report.envelope); return;
    }
    const file = path === '/report/' ? 'index.html' : path.replace(/^\/report\//, '');
    if (!['index.html', 'report.css', 'render.mjs', 'loader.mjs', 'crypto.mjs'].includes(file)) {
      response.writeHead(404, headers); response.end(); return;
    }
    const bytes = await readFile(join(root, 'app/private-report', file));
    response.writeHead(200, {...headers, 'Content-Type': file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'});
    response.end(bytes);
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const cases = [
  {name: 'ios', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', ios: true},
  {name: 'ipad-desktop', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', touch: 5, ios: true},
  {name: 'android', userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', android: true},
  {name: 'unknown', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'},
  {name: 'missing-platform', userAgent: ''},
];
const results = [];
try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({headless: true});
    try {
      for (const entry of cases) {
        const context = await browser.newContext({userAgent: entry.userAgent, viewport: {width: 390, height: 844}, acceptDownloads: true});
        const blocked = [], errors = [], sockets = [];
        await context.route('**/*', route => {
          const request = route.request();
          if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
            blocked.push(request.resourceType()); return route.abort();
          }
          return route.continue();
        });
        await context.routeWebSocket('**/*', socket => { sockets.push('blocked'); socket.close(); });
        if (entry.touch) await context.addInitScript(touch => Object.defineProperty(navigator, 'maxTouchPoints', {get: () => touch}), entry.touch);
        // Prevent any native/browser/install anchor from executing. Inspect the activated href only.
        await context.addInitScript(() => {
          window.__activatedWorkoutLink = null;
          document.addEventListener('click', event => {
            const link = event.target.closest?.('.pt-workout-entry a');
            if (link) { event.preventDefault(); window.__activatedWorkoutLink = link.href; }
          }, true);
        });
        try {
          const page = await context.newPage();
          page.on('pageerror', () => errors.push('pageerror'));
          page.on('console', message => { if (message.type() === 'error') errors.push('consoleerror'); });
          await page.goto(`${origin}/report/#${sealed.fragment}`);
          await page.getByRole('heading', {name: 'Sample’s testing snapshot'}).waitFor();
          assert.equal(await page.locator('.pt-primary').count(), 1);
          assert.equal(await page.locator('.pt-primary').getAttribute('href'), entry.ios ? nativeURL : browserURL);
          assert.equal(await page.locator('.pt-pathway').count(), 3);
          assert.equal(await page.locator('.pt-pathway-athlete').count(), 3);
          assert.equal(await page.locator('.pt-pathway-density').count(), 24);
          assert.equal(await page.locator('.pt-pathway-median').count(), 6);
          assert.equal(await page.locator('.pt-coverage').count(), 1);
          assert.equal(await page.locator('.pt-marker').count(), 0);
          assert.equal(await page.locator('.pt-retest').count(), 0);
          if (entry.android) {
            assert.equal(await page.locator('a[href^="posetek-workouts-v1:"]').count(), 0);
            assert.equal(await page.locator('a[href^="https://testflight.apple.com/"]').count(), 0);
            assert.equal(await page.locator('.pt-app-options').count(), 0);
          } else {
            if (!entry.ios) {
              assert.equal(await page.locator('.pt-app-options').getAttribute('open'), null);
              await page.getByText('Using an iPhone or iPad?', {exact: true}).click();
              assert.equal(await page.getByRole('link', {name: 'Open in the PoseTek app', exact: true}).getAttribute('href'), nativeURL);
            } else {
              // A parent without the app must see install guidance before tapping, not only after an error.
              assert.equal(await page.locator('.pt-primary').textContent(), 'Open in the PoseTek app');
              assert(await page.getByText('Already have PoseTek? Sign in with Sample’s player login.', {exact: true}).isVisible());
              assert(await page.locator('.pt-primary + .pt-cta-note + .pt-install').isVisible());
              assert(await page.getByText('If the app doesn’t open, try Install or update PoseTek above, then come back and tap again. You can also continue in your browser.', {exact: true}).isVisible());
              assert.equal(await page.getByRole('link', {name: 'Continue in browser instead', exact: true}).getAttribute('href'), browserURL);
              assert(await page.getByRole('link', {name: 'Continue in browser instead', exact: true}).isVisible());
            }
            assert(await page.getByText('Don’t have PoseTek yet?', {exact: true}).isVisible());
            assert.equal(await page.getByRole('link', {name: 'Install or update PoseTek', exact: true}).getAttribute('href'), installURL);
            assert(await page.getByRole('link', {name: 'Install or update PoseTek', exact: true}).isVisible());
            assert(await page.getByText('Come back to this report and tap Open in the PoseTek app.', {exact: true}).isVisible());
          }
          for (const link of await page.locator('.pt-workout-entry a').all()) {
            assert.equal(await link.getAttribute('referrerpolicy'), 'no-referrer');
            assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
            assert(!(await link.getAttribute('href')).includes(sealed.fragment));
          }
          await page.locator('.pt-primary').click();
          assert.equal(await page.evaluate(() => window.__activatedWorkoutLink), entry.ios ? nativeURL : browserURL);
          assert.equal(new URL(page.url()).origin, origin);
          const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download PDF'}).click()]);
          const bytes = await readFile(await download.path());
          assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(Buffer.from(sample.pdfBase64, 'base64')).digest('hex'));
          await download.delete();
          for (const colorScheme of ['light', 'dark']) {
            await page.emulateMedia({colorScheme});
            for (const width of [320, 390, 430]) {
              await page.setViewportSize({width, height: 844});
              assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
            }
          }
          await page.emulateMedia({colorScheme: 'light'});
          await page.setViewportSize({width: 390, height: 844});
          const phoneImage = `${engineName}-${entry.name}-390.png`;
          await page.screenshot({path: join(output, phoneImage), fullPage: true});
          await page.locator('.pt-details > summary').click();
          await page.setViewportSize({width: 320, height: 844});
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded overflow');
          const narrowImage = `${engineName}-${entry.name}-320-details.png`;
          await page.screenshot({path: join(output, narrowImage), fullPage: true});
          await page.reload();
          await page.getByRole('heading', {name: 'Sample’s testing snapshot'}).waitFor();
          assert.equal(await page.evaluate(() => window.__activatedWorkoutLink), null);
          assert.equal(await page.locator('.pt-primary').getAttribute('href'), entry.ios ? nativeURL : browserURL);
          await page.goto(`${origin}/report/#${boys.fragment}`);
          await page.getByRole('heading', {name: 'Boys’s testing snapshot'}).waitFor();
          assert.equal(await page.locator('.pt-pathway-athlete').count(), 3);
          assert.equal(await page.locator('.pt-pathway-placement').filter({hasText: 'percentile among'}).count(), 0);
          await page.setViewportSize({width: 320, height: 844});
          assert(await page.evaluate(() => [...document.querySelectorAll('.pt-pathway-scroll')].every(region => {const marker=region.querySelector('.pt-pathway-athlete').getBoundingClientRect(), box=region.getBoundingClientRect();return marker.left>=box.left && marker.right<=box.right;})));
          if (entry.name === 'ios') await page.screenshot({path: join(output, `${engineName}-boys-320.png`), fullPage:true});
          await page.goto(`${origin}/report/#${invalid.fragment}`);
          await page.getByText('This report could not be opened. Reopen the original link or ask PoseTek for help.', {exact:true}).waitFor();
          assert.equal(await page.locator('#report-root a, #report-root svg').count(), 0);
          // Legacy v1 reports can have IDs outside the app's narrower locator grammar.
          // Keep the results and exact downloadable PDF, and disclose no invalid locator.
          await page.goto(`${origin}/report/#${legacy.fragment}`);
          await page.getByRole('heading', {name: 'Legacy’s team snapshot'}).waitFor();
          assert(await page.getByText('Workouts aren’t available from this report.', {exact: true}).isVisible());
          assert.equal(await page.locator('#report-root a').count(), 0);
          assert.equal(await page.locator('.pt-marker').count(), 1);
          const [legacyPDF] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download PDF'}).click()]);
          assert.deepEqual(await readFile(await legacyPDF.path()), Buffer.from(sample.pdfBase64, 'base64'));
          await legacyPDF.delete();
          await page.evaluate(() => { location.hash = ''; });
          await page.getByText('Open your complete private report link to see your results.', {exact: true}).waitFor();
          assert.equal(await page.locator('#report-root a').count(), 0);
          assert.deepEqual(await page.evaluate(() => ({local: localStorage.length, session: sessionStorage.length})), {local: 0, session: 0});
          assert.deepEqual(await context.cookies(), []);
          assert.deepEqual(blocked, []); assert.deepEqual(errors, []); assert.deepEqual(sockets, []);
          results.push({engine: engineName, platformHints: entry.name, status: 'passed', viewports: [320, 390, 430], colorSchemes: ['light', 'dark'], pdfExact: true, customSchemeExecuted: false, screenshots: [phoneImage, narrowImage], externalRequests: 0, errors: 0});
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert(requestHeaders.every(request => !request.referer && !request.cookie && ![sealed, legacy, boys, invalid].some(item => request.url.includes(item.fragment))));
  const receipt = {status: 'passed', coverage: ['girls distribution', 'boys absent-reference own marker', 'sparse and missing gaps', 'invalid new payload clears links', 'legacy report'], results, actualNativeOpening: 'unverified', accountWrites: false, network: 'loopback only', fixture: 'synthetic'};
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({status: 'passed', cases: results.length, receipt: join(output, 'receipt.json'), actualNativeOpening: 'unverified'}));
} finally { await new Promise(resolve => server.close(resolve)); }
