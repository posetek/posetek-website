// The child a parent login is acting for right now (Parent accounts plan §4.4 and §11.3). The
// player view registers it while it shows a child to a linked parent; calls that take no player
// for an owner (team leaderboard, workout activity, usage) then name that child, and the social
// client refuses to call at all (social identity stays the child's own login). Owner, staff,
// admin and preview sessions never register, so they send exactly what they send today.
// Kept free of Firebase imports: the usage recorder at the application root reads it.

type ActingPlayer = { uid: string; playerId: string };
let current: ActingPlayer | null = null;

/** Registers a parent session for one child; the returned function ends exactly that registration. */
export function enterActingPlayer(uid: string, playerId: string): () => void {
  const entry = { uid, playerId };
  current = entry;
  return () => { if (current === entry) current = null; };
}

/** The child the given login is acting for, or null for every other session. */
export function actingPlayerId(uid: string | null | undefined): string | null {
  return uid && current && current.uid === uid ? current.playerId : null;
}

/**
 * `{ playerId }` when the given login is acting for exactly this child as a parent, else `{}`: an
 * owner's request stays byte-for-byte what it is today.
 */
export function actingPlayerScope(uid: string | null | undefined, playerId: string | null | undefined): { playerId?: string } {
  return playerId && actingPlayerId(uid) === playerId ? { playerId } : {};
}
