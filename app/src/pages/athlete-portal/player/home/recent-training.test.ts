import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, cloud: {}, storage: {} }));
import {
  addDays, drillSummaryLine, drillsNeedingCatalog, parseTrainingSession, parseWorkoutLog, parseWorkoutSnapshot, progression,
  recentTrainingFrom, recentWorkouts, sessionCountText, startOfDay, storedTitle, weekSummary, weekTitle, workoutTitle,
} from './recent-training';
import type { OutdoorRun, PlanBlock, RecentTraining, TrainingSession, WorkoutLog } from './recent-training';

// Wednesday 11 November 2026, 15:00 local time.
const NOW = new Date(2026, 10, 11, 15, 0);
const day = (offset: number, hour = 12) => { const date = addDays(startOfDay(NOW), offset); date.setHours(hour); return date; };
const block = (status: string, sets = 3, blockId = 'b1', drillId = 'STR-010') => ({ blockId, drillId, status, setsCompleted: sets });
const plan = (over: Partial<PlanBlock> = {}): PlanBlock => ({ blockId: 'b1', drillId: 'STR-010', name: 'Split squat', sets: 3, reps: 8, repUnit: 'reps', perSide: true, ...over });
const log = (id: string, endedAt: Date | null, blocks = [block('done')], over: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id, endedAt, linkedTrainingSessionId: null, blocks, workoutSnapshot: { title: 'Workout', blocks: [plan()], yoga: false }, sessionBlocks: null, sessionYoga: false, ...over,
});
const session = (id: string, endedAt: Date | null, refs = ['sprint']): TrainingSession => ({
  id, endedAt, sessionRefs: refs.map((drillType, index) => ({ drillType, addedAt: new Date(2026, 10, 1, 10, index) })),
});
const training = (logs: WorkoutLog[], sessions: TrainingSession[] = [], storedWorkoutTitles: Record<string, string> = {}): RecentTraining => ({ logs, sessions, storedWorkoutTitles });

describe('Your week (RecentTraining.summary)', () => {
  it('counts completed workouts and unlinked sessions in today and the six days before it', () => {
    const t = training([
      log('today', day(0, 9)), log('edge', startOfDay(addDays(NOW, -6))), log('old', day(-7, 23)),
      log('skipped', day(-1), [block('skipped')]), log('open', null), log('future', day(0, 18)),
    ], [session('free', day(-2)), session('empty', day(-2), []), session('prior', day(-13, 1))]);
    expect(weekSummary(t, [], NOW)).toEqual({ current: 3, previous: 2 });
  });
  it('does not count a session twice when a completed workout links it', () => {
    const t = training([log('w', day(-1), [block('partial', 1)], { linkedTrainingSessionId: 's' })], [session('s', day(-1))]);
    expect(weekSummary(t, [], NOW)).toEqual({ current: 1, previous: 0 });
    // A linking log with no completed block does not hide the session.
    const open = training([log('w', day(-1), [block('skipped')], { linkedTrainingSessionId: 's' })], [session('s', day(-1))]);
    expect(weekSummary(open, [], NOW)).toEqual({ current: 1, previous: 0 });
  });
  it('adds runs when a source supplies them', () => {
    const runs: OutdoorRun[] = [{ id: 'r', endedAt: day(-3), title: 'Run' }];
    expect(weekSummary(training([]), runs, NOW)).toEqual({ current: 1, previous: 0 });
  });
  it('words the count and the title as the app does', () => {
    expect(sessionCountText(1)).toBe('1 recorded session');
    expect(sessionCountText(0)).toBe('0 recorded sessions');
    expect(weekTitle('athlete', 'Avery')).toBe('Your week');
    expect(weekTitle('preview', 'Avery')).toBe('Your week');
    expect(weekTitle('coach', 'Avery')).toBe('Avery’s week');
  });
});

describe('Recent workouts', () => {
  it('lists at most three completions of the week, newest first, with the app titles', () => {
    const t = training([
      log('stored', day(0, 9)), log('named', day(-1)), log('old', day(-8)),
    ], [session('s', day(-2), ['jump', 'deadballShot', 'mobility']), session('older', day(-3))], { stored: '  Leg day  ', named: 'Workout' });
    const rows = recentWorkouts(t, [], NOW);
    expect(rows.map(row => [row.id, row.title])).toEqual([
      ['workout-stored', 'Leg day'], ['workout-named', 'Split squat'], ['session-s', 'Jump · Shoot · Mobility'],
    ]);
  });
  it('breaks a tie on time by the row id, descending', () => {
    const at = day(-1);
    const rows = recentWorkouts(training([log('a', at)], [session('a', at)]), [], NOW);
    expect(rows.map(row => row.id)).toEqual(['workout-a', 'session-a']);
  });
  it('falls back to the catalog, then Yoga, then Workout', () => {
    const noName = log('c', day(0), [block('done', 2, 'b9', 'COR-1')], { workoutSnapshot: null });
    expect(workoutTitle({ ...training([noName]), catalogNames: { 'COR-1': 'Dead bug' } }, noName)).toBe('Dead bug');
    expect(drillsNeedingCatalog(training([noName]))).toEqual(['COR-1']);
    expect(workoutTitle(training([noName]), { ...noName, sessionYoga: true })).toBe('Yoga');
    expect(workoutTitle(training([noName]), noName)).toBe('Workout');
    const added = log('s', day(0), [block('done', 1, 's1', 'STR-2')], { sessionBlocks: [plan({ blockId: 's1', drillId: 'STR-2', name: 'Calf raise' })] });
    expect(workoutTitle(training([added]), added)).toBe('Calf raise');
  });
  it('labels free sessions in the order their drills were added', () => {
    expect(drillSummaryLine(session('x', day(0), ['changeOfDirection', 'freeRecord', 'broadJump']))).toBe('COD · Free · Broad Jump');
    expect(drillSummaryLine(session('x', day(0), []))).toBe('No drills yet');
  });
});

describe('Progression line', () => {
  it('compares the newest completion of a prescription with an earlier day', () => {
    const t = training([log('new', day(0, 9), [block('done', 3)]), log('old', day(-5), [block('partial', 2)])]);
    expect(progression(t, NOW)).toEqual({ text: 'Split squat: 3 sets completed, compared with 2 last time.', date: day(0, 9) });
  });
  it('says nothing for the same set count, the same day, skipped work or other prescriptions', () => {
    expect(progression(training([log('a', day(0, 9)), log('b', day(-2))]), NOW)).toBeNull();
    expect(progression(training([log('a', day(0, 9)), log('b', day(0, 8), [block('done', 1)])]), NOW)).toBeNull();
    expect(progression(training([log('a', day(0, 9)), log('b', day(-2), [block('skipped', 1)])]), NOW)).toBeNull();
    const other = log('b', day(-2), [block('done', 1)], { workoutSnapshot: { title: 'W', blocks: [plan({ reps: 10 })], yoga: false } });
    expect(progression(training([log('a', day(0, 9)), other]), NOW)).toBeNull();
    expect(progression(training([log('a', day(0, 9)), log('b', day(-14), [block('done', 1)])]), NOW)).toBeNull();
  });
  it('compares a prescription once, so a later difference is not reported', () => {
    const t = training([log('a', day(0, 9), [block('done', 3)]), log('b', day(-2), [block('done', 3)]), log('c', day(-4), [block('done', 1)])]);
    expect(progression(t, NOW)).toBeNull();
  });
});

describe('Parsing the app’s documents', () => {
  const stamp = (date: Date) => ({ toDate: () => date });
  it('skips logs the app cannot read and keeps the raw title', () => {
    expect(parseWorkoutLog('x', { startedAt: stamp(NOW) })).toBeNull();
    expect(parseWorkoutLog('x', { planId: 'p' })).toBeNull();
    expect(parseWorkoutLog('x', { planId: 'p', startedAt: stamp(NOW), sessionYoga: 'bad' })).toBeNull();
    const parsed = parseWorkoutLog('x', { planId: 'p', startedAt: stamp(NOW), endedAt: stamp(NOW), blocks: [{ blockId: 'b1', drillId: 'd', setsCompleted: 2.7 }, { drillId: 'no-id' }] });
    expect(parsed?.blocks).toEqual([{ blockId: 'b1', drillId: 'd', status: 'skipped', setsCompleted: 2 }]);
    expect(storedTitle({ workoutSnapshot: { name: 'Old name' } })).toBe('Old name');
    const built = recentTrainingFrom([{ id: 'x', data: { planId: 'p', startedAt: stamp(NOW), workoutSnapshot: { title: 'T' } } }], [{ id: 's', data: { startedAt: stamp(NOW), endedAt: stamp(NOW), sessionRefs: [{ sessionDocId: 'a', drillType: 'jump' }, { drillType: 'none' }] } }]);
    expect(built.storedWorkoutTitles).toEqual({ x: 'T' });
    expect(built.sessions[0].sessionRefs.map(ref => ref.drillType)).toEqual(['jump']);
    expect(parseTrainingSession('s', { endedAt: stamp(NOW) })).toBeNull();
  });
  it('rejects measured, retest and inconsistent yoga snapshots as PlanWorkout.parse does', () => {
    const blocks = [{ blockId: 'b1', drillId: 'd', name: 'N', sets: 2, reps: 5 }];
    expect(parseWorkoutSnapshot({ workoutId: 'w', blocks })?.title).toBe('Workout');
    expect(parseWorkoutSnapshot({ blocks })).toBeNull();
    expect(parseWorkoutSnapshot({ workoutId: 'w', blocks: [{ ...blocks[0], isMeasuredDrill: false }] })).toBeNull();
    expect(parseWorkoutSnapshot({ workoutId: 'w', blocks: [{ ...blocks[0], kind: 'retest' }] })).toBeNull();
    expect(parseWorkoutSnapshot({ workoutId: 'w', blocks: [{ ...blocks[0], drillId: '' }] })).toBeNull();
    expect(parseWorkoutSnapshot({ workoutId: 'w', blocks, yoga: {} })).toBeNull();
    expect(parseWorkoutSnapshot({ workoutId: 'w', blocks, yoga: {}, workoutType: 'yoga', executionPolicy: 'yoga-v1' })?.yoga).toBe(true);
  });
});
