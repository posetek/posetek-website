// Reproducible, read-only comparison of two compiled marketing builds.
// node scripts/marketing-performance.mjs --baseline-dir /path/to/baseline/app/astro-dist
// Local HTTP is deliberately uncompressed. This is an asset/loading comparison,
// not a Lighthouse score or a claim about CDN/mobile-network performance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const argumentsMap = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  assert.ok(['--baseline-dir', '--candidate-dir', '--output', '--iterations'].includes(key) && value, `Unknown or missing argument: ${key}`);
  argumentsMap.set(key, value);
}
assert.ok(argumentsMap.has('--baseline-dir'), 'Pass --baseline-dir pointing to the unchanged, compiled marketing baseline.');
const baselineDirectory = resolve(argumentsMap.get('--baseline-dir'));
const candidateDirectory = resolve(argumentsMap.get('--candidate-dir') || resolve(repository, 'app/astro-dist'));
const output = resolve(argumentsMap.get('--output') || resolve(repository, 'artifacts/marketing-revamp/performance.json'));
const iterations = Number(argumentsMap.get('--iterations') || 3);
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 10, 'Iterations must be between 1 and 10.');
const allowFonts = process.env.MARKETING_ALLOW_FONTS === '1';
const quietWindowMs = 2500;
const viewport = { width: 1440, height: 1000 };
const decorativePattern = /\/(?:SVGLoader|RoomEnvironment)\.[^/]+\.js$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null;
const round = value => Math.round(value * 100) / 100;
let browser;
const servers = [];
const report = {
  measuredAt: new Date().toISOString(),
  methodology: {
    iterations, viewport, quietWindowMs,
    browser: 'Chromium; new browser context and disabled cache for every sample',
    network: 'Two local, uncompressed, no-store HTTP servers; no throttling. Timings are local smoke measurements, not hosted or field performance.',
    externalRequests: allowFonts ? 'Only HTTPS GET/HEAD to Google Fonts allowed; all other external HTTP and all WebSockets blocked.' : 'All external HTTP and WebSockets blocked; external stylesheets receive empty CSS. Font timing is excluded.',
    transfers: 'Browser Resource Timing encodedBodySize, decodedBodySize and transferSize; transferSize includes browser-reported protocol overhead. Local JS/CSS only.',
    initialWindow: 'Navigation through load plus 2500ms, with no scrolling or interaction.',
    dataWrites: 'All non-GET/HEAD requests blocked, including on loopback.',
    baselineProvenance: 'The supplied pre-existing compiled directory is the baseline; its exact source/dependency revision is not inferred. Deltas describe these artifacts and are not exclusively attributed to the revamp.',
  },
  builds: {}, comparisons: {}, contentAssets: {}, checks: [],
};

async function inventory(root) {
  const result = [];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) await visit(path);
      else if (item.isFile()) {
        const bytes = await readFile(path);
        result.push({ path: relative(root, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await visit(root);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

async function serve(directory) {
  for (const entry of ['index.html', 'coaches/index.html']) await stat(resolve(directory, entry));
  const server = createHomepagePreviewServer({ marketingRoot: directory, referenceRoot: directory });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function createContext(origin, options = {}, rejectDecoration = false) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
  const blocked = { writes: 0, external: new Set(), decorative: [] };
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { blocked.writes++; return route.abort('blockedbyclient'); }
    if (url.origin === origin) {
      if (rejectDecoration && decorativePattern.test(url.pathname)) { blocked.decorative.push(url.pathname); return route.abort('blockedbyclient'); }
      return route.continue();
    }
    if (allowFonts && url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    blocked.external.add(url.origin + url.pathname);
    if (request.resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  return { context, page, blocked };
}

function aggregateResources(entries, extension) {
  const resources = entries.filter(entry => new URL(entry.name).pathname.endsWith(extension));
  return {
    count: resources.length,
    transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
    encodedBodyBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    decodedBodyBytes: resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
    resources: resources.map(entry => ({ path: new URL(entry.name).pathname, transferBytes: entry.transferSize, encodedBodyBytes: entry.encodedBodySize, decodedBodyBytes: entry.decodedBodySize, durationMs: round(entry.duration) })),
  };
}

async function sample(origin, route) {
  const { page, context, blocked } = await createContext(origin);
  const errors = [], failedLocalRequests = [], localRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).origin === origin) localRequests.push(new URL(request.url()).pathname); });
  page.on('requestfailed', request => { if (new URL(request.url()).origin === origin) failedLocalRequests.push(new URL(request.url()).pathname); });
  await page.addInitScript(() => {
    window.__marketingLargestPaint = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__marketingLargestPaint = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  try {
    const response = await page.goto(origin + route, { waitUntil: 'load' });
    assert.equal(response.status(), 200);
    await page.waitForTimeout(quietWindowMs);
    const runtime = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      return {
        scrollY, title: document.title,
        heading: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
        hydrated: !document.querySelector('astro-island[ssr]'),
        timing: { domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd, firstContentfulPaintMs: paints.find(paint => paint.name === 'first-contentful-paint')?.startTime ?? null, largestContentfulPaintMs: window.__marketingLargestPaint || null },
        resources: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === location.origin).map(entry => ({ name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, duration: entry.duration })),
      };
    });
    assert.equal(runtime.scrollY, 0, 'Initial sample must not scroll.');
    assert.equal(await page.locator('h1').isVisible(), true, 'Essential heading is visible.');
    assert.ok(await page.locator('a[href="/signin"]').count(), 'Returning-user navigation exists.');
    assert.deepEqual(errors, []);
    assert.deepEqual(failedLocalRequests, []);
    assert.equal(blocked.writes, 0, 'Guest marketing should not attempt writes.');
    return {
      title: runtime.title, heading: runtime.heading, hydrated: runtime.hydrated,
      timing: Object.fromEntries(Object.entries(runtime.timing).map(([key, value]) => [key, value === null ? null : round(value)])),
      javascript: aggregateResources(runtime.resources, '.js'), css: aggregateResources(runtime.resources, '.css'),
      localRequestCount: localRequests.length, localRequests,
      decorativeRequestedInitially: localRequests.filter(path => decorativePattern.test(path)),
      errors, failedLocalRequests, blockedExternalRequests: [...blocked.external], attemptedWrites: blocked.writes,
    };
  } finally { await context.close(); }
}

async function essentialAndLazyChecks(origin, route) {
  const noScript = await createContext(origin, { javaScriptEnabled: false });
  try {
    await noScript.page.goto(origin + route, { waitUntil: 'load' });
    assert.equal(await noScript.page.locator('h1').isVisible(), true);
    for (const destination of ['/signin', '/bookPerformanceTest.html', '/privacy']) assert.ok(await noScript.page.locator(`a[href="${destination}"]`).count());
    assert.equal(await noScript.page.locator('.marketing-footer-mark-fallback path').count(), 1);
  } finally { await noScript.context.close(); }
  report.checks.push(`${route}: essential heading/navigation and approved static P survive disabled JavaScript`);

  const lazy = await createContext(origin);
  const requested = [];
  lazy.page.on('request', request => { if (decorativePattern.test(new URL(request.url()).pathname)) requested.push(new URL(request.url()).pathname); });
  try {
    await lazy.page.goto(origin + route, { waitUntil: 'load' });
    await lazy.page.waitForTimeout(quietWindowMs);
    assert.deepEqual(requested, []);
    await lazy.page.locator('.marketing-footer').scrollIntoViewIfNeeded();
    await lazy.page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.markState === 'enhanced');
    assert.ok(requested.some(path => path.includes('SVGLoader.')));
    assert.ok(requested.some(path => path.includes('RoomEnvironment.')));
  } finally { await lazy.context.close(); }
  report.checks.push(`${route}: decoration imports only after footer becomes visible`);

  const failure = await createContext(origin, {}, true);
  const errors = [];
  failure.page.on('pageerror', error => errors.push(error.message));
  try {
    await failure.page.goto(origin + route, { waitUntil: 'load' });
    assert.equal(await failure.page.locator('h1').isVisible(), true);
    await failure.page.locator('.marketing-footer').scrollIntoViewIfNeeded();
    await failure.page.waitForTimeout(500);
    assert.ok(failure.blocked.decorative.length > 0);
    assert.equal(await failure.page.locator('.marketing-footer-mark').getAttribute('data-mark-state'), 'static');
    assert.equal(await failure.page.locator('.marketing-footer-mark-fallback').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await failure.context.close(); }
  report.checks.push(`${route}: rejected decorative imports do not block essential content or footer`);
}

async function compareContentAssets() {
  // These read-only roots are inferred only for the standard app/astro-dist layout.
  const baselineSource = resolve(baselineDirectory, '../..');
  const candidateSource = resolve(candidateDirectory, '../..');
  const roots = ['app/src/pages/home', 'app/astro/public'];
  const retainedExtensions = new Set(['.json', '.mp4', '.mov', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico']);
  async function sourceInventory(source) {
    const entries = [];
    for (const root of roots) for (const item of await inventory(resolve(source, root))) {
      if (retainedExtensions.has(extname(item.path))) entries.push({ ...item, path: root + '/' + item.path });
    }
    const sample = 'app/src/pages/coaches/coach-samples.ts';
    const bytes = await readFile(resolve(source, sample));
    entries.push({ path: sample, bytes: bytes.length, sha256: sha256(bytes) });
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }
  const before = await sourceInventory(baselineSource), after = await sourceInventory(candidateSource);
  assert.deepEqual(after, before, 'Recorded/sample content, media, fallback visuals and public brand assets must be unchanged.');
  report.contentAssets = { baselineSource, candidateSource, exactFiles: after.length, bytes: after.reduce((sum, item) => sum + item.bytes, 0), scope: 'Homepage JSON/media/static visuals; public brand/icons; coach-samples.ts. Read-only SHA-256 comparison, not a comparison of edited component code.', files: after };
  report.checks.push(`${after.length} source content/media/brand files remain byte-identical`);
}

try {
  browser = await chromium.launch({ headless: true });
  report.methodology.chromiumVersion = browser.version();
  const origins = {};
  for (const [name, directory] of [['baseline', baselineDirectory], ['candidate', candidateDirectory]]) {
    origins[name] = await serve(directory);
    const files = await inventory(directory);
    const scripts = files.filter(file => file.path.startsWith('_astro/') && file.path.endsWith('.js'));
    const styles = files.filter(file => file.path.startsWith('_astro/') && file.path.endsWith('.css'));
    report.builds[name] = {
      directory,
      artifactFingerprint: sha256(JSON.stringify(files)),
      artifactFileCount: files.length,
      documents: files.filter(file => ['index.html', 'coaches/index.html'].includes(file.path)),
      bundleInventory: { javascriptFiles: scripts.length, javascriptBytes: scripts.reduce((sum, file) => sum + file.bytes, 0), cssFiles: styles.length, cssBytes: styles.reduce((sum, file) => sum + file.bytes, 0), note: 'All compiled application and marketing bundles; requested-route totals below define initial marketing cost.' },
      routes: { '/': [], '/coaches': [] },
    };
  }
  // Alternate baseline/candidate to limit order-related timing drift.
  for (const route of ['/', '/coaches']) {
    for (let index = 0; index < iterations; index++) for (const name of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      report.builds[name].routes[route].push(await sample(origins[name], route));
    }
    for (const sampleResult of report.builds.candidate.routes[route]) assert.deepEqual(sampleResult.decorativeRequestedInitially, []);
    const totals = name => {
      const samples = report.builds[name].routes[route];
      return Object.fromEntries([
        ['javascriptTransferBytes', median(samples.map(sample => sample.javascript.transferBytes))],
        ['javascriptEncodedBodyBytes', median(samples.map(sample => sample.javascript.encodedBodyBytes))],
        ['javascriptRequests', median(samples.map(sample => sample.javascript.count))],
        ['cssTransferBytes', median(samples.map(sample => sample.css.transferBytes))],
        ['cssEncodedBodyBytes', median(samples.map(sample => sample.css.encodedBodyBytes))],
        ['cssRequests', median(samples.map(sample => sample.css.count))],
        ...['domContentLoadedMs', 'loadMs', 'firstContentfulPaintMs', 'largestContentfulPaintMs'].map(key => [key, median(samples.map(sample => sample.timing[key]).filter(value => value !== null))]),
      ]);
    };
    const baseline = totals('baseline'), candidate = totals('candidate');
    const delta = Object.fromEntries(Object.keys(baseline).map(key => [key, baseline[key] === null || candidate[key] === null ? null : round(candidate[key] - baseline[key])]));
    report.comparisons[route] = { baseline, candidate, delta, decorativeInitialRequests: 0 };
    await essentialAndLazyChecks(origins.candidate, route);
  }
  for (const [name, directory] of [['baseline', baselineDirectory], ['candidate', candidateDirectory]]) {
    assert.equal(sha256(JSON.stringify(await inventory(directory))), report.builds[name].artifactFingerprint, `${name} compiled files changed during measurement; rerun against stable builds.`);
  }
  report.checks.push('Both complete compiled artifact fingerprints remained stable during sampling');
  await compareContentAssets();
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(done => server.close(done))));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, comparisons: report.comparisons, checks: report.checks, error: report.error, output }, null, 2));
}
