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
import BodyScanSection from './BodyScanSection';
import SessionSummary, { useRecordedSessions } from './SessionSummary';
import { reportPracticeSamples } from './report-practice';
import { positionLabel } from './stats-format';
import { useReportPractice } from './use-report-practice';
import './stats.css';

type Props = PlayerTabProps & { profile: ReturnType<typeof playerProfile>; dataset: Row };

/**
 * Stats, the athlete's testing report. Its content is the app's V4 `StatsView`; its order is the
 * parent one-pager's (`private-report`, layout `focused-v1`), at Nolan's request (2026-11-11):
 * the name, then the report ("Standing", the two notes, two drills from the plan), then
 * "Skill benchmarks", "Body scan" and the streak, session and favorite-drill tiles. This
 * deliberately differs from the app, which puts Skill benchmarks first.
 */
export default function PlayerStats({ ctx, go, profile, athlete, report, reps, preview }: Props) {
  const practice = useReportPractice(ctx.playerId, preview);
  const sessions = useRecordedSessions(ctx.playerId, preview, reps);
  const samples = report.report ? reportPracticeSamples(practice.plan, report.report.playerId, practice.catalog) : [];
  const estimates = activeProvisionalEstimates(ctx.provisionalEstimates, ctx.allResultReps?.() || ctx.allStatsReps());
  return <div className="stats-page">
    <PlayerHeader title="Stats" />
    <p className="stats-name">{fullName(athlete)}</p>
    <StatsReport report={report} position={positionLabel(athlete?.position)} practice={{ samples, loading: practice.loading, error: practice.error }}
      onOpenPlan={() => go('stats', { screen: 'plan' })} />
    <SkillBenchmarks profile={profile} estimates={estimates} />
    <BodyScanSection ctx={{ ...ctx, athlete }} />
    <SessionSummary sessions={sessions} />
    {showResultsFeedback(ctx.access, profile.totalReps) && <PlayerResultsFeedbackLink />}
  </div>;
}
