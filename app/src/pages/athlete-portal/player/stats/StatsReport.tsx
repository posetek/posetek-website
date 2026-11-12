import type { ReactNode } from 'react';
import { averageText, comparisonPercentile, ordinal, strongestMetric, valueText } from '../report';
import type { ReportMetric, ReportState } from '../report';
import type { ReportPractice } from './report-practice';
import { reportDate } from './stats-format';

export type PracticeView = { samples: ReportPractice[]; loading: boolean; error: string | null };

type Props = {
  report: ReportState;
  practice: PracticeView;
  /** Tests pin the zone; the page uses the viewer's, as the app uses the phone's. */
  timeZone?: string;
  /** Picks the test shown in the pose player under the cards. */
  onOpenTest?: (metric: ReportMetric) => void;
  /** The picked test, shown as the pressed card. */
  selectedId?: string | null;
  /** The pose player for the picked test, rendered directly under the cards. */
  detail?: ReactNode;
};

/** The line under the heading. A team testing day has none (Nolan, 2026-11-11); a personal report says why it has no percentiles. */
export function reportCaption(kind: 'event' | 'individual', limitedComparison: boolean): string | null {
  return kind === 'event'
    ? null
    : limitedComparison
      ? 'Showing recent personal results. The testing history is too large to compare reliably.'
      : 'Your latest available personal results. Team percentiles need comparable results from the same completed event.';
}

/** The team-average line, by the live one-pager's rule: an average needs five results. */
export function teamAverageText(count: number, average: string | null): string {
  // Non-breaking spaces keep "7.20 s ·" and "8 results" whole when a narrow card wraps the line.
  const results = `${count} results`;
  if (count >= 5 && average) return `Team avg ${average.replace(/ /g, ' ')} · ${results}`;
  return count ? `Team avg unavailable · ${results}` : 'Team avg unavailable';
}

/**
 * One score card, as the live one-pager's `makeVisualMetric`: the test, its result in large type,
 * the three-band track with the athlete's marker, the approximate percentile and the team average.
 * A personal (non-event) report has no comparison, so its cards carry the recorded date instead.
 */
function ScoreCard({ metric, event, timeZone, selected, onOpen }: { metric: ReportMetric; event: boolean; timeZone?: string; selected: boolean; onOpen?: (metric: ReportMetric) => void }) {
  const rank = comparisonPercentile(metric), value = valueText(metric), estimated = metric.estimatedCount ?? 0;
  // A button, so the whole card picks the test shown in the pose player; its content is phrasing-only for that reason.
  return <button type="button" className="stats-score-card" data-metric={metric.id} aria-pressed={selected} onClick={() => onOpen?.(metric)}>
    <span className="stats-score-label">{metric.label}</span>
    <span className={`stats-score-value${value ? '' : ' muted'}`}>{value ?? (metric.status === 'retest' ? 'Retest' : 'No result')}</span>
    {event && (rank !== null
      ? <>
        <span className="stats-track" aria-hidden="true"><i /><i /><i /><b style={{ left: `${rank}%` }} /></span>
        <span className="stats-score-rank" aria-label={`Approximately ${ordinal(rank)} team percentile`}>≈{ordinal(rank)} percentile</span>
      </>
      : <span className="stats-score-rank muted">No percentile</span>)}
    {metric.status === 'estimate' && value && <span className="stats-caption">Estimate</span>}
    {event && metric.count !== null && <span className="stats-caption">{teamAverageText(metric.count, averageText(metric))}{estimated > 0 ? ` (${estimated} estimated)` : ''}</span>}
    {!event && metric.recordedAtMillis !== null && <span className="stats-caption">{reportDate(metric.recordedAtMillis, timeZone)}</span>}
  </button>;
}

/**
 * The testing report in the live one-pager's order: the score cards, "Strong today", then the
 * drills from the saved plan. It sits under the skill radar on Stats.
 */
export default function StatsReport({ report: state, practice, timeZone, onOpenTest, selectedId = null, detail = null }: Props) {
  const report = state.report;
  if (!report) return <section className="stats-report" aria-label="Your results">
    <div className="v4-card stats-report-empty">
      {state.loading ? <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading your results</p>
        : state.error ? <><p className="stats-subheadline">{state.error}</p><button type="button" className="stats-text-button" onClick={state.reload}>Try again</button></>
          : <p className="stats-subheadline">Your results will appear after your first assessment.</p>}
    </div>
  </section>;
  // "Practice next" is not shown here (Nolan, 2026-11-11); Home still carries the report's focus line.
  const event = report.kind === 'event', strong = strongestMetric(report), samples = practice.samples;
  return <section className="stats-report" aria-label="Your results">
    <div className="stats-report-heading">
      <h2 className="stats-section-title">Click on each drill to see more</h2>
      {reportCaption(report.kind, state.limitedComparison) && <p className="stats-caption">{reportCaption(report.kind, state.limitedComparison)}</p>}
    </div>
    {report.metrics.length
      ? <div className="stats-score-grid">{report.metrics.map(metric => <ScoreCard key={metric.id} metric={metric} event={event} timeZone={timeZone} selected={metric.id === selectedId} onOpen={onOpenTest} />)}</div>
      : <p className="stats-secondary">No recorded test measurements are available yet.</p>}
    {detail}
    {strong && <div className="stats-findings">
      <div><h3>Strong today</h3><p>{strong.label}</p></div>
    </div>}
    {samples.length > 0 && <div className="stats-drills">
      <h2 className="stats-section-title">{samples.length === 2 ? 'Two drills to try' : 'Drills to try'}</h2>
      {samples.map(sample => <details key={sample.id} className="stats-drill" data-drill={sample.id}>
        <summary><span><strong>{sample.name}</strong>{sample.dose && <small>{sample.dose}</small>}</span>
          <span className="material-symbols-outlined" aria-hidden="true">expand_more</span></summary>
        {sample.instruction && <p>{sample.instruction}</p>}
        {sample.equipment && <p className="stats-caption">Equipment: {sample.equipment}</p>}
      </details>)}
      <p className="stats-caption">Clear, flat space. Stop if anything hurts.</p>
    </div>}
  </section>;
}
