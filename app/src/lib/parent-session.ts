// Whether the signed-in login is a parent (Parent accounts plan §4.4): it has its own
// `guardians/{uid}` record. Read once per login for the page session and read again after a redeem.
// A denied or missing read is "not a parent" (findGuardian); any other failure is not kept.
import { db } from "./firebase";
import { actingPlayerId } from "./acting-player";
import { findGuardian } from "./identity";
import type { GuardianRecord, IdentityDb } from "./identity";

const records = new Map<string, Promise<GuardianRecord | null>>();
export function forgetParentSessions(): void { records.clear(); }
/** After a redeem the login's record changed (it may have just become a parent): read it again. */
export function forgetParentSession(uid: string | null | undefined): void { if (uid) records.delete(uid); }

export function guardianRecordFor(uid: string, source: IdentityDb = db as unknown as IdentityDb): Promise<GuardianRecord | null> {
  const known = records.get(uid);
  if (known) return known;
  const pending = findGuardian(source, uid);
  records.set(uid, pending);
  pending.catch(() => records.delete(uid));
  return pending;
}

/** How long a social call waits for the guardians read before treating the login as not a parent. */
export const PARENT_CHECK_TIMEOUT_MS = 1500;

/**
 * The guardians record, or null when the read is slow: a slow read never delays an existing
 * player's, coach's or admin's feed. The fallback is not kept; the read itself still completes
 * and is kept for the next check.
 */
export function guardianRecordWithin(uid: string, timeoutMs = PARENT_CHECK_TIMEOUT_MS, source?: IdentityDb): Promise<GuardianRecord | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  return Promise.race([guardianRecordFor(uid, source).catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

/**
 * The social client's test: a login acting for a child, or any login with a guardians record, is a
 * parent session and never calls the social endpoints (social identity is the child's own login).
 * An unreadable or slow record does not block an owner; the server still enforces social access.
 */
export async function isParentSession(uid: string | null | undefined, source?: IdentityDb, timeoutMs = PARENT_CHECK_TIMEOUT_MS): Promise<boolean> {
  if (!uid) return false;
  if (actingPlayerId(uid)) return true;
  return (await guardianRecordWithin(uid, timeoutMs, source)) !== null;
}
