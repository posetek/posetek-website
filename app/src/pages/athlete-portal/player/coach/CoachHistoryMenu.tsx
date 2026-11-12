import { useEffect, useRef, useState } from 'react';
import { HistoryIcon } from './coach-icons';

/** The Coach tab's History control: a menu with "Conversation history" and "New conversation". */
export default function CoachHistoryMenu({ onHistory, onNew }: { onHistory: () => void; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const choose = (action: () => void) => () => { setOpen(false); action(); };
  return <div className="coach-tool-menu" ref={root}>
    <button type="button" className="coach-tool" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <HistoryIcon /><span>History</span>
    </button>
    {open && <div className="coach-menu" role="menu">
      <button type="button" role="menuitem" onClick={choose(onHistory)}>Conversation history</button>
      <button type="button" role="menuitem" onClick={choose(onNew)}>New conversation</button>
    </div>}
  </div>;
}
