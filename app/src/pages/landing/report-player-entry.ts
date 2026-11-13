import type { AccountRole } from "./account-entry";
import type { AccessUser, AccountAccess } from "../../lib/account-access";
import { playerStatsRoute } from "./landing-helpers";

export type ReportPlayerEntry =
  | { present: true; playerId: string; view: "training" | "stats" }
  | { present: boolean; playerId: null; view: null };
export class ReportPlayerEntryError extends Error {}
const playerIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
export const invalidReportEntry = "Reopen the original report link to continue.";
export const reportStatsSignIn = "Sign in with this player's existing login to open their Stats.";

// A report marker is a requested destination, never proof of identity or access.
export function readReportPlayerEntry(search: string): ReportPlayerEntry {
  const params = new URLSearchParams(search);
  const players = params.getAll("reportPlayer");
  const views = params.getAll("reportView");
  if (players.length === 1 && playerIdPattern.test(players[0])) {
    if (views.length === 0) return { present: true, playerId: players[0], view: "training" };
    if (views.length === 1 && views[0] === "stats") return { present: true, playerId: players[0], view: "stats" };
  }
  return { present: players.length > 0 || views.length > 0, playerId: null, view: null };
}

export function reportPlayerSignupError(entry: ReportPlayerEntry): string | null {
  if (!entry.present) return null;
  if (entry.view === "stats") return reportStatsSignIn;
  return entry.playerId ? null : invalidReportEntry;
}

export function reportTrainingPath(playerId: string): string {
  if (!playerIdPattern.test(playerId)) throw new ReportPlayerEntryError(invalidReportEntry);
  return `/athlete?player=${encodeURIComponent(playerId)}&userType=player&view=training`;
}

// Ignores generic returnTo completely for report entry. Only the authenticated,
// server-resolved player matching the requested child can continue.
export function reportPlayerDestination(entry: ReportPlayerEntry, role: AccountRole | null, playerId: string | null): string | null {
  if (!entry.present) return null;
  if (!entry.playerId) throw new ReportPlayerEntryError(invalidReportEntry);
  if (role !== "player" || playerId !== entry.playerId) {
    const destination = entry.view === "stats" ? "Stats" : "their workouts";
    throw new ReportPlayerEntryError(`Use this player's login to open ${destination}. If you are signed in to a different player or a staff account, choose Use a different account.`);
  }
  return entry.view === "stats" ? playerStatsRoute(entry.playerId) : reportTrainingPath(entry.playerId);
}

export function reportSignupDestination(entry: ReportPlayerEntry, redeemedPlayerId: string): string | null {
  if (!entry.present) return null;
  if (entry.view === "stats") throw new ReportPlayerEntryError(reportStatsSignIn);
  if (!entry.playerId || redeemedPlayerId !== entry.playerId) {
    throw new ReportPlayerEntryError("Your account was created, but it does not match this report. Keep your login and contact PoseTek before continuing.");
  }
  return reportTrainingPath(redeemedPlayerId);
}

/** Initial restored sessions can enter only after canonical exact-player resolution. */
export async function initialReportPlayerDestination(
  entry: ReportPlayerEntry,
  user: AccessUser | null,
  load: (user: AccessUser, isCurrent: () => boolean) => Promise<AccountAccess>,
  isCurrent: () => boolean,
): Promise<string | null> {
  if (!entry.present || !user || !isCurrent()) return null;
  const access = await load(user, isCurrent);
  if (!isCurrent()) return null;
  return reportPlayerDestination(entry, access.kind === "active" ? access.role : null, access.kind === "active" ? access.playerId || null : null);
}
