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
  /** Sibling suggestions awaiting one confirm before the link is made. */
  choosing: { kind: ParentCopyKind; candidates: SiblingCandidate[] } | null;
  /** The parent whose removal is awaiting confirmation. */
  confirmingRemove: string | null;
  message: string;
  error: boolean;
}
/** True once a read confirmed at least one linked parent; unknown or failed reads are never "linked". */
export function hasLinkedParent(view: ParentLinksView | undefined): boolean {
  return !!view?.data && view.data.guardians.length > 0;
}

export function parentLinksReadError(error: unknown): string {
  const message = guardianLinkError(error);
  return message.startsWith("You do not have permission") || message.startsWith("Sign in again") ? message : "Parent links could not be checked.";
}
export const loadingParentLinks = (): ParentLinksView => ({ data: null, names: {}, pending: "loading", choosing: null, confirmingRemove: null, message: "", error: false });

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
  let view = loadingParentLinks(), generation = 0, alive = true;
  const current = (ticket: number) => alive && generation === ticket && port.isCurrent();
  const set = (next: Partial<ParentLinksView>) => { view = { ...view, ...next }; publish(view); };
  const fail = (ticket: number, error: unknown, keep = true) => {
    if (current(ticket)) set({ ...(keep ? {} : { data: null, names: {} }), pending: null, choosing: null, confirmingRemove: null, message: guardianLinkError(error), error: true });
  };
  async function fresh(ticket: number): Promise<PlayerGuardians | null> {
    const data = await port.read(playerId);
    if (!current(ticket)) return null;
    const others = [...new Set(data.guardians.flatMap(guardian => guardian.playerIds))].filter(id => id !== playerId);
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
    set({ data: view.data && { ...view.data, invitation } });
    try {
      await port.copy(kind === "link" ? invitation.signupUrl : invitation.code);
      if (current(ticket)) set({ pending: null, choosing: null, message: kind === "link" ? "Parent link copied." : "Parent code copied.", error: false });
    } catch {
      if (current(ticket)) set({ pending: null, choosing: null, message: "Couldn’t copy. Try again.", error: true });
    }
  }
  return {
    async load() {
      if (!alive || !port.isCurrent()) return;
      const ticket = ++generation;
      set({ pending: "loading", message: "", error: false, choosing: null, confirmingRemove: null });
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
      set({ pending: "copying", message: "", error: false, choosing: null, confirmingRemove: null });
      let data: PlayerGuardians | null;
      try { data = await fresh(ticket); }
      catch (error) { if (current(ticket)) set({ data: null, names: {}, pending: null, message: parentLinksReadError(error), error: true }); return; }
      if (!data) return;
      if (!data.issuingEnabled) { set({ pending: null }); return; }
      if (data.siblingCandidates.length) { set({ pending: null, choosing: { kind, candidates: data.siblingCandidates } }); return; }
      // Copying again gives the same open link.
      const open = data.invitation?.playerIds.includes(playerId) ? data.invitation.playerIds : [playerId];
      await deliver(ticket, kind, open);
    },
    /** The confirm after sibling suggestions: the link carries this player and the chosen siblings. */
    async confirmCopy(selected: string[]) {
      const choosing = view.choosing;
      if (!alive || !port.isCurrent() || !choosing || view.pending !== null) return;
      const allowed = new Set(choosing.candidates.map(candidate => candidate.playerId));
      const ticket = ++generation;
      set({ pending: "copying", message: "", error: false });
      await deliver(ticket, choosing.kind, [playerId, ...selected.filter(id => allowed.has(id))]);
    },
    cancel() { if (alive) set({ choosing: null, confirmingRemove: null }); },
    askRemove(guardianUid: string) { if (alive && view.pending === null) set({ confirmingRemove: guardianUid, choosing: null, message: "", error: false }); },
    async remove(guardianUid: string) {
      if (!alive || !port.isCurrent() || view.pending !== null || view.confirmingRemove !== guardianUid) return;
      const ticket = ++generation;
      set({ pending: "removing", confirmingRemove: null, message: "", error: false });
      try {
        await port.remove(playerId, guardianUid);
        if (!current(ticket)) return;
        // The removal shows on the next read, which is the server's answer, not a local edit.
        if (await fresh(ticket)) set({ pending: null, message: "Parent removed.", error: false });
      } catch (error) { fail(ticket, error); }
    },
    async revoke(invitationId: string) {
      if (!alive || !port.isCurrent() || view.pending !== null) return;
      const ticket = ++generation;
      set({ pending: "revoking", message: "", error: false, choosing: null, confirmingRemove: null });
      try {
        await port.revoke(invitationId);
        if (!current(ticket)) return;
        if (await fresh(ticket)) set({ pending: null, message: "Parent link revoked.", error: false });
      } catch (error) { fail(ticket, error); }
    },
    dispose() { alive = false; ++generation; view = loadingParentLinks(); },
  };
}
