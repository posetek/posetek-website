import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { inspectOpenerFrame, waitForPresentedOpener } from './marketing-cold-presentation.mjs';

const opener = { eligible: true, timeOrigin: 1000, viewport: { width: 100, height: 60 }, box: { x: 20, y: 5, width: 70, height: 44 }, label: { x: 22, y: 22, width: 30, height: 12 }, bars: [{ x: 65, y: 24, width: 20, height: 1 }, { x: 71, y: 30, width: 14, height: 1 }] };
function frame({ visible = true, label = true, bars = true, timestamp = 1.2 } = {}) {
  const png = { width: 100, height: 60, data: new Uint8Array(100 * 60 * 4) }; png.data.fill(241);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  const ink = rect => { for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) { const i = (y * png.width + x) * 4; png.data[i] = 123; png.data[i + 1] = 130; png.data[i + 2] = 128; } };
  if (visible && label) ink({ x: 25, y: 24, width: 4, height: 8 });
  if (visible && bars) opener.bars.forEach(ink);
  return { image: png, data: 'fixture-frame', metadata: { timestamp }, sessionId: 1 };
}

const inspect = (frame, opener) => inspectOpenerFrame(frame, opener, frame.image);
const decodeFrame = frame => frame.image;

test('first input needs current-navigation visible label and both glyph bars, not merely a DOM box', () => {
  assert.equal(inspect(frame({ visible: false }), opener), null);
  assert.equal(inspect(frame({ label: false }), opener), null);
  assert.equal(inspect(frame({ bars: false }), opener), null);
  assert.equal(inspect(frame({ timestamp: .9 }), opener), null);
  assert.equal(inspect(frame(), { ...opener, eligible: false }), null);
  assert.equal(inspect(frame(), { ...opener, viewport: { width: 200, height: 60 } }), null);
  assert.equal(inspect(frame(), opener).frameTime, 200);
});

test('gate remains pending through blank compositor frames and stops capture as soon as an eligible opener frame arrives', async () => {
  const cdp = new EventEmitter(), calls = []; let resolved = false;
  cdp.send = async method => { calls.push(method); };
  const page = { evaluate: async () => opener, viewportSize: () => opener.viewport };
  const pending = waitForPresentedOpener(page, cdp, { decodeFrame }).then(value => { resolved = true; return value; });
  cdp.emit('Page.screencastFrame', frame({ visible: false }));
  await new Promise(done => setImmediate(done));
  assert.equal(resolved, false, 'the old DCL/DOM-box precondition would already allow input here');
  cdp.emit('Page.screencastFrame', frame());
  const proof = await pending;
  assert.equal(proof.frameTime, 200);
  assert.equal(calls.at(-1), 'Page.stopScreencast');
  assert.equal(cdp.listenerCount('Page.screencastFrame'), 0);
});

test('no compositor evidence fails closed and removes the listener', async () => {
  const cdp = new EventEmitter(); cdp.send = async () => {};
  await assert.rejects(waitForPresentedOpener({ evaluate: async () => opener, viewportSize: () => opener.viewport }, cdp, { timeout: 10, decodeFrame }), /No presented/);
  assert.equal(cdp.listenerCount('Page.screencastFrame'), 0);
});


test('a failing CDP stop still removes the frame listener', async () => {
  const cdp = new EventEmitter();
  cdp.send = async method => { if (method === 'Page.stopScreencast') throw new Error('CDP session closed'); };
  const pending = waitForPresentedOpener({ evaluate: async () => opener, viewportSize: () => opener.viewport }, cdp, { decodeFrame });
  cdp.emit('Page.screencastFrame', frame());
  await assert.rejects(pending, /CDP session closed/);
  assert.equal(cdp.listenerCount('Page.screencastFrame'), 0);
});
