import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The kept (localStorage) club statistics and the athlete's own results computed beside them.
const mocks = vi.hoisted(() => ({ context: vi.fn(), call: vi.fn(), reads: [] as string[], profiles: {} as Record<string, unknown>, reps: {} as Record<string, { id: string; data: Record<string, unknown> }[]> }));
vi.mock('../../../../lib/firebase', () => ({
  default: {},
  auth: { currentUser: { uid: 'staff-viewer' }, onAuthStateChanged: () => () => {} },
  db: { collection: () => ({ doc: (playerId: string) => ({ collection: (name: string) => name === 'insightSummaries'
    ? { doc: () => ({ get: async () => { mocks.reads.push(`profile ${playerId}`); return { exists: playerId in mocks.profiles, data: () => mocks.profiles[playerId] }; } }) }
    : { where: () => ({ get: async () => {
      mocks.reads.push(`reps ${playerId}`);
      return { docs: (mocks.reps[playerId] || []).map(rep => ({ id: rep.id, data: () => rep.data })) };
    } }) } }) }) },
  cloud: { httpsCallable: (name: string) => (data: unknown) => mocks.call(name, data) },
}));
vi.mock('../../../../lib/organization-data', () => ({ getClubContext: mocks.context }));

import { clearReplayCache } from '../../lib/replay-cache';
import {
  CLUB_STATS_MAX_AGE_MS, CLUB_STATS_REFRESH_MS, CLUB_STATS_VERSION, CLUB_TESTS, keptAge, keptPlace, keptTeamsKey, keptTestKey, keptTestOf, limitedRetry,
  loadClubComparison, ownClubResults, parseKeptTeams, parseKeptTest, repLabel, watchClubComparison,
} from './club-comparison';
import type { ClubComparisonData } from './club-comparison';

const NOW = 1_800_000_000_000;

describe('keys and age', () => {
  it('keys a record by version, signed-in account, club, gender cohort and test, never by athlete', () => {
    const key = keptTestKey('staff', 'club', 'girls', 'sprint');
    expect(key).toBe(`posetek.clubStats:v${CLUB_STATS_VERSION}:staff:club:girls:sprint`);
    expect(new Set([key, keptTestKey('other', 'club', 'girls', 'sprint'), keptTestKey('staff', 'club2', 'girls', 'sprint'),
      keptTestKey('staff', 'club', 'boys', 'sprint'), keptTestKey('staff', 'club', null, 'sprint'), keptTestKey('staff', 'club', 'girls', 'jump')]).size).toBe(6);
    expect(keptTeamsKey('staff', 'club')).toBe(`posetek.clubStats:v${CLUB_STATS_VERSION}:staff:club:teams`);
  });
  it('is fresh, then stale (shown and refreshed), then too old to show', () => {
    expect(keptAge(NOW - 1000, NOW)).toBe('fresh');
    expect(keptAge(NOW - CLUB_STATS_REFRESH_MS, NOW)).toBe('stale');
    expect(keptAge(NOW - CLUB_STATS_MAX_AGE_MS + 1, NOW)).toBe('stale');
    expect(keptAge(NOW - CLUB_STATS_MAX_AGE_MS, NOW)).toBeNull();
    expect(keptAge(NOW + 5 * 60_000, NOW)).toBeNull(); // from a clock far ahead
    expect(keptAge('soon', NOW)).toBeNull();
  });
});

describe('what is kept', () => {
  const data: ClubComparisonData = {
    organizationName: 'Vacaville United', gender: 'girls', teamsOnly: false, incomplete: false,
    stats: { unit: 's', higherIsBetter: false, athletes: 12, groups: [{ ageGroup: 11, count: 6, mean: 7.5, sd: 0.4, extra: 'x' } as never], overall: { count: 12, mean: 7.4, sd: 0.5 },
      own: { ageGroup: 11, best: 7.1, results: [7.1, 7.3] } },
  };
  it('keeps statistics only: never the athlete\'s own results or any other field', () => {
    const kept = keptTestOf(data, ['E1'], NOW);
    expect(kept).toEqual({ version: CLUB_STATS_VERSION, savedAt: NOW, organizationName: 'Vacaville United', gender: 'girls', teamsOnly: false, incomplete: false,
      stats: { unit: 's', higherIsBetter: false, athletes: 12, groups: [{ ageGroup: 11, count: 6, mean: 7.5, sd: 0.4 }], overall: { count: 12, mean: 7.4, sd: 0.5 } }, events: ['E1'] });
    expect(JSON.stringify(kept)).not.toContain('7.1');
  });
  it('reads back what it kept, and nothing malformed, of another version or too old', () => {
    const kept = JSON.parse(JSON.stringify(keptTestOf(data, ['E1'], NOW)));
    expect(parseKeptTest(kept, NOW + 1000)).toEqual(kept);
    expect(parseKeptTest({ ...kept, version: CLUB_STATS_VERSION + 1 }, NOW)).toBeNull();
    expect(parseKeptTest(kept, NOW + CLUB_STATS_MAX_AGE_MS)).toBeNull();
    expect(parseKeptTest({ ...kept, stats: { ...kept.stats, groups: [{ ageGroup: 11, count: 'six', mean: 7, sd: 0 }] } }, NOW)).toBeNull();
    expect(parseKeptTest({ ...kept, events: [3] }, NOW)).toBeNull();
    expect(parseKeptTest({ ...kept, gender: 'other' }, NOW)).toBeNull();
    expect(parseKeptTest(null, NOW)).toBeNull();
    expect(parseKeptTeams({ version: CLUB_STATS_VERSION, savedAt: NOW, teams: [{ id: 't', name: 'U11 Girls' }, { id: 5 }] }, NOW)!.teams).toEqual([{ id: 't', name: 'U11 Girls' }]);
  });
  it('places the athlete from the kept team list as a full load would', () => {
    const teams = [{ id: 'g11', name: 'U11 Girls Premier' }, { id: 'b14', name: 'U14 Boys' }];
    expect(keptPlace(teams, { teamId: 'g11', gender: undefined })).toEqual({ gender: 'girls', ageGroup: 11, outside: false });
    expect(keptPlace(teams, { teamId: 'b14', gender: 'Female' })).toEqual({ gender: 'girls', ageGroup: 14, outside: true });
    expect(keptPlace(teams, { teamId: 'gone', gender: undefined })).toEqual({ gender: null, ageGroup: null, outside: false });
  });
});

describe('limited concurrency with one retry', () => {
  it('never runs more than the limit at once and retries a failure once', async () => {
    const run = limitedRetry(2);
    let active = 0, peak = 0, attempts = 0;
    const task = (fail: boolean) => () => { attempts += 1; active += 1; peak = Math.max(peak, active);
      return new Promise<number>((resolve, reject) => setTimeout(() => { active -= 1; if (fail) reject(new Error('500')); else resolve(1); }, 1)); };
    let failedOnce = false;
    const results = await Promise.allSettled([run(task(false)), run(task(false)), run(task(false)), run(() => { if (!failedOnce) { failedOnce = true; return task(true)(); } return task(false)(); }), run(task(true))]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'rejected']);
    expect(attempts).toBe(3 + 2 + 2);
  });
});

describe('the Stats page loader with kept statistics', () => {
  const context = {
    role: 'admin', organization: { id: 'club', name: 'Vacaville United' },
    teams: [{ id: 't11', name: 'U11 Boys Elite' }, { id: 't14', name: 'U14 Boys Premier' }, { id: 'g11', name: 'U11 Girls Premier' }],
    players: [{ id: 'me', teamId: 't11' }, { id: 'b1', teamId: 't11' }, { id: 'b2', teamId: 't14' }, { id: 'g1', teamId: 'g11' }],
  };
  const ok = { qualified: true, duplicate: false };
  const rep = (id: string, repType: string, testingEventId: string, extra: Record<string, unknown> = {}) => ({ id, data: { repType, testingEventId, ...extra } });
  const effectiveRows: Record<string, { id: string; totalTime: number; resultStatus: unknown }[]> = {
    // r1 is in E1, newly processed because b1's rep there was rewritten; r8 is on a later reprocessed day.
    me: [{ id: 'r1', totalTime: 7.75, resultStatus: ok }, { id: 'r8', totalTime: 7.6, resultStatus: ok }, { id: 'r2', totalTime: 2.63, resultStatus: ok }],
    b1: [{ id: 'r3', totalTime: 7.4, resultStatus: ok }], b2: [{ id: 'r4', totalTime: 7.0, resultStatus: ok }], g1: [{ id: 'r7', totalTime: 9, resultStatus: ok }],
  };
  let store: Map<string, string>;
  beforeEach(() => {
    clearReplayCache();
    mocks.reads = [];
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); }, key: (index: number) => [...store.keys()][index] ?? null, get length() { return store.size; } });
    mocks.context.mockReset().mockResolvedValue(context);
    mocks.profiles = { me: { version: 5, bests: { verticalJumpHeight: { value: 0.1764, unit: 'm' } } }, b1: { version: 5, bests: { verticalJumpHeight: { value: 0.25, unit: 'm' } } } };
    mocks.reps = {
      me: [rep('r1', 'dribbling', 'E1', { protocolSide: 'right' }), rep('r8', 'dribbling', 'E3', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }),
        rep('r2', 'sprint', 'E1')],
      b1: [rep('r3', 'dribbling', 'E1', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' })],
      b2: [rep('r4', 'dribbling', 'E2', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' })],
      g1: [rep('r7', 'dribbling', 'E1', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' })],
    };
    mocks.call.mockReset().mockImplementation(async (_name: string, { playerId }: { playerId: string }) => ({ data: { reps: effectiveRows[playerId] || [] } }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const staff = { access: 'admin' as const, playerId: 'me', organizationId: 'club', teamId: 't11' };
  const watch = async (viewer: typeof staff, metricId: string, own = effectiveRows[viewer.playerId] || []) => {
    const shown: (ClubComparisonData | null)[] = [];
    await watchClubComparison(viewer, metricId, () => own, data => shown.push(data));
    return shown;
  };

  it("computes the athlete's own dot from their own reads exactly as the full load does", async () => {
    for (const metricId of ['dribbleRight', 'sprint', 'jump']) {
      clearReplayCache();
      const full = await loadClubComparison(staff, metricId);
      const labels = mocks.reps.me.map(entry => repLabel('me', entry.id, entry.data));
      // The club's newly processed events: E1 (b1's rewritten rep), E2, E3.
      const own = ownClubResults(CLUB_TESTS[metricId], 'me', { labels, effective: effectiveRows.me, events: ['E1', 'E2'], profile: mocks.profiles.me }, 11);
      expect(own).toEqual(full!.stats.own);
    }
    expect(ownClubResults(CLUB_TESTS.dribbleRight, 'me', { labels: [], effective: [], events: [], profile: null }, 11)).toBeNull();
  });

  it('keeps statistics after a full load, then shows them at once for another athlete of the same club and gender', async () => {
    const first = await watch(staff, 'dribbleRight');
    expect(first).toHaveLength(1);
    expect(first[0]!.stats.athletes).toBe(3);
    const kept = [...store.entries()];
    expect(kept.map(([key]) => key).sort()).toEqual([keptTeamsKey('staff-viewer', 'club'), keptTestKey('staff-viewer', 'club', 'boys', 'dribbleRight')].sort());
    // Nothing kept names or values an athlete.
    for (const [, value] of kept) for (const forbidden of ['"me"', '"b1"', '"b2"', '"g1"', 'r1', '7.75', '7.4']) expect(value).not.toContain(forbidden);

    // A new page (memory gone): another boy, b1, is shown from the kept statistics with only his own reads.
    clearReplayCache();
    mocks.context.mockClear(); mocks.call.mockClear(); mocks.reads = [];
    const second = await watch({ ...staff, playerId: 'b1' }, 'dribbleRight');
    expect(second).toHaveLength(1);
    expect(second[0]!.stats).toMatchObject({ athletes: 3, groups: first[0]!.stats.groups, overall: first[0]!.stats.overall });
    expect(second[0]!.stats.own).toEqual({ ageGroup: 11, best: 7.4, results: [7.4] });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual(['reps b1']);
  });

  it('shows stale statistics at once and replaces them with a background refresh', async () => {
    await watch(staff, 'jump');
    clearReplayCache();
    vi.useFakeTimers({ now: Date.now() + CLUB_STATS_REFRESH_MS + 1000, toFake: ['Date'] });
    mocks.profiles.b1 = { version: 5, bests: { verticalJumpHeight: { value: 0.3, unit: 'm' } } };
    const shown = await watch(staff, 'jump');
    expect(shown).toHaveLength(2);
    expect(shown[0]!.stats.overall.mean).toBeCloseTo(((0.1764 + 0.25) / 2) * 39.37007874, 6);
    expect(shown[1]!.stats.overall.mean).toBeCloseTo(((0.1764 + 0.3) / 2) * 39.37007874, 6);
    expect(shown[0]!.stats.own).toEqual(shown[1]!.stats.own);
    // The refreshed statistics are kept in turn.
    expect(parseKeptTest(JSON.parse(store.get(keptTestKey('staff-viewer', 'club', 'boys', 'jump'))!), Date.now())!.stats.overall.mean).toBeCloseTo(shown[1]!.stats.overall.mean, 9);
  });

  it('does not replace complete kept statistics with an incomplete refresh', async () => {
    await watch(staff, 'dribbleRight');
    clearReplayCache();
    vi.useFakeTimers({ now: Date.now() + CLUB_STATS_REFRESH_MS + 1000, toFake: ['Date'] });
    mocks.call.mockImplementation(async (_name: string, { playerId }: { playerId: string }) => { if (playerId === 'b2') throw new Error('internal'); return { data: { reps: effectiveRows[playerId] || [] } }; });
    const shown = await watch(staff, 'dribbleRight');
    expect(shown).toHaveLength(1);
    expect(shown[0]!.incomplete).toBe(false);
    expect(parseKeptTest(JSON.parse(store.get(keptTestKey('staff-viewer', 'club', 'boys', 'dribbleRight'))!), Date.now())!.incomplete).toBe(false);
  });

  it('works the same when storage throws or is missing', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const shown = await watch(staff, 'dribbleRight');
    expect(shown).toHaveLength(1);
    expect(shown[0]!.stats.athletes).toBe(3);
    vi.stubGlobal('localStorage', undefined);
    clearReplayCache();
    expect(await watch(staff, 'jump')).toHaveLength(1);
  });

  it("shows nothing for a player's own sign-in and reads nothing", async () => {
    expect(await watch({ ...staff, access: 'athlete' as never }, 'jump')).toEqual([null]);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual([]);
  });
});
