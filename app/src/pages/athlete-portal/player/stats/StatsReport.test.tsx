import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_REPORT } from '../report';
import type { AthleteTestReport, ReportState } from '../report';
import StatsReport, { nextStepText, reportCaption, strengthText } from './StatsReport';
import type { PracticeView } from './StatsReport';

const state = (patch: Partial<ReportState>): ReportState => ({ report: null, limitedComparison: false, error: null, loading: false, reload: () => {}, ...patch });
const practice: PracticeView = { samples: [
  { id: 'DRB-005', name: 'Cone maze', reason: 'General practice from your saved plan, not a drill selected here to correct a measured weakness.' },
  { id: 'PAS-001', name: 'Wall pass rhythm', reason: 'General practice from your saved plan, not a drill selected here to correct a measured weakness. Builds first touch.' },
], loading: false, error: null };
const render = (report: ReportState, view: PracticeView = practice, position: string | null = null, onOpenPlan = () => {}) =>
  renderToStaticMarkup(<StatsReport report={report} position={position} practice={view} onOpenPlan={onOpenPlan} timeZone="Asia/Tokyo" />);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Every element in a rendered tree, for calling a button's handler without a DOM. */
function elements(node: ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<any>;
  if (typeof element.type === 'function') return elements((element.type as (props: any) => ReactNode)(element.props));
  return [element, ...elements(element.props.children)];
}

describe('Stats report (AthleteTestReportSection)', () => {
  it('shows the demo report in the app order with its date, legend, markers and sentences', () => {
    const html = render(state({ report: DEMO_REPORT }), practice, 'Winger'), plain = text(html);
    const order = ['Standing', 'Tested Nov 1, 2026', 'You', 'Compared with this team’s testing session. Further right means a stronger result. Percentiles are approximate.',
      'Left-course dribble', 'Right-course dribble', 'Sprint', 'Vertical jump', 'What you’re doing well', 'What we’ll build next', 'Two drills from your plan', 'Cone maze', 'Wall pass rhythm'];
    let at = -1;
    for (const item of order) { const next = plain.indexOf(item, at + 1); expect(next, item).toBeGreaterThan(at); at = next; }
    expect(html.match(/left:calc\(\(100% - 14px\) \* ([\d.]+)\)/g)).toEqual(['left:calc((100% - 14px) * 0.15)', 'left:calc((100% - 14px) * 0.5)', 'left:calc((100% - 14px) * 0.85)', 'left:calc((100% - 14px) * 0.85)']);
    for (const rank of ['~15th', '~50th', '~85th']) expect(plain).toContain(rank);
    expect(html).toContain('aria-label="Approximately 15th team percentile"');
    expect(plain).toContain('Vertical jump 15.6 in');
    expect(plain).toContain('Sprint. 2.07 s · about the 85th team-session percentile. One of your stronger results in this tested group.');
    expect(plain).toContain('Left-course dribble. 7.62 s is a useful starting point for the next check. General exercises in your plan are not described as correcting this result.');
    expect(plain).toContain('Winger. Position-based development is a training goal, not a measured weakness.');
    expect(plain).toContain('Why this helps you: General practice from your saved plan, not a drill selected here to correct a measured weakness. Builds first touch.');
    expect(plain).not.toContain('Leaderboard');
  });
  it('writes the tested date in the viewer’s zone, as the app does', () => {
    const html = renderToStaticMarkup(<StatsReport report={state({ report: DEMO_REPORT })} position={null} practice={practice} onOpenPlan={() => {}} timeZone="America/Los_Angeles" />);
    expect(html).toContain('Tested Oct 31, 2026');
  });
  it('opens My workout plan from a drill row', () => {
    const open = vi.fn();
    const tree = elements(StatsReport({ report: state({ report: DEMO_REPORT }), position: null, practice, onOpenPlan: open, timeZone: 'UTC' }));
    const drills = tree.filter(element => element.type === 'button' && element.props.className === 'stats-report-drill');
    expect(drills).toHaveLength(2);
    drills[1].props.onClick();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('an individual report has no percentiles or legend and dates each metric', () => {
    const report: AthleteTestReport = { kind: 'individual', playerId: 'p1', testDateMillis: Date.UTC(2026, 9, 20, 12), teamName: null, metrics: [
      { id: 'jump', label: 'Vertical jump', status: 'measured', result: '40.6 cm', percentile: null, band: null, count: null, estimatedCount: null, average: null, recordedAtMillis: Date.UTC(2026, 9, 20, 12) },
      { id: 'broadJump', label: 'Broad jump', status: 'measured', result: '2.13 m', percentile: null, band: null, count: null, estimatedCount: null, average: null, recordedAtMillis: Date.UTC(2026, 9, 12, 12) },
    ] };
    const html = render(state({ report })), plain = text(html);
    expect(plain).toContain('Your latest available personal results. Team percentiles need comparable results from the same completed event.');
    expect(html).not.toContain('stats-report-bar'); expect(html).not.toContain('stats-report-you'); expect(plain).not.toMatch(/~\d/);
    expect(plain).toContain('Vertical jump 16.0 in Oct 20, 2026');
    expect(plain).toContain('Broad jump 7.0 ft Oct 12, 2026');
    expect(plain).toContain('Keep building your baseline. More comparable measured results are needed to highlight a team-session strength.');
    expect(plain).toContain('Vertical jump. 16.0 in is a useful starting point');
  });
  it('limited comparison changes the individual caption only', () => {
    expect(reportCaption('individual', true)).toBe('Showing recent personal results. The testing history is too large to compare reliably.');
    expect(reportCaption('event', true)).toBe('Compared with this team’s testing session. Further right means a stronger result. Percentiles are approximate.');
    const report = { ...DEMO_REPORT, kind: 'individual' as const, metrics: [] };
    const plain = text(render(state({ report, limitedComparison: true })));
    expect(plain).toContain('Showing recent personal results. The testing history is too large to compare reliably.');
    expect(plain).toContain('No verified test measurements are available yet.');
    expect(plain).toContain('Record your next assessment to set a starting point.');
  });
  it('shows the team average with estimated results only beside a percentile', () => {
    const metric = { ...DEMO_REPORT.metrics[2], average: '2.20 s', count: 14, estimatedCount: 2 };
    expect(text(render(state({ report: { ...DEMO_REPORT, metrics: [metric] } })))).toContain('Team average: 2.20 s · 14 results (2 estimated)');
    expect(text(render(state({ report: { ...DEMO_REPORT, metrics: [{ ...metric, status: 'retest' }] } })))).not.toContain('Team average');
  });
  it('words retests and missing baselines as the app does', () => {
    const base = DEMO_REPORT.metrics[0];
    expect(nextStepText({ ...base, status: 'retest' })).toBe('Left-course dribble. Retest needed before comparing this result.');
    expect(nextStepText({ ...base, status: 'unavailable' })).toBe('Left-course dribble. Record a baseline for your next check.');
    expect(strengthText({ ...DEMO_REPORT, kind: 'individual' })).toMatch(/^Keep building your baseline/);
  });
  it('loading, error with Try again, and no report', () => {
    expect(text(render(state({ loading: true })))).toBe('Your report Loading your report');
    const reload = vi.fn();
    const error = state({ error: 'Testing results could not be loaded.', reload });
    expect(text(render(error))).toBe('Your report Testing results could not be loaded. Try again');
    const retry = elements(StatsReport({ report: error, position: null, practice, onOpenPlan: () => {} })).find(element => element.type === 'button');
    retry!.props.onClick();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(text(render(state({})))).toBe('Your report Your report will appear after your first assessment.');
    expect(render(state({}))).not.toContain('Standing');
  });
  it('the drills card: one drill, loading, plan error, nothing eligible', () => {
    const report = state({ report: DEMO_REPORT });
    expect(text(render(report, { ...practice, samples: practice.samples.slice(0, 1) }))).toContain('Drills from your plan Cone maze');
    expect(text(render(report, { samples: [], loading: true, error: null }))).toContain('Drills from your plan Loading your plan');
    expect(text(render(report, { samples: [], loading: false, error: 'denied' }))).toContain('Your saved plan could not be loaded.');
    expect(text(render(report, { samples: [], loading: false, error: null }))).toContain('No eligible drills from your saved plan are available yet.');
  });
});
