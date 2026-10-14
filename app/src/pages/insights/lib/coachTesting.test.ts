import { describe, expect, it } from 'vitest';
import { measuredChange, testingOutcome } from './coachTesting';
import type { CoachMeasuredTest } from './expanded';
import { get } from '../../../lib/benchmarks';
import { previewInsights } from './preview';
import { expandedRequest } from './expandedQuery';

const metric = (key: string, previous: number | null, current: number): CoachMeasuredTest['metrics'][number] => ({ key, previous, current, direction: get(key)?.direction || 'higher', trend: 'same' });
describe('coach comparison evidence', () => {
  it('uses displayed units and precision for faster, slower, higher, lower and unchanged', () => {
    for (const [key, before, after, text] of [
      ['sprintCompletionTime', 2.4, 2.2, '0.20 s faster'], ['dribbleTotalTime', 8, 8.5, '0.50 s slower'],
      ['ballSpeed', 17, 18, '2.3 mph faster'], ['sprintMaxSpeed', 10, 8, '4.5 mph slower'],
      ['verticalJumpHeight', .4, .5, '4.0 in higher'], ['dribbleBallControl', 1, .8, '0.7 ft lower'],
      ['sprintCompletionTime', 2.4, 2.401, 'Unchanged'], ['sprintCompletionTime', 2.396, 2.404, 'Unchanged'],
    ] as const) expect(measuredChange(metric(key, before, after))).toBe(text);
    expect(measuredChange(metric('unknown', 2, 3))).toBe('Unavailable');
    expect(measuredChange(metric('sprintCompletionTime', null, 3))).toBe('Unavailable');
  });
  it('does not trust a test-level Improving status without comparable metrics', () => {
    const test: CoachMeasuredTest = { drill: 'sprint', lastTestDate: '2026-10-01', previousTestDate: '2026-09-01', status: 'up', metrics: [] };
    expect(testingOutcome([test]).status).toBe('unavailable');
    expect(testingOutcome([{ ...test, metrics: [metric('sprintCompletionTime', 2.4, 2.4)] }]).status).toBe('same');
    expect(testingOutcome([{ ...test, previousTestDate: null, metrics: [metric('sprintCompletionTime', null, 2.4)] }]).status).toBe('unavailable');
  });
  it('keeps every preview gain, decline and mixed label consistent with its measurements', () => {
    const request = expandedRequest('orgId=northfield&teamId=harbor', new Date('2026-10-07T12:00:00Z'));
    const data = previewInsights(request, 0, 'normal', 'coach'), summary = data.overview!.coachTesting!;
    expect(summary.improvingPlayers.length).toBeGreaterThan(0);
    expect(summary.reviewPlayers.some(row => row.status === 'mixed')).toBe(true);
    for (const player of data.players) for (const test of player.performance!.coachFocus!.measuredTests) for (const sample of test.metrics) {
      if (sample.previous === null) { expect(sample.trend).toBe('unavailable'); continue; }
      const format = get(sample.key)!.format;
      const delta = (parseFloat(format(sample.current)) - parseFloat(format(sample.previous))) * (sample.direction === 'lower' ? -1 : 1);
      expect(sample.trend).toBe(delta > 0 ? 'up' : delta < 0 ? 'down' : 'same');
    }
    expect(previewInsights({ ...request, rosterSearch: 'no match' }, 1, 'normal', 'coach').overview!.coachTesting).toEqual(summary);
    expect(previewInsights({ ...request, startDate: request.endDate, testingWindow: 'period' }, 0, 'normal', 'coach').overview!.coachTesting).toEqual(summary);
    expect(previewInsights(request, 0, 'unavailable', 'coach').overview!.coachTesting).toBeUndefined();
  });
});
