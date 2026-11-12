import { useState } from 'react';
import TrainingLoadInstructions from '../../../../components/TrainingLoadInstructions';
import { orderedBlocks } from '../../../../lib/contracts/planV3';
import type { Row } from '../execution';
import { InfoNote, doseLine } from './MyWorkoutPlan';
import { domainLabel } from '../../../../lib/contracts/types';
import { domainFromLegacy } from '../../../../lib/contracts/drillV2';

/** "14 of 15 min", or "14 min" without a requested time (`WorkoutEditorMath.estimateLabel`). */
export function estimateLabel(estimate: number, requested?: number | null) {
  return requested && requested > 0 ? `${estimate} of ${requested} min` : `${estimate} min`;
}
export const estimateOffTarget = (estimate: number, requested?: number | null) => !!requested && requested > 0 && Math.abs(estimate - requested) * 10 > requested;

/**
 * "View full workout" (`WorkoutFullView`, saved mode) as the website can show it: every drill with its
 * category, dose, time, cues and reasons. Editing a saved workout is not available on the web, so the
 * view says so in the app's own words and offers no edit controls.
 */
export default function WorkoutFull({ workout, started, requestedMinutes, onDrill }: { workout: Row; started: boolean; requestedMinutes?: number | null; onDrill: (drillId: string, name: string) => void }) {
  const snapshot = workout.workoutSnapshot || workout, blocks = orderedBlocks(snapshot);
  const estimate = Number(snapshot.estimatedMinutes ?? workout.estimatedMinutes) || 0;
  const focus: string[] = [...new Set<string>((snapshot.focusDomains?.length ? snapshot.focusDomains : blocks.map((b: Row) => b.domain)).filter(Boolean))];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return <div className="wk-full">
    <header className="wk-full-head">
      <h2>{snapshot.title || 'Your workout'}</h2>
      {snapshot.intent && <p className="wk-muted">{snapshot.intent}</p>}
      <p className={`wk-full-estimate${estimateOffTarget(estimate, requestedMinutes) ? ' off' : ''}`}><span className="material-symbols-outlined" aria-hidden="true">schedule</span>{estimateLabel(estimate, requestedMinutes)} · {blocks.length} drills</p>
      {!!focus.length && <div className="wk-chips">{focus.map(d => <CategoryChip key={d} domain={d} />)}</div>}
      <InfoNote icon="lock" text={started ? "This workout has started, so it can't be changed here." : "Editing workouts isn't available yet."} />
    </header>
    {blocks.map((b: Row, index: number) => { const open = expanded.has(b.blockId), cues: string[] = Array.isArray(b.cues) ? b.cues : [];
      return <section className="wk-full-row" key={b.blockId}>
        <div className="wk-full-row-main">
          <span className="wk-review-order" aria-hidden="true">{b.order ?? index + 1}</span>
          <button type="button" className="wk-full-drill" aria-description="Opens the drill's details" onClick={() => onDrill(b.drillId, b.name || b.drillId)}>
            <strong>{b.name || b.drillId}</strong><CategoryChip domain={b.domain} /><small>{doseLine(b)}</small>
          </button>
          <small className="wk-full-time">~{b.estimatedMinutes} min</small>
        </div>
        <TrainingLoadInstructions block={b} />
        {(cues.length > 0 || b.whyIncluded) && <>
          <button type="button" className="wk-text-button" aria-expanded={open} onClick={() => setExpanded(old => { const next = new Set(old); if (open) next.delete(b.blockId); else next.add(b.blockId); return next; })}>
            <span className="material-symbols-outlined" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>{open ? 'Hide cues and why' : 'Cues and why'}</button>
          {open && <div className="wk-full-cues">{cues.map((cue, i) => <p key={i}><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>{cue}</p>)}{b.whyIncluded && <p className="wk-faint">{b.whyIncluded}</p>}</div>}
        </>}
      </section>; })}
  </div>;
}

/** `TrainingDomainStyle` colors for the ten v2 domains; anything else is the neutral "Other". */
const DOMAIN_COLORS: Record<string, string> = { ballMastery: '#FFD84D', dribbling: '#C6F04D', passing: '#4E9BFF', receiving: '#2ED8E6', shooting: '#FF6B6B', speed: '#FF9F43', agility: '#B18CFF', plyometrics: '#FF7EC8', strength: '#D9A37A', games: '#6BE38A', yoga: '#D6C6F5' };
function CategoryChip({ domain }: { domain: string }) {
  const id = domainFromLegacy(domain || '');
  return <span className="wk-category-chip" style={{ ['--focus' as string]: DOMAIN_COLORS[id] || '#9AA5AE' }}>{DOMAIN_COLORS[id] ? domainLabel(id) : 'Other'}</span>;
}
