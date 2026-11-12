import type { ReactNode } from 'react';
import TrainingLoadInstructions from '../../../../components/TrainingLoadInstructions';
import { orderedBlocks } from '../../../../lib/contracts/planV3';
import type { Row } from '../execution';
import { Eyebrow, InfoNote, doseLine } from './MyWorkoutPlan';

/**
 * "Your workout" (`TrainingWorkoutDetailCard`): the summary, each drill with its dose and status,
 * then Start, Resume or the ended note. A drill opens its demonstration.
 */
export default function WorkoutReview({ workout, log, start, onAdjust, adjustLabel = 'Tell me what to change', onCreateAnother, onDrill, onFull }: {
  workout: Row; log: Row | null; start: ReactNode; onAdjust?: () => void; adjustLabel?: string; onCreateAnother?: () => void; onDrill: (drillId: string) => void; onFull: () => void;
}) {
  const snapshot = log?.workoutSnapshot || workout, blocks = orderedBlocks(snapshot);
  const ended = !!log?.endedAt, inProgress = !!log && !ended;
  return <div className="wk-review">
    <div className="wk-review-head">
      <div className="wk-card-head"><Eyebrow>{`Week ${workout.weekNumber} · ${blocks.length} drills · ~${snapshot.estimatedMinutes ?? workout.estimatedMinutes ?? 0} min`}</Eyebrow>
        <button type="button" className="wk-icon-button" aria-label="View full workout" onClick={onFull}><span className="material-symbols-outlined" aria-hidden="true">open_in_full</span></button></div>
      <h2>{snapshot.title || 'Your workout'}</h2>
      {(workout.intro || snapshot.intent) && <p className="wk-muted">{workout.intro || snapshot.intent}</p>}
    </div>
    <ol className="wk-review-blocks">{blocks.map((b: Row, index: number) => { const status = log?.blocks?.find((r: Row) => r.blockId === b.blockId)?.status;
      return <li key={b.blockId}>
        <button type="button" className="wk-review-block" onClick={() => onDrill(b.drillId)}>
          <span className="wk-review-order" aria-hidden="true">{b.order ?? index + 1}</span><strong>{b.name || b.drillId}</strong><small>~{b.estimatedMinutes} min</small>
        </button>
        <p>{doseLine(b)}</p>
        {b.whyIncluded && <p className="wk-faint">{b.whyIncluded}</p>}
        <TrainingLoadInstructions block={b} />
        {status && <p className="wk-status">{status === 'done' ? 'Done' : status === 'skipped' ? 'Skipped' : 'Partly done'}</p>}
      </li>; })}</ol>
    <button type="button" className="wk-secondary" onClick={onFull}><span className="material-symbols-outlined" aria-hidden="true">list_alt</span>View full workout</button>
    {snapshot.stopRule && <InfoNote icon="back_hand" text={snapshot.stopRule} />}
    {ended ? <>
      <InfoNote icon={log!.endReason === 'completed' ? 'check_circle' : 'flag'} text={log!.endReason === 'completed' ? 'Workout completed. Nice work.' : 'Ended early. The work you did still counts.'} />
      {onCreateAnother && <button type="button" className="wk-secondary" onClick={onCreateAnother}><span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>Create another workout</button>}
    </> : <>
      {inProgress ? <InfoNote icon="lock" text="Your session keeps the workout you started. Your progress is saved." />
        : onAdjust && <button type="button" className="wk-secondary" onClick={onAdjust}><span className="material-symbols-outlined" aria-hidden="true">forum</span>{adjustLabel}</button>}
      {start}
    </>}
  </div>;
}
