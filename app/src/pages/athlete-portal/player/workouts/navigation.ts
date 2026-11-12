// How the single Workouts instance follows the workspace route, pure so each rule is pinned by a test.
import type { PlayerRoute } from '../workspace';
import type { ResumeTarget } from './hub';

export type HubPage = 'root' | 'workout' | 'plan' | 'saved' | 'history';

/** Workouts is on screen for its own tab and for My workout plan opened from Stats. */
export const workoutsShown = (route: PlayerRoute) => route.view === 'workouts' || (route.view === 'stats' && route.screen === 'plan');

/**
 * The route the Workouts instance renders: the current one while it is shown, otherwise the last
 * one it was shown with, so nothing changes (or unmounts) under a hidden tab.
 */
export const workoutsRoute = (route: PlayerRoute, lastShown: PlayerRoute) => workoutsShown(route) ? route : lastShown;

/** The hub page, whether a test's results are open, and whether the plan was opened from Stats. */
export function workoutsPage(route: PlayerRoute): { page: HubPage; test: boolean; fromStats: boolean } {
  const page: HubPage = route.screen === 'workout' || route.screen === 'plan' || route.screen === 'saved' || route.screen === 'history' ? route.screen : 'root';
  return { page, test: route.screen === 'test', fromStats: route.view === 'stats' };
}

/** Only the hub (stats and training focus) and History read every workout log; never while hidden. */
export const needsAllLogs = (page: HubPage, active: boolean) => active && (page === 'workout' || page === 'history');

export type ResumeAction = 'returnToPersonal' | 'openPersonal' | 'reviewOnHub' | 'review' | 'start';
/**
 * What a resume banner does (`TrainingHubView.beginWorkout`): a plan or saved workout starts at once,
 * unless the web's start check must be answered first; a personal guided session still live (left
 * with Back, paused under the root) is returned to rather than reopened, which would discard it.
 */
export function resumeAction(target: ResumeTarget, { needsCheck, atRoot, personalLive }: { needsCheck: boolean; atRoot: boolean; personalLive: boolean }): ResumeAction {
  if (target.kind === 'personal') return personalLive ? 'returnToPersonal' : 'openPersonal';
  if (needsCheck) return atRoot ? 'reviewOnHub' : 'review';
  return 'start';
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
