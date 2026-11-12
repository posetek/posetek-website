import { db } from '../../../../lib/firebase';
import { metricValue, visibleAttempts } from '../../../../lib/result-values';
import { drillByKey } from '../../lib/drills';
import { accepted, createdMillis, normalizeRep } from '../../lib/metrics';
import type { ReportMetric } from '../report';
import type { Row } from '../execution';

type MetricTest = { drill: string; field: string; scale: number; digits: number; higher: boolean; side?: 'left' | 'right' };

/**
 * The test behind each report metric, as the endpoint defines it (`TESTS` in the backend's
 * athlete-test-report.js): the drill whose reps hold it, the rep field, the scale from the stored
 * value to the reported one (jump heights are stored in metres and reported in centimetres), the
 * reported decimals, and whether a larger value is the better one.
 */
export const METRIC_TESTS: Record<string, MetricTest> = {
  dribbleLeft: { drill: 'dribbling', field: 'totalTime', scale: 1, digits: 2, higher: false, side: 'left' },
  dribbleRight: { drill: 'dribbling', field: 'totalTime', scale: 1, digits: 2, higher: false, side: 'right' },
  sprint: { drill: 'sprint', field: 'totalTime', scale: 1, digits: 2, higher: false },
  changeOfDirection: { drill: 'changeOfDirection', field: 'totalTime', scale: 1, digits: 2, higher: false },
  jump: { drill: 'jump', field: 'jumpHeight', scale: 100, digits: 1, higher: true },
  broadJump: { drill: 'broadJump', field: 'broadJumpDistance', scale: 1, digits: 2, higher: true },
};

export type Split = { label: string; field: string; fallbacks?: string[]; unit: string; scale: number; digits: number };
const SHUTTLE: Split[] = [
  { label: 'Total time', field: 'totalTime', unit: 's', scale: 1, digits: 2 },
  { label: 'Out', field: 'phase1Time', unit: 's', scale: 1, digits: 2 },
  { label: 'Turn', field: 'phase2Time', unit: 's', scale: 1, digits: 2 },
  { label: 'Back', field: 'phase3Time', unit: 's', scale: 1, digits: 2 },
];
/** The numbers shown under the replay for each drill: the same ones the drill's rep page shows. */
export const SPLITS: Record<string, Split[]> = {
  dribbling: [...SHUTTLE, { label: 'Ball distance', field: 'avgBallDistance', unit: 'in', scale: 39.3701, digits: 1 }],
  changeOfDirection: SHUTTLE,
  sprint: [
    { label: 'Total time', field: 'totalTime', unit: 's', scale: 1, digits: 2 },
    { label: 'Top speed', field: 'max_velocity', fallbacks: ['maxVelocity'], unit: 'mph', scale: 2.23694, digits: 1 },
    { label: 'Max acceleration', field: 'max_acceleration', fallbacks: ['maxAcceleration'], unit: 'm/s²', scale: 1, digits: 2 },
  ],
  jump: [{ label: 'Jump height', field: 'jumpHeight', unit: 'in', scale: 39.3701, digits: 1 }],
  broadJump: [
    { label: 'Distance', field: 'broadJumpDistance', unit: 'ft', scale: 3.28084, digits: 1 },
    { label: 'Peak height', field: 'jumpHeight', unit: 'in', scale: 39.3701, digits: 1 },
  ],
};

export const splitText = (raw: number | null | undefined, split: Split): string | null =>
  raw === null || raw === undefined ? null : `${(raw * split.scale).toFixed(split.digits)} ${split.unit}`;

/** A testing day's reps: recorded within a day and a half of the report's test date. */
const DAY_WINDOW = 36 * 3_600_000;
type Scored = { rep: Row; value: number };
const scored = (test: MetricTest, reps: Row[]): Scored[] => reps
  .filter(rep => !test.side || !rep.protocolSide || rep.protocolSide === test.side)
  .map(rep => ({ rep, value: metricValue(rep, test.field) }))
  .filter((item): item is Scored => item.value !== null);
const best = (test: MetricTest, items: Scored[]): Scored => items.reduce((top, item) => (test.higher ? item.value > top.value : item.value < top.value) ? item : top);
const onDay = (items: Scored[], testDateMillis: number) => items.filter(item => Math.abs(createdMillis(item.rep) - testDateMillis) <= DAY_WINDOW);

/**
 * The athlete's rep to replay for one report metric: the rep that carries the reported value; else
 * the best rep of the testing day; else the best rep of the test. Null when none has a value.
 */
export function bestRep(metric: ReportMetric, reps: Record<string, Row[]>, testDateMillis: number): Row | null {
  const test = METRIC_TESTS[metric.id];
  if (!test) return null;
  const all = scored(test, reps[test.drill] || []);
  if (!all.length) return null;
  const target = metric.result ? Number(metric.result.split(' ')[0]) : NaN;
  if (Number.isFinite(target)) {
    const tolerance = 0.5 / 10 ** test.digits + 1e-9;
    const exact = all.filter(item => Math.abs(item.value * test.scale - target) <= tolerance);
    if (exact.length) return exact.reduce((newest, item) => createdMillis(item.rep) > createdMillis(newest.rep) ? item : newest).rep;
  }
  const day = onDay(all, testDateMillis);
  return best(test, day.length ? day : all).rep;
}

export type TeamComparison = {
  /** The teammate whose best result is the middle one of the others on the team, or null. */
  median: { playerId: string; rep: Row; value: number } | null;
  /** The team's mean for each split field (stored units), where at least five athletes have it. */
  averages: Record<string, number>;
  /** Athletes on the team with a result for this test that day. */
  count: number;
};

/** From each team member's reps: the median athlete (never the athlete being viewed) and the split averages. */
export function teamComparison(metricId: string, team: { playerId: string; reps: Row[] }[], ownPlayerId: string, testDateMillis: number): TeamComparison | null {
  const test = METRIC_TESTS[metricId];
  if (!test) return null;
  const bests = team.flatMap(member => {
    const day = onDay(scored(test, member.reps), testDateMillis);
    return day.length ? [{ playerId: member.playerId, ...best(test, day) }] : [];
  });
  const others = bests.filter(item => item.playerId !== ownPlayerId).sort((a, b) => a.value - b.value);
  const averages: Record<string, number> = {};
  for (const split of SPLITS[test.drill] || []) {
    const values = bests.map(item => metricValue(item.rep, split.field, {}, split.fallbacks || [])).filter((value): value is number => value !== null);
    if (values.length >= 5) averages[split.field] = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return { median: others.length ? others[Math.floor((others.length - 1) / 2)] : null, averages, count: bests.length };
}

/**
 * STAFF ONLY, for now. Reads the athlete's team from Firestore, which an admin, manager or coach
 * may do and a player may not. A player's own view needs a backend endpoint that returns the
 * median teammate's pose and the team's split averages without exposing who the teammate is.
 */
export async function loadTeamComparison(metric: ReportMetric, athlete: Row, ownPlayerId: string, testDateMillis: number): Promise<TeamComparison | null> {
  const test = METRIC_TESTS[metric.id];
  if (!test || !athlete?.organizationId || !athlete?.teamId) return null;
  const drill = drillByKey(test.drill);
  const roster = await db.collection('players').where('organizationId', '==', athlete.organizationId).where('teamId', '==', athlete.teamId).limit(40).get();
  const from = new Date(testDateMillis - DAY_WINDOW), to = new Date(testDateMillis + DAY_WINDOW);
  const team = await Promise.all(roster.docs.map(async (doc: any) => {
    const snapshot = await doc.ref.collection('reps').where('createdAt', '>=', from).where('createdAt', '<=', to).get().catch(() => null);
    const reps = snapshot ? visibleAttempts(snapshot.docs.map(normalizeRep)).filter((rep: Row) => accepted(rep, drill)) : [];
    return { playerId: doc.id as string, reps };
  }));
  return teamComparison(metric.id, team, ownPlayerId, testDateMillis);
}
