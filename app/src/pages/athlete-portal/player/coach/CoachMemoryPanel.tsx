import type { Row } from '../execution';
import { MEMORY_LIMIT, coachMemories, memoryLoaded } from './coach-memory';
import type { CoachMemoryRecord } from './coach-memory';

export type MemoryPanelProps = {
  memory: Row | null;
  /** A memory command is in flight. */
  updating: boolean;
  /** A chat reply is streaming. */
  streaming: boolean;
  notice: string;
  error: { message: string; refCode: string; sharingOff: boolean } | null;
  confirmingForgetAll: boolean;
  onConfirmForgetAll: (open: boolean) => void;
  onCommand: (kind: string, extra?: Row) => void;
  onRefresh: () => void;
  onTurnOnSharing: () => void;
};

function Note({ text }: { text: string }) {
  return <p className="coach-note"><span className="material-symbols-outlined" aria-hidden="true">info</span><span>{text}</span></p>;
}

/** The Coach memory sheet's content, as the app's `CoachMemoryView` shows it. */
export default function CoachMemoryPanel({ memory, updating, streaming, notice, error, confirmingForgetAll, onConfirmForgetAll, onCommand, onRefresh, onTurnOnSharing }: MemoryPanelProps) {
  const loaded = memoryLoaded(memory), enabled = memory?.workspace?.enabled === true;
  const { active, proposed } = coachMemories(memory);
  const canUpdate = loaded && !streaming && !updating;
  const card = (record: CoachMemoryRecord) => <article key={record.id} className="coach-memory-card">
    <p className="coach-memory-eyebrow">{record.category.replaceAll('_', ' ')}</p>
    <p className="coach-memory-text">{record.text}</p>
    {record.sourceQuote && <p className="coach-memory-quote">You said: “{record.sourceQuote}”</p>}
    <div className="coach-memory-actions">
      {record.status === 'proposed' && <button type="button" disabled={!canUpdate || !enabled || active.length >= MEMORY_LIMIT}
        onClick={() => onCommand('confirm', { memoryId: record.id })}>Save</button>}
      <button type="button" className="coach-destructive" disabled={!canUpdate} onClick={() => onCommand('forget', { memoryId: record.id })}>
        {record.status === 'proposed' ? 'Dismiss' : 'Forget'}
      </button>
    </div>
  </article>;
  return <div className="coach-memory">
    <h3 className="coach-memory-title">Help your coach remember what matters.</h3>
    <p className="coach-memory-intro">Save the goals and preferences you want used in future chats. Suggestions aren't used as saved memories until you choose Save.</p>
    {!loaded ? <p className="coach-progress" role="status"><span className="coach-spinner" aria-hidden="true" />Loading memory…</p> : <>
      <label className="coach-switch">
        <span>Use coach memory</span>
        <input type="checkbox" role="switch" checked={enabled} disabled={!canUpdate} onChange={event => onCommand('setEnabled', { enabled: event.target.checked })} />
      </label>
      {!enabled && <Note text="Memory is paused. Saved details and past-chat recall won't be used. You can still forget saved items." />}
      {proposed.length > 0 && <><h4 className="coach-section-header">Review suggestions</h4>{proposed.map(card)}</>}
      <h4 className="coach-section-header">Saved ({active.length}/{MEMORY_LIMIT})</h4>
      {!active.length && <Note text="No saved memories yet." />}
      {active.map(card)}
      <Note text="To correct a detail, forget it and tell your coach the update. Memories expire after 180 days." />
      <button type="button" className="coach-destructive coach-forget-all" disabled={!canUpdate} onClick={() => onConfirmForgetAll(true)}>Forget all memories</button>
      <Note text="Forgetting also stops older chats being recalled, so they can't bring the detail back. Your chat history, workouts and test results stay in their own history." />
    </>}
    {updating && <p className="coach-progress" role="status"><span className="coach-spinner" aria-hidden="true" />Updating…</p>}
    {notice && <p className="coach-memory-notice" role="status">{notice}</p>}
    {error && (error.sharingOff
      ? <SharingOffNotice action="load memory" onTurnOn={onTurnOnSharing} />
      : <div className="coach-memory-error" role="alert"><p>{error.message}</p>{error.refCode && <p className="coach-ref">Ref {error.refCode}</p>}<button type="button" onClick={onRefresh}>Refresh</button></div>)}
    {confirmingForgetAll && <div className="coach-confirm" role="alertdialog" aria-labelledby="coach-forget-all-title" aria-describedby="coach-forget-all-message">
      <h4 id="coach-forget-all-title">Forget all coach memories?</h4>
      <p id="coach-forget-all-message">Saved memories and suggestions will be removed from future coaching. Older chats will no longer be recalled.</p>
      <button type="button" className="coach-destructive" onClick={() => { onConfirmForgetAll(false); onCommand('forgetAll'); }}>Forget all</button>
      <button type="button" onClick={() => onConfirmForgetAll(false)}>Cancel</button>
    </div>}
  </div>;
}

/** "AI sharing is off" with the button that opens the permission sheet (`AISharingOffNotice`). */
export function SharingOffNotice({ action, onTurnOn, showsMessage = true }: { action?: string; onTurnOn: () => void; showsMessage?: boolean }) {
  return <div className="coach-sharing-off">
    {showsMessage && <>
      <p className="coach-sharing-off-title"><span className="material-symbols-outlined" aria-hidden="true">shield_lock</span>AI sharing is off</p>
      <p className="coach-sharing-off-copy">PoseTek needs your permission before it sends your training information to its AI providers.</p>
    </>}
    <button type="button" className="coach-sharing-on" onClick={onTurnOn}>
      <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>{action ? `Turn on AI sharing and ${action}` : 'Turn on AI sharing'}
    </button>
  </div>;
}
