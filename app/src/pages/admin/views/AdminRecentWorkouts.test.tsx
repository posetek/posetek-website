import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/firebase', () => ({ auth: {}, cloud: {}, db: {} }));
import { recentWorkoutLogs } from '../lib/adminActivityPresentation';
import { workoutHistory } from '../../coach-dashboard/lib/history';
import type { RecordedWorkoutLog } from '../lib/workoutNotifications';

function log(index: number): RecordedWorkoutLog {
  return { id: `log-${index}`, _workoutSource: 'workoutLogs', planId: 'saved-plan', workoutId: `workout-${index}`, startedAt: Date.UTC(2026, 10, index), workoutSnapshot: { title: `Saved workout ${index}`, blocks: [{ blockId: 'saved-block', name: 'Saved drill', sets: 2 }] } };
}
describe('explicitly opened recent workout history', () => {
  it('limits sessions after deduplication while retaining linked logs and original prescriptions', () => {
    const logs = Array.from({ length: 8 }, (_, index) => log(index + 1));
    logs.push({ ...log(8), id: 'mirror-8', workoutSnapshot: undefined });
    const recent = recentWorkoutLogs(logs);
    const rows = workoutHistory(recent);
    expect(rows).toHaveLength(5);
    expect(recent).toHaveLength(6);
    expect(rows[0].snapshot.title).toBe('Saved workout 8');
    expect(rows[0].duplicateLogs).toBe(1);
    expect(rows[0].status).toBe('inProgress');
    expect(recent.some(row => row.id === 'log-3')).toBe(false);
    expect(logs).toHaveLength(9);
  });
  it('keeps an empty history empty and distinguishes personal and assigned sessions', () => {
    expect(recentWorkoutLogs([])).toEqual([]);
    const personal = { ...log(1), id: 'personal-1', _workoutSource: 'personalWorkoutLogs' as const, source: 'personal' };
    expect(workoutHistory(recentWorkoutLogs([log(1), personal]))).toHaveLength(2);
  });
});
