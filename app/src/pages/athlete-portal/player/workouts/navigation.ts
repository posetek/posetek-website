// How the single Workouts instance follows the workspace route, pure so each rule is pinned by a test.
import type { PlayerRoute } from '../workspace';
import type { ResumeTarget } from './hub';

/** The app's `TrainingHubDestination`: the hub is the root; the other pages are pushed over it. */
export type HubPage = 'root' | 'plan' | 'saved' | 'history' | 'tests';

/** Workouts is on screen for its own tab and for My workout plan opened from Stats. */
export const workoutsShown = (route: PlayerRoute) => route.view === 'workouts' || (route.view === 'stats' && route.screen === 'plan');

/**
 * The route the Workouts instance renders: the current one while it is shown, otherwise the last
 * one it was shown with, so nothing changes (or unmounts) under a hidden tab.
 */
export const workoutsRoute = (route: PlayerRoute, lastShown: PlayerRoute) => workoutsShown(route) ? route : lastShown;

/** The hub page, whether a test's results are open, and whether the plan was opened from Stats. */
export function workoutsPage(route: PlayerRoute): { page: HubPage; test: boolean; fromStats: boolean } {
  const page: HubPage = route.screen === 'plan' || route.screen === 'saved' || route.screen === 'history' || route.screen === 'tests' ? route.screen : 'root';
  return { page, test: route.screen === 'test', fromStats: route.view === 'stats' };
}

/**
 * My workout plan has nothing to show until a plan is active, so the page is then where one is
 * built: "Build my 6-week plan" on Stats, and a saved link, land on the planner, not an empty page.
 */
export const planPageBuilds = (page: HubPage, plans: { status?: string }[] | null) => page === 'plan' && !!plans && !plans.some(plan => plan.status === 'active');

/** "Build my 6-week plan" on Stats opens the planner at the length the button names. */
export const STATS_PLAN_WEEKS = 6;

/** What Stats asks of Workouts for "Start a workout now". The Coach tab's handoffs carry the gateway's own destinations. */
export const BUILD_WORKOUT = 'build_workout';
/**
 * Whether that request opens the builder the hub's Build Workout card opens. A workout being
 * followed and a builder already open stay as the athlete left them; a viewer with no builder
 * lands on the hub.
 */
export const buildWorkoutOpens = (state: { playing: boolean; builderOpen: boolean; canCreate: boolean }) => !state.playing && !state.builderOpen && state.canCreate;

/** Only History reads every workout log, and never while hidden. The lifetime totals are on Stats, which reads its own. */
export const needsAllLogs = (page: HubPage, active: boolean) => active && page === 'history';

export type ResumeAction = 'openPersonal' | 'review' | 'start';
/**
 * What a resume banner does (`TrainingHubView.beginWorkout`): a plan or saved workout starts at once,
 * unless the web's start check must be answered first; a personal workout reopens in its own hub.
 */
export function resumeAction(target: ResumeTarget, { needsCheck }: { needsCheck: boolean }): ResumeAction {
  if (target.kind === 'personal') return 'openPersonal';
  return needsCheck ? 'review' : 'start';
}

export type ScrollStep = 'none' | 'top' | 'restore';
/**
 * Scrolling for presentations inside one page. Page changes belong to the workspace, which scrolls
 * pushed pages to the top and restores a page reached with the browser's Back.
 */
export function overlayScroll(previous: { page: HubPage; key: string }, next: { page: HubPage; key: string }): ScrollStep {
  if (previous.page !== next.page || previous.key === next.key) return 'none';
  const before = previous.key.split('/').filter(Boolean), after = next.key.split('/').filter(Boolean);
  return after.length > before.length && before.every(part => after.includes(part)) ? 'top' : 'restore';
}
