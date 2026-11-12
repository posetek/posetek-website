import { PlayerHeader } from '../PlayerShell';
import { PlayerResultsFeedbackLink } from '../PlayerFeedbackInvitation';
import { showResultsFeedback } from '../feedback-invitation';
import { fullName } from '../../lib/metrics';
import { activeProvisionalEstimates } from '../../../../lib/provisional-estimates';
import type { playerProfile } from '../scoring';
import type { Row } from '../execution';
import type { ReportMetric } from '../report';
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
  { key: 'coach', icon: 'forum', title: 'Ask the AI Coach', detail: 'Dive deeper on my results and get help on how to improve' },
  { key: 'plan', icon: 'calendar_month', title: 'Build my 6-week plan', detail: 'Made from your stats and schedule' },
  { key: 'workout', icon: 'directions_run', title: 'Start a workout now', detail: 'Build one and follow along' },
] as const;

/** The existing results page (Workouts → a test) that holds each report metric's reps. */
export const METRIC_DRILL: Record<string, string> = {
  dribbleLeft: 'dribbling', dribbleRight: 'dribbling', sprint: 'sprint', changeOfDirection: 'changeOfDirection', jump: 'jump', broadJump: 'broadJump',
};

/**
 * Stats, the page a player lands on (Nolan, 2026-11-11): the name, the skill radar first, then
 * the testing report in the live one-pager's score-card layout (each card opens that test's
 * existing results page, which returns here; "Strong today" / "Practice next"; two drills to
 * try), then "So what do I do with these results?" and "How to use PoseTek?".
 * The body scan and the streak/session/favorite tiles are deliberately not shown here.
 */
export default function PlayerStats({ ctx, go, profile, athlete, report, preview, timeZone }: Props) {
  const practice = useReportPractice(ctx.playerId, preview);
  const openTest = (metric: ReportMetric) => { const drill = METRIC_DRILL[metric.id]; if (drill) go('workouts', { drill, from: 'stats' }); };
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
    <StatsReport report={report} practice={{ samples, loading: practice.loading, error: practice.error }} timeZone={timeZone} onOpenTest={openTest} />
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
    <section className="v4-card stats-how" aria-labelledby="stats-how-title">
      <h2 id="stats-how-title" className="stats-section-title">How to use PoseTek?</h2>
      <p>PoseTek is your personal assistant for your sport. We use your test results, your position, your coach’s feedback and more to build workouts and plans made for you, ready to follow in the app.</p>
      <p>Each time you retest, PoseTek learns more about what you need and what you’re aiming for, so your training grows with you.</p>
    </section>
    {showResultsFeedback(ctx.access, profile.totalReps) && <PlayerResultsFeedbackLink />}
  </div>;
}
