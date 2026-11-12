import type { Row } from '../execution';
import { sessionDateText } from './hub';
import type { PlanCardModel } from './hub';

/** The six measured tests, in the app's order and wording (`DrillsView`). `drill` is the web results key. */
export const MEASURED_TESTS = [
  { drill: 'shooting', title: 'Shooting', detail: 'Measure your striking', icon: 'sports_soccer' },
  { drill: 'dribbling', title: 'Dribbling', detail: 'Control at speed', icon: 'directions_run' },
  { drill: 'jump', title: 'Vertical Jump', detail: 'Explosive power', icon: 'north' },
  { drill: 'broadJump', title: 'Broad Jump', detail: 'Horizontal power', icon: 'north_east' },
  { drill: 'sprint', title: 'Sprint', detail: 'Own your first steps', icon: 'sprint' },
  { drill: 'changeOfDirection', title: 'Shuttle', detail: 'Move with precision', icon: 'turn_right' },
] as const;

/** `WorkoutActivityCard`: an icon, a title and one line. `prominent` adds the outline Build Workout carries. */
function ActivityCard({ title, detail, icon, onClick, label, prominent, id }: { title: string; detail: string; icon: string; onClick: () => void; label?: string; prominent?: boolean; id?: string }) {
  return <button type="button" className={`v4-activity-card wk-activity-card${prominent ? ' prominent' : ''}`} aria-label={label} data-action={id} onClick={onClick}>
    <span className="wk-activity-icon"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span></span>
    <strong>{title}</strong><small>{detail}</small>
  </button>;
}

/** `TrainingResumeBanner` (V4): an accent line on a capsule. */
export function ResumeBanner({ text, onClick, disabled }: { text: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="wk-resume" disabled={disabled} onClick={onClick}><span className="material-symbols-outlined" aria-hidden="true">resume</span><span>{text}</span></button>;
}

/** A free session being recorded in the app (`activeFreeSessionBanner`). */
export function FreeSessionBanner({ session, onClick }: { session: Row; onClick: () => void }) {
  const refs = session.sessionRefs?.length || 0;
  return <button type="button" className="wk-free-banner" onClick={onClick}>
    <span className="material-symbols-outlined" aria-hidden="true">radio_button_checked</span>
    <span><strong>Free session in progress</strong><small>{refs} drill{refs === 1 ? '' : 's'} recorded · started {sessionDateText(session.startedAt)}</small></span>
    <span className="material-symbols-outlined wk-chevron" aria-hidden="true">chevron_right</span>
  </button>;
}

/** `MyWorkoutPlanCard` (V4): the label, this week's theme, the schedule line and the next workout. Opens My workout plan. */
export function PlanSummaryCard({ model, onOpen }: { model: PlanCardModel; onOpen: () => void }) {
  return <button type="button" className="wk-plan-card" data-action="plan" onClick={onOpen}>
    <span className="wk-plan-card-label"><span className="material-symbols-outlined" aria-hidden="true">calendar_month</span>MY WORKOUT PLAN<span className="material-symbols-outlined" aria-hidden="true">arrow_outward</span></span>
    <strong>{model.title}</strong>
    <small>{model.schedule}</small>
    {model.next && <span className="wk-plan-card-next">{model.next}</span>}
  </button>;
}

/** `PlanInvitationView` (V4): the compact invitation. Plan length is chosen inside the planner. */
export function PlanInvitationCard({ onCreate }: { onCreate: () => void }) {
  return <section className="wk-plan-card">
    <span className="wk-plan-card-label"><span className="material-symbols-outlined" aria-hidden="true">calendar_month</span>WORKOUT PLAN</span>
    <strong>Build a routine that fits you</strong>
    <small>An AI plan shaped around your goals.</small>
    <button type="button" className="wk-secondary" data-action="create-plan" onClick={onCreate}><span className="material-symbols-outlined" aria-hidden="true">add</span>Create plan</button>
  </section>;
}

/**
 * `TrainingWorkoutActions`: Build Workout and Cardio in one row. The heading belongs to Build
 * Workout, so it goes when the viewer cannot create one; Cardio stays.
 */
export function WorkoutActions({ onCreate, onCardio }: { onCreate: (() => void) | null; onCardio: () => void }) {
  return <section className="wk-actions">
    {onCreate && <div><h2>Create a workout</h2><p>One session, whenever you want.</p></div>}
    <div className="v4-activity-grid">
      {onCreate && <ActivityCard id="build" title="Build Workout" detail="Choose your focus" icon="auto_awesome" prominent onClick={onCreate} />}
      <ActivityCard id="cardio" title="Cardio" detail="Walk, run or ride" icon="favorite" label="Cardio. Walk, run or ride." onClick={onCardio} />
    </div>
  </section>;
}

/** `homeFooter` (V4): Saved Workouts, Workout History and Tests grouped in one card. */
export function HubLinks({ onSaved, onHistory, onTests }: { onSaved: () => void; onHistory: () => void; onTests: () => void }) {
  const rows = [
    { key: 'saved', title: 'Saved Workouts', icon: 'bookmark', onClick: onSaved },
    { key: 'history', title: 'Workout History', icon: 'history', onClick: onHistory },
    { key: 'tests', title: 'Tests', icon: 'straighten', onClick: onTests },
  ];
  return <nav className="wk-links" aria-label="More in Workouts">{rows.map(row => <button type="button" key={row.key} data-action={row.key} onClick={row.onClick}>
    <span className="material-symbols-outlined" aria-hidden="true">{row.icon}</span>{row.title}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
  </button>)}</nav>;
}

/** The Tests page (`testsPage`): the six measured tests. A card opens that test's results. */
export function TestsGrid({ onTest }: { onTest: (drill: string) => void }) {
  return <div className="v4-activity-grid">{MEASURED_TESTS.map(item => <ActivityCard key={item.drill} title={item.title} detail={item.detail} icon={item.icon} label={`${item.title}, ${item.detail}`} onClick={() => onTest(item.drill)} />)}</div>;
}
