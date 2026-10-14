/* eslint-disable @typescript-eslint/no-explicit-any */
import vectors from '../../../contracts/backend/v1/history-vectors.json';
import { describe, expect, it } from 'vitest';
import { workoutHistory } from './history';
import { activePlan, trainingTotals } from './logic';

const start = new Date('2026-09-20T12:00:00Z'), end = new Date('2026-09-20T14:00:00Z');
const block = { blockId: 'b', name: 'Original drill', sets: 3, dose: { reps: 5 } };
const base = { id: 'one', planId: 'p', workoutId: 'w', startedAt: start, endedAt: end, endReason: 'completed',
  workoutSnapshot: { title: 'Original session', blocks: [block] }, blocks: [{ blockId: 'b', setsCompleted: 2, status: 'partial' }] };

describe('coach outcome parity with Insights V2', () => {
  const decode = (value: any): any => {
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') {
      if (typeof value.$date === 'string') return new Date(value.$date);
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
    }
    return value;
  };
  it.each(vectors.cases)('$name', ({ logs, expected: server }) => {
    const browser = workoutHistory(decode(logs))[0];
    expect(browser.status).toBe(server.status);
    expect(browser.start).toBe(server.at); expect(browser.end).toBe(server.end);
    expect(browser.duplicateLogs).toBe(server.duplicateLogs);
    expect((browser.timerSeconds ?? 0) / 60).toBe(server.timerMinutes);
    expect((browser.estimatedSeconds ?? 0) / 60).toBe(server.estimatedMinutes);
    expect(Number(browser.prescribedKnown)).toBe(1 - server.unknownPrescription);
    expect(Number(browser.allSetsCompleted)).toBe(server.allPrescribedSetsCompleted);
    expect(browser.setsCompleted).toBe(server.setsCompleted);
    expect(browser.skippedBlocks).toBe(server.skippedBlocks);
  });
  it('does not confuse completed sessions with completed prescribed sets', () => {
    const history = workoutHistory([base]);
    expect(history[0].status).toBe('completed'); expect(history[0].allSetsCompleted).toBe(false);
    expect(history[0].snapshot?.blocks[0].name).toBe('Original drill');
  });
  it('separates timer minutes, estimates and unknown duration while counting linked workouts once', () => {
    const totals = trainingTotals([{ ...base, activeSeconds: 300 }, { ...base, id: 'duplicate', activeSeconds: 600 },
      { id: 'adhoc', source: 'adhoc', workoutId: 'extra', startedAt: start, endedAt: end, endReason: 'endedEarly' },
      { id: 'unstarted', endReason: 'completed' }], []);
    expect(totals.workoutsStarted).toBe(2); expect(totals.workoutsCompleted).toBe(1);
    expect(totals.timerSeconds).toBe(600); expect(totals.estimatedSeconds).toBe(7200); expect(totals.unknownDuration).toBe(1);
  });
  it('never presents a ready draft as active and prefers explicit activation date', () => {
    expect(activePlan([{ id: 'draft', status: 'ready', generatedAt: end }])).toBeNull();
    expect(activePlan([{ id: 'old', status: 'active', generatedAt: end },
      { id: 'reviewed', status: 'active', generatedAt: start, activatedAt: new Date('2026-09-22') }])?.id).toBe('reviewed');
  });
  it('keeps personal sessions separate even if their source workout has the same identity', () => {
    const rows = workoutHistory([base, { ...base, id: 'personal', source: 'personal' },
      { ...base, id: 'extra', source: 'adhoc' }]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(row => row.id))).toEqual(new Set(['plan:p:w', 'personal:w', 'adhoc:w']));
  });
});
