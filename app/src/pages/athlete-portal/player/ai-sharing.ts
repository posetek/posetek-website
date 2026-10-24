import { auth } from '../../../lib/firebase';

const disabled = new Set<string>();
const storageKey = (uid: string) => `posetek:ai-sharing-off:v1:${uid}`;

export function aiSharingError(code: string | undefined, message: string): Error & { code?: string } {
  return Object.assign(new Error(message), { code });
}

// A failed withdrawal must still stop new AI requests on this browser. Never
// cache an affirmative permission: the gateway checks the authoritative receipt.
export function assertAISharingEnabled(uid: string): void {
  let off = disabled.has(uid);
  try { off ||= localStorage.getItem(storageKey(uid)) === 'true'; } catch { /* memory still protects this page */ }
  if (off) throw aiSharingError('ai_consent_required', 'AI sharing is off on this browser. Review AI sharing before using AI.');
}

// Mirrors the gateway's code-only exemptions. Saved-workout execution and
// assessment continue to work when AI sharing is off; new capabilities fail closed.
const codeOnly = new Set(['activate_personalized_plan', 'discard_personalized_plan', 'apply_workout_draft',
  'save_workout_edit', 'save_plan_weeks', 'validate_workout_start', 'assess_personal_workout',
  'save_personal_workout', 'start_personal_workout', 'update_personal_workout_log']);
export function assertAIJobEnabled(uid: string, capability: string): void {
  if (!codeOnly.has(capability)) assertAISharingEnabled(uid);
}

function rememberDisabled(uid: string, off: boolean) {
  if (off) disabled.add(uid); else disabled.delete(uid);
  try {
    if (off) localStorage.setItem(storageKey(uid), 'true'); else localStorage.removeItem(storageKey(uid));
  } catch { /* Account permission is still verified by the gateway. */ }
}

// One queue per account spans all controls, including controls that unmount.
// A newer withdrawal takes effect locally immediately; old allow replies cannot
// clear it. Another tab clearing storage does not override this page's denial.
const choices = new Map<string, { revision: number; tail?: Promise<void> }>();

export async function setAISharing(allowed: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to change AI sharing.');
  const uid = user.uid;
  if (!allowed) rememberDisabled(uid, true);
  const sequence = choices.get(uid) ?? { revision: 0 };
  choices.set(uid, sequence);
  const revision = ++sequence.revision;
  const assertCurrentChoice = () => {
    if (sequence.revision !== revision) throw new Error('Your AI sharing choice changed. Review the latest choice.');
  };
  const save = () => saveChoice(user, allowed, assertCurrentChoice);
  const pending = sequence.tail ? sequence.tail.then(save) : save();
  const tail = pending.catch(() => {});
  sequence.tail = tail;
  void tail.then(() => { if (sequence.tail === tail) sequence.tail = undefined; });
  return pending;
}

async function saveChoice(user: NonNullable<typeof auth.currentUser>, allowed: boolean, assertCurrentChoice: () => void): Promise<void> {
  const uid = user.uid;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(allowed ? 'Permission could not be confirmed. Try again.' : 'AI sharing is off on this browser. Account-wide withdrawal could not be confirmed. Retry when connected.'));
    }, 20_000);
  });
  try {
    await Promise.race([timedOut, (async () => {
      assertCurrentChoice();
      const token = await user.getIdToken();
      if (controller.signal.aborted) return;
      assertCurrentChoice();
      if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Review AI sharing for the signed-in account.');
      const response = await fetch('/api/ai-consent', {
        method: 'POST', signal: controller.signal, cache: 'no-store', credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, allowed }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw aiSharingError(result?.error?.code, result?.error?.message || 'Permission could not be confirmed. Try again.');
      if (result?.version !== 1 || result?.allowed !== allowed) throw new Error('Permission could not be confirmed. Try again.');
      if (controller.signal.aborted) return;
      assertCurrentChoice();
      if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Review AI sharing for the signed-in account.');
      rememberDisabled(uid, !allowed);
    })()]);
  } catch (error) {
    if (!allowed) throw new Error('AI sharing is off on this browser. Account-wide withdrawal could not be confirmed. Retry when connected.');
    throw error;
  } finally { clearTimeout(timer!); }
}
