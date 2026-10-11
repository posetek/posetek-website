import { workoutHistory } from '../../coach-dashboard/lib/history';
import type { RecordedWorkoutLog } from './workoutNotifications';
import type { ExpandedInsights } from '../../insights/lib/expanded';

/** Compare saved history with the asynchronous reporting projection. This is a
 * read-consistency check, never a replacement for the authoritative report. */
export function workoutEvidenceTotals(logs: RecordedWorkoutLog[], period: ExpandedInsights['period'], now: number) {
  const date = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: period.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const inside = (at: number | null) => at !== null && at <= now && date(at) >= period.startDate && date(at) <= period.endDate;
  const totals = { completed: 0, timerMinutes: 0, estimatedMinutes: 0, timerRecords: 0, estimatedRecords: 0 };
  for (const entry of workoutHistory(logs)) {
    if (entry.start === null || entry.start > now || !inside(entry.start) && !inside(entry.end)) continue;
    if (entry.end !== null && (entry.end < entry.start || entry.end > now || !inside(entry.end))) continue;
    if (entry.status === 'completed') totals.completed++;
    if (entry.timerSeconds !== null) { totals.timerRecords++; totals.timerMinutes += entry.timerSeconds / 60; }
    else if (entry.estimatedSeconds !== null) { totals.estimatedRecords++; totals.estimatedMinutes += entry.estimatedSeconds / 60; }
  }
  return totals;
}

export function playerWorkoutsAgree(report: ExpandedInsights, playerId: string, logs: RecordedWorkoutLog[], now: number) {
  return playerWorkoutTotalsAgree(report, playerId, workoutEvidenceTotals(logs, report.period, now));
}

export function playerWorkoutTotalsAgree(report: ExpandedInsights, playerId: string, expected: ReturnType<typeof workoutEvidenceTotals>) {
  const row = report.rosterMetrics?.find(metric => metric.playerId === playerId);
  // Exclusions and unavailable summaries keep their existing explicit states.
  if (!row || row.status !== 'included') return true;
  return (Object.keys(expected) as (keyof typeof expected)[]).every(key =>
    Number.isFinite(row.player.workouts[key]) && Math.abs(row.player.workouts[key]! - expected[key]) < 1e-7);
}

export function assertPlayerWorkoutsAgree(report: ExpandedInsights, playerId: string, logs: RecordedWorkoutLog[], now: number) {
  assertPlayerWorkoutTotalsAgree(report, playerId, workoutEvidenceTotals(logs, report.period, now));
}

export function assertPlayerWorkoutTotalsAgree(report: ExpandedInsights, playerId: string, expected: ReturnType<typeof workoutEvidenceTotals>) {
  if (!playerWorkoutTotalsAgree(report, playerId, expected)) throw Object.assign(
    new Error('Saved workout history and the reporting summary are still synchronizing. Refresh activity to retry.'),
    { code: 'unavailable', details: { reason: 'workout-report-synchronizing' } });
}
