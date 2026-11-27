// Firestore's persistent browser cache lets a listener that reopens within 30
// minutes pay only for documents that changed, instead of reading every
// document again on each page load. It keeps signed-in data in IndexedDB, and
// coaches and athletes share school and club computers, so the cache belongs
// to one account: when that account signs out, or another signs in, it is
// cleared and the page reloads (a terminated Firestore client cannot be reused).
// If another tab still holds the cache, clearing fails; a stored marker makes
// the next page load clear it before Firestore starts.

export const CACHE_CLEAR_PENDING_KEY = "posetek.firestoreCache.clearPending";
export const RELOAD_DELAY_MS = 1_000;

type Firestore = {
  enablePersistence: (settings: { synchronizeTabs: boolean }) => Promise<void>;
  clearPersistence: () => Promise<void>;
  terminate: () => Promise<void>;
};
type Auth = { onAuthStateChanged: (next: (user: { uid: string } | null) => void) => unknown };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
type Dependencies = { storage: Storage | null; reload: () => void; delay: (run: () => void, ms: number) => void };

const quietly = (run: () => void) => { try { run(); } catch { /* storage unavailable */ } };

/** Must run before anything else touches Firestore. */
export function enableAccountScopedCache(db: Firestore, auth: Auth, { storage, reload, delay }: Dependencies): void {
  let pending = false;
  quietly(() => { pending = storage?.getItem(CACHE_CLEAR_PENDING_KEY) === "1"; });
  if (pending) {
    // A previous account's data is still on disk. Clearing is queued ahead of the client starting.
    db.clearPersistence().then(() => quietly(() => storage?.removeItem(CACHE_CLEAR_PENDING_KEY)), () => { /* still held by another tab; retried next load */ });
  }
  // Unsupported browsers, private windows and a second tab without IndexedDB keep the memory cache.
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  let owner: string | null | undefined;
  let clearing = false;
  auth.onAuthStateChanged(user => {
    const uid = user?.uid ?? null;
    if (owner && uid !== owner && !clearing) {
      clearing = true;
      quietly(() => storage?.setItem(CACHE_CLEAR_PENDING_KEY, "1"));
      db.terminate()
        .then(() => db.clearPersistence())
        .then(() => quietly(() => storage?.removeItem(CACHE_CLEAR_PENDING_KEY)), () => { /* the marker clears it next load */ })
        // Pages that navigate after signing out usually leave before this fires; others reload in place.
        .finally(() => delay(reload, RELOAD_DELAY_MS));
    }
    owner = uid;
  });
}
