// Browser acceptance helpers. These operate only public, explicit demo controls.
import assert from 'node:assert/strict';

export const demoChapters = { movement: 'tests', profile: 'profile', workout: 'training', coach: 'ai-coach', technique: 'technique', mobile: 'mobile-app', club: 'club', evidence: 'players', development: 'development' };
export const panelSelector = id => `[data-showcase-panel="${id.replace(/^#/, '')}"]`;

export async function openShowcase(page, chapter, { ready = true } = {}) {
  const id = chapter.replace(/^#/, '');
  const panel = page.locator(panelSelector(id));
  assert.equal(await panel.count(), 1, `one persistent panel slot for ${id}`);
  if (!await panel.isVisible()) {
    const opener = page.locator(`[data-showcase-open="${id}"]`).first();
    await opener.click();
  }
  await panel.waitFor({ state: 'visible' });
  assert.equal(await panel.getAttribute('inert'), null, `${id} active panel is operable`);
  assert.equal(await page.locator('[data-showcase-panel]:visible').count(), 1, 'only one full demonstration is open');
  if (ready) await panel.evaluate(node => new Promise((done, reject) => {
    const start = performance.now();
    const check = () => {
      const demos = [...node.querySelectorAll('[data-demo]')];
      if (demos.every(demo => demo.dataset.demoState === 'ready')) done();
      else if (performance.now() - start > 12000) reject(new Error('Explicitly opened demonstration did not become ready.'));
      else requestAnimationFrame(check);
    };
    check();
  }));
  return panel;
}

export async function closeShowcase(page, chapter) {
  const panel = page.locator(panelSelector(chapter));
  const close = panel.locator('[data-showcase-close]').first();
  await close.click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await panel.evaluate(node => node.inert), true, 'retained closed panel is inert');
  // Close restores its opener and can scroll it on the next animation frame.
  // Finish that real native scroll before a later test positions another target.
  await page.evaluate(() => new Promise((done, reject) => {
    let previous = scrollY, steady = 0;
    const started = performance.now();
    const sample = () => {
      steady = Math.abs(scrollY - previous) < .1 ? steady + 1 : 0; previous = scrollY;
      if (steady >= 5) done();
      else if (performance.now() - started > 3000) reject(new Error('Close-to-opener native scroll did not settle.'));
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
}

export function requestFailureDetails(request) {
  return { url: request.url(), error: request.failure()?.errorText, resourceType: request.resourceType() };
}

export async function classifyPreviewCancellations(page, failures) {
  // Never classify generic asset errors as harmless. Require the exact aborted
  // worker fetch, successful original DOM decoding, and the real worker's
  // cumulative eviction-cancellation report for that same preview card.
  const proof = await page.evaluate(() => {
    let cancelled = [];
    try { cancelled = JSON.parse(document.querySelector('[data-showcase-overlay]')?.dataset.galleryCancelled || '[]'); } catch { /* malformed evidence cannot qualify */ }
    return [...document.querySelectorAll('[data-showcase-frame]')].flatMap(frame => {
      const image = frame.querySelector('img[data-showcase-image]');
      return image?.complete && image.naturalWidth > 0 && cancelled.includes(frame.dataset.showcaseFrame) ? [{ id: frame.dataset.showcaseFrame, url: image.currentSrc || image.src }] : [];
    });
  });
  const qualifying = new Map(proof.map(row => [row.url, row.id])), expected = [], unexpected = [];
  for (const failure of failures) {
    if (failure.error === 'net::ERR_ABORTED' && failure.resourceType === 'fetch' && qualifying.has(failure.url)) expected.push({ ...failure, domImageDecoded: true, workerCancelledCard: qualifying.get(failure.url) });
    else unexpected.push(failure);
  }
  return { expected, unexpected };
}
