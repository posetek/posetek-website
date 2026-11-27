// The drill catalog is a few hundred documents that change only when an admin
// edits or publishes a drill. Reading it whole on every page visit was one of
// the website's largest Firestore read costs, so keep the last copy in this
// browser and refetch only when its stamp moves (the iOS DrillCatalogStore
// does the same):
//   - `drillCatalogMeta/current.catalogVersion`, which every drill edit and
//     validation promotion bumps in the same transaction as the write, and
//   - the newest `mediaPublishedAt`, because the media publisher ships clips
//     without touching the version.
// Checking the stamp costs two document reads instead of the whole catalog.
// A copy older than CATALOG_CACHE_MAX_AGE_MS is refetched regardless, so a
// writer that skips the version bump can only leave a copy stale for a day.

import firebase, { db } from "./firebase";

export type CatalogScope = "published" | "all";
export type CatalogDoc = { id: string; data: Record<string, unknown> };
type Entry = { schema: 1; stamp: string; savedAt: number; docs: unknown };

const STORAGE_PREFIX = "posetek.drillCatalogCache.v1.";
export const CATALOG_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP_TAG = "__posetekTimestamp";

type TimestampLike = { seconds: number; nanoseconds: number; toMillis: () => number };
const isTimestamp = (value: unknown): value is TimestampLike =>
  !!value && typeof value === "object" && typeof (value as TimestampLike).toMillis === "function"
  && Number.isFinite((value as TimestampLike).seconds) && Number.isFinite((value as TimestampLike).nanoseconds);

/** The value that decides whether a stored catalog is still current. */
export function catalogStamp(version: unknown, latestMedia: unknown): string {
  return JSON.stringify([typeof version === "string" ? version : null, isTimestamp(latestMedia) ? latestMedia.toMillis() : null]);
}

/**
 * JSON for a catalog document's data. Firestore Timestamps survive the round trip;
 * any other non-plain value (a reference, GeoPoint, Bytes) makes the catalog
 * uncacheable, so it is read from the server as before.
 */
export function encodeCatalogDocs(docs: CatalogDoc[]): string | null {
  let plain = true;
  const encoded = JSON.stringify(docs, function (this: Record<string, unknown>, key, value) {
    // `value` has already been through toJSON; the holder still has the Timestamp itself.
    const raw = this[key];
    if (isTimestamp(raw)) return { [TIMESTAMP_TAG]: [raw.seconds, raw.nanoseconds] };
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.getPrototypeOf(raw) !== Object.prototype) plain = false;
    return value;
  });
  return plain ? encoded : null;
}

export function decodeCatalogDocs(docs: unknown, makeTimestamp: (seconds: number, nanoseconds: number) => unknown): CatalogDoc[] | null {
  if (!Array.isArray(docs)) return null;
  const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(revive);
    if (!value || typeof value !== "object") return value;
    const tagged = (value as Record<string, unknown>)[TIMESTAMP_TAG];
    if (Array.isArray(tagged) && tagged.length === 2) return makeTimestamp(Number(tagged[0]), Number(tagged[1]));
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]));
  };
  const result: CatalogDoc[] = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== "object" || typeof (doc as CatalogDoc).id !== "string" || !(doc as CatalogDoc).data || typeof (doc as CatalogDoc).data !== "object") return null;
    result.push({ id: (doc as CatalogDoc).id, data: revive((doc as CatalogDoc).data) as Record<string, unknown> });
  }
  return result;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const browserStorage = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readStoredCatalog(scope: CatalogScope, stamp: string, now: number, makeTimestamp: (seconds: number, nanoseconds: number) => unknown, storage = browserStorage()): CatalogDoc[] | null {
  try {
    const entry = JSON.parse(storage?.getItem(STORAGE_PREFIX + scope) || "null") as Entry | null;
    if (entry?.schema !== 1 || entry.stamp !== stamp || !(now - entry.savedAt >= 0 && now - entry.savedAt < CATALOG_CACHE_MAX_AGE_MS)) return null;
    return decodeCatalogDocs(entry.docs, makeTimestamp);
  } catch { return null; }
}

export function storeCatalog(scope: CatalogScope, stamp: string, docs: CatalogDoc[], now: number, storage = browserStorage()): void {
  const encoded = encodeCatalogDocs(docs);
  try {
    if (encoded === null) { storage?.removeItem(STORAGE_PREFIX + scope); return; }
    storage?.setItem(STORAGE_PREFIX + scope, `{"schema":1,"stamp":${JSON.stringify(stamp)},"savedAt":${now},"docs":${encoded}}`);
  } catch {
    // Quota or a blocked storage: the next visit reads the server, as before.
    try { storage?.removeItem(STORAGE_PREFIX + scope); } catch { /* storage unavailable */ }
  }
}

const makeTimestamp = (seconds: number, nanoseconds: number) => new firebase.firestore.Timestamp(seconds, nanoseconds);
const catalogQuery = (scope: CatalogScope) => scope === "published"
  ? db.collection("drillCatalog").where("status", "==", "published")
  : db.collection("drillCatalog");
const docsOf = (snapshot: firebase.firestore.QuerySnapshot) => snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

async function catalogFor(scope: CatalogScope, stamp: string): Promise<CatalogDoc[]> {
  const stored = readStoredCatalog(scope, stamp, Date.now(), makeTimestamp);
  if (stored) return stored;
  const docs = docsOf(await catalogQuery(scope).get({ source: "server" }));
  storeCatalog(scope, stamp, docs, Date.now());
  return docs;
}

const metaRef = () => db.collection("drillCatalogMeta").doc("current");
// Firestore leaves out documents without the ordered field, so the first row is the newest stamp.
const latestMediaQuery = () => db.collection("drillCatalog").orderBy("mediaPublishedAt", "desc").limit(1);

/** The catalog once, reading the whole collection only when the stored copy is out of date. */
export async function loadCachedCatalog(scope: CatalogScope): Promise<CatalogDoc[]> {
  const [meta, media] = await Promise.all([metaRef().get({ source: "server" }), latestMediaQuery().get({ source: "server" })]);
  return catalogFor(scope, catalogStamp(meta.data()?.catalogVersion, media.docs[0]?.data()?.mediaPublishedAt));
}

/**
 * The catalog, kept current while subscribed: two small listeners watch the stamp
 * and the whole collection is read only when it moves past the stored copy.
 */
export function watchCachedCatalog(scope: CatalogScope, receive: (docs: CatalogDoc[]) => void, fail: (error: Error) => void): () => void {
  let version: unknown, media: unknown, metaSeen = false, mediaSeen = false, current: string | null = null, stopped = false;
  const update = () => {
    if (stopped || !metaSeen || !mediaSeen) return;
    const stamp = catalogStamp(version, media);
    if (stamp === current) return;
    current = stamp;
    catalogFor(scope, stamp).then(docs => { if (!stopped && current === stamp) receive(docs); }, error => {
      if (current === stamp) current = null;
      if (!stopped) fail(error);
    });
  };
  // A stamp from the local Firestore cache may be out of date; wait for the server's.
  const stops = [
    metaRef().onSnapshot(snapshot => { if (snapshot.metadata.fromCache) return; version = snapshot.data()?.catalogVersion; metaSeen = true; update(); }, fail),
    latestMediaQuery().onSnapshot(snapshot => { if (snapshot.metadata.fromCache) return; media = snapshot.docs[0]?.data()?.mediaPublishedAt; mediaSeen = true; update(); }, fail),
  ];
  return () => { stopped = true; stops.forEach(stop => stop()); };
}
