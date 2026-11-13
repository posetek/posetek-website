import { describe, expect, it, vi } from "vitest";
import { resolveAccountAccess } from "./account-access";
import type { AccessDependencies, AccessUser } from "./account-access";
import { actsAsPlayer, findGuardian, guardianPlayerIds, guardsPlayer, ownsPlayer } from "./identity";
import type { IdentityDb, IdentityDoc } from "./identity";

function setup() {
  const user: AccessUser = { uid: "parent-uid", reload: vi.fn(async () => {}), getIdTokenResult: vi.fn(async () => ({ claims: { email: "parent@example.test", email_verified: true } })) };
  const deps = {
    isCurrent: vi.fn(() => true),
    context: vi.fn<AccessDependencies["context"]>(async () => ({ role: "none", organization: null })),
    coach: vi.fn<AccessDependencies["coach"]>(async () => null),
    guardian: vi.fn<NonNullable<AccessDependencies["guardian"]>>(async () => null),
    player: vi.fn<AccessDependencies["player"]>(async () => null),
  };
  return { user, deps };
}

/** A fake Firestore holding only the caller's own guardians document (or refusing to read it). */
function guardianDb(result: { data?: Record<string, unknown>; error?: string }): IdentityDb {
  return { collection: (name: string) => ({
    doc: (id: string) => ({ get: async (): Promise<IdentityDoc> => {
      expect(name).toBe("guardians"); expect(id).toBe("parent-uid");
      if (result.error) throw Object.assign(new Error("Missing or insufficient permissions."), { code: result.error });
      return { id, exists: Boolean(result.data), data: () => result.data };
    } }),
    where: () => { throw new Error("guardians is never queried"); },
  }) } as unknown as IdentityDb;
}

describe("parent role resolution", () => {
  it.each([
    [[], []],
    [["child-a"], ["child-a"]],
    [["child-a", "child-b", "child-c"], ["child-a", "child-b", "child-c"]],
  ])("resolves a parent with %j children before the owner lookup", async (stored, expected) => {
    const { user, deps } = setup();
    deps.guardian.mockImplementation(uid => findGuardian(guardianDb({ data: { schemaVersion: 1, userUID: uid, playerIds: stored } }), uid));
    expect(await resolveAccountAccess(user, deps)).toEqual({ kind: "active", role: "parent", playerIds: expected });
    expect(deps.player).not.toHaveBeenCalled();
  });
  it.each(["permission-denied", "firestore/permission-denied"])("treats a denied guardians read (%s) as not a parent and resolves exactly as before", async error => {
    const { user, deps } = setup();
    deps.guardian.mockImplementation(uid => findGuardian(guardianDb({ error }), uid));
    deps.player.mockResolvedValue({ id: "player-record" });
    expect(await resolveAccountAccess(user, deps)).toEqual({ kind: "active", role: "player", playerId: "player-record" });
    deps.player.mockResolvedValue(null);
    expect(await resolveAccountAccess(user, deps)).toEqual({ kind: "activation", reason: "unlinked" });
  });
  it("treats a missing guardians document as not a parent", async () => {
    const { user, deps } = setup();
    deps.guardian.mockImplementation(uid => findGuardian(guardianDb({}), uid));
    deps.player.mockResolvedValue({ id: "player-record" });
    expect(await resolveAccountAccess(user, deps)).toEqual({ kind: "active", role: "player", playerId: "player-record" });
  });
  it("does not hide other read failures as 'not a parent'", async () => {
    const { user, deps } = setup();
    deps.guardian.mockImplementation(uid => findGuardian(guardianDb({ error: "unavailable" }), uid));
    await expect(resolveAccountAccess(user, deps)).rejects.toThrow("insufficient permissions");
    expect(deps.player).not.toHaveBeenCalled();
  });
  it("keeps admin and staff ahead of the guardians record", async () => {
    const { user, deps } = setup();
    deps.guardian.mockResolvedValue({ playerIds: ["child-a"] });
    deps.context.mockResolvedValue({ role: "coach", organization: { id: "club", name: "Club" } });
    expect(await resolveAccountAccess(user, deps)).toEqual({ kind: "active", role: "coach", organizationId: "club", organizationName: "Club" });
    expect(deps.guardian).not.toHaveBeenCalled();
  });
  it("leaves callers without the guardian dependency unchanged", async () => {
    const { user, deps } = setup();
    const { guardian: _unused, ...legacy } = deps;
    void _unused;
    legacy.player.mockResolvedValue({ id: "player-record" });
    expect(await resolveAccountAccess(user, legacy)).toEqual({ kind: "active", role: "player", playerId: "player-record" });
  });
  it("rejects a stale account at the guardians step", async () => {
    const { user, deps } = setup(); let current = true; deps.isCurrent.mockImplementation(() => current);
    deps.guardian.mockImplementation(async () => { current = false; return { playerIds: ["child-a"] }; });
    await expect(resolveAccountAccess(user, deps)).rejects.toThrow("sign-in changed");
  });
});

describe("guardians record and parent identity", () => {
  it("keeps only well-formed, distinct ids, at most ten", () => {
    expect(guardianPlayerIds({ playerIds: ["a", "a", "b/../c", 7, "", "c", ...Array.from({ length: 12 }, (_, i) => `p${i}`)] })).toEqual(["a", "c", ...Array.from({ length: 8 }, (_, i) => `p${i}`)]);
    expect(guardianPlayerIds({})).toEqual([]);
  });
  it("ignores a guardians document written for another uid", async () => {
    expect(await findGuardian(guardianDb({ data: { userUID: "someone-else", playerIds: ["child-a"] } }), "parent-uid")).toBeNull();
  });
  const doc = (data: Record<string, unknown>): IdentityDoc => ({ id: "child-a", exists: true, data: () => data });
  it("accepts a uid listed in guardianUIDs as acting for the player, never as its owner", () => {
    const child = doc({ authenticationUID: "child-login", guardianUIDs: ["parent-uid", "other-parent"] });
    expect(guardsPlayer(child, "parent-uid")).toBe(true);
    expect(ownsPlayer(child, "parent-uid")).toBe(false);
    expect(actsAsPlayer(child, "parent-uid")).toBe(true);
    expect(actsAsPlayer(child, "child-login")).toBe(true);
  });
  it("refuses an unlisted, removed or malformed parent", () => {
    expect(guardsPlayer(doc({ guardianUIDs: ["other-parent"] }), "parent-uid")).toBe(false);
    expect(guardsPlayer(doc({ guardianUIDs: [] }), "parent-uid")).toBe(false);
    expect(guardsPlayer(doc({ guardianUIDs: "parent-uid" }), "parent-uid")).toBe(false);
    expect(guardsPlayer(doc({}), "parent-uid")).toBe(false);
    expect(guardsPlayer({ id: "x", exists: false, data: () => undefined }, "parent-uid")).toBe(false);
    expect(guardsPlayer(doc({ guardianUIDs: ["parent-uid"] }), "")).toBe(false);
  });
});
