/* eslint-disable @typescript-eslint/no-explicit-any */
// The club comparison under the pose player on Stats (Nolan, 2026-11-11): where the athlete sits
// among every athlete of their club and gender for the picked test, one best result each, drawn
// as the club's average and spread by age group (ClubCloudChart.tsx, maths in club-cloud.ts). The
// chart receives statistics only (`ClubStats`); here they are computed from the staff reads below
// until a backend callable returns them (`loadClubComparison`). No other athlete is identified.
//
// Where the values come from (both are the server's corrected readers, never a rep's own fields):
// - Sprint, shuttle run and both dribble courses: the newly processed station results only. A
//   station testing event is newly processed when the Vacaville reprocessing rewrote reps in it
//   (they carry `resultAlgorithmVersion`); every rep of that event counts, including the few whose
//   values did not change and so were not rewritten. The values are the effective results the
//   `getTeamLeaderboard` callable returns (backend effective-results.js: qualified, non-duplicate,
//   evidence-checked); the rep documents only say which event and which course (protocolSide)
//   each rep belongs to, because the callable leaves those out.
// - Vertical and broad jump: each athlete's best on their player insight profile
//   (`players/{id}/insightSummaries/profile`, "player insight v5"), which the Insights rebuild
//   writes from the same qualification plus any published corrections.
//
// Staff only (admin, manager, coach): those reads are refused to a player. A player's own view
// needs a backend endpoint returning these values without identities; until one exists the
// loader returns nothing for a player.

import { cloud, db } from '../../../../lib/firebase';
import { getClubContext } from '../../../../lib/organization-data';
import { genderOf } from '../../../admin/lib/ageCurve';
import { DRILLS } from '../../lib/drills';
import type { Access } from '../../lib/loaders';
import { remember } from '../../lib/replay-cache';
import { clubStats } from './club-cloud';
import type { ClubStats } from './club-cloud';

export type ClubDisplay = { unit: string; scale: number; digits: number };
export type ClubTest = {
  drill: 'dribbling' | 'sprint' | 'changeOfDirection' | 'jump' | 'broadJump';
  /** `station`: the newly processed station results; `profile`: the athlete's profile best. */
  source: 'station' | 'profile';
  /** The dribble course (the rep's `protocolSide`). */
  side?: 'left' | 'right';
  /** The profile metric (`athlete-profile-spec.json`), for the jumps. */
  metric?: 'verticalJumpHeight' | 'broadJumpDistance';
  higherIsBetter: boolean;
  /** From the stored value (seconds or metres) to the units the Stats cards show. */
  display: ClubDisplay;
};

const SECONDS: ClubDisplay = { unit: 's', scale: 1, digits: 2 };

/** The report's tests (`getAthleteTestReport`), in the units its cards show. */
export const CLUB_TESTS: Record<string, ClubTest> = {
  dribbleLeft: { drill: 'dribbling', source: 'station', side: 'left', higherIsBetter: false, display: SECONDS },
  dribbleRight: { drill: 'dribbling', source: 'station', side: 'right', higherIsBetter: false, display: SECONDS },
  sprint: { drill: 'sprint', source: 'station', higherIsBetter: false, display: SECONDS },
  changeOfDirection: { drill: 'changeOfDirection', source: 'station', higherIsBetter: false, display: SECONDS },
  jump: { drill: 'jump', source: 'profile', metric: 'verticalJumpHeight', higherIsBetter: true, display: { unit: 'in', scale: 39.37007874, digits: 1 } },
  broadJump: { drill: 'broadJump', source: 'profile', metric: 'broadJumpDistance', higherIsBetter: true, display: { unit: 'ft', scale: 3.28084, digits: 1 } },
};
const STATION_DRILLS = new Set(['sprint', 'changeOfDirection', 'dribbling']);

// MARK: - Gender and age group

export type Gender = 'boys' | 'girls';
export const GENDER_LABEL: Record<Gender, string> = { boys: 'Boys', girls: 'Girls' };

/**
 * No Vacaville player or team document records a gender (checked 2026-11-11: 0 of 283 players, 0 of
 * 28 teams); every team name does ("U11 Girls Premier"). A name naming both, or neither, says nothing.
 */
export function teamGender(name: unknown): Gender | null {
  const text = typeof name === 'string' ? name : '';
  const girls = /\b(girls?|women|womens|female)\b/i.test(text), boys = /\b(boys?|men|mens|male)\b/i.test(text);
  return girls === boys ? null : girls ? 'girls' : 'boys';
}

/** The age group a team name carries ("U11 …" → 11), or null. */
export function teamAgeGroup(name: unknown): number | null {
  const match = typeof name === 'string' ? name.match(/\bU-?(\d{1,2})\b/i) : null;
  const group = match ? Number(match[1]) : NaN;
  return group >= 5 && group <= 23 ? group : null;
}

/** The athlete's own recorded gender (read as the phone reads it), else their team's. */
export function athleteGender(recorded: unknown, teamName: unknown): Gender | null {
  const own = genderOf({ gender: recorded });
  return own === 'male' ? 'boys' : own === 'female' ? 'girls' : teamGender(teamName);
}

export type ClubTeamInfo = { id: string; gender: Gender | null; ageGroup: number | null };
export type ClubMember = { id: string; teamId: string };

/**
 * The athletes compared with this one: every athlete on a team of the same gender, or everyone when
 * the gender is unknown. The athlete is always included, even on a team whose name says otherwise.
 */
export function cohortMembers(teams: { id: string; name: string }[], players: ClubMember[], gender: Gender | null, ownId: string): ClubMember[] {
  const included = new Set(teams.filter(team => !gender || teamGender(team.name) === gender).map(team => team.id));
  return players.filter(player => included.has(player.teamId) || player.id === ownId);
}

// MARK: - Values

export type RepLabel = { playerId: string; repId: string; drill: string | null; eventId: string | null; side: string | null; rewritten: boolean };

const drillOf = (data: any): string | null => {
  const type = data?.repType || data?.drillType;
  return DRILLS.find(drill => drill.types.includes(type))?.key ?? null;
};
const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** What a rep document says about where a result belongs; none of its values are used. */
export function repLabel(playerId: string, repId: string, data: any): RepLabel {
  return { playerId, repId, drill: drillOf(data), eventId: text(data?.testingEventId), side: text(data?.protocolSide), rewritten: Boolean(text(data?.resultAlgorithmVersion)) };
}

/** The testing events the reprocessing rewrote: those holding at least one rewritten rep. */
export function reprocessedEvents(labels: RepLabel[]): Set<string> {
  return new Set(labels.filter(label => label.rewritten && label.eventId).map(label => label.eventId!));
}

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Every station result that counts for one test: reps of a newly processed event, on the test's
 * course, that the effective reader returned as qualified and not a duplicate. `effective` is keyed
 * `${playerId}/${repId}`.
 */
function stationResults(test: ClubTest, labels: RepLabel[], effective: Map<string, any>, events: Set<string>): { playerId: string; eventId: string; value: number }[] {
  return labels.flatMap(label => {
    if (label.drill !== test.drill || !label.eventId || !events.has(label.eventId) || (test.side && label.side !== test.side)) return [];
    const rep = effective.get(`${label.playerId}/${label.repId}`);
    if (!rep || rep.resultStatus?.qualified !== true || rep.resultStatus?.duplicate === true || !positive(rep.totalTime)) return [];
    return [{ playerId: label.playerId, eventId: label.eventId, value: rep.totalTime as number }];
  });
}

/** The best of each group of results, in first-seen order. */
function bestBy(results: { value: number }[], key: (index: number) => string, higherIsBetter: boolean): Map<string, number> {
  const best = new Map<string, number>();
  results.forEach((result, index) => {
    const current = best.get(key(index));
    if (current === undefined || (higherIsBetter ? result.value > current : result.value < current)) best.set(key(index), result.value);
  });
  return best;
}

/** Each athlete's best station result for one test (see `stationResults`). */
export function stationBests(test: ClubTest, labels: RepLabel[], effective: Map<string, any>, events: Set<string>): Map<string, number> {
  const results = stationResults(test, labels, effective, events);
  return bestBy(results, index => results[index].playerId, test.higherIsBetter);
}

/** One athlete's best station result on each testing event they took part in (the same results). */
export function stationEventBests(test: ClubTest, labels: RepLabel[], effective: Map<string, any>, events: Set<string>, playerId: string): number[] {
  const results = stationResults(test, labels, effective, events).filter(result => result.playerId === playerId);
  return [...bestBy(results, index => results[index].eventId, test.higherIsBetter).values()];
}

/** One profile best in metres (the contract's unit), or null. */
export function profileBest(profile: any, metric: string): number | null {
  const best = profile && profile.version >= 5 ? profile.bests?.[metric] : null;
  return best && best.unit === 'm' && positive(best.value) ? best.value : null;
}

// MARK: - One point per athlete, at their team's age group

export type ClubPoint = { playerId: string; ageGroup: number | null; value: number };

export function clubPoints(values: Map<string, number>, members: ClubMember[], teamAge: Map<string, number | null>): ClubPoint[] {
  return members.flatMap(member => {
    const value = values.get(member.id);
    return value === undefined ? [] : [{ playerId: member.id, ageGroup: teamAge.get(member.teamId) ?? null, value }];
  });
}

// MARK: - Loading (staff)

export const CLUB_STAFF: ReadonlySet<Access> = new Set<Access>(['admin', 'manager', 'coach']);
const MEMORY_MS = 10 * 60_000;

export type ClubViewer = { access: Access; playerId: string | null; organizationId: string | null; teamId: string | null; gender?: unknown };
export type ClubTestResult = {
  organizationName: string;
  /** Null: no gender is recorded for this athlete, so everyone is compared. */
  gender: Gender | null;
  /** A coach compares within the teams they coach. */
  teamsOnly: boolean;
  /** Some athletes' or teams' results could not be read. */
  incomplete: boolean;
  points: ClubPoint[];
  /** This athlete's best on each testing event (station tests); their profile best (jumps). */
  ownResults: number[];
};

type Cohort = { key: string; organizationName: string; gender: Gender | null; teamsOnly: boolean; members: ClubMember[]; teamAge: Map<string, number | null> };

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await run(items[index]); }
  }));
  return results;
}

async function cohortFor(viewer: ClubViewer & { organizationId: string; playerId: string }): Promise<Cohort> {
  const context = await remember(`club-context:${viewer.organizationId}`, () => getClubContext(viewer.organizationId), MEMORY_MS);
  const teams = (context.teams || []).map(team => ({ id: team.id, name: team.name }));
  const players: ClubMember[] = (context.players || []).filter(player => player.id && player.teamId).map(player => ({ id: player.id, teamId: player.teamId }));
  const gender = athleteGender(viewer.gender, teams.find(team => team.id === viewer.teamId)?.name);
  const members = cohortMembers(teams, players, gender, viewer.playerId);
  // The athlete joins on their own only when their team's name places them elsewhere.
  const outside = viewer.teamId && gender && teamGender(teams.find(team => team.id === viewer.teamId)?.name) !== gender ? viewer.playerId : '';
  return {
    key: `${viewer.organizationId}|${gender ?? 'all'}|${outside}`, organizationName: context.organization?.name || 'Your club', gender,
    teamsOnly: context.role === 'coach', members, teamAge: new Map(teams.map(team => [team.id, teamAgeGroup(team.name)])),
  };
}

function profileSource(cohort: Cohort): Promise<{ profiles: Map<string, any>; failed: number }> {
  return remember(`club-profiles:${cohort.key}`, async () => {
    let failed = 0;
    const read = await mapLimited(cohort.members, 8, member => db.collection('players').doc(member.id).collection('insightSummaries').doc('profile').get()
      .then((doc: any) => [member.id, doc.exists ? doc.data() : null] as const, () => { failed += 1; return [member.id, null] as const; }));
    return { profiles: new Map(read), failed };
  }, MEMORY_MS);
}

function stationSource(cohort: Cohort): Promise<{ labels: RepLabel[]; effective: Map<string, any>; events: Set<string>; failed: number }> {
  return remember(`club-station:${cohort.key}`, async () => {
    let failed = 0;
    // Station-testing reps only (they carry the event); one query per athlete.
    const labels = (await mapLimited(cohort.members, 8, member => db.collection('players').doc(member.id).collection('reps').where('testingEventId', '>', '').get()
      .then((snapshot: any) => snapshot.docs.map((doc: any) => repLabel(member.id, doc.id, doc.data())) as RepLabel[], () => { failed += 1; return [] as RepLabel[]; }))).flat();
    const events = reprocessedEvents(labels);
    const teamOf = new Map(cohort.members.map(member => [member.id, member.teamId]));
    const teams = [...new Set(labels.filter(label => label.drill && STATION_DRILLS.has(label.drill) && label.eventId && events.has(label.eventId))
      .map(label => teamOf.get(label.playerId)).filter((id): id is string => Boolean(id)))];
    const call = cloud.httpsCallable('getTeamLeaderboard', { timeout: 120_000 });
    const boards = await Promise.all(teams.map(teamId => call({ teamId }).then((response: any) => response.data, () => { failed += 1; return null; })));
    const effective = new Map<string, any>();
    for (const board of boards) for (const athlete of board?.athletes ?? []) for (const rep of athlete?.reps ?? []) effective.set(`${athlete.id}/${rep.id}`, rep);
    return { labels, effective, events, failed };
  }, MEMORY_MS);
}

/**
 * The club comparison for one report test, or null where there is none to show (a player's own
 * view, a test outside the report, an athlete without a club). Both sources start on the first call,
 * whichever test it asks for, and are kept in memory, so the other tests then cost nothing.
 */
export async function loadClubTest(viewer: ClubViewer, metricId: string): Promise<ClubTestResult | null> {
  const test = CLUB_TESTS[metricId];
  if (!test || !CLUB_STAFF.has(viewer.access) || !viewer.organizationId || !viewer.playerId) return null;
  const cohort = await cohortFor({ ...viewer, organizationId: viewer.organizationId, playerId: viewer.playerId });
  const profiles = profileSource(cohort), station = stationSource(cohort);
  (test.source === 'profile' ? station : profiles).catch(() => { /* reported by its own test */ });
  let values: Map<string, number>, failed: number, ownResults: number[];
  if (test.source === 'profile') {
    const read = await profiles;
    values = new Map([...read.profiles].flatMap(([id, profile]) => { const value = profileBest(profile, test.metric!); return value === null ? [] : [[id, value] as [string, number]]; }));
    failed = read.failed;
    ownResults = values.has(viewer.playerId) ? [values.get(viewer.playerId)!] : [];
  } else {
    const read = await station;
    values = stationBests(test, read.labels, read.effective, read.events);
    failed = read.failed;
    ownResults = stationEventBests(test, read.labels, read.effective, read.events, viewer.playerId);
  }
  return { organizationName: cohort.organizationName, gender: cohort.gender, teamsOnly: cohort.teamsOnly, incomplete: failed > 0,
    points: clubPoints(values, cohort.members, cohort.teamAge), ownResults };
}

// MARK: - The chart's statistics

export type ClubComparisonData = Omit<ClubTestResult, 'points' | 'ownResults'> & { stats: ClubStats };

/** The club comparison as statistics (`ClubStats`), computed here from the staff reads above. */
export async function staffClubComparison(viewer: ClubViewer, metricId: string): Promise<ClubComparisonData | null> {
  const test = CLUB_TESTS[metricId];
  const result = test && viewer.playerId ? await loadClubTest(viewer, metricId) : null;
  if (!test || !result) return null;
  const { points, ownResults, ...about } = result;
  return { ...about, stats: clubStats(points, { ownId: viewer.playerId!, ownResults, unit: test.display.unit, scale: test.display.scale, higherIsBetter: test.higherIsBetter }) };
}

/**
 * Where the Stats page's club comparison comes from. The backend callable that returns the same
 * statistics (without reading any athlete's results in the browser) replaces this line when deployed.
 */
export const loadClubComparison: (viewer: ClubViewer, metricId: string) => Promise<ClubComparisonData | null> = staffClubComparison;
