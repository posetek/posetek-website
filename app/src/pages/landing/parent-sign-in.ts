// A sign-in while a parent link is waiting on the page (Parent accounts review findings 1 and 7,
// re-review N1 and N2, final pass D1 to D3).
// - The report's own child login continues exactly as before.
// - A parent continues to the report's child only when the waiting code can no longer add anyone
//   (used, or invalid); an unused or paused code keeps the link, so a sibling is never dropped.
// - A parent, or a login with no profile yet, otherwise returns to "Add to my account".
// - Everything else is a notice the page shows once to that sign-in, after which that sign-in goes
//   on to its normal destination; the link stays for any other account on the same page:
//   the wrong-kind-of-sign-in guidance, a used or invalid code, or paused parent links.
import type { AccountAccess } from "../../lib/account-access";
import { parentLinkAction, parentLinksPaused, unavailableParentInvitation } from "./parent-invitation-link";
import { reportPlayerDestination } from "./report-player-entry";
import type { ReportPlayerEntry } from "./report-player-entry";

/** What validateGuardianInvitation said about the waiting code; "unknown" when it was not asked or failed. */
export type WaitingCodeState = "unused" | "used" | "paused" | "unknown";

export type ParentLinkSignIn =
  | { kind: "continue"; destination: string }
  | { kind: "add" }
  | { kind: "notice"; message: string; guidance: boolean };

export function parentLinkSignIn(entry: ReportPlayerEntry, access: AccountAccess, code: WaitingCodeState): ParentLinkSignIn {
  const role = access.kind === "active" ? access.role : null;
  const keepsLink = role === "parent" && (code === "unused" || code === "paused");
  if (entry.present && access.kind === "active" && !keepsLink) {
    try {
      const destination = reportPlayerDestination(entry, access.role, access.playerId || null, access.playerIds || []);
      if (destination) return { kind: "continue", destination };
    } catch { /* not this report's child: the Parent panel answers */ }
  }
  const action = parentLinkAction(role);
  if (action.kind === "guidance") return { kind: "notice", message: action.message, guidance: true };
  if (code === "paused") return { kind: "notice", message: parentLinksPaused, guidance: false };
  if (code === "used") return { kind: "notice", message: unavailableParentInvitation, guidance: false };
  return { kind: "add" };
}
