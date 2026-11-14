// Which plan ids the hub's workout stores follow, and which store a workout runs on. The app's
// `WorkoutStore` follows `planId in [activePlan, "standalone"]` with one listener
// (`WorkoutStore.listenedPlanIds`); a web store follows one plan id, so the hub keeps two. Pure,
// so each state is pinned by a test.
import { STANDALONE_SCOPE, isStandalone } from '../execution';
import type { Row } from '../execution';

export type StoreKey = 'main' | 'standalone';

/** The plan id each store follows; null means that store is detached (no listener). */
export interface StoreScopes { main: string | null; standalone: string | null }

/** A workout being followed, with the store it started on. */
export type PlayingOn = { workout: Row; store: StoreKey } | null;

/**
 * - Training plans not loaded yet: neither store follows anything.
 * - No active V3 plan: the main store follows the standalone namespace; there is no second store.
 * - An active V3 plan, live or ended: the main store follows the plan, the second the standalone namespace.
 * A workout being followed keeps its store on the scope it started on until it finishes, whatever
 * the plans do meanwhile, so an admin walkthrough's in-memory log is never reset under it.
 */
export function workoutStoreScopes(plansLoaded: boolean, activeV3PlanId: string | null, playing: PlayingOn): StoreScopes {
  const planScope = plansLoaded ? (activeV3PlanId || STANDALONE_SCOPE) : null;
  const main = (playing?.store === 'main' && playing.workout.planId) || planScope;
  const second = playing?.store === 'standalone' || (plansLoaded && !!activeV3PlanId && main !== STANDALONE_SCOPE);
  return { main, standalone: second ? STANDALONE_SCOPE : null };
}

/** The store a workout opens on now: a standalone workout on the second store while there is one, else the main store. */
export function storeKeyFor(workout: Row | null | undefined, scopes: StoreScopes): StoreKey {
  return isStandalone(workout) && scopes.standalone === STANDALONE_SCOPE ? 'standalone' : 'main';
}

type Listed = { workouts: Row[]; logs: Record<string, Row>; logsLoaded: boolean };

/**
 * Both stores' workouts and logs as one list, as the app's single store holds them. With no second
 * store the main store's own arrays come back unchanged. The list is ready when the main store is:
 * the second store's workouts join it when they arrive, and a second store that never loads (its
 * listener failed) leaves the main store's list as it was.
 */
export function listedWorkouts(main: Listed, second: Listed, scopes: StoreScopes): Listed {
  if (!scopes.standalone) return main;
  const seen = new Set(main.workouts.map(w => w.id));
  return {
    workouts: [...main.workouts, ...second.workouts.filter(w => !seen.has(w.id))],
    logs: { ...second.logs, ...main.logs },
    logsLoaded: main.logsLoaded,
  };
}

/**
 * The store failure a screen shows. The main store's shows on every hub screen, as before; the
 * second store's only on a screen for a workout that runs on it (`opened` is that workout's store),
 * so a failed standalone listener never puts a banner over the plan's own pages.
 */
export function shownStoreError(main: { error: string | null }, second: { error: string | null }, opened: StoreKey | null = null): string | null {
  return main.error || (opened === 'standalone' ? second.error : null) || null;
}
