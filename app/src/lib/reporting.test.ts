import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./firebase', () => ({ auth: {} }));
import { createReadOnlyReport } from './useReadOnlyReport';
import type { ReadOnlyReport } from './useReadOnlyReport';
import { createForegroundRefresh } from './foreground-report';
import { workoutMinutes } from './workout-duration';
const outage = Object.assign(new Error('Temporarily unavailable'), { code: 'functions/unavailable' });
afterEach(() => vi.useRealTimers());
describe('read-only evidence refresh', () => {
  it('keeps successful same-account evidence marked stale after bounded transient failures', async () => {
    vi.useFakeTimers(); const reader = createReadOnlyReport<string>(() => 100), states: ReadOnlyReport<string>[] = [];
    await reader.load('admin', 'player/one', async () => 'saved', x => states.push(x));
    const read = vi.fn().mockRejectedValue(outage), pending = reader.load('admin', 'player/one', read, x => states.push(x), true);
    await vi.runAllTimersAsync(); await pending;
    expect(read).toHaveBeenCalledTimes(5); expect(states.at(-1)).toMatchObject({ kind: 'ready', data: 'saved', stale: true, refreshing: false, checkedAt: 100 });
    await reader.load('admin', 'player/one', async () => 'fresh', x => states.push(x));
    expect(states.at(-1)).toMatchObject({ data: 'fresh', stale: false });
  });
  it.each(['permission-denied', 'unauthenticated', 'failed-precondition', 'not-found'])('clears retained private evidence on %s', async code => {
    const reader = createReadOnlyReport<string>(), states: ReadOnlyReport<string>[] = [];
    await reader.load('admin', 'scope', async () => 'private', x => states.push(x));
    await reader.load('admin', 'scope', async () => { throw Object.assign(new Error('Access changed'), { code }); }, x => states.push(x));
    expect(states.at(-1)).toMatchObject({ kind: 'error', data: null, stale: false });
  });
  it('never retains another account, transferred scope, or late prior request', async () => {
    const reader = createReadOnlyReport<string>(), states: ReadOnlyReport<string>[] = [];
    await reader.load('admin', 'old-team/player', async () => 'old team', x => states.push(x));
    await reader.load('admin', 'new-team/player', async () => { throw outage; }, x => states.push(x));
    expect(states.at(-1)).toMatchObject({ data: null, kind: 'error' });
    let resolve!: (value: string) => void;
    const old = reader.load('admin', 'player', async () => new Promise<string>(done => { resolve = done; }), x => states.push(x));
    await reader.load('other', 'player', async () => 'other account', x => states.push(x));
    resolve('old account'); await old; expect(states.at(-1)).toMatchObject({ data: 'other account' });
    await reader.load(null, 'player', async () => 'never read', x => states.push(x));
    expect(states.at(-1)).toMatchObject({ data: null });
  });
  it('bounds visible refreshes and coalesces focus/visibility without hidden polling or pending overlap', () => {
    let now = 0; const refresh = vi.fn(), clock = createForegroundRefresh(() => now, refresh);
    now = 59_999; expect(clock.check(true, false)).toBe(false);
    now = 60_000; expect(clock.check(false, false)).toBe(false); expect(clock.check(true, true)).toBe(false);
    expect(clock.check(true, false)).toBe(true); expect(clock.check(true, false)).toBe(false);
    now = 120_000; clock.attempted(); expect(clock.check(true, false)).toBe(false);
    now = 180_000; expect(clock.check(true, false)).toBe(true); expect(refresh).toHaveBeenCalledTimes(2);
  });
});
describe('workout duration precision', () => {
  it.each([[725, '12.1 min'], [568, '9.5 min'], [497, '8.3 min'], [0, '0 min'], [3666, '61.1 min']])('matches notification rounding for %s seconds', (seconds, expected) => {
    expect(workoutMinutes(Number(seconds) / 60)).toBe(expected);
  });
  it('keeps invalid duration distinct from a recorded zero', () => {
    expect(workoutMinutes(NaN)).toBe('Not recorded'); expect(workoutMinutes(-1)).toBe('Not recorded');
  });
});
