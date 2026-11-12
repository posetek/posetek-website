import { useState } from 'react';
import type { Row } from '../execution';
import { completedMinutes } from '../execution';
import { WORKOUT_TYPE_LABELS, endReasonChip, freeSessionSummary, historyBlockSummary, historyRows, savedDetailLine, sessionDateText } from './hub';
import type { SavedEntry } from './hub';
import { Eyebrow, InfoNote, doseLine } from './MyWorkoutPlan';

const FREE_SESSION_TESTS: Record<string, string> = { deadballShot: 'Shooting', dribbling: 'Dribbling', jump: 'Vertical Jump', broadJump: 'Broad Jump', sprint: 'Sprint', changeOfDirection: 'Shuttle', freeRecord: 'Free record' };

/**
 * Workout history (`TrainingHistoryView`): workouts and free sessions in one list, newest first.
 * A row opens its per-drill breakdown in place.
 */
export function HistoryList({ logs, sessions, planId, loading, error, canReview, onReview }: { logs: Row[]; sessions: Row[]; planId: string | null; loading: boolean; error: string; canReview?: (log: Row) => boolean; onReview?: (log: Row) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = historyRows(logs, sessions);
  return <div className="wk-stack wk-history">
    {loading && <p className="wk-loading" role="status"><span className="wk-spinner" aria-hidden="true" />Loading</p>}
    {!rows.length && !loading && <section className="wk-card"><Eyebrow>Nothing yet</Eyebrow><p className="wk-muted">Workouts you run and free sessions you record will both show up here.</p></section>}
    {rows.map(({ kind, row, key }) => {
      const expanded = open === key, toggle = () => setOpen(expanded ? null : key);
      if (kind === 'session') return <section className="wk-card wk-history-card" key={key}>
        <button type="button" className="wk-history-row" aria-expanded={expanded} onClick={toggle}>
          <span className="wk-history-icon muted material-symbols-outlined" aria-hidden="true">radio_button_checked</span>
          <span className="wk-history-title"><strong>Free session</strong><small>{sessionDateText(row.startedAt)}</small></span>
          {row.endReason === 'inactivity' && <span className="wk-tag muted">Auto-closed</span>}
          <span className="material-symbols-outlined wk-chevron" aria-hidden="true">{expanded ? 'expand_less' : 'chevron_right'}</span>
        </button>
        <p className="wk-muted wk-small">{freeSessionSummary(row)}</p>
        {expanded && <div className="wk-history-detail">{(row.sessionRefs || []).map((ref: Row, i: number) => <p key={ref.sessionDocId || i}>{FREE_SESSION_TESTS[ref.drillType] || ref.drillType} · Session {ref.sessionNumber}</p>)}</div>}
      </section>;
      const chip = endReasonChip(row), snapshot = row.workoutSnapshot || {};
      const reviewable = !!canReview?.(row);
      return <section className="wk-card wk-history-card" key={key}>
        <button type="button" className="wk-history-row" aria-expanded={expanded} onClick={toggle}>
          <span className="wk-history-icon material-symbols-outlined" aria-hidden="true">bolt</span>
          <span className="wk-history-title"><strong>{row.source === 'personal' ? 'Workout' : `Workout · week ${row.weekNumber}`}</strong><small>{sessionDateText(row.startedAt)}</small></span>
          <span className={`wk-tag ${chip.tone}`}>{chip.text}</span>
        </button>
        <p className="wk-muted wk-small">{historyBlockSummary(row)}</p>
        {planId && row.planId && row.source !== 'personal' && row.planId !== planId && <InfoNote icon="history" text="From an earlier plan." />}
        {(row.blocks || []).some((b: Row) => b.skipReason === 'pain') && <InfoNote icon="medical_services" text="You stopped something for pain in this workout." />}
        {expanded && <div className="wk-history-detail">
          {snapshot.title && <h3>{snapshot.title}</h3>}
          <p className="wk-muted wk-small">{Math.round(completedMinutes(row))} min</p>
          {(snapshot.blocks || []).map((b: Row) => { const r = (row.blocks || []).find((v: Row) => v.blockId === b.blockId);
            return <div className="wk-breakdown-row" key={b.blockId}><strong>{b.name || b.drillId}</strong><small>{doseLine(b)}</small>
              <span>{r ? `${r.setsCompleted ?? 0}/${r.targetSets ?? b.sets ?? 1} sets · ${r.status}${r.skipReason ? ` · ${r.skipReason}` : ''}` : 'Not logged'}</span></div>; })}
          {reviewable && onReview && <button type="button" className="wk-secondary" onClick={() => onReview(row)}>View workout</button>}
        </div>}
      </section>;
    })}
    {!!rows.length && !loading && !error && <p className="wk-muted wk-small wk-center">You're up to date</p>}
    {error && <InfoNote icon="warning" text={`Couldn't load your workouts: ${error}`} />}
  </div>;
}

/** Saved Workouts (`SavedWorkoutLibraryView`): a type filter, then each workout with its drills. */
export function SavedLibrary({ entries, loading, error, onOpen, onEdit }: { entries: SavedEntry[]; loading: boolean; error: string; onOpen: (entry: SavedEntry) => void; onEdit: (entry: SavedEntry) => void }) {
  const [type, setType] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const filtered = entries.filter(e => type === 'all' || e.type === type);
  return <div className="wk-stack">
    <div className="wk-filter">
      <select aria-label="Workout type" value={type} onChange={e => setType(e.target.value)}><option value="all">All workouts</option>{Object.entries(WORKOUT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {loading && <p className="wk-loading" role="status"><span className="wk-spinner" aria-hidden="true" />Loading</p>}
    {!filtered.length && !loading && <section className="wk-card"><Eyebrow>No saved workouts</Eyebrow><p className="wk-muted">Workouts you save for later appear here. Completed sessions are in Workout History.</p></section>}
    {filtered.map(entry => { const expanded = open === entry.id;
      return <section className="wk-card wk-saved" key={entry.id}>
        <button type="button" className="wk-disclosure" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : entry.id)}>
          <span><strong>{entry.workout.title || 'Your workout'}</strong><small>{savedDetailLine(entry.workout, entry.inProgress)}</small></span>
          <span className="material-symbols-outlined" aria-hidden="true">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
        {expanded && <ul className="wk-saved-blocks">{(entry.workout.blocks || []).map((b: Row) => <li key={b.blockId}>{b.name} · {doseLine(b)}</li>)}</ul>}
        {entry.unavailableReason && entry.source === 'personal' && <button type="button" className="wk-secondary" onClick={() => onEdit(entry)}><span className="material-symbols-outlined" aria-hidden="true">edit_square</span>Create an edited copy</button>}
        {entry.unavailableReason ? <InfoNote text={entry.unavailableReason} />
          : <button type="button" className="wk-secondary" onClick={() => onOpen(entry)}><span className="material-symbols-outlined" aria-hidden="true">play_circle</span>{entry.inProgress ? 'Resume workout' : 'Open workout'}</button>}
      </section>; })}
    {error && <><InfoNote text={`Couldn't load saved workouts: ${error}`} /></>}
  </div>;
}
