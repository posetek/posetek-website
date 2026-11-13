// Player execution contract: iOS WorkoutStore / PlannedWorkoutModels.
// Plans and proposals remain gateway-owned; only confirmed work becomes a log.
import { findWorkout, localDayString, planLogId, weekWindow } from '../../../lib/contracts/planV3';

export type Row = Record<string, any>;

/**
 * The reservation namespace of a workout built with no training plan (`PlannedWorkoutFirestore.standaloneScope`).
 * It is never a `trainingPlans` document: its saved workouts carry their own dated window.
 */
export const STANDALONE_SCOPE = 'standalone';
export const isStandalone = (workout: Row | null | undefined) => workout?.planId === STANDALONE_SCOPE;

/** The plan a workout runs under: its own plan, or the standalone namespace for a workout built without one. */
export function executionPlan(plan: Row | null, workout: Row): Row {
  if (isStandalone(workout)) return { id: STANDALONE_SCOPE };
  if (!plan) throw new Error('This workout needs its training plan. Refresh training.');
  return plan;
}

/** Its dated reservation (ISO `windowStart`/`windowEnd`) holds `now`. */
export function standaloneWindowOpen(workout: Row, now = new Date()): boolean {
  if (typeof workout.windowStart !== 'string' || typeof workout.windowEnd !== 'string') return false;
  const start = Date.parse(workout.windowStart), end = Date.parse(workout.windowEnd), time = now.getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < end && time >= start && time < end;
}

/**
 * A saved standalone workout that can start now (`WorkoutStore.standaloneWorkoutIsReady`): this
 * athlete's, saved by Apply, ready, and inside its window.
 */
export function standaloneWorkoutIsReady(doc: Row | undefined, playerId: string, now = new Date()): boolean {
  return !!doc && doc.planId === STANDALONE_SCOPE && doc.playerId === playerId && doc.source === 'adhoc' && doc.status === 'ready'
    && !!doc.standalone && typeof doc.standalone === 'object' && standaloneWindowOpen(doc, now);
}

export function executable(plan: Row, workout: Row, weekNumber: number, source = 'plan'): Row {
  const workoutId = String(workout.workoutId || workout.id);
  return { ...workout, id: source === 'plan' ? planLogId(plan.id, workoutId) : workoutId,
    ...(plan.trainingPolicyVersion ? { trainingPolicyVersion: plan.trainingPolicyVersion } : {}),
    ...(plan.requiresTrainingStartAuthorization === true ? { requiresTrainingStartAuthorization: true } : {}),
    schemaVersion: 2, planId: plan.id, weekNumber, source, workoutId,
    workoutRevision: Number(workout.revision || 1),
    workoutSnapshot: { ...workout, workoutId }, intro: workout.intent || workout.intro || '' };
}

export function resumeWorkout(workout: Row, log: Row | null): Row {
  if (!log) return workout;
  if (log.endedAt) throw new Error('This workout has ended. Choose another workout.');
  if (!log.workoutSnapshot) throw new Error('The saved workout is unavailable. Refresh training.');
  return { ...workout, ...log.workoutSnapshot, id: log.id, planId: log.planId,
    schemaVersion: 2, source: log.source, workoutId: log.workoutId,
    workoutRevision: log.workoutRevision, workoutSnapshot: log.workoutSnapshot };
}

export function freshWorkout(plan: Row, reviewed: Row, adhoc?: Row, now = new Date()): Row {
  if (plan.schemaVersion !== 3 || plan.status !== 'active') throw new Error('This training plan is no longer active.');
  let current: Row;
  if (reviewed.source === 'plan') {
    const found = findWorkout(plan, reviewed.workoutId);
    if (!found) throw new Error('This workout is no longer in the plan.');
    current = executable(plan, found.workout, found.week.weekNumber);
  } else {
    const window = adhoc && weekWindow(plan, adhoc.weekNumber);
    const day = localDayString(now, plan.timezone);
    if (!adhoc || adhoc.planId !== plan.id || adhoc.status !== 'ready' || !window || day < window.start || day >= window.end) {
      throw new Error('This workout is no longer ready. Create a fresh workout.');
    }
    current = executable(plan, adhoc, adhoc.weekNumber, 'adhoc');
  }
  return checkedCurrent(current, reviewed);
}

/** `freshWorkout` for the standalone namespace: the saved workout alone, with no training plan read. */
export function freshStandaloneWorkout(playerId: string, reviewed: Row, saved?: Row, now = new Date()): Row {
  if (reviewed.source !== 'adhoc' || !saved || !standaloneWorkoutIsReady(saved, playerId, now)) throw new Error('This workout is no longer ready. Create a fresh workout.');
  return checkedCurrent(executable(executionPlan(null, saved), saved, Number(saved.weekNumber) || 1, 'adhoc'), reviewed);
}

function checkedCurrent(current: Row, reviewed: Row): Row {
  if (current.workoutRevision !== reviewed.workoutRevision) throw new Error('This workout changed. Review it again before starting.');
  if (!current.blocks?.length) throw new Error('This workout has no executable drills.');
  return current;
}

export function initialLog(workout: Row, startedAt: unknown): Row {
  return { schemaVersion: 2, planId: workout.planId, weekNumber: workout.weekNumber,
    source: workout.source, workoutId: workout.workoutId, workoutRevision: workout.workoutRevision,
    workoutSnapshot: workout.workoutSnapshot, startedAt, blocks: [] };
}

export function patchBlock(log: Row, blockId: string, row: Row | null): Row[] {
  if (log.endedAt) throw new Error('This workout has already ended.');
  if (!log.workoutSnapshot?.blocks?.some((b: Row) => b.blockId === blockId)) throw new Error('That drill is not in this workout.');
  const blocks = [...(log.blocks || [])].filter((b: Row) => b.blockId !== blockId);
  return row ? [...blocks, row] : blocks;
}

export function completedMinutes(log: Row): number {
  if (Number.isFinite(log.activeSeconds)) return Math.max(0, log.activeSeconds / 60);
  const time = (v: any) => v?.toDate?.()?.getTime() ?? new Date(v).getTime();
  return log.endedAt ? Math.max(0, (time(log.endedAt) - time(log.startedAt)) / 60000) || 0 : 0;
}
