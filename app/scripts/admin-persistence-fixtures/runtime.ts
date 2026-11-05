// Browser-only persistence boundary. Production hooks/readers stay unmodified;
// the existing synthetic adapter supplies every record and refuses writes.
import firebase, { auth, db, storage, cloud as activityCloud, directorySource as activitySource, AS_OF } from '../admin-activity-fixtures/runtime';
export { auth, db, storage };
export default firebase;
let directoryMode = 'normal';
const pending = [], holds = new Set(window.__adminPersistenceOptions?.hold || []);
const pause = () => new Promise(resolve => setTimeout(resolve, 40));
const source = Object.fromEntries(Object.entries(activitySource).map(([kind, reader]) => [kind, async (...args) => {
  let value = await reader(...args);
  if (kind === 'context' && value.organization) value = { ...value, organization: { ...value.organization, websiteUrl: `https://observation-${window.__adminActivity.requests.filter(row => row.kind === kind).length}.example.test` } };
  if (directoryMode === 'denied') throw Object.assign(new Error('Synthetic directory permission denied.'), { code: 'permission-denied' });
  if (holds.delete(kind)) return new Promise(resolve => pending.push({ kind, resolve: () => resolve(value) }));
  await pause();
  return value;
}]));
export const directorySource = source;
export const cloud = { httpsCallable: name => async input => {
  const observation = window.__adminActivity.requests.filter(row => row.kind === name).length + 1;
  const result = await activityCloud.httpsCallable(name)(input);
  if (name === 'getClubInsightsV2') {
    // Make a new observation distinguishable from a reuse in the visible label.
    result.data.generatedAtMillis = AS_OF + observation * 60_000;
    await pause();
  }
  return result;
} };
window.__adminPersistence = {
  pending,
  setDirectoryMode(value) { directoryMode = value; },
  holdNextDirectory(kind) { holds.add(kind); },
  releaseDirectory() { for (const item of pending.splice(0)) item.resolve(); },
  async invalidate() { const { invalidateClubContext } = await import('/src/lib/organization-data'); invalidateClubContext(); },
  async navigate(path) { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); },
  observeLoading(includeReports = true) {
    window.__adminPersistence.flashes = [];
    window.__adminPersistence.loadingTrace = [];
    window.__adminPersistence.observer?.disconnect();
    const inspect = (reason = 'mutation') => {
      const messages = [...document.querySelectorAll('[role="status"]')].map(node => node.textContent).filter(text => /Loading (?:organizations|organization and teams|staff access|teams|organization settings|activity reporting|reporting)|Preparing .*report|Updating activity/.test(text || ''));
      if ((messages.length || reason === 'watch-start') && window.__adminPersistence.loadingTrace.length < 100) window.__adminPersistence.loadingTrace.push({
        reason, messages, directoryTab: document.querySelector('[id^="directory-tab-"][aria-selected="true"]')?.id,
        reportTab: document.querySelector('[id^="workspace-report-tab-"][aria-selected="true"]')?.id,
        hasReportTimestamp: document.body.textContent.includes('Report checked '),
        requests: window.__adminActivity.requests.map(({ sequence, kind, state }) => ({ sequence, kind, state })),
      });
      if (messages.length) window.__adminPersistence.flashes.push(...messages.filter(text => includeReports || !/report|Updating activity/.test(text)));
    };
    window.__adminPersistence.observer = new MutationObserver(() => inspect());
    window.__adminPersistence.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    inspect('watch-start');
  },
};
