import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { drillByKey } from '../../lib/drills';
import DrillDashboard from '../../views/DrillDashboard';
import SessionView from '../../views/SessionView';
import { PlayerHeader } from '../PlayerShell';
import PlayerTraining from '../PlayerTraining';
import { workoutsPage, workoutsRoute, workoutsShown } from './navigation';
import PlayerFeedbackInvitation, { PlayerResultsFeedbackLink } from '../PlayerFeedbackInvitation';
import { showResultsFeedback } from '../feedback-invitation';
import type { Row } from '../execution';
import { playerSearch } from '../workspace';
import type { PlayerTabProps, WorkoutsPage } from '../workspace';
import { MEASURED_TESTS } from './WorkoutsRoot';
import './workouts.css';

export { MEASURED_TESTS } from './WorkoutsRoot';

type Props = PlayerTabProps & {
  statsProfile: Row;
  request: Row | null;
  onAcknowledge: () => void;
  onCompleted?: () => void;
  feedbackInvitation: boolean;
  onDismissFeedback: () => void;
  /** True while a guided workout fills the screen; the shell hides the dock for it. */
  onGuidedChange?: (active: boolean) => void;
};

/**
 * Workouts (the app's `TrainingHubView` workspace): the tests and activities carousel, the workout hub,
 * My workout plan, Saved Workouts, History, and each test's results. The hub's state stays mounted for
 * as long as the tab is, so a workout in progress survives a look at another page or tab.
 */
export default function PlayerWorkouts({ ctx, route: current, go, back, active, reps, personal, statsProfile, request, onAcknowledge, onCompleted, feedbackInvitation, onDismissFeedback, onGuidedChange }: Props) {
  const location = useLocation(), navigate = useNavigate();
  // Shown for Workouts and for My workout plan opened from Stats. While another tab is on screen the
  // last route it was shown with stays in force, so a streaming chat, the planner or an open review
  // is not torn down under the hidden tab.
  const lastShown = useRef(current);
  if (workoutsShown(current)) lastShown.current = current;
  const route = workoutsRoute(current, lastShown.current);
  const { page, test, fromStats } = workoutsPage(route);
  const hub = page !== 'root';
  // A swipe updates the address in place: it is not a page the browser's Back should step through.
  const onWorkoutsPage = useCallback((next: WorkoutsPage) => {
    navigate({ pathname: location.pathname, search: playerSearch(location.search, 'workouts', { page: next }) }, { replace: true });
  }, [navigate, location.pathname, location.search]);
  const [guided, setGuided] = useState(false);
  useEffect(() => { onGuidedChange?.(guided && !test); }, [guided, test]);
  const drill = drillByKey(route.drill), drillReps = reps[drill.key] || [];
  const testInfo = MEASURED_TESTS.find(item => item.drill === drill.key);
  // Opened from a Stats score card: the marker stays while moving inside the test, so Back and the
  // "Back to my profile" button keep leading to the profile.
  const from = route.fromStats ? 'stats' as const : undefined;
  const resultsBack = route.session ? () => go('workouts', { drill: drill.key, from, replace: true }) : back;
  return <>
    {test && <section className="player-drills wk-test-page">
      <PlayerHeader title={testInfo?.title || drill.label} onBack={resultsBack} backLabel={from && !route.session ? 'Back to my profile' : 'Back'} />
      {from && <button type="button" className="wk-back-profile" onClick={() => go('stats')}><span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>Back to my profile</button>}
      {route.session
        ? <SessionView drill={drill} folder={route.session} selectedId={route.rep} reps={drillReps} access={ctx.access} playerId={ctx.playerId} shareToken={null} onBack={() => go('workouts', { drill: drill.key, from, replace: true })} onSelectRep={id => go('workouts', { drill: drill.key, session: route.session!, rep: String(id), from, replace: true })} />
        : <DrillDashboard drill={drill} reps={drillReps} athlete={ctx.athlete} onOpenRep={(folder, id) => go('workouts', { drill: drill.key, session: folder, rep: String(id), from })} />}
      <p className="wk-test-note"><span className="material-symbols-outlined" aria-hidden="true">photo_camera</span>Record and process new drills in the PoseTek app. Video appears here when it was saved to the cloud.</p>
      {showResultsFeedback(ctx.access, drillReps.length) && <PlayerResultsFeedbackLink />}
    </section>}
    <div hidden={test}>
      <PlayerTraining ctx={ctx} statsProfile={statsProfile} personal={personal} request={hub ? request : null} onAcknowledge={onAcknowledge} onCompleted={onCompleted}
        page={page} fromStats={fromStats} active={active} go={go} back={back} workoutsPage={route.page} onWorkoutsPage={onWorkoutsPage} onTest={key => go('workouts', { drill: key })}
        hubNotice={feedbackInvitation ? <PlayerFeedbackInvitation onDismiss={onDismissFeedback} /> : null} onGuidedChange={setGuided} />
    </div>
  </>;
}
