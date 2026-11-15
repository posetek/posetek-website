import { useEffect, useRef } from 'react';
import AddPlayer from '../../../family/AddPlayer';
import { useCloseOnHistoryNavigation } from '../PlayerShell';
import './account.css';

/** The account menu's "Add player" in a parent session: the picker's field, as a sheet. */
export default function AddPlayerSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (playerIds: string[]) => void }) {
  const done = useRef<HTMLButtonElement>(null);
  useCloseOnHistoryNavigation(onClose);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    done.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  return <div className="account-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="add-player-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <div className="account-sheet-bar"><span /><button ref={done} type="button" className="account-sheet-done" onClick={onClose}>Done</button></div>
      <h2 id="add-player-title" className="account-sheet-title">Add player</h2>
      <AddPlayer variant="sheet" onAdded={onAdded} />
    </div>
  </div>;
}
