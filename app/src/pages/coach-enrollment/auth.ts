// Only Auth is loaded on this private entry; no Firestore, replay or analytics.
import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, getIdToken,
  indexedDBLocalPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";

export function coachEnrollmentAuth() {
  const app = getApps().some(candidate => candidate.name === "[DEFAULT]") ? getApp() : initializeApp({
    apiKey: "AIzaSyBSfyXyhmD4kYGRSg-jOmGeLeOO8hX0-Gs", authDomain: "kickai-69dd0.firebaseapp.com",
    projectId: "kickai-69dd0", appId: "1:839600313930:web:13b1e94c2c540561e3f8b3",
  });
  try { return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "auth/already-initialized")) throw error; return getAuth(app); }
}
export async function authenticateCoach(mode: "create" | "existing", email: string, password: string) {
  const auth = coachEnrollmentAuth(); await auth.authStateReady();
  const result = await (mode === "create" ? createUserWithEmailAndPassword(auth, email.trim(), password) : signInWithEmailAndPassword(auth, email.trim(), password));
  const uid = result.user.uid, token = await getIdToken(result.user, true);
  if (auth.currentUser?.uid !== uid) throw new Error("The signed-in account changed. Sign in again before activating.");
  return { token, isCurrent: () => auth.currentUser?.uid === uid };
}
export async function coachEnrollmentCall<T>(name: "inspectCoachEnrollmentLink" | "claimCoachEnrollmentLink", data: Record<string, unknown>, token?: string): Promise<T> {
  const response = await fetch(`https://us-central1-kickai-69dd0.cloudfunctions.net/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }), signal: AbortSignal.timeout(70000),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || "We could not confirm this invitation. Try again.");
  return body.result;
}
