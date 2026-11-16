import type { JourneyEntry } from './recording';

type SignInEntry = Extract<JourneyEntry, 'sign_in' | 'signup' | 'continue' | 'report_stats' | 'report_workouts'>;
type PendingEntry = { uid: string; entry: SignInEntry; at: number };
const ENTRIES: SignInEntry[] = ['sign_in', 'signup', 'continue', 'report_stats', 'report_workouts'];
const STORAGE_KEY = 'posetek:player-journey:entry';
const ENTRY_MAX_AGE = 5 * 60 * 1000;
let pending: PendingEntry | null = null;

// Same-tab bridge between the isolated sign-in document and the workspace.
// Only the entry kind is sent. The UID here fences the handoff from another account.
export function rememberPlayerJourneyEntry(uid: string, entry: SignInEntry) {
  pending = { uid, entry, at: Date.now() };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending)); } catch { /* Optional storage. */ }
}

export function takePlayerJourneyEntry(uid: string, search: string): JourneyEntry {
  let saved = pending;
  pending = null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!saved && stored) saved = JSON.parse(stored) as PendingEntry;
  } catch { /* Optional storage. */ }
  const age = Date.now() - (saved?.at ?? 0);
  if (saved && saved.uid === uid && age >= 0 && age <= ENTRY_MAX_AGE && ENTRIES.includes(saved.entry)) return saved.entry;
  const query = new URLSearchParams(search);
  return ['player', 'view', 'screen', 'drill', 'session', 'rep'].some(key => query.has(key)) ? 'deep_link' : 'restored';
}
