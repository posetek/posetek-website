import type { AccountRole } from "./account-entry";
import type { AccessUser, AccountAccess } from "../../lib/account-access";

export type ReportPlayerEntry = { present: boolean; playerId: string | null };
export class ReportPlayerEntryError extends Error {}
const playerIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
export const reportPlayerAccountError = "Use this player's login to open their workouts. If you are signed in to a different player or a staff account, choose Use a different account.";

// A report marker is a requested destination, never proof of identity or access.
export function readReportPlayerEntry(search: string): ReportPlayerEntry {
  const values = new URLSearchParams(search).getAll("reportPlayer");
  return { present: values.length > 0, playerId: values.length === 1 && playerIdPattern.test(values[0]) ? values[0] : null };
}

export function reportTrainingPath(playerId: string): string {
  if (!playerIdPattern.test(playerId)) throw new ReportPlayerEntryError("Reopen the original report link to continue.");
  return `/athlete?player=${encodeURIComponent(playerId)}&view=training`;
}

// Ignores generic returnTo completely for report entry. Only the authenticated,
// server-resolved player matching the requested child can continue.
export function reportPlayerDestination(entry: ReportPlayerEntry, role: AccountRole | null, playerId: string | null): string | null {
  if (!entry.present) return null;
  if (!entry.playerId) throw new ReportPlayerEntryError("Reopen the original report link to continue.");
  if (role !== "player" || playerId !== entry.playerId) throw new ReportPlayerEntryError(reportPlayerAccountError);
  return reportTrainingPath(entry.playerId);
}

export function reportSignupDestination(entry: ReportPlayerEntry, redeemedPlayerId: string): string | null {
  if (!entry.present) return null;
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
