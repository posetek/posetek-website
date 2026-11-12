import { PlayerHeader } from '../PlayerShell';
import { PlayerResultsFeedbackLink } from '../PlayerFeedbackInvitation';
import { showResultsFeedback } from '../feedback-invitation';
import { fullName } from '../../lib/metrics';
import { activeProvisionalEstimates } from '../../../../lib/provisional-estimates';
import type { playerProfile } from '../scoring';
import type { Row } from '../execution';
import type { PlayerTabProps } from '../workspace';
import SkillBenchmarks from './SkillBenchmarks';
import StatsReport from './StatsReport';
import { reportPracticeSamples } from './report-practice';
import { reportDate } from './stats-format';
import { useReportPractice } from './use-report-practice';
import './stats.css';

type Props = PlayerTabProps & { profile: ReturnType<typeof playerProfile>; dataset: Row; timeZone?: string };

/** The three next steps offered under the results. Each opens a page the workspace already has. */
const NEXT_STEPS = [
  { key: 'coach', icon: 'forum', title: 'Ask the AI Coach', detail: 'Find out what to work on' },
  { key: 'plan', icon: 'calendar_month', title: 'Build my 6-week plan', detail: 'Made from your stats and schedule' },
  { key: 'workout', icon: 'directions_run', title: 'Start a workout now', detail: 'Build one and follow along' },
] as const;

/**
 * Stats, the page a player lands on (Nolan, 2026-11-11): the name, the skill radar first, then
 * the testing report in the live one-pager's score-card layout (team comparison, "Strong today" /
 * "Practice next", two drills to try), then "So what do I do with these results?" with the three
 * next steps. The body scan and the streak/session/favorite tiles are deliberately not shown here.
 */
export default function PlayerStats({ ctx, go, profile, athlete, report, preview, timeZone }: Props) {
  const practice = useReportPractice(ctx.playerId, preview);
  const samples = report.report ? reportPracticeSamples(practice.plan, report.report.playerId, practice.catalog) : [];
  const estimates = activeProvisionalEstimates(ctx.provisionalEstimates, ctx.allResultReps?.() || ctx.allStatsReps());
  const tested = report.report ? [report.report.teamName, `Tested ${reportDate(report.report.testDateMillis, timeZone)}`].filter(Boolean).join(' · ') : null;
  const open = { coach: () => go('coach'), plan: () => go('stats', { screen: 'plan' }), workout: () => go('workouts', { screen: 'workout' }) };
  return <div className="stats-page">
    <PlayerHeader title="Stats" />
    <div className="stats-identity">
      <p className="stats-name">{fullName(athlete)}</p>
      {tested && <p className="stats-caption">{tested}</p>}
    </div>
    <SkillBenchmarks profile={profile} estimates={estimates} />
    <StatsReport report={report} practice={{ samples, loading: practice.loading, error: practice.error }} timeZone={timeZone} />
    <section className="stats-next" aria-labelledby="stats-next-title">
      <h2 id="stats-next-title" className="stats-section-title">So what do I do with these results?</h2>
      <div className="stats-next-grid">
        {NEXT_STEPS.map(step => <button key={step.key} type="button" className="stats-next-card" data-next={step.key} onClick={open[step.key]}>
          <span className="material-symbols-outlined" aria-hidden="true">{step.icon}</span>
          <strong>{step.title}</strong><small>{step.detail}</small>
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>)}
      </div>
    </section>
    {showResultsFeedback(ctx.access, profile.totalReps) && <PlayerResultsFeedbackLink />}
  </div>;
}
