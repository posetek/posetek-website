import { getSafeReturnToUrl, playerStatsRoute, playerWorkspaceRoute } from "./landing-helpers";

export type AccountRole = "admin" | "manager" | "coach" | "independent" | "player" | "parent" | "pending";

/** The parent's picker. */
export const FAMILY_PATH = "/family";

/**
 * One child opens that child's Stats; none or several open the picker. A parent always lands on
 * Stats, while the child's own sign-in names no tab (the workspace default: Stats first, then Workouts).
 */
export function familyDestination(playerIds: readonly string[]): string {
  return playerIds.length === 1 ? playerStatsRoute(playerIds[0]) : FAMILY_PATH;
}

/** Routing is a convenience. Destination pages and server membership checks still enforce access. */
export function accountDestination(role: AccountRole, playerId: string | null, search: string, base: string, origin: string, playerIds: readonly string[] = []): string {
  const home = role === "admin" ? "/admin" : role === "manager" ? "/organization"
    : role === "coach" || role === "independent" ? "/insights" : role === "player" && playerId ? playerWorkspaceRoute(playerId)
    : role === "parent" ? familyDestination(playerIds) : "/join";
  const target = getSafeReturnToUrl(search, base, origin);
  if (!target) return home;
  const path = new URL(target).pathname;
  if ((role === "player" || role === "parent") && ["/feed", "/feed.html"].includes(path)) return home;
  if (role === "parent" && path === "/join") return home;
  if (path === FAMILY_PATH && role !== "parent") return home;
  const staff = role === "admin" || role === "manager" || role === "coach" || role === "independent";
  if (path === "/admin" || path.startsWith("/admin/")) return role === "admin" ? target : home;
  if (role === "pending") return path === "/join" ? target : home;
  if (["/insights", "/organization", "/roster"].includes(path) || path.endsWith("/coachesview.html")) {
    return staff ? target : home;
  }
  return target;
}

/**
 * The profile write a password sign-in makes. A parent has no profile of its own, so it never
 * touches the child's `lastLogin`, which belongs to the child's own login.
 */
export function signInProfileWrite(role: AccountRole, playerId: string | null): "admin" | "coach" | "player" | null {
  if (role === "admin") return "admin";
  if (role === "independent") return "coach";
  if (role === "player" && playerId) return "player";
  return null;
}

export function authErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code).split("/").pop() || "" : "";
}

export function accountError(error: unknown, fallback = "We could not complete this request. Please try again."): string {
  switch (authErrorCode(error)) {
    case "email-already-in-use": return "This email already has an account. Sign in with it or reset your password.";
    case "invalid-credential": case "wrong-password": case "user-not-found": return "We could not sign you in. Check your email and password, or reset your password.";
    case "invalid-email": return "Enter a valid email address.";
    case "weak-password": return "Choose a password with at least 6 characters.";
    case "too-many-requests": case "resource-exhausted": return "Too many attempts. Wait a little, then try again.";
    case "network-request-failed": case "unavailable": case "deadline-exceeded": return "The connection was interrupted. Check your connection and try again.";
    case "user-disabled": return "This account is disabled. Contact PoseTek for help.";
    default: return fallback;
  }
}
