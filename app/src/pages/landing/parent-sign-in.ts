// A sign-in while a parent link is waiting on the page (Parent accounts review findings 1 and 7).
// A report's own child login, or a parent already linked to that child, continues exactly as
// before; anyone else returns to the Parent panel: "Add to my account" for a parent or a login with
// no profile yet, and the wrong-kind-of-sign-in guidance for every other account.
import type { AccountAccess } from "../../lib/account-access";
import { parentLinkAction } from "./parent-invitation-link";
import type { ParentLinkAction } from "./parent-invitation-link";
import { reportPlayerDestination } from "./report-player-entry";
import type { ReportPlayerEntry } from "./report-player-entry";

export type ParentLinkSignIn = { kind: "continue"; destination: string } | { kind: "panel"; action: ParentLinkAction };

export function parentLinkSignIn(entry: ReportPlayerEntry, access: AccountAccess): ParentLinkSignIn {
  if (entry.present && access.kind === "active") {
    try {
      const destination = reportPlayerDestination(entry, access.role, access.playerId || null, access.playerIds || []);
      if (destination) return { kind: "continue", destination };
    } catch { /* not this report's child: the Parent panel answers */ }
  }
  return { kind: "panel", action: parentLinkAction(access.kind === "active" ? access.role : null) };
}
