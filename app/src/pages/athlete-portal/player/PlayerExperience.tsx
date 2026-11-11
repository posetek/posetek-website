import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { auth, cloud, db } from '../../../lib/firebase';
import { visibleAttempts } from '../../../lib/result-values';
import { parseProvisionalEstimates } from '../../../lib/provisional-estimates';
import { DRILLS } from '../lib/drills';
import { accepted, allStatsReps, normalizeRep } from '../lib/metrics';
import type { PortalContext } from '../views/shared';
import CoachChat from './CoachChat';
import { usePersonalWorkouts } from './use-personal-workouts';
import { useCoachConfig } from './gateway';
import { personalDraftLink } from './personal-conversation';
import { defaultDataset, intakeSnapshot, playerProfile } from './scoring';
import type { Row } from './execution';
import PlayerShell, { PlayerHeader, playerInitials } from './PlayerShell';
import type { PlayerView } from './PlayerShell';
import { playerRoute, playerSearch } from './workspace';
import type { PlayerDestination, PlayerTabProps } from './workspace';
import PlayerHome from './home/PlayerHome';
import PlayerWorkouts from './workouts/PlayerWorkouts';
import PlayerStats from './stats/PlayerStats';
import WorkoutPlanPage from './workouts/WorkoutPlanPage';
import AccountSettings from './account/AccountSettings';
import { useAthleteTestReport } from './report';
import './player.css';
import { claimBrowserFeedbackInvitation } from './feedback-invitation';

export { PLAYER_TABS } from './PlayerShell';
export { playerRoute } from './workspace';

/** The same four-tab athlete workspace as the app: Home, Coach, Workouts and Stats. */
export default function PlayerExperience({ ctx, initialReps }: { ctx: PortalContext; initialReps: Record<string, Row[]> }) {
  const location = useLocation(), navigate = useNavigate(), navigationType = useNavigationType(), route = playerRoute(location.search);
  const preview = ctx.access === 'preview';
  const coachConfig = useCoachConfig(preview);
  const personal = usePersonalWorkouts(ctx.playerId!, preview, coachConfig);
  const [reps, setReps] = useState(initialReps), [athlete, setAthlete] = useState(ctx.athlete), [dataset, setDataset] = useState(defaultDataset);
  const [provisionalEstimates, setProvisionalEstimates] = useState(ctx.provisionalEstimates || []);
  const [visited, setVisited] = useState(new Set<PlayerView>([route.view])), [request, setRequest] = useState<Row | null>(null), [refreshError, setRefreshError] = useState('');
  const [feedbackInvitation, setFeedbackInvitation] = useState(false), [accountSettings, setAccountSettings] = useState(false), [guided, setGuided] = useState(false);
  const [feedbackOwner] = useState(() => ({ uid: auth.currentUser?.uid, playerId: ctx.playerId }));
  const feedbackContext = useRef({ view: route.view, playerId: ctx.playerId, access: ctx.access });
  feedbackContext.current = { view: route.view, playerId: ctx.playerId, access: ctx.access };
  // Pages opened inside this visit can use browser Back; a page opened straight from a link cannot.
  const pushed = useRef(0);
  const scrollPositions = useRef(new Map<string, number>());
  const report = useAthleteTestReport(ctx.playerId, preview);
  useEffect(() => {
    if (preview) return;
    const hide = () => { if (document.visibilityState !== 'visible') setFeedbackInvitation(false); };
    const stop = auth.onAuthStateChanged(user => { if (user?.uid !== feedbackOwner.uid) setFeedbackInvitation(false); });
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); document.removeEventListener('visibilitychange', hide); };
  }, [preview, feedbackOwner]);
  useEffect(() => { if (route.view !== 'workouts') setFeedbackInvitation(false); }, [route.view]);
  const completedWorkout = () => {
    const current = () => feedbackContext.current.access === 'athlete' && feedbackContext.current.view === 'workouts'
      && feedbackContext.current.playerId === feedbackOwner.playerId && !!feedbackOwner.uid
      && auth.currentUser?.uid === feedbackOwner.uid && document.visibilityState === 'visible';
    if (!current()) return;
    void claimBrowserFeedbackInvitation().then(claimed => { if (claimed && current()) setFeedbackInvitation(true); });
  };
  useEffect(() => { setVisited(old => old.has(route.view) ? old : new Set([...old, route.view])); }, [route.view]);
  useEffect(() => {
    if (route.view !== 'workouts') window.dispatchEvent(new CustomEvent('posetek:player-route-leave'));
  }, [route.view]);
  useEffect(() => {
    if (preview) return;
    const player = db.collection('players').doc(ctx.playerId!);
    let alive = true, refreshVersion = 0;
    const stopPlayer = player.onSnapshot(d => { if (d.exists) setAthlete({ ...d.data(), id: d.id }); }, e => setRefreshError(e.message));
    const stopReps = player.collection('reps').onSnapshot(() => {
      const version = ++refreshVersion;
      void cloud.httpsCallable('getAthleteEffectiveResults')({ playerId: ctx.playerId }).then(response => {
        if (!alive || version !== refreshVersion) return;
        const payload = response.data as Row;
        const rows = visibleAttempts((payload.reps || []).map(normalizeRep));
        setReps(old => Object.fromEntries(DRILLS.map(d => [d.key, d.key === 'freeRecord' ? old.freeRecord : rows.filter(r => accepted(r, d))])));
        setProvisionalEstimates(parseProvisionalEstimates(payload.provisionalEstimates));
        setRefreshError('');
      }).catch(e => { if (alive && version === refreshVersion) { setProvisionalEstimates([]); setRefreshError(e.message); } });
    }, e => setRefreshError(e.message));
    const stopBenchmarks = db.collection('benchmarks').doc('d1').onSnapshot(d => {
      const value = d.data();
      if (value?.schemaVersion === 1 && value.tier === 'd1' && value.cells && Number.isInteger(value.generation)) setDataset(old => value.generation > old.generation ? value : old);
    }, () => { /* bundled generation remains valid offline */ });
    return () => { alive = false; ++refreshVersion; stopPlayer(); stopReps(); stopBenchmarks(); };
  }, [ctx.playerId, preview]);
  const all = useMemo(() => allStatsReps(reps), [reps]);
  const profile = useMemo(() => playerProfile(all, athlete, dataset), [all, athlete, dataset]);
  const playerCtx = useMemo(() => ({ ...ctx, athlete, provisionalEstimates, allStatsReps: () => all, allResultReps: () => Object.values(reps).flat() }), [ctx, athlete, all, reps, provisionalEstimates]);
  const go = (view: PlayerView, to: PlayerDestination = {}) => {
    if (route.view === 'workouts' && view !== 'workouts') window.dispatchEvent(new CustomEvent('posetek:player-route-leave'));
    if (!to.replace) pushed.current += 1;
    scrollPositions.current.set(location.key, window.scrollY);
    navigate({ pathname: location.pathname, search: playerSearch(location.search, view, to) }, { replace: to.replace });
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    if (pushed.current > 0) { pushed.current -= 1; navigate(-1); }
    else go(route.view, { replace: true });
  };
  // Returning to a page (Back from the plan to Stats) lands where the athlete left it.
  useEffect(() => {
    if (navigationType === 'POP') window.scrollTo({ top: scrollPositions.current.get(location.key) ?? 0 });
  }, [location.key, navigationType]);
  const statsPlan = route.view === 'stats' && route.screen === 'plan';
  // A sheet over the workspace pauses the tab under it, as the app's `isActive` does.
  const tab = (view: PlayerView): PlayerTabProps => ({ ctx: playerCtx, route, go, back, active: route.view === view && !accountSettings, preview, athlete, reps, personal, report });
  return <PlayerShell activeView={route.view} search={location.search} pathname={location.pathname} initials={playerInitials(athlete?.name)} onNavigate={view => go(view as PlayerView)} hideDock={guided && route.view === 'workouts'}
    onAccountSettings={() => setAccountSettings(true)} onReturnHome={() => go('home')} onSignOut={preview ? undefined : () => { void auth.signOut(); }}>
      {preview && <p className="player-preview-note">Local preview · sample data · no account changes</p>}
      {refreshError && <p className="player-error" role="status">Could not refresh your latest results: {refreshError}</p>}
      {visited.has('home') && <div hidden={route.view !== 'home'}><PlayerHome {...tab('home')} /></div>}
      {visited.has('coach') && <div hidden={route.view !== 'coach'}><PlayerHeader title="Coach" /><CoachChat playerId={ctx.playerId!} preview={preview} personalStore={personal} athlete={athlete} active={route.view === 'coach' && !accountSettings}
        technique={{ reps: all, onReplay: rep => go('workouts', { drill: 'shooting', session: rep.sessionFolder || `session${rep.sessionNumber}`, rep: rep.id }) }} onHandoff={r => { setRequest(r); if (r.conversationId) navigate({ pathname: location.pathname, search: personalDraftLink(location.search, r.conversationId) }); else go('workouts', { screen: 'workout' }); }} /></div>}
      {visited.has('workouts') && <div hidden={route.view !== 'workouts'}><PlayerWorkouts {...tab('workouts')} statsProfile={intakeSnapshot(profile)} request={route.view === 'workouts' ? request : null} onAcknowledge={() => setRequest(null)} onCompleted={completedWorkout} feedbackInvitation={feedbackInvitation} onDismissFeedback={() => setFeedbackInvitation(false)} onGuidedChange={setGuided} /></div>}
      {visited.has('stats') && <div hidden={route.view !== 'stats' || statsPlan}><PlayerStats {...tab('stats')} active={route.view === 'stats' && !statsPlan} profile={profile} dataset={dataset} /></div>}
      {statsPlan && <WorkoutPlanPage {...tab('stats')} fromStats />}
      {accountSettings && <AccountSettings ctx={playerCtx} onClose={() => setAccountSettings(false)} />}
  </PlayerShell>;
}
