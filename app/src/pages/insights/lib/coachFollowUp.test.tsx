import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { coachFollowUp, coachTestingLabel } from './coachFollowUp';
import CoachMeasuredTests from '../CoachMeasuredTests';
import type { ExpandedPlayer } from './expanded';

const performance: NonNullable<ExpandedPlayer['performance']> = { d1: 200, change: -80, lastTestDate: null, previousTestDate: null, activePlan: false, sessionsDone: null, sessionsPlanned: null, planAgeDays: null, needsYouReasons: ['No sign-in recorded'], coachFocus: { version: 1, completedInPeriod: 1, measuredTests: [] } };
describe('coach follow-up evidence', () => {
  it('ignores legacy telemetry warnings and D1 changes after a saved completion', () => {
    expect(coachFollowUp(performance)).toEqual([]);
    expect(coachTestingLabel(performance)).toBe('Needs comparable tests');
    expect(coachFollowUp({ ...performance, coachFocus: undefined })).toBeNull();
  });
  it('prioritizes zero saved completions with no active plan and flags mixed measured changes', () => {
    const value = { ...performance, coachFocus: { ...performance.coachFocus!, completedInPeriod: 0, measuredTests: [{ drill: 'sprint', status: 'mixed' as const, lastTestDate: '2026-10-10', previousTestDate: '2026-10-01', metrics: [{ key: 'sprintCompletionTime', current: 3, previous: 2, direction: 'lower' as const, trend: 'down' as const }] }] } };
    expect(coachFollowUp(value)).toEqual(['No completed workouts in this period', 'Recent testing down · Sprint']);
    expect(coachTestingLabel(value)).toBe('Testing down');
    const html = renderToStaticMarkup(<CoachMeasuredTests performance={value} />);
    expect(html).toContain('2.00 s'); expect(html).toContain('3.00 s'); expect(html).toContain('Mixed · review');
    expect(html).not.toContain('D1'); expect(html).not.toContain('%');
  });
});
