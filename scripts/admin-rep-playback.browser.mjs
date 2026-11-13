// Real RepTools UI, invented data, loopback only, no writes or authentication.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
const origin = process.env.POSETEK_ADMIN_PREVIEW_URL || 'http://127.0.0.1:4284';
assert.ok(new URL(origin).protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname));
const output = process.env.ADMIN_REP_PLAYBACK_ARTIFACTS;
assert.ok(output && isAbsolute(output), 'Set ADMIN_REP_PLAYBACK_ARTIFACTS to an isolated absolute output directory.');
await mkdir(output, { recursive: true });
const results = [];
const route = id => `${origin}/admin/accounts/player/synthetic-athlete/results/${id === 'sprint-geometry' ? 'sprint' : 'dribbling'}/${id}`;
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const blocked = [], socketsBlocked = [], mutations = [], pageErrors = [], checks = [];
    await context.routeWebSocket('**/*', socket => { const url = new URL(socket.url()); socketsBlocked.push(url.origin + url.pathname); socket.close(); });
    await context.route('**/*', request => {
      const url = new URL(request.request().url()), method = request.request().method();
      if (url.origin !== new URL(origin).origin) { blocked.push(url.origin + url.pathname); return request.abort(); }
      if (!['GET', 'HEAD'].includes(method)) { mutations.push(`${method} ${url.pathname}`); return request.abort(); }
      return request.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    const slider = page.getByRole('slider', { name: 'Frame', exact: true });
    const button = name => page.getByRole('button', { name, exact: true });
    const frame = async () => Number(await slider.inputValue());
    const check = (value, label) => { assert.ok(value, `${engineName}: ${label}`); checks.push(label); };
    const gotoCase = async id => { await page.goto(route(id)); await page.locator('.rt-stage canvas').waitFor(); };
    const go = async value => { await slider.fill(String(value)); await page.waitForFunction(expected => Number(document.querySelector('input[aria-label="Frame"]').value) === expected, value); };
    const alpha = () => page.locator('.rt-stage canvas').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
      return count;
    });
    const unedited = async label => {
      check(await page.locator('.rt-diff tr.changed').count() === 0, `${label}: no metric edits`);
      check(await page.getByRole('button', { name: /Push changes/ }).isDisabled(), `${label}: push disabled`);
      const audit = await page.evaluate(() => ({ writes: window.__repPlayback.writes, denied: window.__repPlayback.denied }));
      assert.deepEqual(audit, { writes: [], denied: [] });
    };
    const snapshot = async id => page.screenshot({ path: resolve(output, `${engineName}-${id}.png`), fullPage: true });

    await gotoCase('tracking');
    // Measured evidence (result validation) is a separate layer with its own switch;
    // turn it off so these pixel checks measure only the raw tracking overlay.
    await page.getByRole('checkbox', { name: 'Measured evidence' }).uncheck();
    check(await slider.getAttribute('max') === '59', 'tracking frameCount sets bounds despite sparse array');
    check((await page.locator('.rt-frame-chip').innerText()).includes('30.00 fps'), 'metadata FPS preserved');
    check(await alpha() > 100, 'tracking person/COM/ball render actual canvas pixels');
    await page.getByRole('checkbox', { name: 'Recorded tracking' }).uncheck();
    check(await alpha() === 0, 'raw tracking overlay switch clears canvas');
    await page.getByRole('checkbox', { name: 'Recorded tracking' }).check();
    await button('Forward one frame').click();
    check(await frame() === 1 && await alpha() === 0, 'sparse missing frame stays empty instead of reusing prior detection');
    await page.getByText('No tracked detection at this frame.', { exact: true }).waitFor();
    await go(31); check(await alpha() > 100, 'slider reaches sparse frame by recorded index');
    await button('Back one frame').click(); check(await frame() === 30, 'back step');
    await button('Forward 10 frames').click(); check(await frame() === 40, 'ten-frame step');
    await button('First frame').click();
    await button('Play').click(); await page.waitForFunction(() => Number(document.querySelector('input[aria-label="Frame"]').value) > 1);
    await button('Pause').click();
    const paused = await frame(); await page.waitForTimeout(160); check(await frame() === paused, 'tracking playback pauses');
    await page.locator('.speed-button').click(); check((await page.locator('.speed-button').innerText()).trim() === '2×', 'playback speed cycles');
    await go(56); await button('Play').click(); await button('Play').waitFor();
    check(await frame() === 59, 'tracking playback stops on final frame');
    const annotation = page.locator('.rt-annotate-row');
    check(await annotation.getByRole('button', { name: 'Start', exact: true }).count() === 2, 'both annotation controls present');
    for (const start of await annotation.getByRole('button', { name: 'Start', exact: true }).all()) check(await start.isDisabled(), 'point annotations disabled without original video');
    await unedited('tracking transport'); await snapshot('tracking');
    // Client-side route transition must remount loaded state, not just full navigation.
    await page.getByRole('navigation', { name: 'Synthetic playback cases' }).getByRole('link', { name: 'pose', exact: true }).click();
    await page.waitForURL(/\/pose$/); await page.locator('.rt-stage canvas').waitFor();
    await page.waitForFunction(() => document.querySelector('.rt-frame-chip')?.textContent.includes('frame 0 /'));
    check(await frame() === 0 && (await page.locator('.speed-button').innerText()).trim() === '1×', 'route change resets cursor and playback rate');
    check(await alpha() > 100, 'legacy pose skeleton paints canvas');
    await button('Forward one frame').click(); check(await frame() === 1, 'pose frame step remains available');
    await button('Play').click(); await page.waitForFunction(() => Number(document.querySelector('input[aria-label="Frame"]').value) > 2);
    await button('Pause').click(); await unedited('pose transport'); await snapshot('pose');

    await gotoCase('metadata');
    await page.getByText('No video, pose, or tracking data is available for this rep.', { exact: true }).waitFor();
    check(await slider.isDisabled() && await button('Play').isDisabled(), 'metadata frame count does not imply playable content');
    for (const name of ['First frame', 'Back one frame', 'Forward one frame', 'Last frame']) check(await button(name).isDisabled(), `${name} disabled without playable evidence`);
    check(await alpha() === 0, 'metadata-only canvas remains empty');
    await unedited('metadata-only'); await snapshot('metadata');

    await gotoCase('tracking-error');
    await page.getByText(/tracking.*(?:could not|unavailable|failed)|(?:could not|unavailable|failed).*tracking/i).first().waitFor();
    check(await button('Play').isDisabled(), 'failed tracking request is not playable');
    await unedited('tracking request failure'); await snapshot('tracking-error');

    await gotoCase('unknown-timing');
    check(await button('Play').isDisabled(), 'unknown clock does not invent timed playback');
    check(!await slider.isDisabled(), 'unknown clock retains manual visual review');
    await go(31); check(await frame() === 31 && await alpha() > 100, 'unknown clock can scrub recorded positions');
    await unedited('unknown timing'); await snapshot('unknown-timing');
    await page.getByRole('spinbutton', { name: 'Start frame', exact: true }).fill('1');
    check(await page.getByRole('button', { name: /Push changes/ }).isDisabled(), 'unknown clock prevents saving edited timing frames');
    assert.deepEqual(await page.evaluate(() => window.__repPlayback.writes), [], 'Unknown timing edit never attempts a write');

    await page.setViewportSize({ width: 1024, height: 900 });
    await gotoCase('sprint-geometry');
    // Constrain the real column, as admin chrome can do. Its existing 360px
    // stage minimum now letterboxes the 16:9 recording; no drawing API is mocked.
    await page.locator('.rt-main').evaluate(column => { column.style.maxWidth = '480px'; });
    await page.locator('.rt-stage').evaluate(stage => { stage.style.width = '100%'; });
    await page.waitForFunction(() => document.querySelector('.rt-stage canvas').width <= 480);
    check((await page.locator('.rt-frame-chip').innerText()).includes('30.00 fps (tracking)'), 'tracking FPS supplies missing sprint metadata clock');
    const geometry = await page.locator('.rt-stage canvas').evaluate(canvas => {
      const { width, height } = canvas, pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      const bounds = { left: width, right: -1, top: height, bottom: -1 };
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] > 0 && pixels[i + 1] > pixels[i] + 10 && pixels[i + 1] > pixels[i + 2] + 30) {
          bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
          bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
        }
      }
      const contentHeight = width * 720 / 1280, offset = (height - contentHeight) / 2;
      return { width, height, offset, bounds, expected: { left: width * .12, right: width * .34, top: offset + contentHeight * .15, bottom: offset + contentHeight * .85 } };
    });
    check(geometry.offset > 20, 'narrow layout provides a real letterboxed geometry regression case');
    for (const edge of ['left', 'right', 'top', 'bottom']) check(Math.abs(geometry.bounds[edge] - geometry.expected[edge]) <= 3, `sprint frame dimensions map actual ${edge} canvas pixels into letterboxed content`);
    await unedited('sprint geometry'); await snapshot('sprint-geometry');
    await page.setViewportSize({ width: 1440, height: 1000 });

    await gotoCase('video');
    await page.waitForFunction(() => { const video = document.querySelector('.rt-stage video'); return video && video.readyState >= 2 && video.videoWidth === 320; });
    check(!await button('Play').isDisabled(), 'real synthetic MP4 decodes and enables video playback');
    await button('Forward 10 frames').click();
    check(await frame() === 10, 'video frame stepping retains cursor');
    const time = await page.locator('.rt-stage video').evaluate(video => video.currentTime);
    check(Math.abs(time - 10.5 / 30) < .04, 'video seek aligns with selected frame center');
    await button('Play').click(); await page.waitForFunction(() => document.querySelector('.rt-stage video').currentTime > .5);
    await button('Pause').click(); check(await page.locator('.rt-stage video').evaluate(video => video.paused), 'video pause controls native element');
    await page.locator('.speed-button').click(); check(await page.locator('.rt-stage video').evaluate(video => video.playbackRate) === 2, 'video rate controls native element');
    await button('Last frame').click(); await button('Play').click();
    await page.waitForFunction(() => document.querySelector('.rt-stage video').ended, undefined, { timeout: 10_000 });
    await button('Play').waitFor();
    check(await page.locator('.rt-stage video').evaluate(video => video.paused), 'native playback end returns to paused state');
    await unedited('video transport'); await snapshot('video');

    assert.deepEqual(pageErrors, [], 'No browser exceptions');
    assert.deepEqual(mutations, [], 'No network mutations attempted');
    // External font requests may be attempted by unchanged CSS; all are blocked.
    check(blocked.every(url => /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(url)), `only optional external font requests were blocked: ${JSON.stringify(blocked)}`);
    check(socketsBlocked.every(value => new URL(value).host === new URL(origin).host), 'only loopback development WebSockets attempted; all blocked');
    results.push({ engine: engineName, status: 'passed', checks, pageErrors, blocked, socketsBlocked, mutations });
    await context.close();
  } finally { await browser.close(); }
}
await writeFile(resolve(output, 'results.json'), JSON.stringify({ results,
  limitations: ['Synthetic source-component acceptance with intercepted data loaders; no Firebase/auth or artifact-loader integration claim.', 'Synthetic H.264 video; no HEVC or physical-device codec claim.', 'No metric editing or persisted revision performed.'] }, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.reduce((n, result) => n + result.checks.length, 0), engines: results.length, output }));
