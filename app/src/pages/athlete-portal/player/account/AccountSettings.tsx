import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { auth } from '../../../../lib/firebase';
import type { PortalContext } from '../../views/shared';
import AISharingControl from '../AISharingControl';
import PlayerAgeField from '../PlayerAgeField';
import './account.css';

type Props = {
  ctx: PortalContext;
  onClose: () => void;
  /** The signed-in account's email; defaults to Firebase Auth's current user. */
  email?: string | null;
};

/**
 * Account settings, the sheet the account menu opens (the app's `AccountSettingsView`). It always
 * describes the signed-in account, never the athlete being viewed. Rows the website cannot back
 * are listed in the port report: the app's "Share app usage" (the site has no product analytics),
 * "Release of Liability" (no web copy) and in-page account deletion (the site links to the
 * support answer instead). The age row is website-only and has no place in the app.
 */
export default function AccountSettings({ ctx, onClose, email = auth.currentUser?.email ?? null }: Props) {
  const [page, setPage] = useState<'root' | 'aiSharing'>('root');
  const done = useRef<HTMLButtonElement>(null), back = useRef<HTMLButtonElement>(null);
  const preview = ctx.access === 'preview', own = ctx.access === 'athlete' || preview;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => { opener?.focus?.(); };
  }, []);
  useEffect(() => { (page === 'root' ? done : back).current?.focus(); }, [page]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (page === 'root') onClose(); else setPage('root');
  };
  return <div className="account-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-sheet-title" onKeyDown={onKeyDown}>
      {page === 'root' ? <>
        <div className="account-sheet-bar"><span /><button ref={done} type="button" className="account-sheet-done" onClick={onClose}>Done</button></div>
        <h2 id="account-sheet-title" className="account-sheet-title">Account settings</h2>
        <h3 className="account-section-title">Your account</h3>
        <div className="account-list">
          {email && <p className="account-row">{email}</p>}
          {own && ctx.playerId && <div className="account-row account-age"><PlayerAgeField playerId={ctx.playerId} athlete={ctx.athlete} editable preview={preview} /></div>}
          <button type="button" className="account-row account-link" onClick={() => setPage('aiSharing')}>AI sharing<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
          <a className="account-row account-link" href="/support#delete-account">Delete account<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></a>
        </div>
        <div className="account-list">
          <a className="account-row account-external" href="/privacy">Privacy policy</a>
          <a className="account-row account-external" href="/support">Support</a>
        </div>
      </> : <>
        <div className="account-sheet-bar">
          <button ref={back} type="button" className="account-sheet-back" onClick={() => setPage('root')}><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>Account settings</button>
        </div>
        <h2 id="account-sheet-title" className="account-sheet-title">AI sharing</h2>
        {/* Like the app's AISharingConsentView, this is the signed-in account's own choice. */}
        <AISharingControl preview={preview} />
      </>}
    </div>
  </div>;
}
