import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { auth, db } from '../../../../lib/firebase';
import { loadFamilyChildren } from '../../../family/family';
import type { PortalContext } from '../../views/shared';
import AISharingControl from '../AISharingControl';
import PlayerAgeField from '../PlayerAgeField';
import { useCloseOnHistoryNavigation } from '../PlayerShell';
import GuardianDeletion from './GuardianDeletion';
import { deletionTitle, parentDeletionEnabled } from './account-deletion';
import type { DeletionTarget } from './account-deletion';
import './account.css';

type Props = {
  ctx: PortalContext;
  onClose: () => void;
  /** The signed-in account's email; defaults to Firebase Auth's current user. */
  email?: string | null;
  /** Whether a parent is offered its delete actions; the build's switch unless a test says otherwise. */
  parentDeletion?: boolean;
};

type Page = 'root' | 'aiSharing' | { delete: DeletionTarget };

/**
 * Account settings, the sheet the account menu opens (the app's `AccountSettingsView`). It always
 * describes the signed-in account, never the athlete being viewed. Rows the website cannot back
 * are listed in the port report: the app's "Share app usage" (the site has no product analytics),
 * "Release of Liability" (no web copy) and in-page account deletion (the site links to the
 * support answer instead). The age row is website-only and has no place in the app.
 *
 * A parent sees one delete action per linked child and one for the parent account (plan §4.9),
 * each naming what it deletes, in place of the support link, but only while the parent deletion
 * switch (`PARENT_DELETION_LIVE` in account-deletion.ts) is on; until then a parent sees no
 * delete row at all and the delete page cannot open.
 */
export default function AccountSettings({ ctx, onClose, email = auth.currentUser?.email ?? null, parentDeletion = parentDeletionEnabled() }: Props) {
  const [requested, setPage] = useState<Page>('root');
  // A delete page is reachable only through the rows below; it never opens for a parent while off.
  const page: Page = typeof requested === 'object' && !parentDeletion ? 'root' : requested;
  const done = useRef<HTMLButtonElement>(null), back = useRef<HTMLButtonElement>(null);
  const preview = ctx.access === 'preview', own = ctx.access === 'athlete' || preview;
  const children = useGuardianChildren(ctx);
  useCloseOnHistoryNavigation(onClose);
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
  const title = page === 'root' ? 'Account settings' : page === 'aiSharing' ? 'AI sharing' : deletionTitle(page.delete);
  return <div className="account-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-sheet-title" onKeyDown={onKeyDown}>
      {page === 'root' ? <>
        <div className="account-sheet-bar"><span /><button ref={done} type="button" className="account-sheet-done" onClick={onClose}>Done</button></div>
        <h2 id="account-sheet-title" className="account-sheet-title">Account settings</h2>
        <h3 className="account-section-title">Your account</h3>
        <div className="account-list">
          {/* Each row renders only with content, so the list never starts with a blank row. */}
          {email ? <p className="account-row">{email}</p> : null}
          {own && ctx.playerId ? <div className="account-row account-age"><PlayerAgeField playerId={ctx.playerId} athlete={ctx.athlete} editable preview={preview} /></div> : null}
          <button type="button" className="account-row account-link" onClick={() => setPage('aiSharing')}>AI sharing<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
          {children ? parentDeletion ? <>
            {children.map(child => <button key={child.playerId} type="button" className="account-row account-link account-delete" onClick={() => setPage({ delete: child })}>{deletionTitle(child)}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>)}
            <button type="button" className="account-row account-link account-delete" onClick={() => setPage({ delete: { kind: 'self' } })}>{deletionTitle({ kind: 'self' })}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
          </> : null : <a className="account-row account-link" href="/support#delete-account">Delete account<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></a>}
        </div>
        <div className="account-list">
          <a className="account-row account-external" href="/privacy">Privacy policy</a>
          <a className="account-row account-external" href="/support">Support</a>
        </div>
      </> : <>
        <div className="account-sheet-bar">
          <button ref={back} type="button" className="account-sheet-back" onClick={() => setPage('root')}><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>Account settings</button>
        </div>
        <h2 id="account-sheet-title" className="account-sheet-title">{title}</h2>
        {/* Like the app's AISharingConsentView, this is the signed-in account's own choice. */}
        {page === 'aiSharing' ? <AISharingControl preview={preview} /> : <GuardianDeletion key={page.delete.kind === 'self' ? 'self' : page.delete.playerId} target={page.delete} />}
      </>}
    </div>
  </div>;
}

type ChildTarget = Extract<DeletionTarget, { kind: 'player' }>;

/** A parent's children as delete targets, named from their profiles; null for every other account. */
function useGuardianChildren(ctx: PortalContext): ChildTarget[] | null {
  const ids = ctx.guardian ? ctx.guardianPlayerIds || [] : null;
  const key = ids?.join(',') ?? null;
  const fallback = (id: string) => (id === ctx.playerId && typeof ctx.athlete?.firstName === 'string' && ctx.athlete.firstName) || 'this player';
  const [named, setNamed] = useState<{ key: string; rows: ChildTarget[] } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    void loadFamilyChildren(db, key ? key.split(',') : []).then(rows => {
      if (alive) setNamed({ key, rows: rows.map(row => ({ kind: 'player', playerId: row.id, name: row.name || 'this player' })) });
    });
    return () => { alive = false; };
  }, [key]);
  if (!ids) return null;
  return named?.key === key ? named.rows : ids.map(id => ({ kind: 'player', playerId: id, name: fallback(id) }));
}
