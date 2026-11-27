import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ default: {}, db: {} }));

import { CATALOG_CACHE_MAX_AGE_MS, catalogStamp, decodeCatalogDocs, encodeCatalogDocs, readStoredCatalog, storeCatalog } from './drill-catalog-cache';

class FakeTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  // The real Timestamp also serializes itself; the cache must not rely on this shape.
  toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds, type: 'timestamp' }; }
}
const makeTimestamp = (seconds: number, nanoseconds: number) => new FakeTimestamp(seconds, nanoseconds);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const docs = () => [
  { id: 'DRB-001', data: { name: 'Cone weave', status: 'published', howTo: { steps: ['a', 'b'] }, mediaPublishedAt: new FakeTimestamp(1_700_000_000, 5_000_000) } },
  { id: 'PAS-002', data: { name: 'Wall pass', status: 'published', equipment: ['ball'] } },
];

describe('catalogStamp', () => {
  it('changes with the catalog version and with the newest media stamp', () => {
    const base = catalogStamp('1.0.4', new FakeTimestamp(10, 0));
    expect(catalogStamp('1.0.4', new FakeTimestamp(10, 0))).toBe(base);
    expect(catalogStamp('1.0.5', new FakeTimestamp(10, 0))).not.toBe(base);
    expect(catalogStamp('1.0.4', new FakeTimestamp(11, 0))).not.toBe(base);
    expect(catalogStamp(undefined, undefined)).toBe(JSON.stringify([null, null]));
  });
});

describe('catalog encoding', () => {
  it('round-trips Firestore Timestamps as Timestamps', () => {
    const decoded = decodeCatalogDocs(JSON.parse(encodeCatalogDocs(docs())!), makeTimestamp)!;
    expect(decoded[0].data.mediaPublishedAt).toBeInstanceOf(FakeTimestamp);
    expect((decoded[0].data.mediaPublishedAt as FakeTimestamp).toMillis()).toBe(1_700_000_000_005);
    expect(decoded[0].data.howTo).toEqual({ steps: ['a', 'b'] });
    expect(decoded[1]).toEqual(docs()[1]);
  });

  it('refuses to cache values it cannot restore exactly', () => {
    class Reference { path = 'drillCatalog/x'; }
    expect(encodeCatalogDocs([{ id: 'x', data: { ref: new Reference() } }])).toBeNull();
  });

  it('rejects malformed stored rows', () => {
    expect(decodeCatalogDocs({ id: 'x' }, makeTimestamp)).toBeNull();
    expect(decodeCatalogDocs([{ id: 1, data: {} }], makeTimestamp)).toBeNull();
    expect(decodeCatalogDocs([{ id: 'x', data: null }], makeTimestamp)).toBeNull();
  });
});

describe('stored catalog', () => {
  it('is reused only for the same scope and stamp', () => {
    const storage = memoryStorage(), stamp = catalogStamp('1.0.4', null);
    storeCatalog('published', stamp, docs(), 1_000, storage);
    expect(readStoredCatalog('published', stamp, 2_000, makeTimestamp, storage)).toHaveLength(2);
    expect(readStoredCatalog('all', stamp, 2_000, makeTimestamp, storage)).toBeNull();
    expect(readStoredCatalog('published', catalogStamp('1.0.5', null), 2_000, makeTimestamp, storage)).toBeNull();
  });

  it('expires after the maximum age even when the stamp is unchanged', () => {
    const storage = memoryStorage(), stamp = catalogStamp('1.0.4', null);
    storeCatalog('published', stamp, docs(), 1_000, storage);
    expect(readStoredCatalog('published', stamp, 1_000 + CATALOG_CACHE_MAX_AGE_MS - 1, makeTimestamp, storage)).not.toBeNull();
    expect(readStoredCatalog('published', stamp, 1_000 + CATALOG_CACHE_MAX_AGE_MS, makeTimestamp, storage)).toBeNull();
    expect(readStoredCatalog('published', stamp, 999, makeTimestamp, storage)).toBeNull();
  });

  it('survives corrupt, full or missing storage', () => {
    const corrupt = memoryStorage();
    corrupt.values.set('posetek.drillCatalogCache.v1.published', '{not json');
    expect(readStoredCatalog('published', 'x', 0, makeTimestamp, corrupt)).toBeNull();

    const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => storeCatalog('published', 'x', docs(), 0, full)).not.toThrow();
    expect(readStoredCatalog('published', 'x', 0, makeTimestamp, null)).toBeNull();
    expect(() => storeCatalog('published', 'x', docs(), 0, null)).not.toThrow();
  });
});
