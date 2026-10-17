// Run separately after build:marketing: node --test scripts/marketing-revamp.browser.mjs
// Guest-only acceptance. No credentials, production reads, writes, email, or model calls.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';

const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
const artifacts = fileURLToPath(new URL('../artifacts/marketing-revamp/', import.meta.url));
// Deterministic offline checks by default. Opt in to GET-only Google font requests
// for visual review; every other external HTTP request and every WebSocket is blocked.
const allowFonts = process.env.MARKETING_ALLOW_FONTS === '1';
const evidence = { output, networkPolicy: allowFonts ? 'loopback GET/HEAD + Google fonts GET; all other HTTP and WebSockets blocked' : 'loopback GET/HEAD only; external HTTP and all WebSockets blocked', checks: [], screenshots: [], requests: { externalBlocked: 0, writesBlocked: 0, fontsAllowed: 0 }, measurements: [] };
const pages = [
  { route: '/', name: 'players', chapters: ['tests', 'profile', 'training', 'ai-coach', 'technique', 'mobile-app'], title: 'PoseTek | Start with evidence. Train what’s next.' },
  { route: '/coaches', name: 'coaches', chapters: ['club', 'players', 'development', 'contact'], title: 'PoseTek for Coaches & Clubs | Start with every player.' },
];
let server, browser, origin;

before(async () => {
  try {
    for (const entry of ['index.html', 'coaches/index.html']) await stat(resolve(output, entry));
    await mkdir(artifacts, { recursive: true });
    server = createHomepagePreviewServer({ marketingRoot: output, referenceRoot: output });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    evidence.setup = { status: 'ready' };
  } catch (error) { evidence.setup = { status: 'failed', error: error.message }; throw error; }
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
  const summary = { ...evidence, passed: evidence.checks.filter(item => item.status === 'passed').length, failed: evidence.checks.filter(item => item.status === 'failed').length + Number(evidence.setup?.status === 'failed') };
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, 'acceptance.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, screenshots: summary.screenshots.length, evidence: resolve(artifacts, 'acceptance.json'), networkPolicy: summary.networkPolicy }));
});

function check(name, run) {
  test(name, { timeout: 90_000 }, async t => {
    const start = Date.now();
    try { await run(t); evidence.checks.push({ name, status: 'passed', milliseconds: Date.now() - start }); }
    catch (error) { evidence.checks.push({ name, status: 'failed', error: error.message }); throw error; }
  });
}

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', ...options });
  const errors = [], localFailures = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { evidence.requests.writesBlocked++; return route.abort('blockedbyclient'); }
    if (url.origin === origin) return route.continue();
    if (allowFonts && url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
      evidence.requests.fontsAllowed++; return route.continue();
    }
    evidence.requests.externalBlocked++;
    if (request.resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (new URL(request.url()).origin === origin) localFailures.push(request.url()); });
  const state = { page, context, errors, localFailures, expectedLocalFailures: false };
  t.after(async () => {
    await context.close();
    try {
      assert.deepEqual(errors, [], 'uncaught browser exceptions');
      if (!state.expectedLocalFailures) assert.deepEqual(localFailures, [], 'unexpected local request failure');
    } catch (error) {
      const result = evidence.checks.find(item => item.name === t.name);
      if (result) { result.status = 'failed'; result.error = error.message; }
      throw error;
    }
  });
  return state;
}

async function visit(page, route, hydrated = true) {
  const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  if (hydrated) await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
}

async function screenshot(page, name, fullPage = false) {
  const path = resolve(artifacts, name + '.png');
  await page.screenshot({ path, fullPage, animations: 'disabled' });
  evidence.screenshots.push(path);
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, width: document.documentElement.scrollWidth }));
  assert.ok(dimensions.width <= dimensions.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}

async function scrollSection(page, id) {
  await page.locator('#' + id).evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForFunction(() => !document.querySelector('.pixel-reveal'));
}

async function demoReady(page, kind) {
  const demo = page.locator(`[data-demo="${kind}"]`);
  await demo.scrollIntoViewIfNeeded();
  await page.waitForFunction(kind => document.querySelector(`[data-demo="${kind}"]`)?.dataset.demoState === 'ready', kind);
  return demo;
}

async function undersizedVisibleControls(page) {
  return page.locator('button,a[href],input[type="range"]').evaluateAll(nodes => nodes.flatMap(node => {
    const bounds = node.getBoundingClientRect(), style = getComputedStyle(node);
    if (bounds.width === 0 || bounds.height === 0 || bounds.bottom <= 0 || bounds.top >= innerHeight || style.visibility === 'hidden' || node.closest('[inert]')) return [];
    if (bounds.width >= 43.9 && bounds.height >= 43.9) return [];
    return [{ label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 90), classes: node.className, width: Math.round(bounds.width * 10) / 10, height: Math.round(bounds.height * 10) / 10 }];
  }));
}

async function unclippedText(locator, label) {
  const clipped = await locator.evaluate(root => {
    const issues = [], walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode, parent = node.parentElement;
      if (!node.textContent.trim() || !parent || parent.closest('[aria-hidden="true"],svg,style,script,[hidden],.pd-sr-only')) continue;
      if (!parent.getClientRects().length || getComputedStyle(parent).visibility === 'hidden') continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        let left = 0, right = innerWidth;
        for (let ancestor = parent; ancestor && ancestor !== root.parentElement; ancestor = ancestor.parentElement) {
          if (['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) {
            const bounds = ancestor.getBoundingClientRect();
            left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
          }
        }
        if (rect.left < left - 1 || rect.right > right + 1) issues.push({ text: node.textContent.trim().slice(0, 70), left: Math.round(rect.left), right: Math.round(rect.right), available: [Math.round(left), Math.round(right)] });
      }
    }
    return issues;
  });
  assert.deepEqual(clipped, [], `${label}: text is clipped horizontally: ${JSON.stringify(clipped)}`);
}

for (const config of pages) {
  for (const width of [360, 390, 430, 768, 1440, 1920]) {
    check(`${config.name}: ${width}px readable layout, complete chapters and destinations`, async t => {
      const { page } = await fixture(t, { viewport: { width, height: width < 768 ? 844 : 1080 } });
      await visit(page, config.route);
      assert.equal(await page.title(), config.title);
      assert.match(await page.locator('h1').innerText(), /Start with\s+evidence\./);
      await noOverflow(page, `${config.name} hero ${width}`);
      const chapterLinks = page.locator('.chapter-nav a');
      assert.deepEqual(await chapterLinks.evaluateAll(links => links.map(link => link.getAttribute('href'))), config.chapters.map(id => '#' + id));
      assert.equal(await page.locator('.pt-marketing-bar button[aria-label="Interface sound"]').getAttribute('aria-pressed'), 'false');
      await screenshot(page, `${config.name}-${width}-hero`);
      for (const id of config.chapters) {
        assert.equal(await page.locator('#' + id).count(), 1, `unique ${id} anchor`);
        await scrollSection(page, id);
        await page.locator(`#${id} h2`).waitFor({ state: 'visible' });
        await noOverflow(page, `${config.name}/${id} ${width}`);
      }
      await page.locator('footer').scrollIntoViewIfNeeded();
      await noOverflow(page, `${config.name} footer ${width}`);
      assert.equal(await page.locator('.marketing-footer-next').getAttribute('href'), config.name === 'players' ? '/coaches' : '/');
      assert.ok(await page.locator('a[href="/bookPerformanceTest.html"]').count() > 0);
      assert.ok(await page.locator('a[href="/signin"]').count() > 0);
      assert.ok(await page.locator('a[href="mailto:dylank@posetek.net?subject=PoseTek%20team%20enquiry"]').count() > 0);
      if ([390, 1440].includes(width)) {
        await screenshot(page, `${config.name}-${width}-footer`);
        await screenshot(page, `${config.name}-${width}-full`, true);
      }
      evidence.measurements.push(await page.evaluate(({ name, width }) => ({ name, width, htmlBytes: document.documentElement.outerHTML.length, domNodes: document.querySelectorAll('*').length, resources: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === location.origin).reduce((sum, entry) => sum + entry.transferSize, 0), domContentLoadedMs: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd }), { name: config.name, width }));
    });
  }

  for (const menuWidth of [390, 1440]) check(`${config.name}: ${menuWidth}px keyboard menu, focus trap, Escape, scroll restoration and chapter history`, async t => {
    const { page } = await fixture(t, { viewport: { width: menuWidth, height: 1000 } });
    await visit(page, config.route);
    await scrollSection(page, config.chapters[0]);
    const open = page.getByRole('button', { name: 'Open navigation', exact: true });
    await open.focus();
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Explore PoseTek' });
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getByRole('button', { name: 'Close navigation', exact: true }).evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('main').evaluate(node => node.inert), true);
    assert.equal(await page.locator('footer').evaluate(node => node.inert), true);
    const links = dialog.locator('a[href],button:not([disabled]),[tabindex="0"]');
    await links.last().focus(); await page.keyboard.press('Tab');
    assert.equal(await links.first().evaluate(node => node === document.activeElement), true, 'Tab wraps to first dialog control');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await links.last().evaluate(node => node === document.activeElement), true, 'Shift+Tab wraps to last dialog control');
    await screenshot(page, `${config.name}-${menuWidth}-menu`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await open.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('main').evaluate(node => node.inert), false);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 2, 'opening and closing menu preserves page scroll');
    await open.click();
    const target = config.chapters[1];
    await dialog.locator(`a[href="#${target}"]`).click();
    await dialog.waitFor({ state: 'hidden' });
    try { await page.waitForFunction(id => location.hash === '#' + id && document.activeElement === document.querySelector(`#${id} h2`), target); }
    catch (error) { t.diagnostic(JSON.stringify(await page.evaluate(() => ({ hash: location.hash, activeTag: document.activeElement.tagName, activeId: document.activeElement.id, scroll: scrollY })))); throw error; }
    await page.locator(`.chapter-nav a[href="#${config.chapters[2]}"]`).click();
    await page.waitForURL(url => url.hash === '#' + config.chapters[2]);
    await page.goBack();
    await page.waitForURL(url => url.hash === '#' + target);
    await page.goForward();
    await page.waitForURL(url => url.hash === '#' + config.chapters[2]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top) < 180, config.chapters[2]);
  });

  check(`${config.name}: SSR remains usable without JavaScript`, async t => {
    const { page } = await fixture(t, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await visit(page, config.route, false);
    assert.match(await page.locator('h1').innerText(), /Start with\s+evidence\./);
    assert.equal(await page.locator('[src^="file:"],[href^="file:"]').count(), 0, 'server-rendered asset URLs must be public URLs, never local filesystem paths');
    for (const id of config.chapters) {
      await page.locator(`.chapter-nav a[href="#${id}"]`).click();
      assert.equal(new URL(page.url()).hash, '#' + id);
      assert.equal(await page.locator(`#${id} h2`).isVisible(), true);
    }
    assert.ok(await page.locator('a[href="/signin"]:visible').count() > 0);
    assert.ok(await page.locator('a[href="/bookPerformanceTest.html"]:visible').count() > 0);
    await noOverflow(page, `${config.name} no-JavaScript`);
    await screenshot(page, `${config.name}-390-nojs`, true);
  });

  check(`${config.name}: reduced motion and WebGL failure keep essential content available`, async t => {
    const { page } = await fixture(t, { reducedMotion: 'reduce' });
    await visit(page, config.route);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    for (const id of config.chapters) await scrollSection(page, id);
    assert.equal(await page.locator('.pixel-reveal').count(), 0);
    await page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.marketing-footer-mark').getAttribute('data-mark-state'), 'static');
    assert.equal(await page.locator('.marketing-footer-mark canvas').count(), 0);
    assert.equal(await page.locator('.marketing-footer-mark-fallback').isVisible(), true);
    await noOverflow(page, `${config.name} reduced motion`);
  });

  check(`${config.name}: touch controls meet 44px, including demonstration controls`, async t => {
    const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await visit(page, config.route);
    const small = [];
    small.push(...await undersizedVisibleControls(page));
    for (const id of config.chapters) {
      await scrollSection(page, id);
      const pending = page.locator(`#${id} [data-demo]`);
      if (await pending.count()) await demoReady(page, await pending.getAttribute('data-demo'));
      small.push(...await undersizedVisibleControls(page));
      // Bottom-of-panel controls can be below the initial section viewport.
      const controls = page.locator(`#${id} button`);
      if (await controls.count()) {
        await controls.last().scrollIntoViewIfNeeded();
        small.push(...await undersizedVisibleControls(page));
      }
    }
    await page.locator('footer').scrollIntoViewIfNeeded();
    small.push(...await undersizedVisibleControls(page));
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'visible' });
    small.push(...await undersizedVisibleControls(page));
    const unique = [...new Map(small.map(item => [JSON.stringify(item), item])).values()];
    assert.deepEqual(unique, [], `undersized visible touch controls: ${JSON.stringify(unique)}`);
  });

  check(`${config.name}: orientation changes retain navigation and fit at 200% desktop zoom equivalent`, async t => {
    const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    await visit(page, config.route);
    await page.setViewportSize({ width: 844, height: 390 });
    await noOverflow(page, `${config.name} landscape`);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Explore PoseTek' });
    await dialog.waitFor({ state: 'visible' });
    await noOverflow(page, `${config.name} landscape menu`);
    await dialog.getByRole('link', { name: 'Privacy', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await dialog.getByRole('link', { name: 'Privacy', exact: true }).isVisible(), true);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page, `${config.name} restored portrait`);
    // Browser zoom is represented by its observable layout: half the CSS viewport
    // and twice the device scale at a fixed 1440x900 physical display. This does
    // not claim to operate Chrome's browser-chrome zoom menu.
    const zoom = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    await visit(zoom.page, config.route);
    for (const id of config.chapters) { await scrollSection(zoom.page, id); await noOverflow(zoom.page, `${config.name} 200%/${id}`); }
    await zoom.page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await zoom.page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'visible' });
    await noOverflow(zoom.page, `${config.name} 200% menu`);
    await screenshot(zoom.page, `${config.name}-200-percent-menu`);
  });
}

check('WebGL unavailable: dimensional mark falls back without interrupting links', async t => {
  const { page, context } = await fixture(t);
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (/webgl/i.test(type)) { window.__marketingWebGLAttempts = (window.__marketingWebGLAttempts || 0) + 1; return null; }
      return original.call(this, type, ...args);
    };
  });
  await visit(page, '/coaches');
  await page.locator('.marketing-footer-mark').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => window.__marketingWebGLAttempts > 0);
  assert.equal(await page.locator('.marketing-footer-mark').getAttribute('data-mark-state'), 'static');
  assert.equal(await page.locator('.marketing-footer-mark-fallback').isVisible(), true);
  assert.equal(await page.locator('.marketing-footer-next').getAttribute('href'), '/');
  await screenshot(page, 'coaches-no-webgl-footer');
});

check('sound remains opt-in and persists only within its browsing session', async t => {
  const { page, context } = await fixture(t);
  await context.addInitScript(() => {
    window.__marketingAudioContexts = 0;
    if (window.AudioContext) window.AudioContext = new Proxy(window.AudioContext, { construct(target, args) { window.__marketingAudioContexts++; return Reflect.construct(target, args); } });
  });
  await visit(page, '/');
  const sound = page.getByRole('button', { name: 'Interface sound', exact: true });
  assert.equal(await sound.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => window.__marketingAudioContexts), 0);
  await sound.click();
  assert.equal(await sound.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('posetek.marketing.sound')), 'on');
  await visit(page, '/coaches');
  assert.equal(await sound.getAttribute('aria-pressed'), 'true');
  await sound.click();
  assert.equal(await sound.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('posetek.marketing.sound')), 'off');
});

check('Players: six recordings, real playback, skill selection, workout progression, coach handoff and technique', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce' });
  await visit(page, '/');
  const movement = await demoReady(page, 'movement');
  const tests = page.getByRole('group', { name: 'Choose a performance test', exact: true }).getByRole('button');
  assert.equal(await tests.count(), 6);
  for (let index = 0; index < 6; index++) {
    await tests.nth(index).click();
    assert.equal(await tests.nth(index).getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(index => document.querySelector('.pose-carousel-count')?.getAttribute('aria-label') === `Recording ${index + 1} of 6`, index);
  }
  await movement.getByRole('button', { name: 'Next recording', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.test-choices button')?.getAttribute('aria-pressed') === 'true');
  const scrubber = movement.getByRole('slider', { name: 'Pose playback position' });
  await scrubber.fill('0');
  await movement.getByRole('button', { name: 'Play pose playback', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('#poseScrubber').value) > 0);
  await movement.getByRole('button', { name: 'Pause pose playback', exact: true }).click();
  assert.equal(await movement.locator('#posePlayButton').getAttribute('aria-pressed'), 'false');
  await scrubber.fill('10');
  assert.equal(await scrubber.inputValue(), '10');
  const skills = page.locator('#profile button[data-skill]');
  for (let index = 0; index < await skills.count(); index++) {
    const skill = skills.nth(index), name = await skill.innerText();
    await skill.click();
    assert.equal(await skill.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#skillName').innerText(), name);
  }
  const workout = await demoReady(page, 'workout');
  await workout.getByRole('button', { name: 'Customize', exact: true }).click();
  await workout.getByRole('button', { name: '15 min', exact: true }).click();
  await workout.getByRole('button', { name: 'Choose your focus', exact: true }).click();
  await workout.getByRole('button', { name: 'passing', exact: true }).click();
  await workout.getByRole('button', { name: 'Create sample workout', exact: true }).click();
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).click();
  await workout.getByRole('button', { name: 'Pause workout timer', exact: true }).click();
  const timer = await workout.getByRole('timer').innerText();
  await workout.getByRole('button', { name: 'Resume workout timer', exact: true }).waitFor({ state: 'visible' });
  assert.ok(timer.length > 0);
  for (let step = 0; step < 30; step++) {
    const advance = workout.getByRole('button', { name: /^(Complete set \d+|Skip rest)$/ });
    if (!await advance.count()) break;
    await advance.click();
  }
  await workout.getByRole('heading', { name: 'See the work add up.', exact: true }).waitFor({ state: 'visible' });
  await workout.getByRole('button', { name: 'Build another sample', exact: true }).click();
  const coach = await demoReady(page, 'coach');
  const metrics = coach.getByRole('group', { name: 'Explore sample results', exact: true }).getByRole('button');
  await metrics.last().click();
  assert.equal(await metrics.last().getAttribute('aria-pressed'), 'true');
  await coach.getByText('Why this recommendation?', { exact: true }).click();
  assert.equal(await coach.locator('details').getAttribute('open'), '');
  await coach.getByRole('button', { name: /Help me plan 20 minutes/ }).click();
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).waitFor({ state: 'visible' });
  assert.match(await workout.innerText(), /20 min available/);
  const technique = await demoReady(page, 'technique');
  await technique.getByRole('button', { name: 'Play technique at quarter speed', exact: true }).click();
  await technique.getByRole('button', { name: 'Pause technique playback', exact: true }).click();
  await technique.getByRole('slider', { name: 'Scrub kick frame', exact: true }).fill('10');
  await technique.getByRole('group', { name: 'Kick analysis phases', exact: true }).getByRole('button').first().click();
  const reference = technique.getByRole('button', { name: 'Show reference', exact: true });
  if (await reference.count()) { await reference.click(); assert.equal(await technique.getByRole('button', { name: 'Hide reference', exact: true }).getAttribute('aria-pressed'), 'true'); }
});

check('Coaches: team and player stay connected through Plan, Train and Retest', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await visit(page, '/coaches');
  await page.getByRole('group', { name: 'Choose a sample team', exact: true }).getByRole('button', { name: /U15/ }).click();
  assert.match(await page.locator('.cx-team-context').innerText(), /Taylor Brooks/);
  const players = page.getByRole('group', { name: 'Choose a sample player from U15', exact: true });
  await players.getByRole('button', { name: /Riley Chen/ }).click();
  assert.equal(await page.locator('.cx-player-heading h3').innerText(), 'Riley Chen');
  const development = page.locator('.coach-development');
  assert.match(await development.innerText(), /Riley Chen/);
  const steps = page.getByRole('group', { name: 'Explore player development', exact: true });
  await steps.getByRole('button', { name: /Train/ }).click();
  await development.getByRole('group', { name: 'Riley Chen sample mobile workout', exact: true }).waitFor();
  assert.match(await development.innerText(), /No workout is recorded/);
  await noOverflow(page, 'Coaches mobile Train');
  await steps.getByRole('button', { name: /Retest/ }).click();
  assert.match(await development.innerText(), /0\.14\s*sec faster/);
  assert.match(await development.innerText(), /Illustrative change · Not a promised outcome/);
  await screenshot(page, 'coaches-390-retest');
  await page.getByRole('group', { name: 'Choose a sample team', exact: true }).getByRole('button', { name: /U17/ }).click();
  assert.equal(await page.locator('.cx-player-heading h3').innerText(), 'Morgan Adams');
  assert.match(await development.innerText(), /Morgan Adams/);
  assert.equal(await steps.getByRole('button', { name: /Plan/ }).getAttribute('aria-pressed'), 'true');
});

check('media failure offers recovery while the drill overview remains usable', async t => {
  const state = await fixture(t, { reducedMotion: 'reduce' });
  state.expectedLocalFailures = true;
  const { page, context } = state;
  let blocked = 0;
  const blockVideo = route => { blocked++; return route.abort('failed'); };
  await context.route(/\.mp4(?:\?.*)?$/, blockVideo);
  await visit(page, '/');
  const workout = await demoReady(page, 'workout');
  await workout.getByRole('button', { name: /Play .* demonstration video/ }).click();
  await workout.getByRole('button', { name: 'Retry video', exact: true }).waitFor({ state: 'visible' });
  assert.ok(blocked > 0);
  assert.ok(await workout.locator('.demo-pitch, .drill-diagram, svg').count() > 0);
  await context.unroute(/\.mp4(?:\?.*)?$/, blockVideo);
  await workout.getByRole('button', { name: 'Retry video', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-demo="workout"] video')?.readyState >= 2);
  assert.equal(await workout.getByRole('button', { name: 'Retry video', exact: true }).count(), 0);
  await scrollSection(page, 'mobile-app');
  await page.waitForFunction(() => document.querySelector('[data-demo="workout"] video')?.paused === true);
});

check('a failed lazy demo stays isolated; bounded retry offers explicit reload recovery', async t => {
  const state = await fixture(t, { reducedMotion: 'reduce' });
  state.expectedLocalFailures = true;
  const { page, context } = state;
  // Follow the currently served document and its exact module import. A guarded
  // production artifact can also contain old immutable chunks with the same prefix.
  const document = await readFile(resolve(output, 'index.html'), 'utf8');
  const entry = document.match(/component-url="([^"]*HomePage[^\"]+)"/)?.[1];
  assert.ok(entry, 'document names its current HomePage module');
  const entrySource = await readFile(resolve(output, '.' + entry), 'utf8');
  const imported = entrySource.match(/import\(\s*["'`]([^"'`]*MovementDemo[^"'`]*\.js)["'`]\s*\)/)?.[1];
  assert.ok(imported, 'current HomePage imports a compiled MovementDemo module');
  const modulePath = new URL(imported, origin + entry).pathname;
  const source = await readFile(resolve(output, '.' + modulePath), 'utf8');
  assert.match(source, /MovementDemo|movement-demo|recorded movement/, 'selected chunk contains the movement demo');
  let attempts = 0;
  const blockedUrl = origin + modulePath;
  const failImport = route => { attempts++; return route.abort('failed'); };
  await context.route(blockedUrl, failImport);
  await visit(page, '/');
  await scrollSection(page, 'tests');
  const movement = page.locator('[data-demo="movement"]');
  await movement.getByRole('button', { name: 'Try again', exact: true }).waitFor({ state: 'visible' });
  assert.ok(attempts > 0, 'real compiled module was withheld');
  await page.locator('#profile button[data-skill]').last().click();
  assert.equal(await page.locator('#profile button[data-skill]').last().getAttribute('aria-pressed'), 'true');
  await demoReady(page, 'workout');
  await context.unroute(blockedUrl, failImport);
  await movement.getByRole('button', { name: 'Try again', exact: true }).click();
  // Chromium retains a rejected module in its document module map. Do not claim
  // that an identical import URL can recover without an explicit page reload.
  const reload = movement.getByRole('button', { name: 'Reload page', exact: true });
  await reload.waitFor({ state: 'visible' });
  assert.match(await movement.innerText(), /Reloading restarts all sample demos on this page\./);
  assert.equal(await page.locator('[data-demo="workout"]').getAttribute('data-demo-state'), 'ready', 'retry keeps other mounted demos intact');
  await Promise.all([page.waitForEvent('load'), reload.click()]);
  await scrollSection(page, 'tests');
  await page.waitForFunction(() => document.querySelector('[data-demo="movement"]')?.dataset.demoState === 'ready');
  await movement.getByRole('button', { name: 'Play pose playback', exact: true }).waitFor({ state: 'visible' });
});

for (const width of [390, 1440]) check(`${width}px close-up demonstrations show full content without horizontal clipping`, async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width, height: width === 390 ? 844 : 1000 } });
  await visit(page, '/');
  for (const [name, selector, kind] of [
    ['profile', '.profile-showcase', null],
    ['training', '[data-demo="workout"]', 'workout'],
    ['technique', '[data-demo="technique"]', 'technique'],
  ]) {
    if (kind) await demoReady(page, kind);
    const panel = page.locator(selector);
    await panel.evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await unclippedText(panel, `players/${name}/${width}`);
    await screenshot(page, `players-${width}-${name}-detail`);
    if (width === 390) {
      await panel.evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'end' }));
      await screenshot(page, `players-${width}-${name}-detail-bottom`);
    }
  }
  await visit(page, '/coaches');
  const evidence = page.locator('.cx-evidence');
  await evidence.evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await unclippedText(evidence, `coaches/player-evidence/${width}`);
  await screenshot(page, `coaches-${width}-player-evidence-detail`);
  if (width === 390) {
    await evidence.evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'end' }));
    await screenshot(page, `coaches-${width}-player-evidence-detail-bottom`);
  }
});

check('360px long test labels and expanded booking navigation remain readable', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 360, height: 844 } });
  await visit(page, '/');
  await scrollSection(page, 'tests');
  await unclippedText(page.locator('.test-choices'), 'six test labels at360px');
  await page.getByRole('group', { name: 'Choose a performance test' }).getByRole('button', { name: /Change of Direction/ }).click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Explore PoseTek' });
  // Test-only text expansion exercises a long real destination label. This does
  // not modify source, application data, or navigation behavior.
  await dialog.locator('.pt-menu-pages a[href="/bookPerformanceTest.html"] strong').evaluate(node => { node.textContent = 'Book a performance test'; });
  await unclippedText(dialog.locator('.pt-menu-pages'), 'expanded booking menu label');
  await screenshot(page, 'players-360-long-navigation-label');
});
