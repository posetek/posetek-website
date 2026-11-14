import { parseReportFragment, decryptReport, reportTrackingToken, MAX_ENVELOPE_BYTES } from './crypto.mjs';
import { renderReport, clearReport } from './render.mjs';
const status = document.getElementById('report-status');
let pending;
let generation = 0;
function message(text) {
  status.textContent = text;
  status.hidden = false;
}
// Time on page is sent as small heartbeats of visible, in-use reading time.
const BEAT_MS = 15000, MAX_BEAT_SECONDS = 60, IDLE_MS = 120000, TICK_MS = 1000, SUSPEND_MS = 5000;
function recordEvent(token, action, seconds) {
  const body = JSON.stringify(seconds ? {token, action, seconds} : {token, action});
  void fetch('/api/one-pager-event', {
    method:'POST', headers:{'Content-Type':'application/json'}, body,
    keepalive:true, credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', cache:'no-store',
  }).catch(() => {});
}
function recordVisibleOpen(record, signal) {
  const visible = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', visible);
    record('opened');
  };
  document.addEventListener('visibilitychange', visible, {signal});
  visible();
}
/**
 * Counts time only while the report is the visible tab and in use: for two minutes
 * after it is opened or returned to, and for two minutes after each touch, scroll
 * or key. Nothing is stored in the browser; whole seconds are sent every 15 seconds
 * and when the page is hidden or closed.
 */
function recordViewTime(record, signal) {
  const shown = () => document.visibilityState === 'visible';
  let unsent = 0, last = performance.now(), lastInput = last, wasShown = shown();
  // Adds the time since the previous call when the report was shown throughout it.
  const advance = () => {
    const now = performance.now(), gap = now - last;
    // A long gap means the device slept or the tab was suspended. Count two ticks
    // of it at most, then wait until the reader touches or returns to the page.
    if (wasShown && last - lastInput < IDLE_MS) unsent += Math.min(gap, 2 * TICK_MS);
    if (gap > SUSPEND_MS) lastInput = -Infinity;
    last = now; wasShown = shown();
  };
  const send = () => {
    const seconds = Math.min(MAX_BEAT_SECONDS, Math.floor(unsent / 1000));
    if (seconds < 1) return;
    unsent = Math.max(0, unsent - seconds * 1000);
    record('viewing', seconds);
  };
  const timer = setInterval(() => { advance(); if (unsent >= BEAT_MS) send(); }, TICK_MS);
  // Browsers without listener signals keep these handlers after a report is closed.
  const input = () => { if (signal.aborted) return; advance(); lastInput = performance.now(); };
  for (const name of ['scroll', 'pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel']) {
    addEventListener(name, input, {signal, passive:true, capture:true});
  }
  document.addEventListener('visibilitychange', () => {
    if (signal.aborted) return;
    advance();
    if (shown()) lastInput = last; else send();
  }, {signal});
  // Leaving the page or switching reports aborts this load: send what is left.
  signal.addEventListener('abort', () => { clearInterval(timer); advance(); send(); }, {once:true});
}
async function load() {
  const ownGeneration = ++generation;
  pending?.abort();
  pending = new AbortController();
  const {signal} = pending;
  clearReport();
  const parsed = parseReportFragment(location.hash);
  if (!parsed) { message('Open your complete private report link to see your results.'); return; }
  if (!globalThis.crypto?.subtle) { message('Open this link in Safari or Chrome to view your report.'); return; }
  if (navigator.serviceWorker?.controller) {
    message('Please open this private link in a fresh browser tab.'); return;
  }
  message('Opening your private report…');
  try {
    const response = await fetch('/report/data/' + parsed.id + '.bin', {
      cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', signal,
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_ENVELOPE_BYTES) throw new Error('Unavailable');
    const buffer = await response.arrayBuffer();
    const report = await decryptReport(buffer, parsed.id, parsed.key);
    // The server accepts events only for the exact privately registered links.
    const token = report.resultsFirst === true && (report.playerSignupUrl || report.workoutEntry === 'stats')
      ? await reportTrackingToken(parsed.id, parsed.key).catch(() => null) : null;
    if (ownGeneration !== generation) return;
    const record = token ? (action, seconds) => recordEvent(token, action, seconds) : undefined;
    renderReport(report, record);
    status.hidden = true;
    if (record) { recordVisibleOpen(record, signal); recordViewTime(record, signal); }
  } catch {
    if (ownGeneration !== generation) return;
    clearReport();
    message('This report could not be opened. Reopen the original link or ask PoseTek for help.');
  } finally { parsed.key.fill(0); }
}
window.addEventListener('hashchange', load);
window.addEventListener('pagehide', () => { ++generation; pending?.abort(); clearReport(); });
window.addEventListener('pageshow', event => { if (event.persisted) load(); });
load();
