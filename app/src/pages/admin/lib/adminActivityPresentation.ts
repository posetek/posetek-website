import { workoutHistory } from '../../coach-dashboard/lib/history';
import type { AdminPlayerActivity } from './adminActivity';
import type { RecordedWorkoutLog } from './workoutNotifications';

export function activityDate(value: number | null | undefined, timezone: string) {
  if (value == null || !Number.isFinite(value)) return 'Not recorded';
  return new Date(value).toLocaleString('en-US', { timeZone: timezone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function activityWindow(window: AdminPlayerActivity['usage']['lastActivityWindow'] | undefined, timezone: string) {
  if (!window) return 'No retained activity window';
  const dayAndZone = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', timeZoneName: 'shortOffset' });
  if (dayAndZone.format(window.startMillis) !== dayAndZone.format(window.endMillis)) {
    const full = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${full.format(window.startMillis)} – ${full.format(window.endMillis)}`;
  }
  return `${activityDate(window.startMillis, timezone)} – ${new Date(window.endMillis).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })}`;
}
export function exactWorkoutLink(base: string, latest: NonNullable<AdminPlayerActivity['workouts']['latest']>) {
  const [path, search = ''] = base.split('?');
  const query = new URLSearchParams(search);
  query.set('workoutSource', latest.source); query.set('workoutLog', latest.logId || '');
  return `${path}?${query}`;
}
/** Keep linked originals together so the shared history retains its saved
 * prescription selection and duplicate count. Only five sessions are displayed. */
export function recentWorkoutLogs(logs: RecordedWorkoutLog[], limit = 5) {
  const selected = new Set(workoutHistory(logs).slice(0, limit).map(entry => entry.id));
  return logs.filter(log => selected.has(workoutHistory([log])[0]?.id));
}
