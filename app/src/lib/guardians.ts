// Staff side of parent links (Parent accounts plan §4.8 and §11.3). Responses are checked before use;
// a read failure is an error, never evidence that nobody is linked. Parent codes are handled like
// player codes: never logged, never stored, masked wherever shown.

export interface GuardianLink { uid: string; email: string | null; linkedAtMillis: number | null; playerIds: string[] }
/** `createdAtMillis` is sent with `invitations` entries; ensure's answer and older servers omit it. */
export interface GuardianInvitation { invitationId: string; code: string; signupUrl: string; playerIds: string[]; createdAtMillis?: number | null }
export interface SiblingCandidate { playerId: string; firstName: string; lastName: string }
export interface PlayerGuardians {
  playerId: string;
  issuingEnabled: boolean;
  guardians: GuardianLink[];
  /** The newest open link for this player that the caller may see in full. */
  invitation: GuardianInvitation | null;
  /** Every such open link, newest first (falls back to `[invitation]` for a server without it). */
  invitations: GuardianInvitation[];
  /** Open links for this player the caller may not see in full (0 when not sent). */
  otherOpenInvitationCount: number;
  siblingCandidates: SiblingCandidate[];
}
export type GuardianCall = (name: string, data: Record<string, unknown>) => Promise<unknown>;

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CODE = /^[A-Za-z0-9-]{6,64}$/;
const unreadable = () => new Error("Parent links could not be read. Try again.");
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const ids = (value: unknown) => {
  if (!Array.isArray(value) || !value.every(id => typeof id === "string" && ID.test(id))) throw unreadable();
  return [...new Set(value as string[])];
};

export function parseGuardianInvitation(value: unknown): GuardianInvitation {
  const row = record(value);
  if (!row || typeof row.invitationId !== "string" || !row.invitationId || typeof row.code !== "string" || !CODE.test(row.code)
    || typeof row.signupUrl !== "string") throw unreadable();
  let url: URL;
  try { url = new URL(row.signupUrl); } catch { throw unreadable(); }
  // The link must carry exactly this code in its fragment, on the sign-in page.
  if (url.pathname !== "/signin" || new URLSearchParams(url.hash.slice(1)).get("parentCode") !== row.code) throw unreadable();
  const created = row.createdAtMillis;
  if (created !== undefined && created !== null && !(typeof created === "number" && Number.isFinite(created))) throw unreadable();
  return { invitationId: row.invitationId, code: row.code, signupUrl: url.href, playerIds: ids(row.playerIds),
    ...(created !== undefined ? { createdAtMillis: created as number | null } : {}) };
}

export function parsePlayerGuardians(playerId: string, value: unknown): PlayerGuardians {
  const row = record(value);
  if (!row || row.playerId !== playerId || typeof row.issuingEnabled !== "boolean" || !Array.isArray(row.guardians) || !Array.isArray(row.siblingCandidates)) throw unreadable();
  const guardians = row.guardians.map(entry => {
    const g = record(entry);
    if (!g || typeof g.uid !== "string" || !g.uid || !(g.email === null || typeof g.email === "string")
      || !(g.linkedAtMillis === null || (typeof g.linkedAtMillis === "number" && Number.isFinite(g.linkedAtMillis)))) throw unreadable();
    const playerIds = ids(g.playerIds);
    return { uid: g.uid, email: g.email as string | null, linkedAtMillis: g.linkedAtMillis as number | null, playerIds: playerIds.includes(playerId) ? playerIds : [playerId, ...playerIds] };
  });
  const siblingCandidates = row.siblingCandidates.map(entry => {
    const s = record(entry);
    if (!s || typeof s.playerId !== "string" || !ID.test(s.playerId) || typeof s.firstName !== "string" || typeof s.lastName !== "string") throw unreadable();
    return { playerId: s.playerId, firstName: s.firstName, lastName: s.lastName };
  }).filter(candidate => candidate.playerId !== playerId);
  const invitation = row.invitation === null || row.invitation === undefined ? null : parseGuardianInvitation(row.invitation);
  if (row.invitations !== undefined && !Array.isArray(row.invitations)) throw unreadable();
  const invitations = Array.isArray(row.invitations) ? row.invitations.map(parseGuardianInvitation) : invitation ? [invitation] : [];
  const others = row.otherOpenInvitationCount;
  if (others !== undefined && !(Number.isSafeInteger(others) && (others as number) >= 0)) throw unreadable();
  return { playerId, issuingEnabled: row.issuingEnabled, guardians, siblingCandidates, invitation, invitations,
    otherOpenInvitationCount: (others as number | undefined) ?? 0 };
}

async function defaultCall(name: string, data: Record<string, unknown>) {
  const { cloud } = await import("./firebase");
  return (await cloud.httpsCallable(name)(data)).data;
}

// The callable wrapper does not report getPlayerGuardians (user-issues.ts); a failed read is
// reported here at most once per page, however many roster rows open their parent links.
let readFailureReported = false;
export function resetGuardianReadReporting(): void { readFailureReported = false; }

export async function getPlayerGuardians(playerId: string, call: GuardianCall = defaultCall,
  report: (error: unknown, playerId: string) => void = defaultReport): Promise<PlayerGuardians> {
  let data: unknown;
  try { data = await call("getPlayerGuardians", { playerId }); }
  catch (error) {
    if (!readFailureReported) { readFailureReported = true; report(error, playerId); }
    throw error;
  }
  return parsePlayerGuardians(playerId, data);
}
function defaultReport(error: unknown, playerId: string) {
  void import("./user-issues").then(({ captureIssue }) => captureIssue(error, "getPlayerGuardians", { playerId })).catch(() => {});
}

/**
 * Whether roster data the page already has says a parent is linked: `guardianUIDs` on a player
 * document, or the additive `parentLinked` boolean on a report row. Undefined when neither is there.
 */
export function parentLinkedFrom(row: unknown): boolean | undefined {
  const value = record(row);
  if (!value) return undefined;
  if (Array.isArray(value.guardianUIDs)) return value.guardianUIDs.length > 0;
  return typeof value.parentLinked === "boolean" ? value.parentLinked : undefined;
}
export async function ensureGuardianInvitation(playerIds: string[], call: GuardianCall = defaultCall): Promise<GuardianInvitation> {
  const chosen = [...new Set(playerIds)].sort();
  const invitation = parseGuardianInvitation(await call("ensureGuardianInvitation", { playerIds: chosen }));
  // Exactly the chosen children: a link for more players than were chosen is never copied.
  const returned = [...invitation.playerIds].sort();
  if (returned.length !== chosen.length || returned.some((id, index) => id !== chosen[index])) throw new Error("The parent link does not match the chosen players. Try again.");
  return invitation;
}
export async function revokeGuardianInvitation(invitationId: string, call: GuardianCall = defaultCall): Promise<boolean> {
  return record(await call("revokeGuardianInvitation", { invitationId }))?.revoked === true;
}
export async function removePlayerGuardian(playerId: string, guardianUid: string, call: GuardianCall = defaultCall): Promise<boolean> {
  return record(await call("removePlayerGuardian", { playerId, guardianUid }))?.removed === true;
}

/** Fixed copy for each refusal; server text and codes are never echoed. */
export function guardianLinkError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code).split("/").pop() : "";
  const details = error && typeof error === "object" ? record((error as { details?: unknown }).details) : null;
  if (code === "permission-denied") return "You do not have permission to manage this player’s parent links.";
  if (code === "unauthenticated") return "Sign in again to manage parent links.";
  if (code === "failed-precondition" && details?.reason === "issuing-disabled") return "Parent links are not available yet.";
  if (code === "failed-precondition" && details?.reason === "limit") return "A chosen player already has the most parents allowed.";
  if (error instanceof Error && /^(Parent links could not be read|The parent link does not match)/.test(error.message)) return error.message;
  return "Parent links could not be updated. Try again.";
}

/** The admin preview of a parent's picker (§4.8 admin parity). */
export function parentViewPath(guardianUid: string, playerId: string): string {
  return `/family?${new URLSearchParams({ previewParent: guardianUid, fromPlayer: playerId })}`;
}
