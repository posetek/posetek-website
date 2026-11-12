import { useEffect, useState } from 'react';
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
import TestPosePlayer from './TestPosePlayer';
import ClubComparison from './ClubComparison';
import { prefetchClubComparison } from './club-comparison';
import { METRIC_TESTS } from './test-comparison';
import { warmStatsReplays } from './test-replay';
import { reportDate } from './stats-format';
import './stats.css';

type Props = PlayerTabProps & {
  profile: ReturnType<typeof playerProfile>; dataset: Row; timeZone?: string;
  /** "Start a workout now": the workspace opens Workouts with its workout builder up. */
  onStartWorkout?: () => void;
};

/**
 * The three next steps offered under the results. Each opens what the workspace already has for
 * it: the Coach tab, My workout plan (the planner when there is no plan yet), and the builder the
 * hub's Build Workout card opens.
 */
const NEXT_STEPS = [
  { key: 'coach', icon: 'forum', title: 'Ask the AI Coach', detail: 'Dive deeper on my results and get help on how to improve' },
  { key: 'plan', icon: 'calendar_month', title: 'Build my 6-week plan', detail: 'Made from your stats and schedule' },
  { key: 'workout', icon: 'directions_run', title: 'Start a workout now', detail: 'Build one and follow along' },
] as const;

/**
 * Stats, the page a player lands on (Nolan, 2026-11-11): the name, the skill radar first, then
 * the testing report in the live one-pager's score-card layout. A card picks the test shown in
 * the pose player under the cards (the athlete's best rep as pose only, the team's median athlete
 * as a shadow, the rep's numbers beside the team's averages). Then "Strong today", "So what do I
 * do with these results?" and "How to use PoseTek?".
 * Deliberately not shown here: the body scan, the streak/session/favorite tiles, and (Nolan,
 * 2026-11-12) the two drills from the plan and the lifetime training totals.
 */
export default function PlayerStats({ ctx, go, profile, athlete, report, reps, preview, timeZone, onStartWorkout }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  // Until a card is chosen the player shows the first test that has a result.
  const metrics = report.report?.metrics.filter(metric => METRIC_TESTS[metric.id]) ?? [];
  const selected = metrics.find(metric => metric.id === picked) ?? metrics.find(metric => metric.result) ?? metrics[0] ?? null;
  const openTest = (metric: ReportMetric) => { if (METRIC_TESTS[metric.id]) setPicked(metric.id); };
  const estimates = activeProvisionalEstimates(ctx.provisionalEstimates, ctx.allResultReps?.() || ctx.allStatsReps());
  const tested = report.report ? [report.report.teamName, `Tested ${reportDate(report.report.testDateMillis, timeZone)}`].filter(Boolean).join(' · ') : null;
  const open = { coach: () => go('coach'), plan: () => go('stats', { screen: 'plan' }), workout: onStartWorkout ?? (() => go('workouts')) };
  // Every test's replay loads in the background once the report is here, so the first click on a
  // card shows its replay at once (not in the sample preview, which has no recordings).
  const repCount = Object.values(reps).reduce((sum, list) => sum + (list?.length ?? 0), 0);
  useEffect(() => {
    if (!report.report || preview || !ctx.playerId) return;
    void warmStatsReplays(report.report, reps, athlete, ctx.access, ctx.playerId);
    // Once per report and rep list: `reps` is replaced on every refresh, and whatever is kept is reused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.report?.playerId, report.report?.testDateMillis, repCount, preview, ctx.playerId, ctx.access]);
  // The club comparison's reads start when Stats opens, not when the report arrives (staff only).
  useEffect(() => {
    if (preview || !ctx.playerId) return;
    prefetchClubComparison({ access: ctx.access, playerId: ctx.playerId, organizationId: athlete?.organizationId || null, teamId: athlete?.teamId || null, gender: athlete?.gender });
  }, [preview, ctx.access, ctx.playerId, athlete?.organizationId, athlete?.teamId, athlete?.gender]);
  return <div className="stats-page">
    <PlayerHeader title="Stats" />
    <div className="stats-identity">
      <p className="stats-name">{fullName(athlete)}</p>
      {tested && <p className="stats-caption">{tested}</p>}
    </div>
    <SkillBenchmarks profile={profile} estimates={estimates} />
    <StatsReport report={report} timeZone={timeZone} onOpenTest={openTest}
      selectedId={selected?.id ?? null}
      // The sample-data preview has no recordings to replay.
      detail={selected && report.report && !preview ? <><TestPosePlayer key={selected.id} metric={selected} report={report.report} reps={reps} athlete={athlete}
        access={ctx.access} playerId={ctx.playerId} onAllAttempts={() => go('workouts', { drill: METRIC_TESTS[selected.id].drill, from: 'stats' })} />
        <ClubComparison metric={selected} access={ctx.access} playerId={ctx.playerId} athlete={athlete} reps={reps} /></> : null} />
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
