// Cold-input precondition only. DOMContentLoaded and a DOM box do not prove
// that a visitor has seen the control. Never use this as the response metric.
import assert from 'node:assert/strict';

export function inspectOpenerFrame(frame, opener, png) {
  if (!opener?.eligible || !Number.isFinite(frame.metadata?.timestamp)) return null;
  const frameTime = frame.metadata.timestamp * 1000 - opener.timeOrigin;
  if (frameTime < 0) return null; // about:blank / previous navigation
  if (!png?.data) return null;
  if (png.width !== opener.viewport.width || png.height !== opener.viewport.height) return null;
  const pixelsIn = (rect, predicate) => {
    let count = 0;
    for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(png.height, Math.ceil(rect.y + rect.height)); y++) {
      for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(png.width, Math.ceil(rect.x + rect.width)); x++) {
        const i = (y * png.width + x) * 4;
        if (predicate(png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3])) count++;
      }
    }
    return count;
  };
  const ink = (r, g, b, a) => a > 240 && r < 170 && g < 170 && b < 170;
  const light = pixelsIn(opener.box, (r, g, b, a) => a > 240 && r > 180 && g > 180 && b > 180);
  const labelInk = pixelsIn(opener.label, ink);
  const glyphInk = opener.bars.map(rect => pixelsIn(rect, ink));
  // Require both the visible Menu label and its two dark glyph bars on the
  // actual light header. A blank frame or CSS/ARIA state alone cannot qualify.
  if (light < opener.box.width * opener.box.height * .2 || labelInk < 4 || glyphInk.length !== 2 || glyphInk.some(value => value < 4)) return null;
  return { frameTime, labelInk, glyphInk, lightPixels: light };
}

function readOpener() {
  const node = document.querySelector('.pt-navigation-disclosure > summary[aria-label="Open navigation"]');
  const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  if (!node) return null;
  const box = rect(node), label = node.querySelector('span'), bars = [...node.querySelectorAll('.pt-menu-glyph i')];
  let visible = true;
  for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (ancestor.hidden || ancestor.inert || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < .99) visible = false;
  }
  const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  return {
    timeOrigin: performance.timeOrigin, sampledAt: performance.now(),
    eligible: visible && !document.hidden && document.hasFocus() && !node.parentElement.open && node.getAttribute('aria-disabled') !== 'true' && !!label && bars.length === 2 && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.y >= 0 && box.x + box.width <= innerWidth && box.y + box.height <= innerHeight && !!hit && (hit === node || node.contains(hit)),
    box, label: label ? rect(label) : null, bars: bars.map(rect), viewport: { width: innerWidth, height: innerHeight },
    ssrIslands: document.querySelectorAll('astro-island[ssr]').length,
    workersCreated: window.__cold?.workers.length ?? 0,
    workerReady: window.__cold?.workerMessages.some(row => row.type === 'ready') ?? false,
  };
}

export async function waitForPresentedOpener(page, cdp, { timeout = 5000, decodeFrame } = {}) {
  // Server-policy unit tests have no app dependencies. Decode only in the real
  // browser lane; the PNG decoder is already present in the app lockfile.
  if (!decodeFrame) {
    const { PNG } = await import('../app/node_modules/pngjs/lib/png.js');
    decodeFrame = frame => PNG.sync.read(Buffer.from(frame.data, 'base64'));
  }
  let resolve, reject, busy = false, finished = false, lastFrame, diagnostic;
  const presented = new Promise((done, fail) => { resolve = done; reject = fail; });
  // Mark the rejection handled while CDP startup is still in flight.
  void presented.catch(() => {});
  const timer = setTimeout(() => reject(new Error('No presented, visible, hit-testable menu opener before first input: ' + JSON.stringify(diagnostic))), timeout);
  const onFrame = frame => {
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(reject);
    lastFrame = frame;
    if (busy || finished) return;
    busy = true;
    void (async () => {
      while (lastFrame && !finished) {
        const candidate = lastFrame; lastFrame = null;
        const opener = await page.evaluate(readOpener);
        const image = decodeFrame(candidate);
        const proof = inspectOpenerFrame(candidate, opener, image);
        diagnostic = { opener, metadata: candidate.metadata, image: { width: image.width, height: image.height } };
        if (proof) { finished = true; resolve({ ...proof, opener, metadata: candidate.metadata, png: candidate.data }); }
      }
    })().catch(reject).finally(() => { busy = false; });
  };
  cdp.on('Page.screencastFrame', onFrame);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: page.viewportSize().width, maxHeight: page.viewportSize().height });
    const proof = await presented;
    assert.ok(proof.frameTime >= 0);
    return proof;
  } finally {
    finished = true; clearTimeout(timer);
    try { await cdp.send('Page.stopScreencast'); }
    finally { cdp.off('Page.screencastFrame', onFrame); }
  }
}
