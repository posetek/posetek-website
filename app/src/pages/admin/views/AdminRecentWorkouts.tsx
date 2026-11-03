import { useCallback, useState } from 'react';
import { useReadOnlyReport } from '../../../lib/useReadOnlyReport';
import { useForegroundReport } from '../../../lib/foreground-report';
import { loadPlayerWorkoutHistory } from '../lib/workoutNotifications';
import type { FocusRequest } from '../lib/workoutNotifications';
import { recentWorkoutLogs } from '../lib/adminActivityPresentation';
import { PlayerWorkoutHistoryContent } from './PlayerWorkoutHistory';

/** One explicitly expanded player owns this read. Selecting a saved session is
 * local; it must not replace the directory's scope/filter/history query. */
export default function AdminRecentWorkouts({ playerId }: { playerId: string }) {
  const [revision, setRevision] = useState(0);
  const [request, setRequest] = useState<FocusRequest>({ kind: 'none' });
  const read = useCallback(() => loadPlayerWorkoutHistory(playerId), [playerId]);
  const state = useReadOnlyReport({ key: playerId, read, revision, retry: true });
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useForegroundReport({ key: playerId, refresh, busy: state.refreshing, interval: true });
  const load = state.kind === 'ready'
    ? { kind: 'ready' as const, logs: recentWorkoutLogs(state.data), checkedAt: state.checkedAt }
    : { kind: state.kind };
  return <>
    <p className="activity-note">Up to five recent saved sessions across personal, assigned and extra workouts. This history is current when checked; it is separate from the reporting period.</p>
    <PlayerWorkoutHistoryContent playerId={playerId} load={load} request={request}
      refresh={revision} refreshing={state.refreshing} stale={state.stale}
      onRefresh={refresh} onSelect={focus => setRequest({ kind: 'valid', focus })} />
  </>;
}
