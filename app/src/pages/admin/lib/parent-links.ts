// Parent links for one player, behind the shared signup control (Parent accounts plan §4.8). Mirrors
// the player invitation controller: every action re-reads first, a late response is ignored after
// disposal or an account change, and a read failure is shown as an error, never as "no parents".
import { guardianLinkError } from "../../../lib/guardians";
import type { GuardianInvitation, PlayerGuardians, SiblingCandidate } from "../../../lib/guardians";

export type ParentCopyKind = "link" | "code";
export interface ParentLinksView {
  data: PlayerGuardians | null;
  /** Names of the other children a listed parent is linked to, for "also linked to". */
  names: Record<string, string>;
  pending: "loading" | "copying" | "removing" | "revoking" | null;
  /**
   * Sibling suggestions awaiting one confirm before the link is made. `fixed` are the children the
   * link carries regardless (this player and any already on the open link); `epoch` changes every
   * time the chooser opens, so earlier ticks never come back.
   */
  choosing: { kind: ParentCopyKind; candidates: SiblingCandidate[]; fixed: string[]; epoch: number } | null;
  /** The parent whose removal is awaiting confirmation. */
  confirmingRemove: string | null;
  /** The open link whose revocation is awaiting confirmation. */
  confirmingRevoke: string | null;
  message: string;
  error: boolean;
}
/** True once a read confirmed at least one linked parent; unknown or failed reads are never "linked". */
export function hasLinkedParent(view: ParentLinksView | undefined): boolean {
  return !!view?.data && view.data.guardians.length > 0;
}

/** "Parent linked" from a read when this row has one, else from the host's roster data. */
export function showsParentLinked(view: ParentLinksView, rosterHint: boolean | undefined): boolean {
  return view.data ? hasLinkedParent(view) : rosterHint === true;
}

export function parentLinksReadError(error: unknown): string {
  const message = guardianLinkError(error);
  return message.startsWith("You do not have permission") || message.startsWith("Sign in again") ? message : "Parent links could not be checked.";
}
export const loadingParentLinks = (): ParentLinksView => ({ data: null, names: {}, pending: "loading", choosing: null, confirmingRemove: null, confirmingRevoke: null, message: "", error: false });
const closed = { choosing: null, confirmingRemove: null, confirmingRevoke: null } as const;
/** Parents opened while signed out: the existing sign-in-again message, never an endless check. */
export const signedOutParentLinks = (): ParentLinksView => ({ ...loadingParentLinks(), pending: null, message: guardianLinkError({ code: "unauthenticated" }), error: true });

/** The children a copied link carries before any sibling is ticked: the open link's, else this player. */
export function baseLinkPlayers(playerId: string, data: PlayerGuardians): string[] {
  return data.invitation?.playerIds.includes(playerId) ? data.invitation.playerIds : [playerId];
}

export interface ParentLinksPort {
  read(playerId: string): Promise<PlayerGuardians>;
  ensure(playerIds: string[]): Promise<GuardianInvitation>;
  revoke(invitationId: string): Promise<boolean>;
  remove(playerId: string, guardianUid: string): Promise<boolean>;
  copy(text: string): Promise<void>;
  names(playerIds: string[]): Promise<Record<string, string>>;
  isCurrent(): boolean;
}

export function parentLinksController(playerId: string, port: ParentLinksPort, publish: (view: ParentLinksView) => void) {
  let view = loadingParentLinks(), generation = 0, alive = true, epoch = 0;
  const current = (ticket: number) => alive && generation === ticket && port.isCurrent();
  const set = (next: Partial<ParentLinksView>) => { view = { ...view, ...next }; publish(view); };
  const fail = (ticket: number, error: unknown, keep = true) => {
    if (current(ticket)) set({ ...(keep ? {} : { data: null, names: {} }), pending: null, ...closed, message: guardianLinkError(error), error: true });
  };
  async function fresh(ticket: number): Promise<PlayerGuardians | null> {
    const data = await port.read(playerId);
    if (!current(ticket)) return null;
    const others = [...new Set([...data.guardians.flatMap(guardian => guardian.playerIds), ...data.invitations.flatMap(entry => entry.playerIds)])].filter(id => id !== playerId);
    let names: Record<string, string> = {};
    if (others.length) try { names = await port.names(others); } catch { /* names are optional */ }
    if (!current(ticket)) return null;
    set({ data, names });
    return data;
  }
  async function deliver(ticket: number, kind: ParentCopyKind, playerIds: string[]) {
    let invitation: GuardianInvitation;
    try { invitation = await port.ensure(playerIds); } catch (error) { fail(ticket, error); return; }
    if (!current(ticket)) return;
    set({ data: view.data && { ...view.data, invitation, invitations: [invitation, ...view.data.invitations.filter(entry => entry.invitationId !== invitation.invitationId)] } });
    try {
      await port.copy(kind === "link" ? invitation.signupUrl : invitation.code);
      if (current(ticket)) set({ pending: null, ...closed, message: kind === "link" ? "Parent link copied." : "Parent code copied.", error: false });
    } catch {
      if (current(ticket)) set({ pending: null, ...closed, message: "Couldn’t copy. Try again.", error: true });
    }
  }
  /** Runs a confirmed change, then shows the server's next read; the success line only on `true`. */
  async function change(pending: "removing" | "revoking", run: () => Promise<boolean>, success: string) {
    const ticket = ++generation;
    set({ pending, ...closed, message: "", error: false });
    try {
      const done = await run();
      if (!current(ticket)) return;
      if (await fresh(ticket)) set({ pending: null, message: done ? success : "", error: false });
    } catch (error) { fail(ticket, error); }
  }
  return {
    async load() {
      if (!alive || !port.isCurrent()) return;
      const ticket = ++generation;
      set({ pending: "loading", message: "", error: false, ...closed });
      try { if (await fresh(ticket)) set({ pending: null }); }
      catch (error) {
        // A failed read is shown as unknown, never as "no parents".
        if (current(ticket)) set({ data: null, names: {}, pending: null, message: parentLinksReadError(error), error: true });
      }
    },
    /** Re-reads, then asks about siblings if there are any, else copies straight away. */
    async copy(kind: ParentCopyKind) {
      if (!alive || !port.isCurrent() || view.pending !== null || !view.data?.issuingEnabled) return;
      const ticket = ++generation;
      set({ pending: "copying", message: "", error: false, ...closed });
      let data: PlayerGuardians | null;
      try { data = await fresh(ticket); }
      catch (error) { if (current(ticket)) set({ data: null, names: {}, pending: null, message: parentLinksReadError(error), error: true }); return; }
      if (!data) return;
      if (!data.issuingEnabled) { set({ pending: null }); return; }
      const base = baseLinkPlayers(playerId, data);
      const candidates = data.siblingCandidates.filter(candidate => !base.includes(candidate.playerId));
      if (candidates.length) { set({ pending: null, choosing: { kind, candidates, fixed: base, epoch: ++epoch } }); return; }
      // Copying again gives the same open link.
      await deliver(ticket, kind, base);
    },
    /** The confirm after sibling suggestions: the open link's children plus the ticked siblings. */
    async confirmCopy(selected: string[]) {
      const choosing = view.choosing;
      if (!alive || !port.isCurrent() || !choosing || view.pending !== null) return;
      const allowed = new Set(choosing.candidates.map(candidate => candidate.playerId));
      const ticket = ++generation;
      set({ pending: "copying", message: "", error: false });
      await deliver(ticket, choosing.kind, [...new Set([...choosing.fixed, ...selected.filter(id => allowed.has(id))])]);
    },
    cancel() { if (alive) set({ ...closed }); },
    askRemove(guardianUid: string) { if (alive && view.pending === null) set({ ...closed, confirmingRemove: guardianUid, message: "", error: false }); },
    askRevoke(invitationId: string) { if (alive && view.pending === null) set({ ...closed, confirmingRevoke: invitationId, message: "", error: false }); },
    async remove(guardianUid: string) {
      if (!alive || !port.isCurrent() || view.pending !== null || view.confirmingRemove !== guardianUid) return;
      // The removal shows on the next read, which is the server's answer, not a local edit.
      await change("removing", () => port.remove(playerId, guardianUid), "Parent removed.");
    },
    async revoke(invitationId: string) {
      if (!alive || !port.isCurrent() || view.pending !== null || view.confirmingRevoke !== invitationId) return;
      await change("revoking", () => port.revoke(invitationId), "Parent link revoked.");
    },
    dispose() { alive = false; ++generation; view = loadingParentLinks(); },
  };
}
