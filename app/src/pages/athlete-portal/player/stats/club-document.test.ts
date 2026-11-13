import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(), call: vi.fn(), documentReads: 0,
  documents: {} as Record<string, unknown>, profiles: {} as Record<string, unknown>, reps: {} as Record<string, { id: string; data: Record<string, unknown> }[]>,
}));
vi.mock('../../../../lib/firebase', () => ({
  default: {},
  auth: { currentUser: { uid: 'viewer' }, onAuthStateChanged: () => () => {} },
  db: {
    collection: (name: string) => {
      if (name === 'benchmarks') {
        return { doc: (id: string) => ({ get: async () => { mocks.documentReads += 1; return { exists: id in mocks.documents, data: () => mocks.documents[id] }; } }) };
      }
      return { doc: (playerId: string) => ({ collection: (sub: string) => (sub === 'insightSummaries'
        ? { doc: () => ({ get: async () => ({ exists: playerId in mocks.profiles, data: () => mocks.profiles[playerId] }) }) }
        : { where: () => ({ get: async () => ({ docs: (mocks.reps[playerId] || []).map(rep => ({ id: rep.id, data: () => rep.data })) }) }) }) }) };
    },
  },
  cloud: { httpsCallable: (name: string) => (data: unknown) => mocks.call(name, data) },
}));
vi.mock('../../../../lib/organization-data', () => ({ getClubContext: mocks.context }));

import { clearReplayCache } from '../../lib/replay-cache';
import {
  DOCUMENT_TESTS, documentPlace, documentStats, documentValue, loadClubComparison, omittedEvents, ownDocumentResults, pacificDate, parseClubDocument, repLabel, watchClubComparison,
} from './club-comparison';
import type { ClubComparisonData } from './club-comparison';

const cohort = (mean: number, sd: number) => ({
  athletes: 32, overall: { count: 32, mean, sd },
  // The first group is under five athletes: never drawn.
  groups: [{ ageGroup: 9, count: 3, mean: mean - 0.3, sd }, { ageGroup: 11, count: 14, mean, sd }, { ageGroup: 12, count: 15, mean: mean + 0.2, sd }],
});
const cohorts = (mean: number, sd: number) => ({ boys: cohort(mean, sd), girls: cohort(mean - 0.1, sd), all: cohort(mean - 0.05, sd) });
const fixture = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1, kind: 'clubTestStats', organizationId: 'club', organizationName: 'Vacaville United', generatedAt: '2026-11-12T06:00:00Z', resultsThrough: '2026-11-10',
  teams: { t11: { gender: 'boys', ageGroup: 11 }, g12: { gender: 'girls', ageGroup: 12 }, x: { gender: null, ageGroup: null } },
  tests: {
    sprint: { measure: 'speedAt5m', unit: 'm/s', higherIsBetter: true, cohorts: cohorts(5, 0.4) },
    changeOfDirection: { measure: 'courseSpeed', unit: 'm/s', higherIsBetter: true, cohorts: cohorts(3.6, 0.3) },
    dribbleLeft: { measure: 'courseSpeed', unit: 'm/s', higherIsBetter: true, cohorts: cohorts(2.4, 0.25) },
    dribbleRight: { measure: 'courseSpeed', unit: 'm/s', higherIsBetter: true, cohorts: cohorts(2.5, 0.25) },
    jump: { measure: 'jumpHeight', unit: 'm', higherIsBetter: true, cohorts: cohorts(0.3, 0.05) },
    broadJump: { measure: 'broadJumpDistance', unit: 'm', higherIsBetter: true, cohorts: cohorts(1.6, 0.2) },
  },
  ...patch,
});

describe('the club statistics document', () => {
  it('reads a version-1 document, and nothing else', () => {
    const document = parseClubDocument(fixture())!;
    expect(Object.keys(document.tests).sort()).toEqual(['broadJump', 'changeOfDirection', 'dribbleLeft', 'dribbleRight', 'jump', 'sprint']);
    expect(document).toMatchObject({ organizationId: 'club', organizationName: 'Vacaville United', resultsThrough: '2026-11-10' });
    expect(document.teams.t11).toEqual({ gender: 'boys', ageGroup: 11 });
    expect(parseClubDocument(fixture({ schemaVersion: 2 }))).toBeNull();
    expect(parseClubDocument(fixture({ kind: 'other' }))).toBeNull();
    expect(parseClubDocument(fixture({ tests: 'none' }))).toBeNull();
    expect(parseClubDocument(null)).toBeNull();
  });
  it('drops a test whose measure, unit or direction is not the expected one, and a malformed cohort', () => {
    const raw = fixture();
    const tests = raw.tests as Record<string, any>;
    tests.sprint = { ...tests.sprint, measure: 'maxVelocity' };
    tests.changeOfDirection = { ...tests.changeOfDirection, higherIsBetter: false };
    tests.jump = { ...tests.jump, unit: 'in' };
    tests.dribbleLeft = { ...tests.dribbleLeft, cohorts: { ...tests.dribbleLeft.cohorts, boys: { athletes: 3, overall: { count: 3, mean: 'x', sd: 0 }, groups: [] } } };
    const document = parseClubDocument(raw)!;
    expect(Object.keys(document.tests).sort()).toEqual(['broadJump', 'dribbleLeft', 'dribbleRight']);
    expect(Object.keys(document.tests.dribbleLeft).sort()).toEqual(['all', 'girls']);
  });
  it("places the athlete by their own recorded gender, else their team's, at their team's age group", () => {
    const document = parseClubDocument(fixture())!;
    expect(documentPlace(document, { teamId: 't11', gender: undefined })).toEqual({ gender: 'boys', ageGroup: 11 });
    expect(documentPlace(document, { teamId: 't11', gender: 'Female' })).toEqual({ gender: 'girls', ageGroup: 11 });
    expect(documentPlace(document, { teamId: 'x', gender: null })).toEqual({ gender: null, ageGroup: null });
    expect(documentPlace(document, { teamId: 'missing', gender: null })).toEqual({ gender: null, ageGroup: null });
  });
  it('turns each test and cohort into the chart statistics, in display units, higher is better', () => {
    const document = parseClubDocument(fixture())!;
    const sprint = documentStats(document, 'sprint', { gender: 'boys' })!;
    expect(sprint.gender).toBe('boys');
    expect(sprint.stats).toMatchObject({ unit: 'mph', higherIsBetter: true, athletes: 32 });
    expect(sprint.stats.groups.map(group => group.ageGroup)).toEqual([11, 12]); // the group of three is left out
    expect(sprint.stats.groups[0].mean).toBeCloseTo(5 * 2.23694, 9);
    expect(sprint.stats.groups[0].sd).toBeCloseTo(0.4 * 2.23694, 9);
    expect(sprint.stats.overall).toEqual({ count: 32, mean: 5 * 2.23694, sd: 0.4 * 2.23694 });
    const dribble = documentStats(document, 'dribbleLeft', { gender: 'girls' })!;
    expect(dribble.stats).toMatchObject({ unit: 'm/s', higherIsBetter: true });
    expect(dribble.stats.overall.mean).toBeCloseTo(2.3, 9);
    expect(documentStats(document, 'dribbleRight', { gender: 'boys' })!.stats.overall.mean).toBeCloseTo(2.5, 9);
    expect(documentStats(document, 'changeOfDirection', { gender: null })!.stats.overall.mean).toBeCloseTo(3.55, 9); // everyone
    expect(documentStats(document, 'jump', { gender: 'boys' })!.stats).toMatchObject({ unit: 'in' });
    expect(documentStats(document, 'jump', { gender: 'boys' })!.stats.overall.mean).toBeCloseTo(0.3 * 39.37007874, 6);
    expect(documentStats(document, 'broadJump', { gender: 'boys' })!.stats.overall.mean).toBeCloseTo(1.6 * 3.28084, 6);
    expect(documentStats(document, 'unknownTest', { gender: 'boys' })).toBeNull();
    // A known gender whose cohort is missing is not silently shown as everyone.
    const raw = fixture();
    delete (raw.tests as Record<string, any>).sprint.cohorts.boys;
    expect(documentStats(parseClubDocument(raw)!, 'sprint', { gender: 'boys' })).toBeNull();
  });
});

describe("the athlete's own results in the document's measures", () => {
  const ok = { qualified: true, duplicate: false };
  const at = (iso: string) => Date.parse(iso);
  const label = (repId: string, repType: string, eventId: string, side?: string) => repLabel('me', repId, { repType, testingEventId: eventId, ...(side ? { protocolSide: side } : {}) });
  const labels = [
    label('s1', 'sprint', 'E1'), label('s2', 'sprint', 'E1'), label('s3', 'sprint', 'E2'), label('s4', 'sprint', 'E3'), label('s5', 'sprint', 'E1'),
    label('d1', 'dribbling', 'E1', 'left'), label('d2', 'dribbling', 'E1', 'right'), label('d3', 'dribbling', 'E2', 'left'),
    label('c1', 'changeOfDirection', 'E1'),
  ];
  const velocityAt5m = new Map([['s1', 5.1], ['s2', 5.4], ['s3', 5.0], ['s4', 6.5], ['s5', 7.0]]);
  const effective = [
    { id: 's1', resultStatus: ok, createdAtMillis: at('2026-11-04T18:00:00Z') },
    { id: 's2', resultStatus: ok, createdAtMillis: at('2026-11-04T18:05:00Z') },
    { id: 's3', resultStatus: ok, createdAtMillis: at('2026-11-11T07:30:00Z') }, // Nov 10, 11:30 pm Pacific: included
    { id: 's4', resultStatus: ok, createdAtMillis: at('2026-11-11T09:00:00Z') }, // Nov 11, 1 am Pacific: after resultsThrough
    { id: 's5', resultStatus: { qualified: true, duplicate: true }, createdAtMillis: at('2026-11-04T18:10:00Z') },
    { id: 'd1', totalTime: 8, markerDistance: 10, resultStatus: ok, createdAtMillis: at('2026-11-04T18:00:00Z') },
    { id: 'd2', totalTime: 8, markerDistance: 9, resultStatus: ok, createdAtMillis: at('2026-11-04T18:00:00Z') },
    { id: 'd3', totalTime: 6, markerDistance: 7, resultStatus: { qualified: false, duplicate: false }, createdAtMillis: at('2026-11-05T18:00:00Z') },
    { id: 'c1', totalTime: 5, markerDistance: 9.5, resultStatus: ok, createdAtMillis: at('2026-11-04T18:00:00Z') },
    { id: 'other', totalTime: 4, markerDistance: 9, resultStatus: ok, createdAtMillis: at('2026-11-04T18:00:00Z') }, // no station label
  ];
  const own = { labels, velocityAt5m, effective, profile: { version: 5, bests: { verticalJumpHeight: { value: 0.3, unit: 'm' } } } };

  it('reads the Pacific calendar day', () => {
    expect(pacificDate(at('2026-11-11T07:30:00Z'))).toBe('2026-11-10');
    expect(pacificDate(at('2026-11-11T09:00:00Z'))).toBe('2026-11-11');
  });
  it('sprint: speed at 5 m of each qualified, non-duplicate rep, best per testing event, up to resultsThrough', () => {
    const sprint = ownDocumentResults('sprint', 'me', own, '2026-11-10', 11)!;
    expect(sprint.ageGroup).toBe(11);
    expect(sprint.results).toEqual([5.4 * 2.23694, 5.0 * 2.23694]); // E1's best (the duplicate's 7.0 left out), E2; E3 is after the cut
    expect(sprint.best).toBe(5.4 * 2.23694);
    expect(ownDocumentResults('sprint', 'me', own, null, 11)!.best).toBe(6.5 * 2.23694); // no cut stated
  });
  it('course speed: 2 × marker distance ÷ time, each dribble course on its own', () => {
    expect(ownDocumentResults('dribbleLeft', 'me', own, '2026-11-10', 11)).toEqual({ ageGroup: 11, best: 2.5, results: [2.5] }); // d3 not qualified
    expect(ownDocumentResults('dribbleRight', 'me', own, '2026-11-10', 11)).toEqual({ ageGroup: 11, best: 2.25, results: [2.25] });
    expect(ownDocumentResults('changeOfDirection', 'me', own, '2026-11-10', 11)).toEqual({ ageGroup: 11, best: 3.8, results: [3.8] });
    expect(ownDocumentResults('changeOfDirection', 'me', { ...own, effective: [{ id: 'c1', totalTime: 5, resultStatus: ok, createdAtMillis: at('2026-11-04T18:00:00Z') }] }, null, 11)).toBeNull();
  });
  it('leaves out the testing events the club left out for this athlete’s group, and only for that group and test', () => {
    const raw = fixture();
    (raw.tests as Record<string, any>).changeOfDirection.omitted = [
      { gender: 'boys', ageGroup: 12, eventIds: ['E1', '', 7] }, { gender: 'neither', ageGroup: 12, eventIds: ['E9'] }, { gender: 'girls', ageGroup: 8, eventIds: [] }, 'nonsense'];
    const document = parseClubDocument(raw)!;
    expect(document.omitted).toEqual({ changeOfDirection: [{ gender: 'boys', ageGroup: 12, eventIds: ['E1'] }] });
    expect([...omittedEvents(document, 'changeOfDirection', { gender: 'boys', ageGroup: 12 })]).toEqual(['E1']);
    for (const place of [{ gender: 'boys' as const, ageGroup: 11 }, { gender: 'girls' as const, ageGroup: 12 }, { gender: null, ageGroup: 12 }]) expect(omittedEvents(document, 'changeOfDirection', place).size).toBe(0);
    expect(omittedEvents(document, 'dribbleLeft', { gender: 'boys', ageGroup: 12 }).size).toBe(0);
    expect(parseClubDocument(fixture())!.omitted).toEqual({});
    // The athlete's only shuttle result is from the left-out event: no marker, rather than one set against a curve it is not in.
    expect(ownDocumentResults('changeOfDirection', 'me', own, '2026-11-10', 12, new Set(['E1']))).toBeNull();
    expect(ownDocumentResults('sprint', 'me', own, '2026-11-10', 12, new Set(['E1']))!.results).toEqual([5.0 * 2.23694]); // E2 stays
  });
  it('jumps: the profile best in display units; nothing without a result', () => {
    expect(ownDocumentResults('jump', 'me', own, '2026-11-10', 11)!.best).toBeCloseTo(0.3 * 39.37007874, 6);
    expect(ownDocumentResults('broadJump', 'me', own, '2026-11-10', 11)).toBeNull();
  });
  it('values one result as the document measures it', () => {
    expect(documentValue(DOCUMENT_TESTS.sprint, { totalTime: 2 }, 5.2)).toBe(5.2);
    expect(documentValue(DOCUMENT_TESTS.sprint, { totalTime: 2 }, undefined)).toBeNull(); // never the time or the peak speed
    expect(documentValue(DOCUMENT_TESTS.changeOfDirection, { totalTime: 5, courseLengthMeters: 10, markerDistance: 9 }, undefined)).toBe(4);
    expect(documentValue(DOCUMENT_TESTS.changeOfDirection, { totalTime: 5, courseDistanceMeters: 10 }, undefined)).toBe(4);
    expect(documentValue(DOCUMENT_TESTS.dribbleLeft, { totalTime: 0, markerDistance: 9 }, undefined)).toBeNull();
    expect(documentValue(DOCUMENT_TESTS.jump, { totalTime: 5, markerDistance: 9 }, undefined)).toBeNull();
  });
});

describe('where the chart comes from', () => {
  const ok = { qualified: true, duplicate: false };
  const player = { access: 'athlete' as const, playerId: 'me', organizationId: 'club', teamId: 't11' };
  const staff = { ...player, access: 'admin' as const };
  const ownEffective = () => [{ id: 's1', resultStatus: ok, createdAtMillis: Date.parse('2026-11-04T18:00:00Z') }];
  const watch = async (viewer: typeof player | typeof staff, metricId: string) => {
    const shown: (ClubComparisonData | null)[] = [];
    await watchClubComparison(viewer, metricId, ownEffective, data => shown.push(data));
    return shown;
  };
  beforeEach(() => {
    clearReplayCache();
    mocks.documentReads = 0;
    mocks.documents = { 'club-club': fixture() };
    mocks.profiles = {};
    mocks.reps = { me: [{ id: 's1', data: { repType: 'sprint', testingEventId: 'E1', velocityAt5m: 5.3 } }] };
    mocks.context.mockReset().mockResolvedValue({ role: 'admin', organization: { id: 'club', name: 'Fallback Club' }, teams: [], players: [] });
    mocks.call.mockReset().mockResolvedValue({ data: { reps: [] } });
  });

  it("draws a player's own view from the document, with no club context and no other athlete read", async () => {
    const [sprint] = await watch(player, 'sprint');
    expect(sprint).toMatchObject({ organizationName: 'Vacaville United', gender: 'boys', teamsOnly: false, incomplete: false, measureLabel: 'Speed at 5 m', display: { unit: 'mph', digits: 1 } });
    expect(sprint!.stats).toMatchObject({ unit: 'mph', higherIsBetter: true, athletes: 32 });
    expect(sprint!.stats.own).toEqual({ ageGroup: 11, best: 5.3 * 2.23694, results: [5.3 * 2.23694] });
    const [dribble] = await watch(player, 'dribbleLeft');
    expect(dribble).toMatchObject({ measureLabel: 'Course speed', display: { unit: 'm/s', digits: 2 } });
    expect(dribble!.stats.own).toBeNull();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.documentReads).toBe(1); // one read, shared by every test
  });

  it('falls back to the staff reads without the document, and shows a player nothing', async () => {
    mocks.documents = {};
    expect(await watch(player, 'sprint')).toEqual([null]);
    expect(mocks.context).not.toHaveBeenCalled();
    const [fallback] = await watch(staff, 'sprint');
    expect(fallback).toMatchObject({ organizationName: 'Fallback Club', stats: { unit: 's', higherIsBetter: false } });
    expect(fallback!.measureLabel).toBeUndefined();
    expect(mocks.context).toHaveBeenCalledTimes(1);
  });

  it('treats a malformed document, or one without the test, as absent', async () => {
    mocks.documents = { 'club-club': { ...fixture(), schemaVersion: 'one' } };
    expect(await watch(player, 'sprint')).toEqual([null]);
    clearReplayCache();
    const raw = fixture();
    delete (raw.tests as Record<string, unknown>).sprint;
    mocks.documents = { 'club-club': raw };
    expect(await watch(player, 'sprint')).toEqual([null]);
    expect((await watch(player, 'jump'))[0]).toMatchObject({ stats: { unit: 'in' } });
    mocks.documents = { 'club-club': { ...fixture(), organizationId: 'another-club' } };
    clearReplayCache();
    expect(await watch(player, 'jump')).toEqual([null]);
  });

  it('answers loadClubComparison from the document too', async () => {
    const sprint = await loadClubComparison(player, 'sprint', ownEffective);
    expect(sprint!.stats.own!.best).toBeCloseTo(5.3 * 2.23694, 9);
    mocks.documents = {};
    clearReplayCache();
    expect(await loadClubComparison(player, 'sprint')).toBeNull();
  });
});
