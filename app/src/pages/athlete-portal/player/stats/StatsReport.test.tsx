import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_REPORT } from '../report';
import type { AthleteTestReport, ReportState } from '../report';
import StatsReport, { reportCaption, teamAverageText } from './StatsReport';

const state = (patch: Partial<ReportState>): ReportState => ({ report: null, limitedComparison: false, error: null, loading: false, reload: () => {}, ...patch });
const render = (report: ReportState) => renderToStaticMarkup(<StatsReport report={report} timeZone="Asia/Tokyo" />);
// `\s` also folds the non-breaking spaces the team-average line uses.
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Every element in a rendered tree, for calling a button's handler without a DOM. */
function elements(node: ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<any>;
  if (typeof element.type === 'function') return elements((element.type as (props: any) => ReactNode)(element.props));
  return [element, ...elements(element.props.children)];
}

describe('Stats report (the live one-pager score-card layout)', () => {
  it('shows the team comparison cards and Strong today, in the one-pager order, and no drills from the plan', () => {
    const html = render(state({ report: DEMO_REPORT })), plain = text(html);
    const order = ['Click on each drill to see more',
      'Left-course dribble', 'Right-course dribble', 'Sprint', 'Vertical jump', 'Strong today'];
    let at = -1;
    for (const item of order) { const next = plain.indexOf(item, at + 1); expect(next, item).toBeGreaterThan(at); at = next; }
    // The drills from the saved plan are not part of Stats (Nolan, 2026-11-12).
    expect(plain).not.toContain('rills to try'); expect(plain).not.toContain('Clear, flat space'); expect(html).not.toContain('<details');
    expect(html.match(/stats-score-card/g)).toHaveLength(4);
    expect(html.match(/left:(\d+)%/g)).toEqual(['left:15%', 'left:50%', 'left:85%', 'left:85%']);
    expect(plain).toContain('Left-course dribble 7.62 s ≈15th percentile Team avg 7.20 s · 8 results');
    expect(plain).toContain('Vertical jump 15.6 in ≈85th percentile Team avg 13.9 in · 8 results');
    expect(html).toContain('aria-label="Approximately 15th team percentile"');
    expect(plain).toContain('Strong today Sprint'); expect(plain).not.toContain('Practice next');
    // The one-pager's findings are titles only; the old sentences, tag and "why" line are gone.
    for (const gone of ['What you’re doing well', 'starting point', 'Why this helps you', 'Position-based', 'Leaderboard']) expect(plain).not.toContain(gone);
  });
  it('words the team-average line by the one-pager rule: an average needs five results', () => {
    const plain = (count: number, average: string | null) => teamAverageText(count, average).replace(/ /g, ' ');
    expect(plain(8, '7.20 s')).toBe('Team avg 7.20 s · 8 results');
    expect(plain(5, '2.20 s')).toBe('Team avg 2.20 s · 5 results');
    expect(plain(3, '2.20 s')).toBe('Team avg unavailable · 3 results');
    expect(plain(14, null)).toBe('Team avg unavailable · 14 results');
    expect(plain(0, null)).toBe('Team avg unavailable');
    // The value and the count each stay on one line in a narrow card.
    expect(teamAverageText(8, '7.20 s')).toBe('Team avg 7.20 s · 8 results');
    const metric = { ...DEMO_REPORT.metrics[2], average: '2.20 s', count: 14, estimatedCount: 2 };
    expect(text(render(state({ report: { ...DEMO_REPORT, metrics: [metric] } })))).toContain('Team avg 2.20 s · 14 results (2 estimated)');
    // Average is shown in the app's units; no count from the endpoint, no line.
    expect(text(render(state({ report: { ...DEMO_REPORT, metrics: [{ ...DEMO_REPORT.metrics[3], average: '40.6 cm', count: 6 }] } })))).toContain('Team avg 16.0 in · 6 results');
    expect(text(render(state({ report: { ...DEMO_REPORT, metrics: [{ ...metric, count: null }] } })))).not.toContain('Team avg');
  });
  it('a test without a usable result shows Retest or No result, no track, and still the group line', () => {
    const base = { ...DEMO_REPORT.metrics[2], average: '2.20 s', count: 14, estimatedCount: 0 };
    const retest = render(state({ report: { ...DEMO_REPORT, metrics: [{ ...base, status: 'retest' }] } }));
    expect(text(retest)).toContain('Sprint Retest No percentile Team avg 2.20 s · 14 results');
    expect(retest).not.toContain('stats-track');
    const missing = text(render(state({ report: { ...DEMO_REPORT, metrics: [{ ...base, status: 'unavailable', result: null, count: null }] } })));
    expect(missing).toContain('Sprint No result No percentile');
    const estimate = text(render(state({ report: { ...DEMO_REPORT, metrics: [{ ...base, status: 'estimate' }] } })));
    expect(estimate).toContain('Sprint 2.07 s ≈85th percentile Estimate Team avg');
  });
  it('a personal report has no comparison: its cards carry the value and the recorded date', () => {
    const report: AthleteTestReport = { kind: 'individual', playerId: 'p1', testDateMillis: Date.UTC(2026, 9, 20, 12), teamName: null, metrics: [
      { id: 'jump', label: 'Vertical jump', status: 'measured', result: '40.6 cm', percentile: null, band: null, count: null, estimatedCount: null, average: null, recordedAtMillis: Date.UTC(2026, 9, 20, 12) },
      { id: 'broadJump', label: 'Broad jump', status: 'measured', result: '2.13 m', percentile: null, band: null, count: null, estimatedCount: null, average: null, recordedAtMillis: Date.UTC(2026, 9, 12, 12) },
    ] };
    const html = render(state({ report })), plain = text(html);
    expect(plain).toContain('Click on each drill to see more Your latest available personal results. Team percentiles need comparable results from the same completed event.');
    expect(html).not.toContain('stats-track'); expect(plain).not.toMatch(/≈\d+/); expect(plain).not.toContain('No percentile');
    expect(plain).toContain('Vertical jump 16.0 in Oct 20, 2026');
    expect(plain).toContain('Broad jump 7.0 ft Oct 12, 2026');
    expect(plain).not.toContain('Strong today');
    expect(plain).not.toContain('Practice next');
  });
  it('limited comparison changes the personal caption only, and an empty report says so', () => {
    expect(reportCaption('individual', true)).toBe('Showing recent personal results. The testing history is too large to compare reliably.');
    expect(reportCaption('event', true)).toBeNull();
    const plain = text(render(state({ report: { ...DEMO_REPORT, kind: 'individual' as const, metrics: [] }, limitedComparison: true })));
    expect(plain).toContain('Showing recent personal results. The testing history is too large to compare reliably.');
    expect(plain).toContain('No recorded test measurements are available yet.');
    expect(plain).not.toContain('Practice next');
  });
  it('loading, error with Try again, and no report', () => {
    expect(text(render(state({ loading: true })))).toBe('Loading your results');
    const reload = vi.fn();
    const error = state({ error: 'Testing results could not be loaded.', reload });
    expect(text(render(error))).toBe('Testing results could not be loaded. Try again');
    const retry = elements(StatsReport({ report: error })).find(element => element.type === 'button');
    retry!.props.onClick();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(text(render(state({})))).toBe('Your results will appear after your first assessment.');
    expect(render(state({}))).not.toContain('Click on each drill');
  });
});
