import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn(), call: vi.fn(), queries: new Set<string>(), profiles: {} as Record<string, unknown>, reps: {} as Record<string, { id: string; data: Record<string, unknown> }[]> }));
vi.mock('../../../../lib/firebase', () => ({
  default: {},
  auth: { currentUser: { uid: 'staff-viewer' }, onAuthStateChanged: () => () => {} },
  db: { collection: () => ({ doc: (playerId: string) => ({ collection: (name: string) => name === 'insightSummaries'
    ? { doc: () => ({ get: async () => ({ exists: playerId in mocks.profiles, data: () => mocks.profiles[playerId] }) }) }
    : { where: (field: string, operation: string, value: string) => ({ get: async () => {
      mocks.queries.add(`${field} ${operation} '${value}'`);
      return { docs: (mocks.reps[playerId] || []).map(rep => ({ id: rep.id, data: () => rep.data })) };
    } }) } }) }) },
  cloud: { httpsCallable: (name: string) => (data: unknown) => mocks.call(name, data) },
}));
vi.mock('../../../../lib/organization-data', () => ({ getClubContext: mocks.context }));

import { clearReplayCache } from '../../lib/replay-cache';
import {
  CLUB_TESTS, athleteGender, clubPoints, cohortMembers, loadClubComparison, loadClubTest, profileBest, repLabel, reprocessedEvents, stationBests, stationEventBests, teamAgeGroup, teamGender,
} from './club-comparison';

describe('gender and age group', () => {
  it('reads the gender a team name carries, and nothing from a name with neither or both', () => {
    expect(teamGender('U11 Girls Premier — Vacaville')).toBe('girls');
    expect(teamGender('U14 Boys Premier')).toBe('boys');
    expect(teamGender('U19 Women')).toBe('girls');
    expect(teamGender('U12 Elite')).toBeNull();
    expect(teamGender('Boys & Girls Rec')).toBeNull();
    expect(teamGender(undefined)).toBeNull();
  });
  it('reads the age group a team name carries', () => {
    expect(teamAgeGroup('U11 Girls Premier')).toBe(11);
    expect(teamAgeGroup('u-9 boys')).toBe(9);
    expect(teamAgeGroup('Boys Elite')).toBeNull();
    expect(teamAgeGroup('U99 Boys')).toBeNull();
  });
  it("prefers the athlete's own recorded gender, then the team's; neither means unknown", () => {
    expect(athleteGender('Female', 'U11 Boys Elite')).toBe('girls');
    expect(athleteGender(undefined, 'U11 Boys Elite')).toBe('boys');
    expect(athleteGender(null, 'U12 Elite')).toBeNull();
  });
  it('compares with every athlete of the same gender, everyone when unknown, and always the athlete', () => {
    const teams = [{ id: 'b', name: 'U11 Boys' }, { id: 'g', name: 'U11 Girls' }, { id: 'x', name: 'U12 Elite' }];
    const players = [{ id: 'me', teamId: 'b' }, { id: 'boy', teamId: 'b' }, { id: 'girl', teamId: 'g' }, { id: 'other', teamId: 'x' }];
    expect(cohortMembers(teams, players, 'boys', 'me').map(p => p.id)).toEqual(['me', 'boy']);
    expect(cohortMembers(teams, players, 'girls', 'me').map(p => p.id)).toEqual(['me', 'girl']);
    expect(cohortMembers(teams, players, null, 'me').map(p => p.id)).toEqual(['me', 'boy', 'girl', 'other']);
  });
});

describe('best result per athlete', () => {
  const label = (playerId: string, repId: string, data: Record<string, unknown>) => repLabel(playerId, repId, { repType: 'dribbling', ...data });
  const labels = [
    label('a', '1', { testingEventId: 'new', protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }),
    label('a', '2', { testingEventId: 'new', protocolSide: 'right' }), // in the reprocessed event, value unchanged so not rewritten
    label('a', '3', { testingEventId: 'old', protocolSide: 'right' }), // an event the reprocessing never touched
    label('a', '4', { testingEventId: 'new', protocolSide: 'left', resultAlgorithmVersion: 'dribbling-1.3.2' }),
    label('b', '5', { testingEventId: 'new', protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }),
    label('b', '6', { testingEventId: 'new', protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }),
    label('b', '7', { testingEventId: 'new', protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }),
    label('c', '8', { testingEventId: 'new' }), // no course recorded: neither side
  ];
  const ok = { qualified: true, duplicate: false };
  const effective = new Map<string, unknown>([
    ['a/1', { totalTime: 7.9, resultStatus: ok }], ['a/2', { totalTime: 7.75, resultStatus: ok }], ['a/3', { totalTime: 6.1, resultStatus: ok }],
    ['a/4', { totalTime: 8.98, resultStatus: ok }], ['b/5', { totalTime: 7.5, resultStatus: ok }],
    ['b/6', { totalTime: 6.9, resultStatus: { qualified: false, duplicate: false } }], ['b/7', { totalTime: 6.8, resultStatus: { qualified: true, duplicate: true } }],
    ['c/8', { totalTime: 7, resultStatus: ok }],
  ]);

  it('knows the reprocessed events by their rewritten reps', () => {
    expect([...reprocessedEvents(labels)]).toEqual(['new']);
  });
  it('keeps the fastest qualified, non-duplicate result of a reprocessed event, each course on its own', () => {
    const events = reprocessedEvents(labels);
    expect([...stationBests(CLUB_TESTS.dribbleRight, labels, effective, events)]).toEqual([['a', 7.75], ['b', 7.5]]);
    expect([...stationBests(CLUB_TESTS.dribbleLeft, labels, effective, events)]).toEqual([['a', 8.98]]);
    expect([...stationBests(CLUB_TESTS.sprint, labels, effective, events)]).toEqual([]);
  });
  it("keeps the athlete's best on each testing event, from the same results", () => {
    const more = [...labels, label('a', '9', { testingEventId: 'later', protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }),
      label('a', '10', { testingEventId: 'later', protocolSide: 'right' })];
    const values = new Map<string, unknown>([...effective, ['a/9', { totalTime: 7.6, resultStatus: ok }], ['a/10', { totalTime: 7.9, resultStatus: ok }]]);
    const events = reprocessedEvents(more);
    expect(stationEventBests(CLUB_TESTS.dribbleRight, more, values, events, 'a')).toEqual([7.75, 7.6]);
    expect(stationBests(CLUB_TESTS.dribbleRight, more, values, events).get('a')).toBe(7.6);
    expect(stationEventBests(CLUB_TESTS.dribbleRight, more, values, events, 'b')).toEqual([7.5]);
    expect(stationEventBests(CLUB_TESTS.dribbleLeft, more, values, events, 'b')).toEqual([]);
  });
  it('reads a profile best in metres, and nothing malformed', () => {
    expect(profileBest({ version: 5, bests: { verticalJumpHeight: { value: 0.1764, unit: 'm' } } }, 'verticalJumpHeight')).toBe(0.1764);
    expect(profileBest({ version: 5, bests: { verticalJumpHeight: { value: 7, unit: 'in' } } }, 'verticalJumpHeight')).toBeNull();
    expect(profileBest({ version: 4, bests: { verticalJumpHeight: { value: 0.2, unit: 'm' } } }, 'verticalJumpHeight')).toBeNull();
    expect(profileBest(null, 'broadJumpDistance')).toBeNull();
  });
  it('shows values in the units of the Stats cards', () => {
    const shown = (id: string, value: number) => (value * CLUB_TESTS[id].display.scale).toFixed(CLUB_TESTS[id].display.digits) + ' ' + CLUB_TESTS[id].display.unit;
    expect(shown('jump', 0.1764)).toBe('6.9 in');
    expect(shown('broadJump', 1.1993)).toBe('3.9 ft');
    expect(shown('sprint', 2.6264)).toBe('2.63 s');
    expect(shown('dribbleLeft', 8.9795)).toBe('8.98 s');
  });
});

describe('points by age group', () => {
  it("places each athlete at their team's age group, and only athletes with a result", () => {
    const points = clubPoints(new Map([['me', 7.75], ['a', 7.5], ['b', 7.1], ['c', 8], ['d', 6.9], ['e', 7.3], ['lost', 7]]),
      [{ id: 'me', teamId: 'u11' }, { id: 'a', teamId: 'u11' }, { id: 'b', teamId: 'u11' }, { id: 'c', teamId: 'u11' }, { id: 'd', teamId: 'u11' }, { id: 'e', teamId: 'u14' }, { id: 'lost', teamId: 'none' }, { id: 'x', teamId: 'u11' }],
      new Map([['u11', 11], ['u14', 14], ['none', null]]));
    expect(points.map(p => p.playerId)).toEqual(['me', 'a', 'b', 'c', 'd', 'e', 'lost']);
    expect(points.find(point => point.playerId === 'e')).toEqual({ playerId: 'e', ageGroup: 14, value: 7.3 });
    expect(points.find(point => point.playerId === 'lost')!.ageGroup).toBeNull();
  });
});

describe('the staff loader', () => {
  const context = {
    role: 'admin', organization: { id: 'club', name: 'Vacaville United' },
    teams: [{ id: 't11', name: 'U11 Boys Elite' }, { id: 't14', name: 'U14 Boys Premier' }, { id: 't9', name: 'U9 Boys Academy' }, { id: 'g11', name: 'U11 Girls Premier' }],
    players: [{ id: 'me', teamId: 't11' }, { id: 'b1', teamId: 't11' }, { id: 'b2', teamId: 't14' }, { id: 'b3', teamId: 't9' }, { id: 'g1', teamId: 'g11' }],
  };
  const rep = (id: string, repType: string, testingEventId: string, extra: Record<string, unknown> = {}) => ({ id, data: { repType, testingEventId, ...extra } });
  const ok = { qualified: true, duplicate: false };
  beforeEach(() => {
    clearReplayCache();
    mocks.context.mockReset().mockResolvedValue(context);
    mocks.profiles = { me: { version: 5, bests: { verticalJumpHeight: { value: 0.1764, unit: 'm' } } }, b1: { version: 5, bests: { verticalJumpHeight: { value: 0.25, unit: 'm' } } },
      b3: { version: 5, bests: { verticalJumpHeight: { value: 0.2, unit: 'm' } } }, g1: { version: 5, bests: { verticalJumpHeight: { value: 0.3, unit: 'm' } } } };
    mocks.reps = {
      me: [rep('r1', 'dribbling', 'E1', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }), rep('r2', 'sprint', 'E1', { resultAlgorithmVersion: 'sprint-1.4.0' })],
      b1: [rep('r3', 'dribbling', 'E1', { protocolSide: 'right' })],
      b2: [rep('r4', 'dribbling', 'E2', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' }), rep('r5', 'sprint', 'E2', { resultAlgorithmVersion: 'sprint-1.4.0' })],
      b3: [rep('r6', 'dribbling', 'E0', { protocolSide: 'right' })],
      g1: [rep('r7', 'dribbling', 'E1', { protocolSide: 'right', resultAlgorithmVersion: 'dribbling-1.3.2' })],
    };
    mocks.call.mockReset().mockImplementation(async (_name: string, { teamId }: { teamId: string }) => ({ data: { athletes: {
      t11: [{ id: 'me', reps: [{ id: 'r1', totalTime: 7.75, resultStatus: ok }, { id: 'r2', totalTime: 2.63, resultStatus: ok }] }, { id: 'b1', reps: [{ id: 'r3', totalTime: 7.4, resultStatus: ok }] }],
      t14: [{ id: 'b2', reps: [{ id: 'r4', totalTime: 7.0, resultStatus: ok }, { id: 'r5', totalTime: 2.2, resultStatus: { qualified: true, duplicate: true } }] }],
    }[teamId] || [] } }));
  });
  const staff = { access: 'admin' as const, playerId: 'me', organizationId: 'club', teamId: 't11' };

  it("returns nothing for a player's own sign-in, and reads nothing", async () => {
    expect(await loadClubTest({ ...staff, access: 'athlete' }, 'dribbleRight')).toBeNull();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('joins the effective values to their events and courses, for the athlete\'s gender only', async () => {
    const dribble = await loadClubTest(staff, 'dribbleRight');
    expect(dribble).toMatchObject({ organizationName: 'Vacaville United', gender: 'boys', teamsOnly: false, incomplete: false });
    expect(dribble!.points).toEqual([{ playerId: 'me', ageGroup: 11, value: 7.75 }, { playerId: 'b1', ageGroup: 11, value: 7.4 }, { playerId: 'b2', ageGroup: 14, value: 7.0 }]);
    // Only teams with reprocessed station reps are asked for their effective results.
    expect(mocks.call.mock.calls.map(([name, data]) => [name, data])).toEqual([['getTeamLeaderboard', { teamId: 't11' }], ['getTeamLeaderboard', { teamId: 't14' }]]);
    expect((await loadClubTest(staff, 'sprint'))!.points).toEqual([{ playerId: 'me', ageGroup: 11, value: 2.63 }]);
    expect((await loadClubTest(staff, 'jump'))!.points.map(p => [p.playerId, p.value])).toEqual([['me', 0.1764], ['b1', 0.25], ['b3', 0.2]]);
    expect(dribble!.ownResults).toEqual([7.75]);
    expect((await loadClubTest(staff, 'jump'))!.ownResults).toEqual([0.1764]);
    // Switching tests reads nothing again; rep documents are read for station-testing reps only.
    expect(mocks.context).toHaveBeenCalledTimes(1);
    expect(mocks.call).toHaveBeenCalledTimes(2);
    expect([...mocks.queries]).toEqual(["testingEventId > ''"]);
  });

  it('turns the same results into statistics for the chart, in the units of the cards', async () => {
    const jump = await loadClubComparison(staff, 'jump');
    expect(jump).toMatchObject({ organizationName: 'Vacaville United', gender: 'boys', teamsOnly: false, incomplete: false });
    expect(jump!.stats).toMatchObject({ unit: 'in', higherIsBetter: true, athletes: 3, groups: [] });
    expect(jump!.stats.overall.mean).toBeCloseTo(((0.1764 + 0.25 + 0.2) / 3) * 39.37007874, 6);
    expect(jump!.stats.own!.ageGroup).toBe(11);
    expect(jump!.stats.own!.best).toBeCloseTo(6.944881, 5);
    expect(jump!.stats.own!.results).toHaveLength(1);
    expect(await loadClubComparison({ ...staff, access: 'athlete' }, 'jump')).toBeNull();
  });

  it('compares with everyone, and says so, when no gender is recorded', async () => {
    mocks.context.mockResolvedValue({ ...context, teams: context.teams.map(team => team.id === 't11' ? { ...team, name: 'U11 Elite' } : team) });
    const jump = await loadClubTest(staff, 'jump');
    expect(jump!.gender).toBeNull();
    expect(jump!.points.map(p => p.playerId)).toEqual(['me', 'b1', 'b3', 'g1']);
  });

  it('marks the result incomplete when a team cannot be read, and limits a coach to their teams', async () => {
    mocks.context.mockResolvedValue({ ...context, role: 'coach' });
    mocks.call.mockImplementation(async (_name: string, { teamId }: { teamId: string }) => { if (teamId === 't14') throw new Error('denied'); return { data: { athletes: [] } }; });
    const result = await loadClubTest({ ...staff, access: 'coach' }, 'dribbleRight');
    expect(result).toMatchObject({ teamsOnly: true, incomplete: true, points: [] });
  });
});
