import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth, db } from "../../../lib/firebase";
import { clubCall } from "../../../lib/organization-data";
import { ensureGuardianInvitation, getPlayerGuardians, parentViewPath, removePlayerGuardian, revokeGuardianInvitation } from "../../../lib/guardians";
import { loadFamilyChildren } from "../../family/family";
import { invitationController, loadingInvitation } from "../lib/invitation";
import type { InvitationView } from "../lib/invitation";
import { loadingParentLinks, parentLinksController, showsParentLinked } from "../lib/parent-links";
import type { ParentCopyKind, ParentLinksView } from "../lib/parent-links";
import "./parent-links.scss";

interface SignupProps {
  playerId: string;
  playerName: string;
  registered?: boolean;
  /** Parent roster replacement/refresh invalidates the fetched invitation. */
  reloadKey?: unknown;
  variant?: "admin" | "club";
  disabled?: boolean;
  /** False where the host already says the account is claimed (Monitor accounts). */
  showClaimed?: boolean;
  /**
   * Whether the roster data the host already has says a parent is linked (`guardianUIDs` on a
   * player document, or `parentLinked` on a report row; see `parentLinkedFrom`). Undefined when
   * neither is present, which keeps today's status.
   */
  parentLinked?: boolean;
}

/** Display only: the preview page and the callables check admin access themselves. */
function signedInAdmin(): boolean {
  const user = auth.currentUser;
  return !!user?.emailVerified && /^[a-z0-9._%+-]+@posetek\.net$/i.test(user.email || "");
}

export default function SignupStatus({ playerId, playerName, registered = false, reloadKey, variant = "admin", disabled = false, showClaimed = true, parentLinked }: SignupProps) {
  const [result, setResult] = useState<{ playerId: string; uid: string | null; reloadKey: unknown; view: InvitationView } | null>(null);
  const [parents, setParents] = useState<{ playerId: string; uid: string | null; reloadKey: unknown; view: ParentLinksView } | null>(null);
  // Parent links load only when the staff member opens this row's Parents disclosure.
  const [parentsOpen, setParentsOpen] = useState(false);
  const controller = useRef<ReturnType<typeof invitationController> | null>(null);
  const parentController = useRef<ReturnType<typeof parentLinksController> | null>(null);
  useEffect(() => {
    const stop = auth.onAuthStateChanged(user => {
      controller.current?.dispose(); controller.current = null;
      parentController.current?.dispose(); parentController.current = null;
      const uid = user?.uid ?? null;
      setResult(null); setParents(null); setParentsOpen(false);
      if (!uid) {
        setResult({ playerId, uid, reloadKey, view: { invitation: null, pending: null, message: "Sign in again to manage this player’s invitation.", error: true } });
        return;
      }
      if (registered) return;
      const instance = invitationController(playerId, {
        read: id => clubCall("getPlayerSignupInvitation", { playerId: id }),
        ensure: id => clubCall("ensurePlayerSignupInvitation", { playerId: id }),
        copy: text => navigator.clipboard.writeText(text),
        isCurrent: () => auth.currentUser?.uid === uid,
      }, view => setResult({ playerId, uid, reloadKey, view }));
      controller.current = instance;
      void instance.load();
    });
    return () => { stop(); controller.current?.dispose(); controller.current = null; parentController.current?.dispose(); parentController.current = null; };
  }, [playerId, registered, reloadKey]);
  const openParents = () => {
    setParentsOpen(true);
    const uid = auth.currentUser?.uid;
    if (!uid || parentController.current) return;
    const links = parentLinksController(playerId, {
      read: id => getPlayerGuardians(id), ensure: ids => ensureGuardianInvitation(ids), revoke: id => revokeGuardianInvitation(id), remove: (id, guardianUid) => removePlayerGuardian(id, guardianUid),
      copy: text => navigator.clipboard.writeText(text),
      names: async ids => Object.fromEntries((await loadFamilyChildren(db, ids)).filter(row => row.name).map(row => [row.id, row.name as string])),
      isCurrent: () => auth.currentUser?.uid === uid,
    }, view => setParents({ playerId, uid, reloadKey, view }));
    parentController.current = links;
    void links.load();
  };
  const uid = auth.currentUser?.uid ?? null;
  const matches = result?.playerId === playerId && result.uid === uid && result.reloadKey === reloadKey;
  const view = registered ? { invitation: { status: "claimed" as const, playerId }, pending: null, message: "", error: false }
    : matches ? result.view : loadingInvitation();
  const parentView = parents?.playerId === playerId && parents.uid === uid && parents.reloadKey === reloadKey ? parents.view : loadingParentLinks();
  const links = parentController.current;
  return <SignupInvitationControls playerName={playerName} view={view} variant={variant} disabled={disabled} showClaimed={showClaimed}
    onGenerate={() => void controller.current?.generate()} onRetry={() => void controller.current?.load()}
    onCopy={kind => void controller.current?.copy(kind)}
    parents={{ playerId, view: parentView, admin: signedInAdmin(), open: parentsOpen, parentLinked, onToggle: () => parentsOpen ? setParentsOpen(false) : openParents(), actions: {
      retry: () => void links?.load(), copy: kind => void links?.copy(kind), confirmCopy: ids => void links?.confirmCopy(ids), cancel: () => links?.cancel(),
      askRemove: guardianUid => links?.askRemove(guardianUid), remove: guardianUid => void links?.remove(guardianUid),
      askRevoke: id => links?.askRevoke(id), revoke: id => void links?.revoke(id),
    } }} />;
}

export interface ParentLinkActions {
  retry(): void; copy(kind: ParentCopyKind): void; confirmCopy(playerIds: string[]): void; cancel(): void;
  askRemove(guardianUid: string): void; remove(guardianUid: string): void; askRevoke(invitationId: string): void; revoke(invitationId: string): void;
}
export interface ParentLinksProps {
  playerId: string; view: ParentLinksView; admin: boolean; actions: ParentLinkActions;
  /** The Parents disclosure; parent links are read only once it is opened. */
  open: boolean; onToggle(): void;
  /** Linked status from the host's roster data, used until a read of this row's parent links. */
  parentLinked?: boolean;
}

/** The same compact actions serve roster rows and the organization invitation card. */
export function SignupInvitationControls({ playerName, view, variant = "admin", disabled = false, showClaimed = true, onGenerate, onRetry, onCopy, parents }: {
  playerName: string; view: InvitationView; variant?: "admin" | "club"; disabled?: boolean; showClaimed?: boolean;
  onGenerate: () => void; onRetry: () => void; onCopy: (kind: "link" | "code") => void;
  /** Parent links for this player (§4.8). Hosts that omit it render exactly as before. */
  parents?: ParentLinksProps;
}) {
  const invitation = view.invitation;
  const buttonClass = variant === "admin" ? "quiet-button small admin-copy-code" : "quiet-button small";
  const parentLinked = !!parents && showsParentLinked(parents.view, parents.parentLinked);
  return <div className={variant === "admin" ? "admin-signup" : "club-player-invitation"}>
    {invitation?.status === "claimed" ? showClaimed && <span className="admin-code-unavailable">Account already claimed. The player can sign in with their existing account.</span> : <>
      {variant === "admin" && (parentLinked ? <span className="admin-chip">Parent linked</span> : <span className="admin-chip warn">Awaiting signup</span>)}
      {variant === "club" && parentLinked && <span className="admin-parent-status">Parent linked</span>}
      {view.pending === "loading" && <span className="admin-code-unavailable" role="status">Checking invitation…</span>}
      {view.pending === "generating" && <span className="admin-code-unavailable" role="status">Generating code…</span>}
      {invitation?.status === "missing" && <button className={buttonClass} type="button" disabled={disabled || view.pending !== null} aria-label={`Generate signup code for ${playerName}`} onClick={onGenerate}>Generate code</button>}
      {invitation?.status === "ready" && <>
        <code className="admin-signup-code" data-clarity-mask="true" aria-label={`Signup code for ${playerName}`}>{invitation.code}</code>
        <button className={buttonClass} type="button" aria-label={`Copy signup link for ${playerName}`} disabled={disabled || view.pending !== null} onClick={() => onCopy("link")}>Copy signup link</button>
        <button className={buttonClass} type="button" aria-label={`Copy signup code for ${playerName}`} disabled={disabled || view.pending !== null} onClick={() => onCopy("code")}>Copy code</button>
      </>}
      {!invitation && view.error && <button className={buttonClass} type="button" disabled={disabled || view.pending !== null} onClick={onRetry}>Retry invitation</button>}
    </>}
    {view.message && <span className={view.error ? "admin-copy-error" : "admin-code-unavailable"} role="status">{view.message}</span>}
    {parents && <button className={buttonClass} type="button" aria-expanded={parents.open} aria-label={`Parents for ${playerName}`} onClick={parents.onToggle}>Parents</button>}
    {parents?.open && <ParentLinks {...parents} playerName={playerName} buttonClass={buttonClass} disabled={disabled} />}
  </div>;
}

const linkedDate = (millis: number | null) => millis === null ? null : new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function ParentLinks({ playerId, view, admin, actions, playerName, buttonClass, disabled }: ParentLinksProps & { playerName: string; buttonClass: string; disabled: boolean }) {
  const busy = disabled || view.pending !== null;
  const data = view.data;
  const confirming = data?.guardians.find(guardian => guardian.uid === view.confirmingRemove);
  const nameOf = (id: string) => id === playerId ? playerName : view.names[id] || "another player";
  const pendingNames = data?.invitation ? data.invitation.playerIds.map(nameOf).join(", ") : "";
  // Parent codes and emails never enter session replay.
  return <div className="admin-parent-links" data-clarity-mask="true">
    {view.pending === "loading" && <span className="admin-code-unavailable" role="status">Checking parent links…</span>}
    {!data && view.error && <button className={buttonClass} type="button" disabled={busy} onClick={actions.retry}>Retry parent links</button>}
    {data && data.guardians.length > 0 && <div className="admin-parent-list"><span className="admin-parent-label">Parents</span>
      {data.guardians.map(guardian => {
        const others = guardian.playerIds.filter(id => id !== playerId).map(nameOf);
        const email = guardian.email || "Parent";
        return <span className="admin-parent" key={guardian.uid}>
          <span>{email}{linkedDate(guardian.linkedAtMillis) ? ` · linked ${linkedDate(guardian.linkedAtMillis)}` : ""}{others.length ? ` · also linked to ${others.join(", ")}` : ""}</span>
          {admin && <Link className={buttonClass} to={parentViewPath(guardian.uid, playerId)}>Parent view</Link>}
          <button className={buttonClass} type="button" disabled={busy} aria-label={`Remove ${email} as a parent of ${playerName}`} onClick={() => actions.askRemove(guardian.uid)}>Remove</button>
        </span>;
      })}
    </div>}
    {confirming && <span className="admin-parent-confirm" role="group" aria-label="Confirm removal">
      <span>Remove {confirming.email || "this parent"}? They lose access to {playerName} at once.</span>
      <button className={buttonClass} type="button" disabled={busy} onClick={() => actions.remove(confirming.uid)}>Remove</button>
      <button className={buttonClass} type="button" onClick={actions.cancel}>Cancel</button>
    </span>}
    {data?.invitation && <span className="admin-parent">
      <span>Parent link pending · {pendingNames}</span>
      <button className={buttonClass} type="button" disabled={busy} aria-label={`Revoke the parent link for ${playerName}`} onClick={() => actions.askRevoke(data.invitation!.invitationId)}>Revoke</button>
    </span>}
    {data?.invitation && view.confirmingRevoke === data.invitation.invitationId && <span className="admin-parent-confirm" role="group" aria-label="Confirm revoking">
      <span>Revoke the parent link for {pendingNames}? It stops working at once.</span>
      <button className={buttonClass} type="button" disabled={busy} onClick={() => actions.revoke(data.invitation!.invitationId)}>Revoke</button>
      <button className={buttonClass} type="button" onClick={actions.cancel}>Cancel</button>
    </span>}
    {data?.issuingEnabled && !view.choosing && <>
      <button className={buttonClass} type="button" disabled={busy} aria-label={`Copy parent link for ${playerName}`} onClick={() => actions.copy("link")}>Copy parent link</button>
      <button className={buttonClass} type="button" disabled={busy} aria-label={`Copy parent code for ${playerName}`} onClick={() => actions.copy("code")}>Copy parent code</button>
    </>}
    {/* Keyed by the chooser's epoch: every opening starts with nothing ticked. */}
    {view.choosing && <SiblingChooser key={view.choosing.epoch} choosing={view.choosing} nameOf={nameOf} buttonClass={buttonClass} busy={busy} actions={actions} />}
    {view.message && <span className={view.error ? "admin-copy-error" : "admin-code-unavailable"} role="status">{view.message}</span>}
  </div>;
}

function SiblingChooser({ choosing, nameOf, buttonClass, busy, actions }: { choosing: NonNullable<ParentLinksView["choosing"]>; nameOf: (id: string) => string; buttonClass: string; busy: boolean; actions: ParentLinkActions }) {
  const [chosen, setChosen] = useState<string[]>([]);
  return <fieldset className="admin-parent-siblings">
    <legend>Add siblings to this link?</legend>
    {choosing.fixed.map(id => <label key={id}><input type="checkbox" checked disabled />{nameOf(id)}</label>)}
    {choosing.candidates.map(candidate => <label key={candidate.playerId}><input type="checkbox" checked={chosen.includes(candidate.playerId)}
      onChange={event => setChosen(old => event.target.checked ? [...old, candidate.playerId] : old.filter(id => id !== candidate.playerId))} />{`${candidate.firstName} ${candidate.lastName}`.trim()}</label>)}
    <button className={buttonClass} type="button" disabled={busy} onClick={() => actions.confirmCopy(chosen)}>{choosing.kind === "link" ? "Copy parent link" : "Copy parent code"}</button>
    <button className={buttonClass} type="button" onClick={actions.cancel}>Cancel</button>
  </fieldset>;
}
