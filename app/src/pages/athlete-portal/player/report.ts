import { useCallback, useEffect, useRef, useState } from 'react';
import { auth, cloud } from '../../../lib/firebase';

/**
 * The athlete's testing report, from the `getAthleteTestReport` callable. This is the web copy of
 * the app's `AthleteTestReport` (KickAI/Stats/AthleteTestReport.swift): the same fields, the same
 * wording and the same rules for what may be shown. Home reads its focus line; Stats renders it.
 */
export type ReportStatus = 'measured' | 'estimate' | 'retest' | 'unavailable';
export type ReportBand = 'practice' | 'middle' | 'strong';
export type ReportMetric = {
  id: string;
  label: string;
  status: ReportStatus;
  result: string | null;
  percentile: number | null;
  band: ReportBand | null;
  count: number | null;
  estimatedCount: number | null;
  average: string | null;
  recordedAtMillis: number | null;
};
export type AthleteTestReport = {
  kind: 'event' | 'individual';
  playerId: string;
  testDateMillis: number;
  teamName: string | null;
  metrics: ReportMetric[];
};

export const BAND_LABELS: Record<ReportBand, string> = { practice: 'Practice next', middle: 'Team middle', strong: 'Strong' };

/** The app shows jump heights in inches and broad jumps in feet; every other value is shown as sent. */
function displayValue(metric: ReportMetric, text: string | null): string | null {
  if (text === null) return null;
  const parts = text.split(' ').filter(Boolean);
  const value = Number(parts[0]);
  if (parts.length !== 2 || parts[0] === '' || !Number.isFinite(value) || value <= 0) return text;
  if (metric.id === 'jump' && parts[1] === 'cm') return `${(value / 2.54).toFixed(1)} in`;
  if (metric.id === 'broadJump' && parts[1] === 'm') return `${(value / 0.3048).toFixed(1)} ft`;
  return text;
}

export function resultText(metric: ReportMetric): string {
  const shown = displayValue(metric, metric.result);
  switch (metric.status) {
    case 'measured': return shown ?? 'Unavailable';
    case 'estimate': return shown ? `Estimate · ${shown}` : 'Estimate unavailable';
    case 'retest': return 'Retest needed';
    case 'unavailable': return 'No result';
  }
}

/** A percentile is shown only for a measured or estimated result that has a value. */
export function comparisonPercentile(metric: ReportMetric): number | null {
  if (metric.status !== 'measured' && metric.status !== 'estimate') return null;
  if (!metric.result || !metric.result.trim()) return null;
  const rank = metric.percentile;
  return rank !== null && rank >= 0 && rank <= 100 ? rank : null;
}

export const averageText = (metric: ReportMetric): string | null => displayValue(metric, metric.average);

const least = <T,>(items: T[], value: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((best, item) => best === undefined || value(item) < value(best) ? item : best, undefined);
const greatest = <T,>(items: T[], value: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((best, item) => best === undefined || value(item) > value(best) ? item : best, undefined);

/** The one line Home shows under the week: what to practice, retest, record or track next. */
export function reportFocus(report: AthleteTestReport): string | null {
  const practice = least(report.metrics.filter(metric => metric.band === 'practice'), metric => metric.percentile ?? 100);
  if (practice) return `Practice next: ${practice.label}`;
  const retest = report.metrics.find(metric => metric.status === 'retest');
  if (retest) return `Retest next: ${retest.label}`;
  const pending = report.kind === 'event' ? report.metrics.find(metric => metric.status === 'unavailable') : undefined;
  if (pending) return `Next baseline: ${pending.label}`;
  const latest = greatest(report.metrics.filter(metric => metric.status === 'measured' || metric.status === 'estimate'), metric => metric.recordedAtMillis ?? 0);
  return latest ? `Track next time: ${latest.label} · ${resultText(latest)}` : null;
}

/** "What you're doing well": the strongest measured result of a team testing event. */
export function strongestMetric(report: AthleteTestReport): ReportMetric | null {
  if (report.kind !== 'event') return null;
  return greatest(report.metrics.filter(metric => metric.status === 'measured' && metric.band === 'strong' && comparisonPercentile(metric) !== null),
    metric => comparisonPercentile(metric) ?? 0) ?? null;
}

/** "What we'll build next": a retest first, then the lowest measured result, then a missing baseline. */
export function nextMetric(report: AthleteTestReport): ReportMetric | null {
  const retest = report.metrics.find(metric => metric.status === 'retest');
  if (retest) return retest;
  const lowest = least(report.metrics.filter(metric => metric.status === 'measured' && comparisonPercentile(metric) !== null), metric => comparisonPercentile(metric) ?? 100);
  if (lowest) return lowest;
  return report.metrics.find(metric => metric.status === 'unavailable')
    ?? report.metrics.find(metric => metric.status === 'measured' || metric.status === 'estimate') ?? null;
}

/** English ordinal for a percentile, as the app's ordinal number formatter writes it ("85th"). */
export function ordinal(rank: number): string {
  const tens = rank % 100, ones = rank % 10;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
  return `${rank}${suffix}`;
}

const STATUSES: ReportStatus[] = ['measured', 'estimate', 'retest', 'unavailable'];
const BANDS: ReportBand[] = ['practice', 'middle', 'strong'];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const malformed = (): never => { throw new Error('malformed report'); };
const text = (value: unknown): string => typeof value === 'string' ? value : malformed();
const optionalText = (value: unknown): string | null => value === undefined || value === null ? null : text(value);
const optionalNumber = (value: unknown): number | null => value === undefined || value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : malformed();
const optionalInteger = (value: unknown): number | null => { const number = optionalNumber(value); return number === null || Number.isInteger(number) ? number : malformed(); };

function parseMetric(value: unknown): ReportMetric {
  if (!isRecord(value)) return malformed();
  const status = STATUSES.find(item => item === value.status) ?? malformed();
  const band = value.band === undefined || value.band === null ? null : BANDS.find(item => item === value.band) ?? malformed();
  return {
    id: text(value.id), label: text(value.label), status, band,
    result: optionalText(value.result), percentile: optionalInteger(value.percentile),
    count: optionalInteger(value.count), estimatedCount: optionalInteger(value.estimatedCount),
    average: optionalText(value.average), recordedAtMillis: optionalNumber(value.recordedAtMillis),
  };
}

function parseReport(value: unknown): AthleteTestReport {
  if (!isRecord(value) || !Array.isArray(value.metrics)) return malformed();
  const kind = value.kind === 'event' || value.kind === 'individual' ? value.kind : malformed();
  return {
    kind, playerId: text(value.playerId), teamName: optionalText(value.teamName),
    testDateMillis: optionalNumber(value.testDateMillis) ?? malformed(),
    metrics: value.metrics.map(parseMetric),
  };
}

export type ReportResult = { report: AthleteTestReport | null; limitedComparison: boolean; error: string | null };

/** Applies the app's acceptance rules to one callable response. Throws when the payload cannot be read. */
export function parseReportResponse(data: unknown, playerId: string): ReportResult {
  if (!isRecord(data) || typeof data.version !== 'number') return malformed();
  const report = data.report === undefined || data.report === null ? null : parseReport(data.report);
  if (data.version !== 1 || (report !== null && report.playerId !== playerId)) return { report: null, limitedComparison: false, error: 'Testing results are unavailable.' };
  const limitedComparison = data.comparisonState === 'historyLimit';
  return { report, limitedComparison, error: limitedComparison && !report ? 'The testing history is too large to verify reliably.' : null };
}

/** Sample data for the local preview: the app's own demo report. */
export const DEMO_REPORT: AthleteTestReport = {
  kind: 'event', playerId: 'demo-avery', testDateMillis: 1_793_472_000_000, teamName: 'Summit Demo',
  metrics: ([['dribbleLeft', 'Left-course dribble', '7.62 s', 15, 'practice'], ['dribbleRight', 'Right-course dribble', '7.05 s', 50, 'middle'],
    ['sprint', 'Sprint', '2.07 s', 85, 'strong'], ['jump', 'Vertical jump', '39.5 cm', 85, 'strong']] as const)
    .map(([id, label, result, percentile, band]) => ({ id, label, status: 'measured' as const, result, percentile, band, count: 3, estimatedCount: 0, average: null, recordedAtMillis: null })),
};

export type ReportState = ReportResult & { loading: boolean; reload: () => void };

/**
 * One report per athlete and signed-in session, loaded once for the whole workspace as the app
 * does. A response is dropped when the athlete or the signed-in account changed while it loaded.
 */
export function useAthleteTestReport(playerId: string | null, preview: boolean): ReportState {
  const [state, setState] = useState<ReportResult & { loading: boolean }>({ report: null, limitedComparison: false, error: null, loading: false });
  const [attempt, setAttempt] = useState(0);
  const ticket = useRef(0);
  useEffect(() => {
    const current = ++ticket.current;
    if (!playerId) { setState({ report: null, limitedComparison: false, error: null, loading: false }); return; }
    if (preview) { setState({ report: { ...DEMO_REPORT, playerId }, limitedComparison: false, error: null, loading: false }); return; }
    const user = auth.currentUser;
    if (!user || user.isAnonymous) { setState({ report: null, limitedComparison: false, error: null, loading: false }); return; }
    setState({ report: null, limitedComparison: false, error: null, loading: true });
    const stale = () => current !== ticket.current || auth.currentUser?.uid !== user.uid;
    cloud.httpsCallable('getAthleteTestReport', { timeout: 90_000 })({ playerId }).then(response => {
      if (stale()) return;
      setState({ ...parseReportResponse(response.data, playerId), loading: false });
    }).catch(() => {
      if (!stale()) setState({ report: null, limitedComparison: false, error: 'Testing results could not be loaded.', loading: false });
    });
    return () => { ticket.current += 1; };
  }, [playerId, preview, attempt]);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, reload };
}
