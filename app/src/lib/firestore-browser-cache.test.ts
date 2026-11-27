import { describe, expect, it, vi } from 'vitest';
import { CACHE_CLEAR_PENDING_KEY, RELOAD_DELAY_MS, enableAccountScopedCache } from './firestore-browser-cache';

function setup({ pending = false, clearFails = false, enableFails = false } = {}) {
  const calls: string[] = [];
  const values = new Map<string, string>(pending ? [[CACHE_CLEAR_PENDING_KEY, '1']] : []);
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  const db = {
    enablePersistence: vi.fn(async () => { calls.push('enable'); if (enableFails) throw new Error('unimplemented'); }),
    clearPersistence: vi.fn(async () => { calls.push('clear'); if (clearFails) throw new Error('failed-precondition'); }),
    terminate: vi.fn(async () => { calls.push('terminate'); }),
  };
  let emit: (user: { uid: string } | null) => void = () => {};
  const auth = { onAuthStateChanged: (next: typeof emit) => { emit = next; } };
  const reload = vi.fn(), delayed: { run: () => void; ms: number }[] = [];
  enableAccountScopedCache(db, auth, { storage, reload, delay: (run, ms) => { delayed.push({ run, ms }); } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  return { calls, values, db, emit: (u: { uid: string } | null) => emit(u), reload, delayed, settle };
}

describe('enableAccountScopedCache', () => {
  it('enables the multi-tab persistent cache without clearing anything', async () => {
    const t = setup();
    await t.settle();
    expect(t.db.enablePersistence).toHaveBeenCalledWith({ synchronizeTabs: true });
    expect(t.calls).toEqual(['enable']);
  });

  it('keeps working when the browser cannot persist', async () => {
    const t = setup({ enableFails: true });
    await t.settle();
    t.emit({ uid: 'a' });
    expect(t.reload).not.toHaveBeenCalled();
  });

  it('keeps the cache across sign-in and a page load that restores the same account', async () => {
    const t = setup();
    t.emit(null); t.emit({ uid: 'a' }); t.emit({ uid: 'a' });
    await t.settle();
    expect(t.db.terminate).not.toHaveBeenCalled();
    expect(t.delayed).toEqual([]);
  });

  it('clears the cache and reloads when the account signs out', async () => {
    const t = setup();
    t.emit({ uid: 'a' }); t.emit(null);
    expect(t.values.get(CACHE_CLEAR_PENDING_KEY)).toBe('1');
    await t.settle();
    expect(t.calls).toEqual(['enable', 'terminate', 'clear']);
    expect(t.values.has(CACHE_CLEAR_PENDING_KEY)).toBe(false);
    expect(t.delayed.map(d => d.ms)).toEqual([RELOAD_DELAY_MS]);
    t.delayed[0].run();
    expect(t.reload).toHaveBeenCalledOnce();
  });

  it('clears the cache when a different account signs in directly', async () => {
    const t = setup();
    t.emit({ uid: 'a' }); t.emit({ uid: 'b' });
    await t.settle();
    expect(t.db.terminate).toHaveBeenCalledOnce();
    expect(t.delayed).toHaveLength(1);
  });

  it('clears only once while a sign-out is in progress', async () => {
    const t = setup();
    t.emit({ uid: 'a' }); t.emit(null); t.emit({ uid: 'b' }); t.emit(null);
    await t.settle();
    expect(t.db.terminate).toHaveBeenCalledOnce();
  });

  it('leaves a marker when another tab still holds the cache, and clears it on the next load', async () => {
    const t = setup({ clearFails: true });
    t.emit({ uid: 'a' }); t.emit(null);
    await t.settle();
    expect(t.values.get(CACHE_CLEAR_PENDING_KEY)).toBe('1');
    expect(t.delayed).toHaveLength(1);

    const next = setup({ pending: true });
    await next.settle();
    expect(next.calls).toEqual(['clear', 'enable']);
    expect(next.values.has(CACHE_CLEAR_PENDING_KEY)).toBe(false);
  });

  it('keeps the marker when the next load cannot clear either', async () => {
    const t = setup({ pending: true, clearFails: true });
    await t.settle();
    expect(t.values.get(CACHE_CLEAR_PENDING_KEY)).toBe('1');
    expect(t.db.enablePersistence).toHaveBeenCalled();
  });
});
