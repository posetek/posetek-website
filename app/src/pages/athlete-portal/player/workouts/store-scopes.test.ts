import { describe, expect, it } from 'vitest';
import { listedWorkouts, storeKeyFor, workoutStoreScopes } from './store-scopes';
import type { StoreKey } from './store-scopes';
import { usableV3Plan } from './create-workout';
import { savedWorkouts, findResume } from './hub';
import type { Row } from '../execution';

// A two-week block from Monday 2026-11-02 in Los Angeles: live on the 10th, ended by the 20th.
const plan = { id: 'plan-1', schemaVersion: 3, status: 'active', horizonWeeks: 2, startDate: '2026-11-02', timezone: 'America/Los_Angeles', weeks: [] };
const live = new Date('2026-11-10T18:00:00Z'), ended = new Date('2026-11-20T18:00:00Z');
const standaloneWorkout = { id: 'draft_1', planId: 'standalone', source: 'adhoc', weekNumber: 1, standalone: {}, generatedAt: 2,
  windowStart: '2026-11-16T00:00:00-08:00', windowEnd: '2026-11-23T00:00:00-08:00', title: 'Built today', blocks: [{ blockId: 'b' }] };
const planWorkout = { id: 'adhoc_1', planId: 'plan-1', source: 'adhoc', weekNumber: 1, generatedAt: 1, title: 'Plan extra', blocks: [{ blockId: 'b' }] };
const playingOn = (workout: Row, store: StoreKey) => ({ workout, store });
const store = (workouts: Row[] = [], logs: Record<string, Row> = {}, logsLoaded = true) => ({ workouts, logs, logsLoaded });

describe('which plan ids the hub’s workout stores follow (the app’s `listenedPlanIds`)', () => {
  it('follows nothing until the training plans load', () => {
    expect(workoutStoreScopes(false, null, null)).toEqual({ main: null, standalone: null });
  });
  it('with no active V3 plan, keeps today’s single store on the standalone namespace', () => {
    expect(workoutStoreScopes(true, null, null)).toEqual({ main: 'standalone', standalone: null });
    // A standalone workout runs on that one store, which stays put while it is followed.
    expect(storeKeyFor(standaloneWorkout, workoutStoreScopes(true, null, null))).toBe('main');
    expect(workoutStoreScopes(true, null, playingOn(standaloneWorkout, 'main'))).toEqual({ main: 'standalone', standalone: null });
  });
  it('with an active V3 plan, live or ended, follows the plan and the standalone namespace', () => {
    // Liveness only decides what a new build targets; both states list the same scopes.
    expect(usableV3Plan(plan, live)?.id).toBe('plan-1');
    expect(usableV3Plan(plan, ended)).toBeNull();
    expect(workoutStoreScopes(true, 'plan-1', null)).toEqual({ main: 'plan-1', standalone: 'standalone' });
  });
  it('opens a standalone workout on the second store and everything else on the main store', () => {
    const scopes = workoutStoreScopes(true, 'plan-1', null);
    expect(storeKeyFor(standaloneWorkout, scopes)).toBe('standalone');
    expect(storeKeyFor(planWorkout, scopes)).toBe('main');
    expect(storeKeyFor({ id: 'plan-1_w1', planId: 'plan-1', source: 'plan' }, scopes)).toBe('main');
    expect(storeKeyFor(null, scopes)).toBe('main');
  });
  it('never moves the main store when a standalone workout is opened or followed', () => {
    expect(workoutStoreScopes(true, 'plan-1', playingOn(standaloneWorkout, 'standalone'))).toEqual({ main: 'plan-1', standalone: 'standalone' });
    // A plan workout being followed keeps its own plan id, as before.
    expect(workoutStoreScopes(true, 'plan-1', playingOn(planWorkout, 'main'))).toEqual({ main: 'plan-1', standalone: 'standalone' });
    expect(workoutStoreScopes(true, 'plan-2', playingOn(planWorkout, 'main')).main).toBe('plan-1');
  });
  it('keeps a followed workout’s store when the plans change under it (an admin walkthrough’s log lives there)', () => {
    // The plan is completed or replaced mid-workout: the second store stays on the standalone namespace.
    expect(workoutStoreScopes(true, null, playingOn(standaloneWorkout, 'standalone')).standalone).toBe('standalone');
    // A plan arrives while a no-plan athlete follows a standalone workout: its store stays where it started, with no second copy.
    expect(workoutStoreScopes(true, 'plan-new', playingOn(standaloneWorkout, 'main'))).toEqual({ main: 'standalone', standalone: null });
  });
  it('routes the same way for the athlete, an admin walkthrough and a staff Player view (run mode decides only whether Start runs)', () => {
    // The scopes take no run mode: staff read both lists, and an admin's in-memory log lives on the store it started on.
    for (const scopes of [workoutStoreScopes(true, 'plan-1', null), workoutStoreScopes(true, 'plan-1', playingOn(standaloneWorkout, 'standalone'))])
      expect([storeKeyFor(standaloneWorkout, scopes), storeKeyFor(planWorkout, scopes)]).toEqual(['standalone', 'main']);
  });
});

describe('what the hub lists from both stores (the app’s single `WorkoutStore`)', () => {
  it('lists nothing new for a live plan with no standalone workouts', () => {
    const main = store([planWorkout], { adhoc_1: { id: 'adhoc_1', planId: 'plan-1', source: 'adhoc', startedAt: 1 } });
    const listed = listedWorkouts(main, store(), workoutStoreScopes(true, 'plan-1', null));
    expect(listed.workouts).toEqual(main.workouts);
    expect(listed.logs).toEqual(main.logs);
    expect(savedWorkouts(listed.workouts, listed.logs, plan, live)).toEqual(savedWorkouts(main.workouts, main.logs, plan, live));
  });
  it('returns the main store unchanged when there is no second store (no plan)', () => {
    const main = store([standaloneWorkout]);
    expect(listedWorkouts(main, store([planWorkout]), workoutStoreScopes(true, null, null))).toBe(main);
  });
  it('lists and resumes standalone workouts beside a live or an ended plan’s', () => {
    const second = store([standaloneWorkout], { draft_1: { id: 'draft_1', planId: 'standalone', source: 'adhoc', startedAt: 5 } });
    const listed = listedWorkouts(store([planWorkout]), second, workoutStoreScopes(true, 'plan-1', null));
    expect(listed.workouts.map(w => w.id)).toEqual(['adhoc_1', 'draft_1']);
    for (const now of [live, ended]) {
      const saved = savedWorkouts(listed.workouts, listed.logs, plan, now);
      expect(saved.map(w => w.id)).toContain('draft_1');
      expect(findResume(plan, Object.values(listed.logs), saved)?.workout.id).toBe('draft_1');
    }
  });
  it('waits for both stores before the list counts as loaded, and never lists one workout twice', () => {
    const scopes = workoutStoreScopes(true, 'plan-1', null);
    expect(listedWorkouts(store(), store([], {}, false), scopes).logsLoaded).toBe(false);
    expect(listedWorkouts(store([standaloneWorkout]), store([standaloneWorkout]), scopes).workouts).toHaveLength(1);
  });
});
