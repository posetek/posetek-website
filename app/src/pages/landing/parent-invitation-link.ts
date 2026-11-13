// Parent invitation links (`#parentCode=PAR-…`, Parent accounts plan §4.2 and §11.2). The code is
// handled exactly like a player code: captured into memory before render, removed from the address
// bar, and never written to storage, logs or analytics.
export type ParentInvitationLink = { present: boolean; code: string };
const CODE = /^[A-Za-z0-9-]{6,64}$/;
const SIGN_IN_PATHS = ["/signin", "/kickai.html"];
let captured: ParentInvitationLink = { present: false, code: "" };

export function readParentInvitationLink(href: string): { invitation: ParentInvitationLink; cleanUrl: string } {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const values = [...url.searchParams.getAll("parentCode"), ...fragment.getAll("parentCode")];
  const present = values.length > 0 && SIGN_IN_PATHS.includes(url.pathname);
  if (!present) return { invitation: { present: false, code: "" }, cleanUrl: url.href };
  const normalized = values.map(value => value.trim());
  // A link that also carries a player code is malformed: it fills in neither code.
  const mixed = url.searchParams.has("playerCode") || fragment.has("playerCode");
  const code = !mixed && normalized.every(value => value === normalized[0]) && CODE.test(normalized[0]) ? normalized[0] : "";
  for (const key of ["parentCode", "playerCode"]) { url.searchParams.delete(key); fragment.delete(key); }
  url.hash = fragment.toString();
  return { invitation: { present, code }, cleanUrl: url.href };
}

export function captureParentInvitationLink(browser: Pick<Window, "location" | "history">): void {
  const boot = browser as typeof browser & { __posetekParentInvitation?: ParentInvitationLink };
  if (boot.__posetekParentInvitation) {
    const value = boot.__posetekParentInvitation;
    captured = { present: value.present === true, code: typeof value.code === "string" && CODE.test(value.code) ? value.code : "" };
    delete boot.__posetekParentInvitation;
  }
  const result = readParentInvitationLink(browser.location.href);
  if (result.invitation.present) {
    captured = result.invitation;
    browser.history.replaceState(browser.history.state, "", result.cleanUrl);
  }
}

export function initialParentInvitationLink(): ParentInvitationLink { return captured; }
export function forgetParentInvitationLink(): void { captured = { present: false, code: "" }; }

/**
 * The "Add player" field takes the code or the whole link (§11.2): trim it; if it contains
 * `parentCode=`, take the value up to the next `&`, whitespace or end and URL-decode it; otherwise
 * the whole input is the code. Returns "" when the result is not a well-formed code.
 */
export function parentCodeFromInput(input: string): string {
  const text = input.trim();
  const marker = text.indexOf("parentCode=");
  let code = text;
  if (marker >= 0) {
    const raw = /^[^&\s]*/.exec(text.slice(marker + "parentCode=".length))?.[0] || "";
    try { code = decodeURIComponent(raw); } catch { return ""; }
  }
  code = code.trim();
  return CODE.test(code) ? code : "";
}

export const unavailableParentInvitation = "This parent code is invalid or has already been used. If you already created your account, sign in. Otherwise, ask your coach for a new parent link.";
const otherAccount = (kind: string) => `This sign-in is ${kind}. To create a parent account, sign out and use a different email.`;

/** `HttpsError.details.reason` from `redeemGuardianInvitation`, when it sent one. */
export function guardianErrorReason(error: unknown): string | null {
  const details = error && typeof error === "object" ? (error as { details?: unknown }).details : null;
  const reason = details && typeof details === "object" ? (details as { reason?: unknown }).reason : null;
  return typeof reason === "string" ? reason : null;
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code).split("/").pop() || "" : "";
}

/** The guidance a refused parent link shows. Unknown failures return null so callers keep their own copy. */
export function guardianRedeemMessage(error: unknown): string | null {
  const code = errorCode(error);
  if (code === "not-found" || code === "invalid-argument") return unavailableParentInvitation;
  if (code === "resource-exhausted") return "Too many attempts. Wait a little, then try again.";
  if (code !== "failed-precondition") return null;
  switch (guardianErrorReason(error)) {
    case "player-login": return otherAccount("a player account");
    case "staff-login": return otherAccount("a coach or staff account");
    case "admin-login": return otherAccount("a PoseTek admin account");
    case "limit": return "This link cannot add more players to this account. Ask your coach for help.";
    case "deletion-pending": return "This account or player is being deleted.";
    default: return null;
  }
}

/** What a signed-in visitor sees on a parent link, decided from their resolved account. */
export type ParentLinkAction = { kind: "add" } | { kind: "guidance"; message: string };
export function parentLinkAction(role: string | null): ParentLinkAction {
  if (role === "player") return { kind: "guidance", message: otherAccount("a player account") };
  if (role === "admin") return { kind: "guidance", message: otherAccount("a PoseTek admin account") };
  if (role === "manager" || role === "coach" || role === "independent") return { kind: "guidance", message: otherAccount("a coach or staff account") };
  // A parent, or a login with no profile yet: the server decides.
  return { kind: "add" };
}

/** `redeemGuardianInvitation`'s `playerIds`: every child now linked to the caller. */
export function redeemedPlayerIds(result: unknown): string[] | null {
  const data = result && typeof result === "object" ? (result as { data?: unknown }).data : null;
  const ids = data && typeof data === "object" ? (data as { playerIds?: unknown }).playerIds : null;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id))) return null;
  return [...new Set(ids as string[])];
}

type SignupUser = { uid: string };
export interface ParentSignupSteps<U extends SignupUser> {
  currentUser(): U | null;
  validate(code: string): Promise<boolean>;
  create(email: string, password: string): Promise<U>;
  verify(user: U): Promise<void>;
  redeem(code: string): Promise<unknown>;
  discard(user: U): Promise<void>;
  /** The caller's own `guardians/{uid}` children; null or [] when none. */
  resolve(user: U): Promise<string[] | null>;
  created?(user: U): void;
}

const changed = "Your sign-in changed. Sign in with the account you just created to continue.";
const createdSignIn = "Your account was created. Sign in with that account to continue.";

// Mirrors createInvitedPlayer: the preflight keeps an invalid or used code from creating a login,
// redemption stays authoritative, and a lost response is reconciled against the caller's own
// guardians record before any cleanup. A login whose link may have succeeded is never deleted.
export async function createInvitedParent<U extends SignupUser>(
  input: { code: string; email: string; password: string }, steps: ParentSignupSteps<U>, pending?: U | null,
): Promise<string[]> {
  if (pending) {
    if (steps.currentUser()?.uid !== pending.uid) throw new Error(changed);
    const linked = await steps.resolve(pending);
    if (steps.currentUser()?.uid !== pending.uid) throw new Error(changed);
    if (linked?.length) return linked;
  } else if (steps.currentUser()) throw new Error("You are already signed in. Sign out before creating another account.");
  const code = input.code.trim();
  if (!CODE.test(code) || !await steps.validate(code)) throw new Error(unavailableParentInvitation);
  if (pending ? steps.currentUser()?.uid !== pending.uid : steps.currentUser()) throw new Error("Your sign-in changed. Sign out before creating another account.");
  let created: U | null = pending || null;
  let redeemed = false;
  let attempted = false;
  try {
    if (!created) {
      created = await steps.create(input.email.trim(), input.password);
      steps.created?.(created);
    }
    await steps.verify(created);
    if (steps.currentUser()?.uid !== created.uid) throw new Error(changed);
    attempted = true;
    const result = await steps.redeem(code);
    redeemed = true;
    if (steps.currentUser()?.uid !== created.uid) throw new Error(createdSignIn);
    const playerIds = redeemedPlayerIds(result);
    if (!playerIds?.length) throw new Error(createdSignIn);
    return playerIds;
  } catch (error) {
    if (created && attempted && !redeemed) {
      let linked: string[] | null;
      try { linked = await steps.resolve(created); }
      catch { throw new Error("Your account was created, but its player link could not be confirmed. Keep this page open and try Create Account again when your connection is available."); }
      if (linked?.length && steps.currentUser()?.uid === created.uid) return linked;
      if (linked?.length) throw new Error(createdSignIn);
      if (!["not-found", "invalid-argument", "failed-precondition", "permission-denied"].includes(errorCode(error))) {
        throw new Error("Your account was created, but linking could not be confirmed. Keep this page open and try Create Account again when your connection is available.");
      }
    }
    if (created && !pending && !redeemed) await steps.discard(created);
    throw error;
  }
}

/**
 * "Add to my account" and "Add player": redeem for the login that is signed in now, refusing to
 * report the result to a login that replaced it while the call was pending.
 */
export async function addParentInvitation(
  code: string, steps: { currentUid(): string | null; redeem(code: string): Promise<unknown> },
): Promise<string[]> {
  const uid = steps.currentUid();
  if (!uid) throw new Error("Sign in to add this player.");
  if (!CODE.test(code)) throw new Error(unavailableParentInvitation);
  const result = await steps.redeem(code);
  if (steps.currentUid() !== uid) throw new Error("Your sign-in changed. Sign in again to continue.");
  const playerIds = redeemedPlayerIds(result);
  if (!playerIds) throw new Error("The player was added, but the list could not be read. Refresh to see it.");
  return playerIds;
}
