import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/firebase', () => ({ auth: {}, db: {}, cloud: {} }));
import { assertPlayerWorkoutsAgree, playerWorkoutsAgree, workoutEvidenceTotals } from './playerWorkoutConsistency';
import type { RecordedWorkoutLog } from './workoutNotifications';
import type { ExpandedInsights, ExpandedPlayer } from '../../insights/lib/expanded';
import workoutVectors from '../../../contracts/backend/v1/workout-vectors.json';
const { period, now } = workoutVectors;
const base = workoutVectors.base as RecordedWorkoutLog;
const report = (logs: RecordedWorkoutLog[]) => ({ period, rosterMetrics: [{ playerId: 'one', status: 'included',
  player: { workouts: workoutEvidenceTotals(logs, period, now) } as ExpandedPlayer }] }) as ExpandedInsights;
describe('saved history / reporting projection consistency', () => {
  it.each(workoutVectors.cases)('matches authoritative period calculation: $name', vector => {
    expect(workoutEvidenceTotals(vector.logs as RecordedWorkoutLog[], period, now)).toEqual(vector.expected);
  });
  it('rejects an old projection for a newly saved completion or timer update as a transient synchronization failure', () => {
    const prior = report([base]);
    expect(playerWorkoutsAgree(prior, 'one', [base], now)).toBe(true);
    expect(() => assertPlayerWorkoutsAgree(prior, 'one', [base, { ...base, id: 'new', workoutId: 'new' }], now)).toThrow(/synchronizing/);
    expect(() => assertPlayerWorkoutsAgree(prior, 'one', [{ ...base, activeSeconds: 725 }], now)).toThrow(expect.objectContaining({ code: 'unavailable' }));
    expect(playerWorkoutsAgree(report([{ ...base, activeSeconds: 725 }]), 'one', [{ ...base, activeSeconds: 725 }], now)).toBe(true);
  });
  it('keeps an excluded or unavailable player distinct instead of deriving private summary metrics', () => {
    expect(playerWorkoutsAgree({ period, rosterMetrics: [{ playerId: 'one', status: 'excluded' }] } as ExpandedInsights, 'one', [base], now)).toBe(true);
    expect(playerWorkoutsAgree(report([base]), 'another', [base], now)).toBe(true);
  });
});
