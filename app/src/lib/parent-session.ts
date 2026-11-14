// Whether the signed-in login is a parent (Parent accounts plan §4.4): it has its own
// `guardians/{uid}` record. Read once per login for the page session. A denied or missing read is
// "not a parent" (findGuardian); any other failure is not kept, so a later check retries.
import { db } from "./firebase";
import { actingPlayerId } from "./acting-player";
import { findGuardian } from "./identity";
import type { GuardianRecord, IdentityDb } from "./identity";

const records = new Map<string, Promise<GuardianRecord | null>>();
export function forgetParentSessions(): void { records.clear(); }

export function guardianRecordFor(uid: string, source: IdentityDb = db as unknown as IdentityDb): Promise<GuardianRecord | null> {
  const known = records.get(uid);
  if (known) return known;
  const pending = findGuardian(source, uid);
  records.set(uid, pending);
  pending.catch(() => records.delete(uid));
  return pending;
}

/**
 * The social client's test: a login acting for a child, or any login with a guardians record, is a
 * parent session and never calls the social endpoints (social identity is the child's own login).
 * An unreadable record does not block an owner; the server still enforces social access.
 */
export async function isParentSession(uid: string | null | undefined, source?: IdentityDb): Promise<boolean> {
  if (!uid) return false;
  if (actingPlayerId(uid)) return true;
  try { return (await guardianRecordFor(uid, source)) !== null; } catch { return false; }
}
