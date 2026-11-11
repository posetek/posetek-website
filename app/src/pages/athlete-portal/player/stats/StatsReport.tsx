import { averageText, comparisonPercentile, nextMetric, ordinal, resultText, strongestMetric } from '../report';
import type { ReportMetric, ReportState } from '../report';
import type { ReportPractice } from './report-practice';
import { reportDate } from './stats-format';

export type PracticeView = { samples: ReportPractice[]; loading: boolean; error: string | null };

type Props = {
  report: ReportState;
  /** `PlayerPosition.label` for the athlete, or null. */
  position: string | null;
  practice: PracticeView;
  onOpenPlan: () => void;
  /** Tests pin the zone; the page uses the viewer's, as the app uses the phone's. */
  timeZone?: string;
};

/** "What we'll build next" wording for one metric (`AthleteTestReportSection.nextStep`). */
export function nextStepText(metric: ReportMetric): string {
  switch (metric.status) {
    case 'retest': return `${metric.label}. Retest needed before comparing this result.`;
    case 'unavailable': return `${metric.label}. Record a baseline for your next check.`;
    default: return `${metric.label}. ${resultText(metric)} is a useful starting point for the next check. General exercises in your plan are not described as correcting this result.`;
  }
}

/** "What you're doing well" wording, or the baseline sentence when no strength can be named. */
export function strengthText(report: NonNullable<ReportState['report']>): string {
  const metric = strongestMetric(report), rank = metric ? comparisonPercentile(metric) : null;
  return metric && rank !== null
    ? `${metric.label}. ${resultText(metric)} · about the ${ordinal(rank)} team-session percentile. One of your stronger results in this tested group.`
    : 'Keep building your baseline. More comparable measured results are needed to highlight a team-session strength.';
}

export function reportCaption(kind: 'event' | 'individual', limitedComparison: boolean): string {
  return kind === 'event'
    ? 'Compared with this team’s testing session. Further right means a stronger result. Percentiles are approximate.'
    : limitedComparison
      ? 'Showing recent personal results. The testing history is too large to compare reliably.'
      : 'Your latest available personal results. Team percentiles need comparable results from the same completed event.';
}

/**
 * The team-average line, worded as the parent one-pager's `teamAverageText`
 * (private-report/render.mjs): fewer than five usable results give no comparison.
 */
export function teamAverageText(count: number, average: string | null): string {
  if (count < 5) return `Team average unavailable · ${count} usable results (5 needed)`;
  return average ? `Team average: ${average} · ${count} results` : `Team average unavailable · ${count} results`;
}

/**
 * One row as in the one-pager's focused layout and the app's `AthleteTestReportRow`: label and
 * result, the approximate percentile, the three-band bar and its marker, then the team-average
 * line whenever the report supplies a count (also for a test without a percentile).
 */
function ReportRow({ metric, showDate, timeZone }: { metric: ReportMetric; showDate: boolean; timeZone?: string }) {
  const rank = comparisonPercentile(metric), average = averageText(metric), estimated = metric.estimatedCount ?? 0;
  return <div className="stats-report-row" data-metric={metric.id}>
    <p className="stats-report-row-line"><span><strong>{metric.label}</strong><small> {resultText(metric)}</small></span>
      {rank !== null && <b aria-label={`Approximately ${ordinal(rank)} team percentile`}>~{ordinal(rank)}</b>}</p>
    {rank !== null && <div className="stats-report-bar" aria-hidden="true">
      <span className="stats-report-bands"><i /><i /><i /></span>
      <span className="stats-report-marker" style={{ left: `calc((100% - 14px) * ${rank / 100})` }} />
    </div>}
    {metric.count !== null && <p className="stats-caption">{teamAverageText(metric.count, average)}{estimated > 0 ? ` (${estimated} estimated)` : ''}</p>}
    {showDate && metric.recordedAtMillis !== null && <p className="stats-caption">{reportDate(metric.recordedAtMillis, timeZone)}</p>}
  </div>;
}

/** The report's content in the app's order (`AthleteTestReportSection`): Standing, the two notes, the plan's drills. */
export default function StatsReport({ report: state, position, practice, onOpenPlan, timeZone }: Props) {
  const report = state.report;
  if (!report) return <section className="stats-report" aria-label="Your report">
    <div className="v4-card stats-report-card stats-report-empty">
      <h3>Your report</h3>
      {state.loading ? <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading your report</p>
        : state.error ? <><p className="stats-subheadline">{state.error}</p><button type="button" className="stats-text-button" onClick={state.reload}>Try again</button></>
          : <p className="stats-subheadline">Your report will appear after your first assessment.</p>}
    </div>
  </section>;
  const next = nextMetric(report), samples = practice.samples;
  return <section className="stats-report" aria-label="Your report">
    <h2 className="stats-section-title">Standing</h2>
    <div className="v4-card stats-report-card">
      <div className="stats-report-heading">
        <div className="stats-report-tested"><h3>Tested {reportDate(report.testDateMillis, timeZone)}</h3>
          {report.kind === 'event' && <span className="stats-report-you" aria-hidden="true"><i />You</span>}</div>
        <p className="stats-caption">{reportCaption(report.kind, state.limitedComparison)}</p>
      </div>
      {report.metrics.map(metric => <ReportRow key={metric.id} metric={metric} showDate={report.kind === 'individual'} timeZone={timeZone} />)}
      {!report.metrics.length && <p className="stats-secondary">No verified test measurements are available yet.</p>}
    </div>
    <div className="v4-card stats-report-card">
      <div className="stats-report-note"><h3>What you’re doing well</h3><p>{strengthText(report)}</p></div>
      <div className="stats-report-note"><h3>What we’ll build next</h3>
        <p>{next ? nextStepText(next) : 'Record your next assessment to set a starting point.'}</p>
        {position && <p>{position}. Position-based development is a training goal, not a measured weakness.</p>}
      </div>
    </div>
    <div className="v4-card stats-report-card stats-report-drills">
      <h3>{samples.length === 2 ? 'Two drills from your plan' : 'Drills from your plan'}</h3>
      {/* The one-pager's drill card: title and tag, dose, instruction, equipment, why. A missing field is left out. */}
      {samples.map(sample => <button key={sample.id} type="button" className="stats-report-drill" data-drill={sample.id} onClick={onOpenPlan}>
        <span className="stats-report-drill-name"><strong>{sample.name}</strong>
          {sample.tag && <span className="stats-report-drill-tag">{sample.tag}</span>}
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></span>
        {sample.dose && <span className="stats-report-drill-dose">{sample.dose}</span>}
        {sample.instruction && <span className="stats-report-drill-text">{sample.instruction}</span>}
        {sample.equipment && <small>Equipment: {sample.equipment}</small>}
        <small>Why this helps you: {sample.reason}</small>
      </button>)}
      {samples.length > 0 && <p className="stats-caption stats-report-safety">Clear, flat space. Stop if anything hurts.</p>}
      {!samples.length && (practice.loading
        ? <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading your plan</p>
        : <p className="stats-subheadline">{practice.error ? 'Your saved plan could not be loaded.' : 'No eligible drills from your saved plan are available yet.'}</p>)}
    </div>
  </section>;
}
