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
//   `getAthleteEffectiveResults` callable returns per athlete (backend effective-results.js
//   `listForPlayer`, the same rows `getTeamLeaderboard` projects: qualified, non-duplicate,
//   evidence-checked); the rep documents only say which event and which course (protocolSide)
//   each rep belongs to, because the callable leaves those out.
// - Vertical and broad jump: each athlete's best on their player insight profile
//   (`players/{id}/insightSummaries/profile`, "player insight v5"), which the Insights rebuild
//   writes from the same qualification plus any published corrections.
//
// Staff only (admin, manager, coach): those reads are refused to a player. They are the fallback:
// when the club statistics document exists (MARK: The club statistics document, at the end) the
// chart is drawn from it for any signed-in viewer, a player included, in speeds rather than times.

import { auth, cloud, db } from '../../../../lib/firebase';
import { getClubContext } from '../../../../lib/organization-data';
import { genderOf } from '../../../admin/lib/ageCurve';
import { DRILLS } from '../../lib/drills';
import type { Access } from '../../lib/loaders';
import { remember } from '../../lib/replay-cache';
import { MIN_GROUP, clubStats } from './club-cloud';
import type { AgeGroupStats, ClubStats, OwnResults, Spread } from './club-cloud';

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

/** The athlete's own recorded gender, read as the phone reads it, or null. */
export function recordedGender(recorded: unknown): Gender | null {
  const own = genderOf({ gender: recorded });
  return own === 'male' ? 'boys' : own === 'female' ? 'girls' : null;
}

/** The athlete's own recorded gender, else their team's. */
export function athleteGender(recorded: unknown, teamName: unknown): Gender | null {
  return recordedGender(recorded) ?? teamGender(teamName);
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

type ClubTeam = { id: string; name: string };
type Cohort = {
  key: string; organizationName: string; gender: Gender | null; teamsOnly: boolean; members: ClubMember[]; teamAge: Map<string, number | null>;
  /** The club's teams (ids and names only), kept so a later visit can place the athlete at once. */
  teams: ClubTeam[];
  /** The athlete joins on their own (their team's name places them elsewhere): never kept. */
  outside: boolean;
};

/** Firestore reads in flight at once (one SDK connection carries them all). */
const READ_CONCURRENCY = 16;
/**
 * Effective-result callables in flight at once; each is a server-side read of one athlete's evidence
 * (~0.9 s median, measured 2026-11-11). Fewer reads run on the server at once than the per-team
 * leaderboard calls this replaced (every team at once, four athletes each).
 */
const EFFECTIVE_CONCURRENCY = 16;

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await run(items[index]); }
  }));
  return results;
}

/** A queue running at most `limit` tasks at once; a task that fails is tried once more. */
export function limitedRetry(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const slot = () => new Promise<void>(resolve => { if (active < limit) { active += 1; resolve(); } else waiting.push(() => { active += 1; resolve(); }); });
  const release = () => { active -= 1; waiting.shift()?.(); };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    await slot();
    try { return await task().catch(() => task()); } finally { release(); }
  };
}

/** For timing in the browser (Performance panel / `performance.getEntriesByType('mark')`). */
const mark = (name: string) => { try { performance.mark(`club:${name}`); } catch { /* no timing API */ } };

async function cohortFor(viewer: ClubViewer & { organizationId: string; playerId: string }): Promise<Cohort> {
  const context = await remember(`club-context:${viewer.organizationId}`, () => getClubContext(viewer.organizationId), MEMORY_MS);
  mark('context');
  const teams = (context.teams || []).map(team => ({ id: team.id, name: team.name }));
  const players: ClubMember[] = (context.players || []).filter(player => player.id && player.teamId).map(player => ({ id: player.id, teamId: player.teamId }));
  const gender = athleteGender(viewer.gender, teams.find(team => team.id === viewer.teamId)?.name);
  const members = cohortMembers(teams, players, gender, viewer.playerId);
  // The athlete joins on their own only when their team's name places them elsewhere.
  const outside = viewer.teamId && gender && teamGender(teams.find(team => team.id === viewer.teamId)?.name) !== gender ? viewer.playerId : '';
  return {
    key: `${viewer.organizationId}|${gender ?? 'all'}|${outside}`, organizationName: context.organization?.name || 'Your club', gender,
    teamsOnly: context.role === 'coach', members, teamAge: new Map(teams.map(team => [team.id, teamAgeGroup(team.name)])),
    teams: teams.filter(team => typeof team.id === 'string' && typeof team.name === 'string'), outside: Boolean(outside),
  };
}

const readProfile = (playerId: string) => db.collection('players').doc(playerId).collection('insightSummaries').doc('profile').get()
  .then((doc: any) => (doc.exists ? doc.data() : null));
// Station-testing reps only (they carry the event); one query per athlete.
const readLabels = (playerId: string): Promise<RepLabel[]> => db.collection('players').doc(playerId).collection('reps').where('testingEventId', '>', '').get()
  .then((snapshot: any) => snapshot.docs.map((doc: any) => repLabel(playerId, doc.id, doc.data())) as RepLabel[]);

function profileSource(cohort: Cohort): Promise<{ profiles: Map<string, any>; failed: number }> {
  return remember(`club-profiles:${cohort.key}`, async () => {
    let failed = 0;
    const read = await mapLimited(cohort.members, READ_CONCURRENCY, member => readProfile(member.id)
      .then(profile => [member.id, profile] as const, () => { failed += 1; return [member.id, null] as const; }));
    mark('profiles');
    return { profiles: new Map(read), failed };
  }, MEMORY_MS);
}

/**
 * Every cohort athlete's station labels and, for each athlete with a station-testing rep, their
 * effective results (`getAthleteEffectiveResults`, the same rows `getTeamLeaderboard` projects from
 * backend effective-results.js `listForPlayer`). An athlete's effective results are asked for as soon
 * as their own labels are in, so the label reads and the effective reads overlap; one slow or
 * failing athlete no longer holds a whole team, and a failed call is tried once more.
 */
function stationSource(cohort: Cohort): Promise<{ labels: RepLabel[]; effective: Map<string, any>; events: Set<string>; failed: number }> {
  return remember(`club-station:${cohort.key}`, async () => {
    let failed = 0;
    const call = cloud.httpsCallable('getAthleteEffectiveResults', { timeout: 120_000 }), ask = limitedRetry(EFFECTIVE_CONCURRENCY);
    const effective = new Map<string, any>(), asked: Promise<void>[] = [];
    const labels = (await mapLimited(cohort.members, READ_CONCURRENCY, member => readLabels(member.id).then(found => {
      if (found.some(label => label.drill && STATION_DRILLS.has(label.drill) && label.eventId)) {
        asked.push(ask(() => call({ playerId: member.id })).then((response: any) => {
          for (const rep of response?.data?.reps ?? []) if (rep?.id) effective.set(`${member.id}/${rep.id}`, rep);
        }, () => { failed += 1; }));
      }
      return found;
    }, () => { failed += 1; return [] as RepLabel[]; }))).flat();
    mark('labels');
    await Promise.all(asked);
    mark('effective');
    return { labels, effective, events: reprocessedEvents(labels), failed };
  }, MEMORY_MS);
}

type ClubTestDetail = { result: ClubTestResult; cohort: Cohort; events: string[] };

async function clubTestDetail(viewer: ClubViewer, metricId: string): Promise<ClubTestDetail | null> {
  const test = CLUB_TESTS[metricId];
  if (!test || !CLUB_STAFF.has(viewer.access) || !viewer.organizationId || !viewer.playerId) return null;
  const cohort = await cohortFor({ ...viewer, organizationId: viewer.organizationId, playerId: viewer.playerId });
  const profiles = profileSource(cohort), station = stationSource(cohort);
  (test.source === 'profile' ? station : profiles).catch(() => { /* reported by its own test */ });
  let values: Map<string, number>, failed: number, ownResults: number[], events: string[] = [];
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
    events = [...read.events];
  }
  return { cohort, events, result: { organizationName: cohort.organizationName, gender: cohort.gender, teamsOnly: cohort.teamsOnly, incomplete: failed > 0,
    points: clubPoints(values, cohort.members, cohort.teamAge), ownResults } };
}

/**
 * The club comparison for one report test, or null where there is none to show (a player's own
 * view, a test outside the report, an athlete without a club). Both sources start on the first call,
 * whichever test it asks for, and are kept in memory, so the other tests then cost nothing.
 */
export async function loadClubTest(viewer: ClubViewer, metricId: string): Promise<ClubTestResult | null> {
  return (await clubTestDetail(viewer, metricId))?.result ?? null;
}

// MARK: - The chart's statistics

export type ClubComparisonData = Omit<ClubTestResult, 'points' | 'ownResults'> & {
  stats: ClubStats;
  /** From the club statistics document: its units (else the test's own) and what it shows. */
  display?: ClubDisplay;
  measureLabel?: string | null;
};

function comparisonOf(test: ClubTest, playerId: string, result: ClubTestResult): ClubComparisonData {
  const { points, ownResults, ...about } = result;
  return { ...about, stats: clubStats(points, { ownId: playerId, ownResults, unit: test.display.unit, scale: test.display.scale, higherIsBetter: test.higherIsBetter }) };
}

/** The club comparison as statistics (`ClubStats`), computed here from the staff reads above. */
export async function staffClubComparison(viewer: ClubViewer, metricId: string): Promise<ClubComparisonData | null> {
  const test = CLUB_TESTS[metricId];
  const result = test && viewer.playerId ? await loadClubTest(viewer, metricId) : null;
  if (!test || !result) return null;
  return comparisonOf(test, viewer.playerId!, result);
}

/**
 * Where the Stats page's club comparison comes from: the club statistics document when it holds the
 * test (any signed-in viewer), else the staff reads above. `ownEffective` is the athlete's effective
 * results already loaded for the page; without them the document path draws no station dot.
 */
export async function loadClubComparison(viewer: ClubViewer, metricId: string, ownEffective: () => any[] = () => []): Promise<ClubComparisonData | null> {
  return (await documentClubComparison(viewer, metricId, ownEffective).catch(() => null)) ?? staffClubComparison(viewer, metricId);
}

// MARK: - Kept statistics: shown at once on every later visit (stale-while-revalidate)
//
// The club's statistics for a test (count, mean and spread per age group, and overall) are kept in
// this browser's localStorage per signed-in staff account, club, gender cohort and test, so every
// later visit, and every other athlete of that club and gender, shows the chart at once. Kept: the
// statistics, the club's team ids and names (to place the athlete without asking the server), and
// the ids of the newly processed testing events (to compute this athlete's own results). Never kept:
// any athlete's id, name or value. The athlete's own dot(s) are always computed fresh from their own
// reads (their station labels, their effective results already loaded for the page, their profile).

/** Bump to drop every kept statistic (e.g. when the plotted values change). */
export const CLUB_STATS_VERSION = 1;
/** Kept statistics younger than this are shown and not refreshed. */
export const CLUB_STATS_REFRESH_MS = 30 * 60_000;
/** Kept statistics older than this are not shown; younger ones are shown and refreshed in the background. */
export const CLUB_STATS_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const KEPT_PREFIX = 'posetek.clubStats';
const KEPT_VERSION_PREFIX = `${KEPT_PREFIX}:v${CLUB_STATS_VERSION}:`;

export type KeptClubTest = {
  version: number; savedAt: number;
  organizationName: string; gender: Gender | null; teamsOnly: boolean; incomplete: boolean;
  stats: Omit<ClubStats, 'own'>;
  /** The newly processed testing events (station tests; empty for the jumps). */
  events: string[];
};
export type KeptClubTeams = { version: number; savedAt: number; teams: ClubTeam[] };

export const keptTestKey = (uid: string, organizationId: string, gender: Gender | null, metricId: string) =>
  `${KEPT_VERSION_PREFIX}${uid}:${organizationId}:${gender ?? 'all'}:${metricId}`;
export const keptTeamsKey = (uid: string, organizationId: string) => `${KEPT_VERSION_PREFIX}${uid}:${organizationId}:teams`;

const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 'fresh': shown, not refreshed; 'stale': shown and refreshed; null: too old (or from the future), not shown. */
export function keptAge(savedAt: unknown, now: number): 'fresh' | 'stale' | null {
  if (!finiteNumber(savedAt) || savedAt > now + 60_000) return null;
  const age = now - savedAt;
  return age < CLUB_STATS_REFRESH_MS ? 'fresh' : age < CLUB_STATS_MAX_AGE_MS ? 'stale' : null;
}

const spreadOf = (value: any) => value && finiteNumber(value.count) && finiteNumber(value.mean) && finiteNumber(value.sd)
  ? { count: value.count, mean: value.mean, sd: value.sd } : null;

/** The statistics a comparison may keep, rebuilt field by field so nothing else is ever stored. */
export function keptTestOf(data: ClubComparisonData, events: Iterable<string>, now: number): KeptClubTest {
  const { unit, higherIsBetter, athletes, groups, overall } = data.stats;
  return {
    version: CLUB_STATS_VERSION, savedAt: now, organizationName: data.organizationName, gender: data.gender, teamsOnly: data.teamsOnly, incomplete: data.incomplete,
    stats: { unit, higherIsBetter, athletes, groups: groups.map(({ ageGroup, count, mean, sd }) => ({ ageGroup, count, mean, sd })), overall: { count: overall.count, mean: overall.mean, sd: overall.sd } },
    events: [...events].filter(id => typeof id === 'string'),
  };
}

/** A kept record read back, or null when it is malformed, of another version, or too old to show. */
export function parseKeptTest(raw: any, now: number): KeptClubTest | null {
  if (!raw || raw.version !== CLUB_STATS_VERSION || !keptAge(raw.savedAt, now)) return null;
  const stats = raw.stats, overall = spreadOf(stats?.overall);
  if (!stats || typeof stats.unit !== 'string' || typeof stats.higherIsBetter !== 'boolean' || !finiteNumber(stats.athletes) || !overall || !Array.isArray(stats.groups)) return null;
  const groups = stats.groups.map((group: any) => { const spread = spreadOf(group); return spread && finiteNumber(group.ageGroup) ? { ageGroup: group.ageGroup, ...spread } : null; });
  if (groups.some((group: unknown) => !group) || typeof raw.organizationName !== 'string' || ![null, 'boys', 'girls'].includes(raw.gender)
    || !Array.isArray(raw.events) || raw.events.some((id: unknown) => typeof id !== 'string')) return null;
  return {
    version: raw.version, savedAt: raw.savedAt, organizationName: raw.organizationName, gender: raw.gender, teamsOnly: raw.teamsOnly === true, incomplete: raw.incomplete === true,
    stats: { unit: stats.unit, higherIsBetter: stats.higherIsBetter, athletes: stats.athletes, groups, overall }, events: [...raw.events],
  };
}

export function parseKeptTeams(raw: any, now: number): KeptClubTeams | null {
  if (!raw || raw.version !== CLUB_STATS_VERSION || !keptAge(raw.savedAt, now) || !Array.isArray(raw.teams)) return null;
  const teams = raw.teams.filter((team: any) => typeof team?.id === 'string' && typeof team?.name === 'string').map((team: any) => ({ id: team.id, name: team.name }));
  return { version: raw.version, savedAt: raw.savedAt, teams };
}

/** Where the kept team list places this athlete: their cohort's gender, their age group, or outside it. */
export function keptPlace(teams: ClubTeam[], viewer: Pick<ClubViewer, 'teamId' | 'gender'>): { gender: Gender | null; ageGroup: number | null; outside: boolean } {
  const name = teams.find(team => team.id === viewer.teamId)?.name;
  const gender = athleteGender(viewer.gender, name);
  return { gender, ageGroup: teamAgeGroup(name), outside: Boolean(viewer.teamId && gender && teamGender(name) !== gender) };
}

/**
 * This athlete's own result(s) for one test, in the chart's units, from their own reads only: the
 * same rules as the club's (`stationEventBests`, `profileBest`), so the dot matches what a full load
 * would draw. `events` are the club's newly processed events (kept); the athlete's own rewritten reps
 * add theirs.
 */
export function ownClubResults(test: ClubTest, playerId: string, own: { labels: RepLabel[]; effective: any[]; events: Iterable<string>; profile: any }, ageGroup: number | null): OwnResults | null {
  let best: number | undefined, results: number[];
  if (test.source === 'profile') {
    const value = profileBest(own.profile, test.metric!);
    best = value ?? undefined; results = value === null ? [] : [value];
  } else {
    const labels = own.labels.filter(label => label.playerId === playerId);
    const effective = new Map(own.effective.filter(rep => typeof rep?.id === 'string').map(rep => [`${playerId}/${rep.id}`, rep] as [string, any]));
    const events = new Set([...own.events, ...reprocessedEvents(labels)]);
    best = stationBests(test, labels, effective, events).get(playerId);
    results = stationEventBests(test, labels, effective, events, playerId);
  }
  if (best === undefined) return null;
  const shown = (value: number) => value * test.display.scale;
  return { ageGroup, best: shown(best), results: results.length ? results.map(shown) : [shown(best)] };
}

export function keptComparison(kept: KeptClubTest, own: OwnResults | null): ClubComparisonData {
  return { organizationName: kept.organizationName, gender: kept.gender, teamsOnly: kept.teamsOnly, incomplete: kept.incomplete, stats: { ...kept.stats, own } };
}

// Every storage access is guarded: the page works the same without storage (private mode, blocked).
function keptStore(): Storage | null {
  try { const store = globalThis.localStorage; return store && typeof store.getItem === 'function' ? store : null; } catch { return null; }
}
function readKept(key: string): unknown {
  try { const raw = keptStore()?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeKept(key: string, value: unknown): void {
  try { keptStore()?.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: nothing is kept */ }
}
let prunedOldVersions = false;
/** Drops records of other versions, once per page. */
function pruneKept(): void {
  if (prunedOldVersions) return;
  prunedOldVersions = true;
  try {
    const store = keptStore();
    if (!store) return;
    const old: string[] = [];
    for (let index = 0; index < store.length; index++) { const key = store.key(index); if (key?.startsWith(`${KEPT_PREFIX}:`) && !key.startsWith(KEPT_VERSION_PREFIX)) old.push(key); }
    old.forEach(key => store.removeItem(key));
  } catch { /* nothing to prune */ }
}

type KeptView = { uid: string; organizationId: string; playerId: string; gender: Gender | null; ageGroup: number | null };

/** The kept cohort for this viewer and signed-in account, when its team list is kept. */
function keptViewOf(viewer: ClubViewer, now: number): KeptView | null {
  const uid = auth.currentUser?.uid;
  if (!uid || !viewer.organizationId || !viewer.playerId) return null;
  const teams = parseKeptTeams(readKept(keptTeamsKey(uid, viewer.organizationId)), now);
  if (!teams) return null;
  const place = keptPlace(teams.teams, viewer);
  return place.outside ? null : { uid, organizationId: viewer.organizationId, playerId: viewer.playerId, gender: place.gender, ageGroup: place.ageGroup };
}

const ownLabels = (playerId: string) => remember(`club-own-labels:${playerId}`, () => readLabels(playerId), MEMORY_MS);
const ownProfile = (playerId: string) => remember(`club-own-profile:${playerId}`, () => readProfile(playerId), MEMORY_MS);

/** A full load (shared through the in-memory cache), kept for later visits unless it would replace a complete record with an incomplete one. */
async function freshClubComparison(viewer: ClubViewer, metricId: string): Promise<ClubComparisonData | null> {
  const test = CLUB_TESTS[metricId], uid = auth.currentUser?.uid ?? null;
  const detail = test ? await clubTestDetail(viewer, metricId) : null;
  if (!test || !detail) return null;
  const data = comparisonOf(test, viewer.playerId!, detail.result);
  if (uid && auth.currentUser?.uid === uid && !detail.cohort.outside && viewer.organizationId) {
    pruneKept();
    const now = Date.now(), key = keptTestKey(uid, viewer.organizationId, detail.cohort.gender, metricId);
    writeKept(keptTeamsKey(uid, viewer.organizationId), { version: CLUB_STATS_VERSION, savedAt: now, teams: detail.cohort.teams } satisfies KeptClubTeams);
    const previous = parseKeptTest(readKept(key), now);
    if (!(data.incomplete && previous && !previous.incomplete)) writeKept(key, keptTestOf(data, detail.events, now));
  }
  return data;
}

/**
 * The club comparison for one test as the Stats page shows it: the kept statistics at once (with
 * this athlete's own results computed fresh), then, unless they are fresh, a full load in the
 * background that replaces them. `show` may be called twice; `ownEffective` is the athlete's
 * effective results already loaded for the page (`getAthleteEffectiveResults`).
 */
export async function watchClubComparison(viewer: ClubViewer, metricId: string, ownEffective: () => any[], show: (data: ClubComparisonData | null) => void): Promise<void> {
  // The club statistics document first, for any signed-in viewer; the staff reads only without it.
  const fromDocument = await documentClubComparison(viewer, metricId, ownEffective).catch(() => null);
  if (fromDocument) { show(fromDocument); mark(`document:${metricId}`); return; }
  const test = CLUB_TESTS[metricId];
  if (!test || !CLUB_STAFF.has(viewer.access) || !viewer.organizationId || !viewer.playerId) { show(null); return; }
  const now = Date.now(), view = keptViewOf(viewer, now);
  const kept = view ? parseKeptTest(readKept(keptTestKey(view.uid, view.organizationId, view.gender, metricId)), now) : null;
  let shown: KeptClubTest | null = null;
  if (view && kept) {
    try {
      const [labels, profile] = await Promise.all([test.source === 'station' ? ownLabels(view.playerId) : Promise.resolve([] as RepLabel[]),
        test.source === 'profile' ? ownProfile(view.playerId) : Promise.resolve(null)]);
      show(keptComparison(kept, ownClubResults(test, view.playerId, { labels, effective: ownEffective(), events: kept.events, profile }, view.ageGroup)));
      shown = kept;
      mark(`kept:${metricId}`);
    } catch { /* the full load below answers */ }
    if (shown && keptAge(kept.savedAt, now) === 'fresh') return;
  }
  try {
    const data = await freshClubComparison(viewer, metricId);
    // A refresh that could not read everything does not replace a complete kept comparison.
    if (shown && data && data.incomplete && !shown.incomplete) return;
    show(data);
    mark(`fresh:${metricId}`);
  } catch (error) {
    if (!shown) throw error;
  }
}

/**
 * Starts what the club comparison needs as soon as the Stats page opens, before the testing report
 * arrives: the club statistics document and, when it exists, the athlete's own reads; without it
 * (staff only) the athlete's own reads when kept statistics will be shown, and the full load unless
 * every test's kept statistics are fresh.
 */
export function prefetchClubComparison(viewer: ClubViewer): void {
  if (!viewer.organizationId || !viewer.playerId) return;
  const ignore = () => { /* the chart reports its own failure */ };
  const playerId = viewer.playerId;
  clubDocument(viewer.organizationId).then(document => {
    if (document) { ownStation(playerId).catch(ignore); ownProfile(playerId).catch(ignore); } else staffPrefetch(viewer);
  }, ignore);
}

function staffPrefetch(viewer: ClubViewer): void {
  if (!CLUB_STAFF.has(viewer.access) || !viewer.organizationId || !viewer.playerId) return;
  const now = Date.now(), view = keptViewOf(viewer, now);
  const ignore = () => { /* the chart reports its own failure */ };
  if (view) { ownLabels(view.playerId).catch(ignore); ownProfile(view.playerId).catch(ignore); }
  const fresh = view && Object.keys(CLUB_TESTS).every(id => keptAge(parseKeptTest(readKept(keptTestKey(view.uid, view.organizationId, view.gender, id)), now)?.savedAt, now) === 'fresh');
  if (!fresh) clubTestDetail(viewer, 'sprint').catch(ignore);
}

// MARK: - The club statistics document (any signed-in viewer)
//
// `benchmarks/club-{organizationId}` (schemaVersion 1, kind "clubTestStats"): the club's statistics per
// test, gender cohort (boys, girls, all) and age group, in SI units, written by the backend from the
// corrected results and readable by any signed-in user. No athlete is identified in it. Courses ran 5
// to 12 m, so the station tests are compared as speeds (the published Vacaville before/after
// reference, posetek-reprocessing tools/week_before_after_pdf.py): the sprint's speed at 5 m, and
// course speed, 2 × course length ÷ total time, for the shuttle run and dribbling. Every measure is
// higher-is-better. When the document holds the test the chart is drawn from it, for a player too;
// otherwise the staff reads above answer.

export type DocumentMeasure = 'speedAt5m' | 'courseSpeed' | 'jumpHeight' | 'broadJumpDistance';
export type DocumentTest = { measure: DocumentMeasure; unit: 'm/s' | 'm'; display: ClubDisplay; label: string | null };
const MPH: ClubDisplay = { unit: 'mph', scale: 2.23694, digits: 1 };
const METRES_PER_SECOND: ClubDisplay = { unit: 'm/s', scale: 1, digits: 2 };
const COURSE_SPEED: DocumentTest = { measure: 'courseSpeed', unit: 'm/s', display: METRES_PER_SECOND, label: 'Course speed' };

/** What the document holds for each report test, and how the chart shows it. */
export const DOCUMENT_TESTS: Record<string, DocumentTest> = {
  sprint: { measure: 'speedAt5m', unit: 'm/s', display: MPH, label: 'Speed at 5 m' },
  changeOfDirection: COURSE_SPEED, dribbleLeft: COURSE_SPEED, dribbleRight: COURSE_SPEED,
  jump: { measure: 'jumpHeight', unit: 'm', display: CLUB_TESTS.jump.display, label: null },
  broadJump: { measure: 'broadJumpDistance', unit: 'm', display: CLUB_TESTS.broadJump.display, label: null },
};

export type DocumentCohort = { athletes: number; overall: Spread; groups: AgeGroupStats[] };
export type DocumentCohortKey = Gender | 'all';
export type ClubDocument = {
  organizationId: string; organizationName: string;
  /** The last day (Pacific, YYYY-MM-DD) whose results the statistics include; null: not stated. */
  resultsThrough: string | null;
  teams: Record<string, { gender: Gender | null; ageGroup: number | null }>;
  /** Only the tests whose measure, unit and direction match `DOCUMENT_TESTS`, and their valid cohorts. */
  tests: Record<string, Partial<Record<DocumentCohortKey, DocumentCohort>>>;
  /**
   * Per test: results the statistics leave out for one gender and age group, by testing event (a
   * session that cannot be compared, such as one run on a much shorter course). The same results are
   * left out of that group's own markers, so an athlete is never set against a curve their result is not in.
   */
  omitted: Record<string, ClubOmission[]>;
};
export type ClubOmission = { gender: Gender; ageGroup: number; eventIds: string[] };

function parseOmissions(raw: unknown): ClubOmission[] {
  return (Array.isArray(raw) ? raw : []).flatMap((entry: any) => {
    if ((entry?.gender !== 'boys' && entry?.gender !== 'girls') || !finiteNumber(entry.ageGroup) || !Array.isArray(entry.eventIds)) return [];
    const eventIds = entry.eventIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
    return eventIds.length ? [{ gender: entry.gender as Gender, ageGroup: entry.ageGroup as number, eventIds }] : [];
  });
}

/** The testing events whose results are left out of one test for an athlete of this gender and age group. */
export function omittedEvents(document: ClubDocument, metricId: string, place: { gender: Gender | null; ageGroup: number | null }): Set<string> {
  return new Set((document.omitted[metricId] ?? []).filter(entry => entry.gender === place.gender && entry.ageGroup === place.ageGroup).flatMap(entry => entry.eventIds));
}

function parseCohort(raw: any): DocumentCohort | null {
  const overall = spreadOf(raw?.overall);
  if (!raw || !finiteNumber(raw.athletes) || raw.athletes < 0 || !overall || !Array.isArray(raw.groups)) return null;
  const groups = raw.groups.map((group: any) => { const spread = spreadOf(group); return spread && finiteNumber(group.ageGroup) ? { ageGroup: group.ageGroup, ...spread } : null; });
  if (groups.some((group: unknown) => !group)) return null;
  return { athletes: raw.athletes, overall, groups: (groups as AgeGroupStats[]).sort((a, b) => a.ageGroup - b.ageGroup) };
}

/** The document read back field by field, or null when it is not a version-1 club statistics document. */
export function parseClubDocument(raw: any): ClubDocument | null {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1 || raw.kind !== 'clubTestStats' || typeof raw.organizationId !== 'string'
    || !raw.tests || typeof raw.tests !== 'object') return null;
  const teams: ClubDocument['teams'] = {};
  for (const [id, team] of Object.entries<any>(raw.teams && typeof raw.teams === 'object' ? raw.teams : {})) {
    teams[id] = { gender: team?.gender === 'boys' || team?.gender === 'girls' ? team.gender : null, ageGroup: finiteNumber(team?.ageGroup) ? team.ageGroup : null };
  }
  const tests: ClubDocument['tests'] = {}, omitted: ClubDocument['omitted'] = {};
  for (const [id, expected] of Object.entries(DOCUMENT_TESTS)) {
    const test = raw.tests[id];
    if (!test || test.measure !== expected.measure || test.unit !== expected.unit || test.higherIsBetter !== true || !test.cohorts || typeof test.cohorts !== 'object') continue;
    const cohorts: Partial<Record<DocumentCohortKey, DocumentCohort>> = {};
    for (const key of ['boys', 'girls', 'all'] as const) { const cohort = parseCohort(test.cohorts[key]); if (cohort) cohorts[key] = cohort; }
    if (!Object.keys(cohorts).length) continue;
    tests[id] = cohorts;
    const left = parseOmissions(test.omitted);
    if (left.length) omitted[id] = left;
  }
  return {
    organizationId: raw.organizationId, organizationName: typeof raw.organizationName === 'string' && raw.organizationName ? raw.organizationName : 'Your club',
    resultsThrough: typeof raw.resultsThrough === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.resultsThrough) ? raw.resultsThrough : null, teams, tests, omitted,
  };
}

/** Where the document places the athlete: their own recorded gender, else their team's, and their team's age group. */
export function documentPlace(document: ClubDocument, viewer: Pick<ClubViewer, 'teamId' | 'gender'>): { gender: Gender | null; ageGroup: number | null } {
  const team = viewer.teamId ? document.teams[viewer.teamId] : undefined;
  return { gender: recordedGender(viewer.gender) ?? team?.gender ?? null, ageGroup: team?.ageGroup ?? null };
}

/**
 * The chart's statistics for one test from the document, in display units: the athlete's gender
 * cohort, or everyone when no gender is known. Null when the document lacks that test or cohort.
 */
export function documentStats(document: ClubDocument, metricId: string, place: { gender: Gender | null }): { gender: Gender | null; stats: Omit<ClubStats, 'own'> } | null {
  const spec = DOCUMENT_TESTS[metricId], cohort = document.tests[metricId]?.[place.gender ?? 'all'];
  if (!spec || !cohort) return null;
  const scale = spec.display.scale, shown = (spread: Spread) => ({ count: spread.count, mean: spread.mean * scale, sd: spread.sd * scale });
  return { gender: place.gender, stats: {
    unit: spec.display.unit, higherIsBetter: true, athletes: cohort.athletes,
    groups: cohort.groups.filter(group => group.count >= MIN_GROUP).map(group => ({ ageGroup: group.ageGroup, ...shown(group) })), overall: shown(cohort.overall),
  } };
}

const PACIFIC_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The Pacific calendar day of a moment, as YYYY-MM-DD. */
export const pacificDate = (millis: number): string => PACIFIC_DATE.format(new Date(millis));

/**
 * One of the athlete's own results as the document measures it (SI), or null: the sprint's
 * `velocityAt5m` (from the rep document; the effective results do not carry it), or 2 × course length
 * ÷ `totalTime` with the course length the reprocessing used (`markerDistance`, the marker separation).
 */
export function documentValue(spec: DocumentTest, rep: any, velocityAt5m: unknown): number | null {
  if (spec.measure === 'speedAt5m') return positive(velocityAt5m) ? velocityAt5m : null;
  if (spec.measure !== 'courseSpeed') return null;
  const course = [rep?.courseLengthMeters, rep?.markerDistance, rep?.courseDistanceMeters].find(positive);
  return course !== undefined && positive(rep?.totalTime) ? (2 * course) / rep.totalTime : null;
}

export type OwnStation = { labels: RepLabel[]; velocityAt5m: Map<string, number> };

/**
 * The athlete's own result(s) for one test in the document's measure and the chart's units, from
 * their own reads only: every station-testing rep (`labels`: drill, testing event, dribble course)
 * that the effective results (`effective`, already loaded for the page) return as qualified and not
 * a duplicate, recorded on or before `resultsThrough` (Pacific), and not from a testing event the
 * statistics leave out for this athlete's group (`omitted`). Best per testing event, and overall.
 * The jumps use their profile best, which carries no date.
 */
export function ownDocumentResults(metricId: string, playerId: string, own: OwnStation & { effective: any[]; profile: any }, resultsThrough: string | null, ageGroup: number | null,
  omitted: ReadonlySet<string> = new Set()): OwnResults | null {
  const spec = DOCUMENT_TESTS[metricId], test = CLUB_TESTS[metricId];
  if (!spec || !test) return null;
  const shown = (value: number) => value * spec.display.scale;
  if (test.source === 'profile') {
    const value = profileBest(own.profile, test.metric!);
    return value === null ? null : { ageGroup, best: shown(value), results: [shown(value)] };
  }
  const labels = new Map(own.labels.filter(label => label.playerId === playerId).map(label => [label.repId, label] as [string, RepLabel]));
  const results: { eventId: string; value: number }[] = [];
  for (const rep of own.effective) {
    const label = typeof rep?.id === 'string' ? labels.get(rep.id) : undefined;
    if (!label || label.drill !== test.drill || !label.eventId || (test.side && label.side !== test.side)) continue;
    if (omitted.has(label.eventId)) continue;
    if (rep.resultStatus?.qualified !== true || rep.resultStatus?.duplicate === true) continue;
    if (resultsThrough && !(finiteNumber(rep.createdAtMillis) && pacificDate(rep.createdAtMillis) <= resultsThrough)) continue;
    const value = documentValue(spec, rep, own.velocityAt5m.get(rep.id));
    if (value !== null) results.push({ eventId: label.eventId, value });
  }
  if (!results.length) return null;
  const perEvent = [...bestBy(results, index => results[index].eventId, true).values()];
  return { ageGroup, best: shown(Math.max(...perEvent)), results: perEvent.map(shown) };
}

/** The club statistics document, or null when it is absent, unreadable or malformed. */
function clubDocument(organizationId: string): Promise<ClubDocument | null> {
  return remember(`club-document:${organizationId}`, () => Promise.resolve()
    .then(() => db.collection('benchmarks').doc(`club-${organizationId}`).get())
    .then((doc: any) => (doc?.exists ? parseClubDocument(doc.data()) : null))
    .then(document => (document && document.organizationId === organizationId ? document : null))
    .catch(() => null), MEMORY_MS);
}

/** The athlete's own station-testing reps: where each belongs, and the sprint's speed at 5 m. */
const ownStation = (playerId: string): Promise<OwnStation> => remember(`club-own-station:${playerId}`, () => db.collection('players').doc(playerId).collection('reps')
  .where('testingEventId', '>', '').get().then((snapshot: any) => {
    const labels: RepLabel[] = [], velocityAt5m = new Map<string, number>();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      labels.push(repLabel(playerId, doc.id, data));
      if (positive(data?.velocityAt5m)) velocityAt5m.set(doc.id, data.velocityAt5m);
    }
    return { labels, velocityAt5m };
  }), MEMORY_MS);

/**
 * The club comparison for one test from the club statistics document, for any signed-in viewer, or
 * null when the document is absent or lacks the test (the staff reads then answer).
 */
export async function documentClubComparison(viewer: ClubViewer, metricId: string, ownEffective: () => any[]): Promise<ClubComparisonData | null> {
  const spec = DOCUMENT_TESTS[metricId], test = CLUB_TESTS[metricId];
  if (!spec || !test || !viewer.organizationId || !viewer.playerId) return null;
  const document = await clubDocument(viewer.organizationId);
  const place = document ? documentPlace(document, viewer) : null;
  const found = document && place ? documentStats(document, metricId, place) : null;
  if (!document || !place || !found) return null;
  const none: OwnStation = { labels: [], velocityAt5m: new Map() };
  const [station, profile] = await Promise.all([
    test.source === 'station' ? ownStation(viewer.playerId).catch(() => none) : Promise.resolve(none),
    test.source === 'profile' ? ownProfile(viewer.playerId).catch(() => null) : Promise.resolve(null),
  ]);
  const own = ownDocumentResults(metricId, viewer.playerId, { ...station, effective: ownEffective(), profile }, document.resultsThrough, place.ageGroup,
    omittedEvents(document, metricId, place));
  return { organizationName: document.organizationName, gender: found.gender, teamsOnly: false, incomplete: false,
    stats: { ...found.stats, own }, display: spec.display, measureLabel: spec.label };
}
