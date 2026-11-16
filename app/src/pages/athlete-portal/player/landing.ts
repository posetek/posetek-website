import type { PlayerView } from './PlayerShell';

/**
 * The tab a workspace link that names no page opens (Nolan, 2026-11-16): Stats the first time a
 * signed-in account opens the workspace in this browser, Workouts every time after that. A parent
 * session keeps its Stats landing. A link that names a tab always opens that tab instead.
 */
export function defaultPlayerView({ parent, seen }: { parent: boolean; seen: boolean }): PlayerView {
  return !parent && seen ? 'workouts' : 'stats';
}

export type LandingStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Remembered per Auth UID (the signed-in account, not the athlete shown) in this browser only. */
const key = (uid: string) => `posetek.workspaceLanding.v1.${uid}`;

function browserStore(): LandingStore | null {
  try { return window.localStorage; } catch { return null; }
}

/** False when nothing is remembered or the store is unavailable: that open counts as the first. */
export function landingSeen(uid: string | null | undefined, store: LandingStore | null = browserStore()): boolean {
  if (!uid || !store) return false;
  try { return store.getItem(key(uid)) === '1'; } catch { return false; }
}

export function markLandingSeen(uid: string | null | undefined, store: LandingStore | null = browserStore()): void {
  if (!uid || !store) return;
  try { store.setItem(key(uid), '1'); } catch { /* a blocked store lands on Stats again next time */ }
}
