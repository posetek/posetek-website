// Build Workout on the app's connection (`CreateTrainingWorkoutCard`, app build 1.1 41): where,
// minutes and energy, then the workout chat (`workout_chat`) on a `new` target, saved by an
// `apply_workout_draft` job. Pure, so each rule is pinned by a test.
import type { Access } from '../../lib/loaders';

export type WorkoutPlace = 'field' | 'gym' | 'home';
export type Energy = 'low' | 'normal' | 'high';

export const WORKOUT_PLACES: { id: WorkoutPlace; label: string; detail: string; icon: string }[] = [
  { id: 'field', label: 'Soccer field', detail: 'Technical and physical workout with the ball', icon: 'sports_soccer' },
  { id: 'gym', label: 'Gym', detail: 'Weights, bands and a bench', icon: 'fitness_center' },
  { id: 'home', label: 'At home', detail: 'Bodyweight and floor exercises', icon: 'home' },
];

export const ENERGY_CHOICES: { id: Energy; label: string }[] = [
  { id: 'low', label: 'Low' }, { id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' },
];

/** The app's `WorkoutMinutesSlider`: 15 to 120 minutes in steps of 15 (the gateway accepts 1…135). */
export const MINUTE_STOPS = [15, 30, 45, 60, 75, 90, 105, 120];

/** The slider's start (`WorkoutMinutesSlider.defaultMinutes`): the plan's session length on the nearest stop, else 30. */
export function defaultMinutes(planMinutes: unknown): number {
  const value = Number(planMinutes);
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.min(120, Math.max(15, Math.round(value / 15) * 15));
}

export type CreateAnswers = { place: WorkoutPlace; goal: boolean | null; minutes: number; energy: Energy | null };

/** Every question answered: energy, and on a soccer field whether there is a goal. */
export function createReady(answers: CreateAnswers): boolean {
  return answers.energy !== null && Number.isInteger(answers.minutes) && answers.minutes >= 1 && answers.minutes <= 135
    && (answers.place !== 'field' || answers.goal !== null);
}

/**
 * The workout chat's target, exactly the app's `WorkoutChatTarget.new` fields. Like the app's
 * On-field build it carries no `workoutType`.
 */
export function createTarget(planId: string, answers: CreateAnswers) {
  return { kind: 'new' as const, planId, timeAvailableMinutes: answers.minutes, energy: answers.energy || 'normal' };
}

/**
 * Where the athlete trains, as the chat's opening request. It is put in the message box, not sent:
 * the athlete adds what to work on and sends it, as with the app's On-field build. The ball is assumed.
 */
export function openingRequest(answers: Pick<CreateAnswers, 'place' | 'goal'>): string {
  if (answers.place === 'gym') return 'Gym workout with weights, bands and a bench. ';
  if (answers.place === 'home') return 'At-home workout with bodyweight and floor exercises only. ';
  return answers.goal ? 'Soccer field workout with a ball and a goal. ' : 'Soccer field workout with a ball and no goal. ';
}

/**
 * Who may build and save (`TrainingAccessPolicy.canEdit`; the gateway's `authorize_v3(mutation=True)`
 * lets only the athlete or a verified admin edit). Club staff and shared links see the card disabled.
 */
export const canBuildWorkout = (access: Access) => access === 'athlete' || access === 'admin' || access === 'preview';
export const BUILD_REFUSED = 'Athlete or admin only';

/**
 * How a workout runs (`TrainingAccessPolicy.executionMode`): the athlete's own log, a walkthrough
 * with the log kept in memory for an admin, the sample's in-memory log, or not at all.
 */
export type RunMode = 'live' | 'walkthrough' | 'preview' | 'blocked';
export function runMode(access: Access): RunMode {
  if (access === 'athlete') return 'live';
  if (access === 'admin') return 'walkthrough';
  if (access === 'preview') return 'preview';
  return 'blocked';
}
export const RUN_REFUSED = 'Athlete starts this workout';

/** Build Workout opens the card on an active V3 plan; with none the plan is set up first (`.planSetup`). */
export const buildWorkoutStep = (hasActiveV3Plan: boolean): 'card' | 'plan' => hasActiveV3Plan ? 'card' : 'plan';
