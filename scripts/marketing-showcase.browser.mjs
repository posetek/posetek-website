// Showcase acceptance for the paired preview / retained inline-demo design.
// Run only after the current build is available. Fresh guests; no authenticated actions.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';
import { openShowcase, closeShowcase, panelSelector, requestFailureDetails, classifyPreviewCancellations } from './marketing-showcase.helpers.mjs';

const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
const artifacts = process.env.MARKETING_ARTIFACTS ? resolve(process.env.MARKETING_ARTIFACTS) : fileURLToPath(new URL('../artifacts/marketing-showcase/acceptance/', import.meta.url));
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
  { name: 'players', route: '/', chapters: ['tests', 'profile', 'training', 'ai-coach', 'technique', 'mobile-app'], aliases: ['how-it-works', 'retest'], history: ['profile', 'training'] },
  { name: 'coaches', route: '/coaches', chapters: ['club', 'players', 'development', 'contact'], aliases: [], history: ['players', 'development'] },
];
let browser, server, origin;

before(async () => {
  try {
    for (const file of ['index.html', 'coaches/index.html']) await stat(resolve(output, file));
    await mkdir(artifacts, { recursive: true });
    if (previewOrigin) origin = previewOrigin;
    else {
      server = createHomepagePreviewServer({ marketingRoot: output, referenceRoot: output });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      origin = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch(); evidence.setup = 'ready';
  } catch (error) { evidence.setup = 'failed'; evidence.setupError = error.message; throw error; }
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
  const summary = { ...evidence, passed: evidence.checks.filter(item => item.status === 'passed').length, failed: evidence.checks.filter(item => item.status === 'failed').length + Number(evidence.setup === 'failed') };
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, 'showcase-acceptance.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, screenshots: summary.screenshots.length, evidence: resolve(artifacts, 'showcase-acceptance.json'), networkPolicy: evidence.networkPolicy }));
});

function check(name, run) {
  test(name, { timeout: 120_000 }, async t => {
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
  const page = await context.newPage(); page.setDefaultTimeout(12_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (!closing && new URL(request.url()).origin === origin) failures.push(requestFailureDetails(request)); });
  t.after(async () => {
    const result = evidence.checks.find(item => item.name === t.name);
    if (result?.status === 'failed' && !page.isClosed()) {
      const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      await capture(page, 'failure-' + key).catch(() => {});
      result.geometry = await geometry(page).catch(() => null);
      result.url = page.url();
    }
    const classified = await classifyPreviewCancellations(page, failures);
    (evidence.requests.decorativeCancellations ??= []).push(...classified.expected.map(row => ({ check: t.name, ...row })));
    closing = true; await context.close(); evidence.requests.unexpectedOriginFailures += classified.unexpected.length;
    try { assert.deepEqual(errors, [], 'uncaught browser exceptions'); assert.deepEqual(classified.unexpected, [], 'unexpected tested-origin request failures'); }
    catch (error) { const result = evidence.checks.find(item => item.name === t.name); if (result) { result.status = 'failed'; result.error = error.message; } throw error; }
  });
  return { page, context };
}

async function visit(page, route, hydrated = true) {
  const response = await page.goto(origin + route, { waitUntil: hydrated ? 'domcontentloaded' : 'load' });
  assert.equal(response.status(), 200);
  if (hydrated) await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
}

async function capture(page, name, fullPage = false) {
  const path = resolve(artifacts, name + '.png');
  await page.screenshot({ path, fullPage, animations: 'allow' }); evidence.screenshots.push(path);
}

async function frames(page, count = 4) {
  await page.evaluate(count => new Promise(done => {
    const next = () => --count <= 0 ? done() : requestAnimationFrame(next); requestAnimationFrame(next);
  }), count);
}

async function settle(page) {
  // Let native scroll deliver IntersectionObserver before testing settled state.
  await frames(page, 2);
  await page.waitForFunction(() => !document.querySelector('.reveal-frame[data-reveal-state="entering"]'));
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('.heading-reveal')).some(node => node.getAnimations().some(animation => animation.playState === 'running')));
  await frames(page);
  await page.waitForFunction(() => !document.querySelector('[data-scrambling="true"]') && Array.from(document.querySelectorAll('.chapter-progress [aria-label]')).every(node => node.textContent === node.getAttribute('aria-label')));
  await page.waitForFunction(() => !document.querySelector('.reveal-frame[data-reveal-state="entering"]'));
}

async function stableScroll(page) {
  await page.evaluate(() => new Promise((done, reject) => {
    let previous = scrollY, steady = 0, started = performance.now();
    const sample = () => {
      steady = Math.abs(scrollY - previous) < .5 ? steady + 1 : 0; previous = scrollY;
      if (steady >= 5) done();
      else if (performance.now() - started > 5000) reject(new Error('Native scroll did not settle within five seconds.'));
      else requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  }));
}

async function assertReadableCard(card) {
  const issues = await card.evaluate(root => {
    const found = { controls: [], text: [], fonts: [], scale: [] }, bounds = root.getBoundingClientRect();
    const shown = node => {
      if (node.closest('[hidden],[aria-hidden="true"],svg,.pd-sr-only,.sr-only')) return false;
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    for (const node of root.querySelectorAll('button,a[href],select,input[type="range"],summary,[role="button"],[role="tab"]')) {
      if (!shown(node) || node.disabled) continue;
      const box = node.getBoundingClientRect(), label = node.getAttribute('aria-label') || node.textContent.trim().slice(0, 80);
      if (box.width < 43.9 || box.height < 43.9) found.controls.push({ label, width: box.width, height: box.height });
      if (parseFloat(getComputedStyle(node).fontSize) < 10) found.fonts.push({ label, font: getComputedStyle(node).fontSize, type: 'operative control' });
    }
    // Explanatory prose must remain readable. Decorative mono annotations,
    // chart labels and phone statusbars are not a blanket body-text benchmark.
    for (const node of root.querySelectorAll('p:not(.eyebrow):not(.coach-micro):not(.pd-kicker):not(.showcase-provenance),label,legend')) if (shown(node) && node.textContent.trim() && parseFloat(getComputedStyle(node).fontSize) < 11) found.fonts.push({ text: node.textContent.trim().slice(0, 80), font: getComputedStyle(node).fontSize, type: 'explanatory text' });
    for (const node of root.querySelectorAll('.reveal-frame,.homepage-demo,.product-demo,.profile-demo,.technique-demo,.cx-club,.cx-evidence,.coach-development')) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      if (Math.abs(matrix.a - 1) > .01 || Math.abs(matrix.d - 1) > .01) found.scale.push({ class: node.className, transform: getComputedStyle(node).transform });
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let text;
    while ((text = walker.nextNode())) {
      const parent = text.parentElement;
      if (!text.textContent.trim() || !parent || !shown(parent) || parent.closest('script,style,.interaction-text-visual')) continue;
      const range = document.createRange(); range.selectNodeContents(text);
      for (const box of range.getClientRects()) {
        if (!box.width || !box.height) continue;
        let left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
        for (let ancestor = parent; ancestor && ancestor !== root.parentElement; ancestor = ancestor.parentElement) if (['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) {
          const clip = ancestor.getBoundingClientRect(); left = Math.max(left, clip.left); right = Math.min(right, clip.right);
        }
        if (box.left < left - 1 || box.right > right + 1) found.text.push({ text: text.textContent.trim().slice(0, 80), left: box.left, right: box.right, available: [left, right] });
      }
    }
    return found;
  });
  assert.deepEqual(issues.controls, [], `44px targets: ${JSON.stringify(issues.controls)}`);
  assert.deepEqual(issues.fonts, [], `readable font floors: ${JSON.stringify(issues.fonts)}`);
  assert.deepEqual(issues.scale, [], 'live demo controls are reflowed, not scaled down');
  assert.deepEqual(issues.text, [], `card text clipping: ${JSON.stringify(issues.text.slice(0, 12))}`);
}

async function sourceOrder(page, config) {
  const actual = await page.locator('[data-showcase-frame]').evaluateAll(nodes => nodes.map(node => node.dataset.showcaseFrame));
  assert.deepEqual(actual, config.chapters, 'preview reading order preserves every public chapter');
  assert.deepEqual(await page.locator('.chapter-nav a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), config.chapters.map(id => '#' + id));
  for (const id of [...config.chapters, ...config.aliases, 'top', 'main-content']) assert.equal(await page.locator(`#${id}`).count(), 1, `unique preserved anchor ${id}`);
  const slots = await page.locator('[data-showcase-panel]').evaluateAll(nodes => nodes.map(node => node.dataset.showcasePanel));
  assert.equal(new Set(slots).size, slots.length, 'no duplicated demo slots');
  const pairs = await page.locator('.showcase-pair').evaluateAll(nodes => nodes.map(pair => [...pair.children].map(node => node.dataset.showcaseChapter ? 'preview:' + node.dataset.showcaseChapter : 'panel:' + node.dataset.showcasePanel)));
  const expected = [];
  for (let index = 0; index < config.chapters.length; index += 2) expected.push(config.chapters.slice(index, index + 2).flatMap(id => slots.includes(id) ? ['preview:' + id, 'panel:' + id] : ['preview:' + id]));
  assert.deepEqual(pairs, expected, 'stable DOM slots preserve preview/demo order on phones and never reparent live demos');
}

async function geometry(page) {
  return page.locator('[data-showcase-gallery]').evaluate(gallery => {
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, gallery: rect(gallery),
      chapters: [...gallery.querySelectorAll('[data-showcase-chapter]')].map(node => ({ id: node.dataset.showcaseChapter, ...rect(node) })),
      frames: [...gallery.querySelectorAll('[data-showcase-frame]')].map(node => ({ id: node.dataset.showcaseFrame, ...rect(node) })) };
  });
}

function assertFrames(data) {
  assert.ok(data.documentWidth <= data.width + 1, `horizontal overflow: ${JSON.stringify(data)}`);
  for (const frame of data.frames) {
    assert.ok(frame.width > 0 && frame.height > 0 && frame.left >= -1 && frame.right <= data.width + 1, `visible contained frame ${frame.id}`);
    assert.ok(Math.abs(frame.width / frame.height - 4 / 3) <= .015, `4:3 preview ${frame.id}: ${frame.width}/${frame.height}`);
  }
  if (data.width >= 1024) {
    for (let index = 2; index < data.chapters.length; index++) assert.ok(data.chapters[index].top >= data.chapters[index - 2].bottom + 24, 'each desktop column keeps its full preceding caption readable');
    for (let index = 0; index + 1 < data.frames.length; index += 2) {
      const [left, right] = data.frames.slice(index, index + 2);
      assert.ok(right.left > left.right + 10, 'paired previews have distinct columns and a visible gutter');
      assert.ok(Math.abs(left.width - right.width) <= 2, 'paired 4:3 previews have consistent dimensions');
      assert.ok(right.top > left.top + 12 && right.top < left.bottom - 24, 'second preview has a deliberate, bounded stagger');
      if (index + 2 < data.frames.length) assert.ok(data.frames[index + 2].top > left.bottom + 24, 'each column continues with reading space');
    }
  } else {
    for (let index = 0; index < data.frames.length; index++) {
      assert.ok(data.frames[index].width >= data.width * .8, 'phone/tablet preview uses a readable full column');
      if (index) assert.ok(data.frames[index].top > data.frames[index - 1].bottom + 12, 'single-column order never overlaps');
    }
  }
}

async function anchorSettled(page, id) {
  await stableScroll(page);
  await page.waitForFunction(id => {
    const target = document.getElementById(id), header = document.querySelector('.pt-marketing-bar');
    const top = target?.getBoundingClientRect().top;
    return top >= header.getBoundingClientRect().bottom - 2 && top < innerHeight * .4;
  }, id);
}

for (const config of audiences) {
  for (const width of [360, 390, 430, 768, 1440, 1920]) check(`${config.name}: ${width}px paired previews and full-size inline demonstrations`, async t => {
    const { page } = await fixture(t, { viewport: { width, height: width < 768 ? 844 : 1000 }, isMobile: width <= 430, hasTouch: width <= 430 });
    await visit(page, config.route); await sourceOrder(page, config);
    assert.equal(await page.locator('[data-showcase-panel]:visible').count(), 0, 'initial story presents previews before choosing a demo');
    const initial = await geometry(page); assertFrames(initial);
    evidence.observations.push({ check: t.name, geometry: initial });
    await capture(page, `${config.name}-${width}-hero`);
    for (const id of config.chapters) {
      const frame = page.locator(`[data-showcase-frame="${id}"]`);
      await frame.scrollIntoViewIfNeeded(); await settle(page);
      await assertReadableCard(page.locator('#' + id));
      const open = page.locator(`[data-showcase-open="${id}"]`).first();
      if (await open.count()) {
        const panel = await openShowcase(page, id);
        await settle(page); await assertReadableCard(panel);
        const placement = await panel.evaluate(node => {
          const rect = node.getBoundingClientRect(), gallery = node.closest('[data-showcase-gallery]').getBoundingClientRect();
          const own = document.getElementById(node.dataset.showcasePanel).getBoundingClientRect();
          const pair = node.parentElement;
          const chapters = [...pair.querySelectorAll(':scope > [data-showcase-chapter]')].map(chapter => chapter.getBoundingClientRect());
          const nextPair = pair.nextElementSibling;
          const nextTop = nextPair?.matches('.showcase-pair') ? nextPair.getBoundingClientRect().top : null;
          return { left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom, ownBottom: own.bottom, pairChapterBottom: Math.max(...chapters.map(r => r.bottom)), nextTop, galleryLeft: gallery.left, galleryRight: gallery.right, galleryWidth: gallery.width };
        });
        assert.ok(placement.width >= placement.galleryWidth - 4, `full demo spans the story width: ${JSON.stringify(placement)}`);
        assert.ok(placement.top >= (width >= 1024 ? placement.pairChapterBottom : placement.ownBottom) + 12, 'inline demo clears the complete paired desktop captions or its own phone preview');
        if (placement.nextTop !== null) assert.ok(placement.nextTop >= placement.bottom + 12, 'following pair clears the expanded demo');
        if ([390, 1440].includes(width)) await capture(page, `${config.name}-${width}-${id}-demo`);
        await closeShowcase(page, id);
        assertFrames(await geometry(page));
      }
      if ([390, 1440].includes(width)) {
        await page.locator('#' + id).evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - 110, behavior: 'instant' }));
        await stableScroll(page); await frames(page, 4); await settle(page);
        await capture(page, `${config.name}-${width}-${id}-preview`);
      }
    }
    await sourceOrder(page, config);
    if ([390, 1440].includes(width)) await capture(page, `${config.name}-${width}-full-story`, true);
  });

  check(`${config.name}: one retained demo at a time, keyboard focus and stable source slots`, async t => {
    const { page } = await fixture(t, { reducedMotion: 'reduce' }); await visit(page, config.route);
    const ids = await page.locator('[data-showcase-panel]').evaluateAll(nodes => nodes.map(node => node.dataset.showcasePanel));
    assert.ok(ids.length >= 3, 'audience has genuine inline demos');
    const first = ids[0], second = ids[1], opener = page.locator(`[data-showcase-open="${first}"]`).first();
    await opener.focus(); await page.keyboard.press('Enter');
    const initial = await openShowcase(page, first);
    const handle = await initial.elementHandle();
    await initial.evaluate(node => { node.__acceptanceIdentity = 'retained-first-panel'; });
    assert.equal(await initial.evaluate(node => node.contains(document.activeElement)), true, 'opening places keyboard focus in the chosen panel');
    const secondOpener = await page.locator(`[data-showcase-open="${second}"]`).first().elementHandle();
    const secondPanel = await openShowcase(page, second);
    assert.equal(await initial.isVisible(), false);
    assert.equal(await initial.evaluate(node => node.inert), true);
    assert.equal(await secondPanel.evaluate(node => node.contains(document.activeElement)), true);
    await closeShowcase(page, second);
    assert.equal(await secondOpener.evaluate(node => node === document.activeElement), true, 'explicit Close restores the exact initiating preview control');
    await openShowcase(page, first);
    assert.equal(await handle.evaluate(node => node.isConnected && node.__acceptanceIdentity === 'retained-first-panel'), true, 'changing panels does not destroy the original panel');
    await closeShowcase(page, first);
    const hiddenFocus = await page.locator('[data-showcase-panel]').evaluateAll(nodes => nodes.some(node => node.contains(document.activeElement)));
    assert.equal(hiddenFocus, false, 'closed panels never retain keyboard focus');
    await sourceOrder(page, config);
  });

  for (const width of [390, 1440]) check(`${config.name}: ${width}px direct hashes and native history keep chapter anchors stable`, async t => {
    const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width, height: 1000 } });
    const [first, second] = config.history;
    await visit(page, config.route + '#' + first); await anchorSettled(page, first);
    const historyStart = await page.evaluate(() => history.length);
    await page.locator(`.chapter-nav a[href="#${second}"]`).click();
    await page.waitForURL(url => url.hash === '#' + second); await anchorSettled(page, second);
    const before = page.url();
    await openShowcase(page, second); await closeShowcase(page, second);
    await stableScroll(page);
    const remembered = await page.locator('#' + second).evaluate(node => node.getBoundingClientRect().top);
    assert.equal(page.url(), before, 'opening and closing demos do not rewrite chapter history');
    assert.equal(await page.evaluate(() => history.length), historyStart + 1, 'one native anchor navigation adds one history entry');
    await page.goBack(); await page.waitForURL(url => url.hash === '#' + first); await anchorSettled(page, first);
    await page.goForward(); await page.waitForURL(url => url.hash === '#' + second); await stableScroll(page);
    const restored = await page.locator('#' + second).evaluate(node => node.getBoundingClientRect().top);
    assert.ok(Math.abs(restored - remembered) <= 2, `native forward restores the previous reading offset: ${JSON.stringify({ remembered, restored })}`);
    await sourceOrder(page, config);
  });

  check(`${config.name}: reduced motion, orientation and 200% layout preserve static previews and controls`, async t => {
    const { page } = await fixture(t, { reducedMotion: 'reduce' }); await visit(page, config.route);
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 720, height: 450 }]) {
      await page.setViewportSize(size); await frames(page, 6); assertFrames(await geometry(page));
      const id = config.history[0], panel = await openShowcase(page, id); await assertReadableCard(panel); await closeShowcase(page, id);
      assert.equal(await page.locator('[data-marketing-worker-canvas="gallery"]').count(), 0, 'reduced motion never starts gallery WebGL');
      await sourceOrder(page, config);
    }
  });

  check(`${config.name}: no JavaScript retains chapters, preview media and booking/sign-in destinations`, async t => {
    const { page } = await fixture(t, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await visit(page, config.route, false); await sourceOrder(page, config); assertFrames(await geometry(page));
    for (const id of config.chapters) {
      const chapter = page.locator('#' + id); await chapter.scrollIntoViewIfNeeded();
      assert.equal(await chapter.locator('h2').isVisible(), true);
      assert.ok((await chapter.innerText()).trim().length > 30, `${id} keeps useful explanatory copy`);
    }
    assert.ok(await page.locator('a[href="/signin"]').count() > 0);
    assert.equal(await page.locator('.marketing-footer-next').getAttribute('href'), config.name === 'players' ? '/coaches' : '/');
    await capture(page, `${config.name}-no-js-showcase`, true);
  });
}

check('Players: selected profile, paused movement and workout progress survive switching panels', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce' }); await visit(page, '/');
  const profile = await openShowcase(page, 'profile');
  const skill = profile.locator('button[data-skill]').last(); await skill.click();
  const selected = await profile.locator('#skillName').innerText();
  const movement = await openShowcase(page, 'tests');
  const pause = movement.getByRole('button', { name: 'Pause pose playback', exact: true });
  if (await pause.isVisible()) await pause.click();
  await movement.getByRole('slider', { name: 'Pose playback position' }).fill('10');
  const workout = await openShowcase(page, 'training');
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).click();
  await workout.getByRole('button', { name: 'Pause workout timer', exact: true }).click();
  const step = await workout.locator('[data-workout-step]').getAttribute('data-workout-step');
  const timer = await workout.getByRole('timer').innerText();
  const workoutHandle = await workout.locator('[data-demo="workout"]').elementHandle();
  await openShowcase(page, 'profile');
  assert.equal(await skill.getAttribute('aria-pressed'), 'true');
  assert.equal(await profile.locator('#skillName').innerText(), selected);
  await openShowcase(page, 'tests');
  assert.equal(await movement.getByRole('slider', { name: 'Pose playback position' }).inputValue(), '10');
  assert.equal(await movement.locator('#posePlayButton').getAttribute('aria-pressed'), 'false');
  await openShowcase(page, 'training');
  assert.equal(await workoutHandle.evaluate(node => node.isConnected), true, 'exact workout instance persists');
  assert.equal(await workout.locator('[data-workout-step]').getAttribute('data-workout-step'), step);
  assert.equal(await workout.getByRole('timer').innerText(), timer, 'paused timer is unchanged while the panel is hidden');
  await workout.getByRole('button', { name: 'Resume workout timer', exact: true }).click();
  await closeShowcase(page, 'training');
  await page.waitForTimeout(1200);
  await openShowcase(page, 'training');
  await workout.getByRole('button', { name: 'Resume workout timer', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await workout.locator('[data-workout-step]').getAttribute('data-workout-step'), step, 'closing a running demo pauses rather than resets it');
});

check('Players: AI Coach handoff activates the retained workout once and focuses the destination', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce' }); await visit(page, '/');
  const coach = await openShowcase(page, 'ai-coach');
  const url = page.url(), history = await page.evaluate(() => window.history.length);
  await coach.getByRole('button', { name: /Help me plan 20 minutes/ }).click();
  const workout = page.locator(panelSelector('training'));
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-showcase-panel]:visible').count(), 1);
  assert.equal(await coach.isVisible(), false);
  assert.match(await workout.innerText(), /20 min available/);
  assert.equal(await workout.evaluate(node => node.contains(document.activeElement)), true, 'handoff moves focus to the new demonstration');
  assert.equal(page.url(), url); assert.equal(await page.evaluate(() => window.history.length), history);
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).click();
  await workout.getByRole('button', { name: 'Pause workout timer', exact: true }).click();
  const step = await workout.locator('[data-workout-step]').getAttribute('data-workout-step');
  await openShowcase(page, 'ai-coach'); await openShowcase(page, 'training');
  assert.equal(await workout.locator('[data-workout-step]').getAttribute('data-workout-step'), step, 'reopening does not consume the old AI request again');
  await workout.getByRole('button', { name: 'Resume workout timer', exact: true }).waitFor({ state: 'visible' });
});

check('Coaches: team selection, player evidence and development remain connected across panel changes', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } }); await visit(page, '/coaches');
  const club = await openShowcase(page, 'club');
  await club.getByRole('group', { name: 'Choose a sample team', exact: true }).getByRole('button', { name: /U15/ }).click();
  const players = await openShowcase(page, 'players');
  await players.getByRole('group', { name: 'Choose a sample player from U15', exact: true }).getByRole('button', { name: /Riley Chen/ }).click();
  const development = await openShowcase(page, 'development');
  assert.match(await development.innerText(), /Riley Chen/);
  await development.getByRole('group', { name: 'Explore player development', exact: true }).getByRole('button', { name: /Retest/ }).click();
  assert.match(await development.innerText(), /Illustrative change · Not a promised outcome/);
  await openShowcase(page, 'players');
  assert.equal(await players.locator('.cx-player-heading h3').innerText(), 'Riley Chen');
  await openShowcase(page, 'development');
  assert.equal(await development.getByRole('button', { name: /Retest/ }).getAttribute('aria-pressed'), 'true');
  await openShowcase(page, 'club');
  await club.getByRole('group', { name: 'Choose a sample team', exact: true }).getByRole('button', { name: /U17/ }).click();
  await openShowcase(page, 'development');
  assert.match(await development.innerText(), /Morgan Adams/);
  assert.equal(await development.getByRole('button', { name: /Plan/ }).getAttribute('aria-pressed'), 'true', 'existing team-change reset remains intact');
});

for (const config of audiences) check(`${config.name}: preview hover feedback leaves hit areas stable and a single action opens the real demo`, async t => {
  const { page } = await fixture(t); await visit(page, config.route);
  const id = config.history[0], frame = page.locator(`[data-showcase-frame="${id}"]`);
  const opener = page.locator(`[data-showcase-open="${id}"]`).first();
  await frame.scrollIntoViewIfNeeded(); await stableScroll(page);
  await page.locator('.pt-marketing-brand').first().focus();
  const geometry = () => opener.evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; });
  const before = await geometry(), url = page.url();
  await frame.hover({ position: { x: 30, y: 30 } });
  await page.waitForFunction(id => Number(getComputedStyle(document.querySelector(`[data-showcase-frame="${id}"] .showcase-frame-hint`)).opacity) > .9, id);
  const after = await geometry();
  assert.ok(Object.keys(before).every(key => Math.abs(before[key] - after[key]) < .5), 'decorative artwork movement never shifts the real hit target');
  assert.equal(page.url(), url, 'hover never navigates or opens the demo');
  assert.equal(await page.locator('[data-showcase-panel]:visible').count(), 0);
  await capture(page, `${config.name}-preview-hover`);
  await opener.click();
  const panel = await openShowcase(page, id);
  assert.equal(await panel.evaluate(node => node.contains(document.activeElement)), true);
  assert.equal(await page.locator('[data-showcase-overlay]').evaluate(node => getComputedStyle(node).visibility), 'hidden', 'focused full-demo controls stop decorative overlays');
  await closeShowcase(page, id);
  await page.keyboard.press('Enter');
  assert.equal(await panel.isVisible(), true, 'restored preview action supports immediate keyboard reopening');
});

check('Players: legacy movement alias opens its real demo on initial deep link and reload', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await visit(page, '/#how-it-works');
  const panel = page.locator(panelSelector('tests'));
  await panel.getByRole('slider', { name: 'Pose playback position' }).waitFor({ state: 'visible' });
  await stableScroll(page);
  const assertLanding = async () => {
    const top = await panel.evaluate(node => node.getBoundingClientRect().top);
    assert.ok(top >= 74 && top < 200, `legacy movement hash lands on the open demo: ${top}`);
    assert.equal(await page.locator('#how-it-works').count(), 1);
  };
  await assertLanding();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await panel.getByRole('slider', { name: 'Pose playback position' }).waitFor({ state: 'visible' });
  await stableScroll(page); await assertLanding();
});

check('Players: legacy alias history follows native browser restoration without an application scroll override', async t => {
  const control = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await control.context.route(origin + '/__acceptance-native-history.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><style>body{margin:0;height:4000px}nav{position:fixed;top:140px;left:16px;z-index:2;background:white;padding:16px}a{display:block;padding:12px}section{position:absolute;left:0;height:200px;width:100%;scroll-margin-top:110px}#first{top:1000px}#second{top:2200px}</style></head><body><nav><a href="#first">First</a><a href="#second">Second</a></nav><section id="first">First section</section><section id="second">Second section</section></body></html>' }));
  await control.page.goto(origin + '/__acceptance-native-history.html');
  await control.page.locator('a[href="#first"]').click(); await stableScroll(control.page);
  const firstCanonical = await control.page.locator('#first').evaluate(node => node.getBoundingClientRect().top);
  await control.page.mouse.move(360, 800); await control.page.mouse.wheel(0, 200); await stableScroll(control.page);
  const firstReading = await control.page.locator('#first').evaluate(node => node.getBoundingClientRect().top);
  await control.page.locator('a[href="#second"]').click(); await stableScroll(control.page);
  await control.page.mouse.wheel(0, 120); await stableScroll(control.page);
  const secondReading = await control.page.locator('#second').evaluate(node => node.getBoundingClientRect().top);
  await control.page.goBack(); await control.page.waitForURL(url => url.hash === '#first'); await stableScroll(control.page);
  const firstRestored = await control.page.locator('#first').evaluate(node => node.getBoundingClientRect().top);
  await control.page.goForward(); await control.page.waitForURL(url => url.hash === '#second'); await stableScroll(control.page);
  const secondRestored = await control.page.locator('#second').evaluate(node => node.getBoundingClientRect().top);
  assert.ok(Math.abs(firstRestored - firstCanonical) <= 2, 'plain HTML confirms Chromium canonically re-lands the first fragment on Back');
  assert.ok(Math.abs(secondRestored - secondReading) <= 2, 'plain HTML confirms Forward retains the later reading offset');
  const { page } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await visit(page, '/');
  // Match the plain browser behavior above. Keep browser restoration native;
  // the application must not schedule its own canonical scroll on traversal.
  await page.evaluate(() => {
    const links = document.createElement('nav'); links.dataset.acceptanceHistoryLinks = '';
    Object.assign(links.style, { position: 'fixed', top: '140px', left: '16px', zIndex: '9999', padding: '16px', background: '#fff', color: '#111' });
    for (const [hash, label] of [['how-it-works', 'Acceptance movement alias'], ['profile', 'Acceptance profile']]) {
      const link = document.createElement('a'); link.href = '#' + hash; link.textContent = label; link.style.display = 'block'; link.style.padding = '12px'; links.append(link);
    }
    document.body.append(links);
  });
  await page.locator('[data-acceptance-history-links] a[href="#how-it-works"]').click();
  await page.waitForURL(url => url.hash === '#how-it-works');
  const panel = page.locator(panelSelector('tests'));
  await panel.getByRole('slider', { name: 'Pose playback position' }).waitFor({ state: 'visible' });
  await stableScroll(page);
  await page.mouse.move(360, 800); await page.mouse.wheel(0, 200); await stableScroll(page);
  const aliasReadingTop = await panel.evaluate(node => node.getBoundingClientRect().top);
  assert.ok(aliasReadingTop < 0, 'the legacy entry has a real reading offset beyond its canonical landing');
  // Fixed fixture anchors avoid moving an offscreen navigation link into view
  // and exercise the browser's native user-activated fragment history.
  await page.locator('[data-acceptance-history-links] a[href="#profile"]').click();
  await page.waitForURL(url => url.hash === '#profile'); await anchorSettled(page, 'profile');
  await page.mouse.wheel(0, 120); await stableScroll(page);
  const profileReadingTop = await page.locator('#profile').evaluate(node => node.getBoundingClientRect().top);
  await page.evaluate(() => {
    window.__acceptanceHistoryScrolls = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) { window.__acceptanceHistoryScrolls.push({ id: this.id, args }); return original.apply(this, args); };
  });
  await page.goBack(); await page.waitForURL(url => url.hash === '#how-it-works'); await stableScroll(page);
  assert.equal(await panel.isVisible(), true, 'Back reopens the alias owner before native position restoration');
  const restoredAliasTop = await panel.evaluate(node => node.getBoundingClientRect().top);
  assert.ok(restoredAliasTop >= 74 && restoredAliasTop < 200, `Back has the same valid canonical alias landing as the plain browser control: ${JSON.stringify({ aliasReadingTop, restoredAliasTop })}`);
  assert.deepEqual(await page.evaluate(() => window.__acceptanceHistoryScrolls), [], 'Back causes no application scrollIntoView override');
  await page.goForward(); await page.waitForURL(url => url.hash === '#profile'); await stableScroll(page);
  const restoredProfileTop = await page.locator('#profile').evaluate(node => node.getBoundingClientRect().top);
  assert.ok(Math.abs(restoredProfileTop - profileReadingTop) <= 2, `Forward preserves the profile reading offset: ${JSON.stringify({ profileReadingTop, restoredProfileTop })}`);
  assert.deepEqual(await page.evaluate(() => window.__acceptanceHistoryScrolls), [], 'Forward causes no application scrollIntoView override');
  evidence.observations.push({ check: t.name, plainHtmlControl: { firstCanonical, firstReading, firstRestored, secondReading, secondRestored }, aliasReadingTop, restoredAliasTop, profileReadingTop, restoredProfileTop, applicationScrollIntoViewCalls: 0, limitation: 'This Chromium build canonically re-lands the first fragment on Back even with static HTML; only the later Forward reading offset is claimed preserved.' });
});

check('Players: new legacy alias fragments land on their opening panel before a delayed demo resolves', async t => {
  for (const activation of ['location.hash', 'ordinary native link']) {
    const { page, context } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    let release, held = 0;
    const gate = new Promise(done => { release = done; });
    await context.route(/\/MovementDemo[.-][^/]+\.js$/, async route => { held++; await gate; await route.fallback(); });
    try {
      await visit(page, '/#profile'); await anchorSettled(page, 'profile');
      if (activation === 'ordinary native link') {
        // A fixture-only ordinary anchor exercises the browser's actual fragment
        // activation path without invoking the showcase controller directly.
        await page.evaluate(() => {
          const link = document.createElement('a'); link.href = '#how-it-works'; link.textContent = 'Acceptance native movement alias';
          link.dataset.acceptanceNativeAlias = ''; Object.assign(link.style, { position: 'fixed', top: '140px', left: '16px', zIndex: '9999', padding: '16px', background: '#fff', color: '#111' });
          document.body.append(link);
        });
      }
      const movementRequest = page.waitForRequest(request => /\/MovementDemo[.-][^/]+\.js$/.test(new URL(request.url()).pathname));
      if (activation === 'location.hash') await page.evaluate(() => { location.hash = 'how-it-works'; });
      else await page.locator('[data-acceptance-native-alias]').click();
      await movementRequest; await page.waitForURL(url => url.hash === '#how-it-works');
      const panel = page.locator(panelSelector('tests')); await panel.waitFor({ state: 'visible' }); await stableScroll(page);
      const snapshot = () => panel.evaluate(node => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height, state: node.querySelector('[data-demo="movement"]')?.dataset.demoState }));
      const before = await snapshot();
      assert.ok(held > 0 && before.state === 'pending', 'the actual movement import remains held during native alias landing');
      assert.ok(before.top >= 74 && before.top < 200, `${activation} lands on the panel while its demo is still pending: ${JSON.stringify(before)}`);
      release(); await page.waitForFunction(() => document.querySelector('[data-demo="movement"]')?.dataset.demoState === 'ready'); await stableScroll(page);
      const after = await snapshot();
      assert.ok(Math.abs(after.top - before.top) <= 2, `${activation} keeps its native landing through late demo growth: ${JSON.stringify({ before, after })}`);
      assert.equal(await page.locator('#how-it-works').count(), 1);
      evidence.observations.push({ check: t.name, activation, before, after, heldImports: held });
    } finally { release(); }
  }
});

check('Players: failed decorative lazy import preserves previews, navigation and independent demo loading', async t => {
  const { page, context } = await fixture(t, { reducedMotion: 'reduce' });
  let injected = 0;
  // Fail the actual shipped decorative module at evaluation, preserving the
  // ordinary GET-only policy and avoiding a synthetic success callback.
  await context.route(/\/marketing-showcase-motion[.-][^/]+\.js$/, route => {
    assert.equal(new URL(route.request().url()).origin, origin);
    assert.equal(route.request().method(), 'GET'); injected++;
    return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Injected decorative import evaluation failure");' });
  });
  await visit(page, '/');
  await page.waitForFunction(() => document.querySelector('[data-showcase-gallery]')?.dataset.showcaseMotion === 'failed');
  assert.ok(injected > 0, 'real decorative module was exercised');
  const panel = await openShowcase(page, 'profile');
  const skill = panel.locator('button[data-skill]').last(); await skill.click();
  assert.equal(await skill.getAttribute('aria-pressed'), 'true');
  await closeShowcase(page, 'profile'); assertFrames(await geometry(page));
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Explore PoseTek' }).waitFor({ state: 'hidden' });
  evidence.observations.push({ check: t.name, injectedDecorativeImports: injected });
});

check('Players: full demo modules load only after an explicit opening and remain mounted after Close', async t => {
  const { page } = await fixture(t, { reducedMotion: 'reduce' });
  const modules = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === origin && /\/(MovementDemo|WorkoutDemo|CoachDemo|TechniqueDemo)[.-][^/]+\.js$/.test(url.pathname)) modules.push(url.pathname); });
  await visit(page, '/'); await frames(page, 12);
  assert.deepEqual(modules, [], 'the initial showcase does not import full interactive demos');
  assert.equal(await page.locator('[data-showcase-panel] [data-demo]').count(), 0);
  const panel = await openShowcase(page, 'tests');
  assert.ok(modules.some(path => /MovementDemo/.test(path)), 'the explicit action fetches the real movement module');
  const demo = await panel.locator('[data-demo="movement"]').elementHandle();
  const requested = modules.length;
  await closeShowcase(page, 'tests'); await openShowcase(page, 'tests');
  assert.equal(await demo.evaluate(node => node.isConnected), true);
  assert.equal(modules.length, requested, 'reopening reuses the existing demo and loaded module');
  evidence.observations.push({ check: t.name, modules });
});

check('Players: a genuinely delayed opened movement demo preserves a subsequent mobile profile hash landing', async t => {
  const { page, context } = await fixture(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true });
  let release, held = 0;
  const gate = new Promise(done => { release = done; });
  await context.route(/\/MovementDemo[.-][^/]+\.js$/, async route => { held++; await gate; await route.fallback(); });
  try {
    await visit(page, '/');
    await Promise.all([page.waitForRequest(request => /\/MovementDemo[.-][^/]+\.js$/.test(new URL(request.url()).pathname)), openShowcase(page, 'tests', { ready: false })]);
    assert.ok(held > 0, 'the real movement import is held');
    await page.locator('.chapter-nav a[href="#profile"]').click(); await page.waitForURL(url => url.hash === '#profile'); await anchorSettled(page, 'profile');
    const snapshot = () => page.evaluate(() => ({ profileTop: document.getElementById('profile').getBoundingClientRect().top, precedingHeight: document.querySelector('[data-showcase-panel="tests"]').getBoundingClientRect().height, pending: document.querySelector('[data-demo="movement"]').dataset.demoState, scroll: scrollY }));
    const before = await snapshot(); assert.equal(before.pending, 'pending');
    release();
    await page.waitForFunction(() => document.querySelector('[data-demo="movement"]')?.dataset.demoState === 'ready');
    await stableScroll(page);
    const after = await snapshot();
    assert.ok(Math.abs(after.profileTop - before.profileTop) <= 2, `late loading preserves the real native fragment offset: ${JSON.stringify({ before, after })}`);
    assert.equal(new URL(page.url()).hash, '#profile');
    assert.ok(after.precedingHeight > 0 && before.precedingHeight > 0, 'the preceding panel remained in normal document flow');
    evidence.observations.push({ check: t.name, before, after, heldImports: held });
  } finally { release(); }
});

check('Players: native chapter heading focus keeps depth active and stationary pointer hover follows scrolling', async t => {
  const { page, context } = await fixture(t);
  await context.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const post = this.postMessage.bind(this);
        this.postMessage = (message, ...rest) => {
          if (options?.name === 'posetek-gallery' && message?.view?.kind === 'gallery') window.__showcaseActualView = structuredClone(message.view);
          return post(message, ...rest);
        };
      }
    };
  });
  await visit(page, '/');
  await page.locator('.chapter-nav a[href="#profile"]').click(); await page.waitForURL(url => url.hash === '#profile');
  await anchorSettled(page, 'profile');
  assert.equal(await page.locator('#profile h2').evaluate(node => node === document.activeElement), true, 'native chapter action retains its accessible heading focus');
  await page.waitForFunction(() => document.querySelector('[data-showcase-gallery]').dataset.showcaseMotion === 'ready' && Number(document.querySelector('[data-showcase-overlay]').dataset.rendererFrames) > 0);
  const training = page.locator('[data-showcase-frame="training"]');
  const initial = await training.evaluate(node => {
    const r = node.getBoundingClientRect();
    scrollTo({ top: r.top + scrollY - innerHeight - 60, behavior: 'instant' });
    return { x: r.left + r.width / 2, y: 300 };
  });
  await stableScroll(page); await page.mouse.move(initial.x, initial.y); await frames(page, 3);
  const delta = await training.evaluate((node, y) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2 - y; }, initial.y);
  await page.mouse.wheel(0, delta); await stableScroll(page);
  await page.waitForFunction(() => window.__showcaseActualView?.cards.some(card => card.id === 'training' && card.hovered));
  const actual = await page.evaluate(({ x, y }) => ({ hit: document.elementFromPoint(x, y)?.closest('[data-showcase-frame]')?.getAttribute('data-showcase-frame'), view: window.__showcaseActualView }), initial);
  assert.equal(actual.hit, 'training', 'the native pointer now lies on the newly scrolled preview');
  assert.deepEqual(actual.view.cards.filter(card => card.hovered).map(card => card.id), ['training'], 'the actual worker receives only the preview currently under the stationary cursor');
  evidence.observations.push({ check: t.name, pointer: initial, scrollDelta: delta, hovered: actual.view.cards.filter(card => card.hovered).map(card => card.id) });
});

check('Players: completed reveals survive real texture eviction and replay only after a complete below-viewport exit', async t => {
  const { page, context } = await fixture(t);
  await context.addInitScript(() => {
    const NativeWorker = Worker;
    window.__showcaseRevealFrames = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (options?.name === 'posetek-gallery') this.addEventListener('message', event => {
          if (event.data?.type === 'frame' && event.data.telemetry?.galleryReveals) window.__showcaseRevealFrames.push(structuredClone(event.data.telemetry));
        });
      }
    };
  });
  await visit(page, '/#tests');
  const first = page.locator('[data-showcase-frame="tests"]');
  await page.waitForFunction(() => document.querySelector('[data-showcase-frame="tests"]')?.dataset.showcaseReveal === 'complete');
  const epoch = Number(await first.getAttribute('data-showcase-reveal-epoch'));
  assert.ok(await page.evaluate(epoch => window.__showcaseRevealFrames.some(row => row.galleryCards.includes('tests') && row.galleryReveals.some(reveal => reveal.id === 'tests' && reveal.epoch === epoch && reveal.complete)), epoch), 'completion is backed by actual textured worker draw telemetry');
  await page.locator('[data-showcase-frame="technique"]').evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - 110, behavior: 'instant' }));
  await page.waitForFunction(() => window.__showcaseRevealFrames.at(-1)?.galleryCards.includes('technique'));
  const evicted = await page.evaluate(() => window.__showcaseRevealFrames.at(-1));
  assert.equal(evicted.galleryReveals.some(reveal => reveal.id === 'tests'), false, 'the earlier texture was genuinely evicted from the worker scene');
  assert.equal(await first.getAttribute('data-showcase-reveal-epoch'), String(epoch));
  assert.equal(await first.getAttribute('data-showcase-reveal'), 'complete');
  await first.evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - 110, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-showcase-frame="tests"]')?.dataset.showcaseRenderer === 'ready');
  assert.equal(await first.getAttribute('data-showcase-reveal'), 'complete', 'return from above does not restart a completed reveal');
  assert.equal(await first.getAttribute('data-showcase-reveal-epoch'), String(epoch));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-showcase-frame="tests"]');
    return frame.getBoundingClientRect().top >= innerHeight && frame.dataset.showcaseReveal === 'armed';
  });
  assert.equal(Number(await first.getAttribute('data-showcase-reveal-epoch')), epoch + 1);
  await first.evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - 110, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-showcase-frame="tests"]')?.dataset.showcaseReveal === 'revealing');
  await capture(page, 'players-rearmed-texture-reveal');
  await page.waitForFunction(() => document.querySelector('[data-showcase-frame="tests"]')?.dataset.showcaseReveal === 'complete');
  assert.ok(await page.evaluate(epoch => window.__showcaseRevealFrames.some(row => row.galleryCards.includes('tests') && row.galleryReveals.some(reveal => reveal.id === 'tests' && reveal.epoch === epoch && reveal.progress > 0 && reveal.progress < 1)), epoch + 1), 'rearmed texture progressed through a genuine intermediate reveal');
  evidence.observations.push({ check: t.name, firstEpoch: epoch, rearmedEpoch: epoch + 1, evictionCards: evicted.galleryCards });
});

check('Players: opening one demo does not mark unseen preview chapters as already revealed', async t => {
  const { page } = await fixture(t); await visit(page, '/#tests');
  const untouched = page.locator('[data-showcase-frame="mobile-app"]');
  await page.waitForFunction(() => document.querySelector('[data-showcase-frame="mobile-app"]')?.dataset.showcaseReveal === 'armed');
  const epoch = await untouched.getAttribute('data-showcase-reveal-epoch');
  await openShowcase(page, 'tests'); await closeShowcase(page, 'tests');
  assert.equal(await untouched.getAttribute('data-showcase-reveal'), 'armed', 'interaction settles only the chosen chapter');
  assert.equal(await untouched.getAttribute('data-showcase-reveal-epoch'), epoch, 'unseen preview retains its own initial reveal cycle');
});

check('Players: a pointer initially over the hero activates the first preview brought beneath it by native scrolling', async t => {
  const { page, context } = await fixture(t);
  await context.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const post = this.postMessage.bind(this);
        this.postMessage = (message, ...rest) => {
          if (options?.name === 'posetek-gallery' && message?.view?.kind === 'gallery') window.__showcaseBoundaryView = structuredClone(message.view);
          return post(message, ...rest);
        };
      }
    };
  });
  await visit(page, '/');
  const point = await page.locator('[data-showcase-frame="tests"]').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: 300 }; });
  await page.mouse.move(point.x, point.y);
  assert.equal(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-showcase-gallery]'), point), false, 'initial pointer position genuinely lies outside the gallery');
  const delta = await page.locator('[data-showcase-frame="tests"]').evaluate((node, y) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2 - y; }, point.y);
  await page.mouse.wheel(0, delta); await stableScroll(page);
  await page.waitForFunction(() => window.__showcaseBoundaryView?.cards.some(card => card.id === 'tests' && card.hovered));
  const actual = await page.evaluate(({ x, y }) => ({ hit: document.elementFromPoint(x, y)?.closest('[data-showcase-frame]')?.dataset.showcaseFrame, hovered: window.__showcaseBoundaryView.cards.filter(card => card.hovered).map(card => card.id) }), point);
  assert.equal(actual.hit, 'tests'); assert.deepEqual(actual.hovered, ['tests']);
  evidence.observations.push({ check: t.name, pointer: point, scrollDelta: delta, ...actual });
});
