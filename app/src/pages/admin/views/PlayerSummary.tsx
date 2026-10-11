import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import type { PlayerRow } from "../lib/accounts";
import { playerSummaryRequest } from "../lib/playerSummary";
import { useWorkspaceMetrics } from "../lib/workspaceMetrics";
import { loadPlayerSummaryOrganization } from "../lib/playerSummaryData";
import { useAccountLoad } from "../lib/useAccountLoad";
import { minuteText, TESTING_LABELS, WORKOUT_LABELS, workoutDurationText } from "../../insights/lib/expanded";
import { workoutPacificTime } from '../lib/workoutNotifications';
import type { ExpandedInsights, ExpandedPlayer } from "../../insights/lib/expanded";
import type { PlayerWorkoutsData } from '../lib/playerDetailData';
import { assertPlayerWorkoutTotalsAgree, playerWorkoutTotalsAgree, workoutEvidenceTotals } from '../lib/playerWorkoutConsistency';
import { expandedRequest } from '../../insights/lib/expandedQuery';

export default function PlayerSummary({ player, refreshKey = 0, onBusy, onRefresh, foreground = true, workoutEvidence = null }: { player: PlayerRow; refreshKey?: number; onBusy?: (busy: boolean) => void; onRefresh?: () => void; foreground?: boolean; workoutEvidence?: PlayerWorkoutsData | null }) {
  const location = useLocation();
  const request = playerSummaryRequest(player, location.search);
  const organizationId = request.scope?.kind === "organization" ? request.scope.organizationId : null;
  const loader = useCallback(() => loadPlayerSummaryOrganization(organizationId), [organizationId]);
  const organization = useAccountLoad(loader);
  const canonical = Boolean(organizationId && organization.state.kind === "ready" && organization.state.data.kind === "canonical"
    && organization.state.data.organizationId === organizationId);
  const window = expandedRequest(request.search);
  // A successful history reread with identical totals must not cancel/restart
  // the summary's bounded retries. Only a semantic evidence change invalidates it.
  const evidenceKey = workoutEvidence ? JSON.stringify(workoutEvidenceTotals(workoutEvidence.logs,
    { startDate: window.startDate, endDate: window.endDate, timeZone: window.timezone } as ExpandedInsights['period'], workoutEvidence.checkedAt)) : '';
  const expected = useMemo(() => evidenceKey ? JSON.parse(evidenceKey) as ReturnType<typeof workoutEvidenceTotals> : null, [evidenceKey]);
  const validate = useCallback((data: ExpandedInsights) => {
    if (expected) assertPlayerWorkoutTotalsAgree(data, player.id, expected);
  }, [player.id, expected]);
  const report = useWorkspaceMetrics({ ...request, playerIds: [player.id], enabled: canonical, refreshKey, foreground, ...(workoutEvidence ? { validate } : {}) });
  const synchronizing = Boolean(report.data && expected && !playerWorkoutTotalsAgree(report.data, player.id, expected));
  useEffect(() => { onBusy?.(organization.state.kind === 'loading' || report.refreshing || report.loading); }, [onBusy, organization.state.kind, report.loading, report.refreshing]);
  const metric = report.data?.rosterMetrics?.find(row => row.playerId === player.id);
  const status = organization.state.kind === "loading" ? "loading" : organization.state.kind === "error" ? "error"
    : organization.state.data.kind === "legacy" ? "legacy" : !canonical ? "unavailable-scope"
      : report.data && report.stale ? 'stale' : report.data && (report.refreshing || synchronizing) ? 'refreshing' : report.loading ? report.rebuilding ? "rebuilding" : "loading" : report.error ? "error"
        : metric?.status === "excluded" ? "excluded" : metric?.status === "included" ? "ready" : "unavailable";
  return <PlayerSummaryContent data={report.data} metric={metric?.status === "included" ? metric.player : null}
    status={status} error={organization.state.kind === "error" ? organization.state.message : report.error}
    onRetry={organization.state.kind === "error" ? organization.refresh : report.refresh} onRefresh={onRefresh} synchronizing={synchronizing} />;
}

export function PlayerSummaryContent({ data, metric, status, error = "", onRetry, onRefresh, synchronizing = false }: {
  data: ExpandedInsights | null; metric: ExpandedPlayer | null;
  status: "legacy" | "unavailable-scope" | "loading" | "rebuilding" | "error" | "excluded" | "unavailable" | "ready" | 'refreshing' | 'stale';
  error?: string; onRetry?: () => void;
  onRefresh?: () => void;
  synchronizing?: boolean;
}) {
  return <section className="admin-player-summary" aria-label="Player activity summary" aria-busy={['loading', 'rebuilding', 'refreshing'].includes(status)}>
    <div className="admin-player-summary-heading"><h2>Activity at a glance</h2>
      {data && <p><time dateTime={data.period.startDate}>{data.period.startDate}</time> – <time dateTime={data.period.endDate}>{data.period.endDate}</time> · {data.period.timeZone}</p>}
      {onRefresh && <button type="button" className="quiet-button" onClick={onRefresh} disabled={['loading', 'rebuilding', 'refreshing'].includes(status)}>Refresh activity</button>}
    </div>
    {(status === "loading" || status === "rebuilding") && <p role="status">{status === "rebuilding" ? "Refreshing complete activity metrics…" : "Loading activity metrics…"}</p>}
    {status === 'refreshing' && <p role="status" className="admin-note">{synchronizing ? 'Saved history has changed. Updating the reporting summary…' : 'Updating activity… Showing the last successful report.'}</p>}
    {status === 'stale' && <p role="alert" className="form-message">Refresh failed. {synchronizing ? 'Saved history and this summary are still synchronizing;' : 'These totals are from the last successful report;'} use Refresh activity to retry.</p>}
    {status === "error" && <div><p className="form-message" role="alert">{error || "Activity metrics could not be loaded."}</p>{onRetry && <button type="button" className="quiet-button" onClick={onRetry}>Retry summary</button>}</div>}
    {status === "legacy" && <p className="admin-note">Activity metrics are unavailable for this legacy organization. Recorded results and workouts remain available below.</p>}
    {status === "unavailable-scope" && <p className="admin-note">This profile’s current organization is unavailable for activity reporting. Recorded results and workouts remain available below.</p>}
    {status === "excluded" && <p className="admin-note">Excluded from reporting for this scope. This does not mean zero activity; inspect the recorded evidence below.</p>}
    {status === "unavailable" && <p className="admin-note">Complete reporting metrics are unavailable. This does not mean zero activity; inspect the recorded evidence below.</p>}
    {['ready', 'refreshing', 'stale'].includes(status) && metric && data && <>
      <p className="admin-player-summary-scope">{metric.organizationName}{metric.teamName ? ` · ${metric.teamName}` : " · Unassigned"}</p>
      <dl className="admin-player-summary-metrics">
        <div><dt>Testing</dt><dd>{metric.testing.exercisesComplete}<span> of 6 exercises</span></dd>
          <dd className="admin-player-summary-detail">{TESTING_LABELS[metric.testing.status] || "Status unavailable"} · {data.testingMode === "cumulative" ? `Recorded through ${data.period.endDate}` : "Selected period"}</dd></div>
        <div><dt>Completed workouts</dt><dd>{metric.workouts.completed}</dd><dd className="admin-player-summary-detail">Personal + assigned + extra · {WORKOUT_LABELS[metric.workouts.status] || "Status unavailable"}</dd></div>
        <div><dt>Estimated active use</dt><dd className={metric.usage.collected ? "" : "missing"}>{minuteText(metric.usage.activeMinutes, metric.usage.collected)}</dd>
          <dd className="admin-player-summary-detail">{metric.usage.collected ? `${metric.usage.activeDays} active ${metric.usage.activeDays === 1 ? "day" : "days"}` : "Usage collection is unavailable"}</dd></div>
      </dl>
      <dl className="admin-player-workout-evidence">
        <div><dt>Workout timer duration</dt><dd>{workoutDurationText(metric.workouts.timerMinutes, metric.workouts.timerRecords)}</dd></div>
        <div><dt>Elapsed estimate</dt><dd>{workoutDurationText(metric.workouts.estimatedMinutes, metric.workouts.estimatedRecords)}</dd></div>
        <div><dt>Current-plan progress</dt><dd>{!metric.performance ? 'Unavailable' : !metric.performance.activePlan ? 'No active plan' : metric.performance.sessionsDone === null || metric.performance.sessionsPlanned === null ? 'Schedule or completion unavailable' : `${metric.performance.sessionsDone} of ${metric.performance.sessionsPlanned}`}</dd><dd className="admin-player-summary-detail">Assigned plan only · last 14 days</dd></div>
      </dl>
      <p className="admin-player-summary-note">Completed workouts count saved personal, assigned and extra sessions in the dates above. Current-plan progress is separate. Timer duration and elapsed estimates have different sources; app use is not workout duration.</p>
      <p className="admin-player-summary-note">Report checked {workoutPacificTime(Number.isFinite(data.generatedAtMillis) ? data.generatedAtMillis : null)}.</p>
    </>}
  </section>;
}
