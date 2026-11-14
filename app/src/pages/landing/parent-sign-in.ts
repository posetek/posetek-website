// A sign-in while a parent link is waiting on the page (Parent accounts review findings 1 and 7,
// re-review N1 and N2).
// - The report's own child login continues exactly as before.
// - A parent continues to the report's child only when the waiting code can no longer add anyone
//   (used, or invalid); an unused code returns to "Add to my account", so a sibling is never dropped.
// - A parent, or a login with no profile yet, otherwise returns to "Add to my account".
// - Every other account sees the wrong-kind-of-sign-in guidance once, then the page forgets the
//   waiting link so that account reaches its normal destination; it is never trapped.
import type { AccountAccess } from "../../lib/account-access";
import { parentLinkAction } from "./parent-invitation-link";
import { reportPlayerDestination } from "./report-player-entry";
import type { ReportPlayerEntry } from "./report-player-entry";

export type ParentLinkSignIn =
  | { kind: "continue"; destination: string }
  | { kind: "add" }
  | { kind: "guidance"; message: string };

export function parentLinkSignIn(entry: ReportPlayerEntry, access: AccountAccess, codeUnused: boolean): ParentLinkSignIn {
  const role = access.kind === "active" ? access.role : null;
  if (entry.present && access.kind === "active" && !(role === "parent" && codeUnused)) {
    try {
      const destination = reportPlayerDestination(entry, access.role, access.playerId || null, access.playerIds || []);
      if (destination) return { kind: "continue", destination };
    } catch { /* not this report's child: the Parent panel answers */ }
  }
  const action = parentLinkAction(role);
  return action.kind === "add" ? { kind: "add" } : { kind: "guidance", message: action.message };
}
