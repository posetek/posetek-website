// Run after a marketing build, separately from the original 33 acceptance checks.
// Guest-only browser inspection. No credentials, application writes, or external APIs.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';

const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
const artifacts = process.env.MARKETING_ARTIFACTS ? resolve(process.env.MARKETING_ARTIFACTS) : fileURLToPath(new URL('../artifacts/marketing-detail/', import.meta.url));
const previewOrigin = process.env.MARKETING_ORIGIN;
const productionOrigin = previewOrigin === 'https://posetek.net';
if (previewOrigin && !productionOrigin && !/^https:\/\/[a-f0-9]{24}--posetek\.netlify\.app$/.test(previewOrigin)) throw new Error('MARKETING_ORIGIN must be https://posetek.net or an immutable PoseTek Netlify draft URL.');
const allowFonts = process.env.MARKETING_ALLOW_FONTS === '1';
const evidence = {
  output, previewOrigin,
  networkPolicy: `${productionOrigin ? 'PoseTek production' : previewOrigin ? 'immutable PoseTek draft' : 'loopback'} origin GET/HEAD${allowFonts ? ' + Google fonts GET' : ''}; all other HTTP and WebSockets blocked`,
  checks: [], screenshots: [], observations: [],
  requests: { externalBlocked: 0, writesBlocked: 0, fontsAllowed: 0, unexpectedOriginFailures: 0 },
};
const audiences = [
  { name: 'players', route: '/', section: '#profile', art: '.radar-wrap > svg', controls: 'button[data-skill]', selected: '#skillName', heading: '#profile .heading-reveal', frame: '#profile .reveal-frame' },
  { name: 'coaches', route: '/coaches', section: '#players', art: '.cx-profile-radar > svg', controls: '.cx-player-options button', selected: '.cx-player-heading h3', heading: '#players .heading-reveal', frame: '#players .reveal-frame' },
];
let browser, server, origin;

before(async () => {
  try {
    for (const entry of ['index.html', 'coaches/index.html']) await stat(resolve(output, entry));
    await mkdir(artifacts, { recursive: true });
    if (previewOrigin) origin = previewOrigin;
    else {
      server = createHomepagePreviewServer({ marketingRoot: output, referenceRoot: output });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      origin = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch();
    evidence.setup = 'ready';
  } catch (error) { evidence.setup = 'failed'; evidence.setupError = error.message; throw error; }
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
  const summary = { ...evidence, passed: evidence.checks.filter(check => check.status === 'passed').length, failed: evidence.checks.filter(check => check.status === 'failed').length + Number(evidence.setup === 'failed') };
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, 'detail-acceptance.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, screenshots: summary.screenshots.length, evidence: resolve(artifacts, 'detail-acceptance.json'), networkPolicy: evidence.networkPolicy }));
});

function check(name, run) {
  test(name, { timeout: 90_000 }, async t => {
    const started = Date.now();
    try { await run(t); evidence.checks.push({ name, status: 'passed', milliseconds: Date.now() - started }); }
    catch (error) { evidence.checks.push({ name, status: 'failed', error: error.message }); throw error; }
  });
}

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', ...options });
  const errors = [], failures = [];
  let closing = false;
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { evidence.requests.writesBlocked++; return route.abort('blockedbyclient'); }
    if (url.origin === origin) return route.continue();
    if (allowFonts && request.method() === 'GET' && url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { evidence.requests.fontsAllowed++; return route.continue(); }
    evidence.requests.externalBlocked++;
    if (request.resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (!closing && new URL(request.url()).origin === origin) failures.push(request.url()); });
  t.after(async () => {
    closing = true; await context.close();
    evidence.requests.unexpectedOriginFailures += failures.length;
    try { assert.deepEqual(errors, [], 'uncaught browser exceptions'); assert.deepEqual(failures, [], 'unexpected tested-origin request failures'); }
    catch (error) { const result = evidence.checks.find(check => check.name === t.name); if (result) { result.status = 'failed'; result.error = error.message; } throw error; }
  });
  return { page, context };
}

async function expandDemo(page, section) {
  const toggle = page.locator(`${section} .demo-disclosure-toggle`);
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
}

async function visit(page, route) {
  const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
}

async function capture(page, name) {
  const path = resolve(artifacts, name + '.png');
  // Deliberately keep animations running: these are motion-state evidence,
  // separate from the settled screenshots in marketing-revamp.browser.mjs.
  await page.screenshot({ path, animations: 'allow' });
  evidence.screenshots.push(path);
}

async function frames(page, count = 3) {
  await page.evaluate(count => new Promise(done => { const step = () => --count <= 0 ? done() : requestAnimationFrame(step); requestAnimationFrame(step); }), count);
}

async function armMenuOpeningSample(page) {
  // Start before the real click: several protocol reads can outlast the finite
  // wipe. Record an actual animation frame instead of waiting for an interval
  // that may already have elapsed. This does not pause or alter the animation.
  await page.evaluate(() => {
    window.__detailMenuOpeningSample = new Promise(resolve => {
      const started = performance.now();
      let last = null, previousFrame = started;
      const observedFrames = [];
      const longTasks = [];
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime - started, duration: entry.duration });
      });
      observer.observe({ entryTypes: ['longtask'] });
      const finish = result => { observer.disconnect(); resolve({ ...result, observedFrames, longTasks }); };
      const sample = () => {
        const now = performance.now(), frameGap = now - previousFrame;
        previousFrame = now;
        const dialog = document.querySelector('.pt-marketing-menu');
        if (dialog && !dialog.hidden) {
          const curtain = dialog.querySelector('.pt-menu-curtain');
          const covers = Array.from(curtain.querySelectorAll('.pt-menu-curtain-slice'), slice => new DOMMatrixReadOnly(getComputedStyle(slice).transform).d);
          const running = curtain.getAnimations({ subtree: true }).some(animation => {
            const progress = animation.effect.getComputedTiming().progress;
            return animation.playState === 'running' && progress !== null && progress < 1;
          });
          last = { elapsed: performance.now() - started, ariaHidden: curtain.getAttribute('aria-hidden'), covers, running, contentOpacity: Number(getComputedStyle(dialog.querySelector('.pt-menu-content')).opacity), minimumCover: Math.min(...covers) };
          if (observedFrames.length < 40) observedFrames.push({ elapsed: last.elapsed, frameGap, minimumCover: last.minimumCover, maximumCover: Math.max(...covers), running, letterReveal: dialog.dataset.letterReveal, heroRenderer: document.querySelector('.hero-pose-viewer')?.dataset.renderer });
          if (running && covers.some(cover => cover > .15 && cover < .85)) { finish({ ...last, timedOut: false }); return; }
        }
        if (performance.now() - started > 2500) { finish({ last, timedOut: true }); return; }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
}

async function place(page, selector, position) {
  await page.locator(selector).evaluate((node, position) => {
    const box = node.getBoundingClientRect();
    const delta = position === 'below' ? box.top - innerHeight - 40 : position === 'bottom-edge' ? box.top - innerHeight * .94 : position === 'above' ? box.bottom + 40 : box.top - 160;
    window.scrollTo({ top: Math.max(0, scrollY + delta), behavior: 'instant' });
  }, position);
  await frames(page);
}

async function readPrecedingChapters(page) {
  // Warm footer choreography starts after the story's lazy demonstrations have
  // resolved; a single geometry sample taken before their expansion is stale.
  for (const section of await page.locator('.marketing-gallery > section').all()) {
    await section.scrollIntoViewIfNeeded();
    await section.evaluate(node => new Promise((resolve, reject) => {
      const started = performance.now();
      const ready = () => {
        if (Array.from(node.querySelectorAll('[data-demo]')).every(demo => demo.dataset.demoState === 'ready')) resolve();
        else if (performance.now() - started > 10_000) reject(new Error('Preceding chapter lazy content did not become ready.'));
        else requestAnimationFrame(ready);
      }; ready();
    }));
    await frames(page);
  }
}

async function waitData(page, selector, name, value) {
  await page.waitForFunction(({ selector, name, value }) => document.querySelector(selector)?.getAttribute(`data-${name}`) === value, { selector, name, value });
}

async function neutralPointer(page) { await page.mouse.move(4, 110); }

async function armFooterEntranceTrace(page) {
  await page.evaluate(() => {
    const samples = [];
    const read = () => {
      const footer = document.querySelector('.marketing-footer'), bounds = footer.getBoundingClientRect();
      return { at: Date.now(), scroll: scrollY, documentHeight: document.documentElement.scrollHeight, viewport: innerHeight, footerTop: bounds.top, footerHeight: bounds.height, state: footer.dataset.footerState, motion: footer.dataset.footerMotion, progress: footer.style.getPropertyValue('--footer-grid-progress'), navigation: document.documentElement.dataset.marketingNavigation, hidden: document.hidden,
        demos: Array.from(document.querySelectorAll('[data-demo]'), node => ({ kind: node.dataset.demo, state: node.dataset.demoState, top: node.getBoundingClientRect().top + scrollY, height: node.getBoundingClientRect().height })) };
    };
    let previous = '';
    const sample = () => {
      const value = read(), key = JSON.stringify({ ...value, at: 0, progress: undefined });
      if (key !== previous && samples.length < 240) { samples.push(value); previous = key; }
    };
    sample();
    const interval = setInterval(sample, 50);
    const deadline = setTimeout(() => clearInterval(interval), 11_000);
    window.__detailFooterEntranceTrace = () => { sample(); clearInterval(interval); clearTimeout(deadline); return { samples, final: read() }; };
  });
}
async function neutralFocus(page) { await page.locator('.pt-marketing-brand').first().focus(); }
async function settledReveal(page, selector) { await waitData(page, selector, 'reveal-state', 'visible'); }

async function selectedValue(page, config) { return (await page.locator(config.selected).innerText()).trim(); }

async function assertResetArtwork(page, selector) {
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector);
    return node && (!node.style.transform || node.style.transform === 'none') && getComputedStyle(node).filter === 'none';
  }, selector);
}

async function cursorInsideViewport(page) {
  const bounds = await page.locator('.marketing-cursor').evaluate(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, events: getComputedStyle(node).pointerEvents }; });
  assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= bounds.width && bounds.bottom <= bounds.height, `cursor contained: ${JSON.stringify(bounds)}`);
  assert.equal(bounds.events, 'none', 'cursor cannot intercept the link');
}

check('scrambled header, hero and footer labels retain intrinsic width throughout every frame', async t => {
  const { page } = await fixture(t);
  await visit(page, '/');
  const measurements = [];
  for (const selector of ['.pt-marketing-cta', '.hero-explore', '.marketing-footer-next']) {
    const link = page.locator(selector).first();
    await link.scrollIntoViewIfNeeded();
    if (selector.includes('footer')) await waitData(page, '.marketing-footer', 'footer-state', 'in');
    await neutralPointer(page);
    // Begin sampling in the pointer event itself. A footer WebGL upload can
    // otherwise consume the whole 520ms effect before hover() returns to Node.
    await link.evaluate(link => {
      link.__detailWidths = new Promise(done => link.addEventListener('pointerenter', () => {
        const node = link.querySelector('.interaction-text'), rows = [], started = performance.now();
        const sample = () => {
          const source = node.querySelector('.interaction-text-source');
          rows.push({ width: node.getBoundingClientRect().width, source: source.getBoundingClientRect().width, link: link.getBoundingClientRect().width, scrambling: node.dataset.scrambling });
          if (performance.now() - started >= 580) done(rows); else setTimeout(sample, 30);
        };
        sample();
      }, { once: true }));
    });
    await link.hover();
    const samples = await link.evaluate(node => node.__detailWidths);
    measurements.push({ selector, samples: samples.length, animatedSamples: samples.filter(row => row.scrambling === 'true').length, labelRange: [Math.min(...samples.map(row => row.width)), Math.max(...samples.map(row => row.width))], linkRange: [Math.min(...samples.map(row => row.link)), Math.max(...samples.map(row => row.link))] });
  }
  evidence.observations.push({ check: t.name, measurements });
  for (const item of measurements) {
    assert.ok(item.animatedSamples > 0, `${item.selector} exercised the scramble`);
    assert.ok(item.labelRange[1] - item.labelRange[0] < .75, `${item.selector} label changed width: ${JSON.stringify(item)}`);
    assert.ok(item.linkRange[1] - item.linkRange[0] < .75, `${item.selector} changed its hit area width: ${JSON.stringify(item)}`);
  }
});

for (const config of audiences) {
  check(`${config.name}: desktop scramble is bounded, accessible, reversible and cancelable`, async t => {
    const { page } = await fixture(t);
    await visit(page, config.route);
    const link = page.locator('.hero-explore'), label = link.locator('.interaction-text');
    const source = await label.locator('.interaction-text-source').textContent();
    const before = await link.boundingBox(), address = page.url();
    assert.equal(await label.locator('.interaction-text-visual').getAttribute('aria-hidden'), 'true');
    await link.hover();
    await waitData(page, '.hero-explore .interaction-text', 'scrambling', 'true');
    assert.notEqual(await label.locator('.interaction-text-visual').textContent(), source, 'visual copy actually changes');
    assert.equal(await page.getByRole('link', { name: source, exact: true }).count(), 1, 'accessible name remains complete during scramble');
    const during = await link.boundingBox();
    assert.ok(Math.abs(during.width - before.width) < 1 && Math.abs(during.height - before.height) < 1, 'scramble does not change the link hit area');
    await capture(page, `${config.name}-desktop-text-scramble`);
    await waitData(page, '.hero-explore .interaction-text', 'scrambling', 'false');
    assert.equal(await label.locator('.interaction-text-visual').textContent(), source);
    assert.equal(page.url(), address, 'hover never navigates');
    await neutralPointer(page); await link.hover();
    await waitData(page, '.hero-explore .interaction-text', 'scrambling', 'true');
    await neutralPointer(page);
    assert.equal(await label.getAttribute('data-scrambling'), 'false', 'pointer leave immediately restores copy');
    await link.hover(); await link.focus();
    assert.equal(await label.getAttribute('data-scrambling'), 'false', 'keyboard focus restores copy');
    assert.equal(await label.locator('.interaction-text-visual').textContent(), source);
    await page.keyboard.press('Enter');
    await page.waitForURL(url => url.hash === (config.name === 'players' ? '#tests' : '#club'));
  });

  check(`${config.name}: headings and media replay only after a complete below-viewport exit`, async t => {
    const { page } = await fixture(t);
    await visit(page, config.route);
    for (const [kind, selector] of [['heading', config.heading], ['media', config.frame]]) {
      const host = page.locator(selector);
      await neutralFocus(page); await neutralPointer(page);
      await host.evaluate(node => { node.__detailIdentity = Math.random(); });
      const identity = await host.evaluate(node => node.__detailIdentity);
      await place(page, selector, 'below');
      await waitData(page, selector, 'viewport', 'below');
      await waitData(page, selector, 'reveal-state', 'waiting');
      await place(page, selector, 'inside');
      await waitData(page, selector, 'reveal-state', 'entering');
      if (kind === 'media') {
        assert.equal(await host.locator('.pixel-reveal i').count(), 48);
        assert.equal(await host.locator('.pixel-reveal').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
      } else {
        assert.ok(await host.evaluate(node => node.getAnimations().some(animation => animation.playState === 'running' && animation.effect.getTiming().duration > 0)), 'heading has a real running entrance');
      }
      await capture(page, `${config.name}-${kind}-entering`);
      await settledReveal(page, selector);
      assert.equal(await host.locator('.pixel-reveal').count(), 0);
      await place(page, selector, 'above');
      await waitData(page, selector, 'viewport', 'above');
      assert.equal(await host.getAttribute('data-reveal-state'), 'visible', 'passing above leaves readable content');
      await place(page, selector, 'inside');
      assert.equal(await host.getAttribute('data-reveal-state'), 'visible', 'returning from above does not replay');
      assert.equal(await host.locator('.pixel-reveal').count(), 0);
      await place(page, selector, 'bottom-edge');
      assert.equal(await host.getAttribute('data-viewport'), 'inside', 'a partly visible bottom edge remains inside the real viewport');
      assert.equal(await host.getAttribute('data-reveal-state'), 'visible', 'crossing the entrance threshold alone does not rearm the reveal');
      await place(page, selector, 'inside');
      assert.equal(await host.getAttribute('data-reveal-state'), 'visible', 'returning from partial bottom-edge visibility does not replay');
      await place(page, selector, 'below');
      await waitData(page, selector, 'reveal-state', 'waiting');
      await place(page, selector, 'inside');
      await waitData(page, selector, 'reveal-state', 'entering');
      await settledReveal(page, selector);
      assert.equal(await host.evaluate(node => node.__detailIdentity), identity, 'repeat reveal retains the original mounted node');
      const final = await host.evaluate(node => ({ clip: getComputedStyle(node).clipPath, transform: getComputedStyle(node).transform }));
      assert.ok(['none', 'inset(0px)'].includes(final.clip), `readable final clipping: ${final.clip}`);
      assert.equal(final.transform, 'none', 'heading/frame wrapper does not accumulate transforms');
    }
  });

  check(`${config.name}: hover moves artwork while the first control action remains usable`, async t => {
    const { page } = await fixture(t);
    await visit(page, config.route);
    if (config.name === 'coaches') await expandDemo(page, config.section);
    await place(page, config.frame, 'inside'); await settledReveal(page, config.frame);
    const frame = page.locator(config.frame), art = frame.locator(config.art).first(), controls = page.locator(config.section).locator(config.controls);
    const target = controls.last();
    // Expanded evidence may need native scrolling to bring its artwork into view.
    // Compare document coordinates so that scroll itself is not mistaken for tilt.
    const controlBox = node => { const box = node.getBoundingClientRect(); return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }; };
    const before = await target.evaluate(controlBox);
    await art.hover();
    await waitData(page, config.frame, 'preview-active', 'true');
    await page.waitForFunction(selector => document.querySelector(selector)?.hasAttribute('data-motion-art'), `${config.frame} ${config.art}`);
    const visual = await art.evaluate(node => ({ transform: node.style.transform, pulses: node.getAnimations().filter(animation => animation.effect.getKeyframes().some(frame => frame.filter)).length }));
    assert.match(visual.transform, /scale\(1\.035\)/);
    assert.ok(visual.pulses > 0, 'hover includes the bounded blur pulse');
    const after = await target.evaluate(controlBox);
    assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(before[key] - after[key]) < 1), `actual controls do not tilt, zoom or move in the document: ${JSON.stringify({ before, after })}`);
    await capture(page, `${config.name}-desktop-art-hover`);
    await target.click();
    assert.equal(await target.getAttribute('aria-pressed'), 'true', 'one click selects the real control');
    await waitData(page, config.frame, 'preview-active', 'false');
    await assertResetArtwork(page, `${config.frame} ${config.art}`);
    const selected = await selectedValue(page, config);
    await neutralFocus(page); await neutralPointer(page);
    await place(page, config.frame, 'below'); await waitData(page, config.frame, 'reveal-state', 'visible');
    await place(page, config.frame, 'inside');
    assert.equal(await frame.locator('.pixel-reveal').count(), 0, 'used demos stay clear when revisited');
    await controls.first().focus();
    assert.equal(await frame.getAttribute('data-reveal-state'), 'visible', 'focus finishes the tiled entrance');
    assert.equal(await frame.locator('.pixel-reveal').count(), 0);
    assert.equal(await selectedValue(page, config), selected, 'scroll replay preserves current demo selection');
    await page.keyboard.press('Enter');
    assert.equal(await controls.first().getAttribute('aria-pressed'), 'true', 'first keyboard action selects the real control');
    await art.hover();
    assert.notEqual(await frame.getAttribute('data-preview-active'), 'true', 'focused controls keep artwork still');
    await neutralPointer(page); await art.hover();
    assert.notEqual(await frame.getAttribute('data-preview-active'), 'true', 'leaving and re-entering cannot resume tilt while a control still has focus');
    await assertResetArtwork(page, `${config.frame} ${config.art}`);
  });

  check(`${config.name}: live reduced motion settles active effects and keeps re-entry static`, async t => {
    const { page } = await fixture(t);
    await visit(page, config.route);
    const link = page.locator('.hero-explore');
    await link.hover(); await waitData(page, '.hero-explore .interaction-text', 'scrambling', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitData(page, '.hero-explore .interaction-text', 'scrambling', 'false');
    assert.equal(await page.locator('.marketing-cursor').getAttribute('data-visible'), 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await neutralPointer(page); await neutralFocus(page);
    // Restoring motion settles an already-outside host. Rearm through a real
    // enter/exit cycle, rather than assuming a viewport observer fires twice.
    await place(page, config.frame, 'inside'); await settledReveal(page, config.frame);
    await place(page, config.frame, 'below'); await waitData(page, config.frame, 'reveal-state', 'waiting');
    await place(page, config.frame, 'inside'); await waitData(page, config.frame, 'reveal-state', 'entering');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settledReveal(page, config.frame);
    assert.equal(await page.locator('.pixel-reveal').count(), 0);
    await page.locator(config.frame).locator(config.art).first().hover();
    assert.notEqual(await page.locator(config.frame).getAttribute('data-preview-active'), 'true');
    for (const position of ['below', 'inside', 'above', 'inside']) await place(page, config.frame, position);
    assert.equal(await page.locator('.pixel-reveal').count(), 0);
    assert.equal(await page.locator(config.frame).getAttribute('data-reveal-state'), 'visible');
    assert.equal(await page.locator(config.heading).evaluate(node => node.getAnimations().length), 0);
    await capture(page, `${config.name}-reduced-motion-detail`);
  });

  check(`${config.name}: touch uses one tap with visible controls and no desktop-only hover effect`, async t => {
    const { page } = await fixture(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await visit(page, config.route);
    assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    await page.locator('.hero-explore').tap();
    await page.waitForURL(url => url.hash === (config.name === 'players' ? '#tests' : '#club'));
    assert.equal(await page.locator('.marketing-cursor').getAttribute('data-visible'), 'false');
    assert.equal(await page.locator('.interaction-text[data-scrambling="true"]').count(), 0);
    if (config.name === 'coaches') await expandDemo(page, config.section);
    const controls = page.locator(config.section).locator(config.controls);
    await controls.last().tap();
    assert.equal(await controls.last().getAttribute('aria-pressed'), 'true');
    assert.notEqual(await page.locator(config.frame).getAttribute('data-preview-active'), 'true');
    assert.equal(await page.locator(config.frame).locator('.pixel-reveal').count(), 0, 'tap dismisses any entrance overlay');
    const box = await controls.last().boundingBox();
    assert.ok(box.width >= 43.9 && box.height >= 43.9);
    await capture(page, `${config.name}-touch-detail`);
    // Complete the preceding lazy chapters before measuring this warm footer
    // placement. Cold entry and fragment navigation are tested separately.
    await readPrecedingChapters(page);
    await place(page, '.marketing-footer', 'inside');
    const footerEntry = await page.locator('.marketing-footer').evaluate(footer => ({ top: footer.getBoundingClientRect().top, absoluteTop: footer.getBoundingClientRect().top + scrollY, scroll: scrollY, documentHeight: document.documentElement.scrollHeight }));
    await waitData(page, '.marketing-footer', 'footer-state', 'in');
    try { await page.waitForFunction(() => {
      const footer = document.querySelector('.marketing-footer');
      return Number(getComputedStyle(footer.querySelector('.marketing-footer-invitation')).opacity) >= .99
        && !footer.getAnimations({ subtree: true }).some(animation => animation.playState === 'running');
    }); } catch (error) {
      const state = await page.locator('.marketing-footer').evaluate(footer => ({ top: footer.getBoundingClientRect().top, viewport: innerHeight, scroll: scrollY, state: footer.dataset.footerState, progress: footer.style.getPropertyValue('--footer-grid-progress'), opacity: getComputedStyle(footer.querySelector('.marketing-footer-invitation')).opacity, animations: footer.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').map(animation => ({ target: animation.effect.target.className, time: animation.currentTime, duration: animation.effect.getTiming().duration })) }));
      evidence.observations.push({ check: t.name, footerEntry, footerSettlementFailure: state });
      throw new Error(`${error.message}: ${JSON.stringify({ footerEntry, final: state })}`, { cause: error });
    }
    const footerSettled = await page.locator('.marketing-footer').evaluate(footer => ({ top: footer.getBoundingClientRect().top, absoluteTop: footer.getBoundingClientRect().top + scrollY, scroll: scrollY, documentHeight: document.documentElement.scrollHeight, progress: footer.style.getPropertyValue('--footer-grid-progress') }));
    const footerVisibility = await page.locator('.marketing-footer').evaluate(footer => {
      const selectors = ['.marketing-footer-title-character', '.marketing-footer-contact', '.marketing-footer-cta', '.marketing-footer-secondary', '.marketing-footer-next'];
      return selectors.flatMap(selector => Array.from(footer.querySelectorAll(selector), node => {
        const box = node.getBoundingClientRect();
        let opacity = 1;
        for (let ancestor = node; ancestor && ancestor !== footer.parentElement; ancestor = ancestor.parentElement) opacity *= Number(getComputedStyle(ancestor).opacity);
        return { selector, opacity, left: box.left, right: box.right, width: box.width, height: box.height };
      }));
    });
    assert.ok(footerVisibility.length > 20, 'footer invitation and actionable links are present');
    assert.ok(footerVisibility.every(item => item.opacity >= .99 && item.width > 0 && item.height > 0 && item.left >= 0 && item.right <= 390), `footer content is visible and horizontally contained: ${JSON.stringify(footerVisibility)}`);
    await capture(page, `${config.name}-390-footer-invitation-settled`);
    // Frame the preview away from viewport edges. scrollIntoViewIfNeeded can
    // leave a fractional bottom pixel beyond the viewport after CSS layout.
    await place(page, '.marketing-footer-next', 'inside');
    await waitData(page, '.marketing-footer', 'footer-state', 'in');
    const previewVisibility = await page.locator('.marketing-footer-next').evaluate(node => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, viewport: innerHeight, opacity: Number(getComputedStyle(node).opacity), scroll: scrollY };
    });
    assert.ok(previewVisibility.top >= 74 && previewVisibility.bottom <= previewVisibility.viewport && previewVisibility.opacity >= .99, `the complete audience preview is visible within the mobile viewport: ${JSON.stringify(previewVisibility)}`);
    await capture(page, `${config.name}-390-footer-preview-settled`);
    evidence.observations.push({ check: t.name, mobileFooter: 'observer, grid opacity and finite transitions settled; invitation and audience preview captured separately', footerEntry, footerSettled });
  });
}

check('Coaches: centered preview cursor stays inert and the first click follows the real link', async t => {
  const { page } = await fixture(t);
  await visit(page, '/coaches');
  const link = page.locator('a.marketing-visual-link[data-preview-link]'), cursor = page.locator('.marketing-cursor');
  await settledReveal(page, '.coach-hero-frame');
  await link.hover({ position: { x: 50, y: 60 } });
  await waitData(page, '.marketing-cursor', 'visible', 'true');
  assert.equal(await cursor.textContent(), await link.getAttribute('data-cursor'));
  await cursorInsideViewport(page);
  const first = await cursor.boundingBox();
  const box = await link.boundingBox();
  await link.hover({ position: { x: box.width - 50, y: box.height - 60 } });
  const second = await cursor.boundingBox();
  assert.ok(Math.abs(first.x - second.x) < 2 && Math.abs(first.y - second.y) < 2, 'the media cursor is centered rather than following the pointer');
  assert.ok(Math.abs(second.x + second.width / 2 - (box.x + box.width / 2)) < 3 && Math.abs(second.y + second.height / 2 - (box.y + box.height / 2)) < 3, 'label is centered on its real media link');
  // Native scrolling must keep the hint attached while the pointer remains over
  // the preview, then clear it when that same pointer is over another element.
  await page.evaluate(() => window.scrollBy({ top: 24, behavior: 'instant' }));
  await frames(page, 4);
  assert.equal(await cursor.getAttribute('data-visible'), 'true', 'scroll does not blink a still-hovered preview hint');
  const scrolledBox = await link.boundingBox(), scrolledCursor = await cursor.boundingBox();
  assert.ok(Math.abs(scrolledCursor.y + scrolledCursor.height / 2 - (scrolledBox.y + scrolledBox.height / 2)) < 3, 'hint follows the media geometry during scroll');
  await page.evaluate(() => window.scrollBy({ top: 120, behavior: 'instant' }));
  await frames(page, 4);
  assert.equal(await cursor.getAttribute('data-visible'), 'false', 'scrolling the preview away from the pointer clears the hint');
  await link.hover();
  const hit = await link.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); });
  assert.equal(hit, true);
  assert.equal(new URL(page.url()).hash, '');
  await capture(page, 'coaches-centered-preview-cursor');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).focus();
  assert.equal(await cursor.getAttribute('data-visible'), 'false');
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  assert.equal(await cursor.getAttribute('data-visible'), 'false');
  await page.keyboard.press('Escape');
  await link.click();
  await page.waitForURL(url => url.hash === '#club');
});

check('technique joint hit areas stay stationary throughout hover, pointer down and activation', async t => {
  const { page } = await fixture(t);
  await visit(page, '/');
  await page.locator('[data-demo="technique"]').scrollIntoViewIfNeeded();
  await waitData(page, '[data-demo="technique"]', 'demo-state', 'ready');
  const demo = page.locator('[data-demo="technique"]');
  await demo.getByRole('group', { name: 'Kick analysis phases', exact: true }).getByRole('button', { name: /Contact/ }).click();
  await expandDemo(page, '#technique');
  const current = await demo.locator('.technique-measurement > div > small').first().innerText();
  const joints = demo.locator('.technique-stage [role="button"]');
  await joints.first().waitFor({ state: 'visible' }); // Native details toggle commits its React state asynchronously.
  const names = await joints.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  const name = names.find(name => !name.includes(`Inspect ${current} ·`));
  assert.ok(name, 'a different saved joint measurement is available');
  const joint = demo.getByRole('button', { name, exact: true });
  await joint.scrollIntoViewIfNeeded();
  await neutralFocus(page); await neutralPointer(page);
  const stage = demo.locator('.technique-stage');
  await stage.hover({ position: { x: 20, y: 20 } }); await frames(page);
  // Hover preparation can trigger native smooth scrolling to uncover the stage
  // beneath the fixed header. Its scroll may outlive Playwright's hover action;
  // measure artwork stability only after that setup scroll has actually stopped.
  await page.evaluate(() => new Promise((done, reject) => {
    let previous = scrollY, steady = 0;
    const started = performance.now();
    const sample = () => {
      steady = Math.abs(scrollY - previous) < .1 ? steady + 1 : 0;
      previous = scrollY;
      if (steady >= 8) done();
      else if (performance.now() - started > 3000) reject(new Error('Native hover preparation scroll did not settle within three seconds.'));
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  assert.equal(await stage.evaluate(node => getComputedStyle(node).transform), 'none', 'an SVG containing actual controls is excluded from preview tilt');
  // SVG <g> ink bounds include the extra hover-outline stroke. Measure the
  // actual circle's geometry in screen coordinates rather than that decoration.
  const geometry = () => joint.locator('.technique-hit-area').evaluate(circle => {
    const matrix = circle.getScreenCTM();
    const center = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(matrix);
    return { x: center.x, y: center.y, radiusX: circle.r.baseVal.value * Math.hypot(matrix.a, matrix.b), radiusY: circle.r.baseVal.value * Math.hypot(matrix.c, matrix.d) };
  });
  const before = await geometry();
  await page.mouse.move(before.x, before.y); await frames(page);
  const hovered = await geometry();
  assert.ok(Object.keys(before).every(key => Math.abs(before[key] - hovered[key]) < .5), `hover preserves the actual joint hit geometry: ${JSON.stringify({ before, hovered })}`);
  await page.mouse.down(); await frames(page);
  const pressed = await geometry();
  assert.ok(Object.keys(before).every(key => Math.abs(before[key] - pressed[key]) < .5), 'pointer down cannot move the joint away from pointer up');
  await page.mouse.up();
  const expected = name.slice('Inspect '.length).split(' · ')[0];
  assert.equal(await demo.locator('.technique-measurement > div > small').first().innerText(), expected, 'one complete pointer action selects the saved measurement');
  await capture(page, 'players-technique-joint-first-action');
});

check('visibility lifecycle cancels transient decoration and preserves a paused movement position', async t => {
  const { page, context } = await fixture(t);
  // Controlled visibility-event injection tests handler behavior. This does not
  // claim to operate browser chrome or validate OS background-tab throttling.
  await context.addInitScript(() => {
    window.__detailHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__detailHidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__detailHidden ? 'hidden' : 'visible' });
    window.__setDetailHidden = hidden => { window.__detailHidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  });
  await visit(page, '/');
  await page.locator('.hero-explore').hover(); await waitData(page, '.hero-explore .interaction-text', 'scrambling', 'true');
  await page.evaluate(() => window.__setDetailHidden(true));
  assert.equal(await page.locator('.interaction-text[data-scrambling="true"]').count(), 0);
  assert.equal(await page.locator('.marketing-cursor').getAttribute('data-visible'), 'false');
  await page.evaluate(() => window.__setDetailHidden(false));
  await page.locator('[data-demo="movement"]').scrollIntoViewIfNeeded();
  await waitData(page, '[data-demo="movement"]', 'demo-state', 'ready');
  const pause = page.getByRole('button', { name: 'Pause pose playback', exact: true });
  if (await pause.count()) await pause.click();
  await page.getByRole('slider', { name: 'Pose playback position' }).fill('10');
  const original = await page.locator('#poseScrubber').inputValue();
  await place(page, '#profile', 'inside');
  await page.evaluate(() => window.__setDetailHidden(true)); await frames(page, 6);
  assert.equal(await page.locator('#poseScrubber').inputValue(), original);
  await page.evaluate(() => window.__setDetailHidden(false));
  await page.locator('[data-demo="movement"]').scrollIntoViewIfNeeded();
  await frames(page, 6);
  assert.equal(await page.locator('#poseScrubber').inputValue(), original, 'return never resumes explicitly paused playback');
  assert.equal(await page.locator('#posePlayButton').getAttribute('aria-pressed'), 'false');
  evidence.observations.push({ check: t.name, visibility: 'controlled document visibility-event injection', pausedFrame: original });
});

for (const config of audiences) {
  check(`${config.name}: menu previews follow hover, dim siblings and retain focus while closing`, async t => {
    const { page } = await fixture(t);
    await visit(page, config.route);
    // This checks warm visual choreography. The SVG exists during preparation,
    // so its accessible label cannot establish that startup has finished.
    // Cold first-input/worker contention is measured separately, without this
    // readiness gate, by marketing-cold.browser.mjs.
    if (await page.locator('.hero-pose-viewer').count()) {
      await page.waitForFunction(() => {
        const hero = document.querySelector('.hero-pose-viewer');
        return hero?.dataset.renderer === 'webgl' || (hero?.dataset.rendererState === 'failed' && hero.querySelector('.pose-explorer')?.getAttribute('aria-label')?.startsWith('Static reconstructed'));
      });
      await frames(page);
    }
    const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
    await armMenuOpeningSample(page);
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Explore PoseTek' });
    const curtain = dialog.locator('.pt-menu-curtain');
    const opening = await page.evaluate(() => window.__detailMenuOpeningSample);
    assert.equal(opening.timedOut, false, `opening produced an observable intermediate frame: ${JSON.stringify(opening)}`);
    assert.equal(opening.ariaHidden, 'true');
    assert.equal(opening.covers.length, 10, 'menu opens through ten real curtain slices');
    assert.equal(opening.running, true, 'curtain has an actual intermediate opening animation');
    assert.ok(opening.covers.some(cover => cover > .15 && cover < .85), 'a live curtain slice reaches the required intermediate geometry');
    if (opening.minimumCover < .5) assert.ok(opening.contentOpacity < .05, 'menu content stays hidden while the curtain leaves the page exposed');
    evidence.observations.push({ check: t.name, opening });
    await capture(page, `${config.name}-menu-curtain-opening`);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.pt-menu-content')).opacity) >= .99);
    const peek = dialog.locator('.pt-menu-peek');
    const target = dialog.locator('[data-menu-page="coaches"]');
    await target.hover({ position: { x: 170, y: 40 } });
    await waitData(page, '.pt-menu-peek', 'visible', 'true');
    assert.equal(await peek.getAttribute('data-page'), 'coaches');
    assert.equal(await target.getAttribute('data-active'), 'true');
    assert.equal(await dialog.locator('[data-menu-page]:not([data-menu-page="coaches"])').evaluateAll(nodes => nodes.every(node => node.dataset.dimmed === 'true')), true);
    const first = await peek.boundingBox();
    await target.hover({ position: { x: 280, y: 50 } });
    await page.waitForFunction(x => Math.abs(document.querySelector('.pt-menu-peek').getBoundingClientRect().left - x) > 5, first.x);
    const box = await peek.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 1000, 'menu miniature remains in the viewport');
    assert.equal(await peek.evaluate(node => getComputedStyle(node).pointerEvents), 'none');
    assert.equal(await peek.getAttribute('aria-hidden'), 'true');
    assert.equal(await dialog.getByRole('link', { name: 'Coaches', exact: true }).count(), 1);
    assert.equal(await target.locator('.pt-menu-letter').evaluateAll(nodes => nodes.every(node => !getComputedStyle(node).animationName.includes('hover'))), true, 'giant lettering does not restart a hover roll');
    // The curtain samples above deliberately capture motion; this separate
    // preview documents the finished lettering and miniature after their
    // finite entrance/hover animations, not half-clipped letter masks.
    await page.waitForFunction(() => !document.querySelector('.pt-marketing-menu').getAnimations({ subtree: true }).some(animation => animation.playState === 'running'), undefined, { timeout: 5_000 });
    const contrast = await dialog.evaluate(node => {
      const channels = color => color.match(/[\d.]+/g).map(Number);
      const background = channels(getComputedStyle(node.querySelector('.pt-menu-curtain-slice')).backgroundColor);
      const luminance = rgb => rgb.slice(0, 3).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      return Array.from(node.querySelectorAll('.pt-menu-pages a strong'), label => {
        const foreground = channels(getComputedStyle(label).color);
        let alpha = foreground[3] ?? 1;
        for (let ancestor = label; ancestor && ancestor !== node.parentElement; ancestor = ancestor.parentElement) alpha *= Number(getComputedStyle(ancestor).opacity);
        const composite = foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
        const foregroundLuminance = luminance(composite), backgroundLuminance = luminance(background);
        return { label: label.textContent, opacity: alpha, ratio: (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05), backgroundAlpha: background[3] ?? 1 };
      });
    });
    assert.equal(contrast.length, 3);
    assert.ok(contrast.every(item => item.backgroundAlpha === 1 && item.ratio >= 4.5), `settled menu labels retain text contrast over their opaque curtain, including dimmed siblings: ${JSON.stringify(contrast)}`);
    evidence.observations.push({ check: t.name, contrast });
    await capture(page, `${config.name}-desktop-menu-preview`);
    await dialog.getByRole('button', { name: 'Close navigation', exact: true }).hover();
    await waitData(page, '.pt-menu-peek', 'visible', 'false');
    await page.keyboard.press('Escape');
    await waitData(page, '.pt-marketing-menu', 'closing', 'true');
    assert.ok(await curtain.evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')), 'curtain animates during dismiss');
    assert.equal(await page.locator('main').evaluate(node => Boolean(node.closest('[inert]'))), true, 'background remains inert during close animation');
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'focus remains in the closing dialog');
    await capture(page, `${config.name}-menu-closing`);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('main').evaluate(node => Boolean(node.closest('[inert]'))), false);
    await opener.click(); await target.hover();
    await waitData(page, '.pt-menu-peek', 'visible', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitData(page, '.pt-menu-peek', 'visible', 'false');
    assert.equal(await curtain.locator('.pt-menu-curtain-slice').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none')), true, 'reduced motion settles all curtain slices');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.pt-marketing-menu').getAttribute('hidden'), '', 'reduced motion closes without the exit delay');
  });

  check(`${config.name}: closing panel re-enters, visual bottom pull never navigates, and links remain explicit`, async t => {
    const { page } = await fixture(t);
    const entranceRequests = [], requestStarted = Date.now();
    const requestEvent = event => request => {
      if (new URL(request.url()).origin === origin && ['script', 'stylesheet'].includes(request.resourceType())) entranceRequests.push({ event, at: Date.now(), elapsed: Date.now() - requestStarted, path: new URL(request.url()).pathname });
    };
    const requestStart = requestEvent('request'), requestEnd = requestEvent('finished');
    page.on('request', requestStart); page.on('requestfinished', requestEnd);
    await visit(page, config.route);
    const footer = page.locator('.marketing-footer'), next = footer.locator('.marketing-footer-next');
    await neutralFocus(page);
    // This case tests footer choreography after reading the story. A single
    // cold jump used a 380px movement placeholder; its 332px late growth moved
    // the intended 160px footer landing to 492px, outside the entry threshold.
    // Traverse real chapters and await their existing lazy content before the
    // one measured placement. Cold-input/fragment behavior has separate cases.
    await readPrecedingChapters(page);
    await armFooterEntranceTrace(page);
    await place(page, '.marketing-footer', 'inside');
    try {
      await waitData(page, '.marketing-footer', 'footer-state', 'in');
      await page.waitForFunction(() => Number(document.querySelector('.marketing-footer').style.getPropertyValue('--footer-grid-progress')) > .8);
    }
    catch (error) {
      const trace = await page.evaluate(() => window.__detailFooterEntranceTrace());
      t.diagnostic(JSON.stringify({ footerEntranceTimeout: trace, requests: entranceRequests }));
      await capture(page, `${config.name}-footer-entry-timeout`);
      throw error;
    } finally {
      const entrance = await page.evaluate(() => window.__detailFooterEntranceTrace());
      page.off('request', requestStart); page.off('requestfinished', requestEnd);
      evidence.observations.push({ check: t.name, entrance, requests: entranceRequests });
    }
    assert.equal(await footer.getByRole('heading', { name: 'Start with evidence. Train what’s next.', exact: true }).count(), 1, 'split letters keep the complete accessible title');
    assert.ok(await footer.locator('.marketing-footer-title-character').count() > 20);
    await capture(page, `${config.name}-footer-entering`);
    await place(page, '.marketing-footer', 'below');
    await waitData(page, '.marketing-footer', 'footer-state', 'out');
    await place(page, '.marketing-footer', 'inside');
    await waitData(page, '.marketing-footer', 'footer-state', 'in');
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await frames(page);
    const address = page.url();
    await place(page, '.marketing-footer-next', 'inside');
    await page.waitForFunction(() => !document.querySelector('.marketing-footer-next').getAnimations().some(animation => animation.playState === 'running'));
    // Use explicit points within the now-visible link. A second locator hover
    // can auto-scroll a partly clipped link and intentionally hide the cursor.
    const linkBox = await next.boundingBox();
    const cursorY = Math.min(940, Math.max(120, linkBox.y + linkBox.height * .4));
    assert.equal(await next.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), { x: linkBox.x + 35, y: cursorY }), true, 'cursor probe is over the actual linked preview');
    await page.mouse.move(linkBox.x + 35, cursorY, { steps: 3 });
    await waitData(page, '.marketing-cursor', 'visible', 'true'); await frames(page);
    await cursorInsideViewport(page);
    const pointer1 = await page.locator('.marketing-cursor').boundingBox();
    await page.mouse.move(linkBox.x + linkBox.width - 35, cursorY, { steps: 3 });
    await waitData(page, '.marketing-cursor', 'visible', 'true'); await frames(page);
    const pointer2 = await page.locator('.marketing-cursor').boundingBox();
    assert.ok(Math.abs(pointer1.x - pointer2.x) > 20, `footer cursor follows the pointer over its linked preview: ${JSON.stringify({ pointer1, pointer2 })}`);
    // Locator hover may scroll a partly visible preview back into view. Begin
    // the pull at the actual bottom, with the pointer on visible footer space.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    // Entrance transforms can briefly change the document's visual overflow.
    // Converge on the final scroll limit before sending the gesture under test.
    try { await page.waitForFunction(() => {
      const maximum = document.documentElement.scrollHeight - innerHeight;
      const state = window.__detailBottomState ??= { maximum: -1, stable: 0 };
      if (state.maximum !== maximum || scrollY < maximum - 2) {
        state.stable = 0;
        window.scrollTo({ top: maximum, behavior: 'instant' });
      } else state.stable++;
      state.maximum = maximum;
      return state.stable >= 4;
    }); }
    catch (error) {
      t.diagnostic(JSON.stringify(await page.evaluate(() => ({ scroll: scrollY, height: document.documentElement.scrollHeight, viewport: innerHeight, bodyHeight: document.body.scrollHeight, scrollElement: document.scrollingElement?.tagName, active: document.activeElement?.className, footerTop: document.querySelector('.marketing-footer').getBoundingClientRect().top }))));
      throw error;
    }
    await page.mouse.move(1000, 800);
    await page.mouse.wheel(0, 1800);
    await page.waitForFunction(() => Number(document.querySelector('.marketing-footer').style.getPropertyValue('--footer-pull')) > .1);
    const pull = await footer.evaluate(node => Number(node.style.getPropertyValue('--footer-pull')));
    assert.ok(pull > 0 && pull <= 1, 'bottom pull is bounded');
    await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.marketing-footer-next-scene')).transform).a > 1.001);
    const scale = await next.locator('.marketing-footer-next-scene').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a);
    assert.ok(scale > 1 && scale <= 1.061, `miniature scale is bounded: ${scale}`);
    assert.equal(page.url(), address, 'wheel never navigates');
    await capture(page, `${config.name}-footer-bottom-pull`);
    await page.waitForFunction(() => Number(document.querySelector('.marketing-footer').style.getPropertyValue('--footer-pull')) === 0);
    assert.equal(page.url(), address, 'release never navigates');
    await place(page, '.marketing-footer', 'below');
    await next.focus();
    await waitData(page, '.marketing-footer', 'footer-state', 'in');
    assert.equal(await footer.evaluate(node => node.style.getPropertyValue('--footer-grid-progress')), '1', 'keyboard focus exposes footer immediately');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.marketing-footer').hasAttribute('data-footer-motion'));
    assert.equal(await footer.getAttribute('data-footer-motion'), null);
    assert.equal(await footer.locator('.marketing-footer-title-character').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).transform === 'none')), true);
    const destination = config.name === 'players' ? '/coaches' : '/';
    assert.equal(await next.getAttribute('href'), destination);
    await page.keyboard.press('Enter');
    // Netlify Pretty URLs canonicalizes this real /coaches link to /coaches/.
    // Keep the authored href assertion above and accept only that alias here.
    await page.waitForURL(url => url.origin === origin && (url.pathname === destination || (destination === '/coaches' && url.pathname === '/coaches/')));
  });
}

check('touch menu omits hover miniatures and closing preview needs an explicit tap', async t => {
  const { page } = await fixture(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await visit(page, '/coaches');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.locator('.pt-menu-peek').getAttribute('data-visible'), 'false');
  await dialog.locator('a[href="#players"]').tap();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForURL(url => url.hash === '#players');
  await page.locator('.marketing-footer-next').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.marketing-cursor').getAttribute('data-visible'), 'false');
  const address = page.url();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await frames(page);
  assert.equal(page.url(), address, 'reaching the closing panel does not navigate');
  await page.locator('.marketing-footer-next').tap();
  await page.waitForURL(url => url.pathname === '/');
});

check('dimensional mark settles pointer tilt and stops rendering while offscreen or hidden', async t => {
  const { page, context } = await fixture(t);
  await context.addInitScript(() => {
    window.__detailHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__detailHidden });
    window.__setDetailHidden = hidden => { window.__detailHidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  });
  await visit(page, '/coaches');
  const mark = page.locator('.marketing-footer-mark');
  await mark.scrollIntoViewIfNeeded();
  await waitData(page, '.marketing-footer-mark', 'mark-state', 'enhanced');
  const renderedFrames = () => mark.evaluate(node => Number(node.dataset.rendererFrames || 0));
  const quietFrames = async () => {
    // Worker telemetry can arrive after the pause signal. Wait for that final
    // message, then verify a separate interval without any additional draws.
    const started = Date.now(); let previous = -1, same = 0;
    while (Date.now() - started < 2500) {
      const value = await renderedFrames();
      if (value === previous) same++; else same = 0;
      if (same >= 3) return value;
      previous = value; await page.waitForTimeout(75);
    }
    assert.fail('Dimensional mark did not stop worker drawing within 2500ms');
  };
  assert.equal(await mark.getAttribute('data-renderer-owner'), 'worker');
  assert.ok(await renderedFrames() > 0, 'enhanced mark has completed real worker draws');
  await page.mouse.move(1200, 800);
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('.marketing-footer-mark').dataset.markTiltY)) > .005);
  const tilt = await mark.evaluate(node => ({ x: Number(node.dataset.markTiltX), y: Number(node.dataset.markTiltY), rise: Number(node.dataset.markRise) }));
  assert.ok(Math.abs(tilt.x) <= .171 && Math.abs(tilt.y) <= .321);
  assert.ok(tilt.rise >= 0 && tilt.rise <= 1);
  await capture(page, 'coaches-dimensional-mark-pointer');
  await page.mouse.move(4, 20); // The fixed header is outside the tall footer even at document bottom.
  await waitData(page, '.marketing-footer-mark', 'mark-motion', 'idle');
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('.marketing-footer-mark').dataset.markTiltY)) < .001);
  const idle = await quietFrames();
  await frames(page, 18);
  assert.equal(await renderedFrames(), idle, 'settled mark has no perpetual render loop');
  await place(page, '#club', 'inside'); await frames(page, 3);
  const offscreen = await quietFrames();
  await page.mouse.move(900, 400); await frames(page, 18);
  assert.equal(await renderedFrames(), offscreen, 'offscreen mark does not render');
  await mark.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__setDetailHidden(true)); await frames(page, 3);
  const hidden = await quietFrames();
  await page.mouse.move(1200, 800); await frames(page, 18);
  assert.equal(await renderedFrames(), hidden, 'simulated hidden document does not render');
  await page.evaluate(() => window.__setDetailHidden(false));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitData(page, '.marketing-footer-mark', 'mark-state', 'static');
  assert.equal(await page.locator('.marketing-footer-mark-fallback').isVisible(), true);
  evidence.observations.push({ check: t.name, tilt, drawsAtRest: idle, visibility: 'controlled document visibility-event injection; actual offscreen scrolling' });
});

// Warm choreography checks complement the separate cold first-input lane.
// Sampling is armed before input so a short entrance cannot be missed by a
// later protocol read; the browser's real Escape/click owns dismissal.
for (const touch of [false, true]) {
  check(`${touch ? 'touch' : 'desktop'}: partial menu dismissal preserves the current curtain instead of flashing full coverage`, async t => {
    const { page } = await fixture(t, touch ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    await visit(page, '/coaches');
    const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
    for (const method of ['Escape', 'Close control']) {
      await page.evaluate(() => {
        const dialog = document.querySelector('.pt-marketing-menu');
        const read = () => ({
          at: performance.now(), phase: document.documentElement.dataset.marketingNavigation, hidden: dialog.hidden,
          covers: [...dialog.querySelectorAll('.pt-menu-curtain-slice')].map(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).d),
          contentOpacity: Number(getComputedStyle(dialog.querySelector('.pt-menu-content')).opacity),
          chromeOpacity: Number(getComputedStyle(dialog.querySelector('.pt-menu-top')).opacity),
        });
        const samples = [], started = performance.now();
        const data = window.__detailInterruptedMenu = { samples, beforeDismiss: null, complete: false };
        const beforeDismiss = event => {
          if (dialog.hidden || dialog.dataset.closing === 'true') return;
          if (event.type === 'keydown' && event.key !== 'Escape') return;
          if (event.type === 'pointerdown' && !event.target.closest('[data-menu-close]')) return;
          data.beforeDismiss = read();
        };
        window.addEventListener('keydown', beforeDismiss, true);
        window.addEventListener('pointerdown', beforeDismiss, true);
        const sample = () => {
          const state = read(); samples.push(state);
          if (data.beforeDismiss && state.hidden || performance.now() - started > 3000) {
            window.removeEventListener('keydown', beforeDismiss, true);
            window.removeEventListener('pointerdown', beforeDismiss, true);
            data.complete = true; return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await opener.click();
      await page.waitForFunction(() => window.__detailInterruptedMenu.samples.some(sample => sample.phase === 'opening' && Math.max(...sample.covers) > .06 && Math.max(...sample.covers) < .4));
      if (method === 'Escape') await page.keyboard.press('Escape');
      else {
        const point = await page.locator('[data-menu-close]').evaluate(node => { const box = node.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; });
        if (touch) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
      }
      await page.waitForFunction(() => window.__detailInterruptedMenu.complete);
      const sample = await page.evaluate(() => window.__detailInterruptedMenu);
      evidence.observations.push({ check: t.name, method, sample });
      assert.ok(sample.beforeDismiss && Math.max(...sample.beforeDismiss.covers) > .03 && Math.max(...sample.beforeDismiss.covers) < .9, `real input interrupted a genuinely partial entrance: ${JSON.stringify(sample.beforeDismiss)}`);
      const opening = sample.samples.filter(state => state.phase === 'opening' && !state.hidden);
      assert.ok(opening.length > 0 && opening.every(state => state.chromeOpacity > .99), 'Close and sound controls remain visible from the first opening frame');
      const closing = sample.samples.filter(state => state.phase === 'closing' && !state.hidden);
      assert.ok(closing.length > 0, 'the interrupted closing animation is actually observed');
      assert.ok(closing.every(state => state.covers.every((cover, index) => cover <= sample.beforeDismiss.covers[index] + .035)), 'no closing frame jumps to greater curtain coverage');
      assert.ok(closing.some(state => state.covers.some((cover, index) => {
        const initial = sample.beforeDismiss.covers[index];
        return initial > .03 && cover > initial * .15 && cover < initial * .85;
      })), 'interrupted curtains shrink through intermediate frames rather than switching discretely to zero');
      assert.ok(closing.every(state => state.contentOpacity <= sample.beforeDismiss.contentOpacity + .02), 'still-hidden or partly visible navigation does not flash fully visible on dismissal');
      assert.equal(await opener.evaluate(node => node === document.activeElement), true, 'dismissal restores the opener');
      assert.equal(await page.locator('main').evaluate(node => Boolean(node.closest('[inert]'))), false, 'background is released after dismissal');
      assert.equal(await page.locator('.pt-navigation-disclosure').getAttribute('open'), null);
    }
  });
}

check('desktop menu preview appears at its seeded position and returns from bounded pointer tilt', async t => {
  const { page } = await fixture(t);
  await visit(page, '/coaches');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.pt-marketing-menu').getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  const link = page.locator('.pt-menu-pages [data-menu-page="coaches"]');
  const linkBounds = await link.boundingBox();
  for (const offset of [170, 420]) {
    await page.mouse.move(20, 20);
    await waitData(page, '.pt-menu-peek', 'visible', 'false');
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.pt-menu-peek-panel')).opacity) < .01);
    await page.evaluate(() => {
      const samples = [], started = performance.now();
      window.__detailSeededPreview = { samples, complete: false };
      const sample = () => {
        const preview = document.querySelector('.pt-menu-peek'), panel = preview.querySelector('.pt-menu-peek-panel');
        const box = preview.getBoundingClientRect(), matrix = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
        samples.push({ at: performance.now(), visible: preview.dataset.visible, positioned: preview.dataset.positioned, opacity: Number(getComputedStyle(panel).opacity), x: box.left, y: box.top, width: box.width, height: box.height, angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI });
        if (performance.now() - started < 1100) requestAnimationFrame(sample);
        else window.__detailSeededPreview.complete = true;
      };
      requestAnimationFrame(sample);
    });
    await page.mouse.move(linkBounds.x + offset, linkBounds.y + 35);
    await page.waitForFunction(() => window.__detailSeededPreview.complete);
    const data = await page.evaluate(() => window.__detailSeededPreview);
    const visible = data.samples.filter(sample => sample.opacity > .01);
    assert.ok(visible.length > 0);
    assert.ok(visible.every(sample => sample.positioned === 'true'), 'the preview cannot become visible before its position is seeded');
    const final = visible.at(-1);
    assert.ok(visible.every(sample => Math.abs(sample.x - final.x) < 2 && Math.abs(sample.y - final.y) < 2), 'first appearance does not fly from the viewport origin or a stale location');
    assert.ok(visible.every(sample => sample.x >= 0 && sample.y >= 0 && sample.x + sample.width <= 1440 && sample.y + sample.height <= 1000));
    evidence.observations.push({ check: t.name, offset, samples: data.samples });
  }
  await page.mouse.move(linkBounds.x + 550, linkBounds.y + 45);
  await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('.pt-menu-peek').style.getPropertyValue('--peek-angle'))) > .1);
  const angle = await page.locator('.pt-menu-peek').evaluate(node => parseFloat(node.style.getPropertyValue('--peek-angle')));
  assert.ok(Math.abs(angle) <= 8, 'pointer tilt is bounded');
  await page.waitForFunction(() => document.querySelector('.pt-menu-peek').style.getPropertyValue('--peek-angle') === '0deg');
  await page.waitForFunction(() => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.pt-menu-peek-panel')).transform);
    return Math.abs(Math.atan2(matrix.b, matrix.a)) < .002;
  });
  await capture(page, 'desktop-menu-preview-seeded-and-settled');
});
