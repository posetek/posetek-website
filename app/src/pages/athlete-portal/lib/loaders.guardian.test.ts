import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  players: new Map<string, Record<string, unknown>>(), guardian: vi.fn(), ownPlayer: vi.fn(), admin: vi.fn(), call: vi.fn(),
  membership: vi.fn(), coach: vi.fn(),
}));
vi.mock("../../../lib/firebase", () => ({
  default: {}, auth: { currentUser: { uid: "parent-uid" } },
  db: { collection: () => ({ doc: (id: string) => ({
    get: async () => {
      // A child the rules no longer let this login read (Firestore denies the get).
      if (id === "unlinked-child") throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
      return { id, exists: mocks.players.has(id), data: () => mocks.players.get(id) };
    },
    collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
  }) }) },
  cloud: { httpsCallable: (name: string) => (data: unknown) => mocks.call(name, data) },
  storage: { ref: () => ({ listAll: async () => ({ prefixes: [], items: [] }) }) },
}));
// The real ownership and parent checks; only the lookups that touch Firestore by uid are mocked.
vi.mock("../../../lib/identity", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../lib/identity")>()),
  findCoach: mocks.coach, findPlayer: mocks.ownPlayer, findGuardian: mocks.guardian,
}));
vi.mock("../../../lib/organization-data", () => ({ loadClubMembership: mocks.membership }));
vi.mock("../../admin/lib/identity", () => ({ refreshAdminIdentity: mocks.admin }));
vi.mock("../player/report", () => ({ prefetchAthleteTestReport: vi.fn() }));
import { GuardianChoiceRequired, loadAuthenticated } from "./loaders";

const parent = { uid: "parent-uid" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.players.clear();
  mocks.players.set("child-a", { firstName: "Synthetic", lastName: "A", organizationId: "club", teamId: "blue", authenticationUID: "child-a-login", guardianUIDs: ["parent-uid"] });
  mocks.players.set("child-b", { firstName: "Synthetic", lastName: "B", guardianUIDs: ["parent-uid", "second-parent"] });
  mocks.players.set("other-child", { firstName: "Synthetic", lastName: "Other", organizationId: "club", teamId: "blue", guardianUIDs: ["someone-else"] });
  mocks.admin.mockResolvedValue({ isAdmin: false });
  mocks.ownPlayer.mockResolvedValue(null);
  mocks.guardian.mockResolvedValue({ playerIds: ["child-a", "child-b"] });
  mocks.membership.mockResolvedValue(null);
  mocks.coach.mockResolvedValue(null);
  mocks.call.mockResolvedValue({ data: { reps: [] } });
});

describe("a linked parent opens the child's own player view", () => {
  it("gives the existing athlete access plus a guardian flag, so every owner gate passes unchanged", async () => {
    const result = await loadAuthenticated(parent, "child-a");
    expect(result.access).toBe("athlete");
    expect(result.playerId).toBe("child-a");
    expect(result.guardian).toBe(true);
    expect(result.guardianPlayerIds).toEqual(["child-a", "child-b"]);
    // Club or coach membership is never consulted for a parent.
    expect(mocks.membership).not.toHaveBeenCalled(); expect(mocks.coach).not.toHaveBeenCalled();
    expect(mocks.call).toHaveBeenCalledWith("getAthleteEffectiveResults", { playerId: "child-a" });
  });
  it("refuses a parent of a different child", async () => {
    await expect(loadAuthenticated(parent, "other-child")).rejects.toThrow("permission");
  });
  it("refuses a parent who was removed from the child", async () => {
    mocks.players.set("child-b", { firstName: "Synthetic", lastName: "B", guardianUIDs: ["second-parent"] });
    await expect(loadAuthenticated(parent, "child-b")).rejects.toThrow("permission");
  });
  it("sends a parent whose link was removed back to the picker instead of the raw read error", async () => {
    // Found in the local emulator journey: after staff removed the parent, the child's
    // bookmarked view showed the rules error text and "Sign in with a different account".
    await expect(loadAuthenticated(parent, "unlinked-child")).rejects.toBeInstanceOf(GuardianChoiceRequired);
    mocks.guardian.mockResolvedValue(null);
    await expect(loadAuthenticated(parent, "unlinked-child")).rejects.toThrow("Missing or insufficient permissions.");
    mocks.guardian.mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(loadAuthenticated(parent, "unlinked-child")).rejects.toThrow("Missing or insufficient permissions.");
  });
  it("keeps this child in the switcher list when the guardians record cannot be read", async () => {
    mocks.guardian.mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    const result = await loadAuthenticated(parent, "child-b");
    expect(result.access).toBe("athlete"); expect(result.guardianPlayerIds).toEqual(["child-b"]);
  });
  it("opens the only child when /athlete names none, and asks for the picker otherwise", async () => {
    mocks.guardian.mockResolvedValue({ playerIds: ["child-b"] });
    expect((await loadAuthenticated(parent, null)).playerId).toBe("child-b");
    mocks.guardian.mockResolvedValue({ playerIds: ["child-a", "child-b"] });
    await expect(loadAuthenticated(parent, null)).rejects.toBeInstanceOf(GuardianChoiceRequired);
    mocks.guardian.mockResolvedValue({ playerIds: [] });
    await expect(loadAuthenticated(parent, null)).rejects.toBeInstanceOf(GuardianChoiceRequired);
  });
  it("leaves the owner's own view without a guardian flag", async () => {
    const result = await loadAuthenticated({ uid: "child-a-login" }, "child-a");
    expect(result.access).toBe("athlete");
    expect(result.guardian).toBeUndefined(); expect(result.guardianPlayerIds).toBeUndefined();
    expect(mocks.guardian).not.toHaveBeenCalled();
  });
  it("gives an admin admin access even if listed", async () => {
    mocks.admin.mockResolvedValue({ isAdmin: true });
    const result = await loadAuthenticated(parent, "child-a");
    expect(result.access).toBe("admin"); expect(result.guardian).toBeUndefined();
  });
});
