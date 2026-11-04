import { parseReportFragment, decryptReport, MAX_ENVELOPE_BYTES } from './crypto.mjs';
import { renderReport, clearReport } from './render.mjs';
const status = document.getElementById('report-status');
let pending;
let generation = 0;
function message(text) {
  status.textContent = text;
  status.hidden = false;
}
async function load() {
  const ownGeneration = ++generation;
  pending?.abort();
  pending = new AbortController();
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
      cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', signal:pending.signal,
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_ENVELOPE_BYTES) throw new Error('Unavailable');
    const buffer = await response.arrayBuffer();
    const report = await decryptReport(buffer, parsed.id, parsed.key);
    if (ownGeneration !== generation) return;
    renderReport(report);
    status.hidden = true;
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
