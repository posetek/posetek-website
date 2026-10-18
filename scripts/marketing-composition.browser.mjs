// Public editorial composition acceptance, separate from the original 33 + 20 checks.
// Run only after the composition build is available. No authenticated actions.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createHomepagePreviewServer } from './serve-homepage-preview.mjs';

const output = process.env.MARKETING_OUTPUT ? resolve(process.env.MARKETING_OUTPUT) : fileURLToPath(new URL('../app/astro-dist/', import.meta.url));
const artifacts = process.env.MARKETING_ARTIFACTS ? resolve(process.env.MARKETING_ARTIFACTS) : fileURLToPath(new URL('../artifacts/marketing-composition/acceptance/', import.meta.url));
const previewOrigin = process.env.MARKETING_ORIGIN;
if (previewOrigin && !/^https:\/\/[a-f0-9]{24}--posetek\.netlify\.app$/.test(previewOrigin)) throw new Error('MARKETING_ORIGIN must be an immutable PoseTek Netlify draft URL.');
const allowFonts = process.env.MARKETING_ALLOW_FONTS === '1';
const evidence = {
  output, previewOrigin,
  networkPolicy: `${previewOrigin ? 'immutable PoseTek draft' : 'loopback'} origin GET/HEAD${allowFonts ? ' + Google fonts GET' : ''}; all other HTTP and WebSockets blocked`,
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
  await writeFile(resolve(artifacts, 'composition-acceptance.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, screenshots: summary.screenshots.length, evidence: resolve(artifacts, 'composition-acceptance.json'), networkPolicy: evidence.networkPolicy }));
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
  page.on('requestfailed', request => { if (!closing && new URL(request.url()).origin === origin) failures.push(request.url()); });
  t.after(async () => {
    const result = evidence.checks.find(item => item.name === t.name);
    if (result?.status === 'failed' && !page.isClosed()) {
      const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      await capture(page, 'failure-' + key).catch(() => {});
      result.geometry = await geometry(page).catch(() => null);
      result.url = page.url();
    }
    closing = true; await context.close(); evidence.requests.unexpectedOriginFailures += failures.length;
    try { assert.deepEqual(errors, [], 'uncaught browser exceptions'); assert.deepEqual(failures, [], 'unexpected tested-origin request failures'); }
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

async function readyCard(page, id) {
  const card = page.locator(`.marketing-gallery > #${id}`);
  await card.scrollIntoViewIfNeeded();
  return awaitReadyCard(page, id);
}

async function awaitReadyCard(page, id) {
  const card = page.locator(`.marketing-gallery > #${id}`);
  await page.waitForFunction(id => Array.from(document.getElementById(id).querySelectorAll('[data-demo]')).every(node => node.dataset.demoState === 'ready'), id);
  await settle(page); return card;
}

async function sourceOrder(page, config) {
  assert.deepEqual(await page.locator('.marketing-gallery > section').evaluateAll(nodes => nodes.map(node => node.id)), config.chapters, 'gallery keeps the original reading order');
  assert.deepEqual(await page.locator('.chapter-nav a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), config.chapters.map(id => '#' + id));
  for (const id of [...config.chapters, ...config.aliases, 'top', 'main-content']) assert.equal(await page.locator(`#${id}`).count(), 1, `unique preserved anchor ${id}`);
}

async function geometry(page) {
  return page.locator('.marketing-gallery').evaluate(gallery => {
    const rect = node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top + scrollY, bottom: box.bottom + scrollY, width: box.width, height: box.height }; };
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, gallery: rect(gallery), motion: gallery.dataset.galleryMotion, layout: gallery.dataset.galleryLayout, drift: parseFloat(gallery.style.getPropertyValue('--gallery-drift')) || 0,
      cards: Array.from(gallery.children).filter(node => node.matches('section')).map(node => ({ id: node.id, ...rect(node), heading: rect(node.querySelector('h2')), media: node.querySelector('.reveal-frame') ? rect(node.querySelector('.reveal-frame')) : null })) };
  });
}

function assertColumns(data) {
  assert.ok(data.documentWidth <= data.width + 1, `document overflow: ${JSON.stringify(data)}`);
  assert.equal(data.layout, 'editorial');
  assert.equal(data.motion, 'static');
  for (const card of data.cards) {
    assert.ok(card.left >= -1 && card.right <= data.width + 1 && card.height > 0, `${card.id} stays within the viewport`);
    assert.ok(card.bottom <= data.gallery.bottom + 2, `${card.id} remains within the gallery's document height`);
    if (card.media) assert.ok(card.heading.bottom <= card.media.top + 2, `${card.id}: chapter orientation precedes its demonstration`);
  }
  for (let index = 1; index < data.cards.length; index++) assert.ok(data.cards[index].top >= data.cards[index - 1].bottom + 20, 'chapters follow source order without overlap at every width');
  if (data.width >= 1100) {
    assert.ok(data.cards[0].width > data.cards[1].width + 40, 'prominent and supporting chapters have distinct widths');
    assert.ok(data.cards[1].left > data.cards[0].left + 40, 'supporting chapters have an intentional inset');
  } else assert.ok(data.cards.every(card => card.width >= data.width * .8), 'narrow viewports have a readable single column');
}

async function assertHeaderHUD(page, name) {
  const hud = await page.evaluate(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const badgeNode = document.querySelector('.chapter-progress'), badge = rect(badgeNode), header = document.querySelector('.pt-marketing-bar');
    const overlaps = [...header.querySelectorAll('a[href],button,summary,[role="button"]')].filter(node => {
      const r = node.getBoundingClientRect();
      return r.width && r.height && Math.min(r.right, badge.right) > Math.max(r.left, badge.left) && Math.min(r.bottom, badge.bottom) > Math.max(r.top, badge.top);
    }).map(node => node.getAttribute('aria-label') || node.textContent.trim());
    const priorEvents = badgeNode.style.pointerEvents;
    let hit;
    try {
      badgeNode.style.pointerEvents = 'auto';
      hit = document.elementFromPoint((badge.left + badge.right) / 2, (badge.top + badge.bottom) / 2);
    } finally { badgeNode.style.pointerEvents = priorEvents; }
    const painted = hit === badgeNode || badgeNode.contains(hit);
    return { badge, header: rect(header), overlaps, painted, visible: badgeNode.dataset.visible, opacity: Number(getComputedStyle(badgeNode).opacity), hit: hit?.className };
  });
  assert.ok(hud.badge.top >= hud.header.top && hud.badge.bottom <= hud.header.bottom, `chapter badge stays within fixed header rather than covering the demo: ${JSON.stringify(hud)}`);
  assert.deepEqual(hud.overlaps, [], 'chapter badge does not overlap header action targets');
  assert.equal(hud.visible, 'true', 'chapter indicator is enabled inside the story');
  assert.equal(hud.opacity, 1, 'chapter indicator is visually visible');
  assert.equal(hud.painted, true, `chapter indicator is above the header surface: ${JSON.stringify(hud)}`);
  evidence.observations.push({ check: name, hud });
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
    for (const node of root.querySelectorAll('p:not(.eyebrow):not(.coach-micro):not(.pd-kicker),label,legend')) if (shown(node) && node.textContent.trim() && parseFloat(getComputedStyle(node).fontSize) < 11) found.fonts.push({ text: node.textContent.trim().slice(0, 80), font: getComputedStyle(node).fontSize, type: 'explanatory text' });
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

async function anchorSettled(page, id) {
  await page.waitForFunction(id => {
    const target = document.getElementById(id), header = document.querySelector('.pt-marketing-bar');
    return target && target.getBoundingClientRect().top >= header.getBoundingClientRect().bottom - 2 && target.getBoundingClientRect().top < innerHeight * .35;
  }, id);
  await stableScroll(page);
}

async function driftState(page) {
  return page.locator('.marketing-gallery').evaluate(node => ({ scroll: scrollY, drift: parseFloat(node.style.getPropertyValue('--gallery-drift')) || 0, state: node.dataset.galleryMotion }));
}

for (const config of audiences) {
  for (const width of [360, 390, 430, 768, 1440, 1920]) check(`${config.name}: ${width}px readable editorial chapters, orientation and sequential layout`, async t => {
    const { page } = await fixture(t, { viewport: { width, height: width < 768 ? 844 : 1000 }, isMobile: width <= 430, hasTouch: width <= 430 });
    await visit(page, config.route); await sourceOrder(page, config);
    await page.mouse.move(4, 20);
    await capture(page, `${config.name}-${width}-hero`);
    for (const id of config.chapters) {
      const card = await readyCard(page, id);
      await card.locator('h2').scrollIntoViewIfNeeded(); await settle(page);
      await assertReadableCard(card);
      if (id === config.chapters[0]) await assertHeaderHUD(page, t.name);
    }
    const data = await geometry(page); assertColumns(data);
    evidence.observations.push({ check: t.name, geometry: data });
    if ([390, 1440].includes(width)) {
      for (let index = 0; index < config.chapters.length; index += 1) {
        const id = config.chapters[index];
        await page.locator(`#${id}`).evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - 110, behavior: 'instant' }));
        await settle(page); await capture(page, `${config.name}-${width}-story-${id}`);
      }
      await page.locator('footer').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.waitForFunction(() => document.querySelector('footer').dataset.footerState === 'in');
      await page.waitForFunction(() => !document.querySelector('footer').getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
      await capture(page, `${config.name}-${width}-full-story`, true);
    }
  });

  check(`${config.name}: inline expansion keeps demos mounted and controls stationary`, async t => {
    const { page } = await fixture(t); await visit(page, config.route);
    for (const id of config.chapters) {
      const card = await readyCard(page, id), disclosure = card.locator('.demo-disclosure');
      if (!await disclosure.count()) continue;
      assert.equal(await disclosure.getAttribute('data-demo-expanded'), 'false');
      const content = await disclosure.locator('.demo-disclosure-content').elementHandle();
      const toggle = disclosure.getByRole('button', { name: /^Explore full demo/ });
      const compactHeight = await disclosure.evaluate(node => node.getBoundingClientRect().height);
      await toggle.click();
      await page.waitForFunction(id => document.querySelector(`#${id} .demo-disclosure`).dataset.demoExpanded === 'true', id);
      assert.equal(await disclosure.getByRole('button', { name: /^Show less/ }).getAttribute('aria-expanded'), 'true');
      assert.equal(await content.evaluate(node => node === document.getElementById(node.id)), true, 'expansion preserves the mounted content node');
      await settle(page); await assertReadableCard(card);
      const expandedHeight = await disclosure.evaluate(node => node.getBoundingClientRect().height);
      assert.ok(expandedHeight >= compactHeight - 2, `${id}: full detail expands inline instead of clipping the preview`);
      await disclosure.getByRole('button', { name: /^Show less/ }).click();
      assert.equal(await disclosure.getAttribute('data-demo-expanded'), 'false');
      const collapsePosition = await disclosure.locator('.demo-disclosure-toggle').boundingBox();
      const headerBottom = await page.locator('.pt-marketing-bar').evaluate(node => node.getBoundingClientRect().bottom);
      assert.ok(collapsePosition.y >= headerBottom && collapsePosition.y + collapsePosition.height <= page.viewportSize().height, `${id}: collapse retains its focused control in view`);
      assert.equal(await content.evaluate(node => node === document.getElementById(node.id)), true, 'collapse preserves the mounted content node');
      assert.equal((await driftState(page)).drift, 0, 'reading and control interaction never translates chapter positions');
      evidence.observations.push({ check: t.name, id, compactHeight, expandedHeight });
    }
    await sourceOrder(page, config);
  });

  for (const width of [390, 1440]) check(`${config.name}: ${width}px direct hash and back/forward preserve native chapter positions`, async t => {
    const { page } = await fixture(t, { viewport: { width, height: 1000 }, isMobile: width === 390, hasTouch: width === 390 });
    const [first, second] = config.history;
    await visit(page, config.route + '#' + first); await awaitReadyCard(page, first); await anchorSettled(page, first);
    assert.equal((await driftState(page)).state, 'static');
    await page.locator(`.chapter-nav a[href="#${second}"]`).click(); await page.waitForURL(url => url.hash === '#' + second);
    await awaitReadyCard(page, second); await anchorSettled(page, second);
    const locked = await driftState(page); await page.evaluate(() => scrollBy({ top: 90, behavior: 'instant' })); await frames(page);
    assert.equal((await driftState(page)).drift, locked.drift, 'hash navigation stays locked during native layout/scroll settling');
    await page.goBack(); await page.waitForURL(url => url.hash === '#' + first); await anchorSettled(page, first);
    await page.goForward(); await page.waitForURL(url => url.hash === '#' + second); await stableScroll(page);
    const restored = await page.locator(`#${second}`).evaluate(node => node.getBoundingClientRect().top);
    assert.ok(restored >= -10 && restored < 200, `forward restores the chapter and its previous90px user scroll: ${restored}`);
    await sourceOrder(page, config);
  });

  check(`${config.name}: reduced motion and responsive changes retain sequential content`, async t => {
    const { page } = await fixture(t); await visit(page, config.route);
    for (const id of config.chapters) await readyCard(page, id);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.marketing-gallery').dataset.galleryMotion === 'static');
    assert.equal((await driftState(page)).drift, 0);
    assert.equal(await page.locator('.marketing-gallery > section').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).transform === 'none')), true);
    await page.setViewportSize({ width: 768, height: 1000 }); await frames(page, 8);
    assertColumns(await geometry(page)); await sourceOrder(page, config);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await frames(page);
    assert.equal((await driftState(page)).state, 'static', 'tablet stays static when motion preference returns');
    // The header switches at700px, independently of the content's760px breakpoint.
    // A short landscape viewport between those thresholds guards the HUD baseline.
    await page.setViewportSize({ width: 730, height: 430 }); await frames(page, 8);
    const firstCard = await readyCard(page, config.chapters[0]);
    await firstCard.locator('h2').scrollIntoViewIfNeeded(); await settle(page);
    assertColumns(await geometry(page)); await sourceOrder(page, config);
    await assertHeaderHUD(page, t.name + ' /730px landscape header');
    await capture(page, `${config.name}-730-landscape-header-chapter`);
    await page.setViewportSize({ width: 1440, height: 1000 }); await frames(page, 8);
    assertColumns(await geometry(page)); await sourceOrder(page, config);
  });

  check(`${config.name}: no-JavaScript fallback keeps the gallery content and destinations`, async t => {
    const { page } = await fixture(t, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await visit(page, config.route, false); await sourceOrder(page, config);
    for (const id of config.chapters) {
      const card = page.locator('#' + id); await card.scrollIntoViewIfNeeded();
      assert.equal(await card.locator('h2').isVisible(), true);
      assert.ok((await card.innerText()).trim().length > 30, `${id} preserves explanatory text`);
    }
    const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(dimensions.content <= dimensions.width + 1);
    assert.ok(await page.locator('a[href="/signin"]').count() > 0);
    assert.equal(await page.locator('.marketing-footer-next').getAttribute('href'), config.name === 'players' ? '/coaches' : '/');
  });
}

check('Players: AI Coach handoff expands the workout chapter and preserves selections', async t => {
  const { page } = await fixture(t, { viewport: { width: 1440, height: 1000 } }); await visit(page, '/');
  const profile = await readyCard(page, 'profile');
  const skill = profile.locator('button[data-skill]').last(); await skill.click();
  const selected = await page.locator('#skillName').innerText();
  const coach = await readyCard(page, 'ai-coach');
  const handoffURL = page.url();
  await coach.getByRole('button', { name: /Help me plan 20 minutes/ }).click();
  // The existing handoff scrolls to training without creating a history entry.
  const workout = page.locator('[data-demo="workout"]');
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).waitFor({ state: 'visible' });
  await anchorSettled(page, 'training');
  assert.equal(page.url(), handoffURL);
  assert.match(await workout.innerText(), /20 min available/);
  assert.equal(await page.locator('#training .demo-disclosure').getAttribute('data-demo-expanded'), 'true', 'handoff exposes the complete workout inline');
  assert.equal(await page.locator('#skillName').innerText(), selected, 'editorial reflow and handoff do not remount sibling demo state');
  assert.equal(await skill.getAttribute('aria-pressed'), 'true');
  await workout.getByRole('button', { name: 'Start sample workout', exact: true }).click();
  await workout.getByRole('button', { name: 'Pause workout timer', exact: true }).click();
  await assertReadableCard(page.locator('#training'));
  await capture(page, 'players-workout-handoff-active-card');
});

check('Players: a delayed preceding movement import preserves the cold mobile profile hash landing', async t => {
  const { page, context } = await fixture(t, { viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true });
  const isMovementModule = url => url.origin === origin && /^\/_astro\/MovementDemo\.[\w-]+\.js$/.test(url.pathname);
  let releaseMovement;
  const gate = new Promise(resolve => { releaseMovement = resolve; });
  let heldURL;
  // Hold only this tested-origin GET. Releasing it falls through to the same
  // network policy as the rest of the suite; no response bytes are altered.
  await context.route(isMovementModule, async route => {
    assert.equal(route.request().method(), 'GET');
    heldURL = route.request().url();
    await gate;
    await route.fallback();
  });
  const snapshot = () => page.evaluate(() => ({
    scroll: scrollY, hash: location.hash,
    profileTop: document.getElementById('profile').getBoundingClientRect().top,
    testsHeight: document.getElementById('tests').getBoundingClientRect().height,
    demo: document.querySelector('[data-demo="movement"]').dataset.demoState,
  }));
  try {
    await Promise.all([
      page.waitForRequest(request => isMovementModule(new URL(request.url()))),
      visit(page, '/#profile'),
    ]);
    await anchorSettled(page, 'profile');
    const before = await snapshot();
    assert.equal(before.demo, 'pending', 'the preceding demo is still genuinely withheld');
    assert.equal(before.hash, '#profile');
    assert.ok(before.profileTop >= 74 && before.profileTop <= 150, `initial native hash landing: ${JSON.stringify(before)}`);
    releaseMovement();
    await page.waitForFunction(() => document.querySelector('[data-demo="movement"]').dataset.demoState === 'ready');
    await page.waitForFunction(previous => {
      const target = document.getElementById('profile'), preceding = document.getElementById('tests');
      return preceding.getBoundingClientRect().height > previous.testsHeight + 1 && Math.abs(target.getBoundingClientRect().top - previous.profileTop) <= 2;
    }, before);
    await stableScroll(page);
    const after = await snapshot();
    assert.ok(after.testsHeight > before.testsHeight + 1, 'the delayed demo exercised a real preceding-card height change');
    assert.ok(Math.abs(after.profileTop - before.profileTop) <= 2, `late content preserves the original fragment position: ${JSON.stringify({ before, after })}`);
    assert.equal(after.hash, '#profile');
    assert.ok(after.scroll > before.scroll, 'the browser position accounts for the new content without user scrolling');
    evidence.observations.push({ check: t.name, delayedModule: heldURL, before, after });
    await capture(page, 'players-390-delayed-movement-profile-anchor');
  } finally { releaseMovement(); }
});

check('Players: selected profile and workout progress survive inline collapse and reopening', async t => {
  const { page } = await fixture(t); await visit(page, '/');
  const profile = await readyCard(page, 'profile');
  const skill = profile.locator('button[data-skill]').last(); await skill.click();
  const selected = await page.locator('#skillName').innerText();
  await profile.getByRole('button', { name: /^Explore full demo/ }).click();
  await profile.getByRole('button', { name: /^Show less/ }).click();
  assert.equal(await skill.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#skillName').innerText(), selected);
  const training = await readyCard(page, 'training');
  await training.getByRole('button', { name: 'Start sample workout', exact: true }).click();
  assert.equal(await training.locator('.demo-disclosure').getAttribute('data-demo-expanded'), 'true');
  await training.getByRole('button', { name: 'Pause workout timer', exact: true }).waitFor({ state: 'visible' });
  const step = await training.locator('[data-workout-step]').getAttribute('data-workout-step');
  await training.getByRole('button', { name: /^Show less/ }).click();
  await training.getByRole('button', { name: 'Resume workout timer', exact: true }).click();
  assert.equal(await training.locator('.demo-disclosure').getAttribute('data-demo-expanded'), 'true', 'resume remains usable after inline collapse');
  assert.equal(await training.locator('[data-workout-step]').getAttribute('data-workout-step'), step);
  await training.getByRole('button', { name: 'Pause workout timer', exact: true }).click();
  await training.getByRole('button', { name: 'Skip ahead to summary', exact: true }).click();
  const qualifier = training.getByText('You skipped ahead in this sample session.', { exact: true });
  await qualifier.waitFor({ state: 'visible' });
  await training.getByRole('button', { name: /^Show less/ }).click();
  assert.equal(await qualifier.isVisible(), true, 'compact summary retains the skipped-time qualification');
});

check('Coaches: compact player choices and expanded details share the same selection', async t => {
  const { page } = await fixture(t); await visit(page, '/coaches');
  const card = await readyCard(page, 'players'), select = card.locator('.cx-player-select select');
  const option = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(option);
  const name = await card.locator('.cx-player-heading h3').innerText();
  await card.getByRole('button', { name: /^Explore full demo/ }).click();
  assert.equal(await card.locator('.cx-player-options button[aria-pressed="true"] strong').innerText(), name);
  await card.getByRole('button', { name: /^Show less/ }).click();
  assert.equal(await select.inputValue(), option);
  assert.equal(await card.locator('.cx-player-heading h3').innerText(), name);
});
