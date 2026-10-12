import type { ExpandedPlayer } from './expanded';

export const COACH_TEST_LABELS: Record<string, string> = { shooting: 'Shooting', sprint: 'Sprint', jump: 'Vertical jump', broadJump: 'Broad jump', changeOfDirection: 'Agility', dribbling: 'Dribbling' };

/** Only the versioned measured-evidence contract can supply coach follow-up.
 * Older sign-in/D1 flags must never leak into this presentation. */
export function coachFollowUp(performance?: ExpandedPlayer['performance']) {
  const focus = performance?.coachFocus;
  if (focus?.version !== 1 || focus.completedInPeriod === null) return null;
  const reasons: string[] = [];
  if (focus.completedInPeriod === 0) reasons.push('No completed workouts in this period');
  const declined = focus.measuredTests.filter(test => test.metrics.some(metric => metric.trend === 'down'));
  if (declined.length) reasons.push(`Recent testing down · ${declined.map(test => COACH_TEST_LABELS[test.drill] || test.drill).join(', ')}`);
  return reasons;
}

export function coachTestingLabel(performance?: ExpandedPlayer['performance']) {
  const tests = performance?.coachFocus?.version === 1 ? performance.coachFocus.measuredTests : null;
  if (!tests) return 'Testing trend unavailable';
  if (tests.some(test => test.metrics.some(metric => metric.trend === 'down'))) return 'Testing down';
  if (tests.some(test => test.status === 'up')) return 'Improving';
  if (tests.some(test => test.status === 'same')) return 'Unchanged';
  return 'Needs comparable tests';
}
