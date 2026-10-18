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
import { workerScriptPattern, workerScriptAccounting, verifyDerivedBrandShape } from './marketing-performance-metrics.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const argumentsMap = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  assert.ok(['--baseline-dir', '--candidate-dir', '--baseline-report', '--output', '--iterations'].includes(key) && value, `Unknown or missing argument: ${key}`);
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
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null;
const round = value => Math.round(value * 100) / 100;
let browser;
const servers = [];
const serverTraffic = new Map();
const report = {
  measuredAt: new Date().toISOString(),
  methodology: {
    iterations, viewport, quietWindowMs,
    browser: 'Chromium; new browser context and disabled cache for every sample',
    network: 'Two local, uncompressed, no-store HTTP servers; no throttling. Timings are local smoke measurements, not hosted or field performance.',
    externalRequests: allowFonts ? 'Only HTTPS GET/HEAD to Google Fonts allowed; all other external HTTP and all WebSockets blocked.' : 'All external HTTP and WebSockets blocked; external stylesheets receive empty CSS. Font timing is excluded.',
    transfers: 'Document Resource Timing for page JS/CSS. Completed worker entry GET responses are observed independently by the loopback HTTP server and counted separately from the exact served inventory because document Resource Timing and page network events can omit them. Worker body bytes are uncompressed artifact bytes per completed HTTP response, not browser protocol transfer bytes. Page JS excludes worker entries even when Resource Timing includes one.',
    workerTiming: 'Worker script bytes and actual first-frame metadata are loading evidence, not main-thread execution time. This headless local audit does not establish input latency, compositor cost, hardware readiness or a GPU performance budget; use the separate cold hardware trace suite.',
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
  const traffic = [];
  server.on('request', (request, response) => {
    response.once('finish', () => {
      if (request.method === 'GET' && response.statusCode === 200) traffic.push({ path: new URL(request.url, 'http://localhost').pathname, status: response.statusCode });
    });
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  serverTraffic.set(origin, traffic);
  return origin;
}

async function createContext(origin, options = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
  const blocked = { writes: 0, external: new Set(), workers: [], rejectWorkers: false };
  const traffic = serverTraffic.get(origin), firstResponse = traffic.length;
  const network = {
    requests: [], failedLocalRequests: [],
    get servedResponses() { return traffic.slice(firstResponse); },
    get successfulWorkerRequests() { return this.servedResponses.map(response => response.path).filter(path => workerScriptPattern.test(path)); },
  };
  context.on('request', request => { if (new URL(request.url()).origin === origin) network.requests.push(new URL(request.url()).pathname); });
  context.on('requestfailed', request => { if (new URL(request.url()).origin === origin) network.failedLocalRequests.push(new URL(request.url()).pathname); });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { blocked.writes++; return route.abort('blockedbyclient'); }
    if (url.origin === origin) {
      if (blocked.rejectWorkers && workerScriptPattern.test(url.pathname)) { blocked.workers.push(url.pathname); return route.abort('blockedbyclient'); }
      return route.continue();
    }
    if (allowFonts && url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    blocked.external.add(url.origin + url.pathname);
    if (request.resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  await context.addInitScript(() => {
    window.__marketingWorkers = [];
    const NativeWorker = window.Worker;
    if (!NativeWorker) return;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const record = { name: options?.name || '', url: String(url), createdAt: performance.now(), ready: null, failure: null };
        window.__marketingWorkers.push(record);
        this.addEventListener('message', event => {
          if (event.data?.type === 'ready') record.ready = { at: performance.now(), frames: event.data.frames, gpu: event.data.gpu };
          if (event.data?.type === 'failed') record.failure = { at: performance.now(), stage: event.data.stage, reason: event.data.reason };
        });
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  return { context, page, blocked, network };
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

async function sample(origin, route, files) {
  const { page, context, blocked, network } = await createContext(origin);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
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
        workers: window.__marketingWorkers,
        timing: { domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd, firstContentfulPaintMs: paints.find(paint => paint.name === 'first-contentful-paint')?.startTime ?? null, largestContentfulPaintMs: window.__marketingLargestPaint || null },
        resources: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === location.origin).map(entry => ({ name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, duration: entry.duration })),
      };
    });
    assert.equal(runtime.scrollY, 0, 'Initial sample must not scroll.');
    assert.equal(await page.locator('h1').isVisible(), true, 'Essential heading is visible.');
    assert.ok(await page.locator('a[href="/signin"]').count(), 'Returning-user navigation exists.');
    assert.deepEqual(errors, []);
    assert.deepEqual(network.failedLocalRequests, []);
    assert.equal(blocked.writes, 0, 'Guest marketing should not attempt writes.');
    return {
      title: runtime.title, heading: runtime.heading, hydrated: runtime.hydrated,
      timing: Object.fromEntries(Object.entries(runtime.timing).map(([key, value]) => [key, value === null ? null : round(value)])),
      javascript: aggregateResources(runtime.resources.filter(entry => !workerScriptPattern.test(new URL(entry.name).pathname)), '.js'), css: aggregateResources(runtime.resources, '.css'),
      workerScripts: workerScriptAccounting(network.successfulWorkerRequests, runtime.resources, files), workers: runtime.workers,
      localRequestCount: network.requests.length, localRequests: network.requests, completedLocalResponses: network.servedResponses,
      errors, failedLocalRequests: network.failedLocalRequests, blockedExternalRequests: [...blocked.external], attemptedWrites: blocked.writes,
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
    await noScript.page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    assert.equal(await noScript.page.locator('.pt-navigation-disclosure').evaluate(node => node.open), true);
    assert.equal(await noScript.page.locator('.pt-menu-pages a').first().isVisible(), true);
  } finally { await noScript.context.close(); }
  report.checks.push(`${route}: essential heading/navigation and approved static P survive disabled JavaScript`);

  const lazy = await createContext(origin);
  try {
    await lazy.page.goto(origin + route, { waitUntil: 'load' });
    await lazy.page.waitForTimeout(quietWindowMs);
    assert.equal(await lazy.page.evaluate(() => window.__marketingWorkers.filter(worker => worker.name === 'posetek-brand').length), 0, 'Footer must not allocate a worker before it is on screen; the hero may already have its own worker.');
    assert.equal(await lazy.page.locator('.marketing-footer-mark').getAttribute('data-mark-state'), 'static');
    await lazy.page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await lazy.page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'visible' });
    await lazy.page.keyboard.press('Escape');
    await lazy.page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'hidden' });
    await lazy.page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
    await lazy.page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.markState === 'enhanced');
    const workers = await lazy.page.evaluate(() => window.__marketingWorkers);
    const brand = workers.find(worker => worker.name === 'posetek-brand');
    assert.ok(brand?.ready?.frames > 0 && brand.ready.gpu, 'Visible footer must report actual worker-rendered frames.');
    assert.ok(lazy.network.successfulWorkerRequests.some(path => path === new URL(brand.url, origin).pathname), 'The real footer worker script request was observed.');
    report.workerLifecycle ??= {};
    report.workerLifecycle[route] = { workers, observedWorkerRequests: lazy.network.successfulWorkerRequests };
  } finally { await lazy.context.close(); }
  report.checks.push(`${route}: initial navigation remains usable; footer allocates its worker only when visible and completes a real frame`);

  const failure = await createContext(origin);
  const errors = [];
  failure.page.on('pageerror', error => errors.push(error.message));
  try {
    await failure.page.goto(origin + route, { waitUntil: 'load' });
    assert.equal(await failure.page.locator('h1').isVisible(), true);
    if (route === '/') await failure.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.renderer === 'webgl');
    failure.blocked.rejectWorkers = true;
    await failure.page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
    await failure.page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.rendererState === 'failed');
    assert.ok(failure.blocked.workers.length > 0, 'A real footer worker request was rejected.');
    assert.equal(await failure.page.evaluate(() => window.__marketingWorkers.filter(worker => worker.name === 'posetek-brand').length), 1);
    assert.equal(await failure.page.locator('.marketing-footer-mark').getAttribute('data-mark-state'), 'static');
    assert.equal(await failure.page.locator('.marketing-footer-mark-fallback').isVisible(), true);
    assert.equal(await failure.page.locator('.marketing-footer-mark canvas').count(), 0);
    await failure.page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await failure.page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'visible' });
    await failure.page.keyboard.press('Escape');
    await failure.page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    assert.equal(failure.blocked.writes, 0);
    report.workerLifecycle[route].rejectedFooter = { blockedRequests: failure.blocked.workers, state: await failure.page.locator('.marketing-footer-mark').getAttribute('data-renderer-state'), fallbackVisible: true, canvasCount: 0 };
  } finally { await failure.context.close(); }
  report.checks.push(`${route}: rejected footer worker retains the approved SVG, removes the unusable canvas and leaves navigation usable`);
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
  const derivedPath = 'app/src/pages/home/marketing-renderer/brand-shape.json';
  const derivedAsset = after.find(item => item.path === derivedPath);
  assert.ok(derivedAsset && !before.some(item => item.path === derivedPath), 'The only added source content file is the derived brand geometry.');
  const retained = after.filter(item => item.path !== derivedPath);
  assert.deepEqual(retained, before, 'Existing recorded/sample content, media, fallback visuals and public brand assets must be unchanged; no other new asset is exempt.');
  const derived = JSON.parse(await readFile(resolve(candidateSource, derivedPath), 'utf8'));
  const approved = await readFile(resolve(candidateSource, 'app/astro/public/brand/posetek-p.svg'));
  verifyDerivedBrandShape(derived, approved, sha256);
  report.contentAssets = { baselineSource, candidateSource, exactFiles: retained.length, bytes: retained.reduce((sum, item) => sum + item.bytes, 0), scope: 'Existing homepage JSON/media/static visuals; public brand/icons; coach-samples.ts. Only the newly derived brand-shape.json is separate; its approved SVG hash and complete contour commands are independently verified.', files: retained, derivedBrandGeometry: { ...derivedAsset, source: derived.source, sourceSha256: derived.sha256, commandCount: derived.commands.length, approvedContourExact: true } };
  report.checks.push(`${retained.length} existing source content/media/brand files remain byte-identical; new P geometry exactly matches the approved source contour`);
}

try {
  browser = await chromium.launch({ headless: true });
  report.methodology.chromiumVersion = browser.version();
  const origins = {}, inventories = {};
  for (const [name, directory] of [['baseline', baselineDirectory], ['candidate', candidateDirectory]]) {
    origins[name] = await serve(directory);
    const files = await inventory(directory);
    inventories[name] = files;
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
  if (argumentsMap.has('--baseline-report')) {
    const path = resolve(argumentsMap.get('--baseline-report')), bytes = await readFile(path), previous = JSON.parse(bytes);
    assert.equal(previous.status, 'passed', 'Prior baseline report must be a completed successful comparison.');
    assert.equal(report.builds.baseline.artifactFingerprint, previous.builds.baseline.artifactFingerprint, 'The pre-existing primary-checkout baseline must still match its historical report.');
    report.methodology.previousBaselineReport = { path, sha256: sha256(bytes), measuredAt: previous.measuredAt, artifactFingerprint: previous.builds.baseline.artifactFingerprint, sourceRevision: 'Not inferred; this verifies the same compiled bytes.' };
  }
  // Alternate baseline/candidate to limit order-related timing drift.
  for (const route of ['/', '/coaches']) {
    for (let index = 0; index < iterations; index++) for (const name of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      report.builds[name].routes[route].push(await sample(origins[name], route, inventories[name]));
    }
    for (const sampleResult of report.builds.candidate.routes[route]) assert.equal(sampleResult.workers.filter(worker => worker.name === 'posetek-brand').length, 0, 'Only the hero is eligible for initial worker rendering.');
    const totals = name => {
      const samples = report.builds[name].routes[route];
      return Object.fromEntries([
        ['pageJavascriptTransferBytes', median(samples.map(sample => sample.javascript.transferBytes))],
        ['pageJavascriptEncodedBodyBytes', median(samples.map(sample => sample.javascript.encodedBodyBytes))],
        ['pageJavascriptRequests', median(samples.map(sample => sample.javascript.count))],
        ['workerScriptBodyBytes', median(samples.map(sample => sample.workerScripts.observedBodyBytes))],
        ['workerScriptRequests', median(samples.map(sample => sample.workerScripts.requestCount))],
        ['combinedObservedJavascriptBodyBytes', median(samples.map(sample => sample.javascript.encodedBodyBytes + sample.workerScripts.observedBodyBytes))],
        ['cssTransferBytes', median(samples.map(sample => sample.css.transferBytes))],
        ['cssEncodedBodyBytes', median(samples.map(sample => sample.css.encodedBodyBytes))],
        ['cssRequests', median(samples.map(sample => sample.css.count))],
        ...['domContentLoadedMs', 'loadMs', 'firstContentfulPaintMs', 'largestContentfulPaintMs'].map(key => [key, median(samples.map(sample => sample.timing[key]).filter(value => value !== null))]),
      ]);
    };
    const baseline = totals('baseline'), candidate = totals('candidate');
    const delta = Object.fromEntries(Object.keys(baseline).map(key => [key, baseline[key] === null || candidate[key] === null ? null : round(candidate[key] - baseline[key])]));
    report.comparisons[route] = { baseline, candidate, delta, initialFooterWorkerInstances: 0, javascriptNote: 'Page Resource Timing excludes worker entries; separately observed worker body bytes are added exactly once. These counters do not measure main-thread execution time.' };
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
