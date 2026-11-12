import { useId, useState } from 'react';
import { ENERGY_CHOICES, MINUTE_STOPS, WORKOUT_PLACES, createReady } from './create-workout';
import type { CreateAnswers } from './create-workout';
import '../personal-workouts.css';

/** "Create your workout" (`CreateTrainingWorkoutCard`): where, minutes and energy, then the workout chat. */
export default function CreateWorkoutCard({ initialMinutes, disabledReason, onBuild }: {
  initialMinutes: number;
  /** Set when this viewer cannot build: the button stays visible, disabled, with this reason. */
  disabledReason?: string;
  onBuild: (answers: CreateAnswers) => void;
}) {
  const id = useId();
  const [answers, setAnswers] = useState<CreateAnswers>({ place: 'field', goal: null, minutes: initialMinutes, energy: null });
  const set = (change: Partial<CreateAnswers>) => setAnswers(a => ({ ...a, ...change }));
  const index = Math.max(0, MINUTE_STOPS.indexOf(answers.minutes));
  return <section className="wk-card workout-wizard wk-create-workout" data-create-workout>
    <div className="workout-choice-grid workout-location-options" role="group" aria-label="Where">
      {WORKOUT_PLACES.map(place => <button type="button" key={place.id} className="workout-choice" data-place={place.id} aria-pressed={answers.place === place.id} onClick={() => set({ place: place.id })}>
        <span className="material-symbols-outlined" aria-hidden="true">{place.icon}</span><span><strong>{place.label}</strong><small>{place.detail}</small></span>
      </button>)}
    </div>
    {answers.place === 'field' && <fieldset className="workout-readiness"><legend>Goal?</legend><div className="workout-segments">
      <button type="button" data-goal="yes" aria-pressed={answers.goal === true} onClick={() => set({ goal: true })}>Yes</button>
      <button type="button" data-goal="no" aria-pressed={answers.goal === false} onClick={() => set({ goal: false })}>No</button>
    </div></fieldset>}
    <label className="workout-slider" htmlFor={`${id}-minutes`}><span><strong>{answers.minutes}</strong> minutes</span>
      <input id={`${id}-minutes`} type="range" min={0} max={MINUTE_STOPS.length - 1} step={1} value={index} aria-valuetext={`${answers.minutes} minutes`} onChange={e => set({ minutes: MINUTE_STOPS[Number(e.target.value)] })} />
      <small><span>{MINUTE_STOPS[0]} min</span><span>{MINUTE_STOPS.at(-1)} min</span></small>
    </label>
    <fieldset className="workout-readiness"><legend>Energy</legend><div className="workout-segments">
      {ENERGY_CHOICES.map(choice => <button type="button" key={choice.id} data-energy={choice.id} aria-pressed={answers.energy === choice.id} onClick={() => set({ energy: choice.id })}>{choice.label}</button>)}
    </div></fieldset>
    <button type="button" className="primary-cta" data-action="build-workout" disabled={!!disabledReason || !createReady(answers)} onClick={() => onBuild(answers)}>Build my workout<span aria-hidden="true">→</span></button>
    {disabledReason && <small className="wk-faint">{disabledReason}</small>}
  </section>;
}
