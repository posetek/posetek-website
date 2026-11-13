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
import { BUILD_WORKOUT } from './workouts/navigation';
import PlayerStats from './stats/PlayerStats';
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
  // My workout plan opened from Stats is the Workouts tab's own page shown over Stats, as in the
  // app, so one instance owns every workout in progress.
  const statsPlan = route.view === 'stats' && route.screen === 'plan';
  const workoutsShown = route.view === 'workouts' || statsPlan;
  const feedbackContext = useRef({ workoutsShown, playerId: ctx.playerId, access: ctx.access });
  feedbackContext.current = { workoutsShown, playerId: ctx.playerId, access: ctx.access };
  // The workspace pages behind this one in the browser's history, oldest first. The in-app Back
  // control steps back only onto a page of the same tab; otherwise it opens the tab's root, so it
  // can never leave the workspace for whatever page came before a link.
  const trail = useRef<{ key: string; view: PlayerView }[]>([]);
  const scrollPositions = useRef(new Map<string, number>());
  const report = useAthleteTestReport(ctx.playerId, preview);
  useEffect(() => {
    if (preview) return;
    const hide = () => { if (document.visibilityState !== 'visible') setFeedbackInvitation(false); };
    const stop = auth.onAuthStateChanged(user => { if (user?.uid !== feedbackOwner.uid) setFeedbackInvitation(false); });
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); document.removeEventListener('visibilitychange', hide); };
  }, [preview, feedbackOwner]);
  useEffect(() => { if (!workoutsShown) setFeedbackInvitation(false); }, [workoutsShown]);
  // A "Start a workout now" request Workouts had no chance to answer goes when the athlete leaves,
  // so the builder never opens by itself on a later visit.
  useEffect(() => { if (route.view !== 'workouts') setRequest(old => old?.destination === BUILD_WORKOUT ? null : old); }, [route.view]);
  const completedWorkout = () => {
    const current = () => feedbackContext.current.access === 'athlete' && feedbackContext.current.workoutsShown
      && feedbackContext.current.playerId === feedbackOwner.playerId && !!feedbackOwner.uid
      && auth.currentUser?.uid === feedbackOwner.uid && document.visibilityState === 'visible';
    if (!current()) return;
    void claimBrowserFeedbackInvitation().then(claimed => { if (claimed && current()) setFeedbackInvitation(true); });
  };
  useEffect(() => {
    // The plan opened from Stats is rendered by Workouts, which then stays mounted like any visited tab.
    const shown: PlayerView[] = route.view === 'stats' && route.screen === 'plan' ? ['stats', 'workouts'] : [route.view];
    setVisited(old => shown.every(view => old.has(view)) ? old : new Set([...old, ...shown]));
  }, [route.view, route.screen]);
  useEffect(() => {
    if (!workoutsShown) window.dispatchEvent(new CustomEvent('posetek:player-route-leave'));
  }, [workoutsShown]);
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
    if (workoutsShown && view !== 'workouts' && !(view === 'stats' && to.screen === 'plan')) window.dispatchEvent(new CustomEvent('posetek:player-route-leave'));
    scrollPositions.current.set(location.key, window.scrollY);
    navigate({ pathname: location.pathname, search: playerSearch(location.search, view, to) }, { replace: to.replace });
    window.scrollTo({ top: 0 });
  };
  // "Start a workout now" on Stats: Workouts opens with the builder its Build Workout card opens.
  const startWorkout = () => { setRequest({ destination: BUILD_WORKOUT }); go('workouts'); };
  const back = () => {
    const previous = trail.current[trail.current.length - 2];
    // A test opened from a Stats score card goes back to Stats, the page it was opened from.
    if (previous && (previous.view === route.view || (route.fromStats && previous.view === 'stats'))) navigate(-1);
    else if (route.fromStats) go('stats', { replace: true });
    else go(route.view, { replace: true });
  };
  useEffect(() => {
    const entry = { key: location.key, view: route.view };
    const known = trail.current.findIndex(item => item.key === location.key);
    if (navigationType === 'POP' && known >= 0) trail.current = trail.current.slice(0, known + 1);
    else if (navigationType === 'REPLACE' && trail.current.length) trail.current[trail.current.length - 1] = entry;
    else trail.current.push(entry);
    // Returning to a page (Back from the plan to Stats) lands where the athlete left it.
    if (navigationType === 'POP') window.scrollTo({ top: scrollPositions.current.get(location.key) ?? 0 });
  }, [location.key, navigationType, route.view]);
  // A sheet over the workspace pauses the tab under it, as the app's `isActive` does.
  const tab = (view: PlayerView): PlayerTabProps => ({ ctx: playerCtx, route, go, back, active: route.view === view && !accountSettings, preview, athlete, reps, personal, report });
  return <PlayerShell activeView={route.view} search={location.search} pathname={location.pathname} initials={playerInitials(athlete?.name)} onNavigate={view => go(view as PlayerView)} hideDock={guided && workoutsShown}
    onAccountSettings={() => setAccountSettings(true)} onReturnHome={() => go('home')} onSignOut={preview ? undefined : () => { void auth.signOut(); }}>
      {preview && <p className="player-preview-note">Local preview · sample data · no account changes</p>}
      {refreshError && <p className="player-error" role="status">Could not refresh your latest results: {refreshError}</p>}
      {visited.has('home') && <div hidden={route.view !== 'home'}><PlayerHome {...tab('home')} /></div>}
      {visited.has('coach') && <div hidden={route.view !== 'coach'}><PlayerHeader title="Coach" /><CoachChat playerId={ctx.playerId!} preview={preview} personalStore={personal} athlete={athlete} active={route.view === 'coach' && !accountSettings}
        technique={{ reps: all, onReplay: rep => go('workouts', { drill: 'shooting', session: rep.sessionFolder || `session${rep.sessionNumber}`, rep: rep.id }) }} onHandoff={r => { setRequest(r); if (r.conversationId) navigate({ pathname: location.pathname, search: personalDraftLink(location.search, r.conversationId) }); else go('workouts'); }} /></div>}
      {(visited.has('workouts') || statsPlan) && <div hidden={!workoutsShown}><PlayerWorkouts {...tab('workouts')} active={workoutsShown && !accountSettings} statsProfile={intakeSnapshot(profile)} request={route.view === 'workouts' ? request : null} onAcknowledge={() => setRequest(null)} onCompleted={completedWorkout} feedbackInvitation={feedbackInvitation} onDismissFeedback={() => setFeedbackInvitation(false)} onGuidedChange={setGuided} /></div>}
      {visited.has('stats') && <div hidden={route.view !== 'stats' || statsPlan}><PlayerStats {...tab('stats')} active={route.view === 'stats' && !statsPlan} profile={profile} dataset={dataset} onStartWorkout={startWorkout} /></div>}
      {accountSettings && <AccountSettings ctx={playerCtx} onClose={() => setAccountSettings(false)} />}
  </PlayerShell>;
}
