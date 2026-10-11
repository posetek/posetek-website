import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/firebase', () => ({ auth: {}, db: {}, cloud: {} }));
import { assertPlayerWorkoutsAgree, playerWorkoutsAgree, workoutEvidenceTotals } from './playerWorkoutConsistency';
import type { RecordedWorkoutLog } from './workoutNotifications';
import type { ExpandedInsights, ExpandedPlayer } from '../../insights/lib/expanded';
const require = createRequire(import.meta.url);
const { workoutEvents } = require('../../../../../functions/insights-v2-qualification.js');
const { summarizeWorkouts } = require('../../../../../functions/insights-v2.js');
const period = { startDate: '2026-09-20', endDate: '2026-09-21', timeZone: 'America/Los_Angeles',
  startMillis: Date.parse('2026-09-20T07:00:00Z'), endMillis: Date.parse('2026-09-22T07:00:00Z') };
const now = Date.parse('2026-09-22T12:00:00Z');
const base = { id: 'one', _workoutSource: 'personalWorkoutLogs', source: 'personal', workoutId: 'one',
  startedAt: period.startMillis + 1000, endedAt: period.startMillis + 601000, endReason: 'completed', activeSeconds: 300 } as RecordedWorkoutLog;
const report = (logs: RecordedWorkoutLog[]) => ({ period, rosterMetrics: [{ playerId: 'one', status: 'included',
  player: { workouts: workoutEvidenceTotals(logs, period, now) } as ExpandedPlayer }] }) as ExpandedInsights;
describe('saved history / reporting projection consistency', () => {
  it.each([
    ['timer, zero and estimate', [base, { ...base, id: 'two', workoutId: 'two', activeSeconds: 0 }, { ...base, id: 'three', workoutId: 'three', activeSeconds: undefined }]],
    ['linked duplicate', [{ ...base, source: 'plan', planId: 'plan', workoutSnapshot: { blocks: [] } }, { ...base, source: 'plan', planId: 'plan', id: 'legacy', activeSeconds: 999 }]],
    ['pain and ongoing', [{ ...base, endReason: 'pain' }, { ...base, id: 'two', workoutId: 'two', endedAt: null }]],
    ['ended inside but started before', [{ ...base, startedAt: period.startMillis - 1000 }]],
    ['started inside but ended outside', [{ ...base, endedAt: period.endMillis }]],
    ['future or reversed ending', [{ ...base, endedAt: now + 1 }, { ...base, id: 'two', workoutId: 'two', endedAt: base.startedAt - 1 }]],
    ['future or missing start', [{ ...base, startedAt: now + 1 }, { ...base, id: 'two', workoutId: 'two', startedAt: null }]],
    ['local ending boundary', [{ ...base, startedAt: period.startMillis - 3600000, endedAt: period.startMillis - 1 }]],
  ] as [string, RecordedWorkoutLog[]][])('matches authoritative period calculation: %s', (_name, logs) => {
    const server = summarizeWorkouts(workoutEvents(logs), period, now);
    const expected = Object.fromEntries(Object.keys(workoutEvidenceTotals([], period, now)).map(key => [key, server[key]]));
    expect(workoutEvidenceTotals(logs, period, now)).toEqual(expected);
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
