import { describe, expect, it } from 'vitest';
import { blockSeconds, blockTimes, breakdownHeadline, countedLogs, durationShort, endReasonChip, findResume, focusArcs, focusCategory, focusSlices, focusSummary,
  freeSessionSummary, historyBlockSummary, historyRows, planCardSubtitle, planPagePlan, planSections, resumeBannerText, savedDetailLine, savedEntries, savedWorkouts, weekDrillLine } from './hub';
import type { Row } from '../execution';
import { doseLine } from './MyWorkoutPlan';
import { appWorkoutsLink, appleTouchDevice } from './AppOnlySheet';
import { estimateLabel, estimateOffTarget } from './WorkoutFull';

const plan = (over: Row = {}): Row => ({ id: 'p', schemaVersion: 3, status: 'active', horizonWeeks: 4, startDate: '2026-11-09', timezone: 'America/Los_Angeles',
  weeks: [1, 2].map(weekNumber => ({ weekNumber, workouts: [{ workoutId: `w${weekNumber}`, title: `Week ${weekNumber} work`, blocks: [{ blockId: 'b1', drillId: 'DRB-1' }, { blockId: 'b2', drillId: 'PAS-1' }] }] })), ...over });

describe('training focus, as the app folds it', () => {
  it('formats durations the way the stats row and donut do', () => {
    expect(durationShort(0)).toBe('0m'); expect(durationShort(48 * 60 + 10)).toBe('48m');
    expect(durationShort(2 * 3600)).toBe('2h'); expect(durationShort(14 * 3600 + 20 * 60)).toBe('14h 20m'); expect(durationShort(10, false)).toBe('—');
  });
  it('files rows under the activity categories', () => {
    expect(focusCategory('dribbling', 'x')).toBe('soccer'); expect(focusCategory('passingReceiving', 'x')).toBe('soccer');
    expect(focusCategory('agility', 'x')).toBe('speed'); expect(focusCategory('strength', 'x')).toBe('gym');
    expect(focusCategory('strength', 'COR-001')).toBe('core'); expect(focusCategory('strength', 'COR-001', 'hiit')).toBe('hiit');
    expect(focusCategory('yoga', 'x')).toBe('yoga'); expect(focusCategory('mystery', 'x')).toBe('other');
  });
  it('caps measured time, halves partial estimates and ignores skipped work', () => {
    const log = { workoutSnapshot: { blocks: [{ blockId: 'b', estimatedMinutes: 10 }] } };
    expect(blockSeconds(log, { blockId: 'b', status: 'done' })).toEqual({ seconds: 600, measured: false });
    expect(blockSeconds(log, { blockId: 'b', status: 'partial' })).toEqual({ seconds: 300, measured: false });
    expect(blockSeconds(log, { blockId: 'b', status: 'skipped' })).toEqual({ seconds: 0, measured: false });
    expect(blockSeconds(log, { blockId: 'b', status: 'done', elapsedSeconds: 99999 })).toEqual({ seconds: 1500, measured: true });
  });
  it('shares the session clock across rows so the parts add up to it', () => {
    const log = { activeSeconds: 1000, blocks: [{ blockId: 'a', status: 'done', estimatedMinutes: 10 }, { blockId: 'b', status: 'done', estimatedMinutes: 30 }] };
    const times = blockTimes(log, 'total');
    expect(times.a.seconds + times.b.seconds).toBe(1000); expect(times.a.seconds).toBe(250);
    expect(blockTimes(log, 'active')).toEqual({});
  });
  it('counts ended logs once, by period, with the favorite category', () => {
    const now = new Date(2026, 10, 11, 12);
    const log = (id: string, day: number, domain: string, minutes: number, endedAt: unknown = new Date(2026, 10, day, 13)) =>
      ({ id, startedAt: new Date(2026, 10, day, 12), endedAt, blocks: [{ blockId: 'b', domain, status: 'done', estimatedMinutes: minutes }] });
    const summary = focusSummary([log('a', 10, 'dribbling', 20), log('a', 10, 'dribbling', 20), log('b', 2, 'speed', 30), log('c', 11, 'passing', 5, null)], now);
    expect(countedLogs([log('a', 1, 'x', 1), log('a', 1, 'x', 2)])[0].blocks[0].estimatedMinutes).toBe(2);
    expect(summary.periods.week.workoutsCompleted).toBe(1); expect(summary.periods.week.secondsTrained).toBe(1200);
    expect(summary.periods.month.workoutsCompleted).toBe(2); expect(summary.periods.allTime.secondsTrained).toBe(3000);
    expect(summary.favoriteCategory).toBe('speed');
    expect(breakdownHeadline(summary.periods.week, 'week')).toBe('20m trained · 1 workout this week');
    expect(summary.periods.week.details.soccer?.[0].rows).toEqual([{ title: 'Dribbling', seconds: 1200 }]);
  });
  it('reads a personal session row through its snapshot block', () => {
    const summary = focusSummary([{ id: 'personal_1', source: 'personal', startedAt: new Date(2026, 0, 2), endedAt: new Date(2026, 0, 2), blocks: [{ blockId: 'b1', status: 'done' }], workoutSnapshot: { blocks: [{ blockId: 'b1', domain: 'shooting', estimatedMinutes: 12 }] } }], new Date(2026, 0, 3));
    expect(summary.periods.allTime.categorySeconds.soccer).toBe(720);
  });
  it('lays slices end to end over one turn', () => {
    const arcs = focusArcs(focusSlices({ workoutsCompleted: 1, secondsTrained: 4, categorySeconds: { speed: 1, soccer: 3 }, details: {}, incompleteActiveSessions: 0 }));
    expect(arcs.map(a => a.category)).toEqual(['soccer', 'speed']); expect(arcs[0].fraction).toBe(.75); expect(arcs[1].end).toBeCloseTo(2 * Math.PI);
  });
});

describe('resume, saved workouts and the plan card', () => {
  const now = new Date('2026-11-11T18:00:00Z');
  it('resumes the newest unfinished plan slot under its canonical id, and words the banner', () => {
    const logs = [{ id: 'p_w1', planId: 'p', source: 'plan', workoutId: 'w1', startedAt: new Date('2026-11-10'), blocks: [{ blockId: 'b1', status: 'done' }] },
      { id: 'forged', planId: 'p', source: 'plan', workoutId: 'w2', startedAt: new Date('2026-11-11') }];
    const target = findResume(plan(), logs, [])!;
    expect(target.kind).toBe('plan'); expect(resumeBannerText(target)).toBe('Resume “Week 1 work” · drill 2 of 2');
    expect(findResume(plan(), [{ ...logs[0], endedAt: new Date() }], [])).toBeNull();
  });
  it('resumes a saved ad-hoc or personal workout, and never one that is gone', () => {
    const adhoc = { id: 'a1', title: 'Extra', blocks: [{ blockId: 'x' }] };
    expect(findResume(null, [{ id: 'a1', source: 'adhoc', startedAt: 1 }], [adhoc])?.kind).toBe('adhoc');
    expect(findResume(null, [{ id: 'a2', source: 'adhoc', startedAt: 1 }], [adhoc])).toBeNull();
    expect(findResume(null, [], [], [{ workoutId: 'pw', title: 'Mine', blocks: [] }], { pw: { workoutId: 'pw', startedAt: 2 } })?.kind).toBe('personal');
  });
  it('lists ad-hoc workouts still in their week or still open, newest first', () => {
    const rows = [{ id: 'old', weekNumber: 1, generatedAt: 1 }, { id: 'now', weekNumber: 1, generatedAt: 2 }, { id: 'late', weekNumber: 2 }, { id: 'plan', source: 'plan', weekNumber: 1 }];
    expect(savedWorkouts(rows, {}, plan(), now).map(w => w.id)).toEqual(['now', 'old']);
    expect(savedWorkouts(rows, { late: { id: 'late' } }, plan(), now).map(w => w.id)).toContain('late');
    expect(savedWorkouts(rows, { now: { endedAt: 1 } }, plan(), now).map(w => w.id)).toEqual(['old']);
  });
  it('builds the saved library with the app’s reasons', () => {
    const entries = savedEntries([{ id: 'earlier', planId: 'p', weekNumber: 0 }, { id: 'done', planId: 'p', weekNumber: 1 }], { done: { endedAt: 1 } },
      [{ workoutId: 'pw', title: 'Mine', blocks: [{}] }], { pw: { endedAt: 1 } }, plan(), now);
    expect(entries.map(e => e.id)).toEqual(['personal:pw', 'cloud:earlier']);
    expect(entries.find(e => e.id === 'cloud:earlier')?.unavailableReason).toContain('earlier training week');
    expect(entries.find(e => e.id === 'personal:pw')?.unavailableReason).toBe('Completed · create an edited copy to practice again.');
    expect(savedDetailLine({ blocks: [{}], estimatedMinutes: 20 }, true)).toBe('1 drill · ~20 min · In progress');
  });
  it('words the plan card and picks the plan page content', () => {
    expect(planCardSubtitle(3, 6, 2)).toBe('Week 3 of 6 · 2 saved'); expect(planCardSubtitle(7, 6, 0)).toBe('Week 7 of 7');
    expect(planPagePlan(plan(), false)?.id).toBe('p'); expect(planPagePlan(plan({ schemaVersion: 2 }), false)).toBeNull();
    expect(planPagePlan(plan({ schemaVersion: 2 }), true)?.id).toBe('p'); expect(planPagePlan(plan({ status: 'completed' }), true)).toBeNull();
    expect(planSections(true, true)).toEqual(['weekRail', 'weekCard', 'nextWorkout', 'targets', 'drills', 'links', 'freeSession']);
    expect(planSections(false, false)).not.toContain('legacyWorkout');
    expect(weekDrillLine(plan().weeks[0], 'DRB-1')).toBe('In 1 workout this week · dose shown in each workout');
  });
});

describe('history rows and dose lines', () => {
  it('summarizes blocks and end reasons', () => {
    expect(historyBlockSummary({ blocks: [{ status: 'done' }, { status: 'partial' }, { status: 'skipped' }] })).toBe('1 of 3 done · 1 partial · 1 skipped');
    expect(historyBlockSummary({})).toBe('No blocks logged.');
    expect(endReasonChip({ endedAt: 1, endReason: 'completed' }).text).toBe('Completed'); expect(endReasonChip({ endedAt: 1, endReason: 'endedEarly' }).text).toBe('Ended early');
    expect(endReasonChip({}).text).toBe('In progress');
    expect(freeSessionSummary({ sessionRefs: [{ drillType: 'sprint', addedAt: 2 }, { drillType: 'deadballShot', addedAt: 1 }] })).toBe('Shoot · Sprint');
    expect(freeSessionSummary({})).toBe('No drills yet');
  });
  it('interleaves workouts and free sessions newest first', () => {
    expect(historyRows([{ id: 'a', startedAt: 1 }], [{ id: 'b', startedAt: 2 }]).map(r => r.key)).toEqual(['session-b', 'workout-a']);
  });
  it('writes a dose the way HubDoseFormatter does', () => {
    expect(doseLine({ sets: 3, reps: 8, repUnit: 'reps', perSide: true, restSeconds: 30, restScope: 'sets' })).toBe('3 × 8 reps each side · 30s rest between sets');
    expect(doseLine({ sets: 1, reps: 60, repUnit: 'seconds' })).toBe('1 × 60 sec');
    expect(doseLine({})).toBe('As prescribed');
    expect(estimateLabel(14, 15)).toBe('14 of 15 min'); expect(estimateOffTarget(12, 15)).toBe(true); expect(estimateOffTarget(14, 15)).toBe(false);
  });
});

describe('the app-only cards', () => {
  it('builds only the documented workout link, and only for a valid locator', () => {
    expect(appWorkoutsLink('abc_123-X')).toBe('posetek-workouts-v1://athlete?player=abc_123-X&view=training');
    expect(appWorkoutsLink('a/b')).toBeNull(); expect(appWorkoutsLink('')).toBeNull();
    expect(appleTouchDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(appleTouchDevice('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false);
  });
});
