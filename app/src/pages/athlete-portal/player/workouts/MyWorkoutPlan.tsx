import { useEffect, useRef } from 'react';
import { nextWorkout, orderedBlocks, orderedWeeks, orderedWorkouts, planLogId, weekOf } from '../../../../lib/contracts/planV3';
import { domainLabel } from '../../../../lib/contracts/types';
import { executable } from '../execution';
import type { Row } from '../execution';
import { weekProgress } from '../progress';
import { daysLeftInWeek, millis, planSections, planWeekNumber, planWeeks, weekDrillLine, windowLabel } from './hub';

export const Eyebrow = ({ children }: { children: string }) => <p className="wk-eyebrow">{children}</p>;
export const InfoNote = ({ text, icon = 'info' }: { text: string; icon?: string }) => <p className="wk-note"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span><span>{text}</span></p>;

function DomainRing({ title, done, target }: { title: string; done: number; target: number }) {
  const fraction = target > 0 ? Math.min(done / target, 1) : done > 0 ? 1 : 0, met = target > 0 && done >= target;
  const r = 23.5, length = 2 * Math.PI * r;
  return <div className="wk-ring" role="img" aria-label={`${title}: ${done} of ${target} exposures${met ? ', complete' : ''}`}>
    <span className="wk-ring-dial" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r={r} className="wk-ring-track" />{fraction > 0 && <circle cx="26" cy="26" r={r} className="wk-ring-fill" strokeDasharray={`${length * fraction} ${length}`} />}</svg>
      {met ? <span className="material-symbols-outlined">check</span> : <b>{Math.round(fraction * 100)}%</b>}</span>
    <strong aria-hidden="true">{title}</strong><small aria-hidden="true">{done}/{target}</small>
  </div>;
}

export function DrillRow({ name, domain, line, chip, onClick }: { name: string; domain: string; line: string; chip?: { text: string; done: boolean; started: boolean }; onClick?: () => void }) {
  return <button type="button" className="wk-drill-row" onClick={onClick}>
    <span className="wk-drill-icon material-symbols-outlined" aria-hidden="true">{domainIcon(domain)}</span>
    <span className="wk-drill-text"><strong>{name || 'Drill'}</strong><small>{line}</small></span>
    {chip && <span className={`wk-chip${chip.done ? ' done' : chip.started ? ' started' : ''}`}>{chip.text}</span>}
    <span className="material-symbols-outlined wk-chevron" aria-hidden="true">chevron_right</span>
  </button>;
}

const DOMAIN_ICONS: Record<string, string> = { ballMastery: 'sports_soccer', dribbling: 'sports_soccer', passing: 'sync_alt', receiving: 'arrow_circle_down', shooting: 'target', speed: 'directions_run', agility: 'turn_right', plyometrics: 'arrow_circle_up', strength: 'fitness_center', games: 'stadium' };
export const domainIcon = (domain: string) => DOMAIN_ICONS[domain] || 'sports';

type Props = {
  plan: Row; logs: Row[]; logsLoaded: boolean; reps: Row[]; sessions: Row[];
  selectedWeek: number | null; onSelectWeek: (week: number) => void;
  drillsExpanded: boolean; onDrillsExpanded: (expanded: boolean) => void;
  onOpenWorkout: (workout: Row) => void; onOpenWeek: (week: number) => void; onOpenDrill: (drillId: string) => void;
  onPlanDetails: () => void; onFreeSession: () => void;
};

/** My workout plan's sections for a V3 plan (`MyWorkoutPlanView`). */
export default function MyWorkoutPlan({ plan, logs, logsLoaded, reps, sessions, selectedWeek, onSelectWeek, drillsExpanded, onDrillsExpanded, onOpenWorkout, onOpenWeek, onOpenDrill, onPlanDetails, onFreeSession }: Props) {
  const current = planWeekNumber(plan), horizon = planWeeks(plan);
  const weekNumber = selectedWeek && weekOf(plan, selectedWeek) ? selectedWeek : current;
  const isCurrent = weekNumber === current, week = weekOf(plan, weekNumber) as Row | null;
  const progress = weekProgress(plan, week || undefined, logs, reps, sessions);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => { (rail.current?.querySelector('[aria-pressed="true"]') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, []);
  const sections = planSections(true, isCurrent);
  const next = nextWorkout(plan, logs);
  const earlier = logs.filter(l => !l.endedAt && l.workoutSnapshot && (l.planId !== plan.id || Number(l.weekNumber) < current || l.source === 'adhoc'))
    .sort((a, b) => (millis(a.startedAt) || 0) - (millis(b.startedAt) || 0))[0];
  const budget = Number(plan.weeklyBudgetMinutes) || (Number(plan.sessionsPerWeek || plan.intake?.sessionsPerWeek) || 0) * (Number(plan.minutesPerSession || plan.intake?.minutesPerSession) || 0);
  const blocks = orderedWorkouts(week).flatMap(w => orderedBlocks(w));
  const drills = [...new Map(blocks.map(b => [b.drillId, b])).values()];
  return <div className="wk-plan">
    {sections.map(section => {
      switch (section) {
        case 'weekRail': return <div key={section}>
          <p className="wk-section-title">The block</p>
          <div className="wk-rail" ref={rail}>{orderedWeeks(plan).map(w => <button type="button" key={w.weekNumber} aria-pressed={w.weekNumber === weekNumber} className={`wk-week-chip${w.weekNumber === current ? ' current' : ''}`} onClick={() => { onSelectWeek(w.weekNumber); onDrillsExpanded(false); }}>
            <span className="wk-week-chip-title">Week {w.weekNumber}{w.weekNumber === current && <i aria-label="This week" />}</span><small>{w.theme}</small>
          </button>)}</div>
        </div>;
        case 'weekCard': return <section key={section} className="wk-card">
          <div className="wk-card-head"><Eyebrow>{`Week ${weekNumber} of ${Math.max(horizon, weekNumber)}`}</Eyebrow>
            {isCurrent ? <span className="wk-pill">{daysLeftInWeek(plan, weekNumber) === 1 ? '1 day left' : `${daysLeftInWeek(plan, weekNumber)} days left`}</span> : <small className="wk-muted">{windowLabel(plan, weekNumber)}</small>}</div>
          {week ? <>
            <button type="button" className="wk-week-title" onClick={() => onOpenWeek(weekNumber)}><span>{week.theme || `Week ${weekNumber}`}</span><span className="material-symbols-outlined wk-chevron" aria-hidden="true">chevron_right</span></button>
            {week.focus && <p className="wk-muted wk-clamp-3">{week.focus}</p>}
          </> : <h3 className="wk-week-title">This week</h3>}
        </section>;
        case 'nextWorkout': return <div key={section} className="wk-stack">
          {earlier && <button type="button" className="wk-note-button" disabled={!logsLoaded} onClick={() => onOpenWorkout(executable(plan, { ...earlier.workoutSnapshot, workoutId: earlier.workoutId, id: earlier.id }, Number(earlier.weekNumber), earlier.source || 'plan'))}>
            <InfoNote icon="undo" text="You have an unfinished workout. Tap to resume your saved session." /></button>}
          {next ? <button type="button" className="wk-card wk-next" disabled={!logsLoaded} onClick={() => onOpenWorkout(executable(plan, next.workout, next.weekNumber))}>
            <span className="wk-card-head"><Eyebrow>Next workout</Eyebrow><span className="wk-next-state"><span className="material-symbols-outlined" aria-hidden="true">{next.reason === 'resume' ? 'play_circle' : 'radio_button_unchecked'}</span>{next.reason === 'resume' ? 'In progress' : 'Ready'}</span></span>
            <strong className="wk-next-title">{next.workout.title || `Week ${next.weekNumber} workout`}</strong>
            {next.workout.intent && <span className="wk-muted wk-clamp-3">{next.workout.intent}</span>}
            <span className="wk-next-meta"><span>{(next.workout.blocks || []).length} drills · ~{next.workout.estimatedMinutes} min</span>{next.weekNumber !== current && <span>Week {next.weekNumber}</span>}<span className="material-symbols-outlined" aria-hidden="true">arrow_outward</span></span>
          </button> : (() => {
            const ended = logs.filter(l => l.planId === plan.id && l.source === 'plan' && l.id === planLogId(plan.id, l.workoutId) && l.endedAt);
            const completed = ended.filter(l => l.endReason === 'completed').length, early = ended.length - completed;
            return <section className="wk-card"><Eyebrow>Next workout</Eyebrow><h3 className="wk-card-title">No scheduled workouts left</h3>
              <p className="wk-muted">{`${completed} completed${early > 0 ? ` · ${early} ended early` : ''}. Create a workout when you're ready for more.`}</p></section>;
          })()}
        </div>;
        case 'targets': return <section key={section} className="wk-card">
          <Eyebrow>This week's targets</Eyebrow>
          {!progress.domains.length ? <InfoNote text="This week has no domain targets set." /> : <div className={`wk-rings${progress.domains.length > 3 ? ' grid' : ''}`}>{progress.domains.map(d => <DomainRing key={d.domain} title={domainLabel(d.domain)} done={d.done} target={d.target} />)}</div>}
          <hr />
          <div className="wk-time-row" role="img" aria-label={budget > 0 ? `Time trained this week: ${progress.minutes} of about ${budget} minutes` : `Time trained this week: ${progress.minutes} minutes`}>
            <span className="wk-time-icon material-symbols-outlined" aria-hidden="true">schedule</span><strong aria-hidden="true">Time trained</strong>
            <span aria-hidden="true"><b>{progress.minutes} min</b>{budget > 0 && <small>  of ~{budget}</small>}</span>
            {budget > 0 && <i aria-hidden="true"><b style={{ width: `${Math.min(100, progress.minutes / budget * 100)}%` }} /></i>}
          </div>
        </section>;
        case 'drills': return week ? <section key={section} className="wk-card">
          <button type="button" className="wk-expander" aria-expanded={drillsExpanded} onClick={() => onDrillsExpanded(!drillsExpanded)}>
            <Eyebrow>This week's drills</Eyebrow><span>{drills.length} drills</span><span className="material-symbols-outlined" aria-hidden="true">{drillsExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
          {drillsExpanded && <div className="wk-stack">{drills.map(b => { const done = progress.drillDone[b.drillId] || 0, target = progress.drillTargets[b.drillId] || 0;
            return <DrillRow key={b.drillId} name={b.name} domain={b.domain} line={weekDrillLine(week, b.drillId)} chip={{ text: done ? `${done}/${target}` : '0', done: target > 0 && done >= target, started: done > 0 }} onClick={() => onOpenDrill(b.drillId)} />; })}
            {!drills.length && <InfoNote text="There are no scheduled drills for this week." />}</div>}
        </section> : null;
        case 'links': return <button type="button" key={section} className="wk-link" onClick={onPlanDetails}><span className="material-symbols-outlined" aria-hidden="true">description</span>Plan details<span className="material-symbols-outlined wk-chevron" aria-hidden="true">chevron_right</span></button>;
        case 'freeSession': return <button type="button" key={section} className="wk-secondary" onClick={onFreeSession}><span className="material-symbols-outlined" aria-hidden="true">radio_button_checked</span>Start a free session</button>;
        default: return null;
      }
    })}
  </div>;
}

/** Any week of the block (`PlanWeekDetailView`): theme, what it asks for, its workouts and drills. */
export function PlanWeekDetail({ plan, weekNumber, onOpenDrill }: { plan: Row; weekNumber: number; onOpenDrill: (drillId: string) => void }) {
  const week = weekOf(plan, weekNumber) as Row | null;
  if (!week) return null;
  const isCurrent = weekNumber === planWeekNumber(plan);
  return <div className="wk-plan">
    <div className="wk-week-headline">
      <div className="wk-card-head wk-start"><Eyebrow>{`Week ${weekNumber} of ${planWeeks(plan)}`}</Eyebrow>{isCurrent && <span className="wk-pill wk-pill-small">This week</span>}</div>
      <h2>{week.theme || `Week ${weekNumber}`}</h2>
      {week.focus && <p className="wk-muted">{week.focus}</p>}
      {windowLabel(plan, weekNumber) && <small className="wk-muted">{windowLabel(plan, weekNumber)}</small>}
    </div>
    {!!week.targets?.length && <div><p className="wk-section-title">This week asks for</p><section className="wk-card">{week.targets.map((t: Row) => <div className="wk-target" key={t.domain}>
      <span className="wk-drill-icon material-symbols-outlined" aria-hidden="true">{domainIcon(t.domain)}</span><span><strong>{domainLabel(t.domain)} — {t.exposures}×</strong>{t.note && <small>{t.note}</small>}</span></div>)}</section></div>}
    <div className="wk-stack"><p className="wk-section-title">Workouts</p>
      {orderedWorkouts(week).map(w => <section className="wk-card" key={w.workoutId}><h3 className="wk-card-title wk-headline">{w.title}</h3>{w.intent && <p className="wk-muted">{w.intent}</p>}
        <div className="wk-stack">{orderedBlocks(w).map(b => <DrillRow key={b.blockId} name={b.name} domain={b.domain} line={doseLine(b)} onClick={() => onOpenDrill(b.drillId)} />)}</div></section>)}
    </div>
    {week.progressionNote && <section className="wk-card"><Eyebrow>What comes next</Eyebrow><p className="wk-muted">{week.progressionNote}</p></section>}
  </div>;
}

const UNIT: Record<string, (n: number) => string> = { reps: n => n === 1 ? 'rep' : 'reps', seconds: () => 'sec', minutes: () => 'min', meters: () => 'm' };
/** `HubDoseFormatter.line(block)`: "3 × 8 reps each side · 30s rest between sets". */
export function doseLine(block: Row): string {
  const sets = Number(block.sets) || 0, reps = Number(block.reps) || 0, unit = String(block.repUnit || 'reps');
  const label = (n: number) => (UNIT[unit] || (() => unit))(n);
  const parts = sets > 0 && reps > 0 ? `${sets} × ${reps} ${label(reps)}` : reps > 0 ? `${reps} ${label(reps)}` : sets > 0 ? (sets === 1 ? '1 set' : `${sets} sets`) : '';
  let value = parts || 'As prescribed';
  if (block.perSide) value += ' each side';
  if (Number(block.restSeconds) > 0) value += ` · ${block.restSeconds}s rest between ${block.restScope === 'reps' ? 'reps' : 'sets'}`;
  if (block.restScope === 'reps' && Number(block.restBetweenSetsSeconds) > 0) value += ` · ${block.restBetweenSetsSeconds}s between sets`;
  if (Number(block.familiarizationReps) > 0) value += ` · ${block.familiarizationReps} practice reps first`;
  return value;
}
