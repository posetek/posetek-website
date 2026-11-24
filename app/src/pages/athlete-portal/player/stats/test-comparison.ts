import { cloud } from '../../../../lib/firebase';
import { metricValue } from '../../../../lib/result-values';
import { createdMillis } from '../../lib/metrics';
import { remember } from '../../lib/replay-cache';
import { valueText } from '../report';
import type { AthleteTestReport, ReportMetric } from '../report';
import type { Row } from '../execution';

type MetricTest = { drill: string; field: string; scale: number; digits: number; side?: 'left' | 'right' };

/**
 * The test behind each report metric, as the endpoint defines it (`TESTS` in the backend's
 * athlete-test-report.js): the drill whose reps hold it, the rep field, the scale from the stored
 * value to the reported one (jump heights are stored in metres and reported in centimetres), the
 * reported decimals and the dribbling side.
 */
export const METRIC_TESTS: Record<string, MetricTest> = {
  dribbleLeft: { drill: 'dribbling', field: 'totalTime', scale: 1, digits: 2, side: 'left' },
  dribbleRight: { drill: 'dribbling', field: 'totalTime', scale: 1, digits: 2, side: 'right' },
  sprint: { drill: 'sprint', field: 'totalTime', scale: 1, digits: 2 },
  changeOfDirection: { drill: 'changeOfDirection', field: 'totalTime', scale: 1, digits: 2 },
  jump: { drill: 'jump', field: 'jumpHeight', scale: 100, digits: 1 },
  broadJump: { drill: 'broadJump', field: 'broadJumpDistance', scale: 1, digits: 2 },
};

/** One number under the replay; `higher` says whether a larger value is the better one. */
export type Split = { label: string; field: string; fallbacks?: string[]; unit: string; scale: number; digits: number; higher: boolean };
const SHUTTLE: Split[] = [
  { label: 'Total time', field: 'totalTime', unit: 's', scale: 1, digits: 2, higher: false },
  { label: 'Out', field: 'phase1Time', unit: 's', scale: 1, digits: 2, higher: false },
  { label: 'Turn', field: 'phase2Time', unit: 's', scale: 1, digits: 2, higher: false },
  { label: 'Back', field: 'phase3Time', unit: 's', scale: 1, digits: 2, higher: false },
];
/** The numbers shown under the replay for each drill: the same ones the drill's rep page shows. */
export const SPLITS: Record<string, Split[]> = {
  // The ball kept closer is the better dribble.
  dribbling: [...SHUTTLE, { label: 'Ball distance', field: 'avgBallDistance', unit: 'in', scale: 39.3701, digits: 1, higher: false }],
  changeOfDirection: SHUTTLE,
  sprint: [
    { label: 'Total time', field: 'totalTime', unit: 's', scale: 1, digits: 2, higher: false },
    { label: 'Top speed', field: 'max_velocity', fallbacks: ['maxVelocity'], unit: 'mph', scale: 2.23694, digits: 1, higher: true },
    { label: 'Max acceleration', field: 'max_acceleration', fallbacks: ['maxAcceleration'], unit: 'm/s²', scale: 1, digits: 2, higher: true },
  ],
  jump: [{ label: 'Jump height', field: 'jumpHeight', unit: 'in', scale: 39.3701, digits: 1, higher: true }],
  broadJump: [
    { label: 'Distance', field: 'broadJumpDistance', unit: 'ft', scale: 3.28084, digits: 1, higher: true },
    { label: 'Peak height', field: 'jumpHeight', unit: 'in', scale: 39.3701, digits: 1, higher: true },
  ],
};

export const splitText = (raw: number | null | undefined, split: Split): string | null =>
  raw === null || raw === undefined ? null : `${(raw * split.scale).toFixed(split.digits)} ${split.unit}`;

export type Standing = 'better' | 'worse' | 'level';
/** Within this share of the team's value a row reads as level. */
export const LEVEL_SHARE = .01;

/**
 * The athlete against the team on one row, both in the row's shown units: the difference of the two
 * shown figures (so it agrees with them) and whether it is better, worse or level. Level when the
 * shown figures are equal or within `LEVEL_SHARE` of the team's value.
 */
export function versusTeam(mine: number, team: number, split: Pick<Split, 'digits' | 'higher'>): { standing: Standing; difference: number } {
  const shown = (value: number) => Number(value.toFixed(split.digits));
  const difference = shown(shown(mine) - shown(team));
  const level = difference === 0 || Math.abs(difference) <= LEVEL_SHARE * Math.abs(shown(team)) + 1e-9;
  return { standing: level ? 'level' : (difference > 0) === split.higher ? 'better' : 'worse', difference };
}

export type SplitRow = { label: string; mine: string | null; average: string | null; standing: Standing | null; difference: string | null };

/** Compare the numbers exactly as displayed, including the report's rounding and unit conversion. */
export function shownSplitRow(split: Split, mine: string | null, average: string | null): SplitRow {
  const base = { label: split.label, mine, average, standing: null, difference: null };
  const shownNumber = (text: string | null) => {
    if (!text) return null;
    const [value, unit, ...rest] = text.trim().split(/\s+/);
    return unit === split.unit && !rest.length && Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const ownValue = shownNumber(mine), teamValue = shownNumber(average);
  if (ownValue === null || teamValue === null) return base;
  const { standing, difference } = versusTeam(ownValue, teamValue, split);
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  return { ...base, standing, difference: `${sign}${Math.abs(difference).toFixed(split.digits)} ${split.unit}` };
}

export function splitRow(split: Split, mine: number | null | undefined, team: number | null | undefined): SplitRow {
  return shownSplitRow(split, splitText(mine, split), splitText(team, split));
}

/** A team's measured splits remain available when the athlete has only a reviewed total or no matching replay. */
export function comparisonRows(metric: ReportMetric, rep: Row | null, metadata: Row, team: TeamComparison | null, headlineAverage: string | null): SplitRow[] {
  const test = METRIC_TESTS[metric.id];
  const result = valueText(metric);
  if (!test || !result) return [];
  return SPLITS[test.drill].flatMap(split => {
    if (split.field === test.field) return [shownSplitRow(split, result, headlineAverage)];
    const mine = rep && metric.status === 'measured' ? metricValue(rep, split.field, metadata, split.fallbacks || []) : null;
    const row = splitRow(split, mine, team?.averages[split.field]);
    return row.mine || row.average ? [row] : [];
  });
}

/** Older reports may identify a capture by its value and testing day alone. */
const DAY_WINDOW = 36 * 3_600_000;

/** A replay or split must belong to the result the scorecard retained. Its timestamp also identifies older rows without a side. */
export function bestRep(metric: ReportMetric, reps: Record<string, Row[]>, testDateMillis: number): Row | null {
  const test = METRIC_TESTS[metric.id];
  if (!test || !metric.result || (metric.status !== 'measured' && metric.status !== 'estimate')) return null;
  const precision = 10 ** test.digits;
  const target = Math.round(Number(metric.result.split(' ')[0]) * precision);
  const candidates = reps[test.drill] || [];
  const matches = candidates.filter(rep => {
    if (rep.resultStatus?.duplicate) return false;
    const review = rep.reviewedResult;
    if (metric.status === 'measured' && review) return false;
    if (metric.status === 'estimate' && (review?.status !== 'estimate' || review.metric !== test.field ||
      review.unit !== (test.field === 'totalTime' ? 's' : 'm') || (test.side && review.protocolSide && review.protocolSide !== test.side) ||
      !review.revisionId || review.revisionId !== rep.resultStatus?.revisionId)) return false;
    const side = rep.protocolSide ?? review?.protocolSide;
    if (test.side && side && side !== test.side) return false;
    const recorded = createdMillis(rep);
    if (metric.recordedAtMillis != null) {
      if (recorded !== metric.recordedAtMillis) return false;
    } else if ((test.side && side !== test.side) || Math.abs(recorded - testDateMillis) > DAY_WINDOW) return false;
    const value = metric.status === 'estimate' ? review.value : metricValue(rep, test.field);
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    const scaled = value * test.scale;
    // The report rounds each result to an integer before it compares or prints scores.
    return Math.round((scaled + Number.EPSILON * scaled) * precision) === target;
  });
  return matches.length === 1 ? matches[0] : null;
}

export type AnonymousMedian = { status: 'measured' | 'estimate'; rep: Row; artifacts: Record<string, unknown> };
export type TeamComparison = { averages: Record<string, number>; median: AnonymousMedian | null };

type ComparisonResponse = {
  version: number;
  playerId: string;
  metricId: string;
  testDateMillis: number | null;
  selectedResult: Pick<ReportMetric, 'result' | 'status' | 'recordedAtMillis'> | null;
  comparisonState: string;
  count: number | null;
  averages: Record<string, number>;
  median: AnonymousMedian | null;
};

/** The server qualifies this athlete and cohort. An older card must never borrow a newer event's splits. */
export function loadTeamComparison(metric: ReportMetric, report: AthleteTestReport, athlete: Row, playerId: string): Promise<TeamComparison | null> {
  const test = METRIC_TESTS[metric.id];
  if (!test || report.kind !== 'event' || report.playerId !== playerId || !metric.result || !metric.average || (metric.count ?? 0) < 5 ||
      !athlete?.organizationId || !athlete?.teamId || !['measured', 'estimate'].includes(metric.status)) return Promise.resolve(null);
  const key = JSON.stringify([playerId, athlete.organizationId, athlete.teamId, report.testDateMillis, metric.id, metric.recordedAtMillis,
    metric.status, metric.result, metric.count, metric.average]);
  return remember(`test-comparison:${key}`, async () => {
    const { data } = await cloud.httpsCallable('getAthleteTestComparison', { timeout: 120_000 })({ playerId, metricId: metric.id });
    const response = data as ComparisonResponse | null;
    const selected = response?.selectedResult;
    if (!response || response.version !== 1 || response.comparisonState !== 'available' ||
        response.playerId !== playerId || response.metricId !== metric.id || response.testDateMillis !== report.testDateMillis ||
        response.count !== metric.count || !selected || selected.recordedAtMillis !== metric.recordedAtMillis ||
        selected.status !== metric.status || selected.result !== metric.result) return null;
    // An average can change after a teammate's review even when the count and the athlete's own result stay the same.
    const primary = response.averages?.[test.field];
    const reportedAverage = Number(metric.average!.split(' ')[0]);
    if (!Number.isFinite(primary) || !Number.isFinite(reportedAverage) ||
        Math.abs(primary * test.scale - reportedAverage) > 0.5 / 10 ** test.digits + 1e-9) return null;
    const averages: Record<string, number> = {};
    for (const split of SPLITS[test.drill]) {
      const amount = response.averages[split.field];
      if (Number.isFinite(amount) && amount > 0) averages[split.field] = amount;
    }
    const median = response.median;
    return { averages, median: median?.status === 'measured' || median?.status === 'estimate' ? median : null };
  }, 5 * 60_000, { size: response => response ? JSON.stringify(response).length * 2 : 128 });
}
