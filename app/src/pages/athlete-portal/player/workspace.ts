import { DRILLS } from '../lib/drills';
import type { PortalContext } from '../views/shared';
import type { Row } from './execution';
import type { PersonalWorkoutStore } from './use-personal-workouts';
import { PLAYER_SUBROUTE_KEYS, canonicalPlayerView } from './PlayerShell';
import type { PlayerView } from './PlayerShell';

/**
 * A page pushed inside a tab, mirroring the app's `TrainingHubDestination`:
 * `workout` is the workout hub, `plan` is My workout plan (also opened from Stats),
 * `saved` and `history` are the two lists, and `test` is one measured test's results.
 */
export type PlayerScreen = 'workout' | 'plan' | 'saved' | 'history' | 'test' | null;
/** The two pages of the Workouts carousel (`WorkoutWorkspacePage`): tests first, activities second. */
export type WorkoutsPage = 'tests' | 'activities';

export type PlayerRoute = {
  view: PlayerView;
  screen: PlayerScreen;
  page: WorkoutsPage;
  drill: string;
  session: string | null;
  rep: string | null;
};

const WORKOUT_SCREENS = ['workout', 'plan', 'saved', 'history'];

/**
 * One parser for every link into the workspace. Links saved before the four tabs still open the
 * destination that replaced them: `view=training` (report and notification links) opens the
 * workout hub, as the app's report link does; `drill=`/`view=drills` open that test's results
 * inside Workouts; `view=profile` opens Stats; leaderboard and feed links open Home.
 */
export function playerRoute(search: string): PlayerRoute {
  const params = new URLSearchParams(search), raw = params.get('view'), requested = params.get('screen');
  const test = params.has('drill') || raw === 'drills';
  const view = test ? 'workouts' : canonicalPlayerView(raw);
  let screen: PlayerScreen = null;
  if (view === 'workouts') {
    if (test) screen = 'test';
    else if (raw === 'training') screen = 'workout';
    else if (requested && WORKOUT_SCREENS.includes(requested)) screen = requested as PlayerScreen;
  } else if (view === 'stats' && requested === 'plan') screen = 'plan';
  const drill = params.get('drill');
  return {
    view, screen,
    page: view === 'workouts' && !screen && params.get('page') === 'activities' ? 'activities' : 'tests',
    drill: DRILLS.some(item => item.key === drill) ? drill! : 'shooting',
    session: params.get('session'), rep: params.get('rep'),
  };
}

export type PlayerDestination = {
  screen?: Exclude<PlayerScreen, 'test'>;
  page?: WorkoutsPage;
  drill?: string;
  session?: string;
  rep?: string;
  /** Replace the current history entry, for a correction that Back should not return to. */
  replace?: boolean;
};

/** The canonical query for a destination. Unrelated parameters (preview, player) are kept. */
export function playerSearch(search: string, view: PlayerView, to: PlayerDestination = {}) {
  const params = new URLSearchParams(search);
  for (const key of PLAYER_SUBROUTE_KEYS) params.delete(key);
  params.set('view', view);
  if (to.drill) {
    params.set('drill', to.drill);
    if (to.session) params.set('session', to.session);
    if (to.rep) params.set('rep', to.rep);
  } else if (to.screen) params.set('screen', to.screen);
  else if (to.page === 'activities') params.set('page', 'activities');
  return params.toString();
}

export type PlayerGo = (view: PlayerView, to?: PlayerDestination) => void;

/** What every tab receives. A tab owns the pages pushed inside it and renders its own header. */
export type PlayerTabProps = {
  ctx: PortalContext;
  route: PlayerRoute;
  go: PlayerGo;
  /** Browser Back, falling back to the tab root when the page was opened directly from a link. */
  back: () => void;
  /** True while this tab is the one on screen. Hidden tabs stay mounted to keep their state. */
  active: boolean;
  preview: boolean;
  athlete: Row;
  reps: Record<string, Row[]>;
  personal: PersonalWorkoutStore;
};
