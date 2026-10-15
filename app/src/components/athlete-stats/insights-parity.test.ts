import { describe, expect, it } from 'vitest';
import { buildProfile } from './profile';
import { metrics } from '../../lib/benchmarks';
import vectors from '../../contracts/backend/v1/scoring-vectors.json';

describe('backend contract: qualified athlete profile scoring', () => {
  for (const vector of vectors) {
    it(vector.name, () => {
      const browser = buildProfile(vector.reps).axes;
      expect(browser.map(axis => ({ key: axis.key, label: axis.label, measuredScore: axis.score })))
        .toEqual(vector.expectedAxes);
    });
  }
  it('retains the reviewed unit conversions', () => {
    expect(metrics.ballSpeed.reference).toBe(75 * (1 / 2.23694));
    expect(metrics.verticalJumpHeight.reference).toBe(18 * (1 / 39.37007874015748));
    expect(metrics.dribbleBallControl.reference).toBe(2.1 * (1 / 3.28084));
  });
});
