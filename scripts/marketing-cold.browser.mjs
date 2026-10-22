// Cold first-input acceptance. Run independently, with no concurrent browser work.
// Default: five fresh, headful Chromium processes per desktop/touch viewport.
// Headless is diagnostic only; it never establishes physical/GPU acceptance.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';
import { requestFailureDetails, classifyPreviewCancellations } from './marketing-showcase.helpers.mjs';
import { waitForPresentedOpener } from './marketing-cold-presentation.mjs';

const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
const artifacts = process.env.MARKETING_ARTIFACTS ? resolve(process.env.MARKETING_ARTIFACTS) : fileURLToPath(new URL('../artifacts/marketing-cold/', import.meta.url));
const previewOrigin = process.env.MARKETING_ORIGIN;
const productionOrigin = previewOrigin === 'https://posetek.net';
if (previewOrigin && !productionOrigin && !/^https:\/\/[a-f0-9]{24}--posetek\.netlify\.app$/.test(previewOrigin)) throw new Error('MARKETING_ORIGIN must be https://posetek.net or an immutable PoseTek Netlify draft URL.');
const headless = process.env.MARKETING_COLD_HEADLESS === '1';
const traceAll = process.env.MARKETING_COLD_TRACE_ALL === '1';
const cpuRate = Number(process.env.MARKETING_COLD_CPU_RATE || 1);
assert.ok([1, 4].includes(cpuRate), 'CPU rate is either unthrottled acceptance or explicit 4x diagnostic');
const lane = process.env.MARKETING_COLD_LANE || 'chromium';
const disableTileBlur = process.env.MARKETING_COLD_DISABLE_TILE_BLUR === '1';
const galleryScrollDiagnostic = process.env.MARKETING_COLD_GALLERY_SCROLL_DIAGNOSTIC === '1';
assert.ok(['chromium', 'webkit'].includes(lane), 'Choose the Chromium timing lane or separate WebKit support lane');
const allowFonts = process.env.MARKETING_ALLOW_FONTS === '1';
const iterations = 5;
const budgets = { inputMaximum: 100, inputMedian: 50, feedback: 200, mainTask: 100 };
const audiences = [{ name: 'players', route: '/', entry: 'HomePage', file: 'index.html' }, { name: 'coaches', route: '/coaches', entry: 'CoachesPage', file: 'coaches/index.html' }];
const devices = [{ name: 'desktop', width: 1440, height: 1000, touch: false }, { name: 'touch', width: 390, height: 844, touch: true }];
const evidence = {
  output, previewOrigin, budgets, iterations, lane, headless, cpuRate, traceAll, disableTileBlur, galleryScrollDiagnostic,
  runtime: { platform: process.platform, architecture: process.arch, node: process.version },
  mode: lane === 'webkit' ? 'WebKit support checks; no timing or physical-mobile acceptance' : headless || cpuRate !== 1 || disableTileBlur || galleryScrollDiagnostic ? `diagnostic: ${headless ? 'headless' : 'headful'}, ${cpuRate}x CPU${disableTileBlur ? ', pixel tile blur disabled' : ''}${galleryScrollDiagnostic ? ', scroll calls instrumented' : ''}; no hardware acceptance` : 'headful hardware acceptance',
  limitations: ['390px touch is desktop emulation, not physical iOS or Android.', 'Fresh browser HTTP caches and workers; OS/driver shader caches are not cleared.', 'In-page event/RAF observers add measurement overhead; traces independently include compositor work.', 'The optional 4x CPU lane throttles renderer CPU scheduling; it does not emulate a phone GPU, memory, network or operating system.', 'Native background-tab/window minimization did not change document.visibilityState in this host even with focus emulation disabled; visibility lifecycle coverage explicitly injects visibility properties and events, not an actual hidden tab.'],
  networkPolicy: `${productionOrigin ? 'PoseTek production' : previewOrigin ? 'immutable draft' : 'loopback'} origin GET/HEAD${allowFonts ? ' + Google fonts GET' : ''}; all other HTTP and WebSockets blocked`,
  checks: [], runs: [], recoveries: [], screenshots: [], traces: [], requests: { writesBlocked: 0, externalBlocked: 0, injectedFailures: 0, unexpectedOriginFailures: 0 },
};
let server, origin;

before(async () => {
  try {
  await mkdir(artifacts, { recursive: true });
  for (const audience of audiences) {
    await stat(resolve(output, audience.file));
    const html = await readFile(resolve(output, audience.file), 'utf8');
    const entries = [...html.matchAll(/component-url="([^"]+)"/g)].map(match => match[1]);
    audience.chunk = entries.find(entry => entry.includes(audience.entry + '.'));
    assert.ok(audience.chunk, `compiled ${audience.entry} component URL exists`);
    audience.entrySha256 = createHash('sha256').update(html).digest('hex');
  }
  if (previewOrigin) origin = previewOrigin;
  else {
    server = createHomepagePreviewServer({ marketingRoot: output, referenceRoot: output });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  evidence.entries = audiences.map(({ file, chunk, entrySha256 }) => ({ file, chunk, sha256: entrySha256 }));
  evidence.setup = 'ready';
  } catch (error) { evidence.setup = 'failed'; evidence.setupError = error.message; throw error; }
});

after(async () => {
  if (server) await new Promise(done => server.close(done));
  const report = { ...evidence, passed: evidence.checks.filter(row => row.status === 'passed').length, failed: evidence.checks.filter(row => row.status === 'failed').length + Number(evidence.setup === 'failed') };
  await writeFile(resolve(artifacts, 'cold-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, mode: report.mode, report: resolve(artifacts, 'cold-acceptance.json') }));
});

function check(name, run, timeout = 90_000) {
  if ((lane === 'webkit') !== name.startsWith('WebKit ')) return;
  test(name, { timeout }, async t => {
    const start = Date.now();
    try { await run(t); evidence.checks.push({ name, status: 'passed', milliseconds: Date.now() - start }); }
    catch (error) { evidence.checks.push({ name, status: 'failed', error: error.message }); throw error; }
  });
}

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// Installed before navigation. No hydration/renderer wait and no renderer changes.
function installObservation() {
  const data = window.__cold = { inputs: [], wheelEvents: [], feedback: [], frames: [], longTasks: [], longAnimationFrames: [], events: [], workers: [], workerInputs: [], workerMessages: [], mainWebGL: [], states: [], finished: false };
  window.addEventListener('wheel', event => {
    if (!data.finished) data.wheelEvents.push({ time: performance.now(), timestamp: event.timeStamp, deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, x: event.clientX, y: event.clientY, trusted: event.isTrusted });
  }, { passive: true, capture: true });
  performance.mark('posetek-cold-window-start');
  new PerformanceObserver(list => { for (const entry of list.getEntries()) data.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ entryTypes: ['longtask'] });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) data.events.push({ name: entry.name, start: entry.startTime, processingStart: entry.processingStart, processingEnd: entry.processingEnd, duration: entry.duration, interactionId: entry.interactionId });
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
    new PerformanceObserver(list => {
      // toJSON() leaves nested PerformanceScriptTiming instances intact;
      // normalize those too before snapshots cross the protocol boundary.
      for (const entry of list.getEntries()) data.longAnimationFrames.push(JSON.parse(JSON.stringify(entry)));
    }).observe({ type: 'long-animation-frame', buffered: true });
  }
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    if (String(args[0]).includes('webgl')) data.mainWebGL.push({ time: performance.now(), type: args[0] });
    return Reflect.apply(nativeContext, this, args);
  };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      const index = data.workers.length;
      data.workers.push({ index, url: String(url), name: options?.name || '', created: performance.now() });
      const post = this.postMessage.bind(this);
      this.postMessage = (message, ...rest) => {
        if (data.workerInputs.length < 400 && message && typeof message === 'object') {
          const { type, active, size, view, x, y } = message;
          data.workerInputs.push(structuredClone({ worker: index, time: performance.now(), type, active, size, view, x, y }));
        }
        return post(message, ...rest);
      };
      this.addEventListener('message', event => {
        const value = event.data;
        if (value && typeof value === 'object') {
          // Keep only metadata; transferred images/canvases are never serialized.
          const metadata = Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item)));
          if (value.telemetry) metadata.telemetry = value.telemetry;
          if (data.workerMessages.length < 300) data.workerMessages.push({ worker: index, time: performance.now(), ...metadata });
        }
      });
    }
  };
  let pending = null, lastFrame = performance.now(), lastState = '';
  function input(event) {
    const label = event.target?.closest?.('[aria-label]')?.getAttribute('aria-label');
    const intent = label === 'Open navigation' ? 'open' : label === 'Close navigation' || event.key === 'Escape' ? 'close' : null;
    const row = { type: event.type, key: event.key, label, trusted: event.isTrusted, timestamp: event.timeStamp, handled: performance.now(), delay: performance.now() - event.timeStamp, intent, renderer: document.querySelector('.hero-pose-viewer')?.dataset.rendererState };
    if (event.isTrusted) data.inputs.push(row);
    if (event.isTrusted && (event.type === 'click' || event.type === 'keydown' && ['Escape', 'Enter'].includes(event.key)) && intent) pending = row;
  }
  for (const type of ['pointerdown', 'click', 'keydown']) addEventListener(type, input, true);
  function sample(now) {
    const menu = document.querySelector('.pt-marketing-menu');
    const open = !!menu && !menu.hidden;
    const closing = menu?.dataset.closing === 'true';
    const covers = open ? [...menu.querySelectorAll('.pt-menu-curtain-slice')].map(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).d) : [];
    const opacity = open && menu.querySelector('.pt-menu-content') ? Number(getComputedStyle(menu.querySelector('.pt-menu-content')).opacity) : 0;
    if (pending && (pending.intent === 'open' && open && (opacity > .01 || covers.some(value => value > .01)) || pending.intent === 'close' && (!open || closing && covers.some(value => value < .99)))) {
      data.feedback.push({ intent: pending.intent, timestamp: pending.timestamp, frame: now, milliseconds: now - pending.timestamp }); pending = null;
    }
    const hero = document.querySelector('.hero-pose-viewer');
    const state = { open, closing, renderer: hero?.dataset.rendererState, frames: hero?.dataset.rendererFrames, owner: hero?.dataset.rendererOwner, ssr: document.querySelectorAll('astro-island[ssr]').length };
    const key = JSON.stringify(state);
    if (key !== lastState) { data.states.push({ time: now, ...state }); lastState = key; }
    if (open || now - lastFrame > 35) data.frames.push({ time: now, gap: now - lastFrame, open, closing, covers, opacity });
    lastFrame = now;
    if (!data.finished) requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

async function fixture(t, device, { holdPage, holdWorker = false, fault, trace = false } = {}) {
  trace ||= traceAll;
  const browser = await chromium.launch({ headless });
  evidence.browserVersion ??= browser.version();
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.touch, hasTouch: device.touch, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const pageGate = deferred(), workerGate = deferred();
  const state = { heldPages: 0, heldWorkers: 0, workerUrls: [], errors: [], failures: [], failureDetails: [], injected: [], closing: false };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { evidence.requests.writesBlocked++; return route.abort('blockedbyclient'); }
    if (url.origin !== origin) {
      if (allowFonts && request.method() === 'GET' && url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
      evidence.requests.externalBlocked++;
      return request.resourceType() === 'stylesheet' ? route.fulfill({ contentType: 'text/css', body: '' }) : route.abort('blockedbyclient');
    }
    if (holdPage && url.pathname === new URL(holdPage, origin).pathname) { state.heldPages++; await pageGate.promise; }
    if (/renderer\.worker[-.].*\.js$/.test(url.pathname)) {
      state.workerUrls.push(url.pathname);
      if (fault === 'worker-404') { state.injected.push(url.pathname); evidence.requests.injectedFailures++; return route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* Deliberately missing worker. */' }); }
      if (fault === 'worker-never-ready') { state.injected.push(url.pathname); evidence.requests.injectedFailures++; return route.fulfill({ contentType: 'text/javascript', body: '/* Deliberately inert worker: no startup acknowledgement. */' }); }
      if (['worker-context', 'worker-shader', 'context-loss', 'gallery-texture'].includes(fault)) {
        // Faults run inside the real worker module; no synthetic success reply
        // or main-thread graphics context can satisfy the acceptance checks.
        const response = await route.fetch();
        const setup = fault === 'gallery-texture'
          ? "if (globalThis.name === 'posetek-gallery') globalThis.createImageBitmap = async () => { throw new Error('Injected gallery texture decode failure'); };"
          : fault === 'worker-context'
          ? 'OffscreenCanvas.prototype.getContext = function () { return null; };'
          : `const coldNativeContext = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function (...args) {
  const gl = Reflect.apply(coldNativeContext, this, args);
  if (gl && String(args[0]).includes('webgl')) {
    globalThis.__coldWorkerContext = gl;
    ${fault === 'worker-shader' ? "const shaderSource = gl.shaderSource.bind(gl); gl.shaderSource = (shader, source) => shaderSource(shader, source + '\\nPOSETEK_INJECTED_INVALID_SHADER');" : ''}
  }
  return gl;
};`;
        state.injected.push(url.pathname); evidence.requests.injectedFailures++;
        return route.fulfill({ response, body: setup + '\n' + await response.text() });
      }
      if (holdWorker) { state.heldWorkers++; await workerGate.promise; }
    }
    return route.continue();
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  await context.addInitScript(installObservation);
  if (disableTileBlur) await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.pixel-reveal i { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
      document.head.appendChild(style);
    }, { once: true });
  });
  if (fault === 'no-offscreen') await context.addInitScript(() => {
    Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: undefined });
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', { configurable: true, value: undefined });
  });
  if (fault === 'worker-constructor') await context.addInitScript(() => { globalThis.Worker = class { constructor() { throw new DOMException('Injected worker policy block', 'SecurityError'); } }; });
  if (fault === 'canvas-transfer') await context.addInitScript(() => { HTMLCanvasElement.prototype.transferControlToOffscreen = function () { throw new DOMException('Injected transfer failure', 'InvalidStateError'); }; });
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  const cdp = await context.newCDPSession(page);
  if (cpuRate !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  if (trace) await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.frame,cc,gpu', transferMode: 'ReturnAsStream' });
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('requestfailed', request => { if (!state.closing && new URL(request.url()).origin === origin) { state.failures.push(new URL(request.url()).pathname); state.failureDetails.push(requestFailureDetails(request)); } });
  t.after(async () => {
    state.closing = true; pageGate.resolve(); workerGate.resolve();
    const postErrors = [];
    if (!evidence.runs.some(row => row.name === t.name) && !page.isClosed()) {
      const data = await page.evaluate(() => {
        performance.mark('posetek-cold-window-end');
        if (window.__cold) window.__cold.finished = true;
        return { observation: window.__cold, url: location.href, header: document.querySelector('[data-marketing-header]')?.dataset, hero: document.querySelector('.hero-pose-viewer')?.dataset, footer: document.querySelector('.marketing-footer-mark')?.dataset, galleryScrollDiagnostic: window.__galleryScrollDiagnostic };
      }).catch(error => ({ unavailable: error.message }));
      const row = { name: t.name, partial: true, data }; evidence.runs.push(row);
      await writeFile(resolve(artifacts, slug(t.name) + '.json'), JSON.stringify(row, null, 2));
    }
    try { if (trace) {
      const ended = new Promise(done => cdp.once('Tracing.tracingComplete', done));
      await cdp.send('Tracing.end');
      const { stream } = await ended; let data = '';
      for (;;) { const part = await cdp.send('IO.read', { handle: stream }); data += part.data; if (part.eof) break; }
      await cdp.send('IO.close', { handle: stream });
      const path = resolve(artifacts, slug(t.name) + '.trace.json'); await writeFile(path, data); evidence.traces.push(path);
      const parsed = JSON.parse(data).traceEvents;
      const threads = new Map(parsed.filter(row => row.name === 'thread_name').map(row => [`${row.pid}:${row.tid}`, row.args.name]));
      const start = parsed.find(row => row.name === 'posetek-cold-window-start')?.ts ?? -Infinity;
      const end = parsed.find(row => row.name === 'posetek-cold-window-end')?.ts ?? Infinity;
      const commits = parsed.filter(row => row.ph === 'X' && row.ts < end && row.ts + row.dur > start && ['Commit', 'GLES2::ReadPixels'].includes(row.name) && threads.get(`${row.pid}:${row.tid}`) === 'CrRendererMain').map(row => ({ name: row.name, milliseconds: row.dur / 1000 }));
      const gpuWork = parsed.filter(row => row.ph === 'X' && row.ts < end && row.ts + row.dur > start && ['GPUTask', 'RasterDecoderImpl::DoEndRasterCHROMIUM::Flush'].includes(row.name) && threads.get(`${row.pid}:${row.tid}`) === 'CrGpuMain');
      const run = evidence.runs.find(row => row.name === t.name);
      if (run) {
        run.compositor = commits;
        run.pipeline = {
          mainCommitMaximumMs: Math.max(0, ...commits.map(row => row.milliseconds)),
          gpuTaskMaximumMs: Math.max(0, ...gpuWork.filter(row => row.name === 'GPUTask').map(row => row.dur / 1000)),
          rasterFlushMaximumMs: Math.max(0, ...gpuWork.filter(row => row.name.includes('Raster')).map(row => row.dur / 1000)),
        };
      }
      if (commits.some(row => row.milliseconds >= budgets.mainTask)) postErrors.push(`Main-thread compositor task exceeded ${budgets.mainTask}ms: ${JSON.stringify(commits)}`);
    } } catch (error) { postErrors.push(`Trace collection failed: ${error.message}`); }
    const run = evidence.runs.find(row => row.name === t.name);
    if (run) run.network = state;
    if (state.firstPresentation) {
      const { png, ...proof } = state.firstPresentation;
      state.firstPresentation = proof;
      if (run) run.firstPresentation = proof;
      await writeFile(resolve(artifacts, slug(t.name) + '.first-opener.png'), Buffer.from(png, 'base64'));
    }
    const classified = await classifyPreviewCancellations(page, state.failureDetails);
    (evidence.requests.decorativeCancellations ??= []).push(...classified.expected.map(row => ({ check: t.name, ...row })));
    const unexpected = classified.unexpected.map(row => new URL(row.url).pathname).filter(path => !state.injected.includes(path));
    evidence.requests.unexpectedOriginFailures += unexpected.length;
    try { await context.close(); } finally { await browser.close(); }
    if (unexpected.length) postErrors.push(`Unexpected tested-origin request failures: ${unexpected.join(', ')}`);
    if (state.errors.length) postErrors.push(`Uncaught browser exceptions: ${state.errors.join('; ')}`);
    if (postErrors.length) markFailure(t.name, postErrors.join('; '));
  });
  return { browser, context, page, cdp, state, releasePage: pageGate.resolve, releaseWorker: workerGate.resolve };
}

function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''); }
function markFailure(name, message) { const row = evidence.checks.find(row => row.name === name); if (row) { row.status = 'failed'; row.error = message; } throw new Error(message); }

async function visit(f, route) {
  const { page, cdp, state } = f;
  const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  // A raw CDP click can precede even the first presented page after DCL.
  // Wait only for a compositor frame containing the actual visible opener.
  // No hydration, renderer, font, idle, or finite-animation readiness gate.
  state.firstPresentation = await waitForPresentedOpener(page, cdp);
  state.firstPresentation.readyAt = await page.evaluate(() => performance.now());
  const { frameTime, readyAt } = state.firstPresentation;
  await page.evaluate(proof => { window.__cold.firstPresentation = proof; }, { frameTime, readyAt });
}

async function press(f, device, intent) {
  const selector = intent === 'open' ? '.pt-navigation-disclosure > summary[aria-label="Open navigation"]' : '.pt-marketing-menu [aria-label="Close navigation"]';
  const point = await f.page.locator(selector).evaluate(node => { const box = node.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; });
  if (device.touch) {
    await f.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await f.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await f.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await f.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
}

async function menuState(page, open) {
  await page.waitForFunction(open => document.querySelector('.pt-marketing-menu')?.hidden === !open, open);
  if (open) await page.waitForFunction(() => {
    const action = window.__cold.inputs.findLast(row => row.intent === 'open' && row.type === 'click');
    return action && window.__cold.feedback.some(row => row.timestamp === action.timestamp);
  }, undefined, { timeout: 1000 });
}
async function nextFrames(page, count = 3) { await page.evaluate(count => new Promise(done => { const tick = () => --count <= 0 ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), count); }
async function snapshot(page) { return page.evaluate(() => structuredClone(window.__cold)); }
async function capture(page, name) { const path = resolve(artifacts, name + '.png'); await page.screenshot({ path, animations: 'allow' }); evidence.screenshots.push(path); }
async function nodeCondition(predicate, description) {
  const start = Date.now();
  while (!predicate()) {
    assert.ok(Date.now() - start < 5000, description);
    await new Promise(done => setTimeout(done, 20));
  }
}

function assertLatency(data) {
  const inputs = data.inputs.filter(row => row.intent);
  assert.ok(inputs.length >= 2, 'trusted menu input was observed');
  assert.ok(data.firstPresentation && data.firstPresentation.frameTime <= inputs[0].timestamp && data.firstPresentation.readyAt <= inputs[0].timestamp, 'first menu input follows an actually presented opener');
  assert.ok(inputs.every(row => row.delay <= budgets.inputMaximum), `input delay <=${budgets.inputMaximum}ms: ${JSON.stringify(inputs)}`);
  assert.ok(data.feedback.some(row => row.intent === 'open'), 'actual opening feedback was observed');
  assert.ok(data.feedback.every(row => row.milliseconds <= budgets.feedback), `visible feedback <=${budgets.feedback}ms: ${JSON.stringify(data.feedback)}`);
  const first = Math.min(...inputs.map(row => row.timestamp));
  const overlap = data.longTasks.filter(row => row.start + row.duration >= first && row.duration >= budgets.mainTask);
  assert.deepEqual(overlap, [], `no >=${budgets.mainTask}ms main task after first input through worker presentation`);
}

async function finishRun(t, f, extra = {}) {
  await nextFrames(f.page);
  const data = await f.page.evaluate(() => { performance.mark('posetek-cold-window-end'); window.__cold.finished = true; return structuredClone(window.__cold); });
  const row = { name: t.name, ...extra, data }; evidence.runs.push(row);
  await writeFile(resolve(artifacts, slug(t.name) + '.json'), JSON.stringify(row, null, 2));
  return data;
}

for (const audience of audiences) for (const device of devices) {
  check(`${audience.name} ${device.name}: first SSR menu input works while page hydration is held`, async t => {
    const f = await fixture(t, device, { holdPage: audience.chunk });
    await visit(f, audience.route);
    const before = await f.page.evaluate(() => document.querySelectorAll('astro-island[ssr]').length);
    assert.ok(before > 0, 'page is still server-rendered before the first input');
    await press(f, device, 'open'); await menuState(f.page, true);
    assert.ok(f.state.heldPages > 0, 'page component import is actually held');
    assert.ok(await f.page.locator('astro-island[ssr]').count(), 'first opening did not wait for hydration');
    await f.page.getByRole('button', { name: 'Close navigation', exact: true }).last().focus();
    await f.page.keyboard.press('Tab');
    assert.equal(await f.page.evaluate(() => document.querySelector('.pt-marketing-menu').contains(document.activeElement)), true, 'early menu contains keyboard focus');
    f.releasePage();
    await f.page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    assert.equal(await f.page.locator('.pt-marketing-menu').getAttribute('hidden'), null, 'hydration preserves the opened menu');
    assert.equal(await f.page.evaluate(() => document.querySelector('.pt-marketing-menu').contains(document.activeElement)), true, 'hydration preserves menu focus');
    await press(f, device, 'close'); await menuState(f.page, false);
    assert.equal(await f.page.locator('.pt-navigation-disclosure > summary[aria-label="Open navigation"]').getAttribute('aria-expanded'), 'false');
    const data = await finishRun(t, f, { audience: audience.name, device: device.name, heldPageImport: f.state.heldPages });
    assertLatency(data);
  });
}

for (const device of devices) for (let iteration = 1; iteration <= iterations; iteration++) {
  check(`${device.name} cold ${iteration}: navigation stays responsive during a real worker first frame`, async t => {
    const f = await fixture(t, device, { trace: iteration === 1 });
    await visit(f, '/');
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    // This wait selects the startup race, not a ready/warm renderer. First input
    // already happened. A second input must remain responsive during startup.
    await f.page.waitForFunction(() => window.__cold.workers.length > 0);
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    await f.page.waitForFunction(() => {
      const hero = document.querySelector('.hero-pose-viewer');
      return hero?.dataset.rendererOwner === 'worker' && hero.dataset.renderer === 'webgl' && Number(hero.dataset.rendererFrames) > 0;
    });
    await nextFrames(f.page, 6);
    const host = await f.page.locator('.hero-pose-viewer').evaluate(node => ({ owner: node.dataset.rendererOwner, renderer: node.dataset.renderer, frames: Number(node.dataset.rendererFrames), gpu: node.dataset.rendererGpu, pose: node.dataset.pose, workerCanvas: !!node.querySelector('[data-marketing-worker-canvas="hero"]') }));
    const gpu = host.gpu;
    if (!headless) assert.ok(gpu && !/swiftshader|llvmpipe|software/i.test(gpu), `actual worker hardware renderer is available: ${gpu}`);
    const data = await finishRun(t, f, { device: device.name, iteration, gpu, host });
    assert.equal(host.owner, 'worker'); assert.ok(host.frames > 0 && host.workerCanvas, 'actual worker draw and transferred canvas exist');
    assert.ok(data.workers.some(row => /renderer\.worker/.test(row.url)), 'real renderer Worker was constructed');
    assert.ok(data.workerMessages.some(row => row.type === 'ready' && row.frames > 0 && row.gpu === gpu), 'real worker confirms its first completed draw and graphics device');
    assert.ok(data.workerMessages.find(row => row.type === 'ready').time > data.inputs.find(row => row.intent === 'open').timestamp, 'first navigation input precedes the first completed worker frame');
    assert.deepEqual(data.mainWebGL, [], '3D never creates a main-thread WebGL context');
    assertLatency(data);
    if (iteration === 1) await capture(f.page, `${device.name}-cold-worker-presented`);
  });
}

check('five-run hardware input medians meet the cold responsiveness budget', async () => {
  for (const device of devices) {
    const runs = evidence.runs.filter(row => row.device === device.name && row.iteration);
    assert.equal(runs.length, iterations);
    const delays = runs.flatMap(row => row.data.inputs.filter(input => input.intent).map(input => input.delay)).sort((a, b) => a - b);
    const median = delays[Math.floor(delays.length / 2)];
    assert.ok(median <= budgets.inputMedian, `${device.name} median ${median} <=${budgets.inputMedian}ms`);
    evidence[`${device.name}Inputs`] = { samples: delays.length, median, maximum: Math.max(...delays) };
  }
});

check('late worker load cannot draw behind open navigation and recovers after explicit close', async t => {
  const device = devices[0], f = await fixture(t, device, { holdWorker: true });
  await visit(f, '/');
  await press(f, device, 'open'); await menuState(f.page, true);
  await press(f, device, 'close'); await menuState(f.page, false);
  await f.page.waitForFunction(() => window.__cold.workers.length > 0);
  await nodeCondition(() => f.state.heldWorkers > 0, 'worker network request reached the deterministic hold');
  assert.ok(f.state.heldWorkers > 0, 'real worker request is held');
  await press(f, device, 'open'); await menuState(f.page, true);
  const before = await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer-frames');
  f.releaseWorker();
  await f.page.waitForTimeout(900);
  const during = await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer-frames');
  assert.equal(Number(during || 0), Number(before || 0), 'deferred startup cannot render behind the open menu');
  await press(f, device, 'close'); await menuState(f.page, false);
  await f.page.waitForFunction(() => Number(document.querySelector('.hero-pose-viewer')?.dataset.rendererFrames) > 0);
  const data = await finishRun(t, f, { heldWorkers: f.state.heldWorkers }); assertLatency(data);
});

for (const fault of ['worker-404', 'worker-constructor', 'no-offscreen', 'canvas-transfer', 'worker-never-ready', 'worker-context', 'worker-shader']) {
  check(`${fault}: startup failure preserves hero controls, footer fallback and navigation`, async t => {
    const device = devices[1], f = await fixture(t, device, { fault });
    await visit(f, '/');
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.rendererState === 'failed', undefined, { timeout: 18_000 });
    assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer'), 'static');
    const reason = await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer-failure');
    assert.ok(reason);
    if (fault === 'worker-context') assert.equal(reason, 'context:initialization');
    if (fault === 'worker-shader') assert.match(reason, /^(shaders|warmup):shader-link$/);
    await f.page.getByRole('group', { name: 'Choose a 3D pose' }).getByRole('button', { name: /Sprint/ }).click();
    assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'sprint');
    await f.page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
    await f.page.waitForFunction(fault => {
      const mark = document.querySelector('.marketing-footer-mark');
      if (mark?.dataset.rendererState === 'failed') return true;
      if (!mark || fault !== 'worker-never-ready') return false;
      // Startup timeout accrues only while visible. A cold jump can trigger
      // preceding lazy layout changes, so retain the test's intended viewport
      // without changing the timer, its eligibility, or the failure deadline.
      const bounds = mark.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= innerHeight) {
        (window.__cold.footerTimeoutPlacements ??= []).push({ at: performance.now(), top: bounds.top, bottom: bounds.bottom, viewport: innerHeight, state: mark.dataset.rendererState });
        mark.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
      return false;
    }, fault, { timeout: 18_000 });
    if (fault === 'worker-never-ready') assert.equal(await f.page.locator('.marketing-footer-mark').getAttribute('data-renderer-failure'), 'startup-timeout');
    assert.equal(await f.page.locator('.marketing-footer-mark').getAttribute('data-mark-state'), 'static');
    assert.equal(await f.page.locator('.marketing-footer-next').getAttribute('href'), '/coaches');
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    const data = await finishRun(t, f, { fault });
    assert.deepEqual(data.mainWebGL, [], 'failed worker never falls back to blocking main-thread WebGL');
    assertLatency(data);
    await capture(f.page, `${fault}-static-fallback`);
  });
}

check('a worker crash after its real first frame restores the usable pose fallback', async t => {
  const device = devices[0], f = await fixture(t, device);
  await visit(f, '/');
  await press(f, device, 'open'); await menuState(f.page, true);
  await press(f, device, 'close'); await menuState(f.page, false);
  await f.page.waitForFunction(() => Number(document.querySelector('.hero-pose-viewer')?.dataset.rendererFrames) > 0);
  const worker = f.page.workers().find(worker => /renderer\.worker/.test(worker.url()));
  assert.ok(worker, 'a real dedicated renderer worker exists before the injected crash');
  await worker.evaluate(() => { setTimeout(() => { throw new Error('Injected renderer worker crash after first draw'); }, 0); });
  await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.rendererState === 'failed');
  assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer'), 'static');
  await f.page.getByRole('group', { name: 'Choose a 3D pose' }).getByRole('button', { name: /Vertical jump/ }).click();
  assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'jump');
  await press(f, device, 'open'); await menuState(f.page, true);
  await press(f, device, 'close'); await menuState(f.page, false);
  const data = await finishRun(t, f, { fault: 'worker-crash-after-frame' });
  assert.deepEqual(data.mainWebGL, []);
  assertLatency(data);
});

async function quietFrames(page, selector, timeout = 2500) {
  // A final in-flight telemetry message is allowed to arrive; after that,
  // demand rendering must stop rather than continuously drawing a static view.
  const start = Date.now(); let previous = -1, same = 0;
  while (Date.now() - start < timeout) {
    const value = Number(await page.locator(selector).getAttribute('data-renderer-frames') || 0);
    if (value === previous) same++; else same = 0;
    if (same >= 3) return value;
    previous = value; await page.waitForTimeout(75);
  }
  assert.fail(`Renderer did not become idle within ${timeout}ms: ${selector}`);
}

for (const device of devices) {
  check(`${device.name}: early pose, camera, resize, controlled visibility and reduced motion retain one worker`, async t => {
    const f = await fixture(t, device, { holdWorker: true });
    await visit(f, '/');
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    await nodeCondition(() => f.state.heldWorkers > 0, 'worker import reached hold before early pose selection');
    await f.page.getByRole('group', { name: 'Choose a 3D pose' }).getByRole('button', { name: /Sprint/ }).click();
    assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'sprint');
    assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer'), 'static');
    f.releaseWorker();
    await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.renderer === 'webgl');
    assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'sprint', 'first real presentation retains the early selection');
    const first = await snapshot(f.page);
    const ready = first.workerMessages.find(row => row.type === 'ready');
    assert.ok(ready?.frames > 0, 'real worker rendered before presentation');
    assert.equal(first.workerInputs.filter(row => row.worker === ready.worker && row.view && row.time < ready.time).at(-1).view.pose, 'sprint');
    await f.page.emulateMedia({ reducedMotion: 'reduce' });
    await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.rotating === 'false');
    await quietFrames(f.page, '.hero-pose-viewer');
    const explorer = f.page.locator('.pose-explorer');
    const angleBefore = Number(await f.page.locator('.hero-pose-viewer').getAttribute('data-orbit-angle'));
    await explorer.focus(); await f.page.keyboard.press('ArrowRight');
    await f.page.waitForFunction(before => Math.abs(Number(document.querySelector('.hero-pose-viewer')?.dataset.orbitAngle) - before) > .2, angleBefore);
    await quietFrames(f.page, '.hero-pose-viewer');
    const angle = Number(await f.page.locator('.hero-pose-viewer').getAttribute('data-orbit-angle'));
    await press(f, device, 'open'); await menuState(f.page, true);
    await quietFrames(f.page, '.hero-pose-viewer');
    await press(f, device, 'close'); await menuState(f.page, false);
    await quietFrames(f.page, '.hero-pose-viewer');
    assert.ok(Math.abs(Number(await f.page.locator('.hero-pose-viewer').getAttribute('data-orbit-angle')) - angle) < .002, 'menu retains deliberate camera angle');
    const originalSize = (await snapshot(f.page)).workerInputs.filter(row => row.type === 'init' || row.type === 'resize').at(-1).size;
    await f.page.setViewportSize(device.touch ? { width: 844, height: 390 } : { width: 1200, height: 800 });
    await f.page.waitForFunction(width => window.__cold.workerInputs.some(row => row.type === 'resize' && row.size.width !== width), originalSize.width);
    await quietFrames(f.page, '.hero-pose-viewer');
    const size = await f.page.locator('[data-marketing-worker-canvas="hero"]').evaluate(canvas => ({ rendered: canvas.getBoundingClientRect().width, host: canvas.parentElement.clientWidth }));
    assert.ok(size.rendered > 0 && Math.abs(size.rendered - size.host) < 2, 'transferred canvas follows resized host');
    await explorer.scrollIntoViewIfNeeded();
    await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.rendererState === 'ready');
    // Native backgrounding/minimization was probed separately and did not
    // produce hidden documents on this host. This explicitly controlled
    // visibility signal tests lifecycle behavior, not OS-tab integration.
    await f.page.evaluate(() => {
      window.__coldVisibilityDescriptors = ['hidden', 'visibilityState'].map(key => [key, Object.getOwnPropertyDescriptor(document, key)]);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await f.page.waitForFunction(() => document.hidden && document.querySelector('.hero-pose-viewer')?.dataset.rendererState === 'paused', undefined, { polling: 50, timeout: 5000 });
    const hiddenFrames = await quietFrames(f.page, '.hero-pose-viewer');
    await f.page.waitForTimeout(200);
    assert.equal(Number(await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer-frames')), hiddenFrames, 'controlled hidden signal stops real worker draws');
    await f.page.evaluate(() => {
      for (const [key, descriptor] of window.__coldVisibilityDescriptors) {
        if (descriptor) Object.defineProperty(document, key, descriptor);
        else delete document[key];
      }
      delete window.__coldVisibilityDescriptors;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await f.page.waitForFunction(() => !document.hidden && document.querySelector('.hero-pose-viewer')?.dataset.rendererState === 'ready');
    await f.page.getByRole('group', { name: 'Choose a 3D pose' }).getByRole('button', { name: /Vertical jump/ }).click();
    await f.page.waitForFunction(previous => Number(document.querySelector('.hero-pose-viewer')?.dataset.rendererFrames) > previous, hiddenFrames);
    assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'jump', 'reduced motion still renders explicit selection');
    await quietFrames(f.page, '.hero-pose-viewer');
    assert.ok(Math.abs(Number(await f.page.locator('.hero-pose-viewer').getAttribute('data-orbit-angle')) - angle) < .002, 'resize, controlled visibility and pose selection retain the camera');
    await f.page.emulateMedia({ reducedMotion: 'no-preference' });
    await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.rotating === 'true');
    const data = await finishRun(t, f, { device: device.name, lifecycle: true, visibilityMode: 'controlled property/event injection; native tab integration unavailable', earlyPose: 'sprint', retainedAngle: angle });
    assert.equal(data.workers.filter(row => row.name === 'posetek-hero').length, 1, 'all hero lifecycle operations retain the original worker');
    assert.deepEqual(data.mainWebGL, []); assertLatency(data);
  });

  check(`${device.name}: footer worker starts around navigation and pauses offscreen`, async t => {
    const f = await fixture(t, device, { holdWorker: true });
    await visit(f, '/coaches');
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    await f.page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
    await nodeCondition(() => f.state.heldWorkers > 0, 'footer worker reached import hold');
    await press(f, device, 'open'); await menuState(f.page, true);
    f.releaseWorker(); await f.page.waitForTimeout(500);
    assert.equal(Number(await f.page.locator('.marketing-footer-mark').getAttribute('data-renderer-frames')), 0, 'held footer has no hidden draw behind navigation');
    await press(f, device, 'close'); await menuState(f.page, false);
    await f.page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.markState === 'enhanced');
    const mark = await f.page.locator('.marketing-footer-mark').evaluate(node => ({ ...node.dataset }));
    assert.ok(Number(mark.rendererFrames) > 0 && mark.rendererGpu, 'actual brand draw identifies its GPU');
    await f.page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await f.page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.rendererState === 'paused');
    const stopped = await quietFrames(f.page, '.marketing-footer-mark'); await f.page.waitForTimeout(200);
    assert.equal(Number(await f.page.locator('.marketing-footer-mark').getAttribute('data-renderer-frames')), stopped);
    await f.page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
    await f.page.emulateMedia({ reducedMotion: 'reduce' });
    await f.page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.markState === 'static');
    await quietFrames(f.page, '.marketing-footer-mark');
    const canvasHidden = await f.page.locator('[data-marketing-worker-canvas="brand"]').evaluate(canvas => {
      const style = getComputedStyle(canvas);
      return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
    });
    assert.equal(canvasHidden, true, 'reduced-motion fallback is visibly exposed, not just labeled static');
    assert.equal(await f.page.locator('.marketing-footer-next').getAttribute('href'), '/');
    const reducedFrames = Number(await f.page.locator('.marketing-footer-mark').getAttribute('data-renderer-frames'));
    await f.page.emulateMedia({ reducedMotion: 'no-preference' });
    await f.page.waitForFunction(previous => {
      const mark = document.querySelector('.marketing-footer-mark');
      return mark?.dataset.markState === 'enhanced' && Number(mark.dataset.rendererFrames) > previous;
    }, reducedFrames);
    const restoredCanvas = await f.page.locator('[data-marketing-worker-canvas="brand"]').evaluate(canvas => {
      const style = getComputedStyle(canvas);
      return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > .99;
    });
    assert.equal(restoredCanvas, true, 'returning to ordinary motion presents the same worker canvas again');
    const data = await finishRun(t, f, { device: device.name, footerWorker: mark });
    assert.equal(data.workers.filter(row => row.name === 'posetek-brand').length, 1, 'footer lifecycle retains its one brand worker'); assert.deepEqual(data.mainWebGL, []); assertLatency(data);
  });
}

check('real worker WebGL context loss restores the static pose and keeps navigation usable', async t => {
  const device = devices[0], f = await fixture(t, device, { fault: 'context-loss' });
  await visit(f, '/');
  await press(f, device, 'open'); await menuState(f.page, true);
  await press(f, device, 'close'); await menuState(f.page, false);
  await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.renderer === 'webgl');
  const worker = f.page.workers().find(worker => /renderer\.worker/.test(worker.url()));
  assert.ok(worker);
  assert.equal(await worker.evaluate(() => {
    const lose = globalThis.__coldWorkerContext.getExtension('WEBGL_lose_context');
    if (!lose) return false; lose.loseContext(); return true;
  }), true, 'actual worker WebGL context-loss extension exists');
  await f.page.waitForFunction(() => document.querySelector('.hero-pose-viewer')?.dataset.rendererState === 'failed');
  assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-renderer-failure'), 'render:context-lost');
  assert.equal(await f.page.locator('[data-marketing-worker-canvas="hero"]').count(), 0);
  await f.page.getByRole('group', { name: 'Choose a 3D pose' }).getByRole('button', { name: /Sprint/ }).click();
  assert.equal(await f.page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'sprint');
  await press(f, device, 'open'); await menuState(f.page, true);
  await press(f, device, 'close'); await menuState(f.page, false);
  const data = await finishRun(t, f, { fault: 'actual-webgl-context-loss' });
  assert.equal(data.workers.filter(row => row.name === 'posetek-hero').length, 1, 'hero context loss never retries automatically');
  assert.deepEqual(data.mainWebGL, []); assertLatency(data);
});

// Separate engine support lane, intentionally excluded from the five-run
// Chromium performance gate. This is desktop WebKit with touch emulation.
for (const audience of audiences) for (const javaScriptEnabled of [false, true]) {
  check(`WebKit ${audience.name}: touch ${javaScriptEnabled ? 'reduced-motion support' : 'native no-JavaScript navigation'}`, async t => {
    const browser = await webkit.launch({ headless });
    evidence.browserVersion ??= browser.version();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, javaScriptEnabled, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const failures = [], exceptions = [];
    let closing = false;
    t.after(async () => { closing = true; await context.close(); await browser.close(); });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) { evidence.requests.writesBlocked++; return route.abort('blockedbyclient'); }
      if (url.origin === origin || allowFonts && request.method() === 'GET' && url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
      evidence.requests.externalBlocked++;
      return request.resourceType() === 'stylesheet' ? route.fulfill({ contentType: 'text/css', body: '' }) : route.abort('blockedbyclient');
    });
    await context.routeWebSocket(/.*/, socket => socket.close());
    const page = await context.newPage(); page.setDefaultTimeout(15_000);
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('requestfailed', request => { if (!closing && new URL(request.url()).origin === origin) failures.push(new URL(request.url()).pathname); });
    await page.goto(origin + audience.route, { waitUntil: 'load' });
    assert.equal(await page.locator('h1').count(), 1);
    await page.locator('.pt-navigation-disclosure > summary').click();
    assert.equal(await page.locator('.pt-navigation-disclosure').getAttribute('open'), '');
    const menu = page.locator('.pt-marketing-menu');
    assert.ok(await menu.isVisible(), 'native or eager menu is visible in WebKit');
    assert.ok(await menu.locator('a[href="/"]').count());
    assert.ok(await menu.locator('a[href="/coaches"]').count());
    const support = { javaScriptEnabled, viewport: '390px desktop WebKit touch emulation', userAgent: await page.evaluate(() => navigator.userAgent) };
    if (!javaScriptEnabled) {
      assert.equal(await page.locator('[data-marketing-header]').getAttribute('data-enhanced'), null);
      await page.locator('.pt-navigation-disclosure > summary').click();
      assert.equal(await page.locator('.pt-navigation-disclosure').getAttribute('open'), null);
    } else {
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      assert.equal(await menu.locator('.pt-menu-curtain-slice').first().evaluate(node => getComputedStyle(node).animationName), 'none');
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.pt-marketing-menu')?.hidden);
      if (audience.name === 'players') {
        await page.locator('.hero-pose-viewer').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => ['ready', 'failed'].includes(document.querySelector('.hero-pose-viewer')?.dataset.rendererState), undefined, { timeout: 18_000 });
        support.hero = await page.locator('.hero-pose-viewer').evaluate(node => ({ ...node.dataset }));
        assert.equal(support.hero.rotating, 'false');
        assert.ok(support.hero.renderer === 'webgl' || support.hero.renderer === 'static' && support.hero.rendererFailure, 'WebKit provides real rendering or an explicit usable static fallback');
        await page.getByRole('group', { name: 'Choose a 3D pose' }).getByRole('button', { name: /Sprint/ }).click();
        assert.equal(await page.locator('.hero-pose-viewer').getAttribute('data-pose'), 'sprint');
      }
      await page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.marketing-footer-mark')?.dataset.markState === 'static');
      assert.ok(await page.locator('.marketing-footer-next').isVisible());
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const path = resolve(artifacts, slug(t.name) + '.png'); await page.screenshot({ path }); evidence.screenshots.push(path);
    evidence.runs.push({ name: t.name, engine: 'WebKit', support });
    assert.deepEqual(exceptions, [], 'no uncaught WebKit exceptions');
    assert.deepEqual(failures, [], 'no tested-origin WebKit request failure');
  });
}

// Gallery startup is measured separately from the retained hero lane. It uses
// the same real-worker observer, trusted input path and original timing budgets.
const galleryOverlay = '[data-showcase-overlay]';
async function galleryReady(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-showcase-gallery]'), overlay = document.querySelector('[data-showcase-overlay]');
    return root?.dataset.showcaseMotion === 'ready' && Number(overlay?.dataset.rendererFrames) > 0 &&
      overlay.dataset.galleryRevision === root.dataset.showcaseRevision &&
      !!document.querySelector('[data-showcase-frame][data-showcase-renderer="ready"]');
  });
}
async function assertGalleryFallback(page) {
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('[data-showcase-frame]')].filter(node => { const rect = node.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; });
    return visible.length > 0 && visible.every(node => { const image = node.querySelector('img[data-showcase-image]'); return image?.complete && image.naturalWidth > 0; });
  });
  const state = await page.locator('[data-showcase-frame]').evaluateAll(nodes => nodes.filter(node => {
    const rect = node.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight;
  }).map(node => {
    const image = node.querySelector('img[data-showcase-image]');
    return { id: node.dataset.showcaseFrame, state: node.dataset.showcaseRenderer, opacity: Number(getComputedStyle(image).opacity), loaded: image.complete && image.naturalWidth > 0 };
  }));
  assert.ok(state.length > 0, 'fallback assertion includes a genuinely visible preview');
  assert.ok(state.every(row => row.state !== 'ready' && row.opacity === 1 && row.loaded), `visible original DOM images survive renderer suspension/failure: ${JSON.stringify(state)}`);
  return state;
}
function assertGalleryDraw(data, gpu) {
  const workers = data.workers.filter(row => row.name === 'posetek-gallery');
  assert.equal(workers.length, 1, 'one dedicated gallery worker serves every preview');
  const worker = workers[0].index;
  assert.ok(data.workerMessages.some(row => row.worker === worker && row.type === 'ready' && row.frames > 0 && row.gpu === gpu), 'real gallery worker completed its first graphics frame');
  assert.ok(data.workerMessages.some(row => row.worker === worker && row.type === 'frame' && row.telemetry?.frames > 0 && row.telemetry.galleryCards?.length > 0), 'real draw telemetry names at least one textured preview');
  assert.deepEqual(data.mainWebGL, [], 'gallery never creates main-thread WebGL');
}

for (let galleryIteration = 1; galleryIteration <= iterations; galleryIteration++) {
  check(`gallery cold ${galleryIteration}: first navigation remains responsive during real textured preview startup`, async t => {
    const device = devices[0], f = await fixture(t, device, { holdWorker: true, trace: galleryIteration === 1 });
    await visit(f, '/#tests');
    await f.page.waitForFunction(() => window.__cold.workers.some(row => row.name === 'posetek-gallery'));
    await nodeCondition(() => f.state.heldWorkers > 0, 'gallery worker request is genuinely held');
    await press(f, device, 'open'); await menuState(f.page, true);
    f.releaseWorker();
    await nextFrames(f.page, 6);
    await assertGalleryFallback(f.page);
    await press(f, device, 'close'); await menuState(f.page, false);
    // The second immediate cycle overlaps startup/first texture work, without
    // waiting for a ready renderer or warmed lazy import before trusted input.
    await press(f, device, 'open'); await menuState(f.page, true);
    await press(f, device, 'close'); await menuState(f.page, false);
    await f.page.locator('.pt-marketing-brand').first().focus();
    await galleryReady(f.page);
    const host = await f.page.locator(galleryOverlay).evaluate(node => ({ owner: node.dataset.rendererOwner, frames: Number(node.dataset.rendererFrames), gpu: node.dataset.rendererGpu, revision: node.dataset.galleryRevision, canvas: !!node.querySelector('[data-marketing-worker-canvas="gallery"]') }));
    assert.ok(host.canvas && host.frames > 0 && host.owner === 'worker');
    if (!headless) assert.ok(host.gpu && !/swiftshader|llvmpipe|software/i.test(host.gpu), `gallery hardware renderer is available: ${host.gpu}`);
    const data = await finishRun(t, f, { galleryIteration, device: device.name, host });
    assertGalleryDraw(data, host.gpu); assertLatency(data);
    const galleryWorker = data.workers.find(row => row.name === 'posetek-gallery');
    const firstDraw = data.workerMessages.find(row => row.worker === galleryWorker.index && row.type === 'frame' && row.telemetry?.galleryCards?.length > 0);
    assert.ok(firstDraw.time > data.inputs.find(row => row.intent === 'open').timestamp, 'trusted opening precedes the first textured gallery frame');
    if (galleryIteration === 1) await capture(f.page, 'gallery-first-textured-frame');
  });
}

check('gallery five-run hardware input median retains the original responsiveness budget', async () => {
  const runs = evidence.runs.filter(row => row.galleryIteration);
  assert.equal(runs.length, iterations);
  const delays = runs.flatMap(row => row.data.inputs.filter(input => input.intent).map(input => input.delay)).sort((a, b) => a - b);
  const median = delays[Math.floor(delays.length / 2)];
  assert.ok(median <= budgets.inputMedian, `gallery input median ${median} <=${budgets.inputMedian}ms`);
  evidence.galleryInputs = { samples: delays.length, median, maximum: Math.max(...delays) };
});

check('gallery: actual scroll bend is bounded and settles; menu, focus, offscreen and visibility stop rendering', async t => {
  const device = devices[0], f = await fixture(t, device);
  // Controlled visibility events verify handler behavior, not OS throttling.
  await f.context.addInitScript(diagnostic => {
    window.__galleryHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__galleryHidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__galleryHidden ? 'hidden' : 'visible' });
    window.__setGalleryHidden = hidden => { window.__galleryHidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
    if (diagnostic) {
      const record = window.__galleryScrollDiagnostic = { calls: [], wheels: [], scrolls: [] };
      for (const method of ['scrollTo', 'scrollBy']) {
        const original = window[method].bind(window);
        window[method] = (...args) => { record.calls.push({ method, args, time: performance.now(), y: scrollY, stack: new Error().stack }); return original(...args); };
      }
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args) { record.calls.push({ method: 'scrollIntoView', id: this.id, args, time: performance.now(), y: scrollY, stack: new Error().stack }); return original.apply(this, args); };
      window.addEventListener('wheel', event => record.wheels.push({ time: performance.now(), timestamp: event.timeStamp, deltaX: event.deltaX, deltaY: event.deltaY, x: event.clientX, y: event.clientY, trusted: event.isTrusted }), { passive: true });
      window.addEventListener('scroll', () => record.scrolls.push({ time: performance.now(), y: scrollY }), { passive: true });
    }
  }, galleryScrollDiagnostic);
  await visit(f, '/#tests'); await galleryReady(f.page);
  await f.page.mouse.move(10, 140);
  await f.page.mouse.wheel(0, 160);
  await f.page.waitForFunction(() => Number(document.querySelector('[data-showcase-overlay]')?.dataset.galleryBend) > .001);
  const peak = await f.page.locator(galleryOverlay).getAttribute('data-gallery-bend');
  assert.ok(Number(peak) <= .3401, `actual bend stays bounded: ${peak}`);
  await f.page.waitForFunction(() => Number(document.querySelector('[data-showcase-overlay]')?.dataset.galleryBend) === 0);
  const settled = await quietFrames(f.page, galleryOverlay);
  assert.ok(settled > 0, 'settling check starts after genuine rendering');
  await f.page.waitForTimeout(250);
  assert.equal(Number(await f.page.locator(galleryOverlay).getAttribute('data-renderer-frames')), settled, 'native scroll comes to rest without continuous decorative frames');
  const first = f.page.locator('[data-showcase-open]').first(); await first.focus();
  await f.page.keyboard.press('Tab'); await f.page.keyboard.press('Shift+Tab');
  await f.page.waitForFunction(() => document.querySelector('[data-showcase-gallery]').dataset.showcaseMotion === 'paused');
  await assertGalleryFallback(f.page); const focusedFrames = await quietFrames(f.page, galleryOverlay);
  await f.page.waitForTimeout(200);
  assert.equal(Number(await f.page.locator(galleryOverlay).getAttribute('data-renderer-frames')), focusedFrames);
  await f.page.locator('.pt-marketing-brand').first().focus(); await galleryReady(f.page);
  await press(f, device, 'open'); await menuState(f.page, true);
  await assertGalleryFallback(f.page); await quietFrames(f.page, galleryOverlay);
  await press(f, device, 'close'); await menuState(f.page, false); await galleryReady(f.page);
  await f.page.evaluate(() => window.__setGalleryHidden(true)); await assertGalleryFallback(f.page);
  const hiddenFrames = await quietFrames(f.page, galleryOverlay); await f.page.waitForTimeout(200);
  assert.equal(Number(await f.page.locator(galleryOverlay).getAttribute('data-renderer-frames')), hiddenFrames);
  await f.page.evaluate(() => window.__setGalleryHidden(false)); await galleryReady(f.page);
  await f.page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await f.page.waitForFunction(() => [...document.querySelectorAll('[data-showcase-frame]')].every(node => node.getBoundingClientRect().top >= innerHeight));
  const offscreenFrames = await quietFrames(f.page, galleryOverlay); await f.page.waitForTimeout(200);
  assert.equal(Number(await f.page.locator(galleryOverlay).getAttribute('data-renderer-frames')), offscreenFrames, 'offscreen scene stops drawing');
  await f.page.locator('[data-showcase-frame="training"]').scrollIntoViewIfNeeded();
  await galleryReady(f.page);
  await f.page.emulateMedia({ reducedMotion: 'reduce' }); await assertGalleryFallback(f.page);
  const data = await finishRun(t, f, { peakBend: Number(peak), visibility: 'controlled document visibility-event injection', galleryScrollDiagnostic: await f.page.evaluate(() => window.__galleryScrollDiagnostic) });
  assert.equal(data.workers.filter(row => row.name === 'posetek-gallery').length, 1, 'lifecycle resumes the retained scene');
  assert.ok(data.workerMessages.filter(row => row.telemetry?.galleryTextures !== undefined).every(row => row.telemetry.galleryTextures <= 4), 'texture residency remains bounded');
  assertLatency(data);
});

for (const fault of ['worker-404', 'worker-never-ready', 'worker-context', 'worker-shader', 'gallery-texture']) {
  check(`gallery ${fault}: original previews and their first explicit demo action survive`, async t => {
    const device = devices[0], f = await fixture(t, device, { fault });
    await visit(f, '/#tests');
    if (fault === 'gallery-texture') await f.page.waitForFunction(() => document.querySelector('[data-showcase-frame="tests"]')?.dataset.showcaseRenderer === 'failed');
    else await f.page.waitForFunction(() => document.querySelector('[data-showcase-gallery]')?.dataset.showcaseMotion === 'failed', undefined, { timeout: 18000 });
    const fallback = await assertGalleryFallback(f.page);
    if (fault === 'worker-context') {
      await f.page.locator('[data-showcase-frame="tests"]').hover();
      await f.page.waitForFunction(() => {
        const image = document.querySelector('[data-showcase-frame="tests"] img[data-showcase-image]');
        return new DOMMatrixReadOnly(getComputedStyle(image).transform).a > 1.02;
      });
    }
    if (fault === 'worker-never-ready') assert.equal(await f.page.locator(galleryOverlay).getAttribute('data-renderer-failure'), 'startup-timeout');
    await press(f, device, 'open'); await menuState(f.page, true); await press(f, device, 'close'); await menuState(f.page, false);
    await f.page.locator('[data-showcase-open="tests"]').first().click();
    const panel = f.page.locator('[data-showcase-panel="tests"]'); await panel.waitFor({ state: 'visible' });
    await panel.getByRole('button', { name: /^(Play|Pause) pose playback$/ }).waitFor({ state: 'visible' });
    const recovery = await panel.evaluate(node => ({ demoState: node.querySelector('[data-demo="movement"]')?.dataset.demoState, playbackLabel: node.querySelector('#posePlayButton')?.getAttribute('aria-label'), playing: node.querySelector('#posePlayButton')?.getAttribute('aria-pressed'), slider: node.querySelector('[aria-label="Pose playback position"]')?.value }));
    evidence.recoveries.push({ check: t.name, fault, ...recovery });
    // A visible recovered recording can already be autoplaying. Its first scrub
    // must work from either playback state and explicitly pause at that frame.
    await panel.getByRole('slider', { name: 'Pose playback position' }).fill('10');
    assert.equal(await panel.getByRole('slider', { name: 'Pose playback position' }).inputValue(), '10');
    const pausedPlayback = panel.getByRole('button', { name: 'Play pose playback', exact: true });
    await pausedPlayback.waitFor({ state: 'visible' });
    assert.equal(await pausedPlayback.getAttribute('aria-pressed'), 'false', 'scrubbing pauses the recovered recording');
    const data = await finishRun(t, f, { fault, galleryFallback: fallback });
    assert.deepEqual(data.mainWebGL, []); assertLatency(data);
    await capture(f.page, `gallery-${fault}-working-demo`);
  });
}

for (const mode of ['touch', 'reduced-motion']) check(`gallery ${mode}: static previews avoid worker startup and keep the explicit demo usable`, async t => {
  const device = mode === 'touch' ? devices[1] : devices[0], f = await fixture(t, device);
  if (mode === 'reduced-motion') await f.page.emulateMedia({ reducedMotion: 'reduce' });
  await visit(f, '/#tests');
  await f.page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await nextFrames(f.page, 12); await assertGalleryFallback(f.page);
  const data = await snapshot(f.page);
  assert.equal(data.workers.filter(row => row.name === 'posetek-gallery').length, 0, 'static mode does not start a gallery worker');
  assert.equal(await f.page.locator('[data-marketing-worker-canvas="gallery"]').count(), 0);
  await f.page.locator('[data-showcase-open="tests"]').first().click();
  await f.page.locator('[data-showcase-panel="tests"]').getByRole('slider', { name: 'Pose playback position' }).waitFor({ state: 'visible' });
  await press(f, device, 'open'); await menuState(f.page, true); await press(f, device, 'close'); await menuState(f.page, false);
  assertLatency(await finishRun(t, f, { galleryMode: mode }));
});
