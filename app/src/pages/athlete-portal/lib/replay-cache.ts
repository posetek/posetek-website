/* eslint-disable @typescript-eslint/no-explicit-any */
// An in-memory cache for the rep files behind every replay (Nolan, 2026-11-11: the pose results
// "need to be saved in memory so they don't take forever to load in when you click on one of the
// cards"). It lives for the page session only: nothing is written to localStorage, IndexedDB or disk.
//
// - A load already in flight is shared, never repeated; a failed load is never kept.
// - Entries are scoped to the signed-in user and all are dropped when that user changes or signs out.
// - Entries expire (the rep-media answer before its signed URLs do) and the least recently used are
//   evicted past an entry count or a rough byte budget.
// - Cached values are shared between callers: treat them as read-only.

import { auth } from "../../../lib/firebase";

export interface MemoryCacheOptions {
  maxEntries: number;
  /** A rough budget: the sum of the sizes given for kept values (bytes of JSON text for files). */
  maxBytes: number;
  /** The signed-in user's id, or null when signed out (nothing is cached then). */
  userId: () => string | null;
  now?: () => number;
}

export interface RememberOptions<T> {
  /** The value's rough size in bytes, for the byte budget. Default 1 KB. */
  size?: (value: T) => number;
  /** A lifetime computed from the loaded value; the smaller of it and `ttlMs` applies. */
  ttl?: (value: T) => number;
}

type Entry = { promise: Promise<any>; settled: boolean; value?: any; expiresAt: number; size: number };

const DEFAULT_SIZE = 1024;

export interface MemoryCache {
  remember<T>(key: string, load: () => Promise<T>, ttlMs: number, options?: RememberOptions<T>): Promise<T>;
  /** Drops every entry whose (unscoped) key passes the test. */
  drop(test: (key: string) => boolean): void;
  clear(): void;
  stats(): { entries: number; bytes: number; inFlight: number };
}

export function createMemoryCache({ maxEntries, maxBytes, userId, now = () => Date.now() }: MemoryCacheOptions): MemoryCache {
  // Map order is the recency order: the first entry is the least recently used.
  const entries = new Map<string, Entry>();
  let bytes = 0, owner: string | null = null;

  const remove = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    if (entry.settled) bytes -= entry.size;
  };
  const clear = () => { entries.clear(); bytes = 0; };
  /** The current user, dropping everything first when it is not the one the entries belong to. */
  const scope = (): string | null => {
    const uid = userId();
    if (uid !== owner) { clear(); owner = uid; }
    return uid;
  };
  const evict = () => {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break;
      if (entry.settled) remove(key);
    }
  };

  function remember<T>(key: string, load: () => Promise<T>, ttlMs: number, options: RememberOptions<T> = {}): Promise<T> {
    const uid = scope();
    if (!uid || !(ttlMs > 0)) return load();
    const scoped = `${uid}\u0000${key}`;
    const found = entries.get(scoped);
    if (found && (!found.settled || found.expiresAt > now())) {
      entries.delete(scoped); entries.set(scoped, found);
      return found.promise;
    }
    if (found) remove(scoped);
    const entry: Entry = { promise: Promise.resolve(), settled: false, expiresAt: Infinity, size: 0 };
    entry.promise = Promise.resolve().then(load).then(value => {
      // Kept only while this same entry is still wanted: a clear (user change) or a newer load wins.
      if (entries.get(scoped) !== entry) return value;
      const life = Math.min(ttlMs, options.ttl ? options.ttl(value) : Infinity);
      const size = Math.max(0, Number(options.size ? options.size(value) : DEFAULT_SIZE) || 0);
      if (!(life > 0) || size > maxBytes) { entries.delete(scoped); return value; }
      Object.assign(entry, { settled: true, value, expiresAt: now() + life, size });
      bytes += size;
      evict();
      return value;
    }, error => {
      if (entries.get(scoped) === entry) entries.delete(scoped);
      throw error;
    });
    entries.set(scoped, entry);
    return entry.promise;
  }

  return {
    remember,
    drop(test) {
      scope();
      for (const key of [...entries.keys()]) if (test(key.slice(key.indexOf("\u0000") + 1))) remove(key);
    },
    clear,
    stats: () => ({ entries: entries.size, bytes, inFlight: [...entries.values()].filter(entry => !entry.settled).length }),
  };
}

// --- The page's shared cache -------------------------------------------------------------------

/** About forty pose files, the Stats page's twelve replays (athlete and team shadow) several times over. */
const shared = createMemoryCache({ maxEntries: 240, maxBytes: 48 * 1024 * 1024, userId: () => auth.currentUser?.uid ?? null });

let watching = false;
/** Frees everything as soon as the user signs out or switches, not only at the next lookup. */
function watchUser() {
  if (watching) return;
  watching = true;
  try {
    (auth as any).onAuthStateChanged?.(() => shared.drop(() => false));
  } catch { /* Each lookup still checks the user. */ }
}

/**
 * Keeps the result of `load` in memory for `ttlMs`, per signed-in user. A call while the same key is
 * loading shares that load; a failed load is not kept. For the viewers' own slower steps, e.g.
 * `remember(\`team:${metric.id}:${playerId}\`, () => loadTeamComparison(...), 5 * 60_000)`.
 */
export function remember<T>(key: string, load: () => Promise<T>, ttlMs: number, options?: RememberOptions<T>): Promise<T> {
  watchUser();
  return shared.remember(`app:${key}`, load, ttlMs, options);
}

/** Drops everything the page has kept (used by tests; a user change does this by itself). */
export function clearReplayCache(): void { shared.clear(); }
export function replayCacheStats() { return shared.stats(); }

/** The rep-media answer is reused for at most this long, so a changed result is noticed soon. */
export const ARTIFACTS_TTL_MS = 5 * 60_000;
/** …and never closer than this to its signed URLs' expiry. */
export const URL_EXPIRY_MARGIN_MS = 60_000;
/** Downloaded file contents outlive the URLs they came from. */
export const FILE_TTL_MS = 15 * 60_000;
/** The size assumed for a file whose response carries no length. */
const UNKNOWN_FILE_BYTES = 256 * 1024;

const statusText = (status: any) => status && typeof status === "object"
  ? [status.qualified, status.duplicate, status.reason, status.revisionId].map(part => String(part ?? "")).join("|")
  : "";
const repKey = (drillKey: string, rep: any, playerId: string) => `${playerId}|${drillKey}|${rep?.id ?? ""}|${rep?.sessionFolder ?? ""}|${rep?.repFolder ?? ""}`;

/**
 * Downloaded files are keyed by where they are stored, not by their signed URL, so a fresh URL for
 * the same file (after the rep-media answer expires) still finds the contents.
 */
export function fileKey(url: string): string {
  try {
    const parsed = new URL(url);
    if (/(^|\.)storage\.googleapis\.com$|^firebasestorage\.googleapis\.com$/.test(parsed.hostname)) return `${parsed.origin}${parsed.pathname}`;
  } catch { /* not a URL: keyed as given */ }
  return url;
}

// The last result status and files seen for each rep, so a changed result drops its old files.
const repFiles = new Map<string, { status: string; files: string[] }>();

/**
 * One rep's media answer, kept until shortly before its signed URLs expire (and at most
 * `ARTIFACTS_TTL_MS`). The key carries the rep's result status, so a reviewed rep is a new entry.
 */
export function rememberRepArtifacts<T extends { artifactUrls?: Record<string, string>; expiresAtMillis?: number; resultStatus?: any }>(
  drillKey: string, rep: any, playerId: string, load: () => Promise<T>,
): Promise<T> {
  watchUser();
  const base = repKey(drillKey, rep, playerId);
  return shared.remember(`artifacts:${base}|${statusText(rep?.resultStatus)}`, async () => {
    const payload = await load();
    const status = statusText(payload?.resultStatus), files = Object.values(payload?.artifactUrls || {}).filter(Boolean).map(fileKey);
    const previous = repFiles.get(base);
    if (previous && previous.status !== status) {
      const stale = new Set(previous.files.map(key => `file:${key}`));
      shared.drop(key => stale.has(key));
    }
    repFiles.set(base, { status, files });
    if (repFiles.size > 1000) repFiles.delete(repFiles.keys().next().value!);
    return payload;
  }, ARTIFACTS_TTL_MS, {
    ttl: payload => Number.isFinite(payload?.expiresAtMillis) && payload.expiresAtMillis! > 0 ? payload.expiresAtMillis! - Date.now() - URL_EXPIRY_MARGIN_MS : Infinity,
    size: payload => 1024 + JSON.stringify(payload?.artifactUrls || {}).length,
  });
}

/** One downloaded JSON file, kept by storage location for `FILE_TTL_MS`. */
export function rememberJson(url: string, load: () => Promise<{ json: any; bytes: number | null }>): Promise<any> {
  watchUser();
  let size = UNKNOWN_FILE_BYTES;
  return shared.remember(`file:${fileKey(url)}`, async () => {
    const { json, bytes } = await load();
    if (bytes && bytes > 0) size = bytes;
    return json;
  }, FILE_TTL_MS, { size: () => size });
}
