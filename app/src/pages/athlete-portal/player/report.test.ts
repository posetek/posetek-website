import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/firebase', () => ({ default: {}, auth: { currentUser: null }, db: {}, cloud: {}, storage: {} }));
import { DEMO_REPORT, averageText, comparisonPercentile, nextMetric, ordinal, parseReportResponse, reportFocus, resultText, strongestMetric } from './report';
import type { AthleteTestReport, ReportMetric } from './report';

const metric = (over: Partial<ReportMetric>): ReportMetric => ({
  id: 'sprint', label: 'Sprint', status: 'measured', result: '2.07 s', percentile: 60, band: 'middle',
  count: 8, estimatedCount: 0, average: '2.20 s', recordedAtMillis: 1_000, ...over,
});
const report = (metrics: ReportMetric[], kind: AthleteTestReport['kind'] = 'event'): AthleteTestReport =>
  ({ kind, playerId: 'p1', testDateMillis: 1_793_472_000_000, teamName: 'Team', metrics });

describe('athlete testing report, matching the app', () => {
  it('shows jumps in inches and broad jumps in feet, and leaves other values as sent', () => {
    expect(resultText(metric({ id: 'jump', result: '39.5 cm' }))).toBe('15.6 in');
    expect(resultText(metric({ id: 'broadJump', result: '2.10 m' }))).toBe('6.9 ft');
    expect(averageText(metric({ id: 'jump', average: '40.0 cm' }))).toBe('15.7 in');
    expect(resultText(metric({ id: 'sprint', result: '2.07 s' }))).toBe('2.07 s');
    expect(resultText(metric({ id: 'jump', result: 'about 40 cm' }))).toBe('about 40 cm');
  });

  it('words each status the way the app does', () => {
    expect(resultText(metric({ status: 'measured', result: null }))).toBe('Unavailable');
    expect(resultText(metric({ status: 'estimate', result: '2.07 s' }))).toBe('Estimate · 2.07 s');
    expect(resultText(metric({ status: 'estimate', result: null }))).toBe('Estimate unavailable');
    expect(resultText(metric({ status: 'retest' }))).toBe('Retest needed');
    expect(resultText(metric({ status: 'unavailable' }))).toBe('No result');
  });

  it('shows a percentile only for a measured or estimated result that has a value', () => {
    expect(comparisonPercentile(metric({ percentile: 85 }))).toBe(85);
    expect(comparisonPercentile(metric({ status: 'estimate', percentile: 40 }))).toBe(40);
    expect(comparisonPercentile(metric({ status: 'retest', percentile: 85 }))).toBeNull();
    expect(comparisonPercentile(metric({ result: ' ', percentile: 85 }))).toBeNull();
    expect(comparisonPercentile(metric({ percentile: 101 }))).toBeNull();
    expect(comparisonPercentile(metric({ percentile: null }))).toBeNull();
  });

  it('picks the focus line in the app order: practice, retest, missing baseline, then latest result', () => {
    expect(reportFocus(DEMO_REPORT)).toBe('Practice next: Left-course dribble');
    expect(reportFocus(report([metric({ band: 'practice', percentile: 20, label: 'A' }), metric({ band: 'practice', percentile: 5, label: 'B' })]))).toBe('Practice next: B');
    expect(reportFocus(report([metric({}), metric({ status: 'retest', label: 'Jump' })]))).toBe('Retest next: Jump');
    expect(reportFocus(report([metric({}), metric({ status: 'unavailable', label: 'Shot' })]))).toBe('Next baseline: Shot');
    expect(reportFocus(report([metric({}), metric({ status: 'unavailable', label: 'Shot' })], 'individual'))).toBe('Track next time: Sprint · 2.07 s');
    expect(reportFocus(report([metric({ recordedAtMillis: 1 }), metric({ label: 'Later', recordedAtMillis: 9 })], 'individual'))).toBe('Track next time: Later · 2.07 s');
    expect(reportFocus(report([]))).toBeNull();
  });

  it('names a strength only for a strong measured result of a team event', () => {
    expect(strongestMetric(DEMO_REPORT)?.id).toBe('sprint');
    expect(strongestMetric({ ...DEMO_REPORT, kind: 'individual' })).toBeNull();
    expect(strongestMetric(report([metric({ band: 'middle' }), metric({ band: 'strong', status: 'estimate' })]))).toBeNull();
  });

  it('builds next from a retest, then the lowest measured result, then a missing baseline', () => {
    expect(nextMetric(DEMO_REPORT)?.id).toBe('dribbleLeft');
    expect(nextMetric(report([metric({ percentile: 10 }), metric({ status: 'retest', label: 'Jump' })]))?.label).toBe('Jump');
    expect(nextMetric(report([metric({ status: 'unavailable', label: 'Shot' }), metric({ status: 'estimate', label: 'Est' })]))?.label).toBe('Shot');
    expect(nextMetric(report([metric({ status: 'estimate', label: 'Est' })]))?.label).toBe('Est');
    expect(nextMetric(report([]))).toBeNull();
  });

  it('writes ordinals the way the app does', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 85, 100].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '85th', '100th']);
  });
});

describe('report response acceptance', () => {
  const wire = { ...DEMO_REPORT, playerId: 'p1' };
  it('accepts version 1 for the requested athlete', () => {
    expect(parseReportResponse({ version: 1, report: wire }, 'p1')).toMatchObject({ report: { playerId: 'p1' }, limitedComparison: false, error: null });
    expect(parseReportResponse({ version: 1, report: null }, 'p1')).toEqual({ report: null, limitedComparison: false, error: null });
  });
  it('refuses another version or another athlete', () => {
    expect(parseReportResponse({ version: 2, report: wire }, 'p1')).toEqual({ report: null, limitedComparison: false, error: 'Testing results are unavailable.' });
    expect(parseReportResponse({ version: 1, report: wire }, 'other')).toEqual({ report: null, limitedComparison: false, error: 'Testing results are unavailable.' });
  });
  it('reports a history too large to compare', () => {
    expect(parseReportResponse({ version: 1, comparisonState: 'historyLimit', report: null }, 'p1')).toEqual({ report: null, limitedComparison: true, error: 'The testing history is too large to verify reliably.' });
    expect(parseReportResponse({ version: 1, comparisonState: 'historyLimit', report: wire }, 'p1')).toMatchObject({ limitedComparison: true, error: null });
  });
  it('throws on a payload the app could not decode', () => {
    expect(() => parseReportResponse({ report: wire }, 'p1')).toThrow();
    expect(() => parseReportResponse({ version: 1, report: { ...wire, kind: 'club' } }, 'p1')).toThrow();
    expect(() => parseReportResponse({ version: 1, report: { ...wire, metrics: [{ ...wire.metrics[0], status: 'pending' }] } }, 'p1')).toThrow();
    expect(() => parseReportResponse({ version: 1, report: { ...wire, metrics: [{ ...wire.metrics[0], percentile: 49.5 }] } }, 'p1')).toThrow();
  });
});
