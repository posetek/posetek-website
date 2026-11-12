import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { db } from '../../../lib/firebase';
import { currentWeekNumber, findWorkout, weekOf } from '../../../lib/contracts/planV3';
import { submitLlmJob, waitForJob } from '../lib/loaders';
import type { PortalContext } from '../views/shared';
import TrainingView from '../views/TrainingView';
import '../views/training-hub.css';
import { executable } from './execution';
import type { Row } from './execution';
import { usePlayerWorkouts } from './use-player-workouts';
import { capabilityEnabled, useCoachConfig } from './gateway';
import ProgramIntake from './ProgramIntake';
import PlayerWorkout from './PlayerWorkout';
import DrillMedia from './DrillMedia';
import CoachChat from './CoachChat';
import { needsTrainingStartCheck } from './workout-repository';
import TrainingStartConfirmation from './TrainingStartConfirmation';
import PersonalWorkoutHub from './PersonalWorkoutHub';
import type { PersonalWorkoutStore } from './use-personal-workouts';
import { personalDraftLink } from './personal-conversation';
import { playerRoute } from './workspace';
import type { PlayerGo } from './workspace';
import type { SourceWorkout } from './personal-workouts';
import { PlayerHeader } from './PlayerShell';
import { findResume, planCardModel, planPagePlan, resumeBannerText, savedEntries, savedWorkouts } from './workouts/hub';
import { BUILD_WORKOUT, STATS_PLAN_WEEKS, buildWorkoutOpens, needsAllLogs, overlayScroll, planPageBuilds, resumeAction } from './workouts/navigation';
import type { HubPage } from './workouts/navigation';
import type { ResumeTarget, SavedEntry } from './workouts/hub';
import MyWorkoutPlan, { Eyebrow, InfoNote, PlanWeekDetail } from './workouts/MyWorkoutPlan';
import WorkoutReview from './workouts/WorkoutReview';
import WorkoutFull from './workouts/WorkoutFull';
import PlanDetails from './workouts/PlanDetails';
import { HistoryList, SavedLibrary } from './workouts/HistoryAndSaved';
import { FreeSessionBanner, HubLinks, PlanInvitationCard, PlanSummaryCard, ResumeBanner, TestsGrid, WorkoutActions } from './workouts/WorkoutsRoot';
import AppOnlySheet from './workouts/AppOnlySheet';
import type { AppOnlyKind } from './workouts/AppOnlySheet';
import { allWorkoutLogs, useAllWorkoutLogs } from './workouts/use-workout-logs';
import './workouts/workouts.css';

export function previewProgram(): Row {
  const today = new Date();
  return { id: 'preview-plan', schemaVersion: 3, status: 'active', horizonWeeks: 2, startDate: today.toLocaleDateString('en-CA'), timezone: 'America/Los_Angeles', sessionsPerWeek: 2, minutesPerSession: 30,
    assessment: { summary: 'A focused block to improve close control and quick changes of direction.' }, intake: { goals: ['dribbling', 'speedAgility'], setting: 'solo' },
    weeks: [1, 2].map(weekNumber => ({ weekNumber, theme: weekNumber === 1 ? 'Own your first touch' : 'Keep control at speed', focus: 'Stay controlled, then build speed.', targets: [{ domain: 'dribbling', exposures: 2 }, { domain: 'passing', exposures: 2 }],
      workouts: [1, 2].map(order => ({ workoutId: `w${weekNumber}s${order}`, revision: 1, order, title: order === 1 ? 'Keep the ball close' : 'Quick feet, sharp turns', intent: 'Build clean touches and stay balanced.', estimatedMinutes: 28, budgetMinutes: 30, focusDomains: ['dribbling', 'passing'],
        blocks: [{ blockId: 'b1', order: 1, drillId: 'DRB-005', name: 'Cone maze', kind: 'main', domain: 'dribbling', sets: 3, reps: 60, repUnit: 'seconds', restSeconds: 30, restScope: 'sets', estimatedMinutes: 14, cues: ['Small touches', 'Eyes up'] }, { blockId: 'b2', order: 2, drillId: 'PAS-001', name: 'Wall pass rhythm', kind: 'main', domain: 'passing', sets: 3, reps: 60, repUnit: 'seconds', restSeconds: 30, restScope: 'sets', estimatedMinutes: 12, cues: ['Open your body'] }] })) })) };
}

/** The pages of the Workouts tab this component hosts (the app's `TrainingHubDestination`). */
export type { HubPage } from './workouts/navigation';
const PAGE_TITLE: Record<Exclude<HubPage, 'root'>, string> = { plan: 'My workout plan', saved: 'Saved Workouts', history: 'History', tests: 'Tests' };

type Props = {
  ctx: PortalContext; statsProfile: Row; personal: PersonalWorkoutStore; request: Row | null; onAcknowledge: () => void; onCompleted?: () => void;
  /** Which page is on screen. The state below survives moving between them. */
  page: HubPage;
  /** My workout plan opened from Stats: this week's drills are open. */
  fromStats?: boolean;
  go: PlayerGo; back: () => void;
  /** A card on the Tests page opens that test's results. */
  onTest?: (drill: string) => void;
  /** Shown under each page's header (the feedback invitation). */
  hubNotice?: ReactNode;
  /** True while a guided workout fills the screen, so the shell can hide the dock as the app does. */
  onGuidedChange?: (active: boolean) => void;
  /** False while the Workouts tab is hidden: listeners that only serve what is on screen stop. */
  active?: boolean;
};

/**
 * The Workouts tab's state and pages (`TrainingHubView`): the one-page hub at the root, My workout
 * plan, Saved Workouts, History and Tests share one set of plans, logs and presentations, so a workout
 * in progress survives a look at another page. Plans, logs, proposals and schedules keep their existing data access.
 */
export default function PlayerTraining({ ctx, personal, request, onAcknowledge, onCompleted, page, fromStats = false, go, back, onTest, hubNotice, onGuidedChange, active = true }: Props) {
  const preview = ctx.access === 'preview';
  const [plans, setPlans] = useState<Row[] | null>(preview ? [previewProgram()] : null), [error, setError] = useState('');
  const [intake, setIntake] = useState(false), [seed, setSeed] = useState(''), [reveal, setReveal] = useState(false);
  const [selected, setSelected] = useState<number | null>(null), [panel, setPanel] = useState<'' | 'details'>('');
  const [review, setReview] = useState<Row | null>(null), [playing, setPlaying] = useState<Row | null>(null), [drill, setDrill] = useState<{ id: string; name: string } | null>(null);
  const [chatTarget, setChatTarget] = useState<Row | null>(null), [proposal, setProposal] = useState<Row | null>(null);
  const [applying, setApplying] = useState(false), [newTime, setNewTime] = useState(30), [energy, setEnergy] = useState('normal');
  const [createOpen, setCreateOpen] = useState(false), [fullOpen, setFullOpen] = useState(false), [weekDetail, setWeekDetail] = useState<number | null>(null);
  const [drillsExpanded, setDrillsExpanded] = useState(fromStats), [appOnly, setAppOnly] = useState<{ title: string; kind: AppOnlyKind } | null>(null);
  const config = useCoachConfig(preview);
  const location = useLocation(), navigate = useNavigate(), navigationType = useNavigationType();
  const [personalOpen, setPersonalOpen] = useState(false), [personalSource, setPersonalSource] = useState<{ workout: Row; reference?: SourceWorkout } | undefined>();
  const [personalSelected, setPersonalSelected] = useState<Row | undefined>();
  const [personalCreate, setPersonalCreate] = useState(false);
  const [personalHandoff, setPersonalHandoff] = useState<Row | undefined>();
  const [conversationOpen, setConversationOpen] = useState(false);
  const [personalEntry, setPersonalEntry] = useState(0);
  const [personalGuided, setPersonalGuided] = useState(false);
  const requestedConversation = new URLSearchParams(location.search).get('personalConversation');
  const previousConversation = useRef(requestedConversation);
  useEffect(() => {
    // Another tab's address says nothing about a workout conversation; leave the hidden tab alone.
    if (!active) return;
    const previous = previousConversation.current; previousConversation.current = requestedConversation;
    if (!personal.enabled || !personal.selectionReady) return;
    if (!requestedConversation) {
      if (previous && navigationType === 'POP') { setPersonalOpen(true); setPersonalCreate(false); setConversationOpen(false); setSeed(''); setPersonalSource(undefined); setPersonalSelected(undefined); setPersonalHandoff(undefined); setPersonalEntry(v => v + 1); }
      return;
    }
    // The conversation already open in the hub only updates its address, including when the athlete
    // returns to it with Back. Remounting would discard the just-confirmed session setup. Back/Forward
    // to another conversation and external links still recover through the route.
    if (personalOpen && personal.conversationId === requestedConversation) return;
    setPersonalOpen(true); setConversationOpen(true); setSeed(''); setPersonalEntry(v => v + 1);
    if (personal.conversationId !== requestedConversation) void personal.openConversation(requestedConversation).catch(e => setError(e.message));
  }, [requestedConversation, personal.enabled, personal.selectionReady, active]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const plan = plans?.find(p => p.status === 'active') || plans?.find(p => p.status === 'completed') || null;
  const store = usePlayerWorkouts(ctx.playerId!, playing?.planId || plan?.id || null, preview);
  const [recordedSessions, setRecordedSessions] = useState<Row[]>([]);
  // Every workout log, for History; only while that page is on screen.
  const history = useAllWorkoutLogs(ctx.playerId, preview, needsAllLogs(page, active));
  useEffect(() => {
    if (preview) return;
    return db.collection('players').doc(ctx.playerId!).collection('trainingSessions').onSnapshot(s => setRecordedSessions(s.docs.map(d => ({ ...d.data(), id: d.id }))), e => setError(e.message));
  }, [ctx.playerId, preview]);
  useEffect(() => {
    if (preview) return;
    return db.collection('players').doc(ctx.playerId!).collection('trainingPlans').onSnapshot(s => {
      setPlans(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: Row, b: Row) => (b.generatedAt?.toMillis?.() || 0) - (a.generatedAt?.toMillis?.() || 0)));
      setError('');
    }, e => setError(e.message));
  }, [ctx.playerId, preview]);
  useEffect(() => {
    if (!request || !plans || (!preview && !config)) return;
    if (request.destination === BUILD_WORKOUT) {
      // "Start a workout now" on Stats opens what the hub's Build Workout card opens. It waits for
      // the saved workout selection to settle, which the card has by the time it can be tapped.
      if (personal.enabled && !personal.selectionReady) return;
      if (buildWorkoutOpens({ playing: !!playing, builderOpen: personalOpen || !!chatTarget, canCreate: !!createWorkout })) {
        setReview(null); setFullOpen(false); setDrill(null); setWeekDetail(null); setPanel('');
        // The earlier builder is drawn under the planner, so a planner left open would cover it.
        if (!personal.enabled) setIntake(false);
        createWorkout!();
      }
      onAcknowledge(); return;
    }
    if (playing || review || chatTarget) return;
    setSeed(request.request || '');
    if (request.destination === 'personal_workout' && personal.enabled) {
      setPersonalSource(undefined); setPersonalSelected(undefined); setPersonalHandoff(request); setPersonalCreate(!request.conversationId); setConversationOpen(!!request.conversationId); setPersonalOpen(true); setPersonalEntry(v => v + 1);
      if (request.conversationId && personal.conversationId !== request.conversationId) void personal.openConversation(request.conversationId).catch(e => setError(e.message));
      onAcknowledge(); return;
    }
    if (request.destination === 'workout_builder' && personal.enabled) {
      const supplied = request.workoutRef, found = supplied?.kind === 'plan' && supplied.planId === plan?.id ? findWorkout(plan!, supplied.workoutId) : null;
      setPersonalSource(found ? { workout: found.workout, reference: { planId: plan!.id, workoutId: found.workout.workoutId, revision: Number(found.workout.revision || 1) } } : undefined);
      setPersonalSelected(undefined); setPersonalCreate(false); setPersonalOpen(true); onAcknowledge(); return;
    }
    if (request.destination !== 'program_intake' && plan?.schemaVersion === 3 && plan.status === 'active') {
      const supplied = request.workoutRef;
      if (supplied?.kind === 'plan') { setError('Personal workout copies are not enabled yet. Your assigned workout stays as prescribed.'); onAcknowledge(); return; }
      setChatTarget(supplied && (supplied.kind === 'adhoc' || (supplied.kind === 'new' && supplied.planId === plan.id)) ? supplied : { kind: 'new', planId: plan.id, timeAvailableMinutes: 30, energy: 'normal' });
    } else setIntake(true);
    onAcknowledge();
  }, [request, plans, playing, review, chatTarget, personal.enabled, personal.selectionReady, config]);
  useEffect(() => { onGuidedChange?.(!!playing || (personalOpen && personalGuided)); }, [playing, personalOpen, personalGuided]);
  useEffect(() => { if (fromStats && page === 'plan') { setSelected(null); setDrillsExpanded(true); } }, [fromStats, page]);
  // "Build my 6-week plan" on Stats asks for the plan: a workout builder left open in this tab
  // closes as its own Back would (its conversation is kept), so it cannot cover the plan. A workout
  // being followed stays.
  useEffect(() => {
    if (!active || !fromStats || page !== 'plan') return;
    if (personalOpen && !personalGuided) closePersonal();
    if (chatTarget && !applying) { setChatTarget(null); setProposal(null); }
  }, [location.key, active, fromStats, page]);
  // My workout plan with no plan to show opens the planner. It then stays, like the planner opened
  // from the hub, until the athlete closes it, so an activated plan does not pull it away.
  const planless = planPageBuilds(page, plans);
  useEffect(() => { if (active && planless) setIntake(true); }, [active, planless]);
  // Light presentations belong to the page that opened them; ongoing work (a guided workout, a
  // workout conversation, the planner) stays until the athlete closes it.
  const lastPage = useRef(page);
  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;
    setReview(null); setDrill(null); setFullOpen(false); setWeekDetail(null); setPanel(''); setCreateOpen(false); setAppOnly(null);
  }, [page]);

  // Presentations inside one page open at the top and closing one returns to where the athlete was
  // on the page under it. Page changes are the workspace's: it scrolls a pushed page to the top and
  // restores a page reached with the browser's Back.
  const overlayKey = [personalOpen && 'personal', playing && 'player', intake && 'intake', chatTarget && 'chat', review && 'review', fullOpen && 'full', createOpen && 'create', weekDetail !== null && `week:${weekDetail}`, panel, drill && `drill:${drill.id}`].filter(Boolean).join('/');
  const scrolls = useRef(new Map<string, number>()), shownOverlay = useRef({ page, key: overlayKey }), activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const remember = () => { if (activeRef.current) scrolls.current.set(`${shownOverlay.current.page}|${shownOverlay.current.key}`, window.scrollY); };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, []);
  useLayoutEffect(() => {
    const previous = shownOverlay.current, next = { page, key: overlayKey };
    if (previous.page === next.page && previous.key === next.key) return;
    shownOverlay.current = next;
    if (previous.page !== next.page) { scrolls.current.clear(); return; }
    const step = overlayScroll(previous, next);
    if (step !== 'none' && active) window.scrollTo({ top: step === 'top' ? 0 : scrolls.current.get(`${page}|${overlayKey}`) ?? 0 });
  }, [page, overlayKey]);

  const start = async (w: Row) => {
    // One guided workout at a time: a personal session still open is saved on the server and closes
    // here, so it can be resumed later rather than run alongside this one.
    if (personalOpen) closePersonal();
    try { setPlaying(await store.start(w)); setReview(null); setChatTarget(null); setFullOpen(false); } catch { /* store owns error */ }
  };
  const apply = async (andStart: boolean) => {
    if (!proposal || applying) return;
    setApplying(true); setError('');
    const stops: (() => void)[] = [];
    try {
      if (proposal.target?.kind === 'plan') throw new Error('Save adjustments as a personal copy. Assigned workouts stay as prescribed.');
      const ref = await submitLlmJob(ctx.playerId!, 'apply_workout_draft', { draftId: proposal.draftId });
      const job = await waitForJob(ref.id, () => {}, u => stops.push(u));
      if (!mounted.current) return;
      const result = job.result;
      if (!result?.applied || !['plan', 'adhoc'].includes(result.target?.kind)) throw new Error('The saved workout reference is unavailable. Retry this proposal.');
      if (result.target.kind === 'plan' && (result.target.planId !== proposal.target?.planId || result.target.workoutId !== proposal.target?.workoutId)) throw new Error('The saved target does not match this proposal. Reload training.');
      let ready: Row;
      if (result.target.kind === 'plan') {
        const doc = await db.collection('players').doc(ctx.playerId!).collection('trainingPlans').doc(result.target.planId).get({ source: 'server' });
        const p = { ...doc.data(), id: doc.id }, found = findWorkout(p, result.target.workoutId);
        if (!found) throw new Error('The saved workout could not be loaded. Refresh training.');
        ready = executable(p, found.workout, found.week.weekNumber);
      } else {
        const doc = await db.collection('players').doc(ctx.playerId!).collection('plannedWorkouts').doc(result.target.plannedWorkoutId).get({ source: 'server' });
        if (!doc.exists) throw new Error('The saved workout could not be loaded.');
        ready = executable(plan!, { ...doc.data(), id: doc.id }, doc.data()!.weekNumber, 'adhoc'); store.noteWorkout(ready);
      }
      if (!mounted.current) return;
      setChatTarget(null); setProposal(null); setReview(ready);
      if (andStart && !needsTrainingStartCheck(ready)) await start(ready);
    } catch (e: any) { setError(e.message); }
    finally { setApplying(false); stops.forEach(s => s()); }
  };

  const logs = Object.values(store.logs);
  const message = (error || store.error) && <p className="player-error" role="alert">{error || store.error}</p>;
  const openPersonal = (w?: Row, create = false) => { setSeed(''); setPersonalSource(undefined); setPersonalSelected(w); setPersonalHandoff(undefined); setConversationOpen(false); setPersonalCreate(create); if (create) personal.newConversation(); setPersonalOpen(true); setPersonalEntry(v => v + 1); };
  const closePersonal = () => {
    setPersonalOpen(false); setPersonalSource(undefined); setPersonalSelected(undefined); setPersonalCreate(false); setConversationOpen(false); setPersonalGuided(false);
    // Only a conversation address is cleared; closing from Saved Workouts stays on that page.
    if (new URLSearchParams(location.search).has('personalConversation')) navigate({ search: personalDraftLink(location.search) }, { replace: true });
  };
  const openPlan = () => { setSeed(''); setIntake(true); setPanel(''); };
  const activePlan = plan?.status === 'active' ? plan : null;
  const v3Active = activePlan?.schemaVersion === 3 ? activePlan : null;
  const saved = v3Active ? savedWorkouts(store.workouts, store.logs, v3Active) : [];
  const personalWorkouts = personal.enabled ? personal.workouts : [], personalLogs = personal.enabled ? personal.logs : {};
  const resume = findResume(v3Active, logs, saved, personalWorkouts, personalLogs);
  const openResume = (target: ResumeTarget) => {
    const exec = target.kind === 'personal' ? null : executable(v3Active!, target.workout, Number(target.workout.weekNumber), target.kind);
    switch (resumeAction(target, { needsCheck: !!exec && needsTrainingStartCheck(exec) })) {
      case 'openPersonal': openPersonal(target.workout); return;
      case 'review': setReview(exec); return;
      case 'start': void start(exec!);
    }
  };
  // History: every workout log, the hub's own (newer in a preview), and personal sessions.
  const historyLogs = useMemo(() => allWorkoutLogs(history.logs, Object.values(store.logs), personalLogs), [history.logs, store.logs, personalLogs]);
  const createWorkout = personal.enabled ? () => openPersonal(undefined, true)
    : v3Active && capabilityEnabled(config, 'workout_chat') ? () => setCreateOpen(true) : null;
  const activeFreeSession = recordedSessions.find(s => s.isActive && !s.endedAt) || null;
  const openDrill = (id: string, name = '') => setDrill({ id, name });
  const reviewSaved = (entry: SavedEntry) => {
    if (entry.source === 'personal') { openPersonal(entry.workout); return; }
    setReview(executable(v3Active || plan!, entry.workout, Number(entry.workout.weekNumber), 'adhoc'));
  };

  // MARK: Full-screen and pushed presentations

  // The feedback invitation appears on whichever Workouts page the athlete lands on after finishing.
  const notices = <>{hubNotice}{message}</>;
  // A workout conversation keeps its own address only on the hub; opened from another page it leaves that page's address alone.
  if (personalOpen) return <PersonalWorkoutHub key={personalEntry} embedded store={personal} playerId={ctx.playerId!} athlete={ctx.athlete} config={config} preview={preview} source={personalSource} initialWorkout={personalSelected} initialCreate={personalCreate} initialRequest={seed} initialHandoff={personalHandoff} initialConversation={conversationOpen}
    onGuided={setPersonalGuided} onSelection={id => { const search = personalDraftLink(location.search, id), here = playerRoute(location.search); if (here.view === 'workouts' && here.screen === null && search !== new URLSearchParams(location.search).toString()) navigate({ search }); }} onBack={closePersonal} onCompleted={() => { closePersonal(); onCompleted?.(); }} />;
  if (playing) return <PlayerWorkout workout={playing} store={store} playerId={ctx.playerId!} preview={preview} onExit={() => setPlaying(null)} onCompleted={onCompleted} />;

  // Presentations over whichever page opened them, the hub included.
  const overlay = (title: string, onClose: () => void, body: ReactNode) => <section className="wk-page"><PlayerHeader title={title} onBack={onClose} />{hubNotice}{body}</section>;
  if (intake || planless) {
    // With no plan under it, closing the planner leaves the page instead of showing it empty.
    const closePlanner = () => { setIntake(false); if (planless) back(); };
    return overlay('Training plan', closePlanner, <ProgramIntake playerId={ctx.playerId!} athlete={ctx.athlete} statsProfile={{}} preview={preview} access={ctx.access} weeks={fromStats && page === 'plan' ? STATS_PLAN_WEEKS : undefined} initialText={seed} onReady={() => { setIntake(false); setReveal(true); }} onBack={closePlanner} />);
  }
  if (drill) return overlay(drill.name || 'Drill', () => setDrill(null), <DrillMedia drillId={drill.id} preview={preview} />);
  if (chatTarget) return overlay(chatTarget.kind === 'new' ? 'Create your workout' : 'Your workout', () => { if (!applying) { setChatTarget(null); setProposal(null); } }, <>{message}
    <CoachChat key={JSON.stringify(chatTarget)} playerId={ctx.playerId!} preview={preview} capability="workout_chat" context={{ workoutRef: chatTarget }} initialText={seed} onDraft={setProposal} />
    {proposal && <section className="wk-card wk-proposal"><Eyebrow>Proposed workout · not saved yet</Eyebrow><h3 className="wk-card-title">{proposal.workout?.title}</h3><p className="wk-muted">{proposal.workout?.intent}</p>
      <ol className="wk-review-blocks">{(proposal.workout?.blocks || []).map((b: Row, i: number) => <li key={b.blockId}><button type="button" className="wk-review-block" onClick={() => openDrill(b.drillId, b.name)}><span className="wk-review-order" aria-hidden="true">{b.order ?? i + 1}</span><strong>{b.name}</strong><small>~{b.estimatedMinutes} min</small></button>{b.whyIncluded && <p className="wk-faint">{b.whyIncluded}</p>}</li>)}</ol>
      <div className="wk-button-row"><button className="primary-cta" disabled={applying || !capabilityEnabled(config, 'apply_workout_draft')} onClick={() => void apply(false)}>{applying ? 'Saving…' : 'Save workout'}</button><button className="wk-secondary" disabled={applying || !capabilityEnabled(config, 'apply_workout_draft')} onClick={() => void apply(true)}>Save and start</button></div></section>}
  </>);
  if (review && fullOpen) { const log = store.logFor(review.id);
    return overlay('Your workout', () => setFullOpen(false), <WorkoutFull workout={log?.workoutSnapshot ? { ...review, workoutSnapshot: log.workoutSnapshot } : review} started={!!log} requestedMinutes={review.source === 'plan' ? Number(plan?.minutesPerSession) || null : Number(review.budgetMinutes) || null} onDrill={openDrill} />); }
  if (review) {
    const log = store.logFor(review.id), reviewPlan = plans?.find(p => p.id === review.planId) || plan;
    const disabled = store.saving || !store.logsLoaded || reviewPlan?.status !== 'active';
    const startControl = needsTrainingStartCheck(review)
      ? <TrainingStartConfirmation key={review.id} disabled={disabled} resuming={Boolean(log)} onStart={confirmation => void start({ ...review, startConfirmation: confirmation })} />
      : <button type="button" className="primary-cta" disabled={disabled || !(log?.workoutSnapshot || review).blocks?.length} onClick={() => void start(review)}><span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>{store.saving ? 'Opening workout…' : log ? 'Resume workout' : 'Start workout'}</button>;
    const snapshot = log?.workoutSnapshot || review;
    const copy = personal.enabled ? () => { personal.newConversation(); setPersonalEntry(v => v + 1); setConversationOpen(false); setPersonalHandoff(undefined); setSeed(''); setPersonalSelected(undefined); setPersonalSource({ workout: snapshot, ...(review.source === 'plan' ? { reference: { planId: review.planId, workoutId: review.workoutId, revision: Number(review.workoutRevision || 1) } } : {}) }); setPersonalOpen(true); setReview(null); } : undefined;
    const adjust = review.source !== 'plan' && capabilityEnabled(config, 'workout_chat') ? () => { setSeed(''); setChatTarget({ kind: 'adhoc', plannedWorkoutId: review.workoutId }); setReview(null); } : copy;
    return overlay('Your workout', () => setReview(null), <>{message}
      <WorkoutReview workout={review} log={log} start={startControl} onAdjust={adjust} adjustLabel={adjust === copy ? 'Customize a personal copy' : 'Tell me what to change'}
        onCreateAnother={createWorkout ? () => { setReview(null); createWorkout(); } : undefined} onDrill={openDrill} onFull={() => setFullOpen(true)} />
    </>);
  }
  if (createOpen && v3Active) return overlay('Create your workout', () => setCreateOpen(false), <section className="wk-card">
    <p className="wk-muted">Tell your coach what you have time and energy for today.</p>
    <div className="player-choice-grid"><label>Minutes<input type="number" min={1} max={135} value={newTime} onChange={e => setNewTime(Number(e.target.value))} /></label><label>Energy<select value={energy} onChange={e => setEnergy(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label></div>
    <button type="button" className="primary-cta" disabled={!capabilityEnabled(config, 'workout_chat') || newTime < 1 || newTime > 135} onClick={() => { setSeed(''); setCreateOpen(false); setChatTarget({ kind: 'new', planId: v3Active.id, timeAvailableMinutes: newTime, energy }); }}>Choose my focus</button>
    <small>Up to three workout adjustment requests per day.</small>
  </section>);
  if (weekDetail !== null && plan) return overlay(`Week ${weekDetail}`, () => setWeekDetail(null), <PlanWeekDetail plan={plan} weekNumber={weekDetail} onOpenDrill={openDrill} />);
  if (panel === 'details' && plan) return overlay('Plan details', () => setPanel(''), <PlanDetails plan={plan} onStartNewPlan={openPlan} />);

  // MARK: Pages

  const sheet = appOnly && <AppOnlySheet title={appOnly.title} kind={appOnly.kind} playerId={ctx.playerId} onClose={() => setAppOnly(null)} />;
  const freeSession = () => setAppOnly({ title: 'Start a free session', kind: 'freeSession' });

  if (page === 'root') {
    // The one-page hub (`TrainingHubView.content`): what is in progress, the plan summary or the
    // invitation to build one, Create a workout, then Saved Workouts, Workout History and Tests.
    const banners = <>
      {!preview && activeFreeSession && <FreeSessionBanner session={activeFreeSession} onClick={() => setAppOnly({ title: 'Free session in progress', kind: 'freeSession' })} />}
      {resume && <ResumeBanner text={resumeBannerText(resume)} disabled={resume.kind !== 'personal' && !store.logsLoaded} onClick={() => openResume(resume)} />}
    </>;
    const actions = <WorkoutActions onCreate={createWorkout} onCardio={() => setAppOnly({ title: 'Cardio', kind: 'cardio' })} />;
    const links = <HubLinks onSaved={() => go('workouts', { screen: 'saved' })} onHistory={() => go('workouts', { screen: 'history' })} onTests={() => go('workouts', { screen: 'tests' })} />;
    let content: ReactNode;
    if (!plans) content = <p className="wk-loading" role="status"><span className="wk-spinner" aria-hidden="true" />{error || 'Loading training…'}</p>;
    else if (plan?.status === 'completed') content = <>{banners}<BlockComplete plan={plan} onPlanNext={openPlan} />{actions}{links}</>;
    else if (activePlan) content = <>
      {reveal && <section className="v4-card"><Eyebrow>Your plan is ready</Eyebrow><p>{activePlan.assessment?.summary}</p><button type="button" className="wk-secondary" onClick={() => setReveal(false)}>Explore my plan</button></section>}
      {banners}
      <PlanSummaryCard model={planCardModel(activePlan, logs)} onOpen={() => go('workouts', { screen: 'plan' })} />
      {actions}{links}
    </>;
    else content = <>{banners}<PlanInvitationCard onCreate={openPlan} />{actions}{links}</>;
    return <section className="wk-root"><PlayerHeader title="Workouts" />{notices}{content}{sheet}</section>;
  }

  const header = <PlayerHeader title={PAGE_TITLE[page]} onBack={back} />;
  if (page === 'plan') {
    const shown = planPagePlan(activePlan);
    return <section className="wk-page">{header}{notices}
      {!plans && <p className="wk-loading" role="status"><span className="wk-spinner" aria-hidden="true" />Loading training…</p>}
      {shown && shown.schemaVersion === 3 && <MyWorkoutPlan plan={shown} logs={logs} logsLoaded={store.logsLoaded} reps={ctx.allStatsReps()} sessions={recordedSessions} selectedWeek={selected} onSelectWeek={setSelected}
        drillsExpanded={drillsExpanded} onDrillsExpanded={setDrillsExpanded} onOpenWorkout={setReview} onOpenWeek={setWeekDetail} onOpenDrill={id => { const b = (weekOf(shown, selected || currentWeekNumber(shown))?.workouts || []).flatMap((w: Row) => w.blocks || []).find((x: Row) => x.drillId === id); openDrill(id, b?.name); }}
        onPlanDetails={() => setPanel('details')} onFreeSession={freeSession} />}
      {shown && shown.schemaVersion !== 3 && <LegacyPlan onBuild={openPlan}><TrainingView ctx={ctx} /></LegacyPlan>}
      {sheet}
    </section>;
  }
  if (page === 'saved') return <section className="wk-page">{header}{notices}
    <SavedLibrary entries={savedEntries(v3Active ? store.workouts : [], store.logs, personalWorkouts, personalLogs, v3Active)} loading={!!plan && !store.logsLoaded || (personal.enabled && !personal.loaded)} error={store.error || ''}
      onOpen={entry => { if (entry.inProgress && entry.source === 'adhoc') { const exec = executable(v3Active!, entry.workout, Number(entry.workout.weekNumber), 'adhoc'); if (needsTrainingStartCheck(exec)) setReview(exec); else void start(exec); } else reviewSaved(entry); }}
      onEdit={entry => openPersonal(entry.workout)} />
  </section>;
  if (page === 'history') return <section className="wk-page">{header}{notices}
    <HistoryList logs={historyLogs} sessions={recordedSessions} planId={activePlan?.id || null} loading={!history.loaded} error={history.error}
      canReview={log => log.source !== 'personal' && !!log.workoutSnapshot && !log.endedAt && plans?.some(p => p.id === log.planId && p.status === 'active') === true}
      onReview={log => setReview({ ...log.workoutSnapshot, ...log, blocks: log.workoutSnapshot.blocks })} />
  </section>;
  // Tests (`testsPage`): the six measured tests; a card opens that test's results.
  return <section className="wk-page">{header}{notices}<TestsGrid onTest={drillKey => onTest?.(drillKey)} /></section>;
}

function LegacyPlan({ onBuild, children }: { onBuild: () => void; children: ReactNode }) {
  return <>
    <section className="v4-card"><InfoNote text="This plan uses the earlier workout format. You can keep using it, or build a new plan with workouts ready for you." />
      <button type="button" className="wk-secondary" onClick={onBuild}><span className="material-symbols-outlined" aria-hidden="true">refresh</span>Build a new plan</button></section>
    {children}
  </>;
}

/** `BlockCompleteView` for a finished block: the headline, where the work went, and the next block. */
function BlockComplete({ plan, onPlanNext }: { plan: Row; onPlanNext: () => void }) {
  const v3 = plan.schemaVersion === 3;
  return <>
    <div className="wk-week-headline"><Eyebrow>Block complete</Eyebrow><h2>{v3 ? 'Training block ended' : `${plan.horizonWeeks} weeks done`}</h2><p className="wk-muted">That's the block finished.</p></div>
    <section className="v4-card">{v3 ? <InfoNote icon="check_circle" text="Your block has ended. Review your workouts in History and your test results in Stats." />
      : <><Eyebrow>No retest</Eyebrow><p className="wk-muted">This plan didn't specify retest drills, so there's nothing to compare automatically. Your recorded reps are all still in Stats.</p></>}</section>
    <button type="button" className="primary-cta" onClick={onPlanNext}>Plan your next block</button>
  </>;
}
