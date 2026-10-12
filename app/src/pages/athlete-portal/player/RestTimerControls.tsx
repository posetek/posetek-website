import { useId } from 'react';
import { chosenRest, restDefaults } from './rest-choice';
import type { RestChoice, RestKind } from './rest-choice';
import type { Row } from './execution';
import './rest-timer-controls.css';

export default function RestTimerControls({ block, choice, disabled = false, startDisabled = disabled, onChange, onStart }: {
  block: Row; choice?: RestChoice; disabled?: boolean; startDisabled?: boolean;
  onChange: (kind: RestKind, seconds: number) => void; onStart: (kind: RestKind) => void;
}) {
  const id = useId(), defaults = restDefaults(block);
  const kinds = (['reps', 'sets'] as const).filter(kind => defaults[kind] > 0);
  if (!kinds.length) return null;
  return <details className="rest-timer-controls">
    <summary>Choose rest time</summary>
    <p className="rest-timer-help">The default follows your workout. Choose a shorter timer, or zero for no timer. Take extra recovery whenever you need it.</p>
    {kinds.map(kind => {
      const value = chosenRest(block, choice, kind), label = kind === 'reps' ? 'Between reps' : 'Between sets';
      return <fieldset key={kind} disabled={disabled}>
        <legend>{label}</legend>
        <div className="rest-choice-value"><strong>{value === 0 ? 'No timer' : `${value}s`}</strong><span>Default {defaults[kind]}s</span></div>
        <label className="rest-choice-slider" htmlFor={`${id}-${kind}`}>Timer seconds
          <input id={`${id}-${kind}`} type="range" min={0} max={defaults[kind]} step={1} value={value}
            aria-valuetext={value === 0 ? 'Zero seconds, no timer' : `${value} seconds`} onChange={event => onChange(kind, Number(event.target.value))} />
        </label>
        <div className="rest-choice-bounds"><span>0s · No timer</span><span>{defaults[kind]}s · Default</span></div>
        <div className="rest-choice-actions">
          <button type="button" disabled={disabled || value === defaults[kind]} onClick={() => onChange(kind, defaults[kind])}>Use default</button>
          {kind === 'reps' && <button type="button" disabled={startDisabled || value === 0} onClick={() => onStart(kind)}>Start rep rest</button>}
        </div>
      </fieldset>;
    })}
  </details>;
}
