import { useEffect, useId, useRef, useState } from 'react';
import { auth } from '../../../lib/firebase';
import { DEFAULT_EQUIPMENT, HORIZON_WEEKS, planV3JobParams } from '../../admin/lib/planJobs';
import { inferredLevel } from '../../coach-dashboard/lib/logic';
import { submitLlmJob, waitForJob } from '../lib/loaders';
import type { Access } from '../lib/loaders';
import { capabilityEnabled, useCoachConfig } from './gateway';
import { personalAge } from './personal-workouts';
import type { Row } from './execution';

/**
 * Plan setup, question for question the app's `PlanIntakeFlowView` (TestFlight 1.1 build 41): up to two
 * goals and optional text, days per week, solo or partner, age, and a pain check. Sessions are an hour
 * and the gear is standard, as in the app. One `generate_training_plan` job; the gateway writes the plan.
 */

/** The app's goal vocabulary (`PlanIntakeVocabulary.goals`); the ids are the gateway's goal keys. */
export const PLAN_GOALS = [
  { id: 'speedAgility', label: 'Speed & agility', detail: 'Acceleration, top speed, cutting', icon: 'sprint' },
  { id: 'dribbling', label: 'Dribbling', detail: 'Close control at speed', icon: 'sports_soccer' },
  { id: 'passing', label: 'Passing', detail: 'Accuracy and weight over distance', icon: 'sync_alt' },
  { id: 'firstTouch', label: 'First touch', detail: 'Receiving and control under pressure', icon: 'touch_app' },
  { id: 'shooting', label: 'Shooting', detail: 'Ball speed and strike quality', icon: 'target' },
  { id: 'strengthPower', label: 'Strength & power', detail: 'Jumping, strength, resilience', icon: 'fitness_center' },
] as const;
export const PLAN_SETTINGS = [
  { id: 'solo', label: 'On my own' }, { id: 'partner', label: 'With a partner' }, { id: 'halfAndHalf', label: 'Half and half' },
] as const;
export const PLAN_DAYS = [1, 2, 3, 4, 5, 6] as const;
/** The app's defaults: a 6-week block, 3 days a week, an hour each, solo. */
export const PLAN_DEFAULT_WEEKS = 6;
const FIXED_MINUTES = 60, AGE_MIN = 8, AGE_MAX = 30, MAX_GOALS = 2;

export interface PlanAnswers {
  weeks: number; goals: string[]; text: string; days: number; setting: (typeof PLAN_SETTINGS)[number]['id']; age?: number; pain: boolean;
}

/** Who may build a plan here. The server lets the athlete, their coach or club staff, and an admin create the job. */
export function planIntakeAccess(access: Access | undefined): 'form' | 'sample' | 'refused' {
  return access === 'preview' ? 'sample' : access === 'shared' ? 'refused' : 'form';
}

/** The plan length the form opens at: the button's choice when it named one, otherwise the app's six weeks. */
export function initialPlanWeeks(weeks?: number): number {
  const target = Number.isFinite(weeks) ? Number(weeks) : PLAN_DEFAULT_WEEKS;
  return HORIZON_WEEKS.reduce((best, v) => Math.abs(v - target) < Math.abs(best - target) ? v : best, HORIZON_WEEKS[0] as number);
}

/** Why the plan cannot be requested yet, mirroring the app's `PlanIntakeDraft.validationMessage`; pain comes first. */
export function planIntakeBlock(a: PlanAnswers): 'pain' | 'goals' | 'age' | null {
  if (a.pain) return 'pain';
  if (!a.goals.length || a.goals.length > MAX_GOALS) return 'goals';
  if (!Number.isInteger(a.age) || a.age! < 5 || a.age! > 80) return 'age';
  return null;
}

/** The job parameters: the staff pages' shared v3 shape, plus the app's goals, text, stats snapshot and level. */
export function planRequestParams(a: PlanAnswers, athlete: Row, statsProfile: Row): Row {
  const base = planV3JobParams([], athlete, a.age ?? null, { horizonWeeks: a.weeks, sessionsPerWeek: a.days,
    minutesPerSession: FIXED_MINUTES, setting: a.setting, equipment: [...DEFAULT_EQUIPMENT], painFlag: false });
  const snapshot = statsProfile && statsProfile.schemaVersion ? statsProfile : base.statsProfile;
  const score = typeof snapshot.overallScore === 'number' ? snapshot.overallScore : null;
  const text = a.text.trim();
  return { ...base, statsProfile: snapshot,
    intake: { ...base.intake, goals: [...a.goals], level: inferredLevel(score), ...(text ? { freeTextGoals: text } : {}) } };
}

/** Pain pauses here: nothing is submitted (workbook R26; the gateway refuses it too). */
export async function requestPlan(playerId: string, a: PlanAnswers, athlete: Row, statsProfile: Row,
  submit: (playerId: string, capability: string, params: Row) => Promise<{ id: string }> = submitLlmJob): Promise<string | null> {
  if (planIntakeBlock(a)) return null;
  return (await submit(playerId, 'generate_training_plan', planRequestParams(a, athlete, statsProfile))).id;
}

export default function ProgramIntake({ playerId, athlete, statsProfile, preview, access, weeks: openingWeeks, initialText = '', onReady, onBack }: {
  playerId: string; athlete: Row; statsProfile: Row; preview: boolean; access?: Access; initialText?: string; onReady: () => void; onBack: () => void;
  /** The plan length the form opens with, when the button that opened it named one. */
  weeks?: number;
}) {
  const mode = planIntakeAccess(preview ? 'preview' : access);
  const config = useCoachConfig(preview);
  const id = useId();
  const known = personalAge(athlete);
  const [answers, setAnswers] = useState<PlanAnswers>(() => ({ weeks: initialPlanWeeks(openingWeeks), goals: [], text: initialText,
    days: 3, setting: 'solo', age: known, pain: false }));
  const set = (next: Partial<PlanAnswers>) => setAnswers(old => ({ ...old, ...next }));
  const key = `posetek:plan-job:${auth.currentUser?.uid || 'preview'}:${playerId}`;
  const [jobId, setJobId] = useState<string | null>(() => { try { return mode === 'form' ? localStorage.getItem(key) : null; } catch { return null; } });
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const forget = () => { try { localStorage.removeItem(key); } catch { /* storage optional */ } };
  // A request already accepted for this athlete is followed again after leaving and returning.
  useEffect(() => {
    if (!jobId || mode !== 'form') return;
    let stop = () => {}, live = true;
    waitForJob(jobId, text => { if (live) setStatus(text); }, unsubscribe => { stop = unsubscribe; })
      .then(() => { if (!live) return; forget(); setJobId(null); onReady(); })
      .catch((e: any) => { if (!live) return; forget(); setJobId(null); setBusy(false); setError(e?.message || 'Your plan could not be built.'); });
    return () => { live = false; stop(); };
  }, [jobId, mode]);

  if (mode === 'refused') return <section className="workout-wizard player-intake"><p className="wk-muted">Sign in to build a plan.</p></section>;

  const enabled = mode === 'sample' || (capabilityEnabled(config, 'generate_training_plan') && config?.programV3Enabled === true);
  const block = planIntakeBlock(answers);
  const ageRange = [Math.min(AGE_MIN, known ?? AGE_MIN), Math.max(AGE_MAX, known ?? AGE_MAX)];
  const weekIndex = Math.max(0, HORIZON_WEEKS.indexOf(answers.weeks as (typeof HORIZON_WEEKS)[number]));
  const submit = async () => {
    if (submitting.current || jobId || block) return;
    if (mode === 'sample') { onReady(); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const created = await requestPlan(playerId, answers, athlete, statsProfile);
      if (!created) { setBusy(false); return; }
      try { localStorage.setItem(key, created); } catch { /* the listener still works */ }
      setStatus(''); setJobId(created);
    } catch (e: any) { setError(e?.message || 'Your plan could not be requested.'); setBusy(false); }
    finally { submitting.current = false; }
  };

  if (jobId) return <section className="workout-wizard player-intake">
    <div className="wk-card" role="status"><h2>{status || 'Waiting for the training engine…'}</h2></div>
  </section>;

  return <section className="workout-wizard player-intake" aria-label="Plan setup">
    <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <fieldset disabled={busy}>
        <label className="workout-slider" htmlFor={`${id}-weeks`}><span><strong>{answers.weeks}</strong> {answers.weeks === 1 ? 'week' : 'weeks'}</span>
          <input id={`${id}-weeks`} type="range" min={0} max={HORIZON_WEEKS.length - 1} step={1} value={weekIndex} aria-valuetext={`${answers.weeks} weeks`}
            onChange={e => set({ weeks: HORIZON_WEEKS[Number(e.target.value)] })} />
          <small><span>{HORIZON_WEEKS[0]} week</span><span>{HORIZON_WEEKS.at(-1)} weeks</span></small></label>

        <fieldset><legend>What do you want to get better at?</legend>
          <div className="workout-choice-grid" role="group" aria-label="Goals">{PLAN_GOALS.map(g => {
            const on = answers.goals.includes(g.id);
            return <button type="button" key={g.id} className="workout-choice" aria-pressed={on} disabled={!on && answers.goals.length >= MAX_GOALS}
              onClick={() => set({ goals: on ? answers.goals.filter(v => v !== g.id) : [...answers.goals, g.id] })}>
              <span className="material-symbols-outlined" aria-hidden="true">{g.icon}</span><span><strong>{g.label}</strong><small>{g.detail}</small></span>
              <span className="workout-choice-check" aria-hidden="true">{on ? '✓' : '+'}</span></button>;
          })}</div>
          <label>Anything else we should know?<textarea maxLength={500} rows={2} value={answers.text} onChange={e => set({ text: e.target.value })} /></label>
        </fieldset>

        <fieldset><legend>How many days a week can you train?</legend>
          <div className="workout-segments">{PLAN_DAYS.map(d => <button type="button" key={d} aria-pressed={answers.days === d} onClick={() => set({ days: d })}>{d}</button>)}</div>
        </fieldset>

        <fieldset><legend>By yourself?</legend>
          <div className="workout-segments">{PLAN_SETTINGS.map(s => <button type="button" key={s.id} aria-pressed={answers.setting === s.id} onClick={() => set({ setting: s.id })}>{s.label}</button>)}</div>
        </fieldset>

        <fieldset><legend>What's your age?</legend>
        <label className="workout-slider" htmlFor={`${id}-age`}><span><strong>{answers.age ?? '–'}</strong> years old</span>
          <input id={`${id}-age`} type="range" min={ageRange[0]} max={ageRange[1]} step={1} value={answers.age ?? 15} aria-valuetext={answers.age ? `${answers.age} years old` : 'Not chosen'}
            onChange={e => set({ age: Number(e.target.value) })} />
          <small><span>{ageRange[0]}</span><span>{ageRange[1]}</span></small></label>
        </fieldset>

        <fieldset><legend>Anything hurting right now?</legend>
          <div className="workout-segments"><button type="button" aria-pressed={!answers.pain} onClick={() => set({ pain: false })}>No, I feel fine</button>
            <button type="button" aria-pressed={answers.pain} onClick={() => set({ pain: true })}>Yes, something hurts</button></div>
        </fieldset>

        {answers.pain ? <div className="workout-pause-note" role="alert"><strong>Get this looked at first</strong>
          <p>An athletic trainer, physio, or doctor should see it before you add load. Once you're cleared, come back and we'll build the plan then.</p>
          <button type="button" className="hub-secondary" onClick={onBack}>Got it</button></div>
          : <>
            {answers.age !== undefined && block === 'goals' && <p className="wk-muted" role="status">Pick at least one goal.</p>}
            {!enabled && config && <p className="wk-muted">Plan building is paused right now.</p>}
            <div className="workout-wizard-actions"><button type="submit" className="primary-cta" disabled={!!block || !enabled || busy}>{busy ? 'Sending your answers…' : 'Build my plan'}</button></div>
          </>}
        {error && <div className="player-error" role="alert"><p>{error}</p></div>}
      </fieldset>
    </form>
  </section>;
}
