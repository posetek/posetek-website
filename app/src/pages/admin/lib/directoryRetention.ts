import { auth } from "../../../lib/firebase";
import { invalidateClubContext, subscribeClubContextInvalidation } from "../../../lib/organization-data";
import type { DirectorySource } from "./adminDirectory";
import { DirectorySession } from "./directorySession";

let active: { source: DirectorySource; session: DirectorySession } | undefined;
let uid: string | null = null;
let observing = false;

/** Keep observing Auth even between directory mounts, including sign-out then same-UID sign-in. */
export function directorySession(source: DirectorySource) {
  if (!observing && typeof auth.onAuthStateChanged === "function") {
    observing = true;
    uid = auth.currentUser?.uid || null;
    auth.onAuthStateChanged(user => {
      const next = user?.uid || null;
      if (next !== uid) { uid = next; active?.session.clearAll(); }
    });
    subscribeClubContextInvalidation(() => active?.session.clearScopes());
  }
  const current = auth.currentUser?.uid || null;
  if (current !== uid) { uid = current; active?.session.clearAll(false); }
  if (active?.source !== source) {
    active?.session.clearAll(false);
    active = { source, session: new DirectorySession(source, invalidateClubContext) };
  }
  return active.session;
}

/** A report permission failure revokes reuse of the same directory authority observation. */
export function failDirectorySession(error: unknown) { active?.session.fail(error); }
