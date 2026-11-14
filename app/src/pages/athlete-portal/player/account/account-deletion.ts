// A parent's deletion requests (Parent accounts plan §4.9, decision 7): one per linked child, which
// names the child as `targetType: "player"`, and one for the parent's own account. Ported from the
// app's `AccountDeletionRequest`: re-authenticate, reuse one receipt per subject across retries,
// drop it only on a definitive refusal, and never report acceptance to a login that replaced the
// one that asked.

export type DeletionTarget = { kind: "self" } | { kind: "player"; playerId: string; name: string };
export const DELETE_CONFIRMATION = "DELETE";

export function deletionTitle(target: DeletionTarget): string {
  return target.kind === "self" ? "Delete parent account" : `Delete ${target.name}'s data`;
}

/** What each delete action removes, named before anything is sent. */
export function deletionDetail(target: DeletionTarget): string {
  return target.kind === "self"
    ? "Deletes your parent account and its links to your players. Your players' profiles and data stay. This cannot be undone."
    : `Deletes ${target.name}'s profile, recordings, results and training history, and ${target.name}'s own sign-in if there is one. Your parent account stays. This cannot be undone.`;
}

export interface DeletionResponse { accepted?: unknown; deletingCaller?: unknown }
export interface DeletionSteps {
  currentUid(): string | null;
  reauthenticate(password: string): Promise<void>;
  newToken(): string;
  send(payload: Record<string, string>): Promise<DeletionResponse>;
}

// In memory only: a retry in the same page reuses the receipt a lost response may have recorded.
const receipts = new Map<string, string>();
export function forgetDeletionReceipts(): void { receipts.clear(); }

const DEFINITIVE = ["failed-precondition", "permission-denied", "invalid-argument", "unauthenticated", "not-found", "already-exists"];
const code = (error: unknown) => error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code).split("/").pop() || "" : "";

export function deletionPayload(target: DeletionTarget, receiptToken: string): Record<string, string> {
  const payload: Record<string, string> = { confirmation: DELETE_CONFIRMATION, receiptToken };
  if (target.kind === "player") { payload.targetType = "player"; payload.targetId = target.playerId; }
  return payload;
}

/** 32 random bytes as 64 lowercase hex characters, the receipt shape the server accepts. */
export function randomReceiptToken(random: (bytes: Uint8Array<ArrayBuffer>) => void = bytes => { crypto.getRandomValues(bytes); }): string {
  const bytes = new Uint8Array(32);
  random(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** What the delete page needs from Firebase, so its submit path is testable as written. */
export interface DeletionEnvironment {
  currentUser(): { uid: string; email: string | null; reauthenticate(email: string, password: string): Promise<void> } | null;
  call(name: "requestAccountDeletion", data: Record<string, string>): Promise<{ data?: unknown }>;
  newToken?(): string;
}

/** The delete page's submit: re-authenticate with the password when the login has one, then send. */
export function submitGuardianDeletion(
  input: { actorUid: string; target: DeletionTarget; typed: string; password: string; needsPassword: boolean }, env: DeletionEnvironment,
): Promise<{ receiptToken: string; deletingCaller: boolean }> {
  return requestGuardianDeletion(input, {
    currentUid: () => env.currentUser()?.uid || null,
    reauthenticate: async secret => {
      const current = env.currentUser();
      if (!current) throw new Error("Sign in again to confirm.");
      if (!input.needsPassword) return;
      if (!current.email) throw new Error("Sign in again to confirm.");
      await current.reauthenticate(current.email, secret);
    },
    newToken: () => env.newToken?.() || randomReceiptToken(),
    send: async payload => ((await env.call("requestAccountDeletion", payload)).data || {}) as DeletionResponse,
  });
}

export const accountChanged = "The signed-in account changed. Close this screen and try again.";

export async function requestGuardianDeletion(
  input: { actorUid: string; target: DeletionTarget; typed: string; password: string }, steps: DeletionSteps,
): Promise<{ receiptToken: string; deletingCaller: boolean }> {
  if (input.typed.trim() !== DELETE_CONFIRMATION) throw new Error(`Type ${DELETE_CONFIRMATION} to confirm.`);
  if (!input.actorUid || steps.currentUid() !== input.actorUid) throw new Error(accountChanged);
  await steps.reauthenticate(input.password);
  if (steps.currentUid() !== input.actorUid) throw new Error(accountChanged);
  const subject = `${input.actorUid}:${input.target.kind === "self" ? "self" : `player:${input.target.playerId}`}`;
  const token = receipts.get(subject) || steps.newToken();
  receipts.set(subject, token);
  let response: DeletionResponse;
  try {
    response = await steps.send(deletionPayload(input.target, token));
  } catch (error) {
    if (DEFINITIVE.includes(code(error)) && receipts.get(subject) === token) receipts.delete(subject);
    throw error;
  }
  if (steps.currentUid() !== input.actorUid) throw new Error(accountChanged);
  if (response?.accepted !== true) throw new Error("Deletion was not confirmed. Check again before trying another request.");
  return { receiptToken: token, deletingCaller: response.deletingCaller === true };
}
