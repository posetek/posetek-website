import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A full-height sheet over the Coach tab, standing in for the app's `.sheet` presentations
 * (History, Coach memory, AI sharing): an inline title with the dismiss control on the leading
 * side, content that scrolls on its own, Escape to close and focus returned to the opener.
 */
export default function CoachSheet({ title, onDone, doneLabel = 'Done', doneDisabled = false, children }: {
  title: string; onDone: () => void; doneLabel?: string; doneDisabled?: boolean; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null), titleId = useId();
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; opener?.focus?.(); };
  }, []);
  return <div className="coach-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget && !doneDisabled) onDone(); }}>
    <div className="coach-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}
      onKeyDown={event => { if (event.key === 'Escape' && !doneDisabled) { event.stopPropagation(); done.current(); } }}>
      <header className="coach-sheet-bar">
        <button type="button" className="coach-sheet-done" disabled={doneDisabled} onClick={onDone}>{doneLabel}</button>
        <h2 id={titleId}>{title}</h2>
        <span aria-hidden="true" />
      </header>
      <div className="coach-sheet-body">{children}</div>
    </div>
  </div>;
}
