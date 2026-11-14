import { beforeEach, describe, expect, it, vi } from "vitest";
import { deletionPayload, forgetDeletionReceipts, randomReceiptToken, requestGuardianDeletion, submitGuardianDeletion } from "./account-deletion";
import type { DeletionTarget } from "./account-deletion";

const child: DeletionTarget = { kind: "player", playerId: "child-a", name: "Avery" };
function steps() {
  let uid: string | null = "parent-uid", n = 0;
  return {
    setUid: (next: string | null) => { uid = next; },
    currentUid: vi.fn(() => uid),
    reauthenticate: vi.fn(async () => {}),
    newToken: vi.fn(() => String(++n).padStart(64, "a")),
    send: vi.fn(async (_payload: Record<string, string>): Promise<Record<string, unknown>> => ({ accepted: true, deletingCaller: false })),
  };
}
const request = (target: DeletionTarget, s: ReturnType<typeof steps>, typed = "DELETE") => requestGuardianDeletion({ actorUid: "parent-uid", target, typed, password: "synthetic" }, s);

beforeEach(forgetDeletionReceipts);
describe("parent deletion requests", () => {
  it("names a linked child as the target, and the parent account by omitting one", () => {
    expect(deletionPayload(child, "t")).toEqual({ confirmation: "DELETE", receiptToken: "t", targetType: "player", targetId: "child-a" });
    expect(deletionPayload({ kind: "self" }, "t")).toEqual({ confirmation: "DELETE", receiptToken: "t" });
  });
  it("requires the typed confirmation before anything else", async () => {
    const s = steps();
    await expect(request(child, s, "delete")).rejects.toThrow("Type DELETE");
    expect(s.reauthenticate).not.toHaveBeenCalled(); expect(s.send).not.toHaveBeenCalled();
  });
  it("re-authenticates, then sends the child's request with a fresh receipt", async () => {
    const s = steps();
    expect(await request(child, s)).toEqual({ receiptToken: "a".repeat(63) + "1", deletingCaller: false });
    expect(s.reauthenticate.mock.invocationCallOrder[0]).toBeLessThan(s.send.mock.invocationCallOrder[0]);
    expect(s.send).toHaveBeenCalledWith({ confirmation: "DELETE", receiptToken: "a".repeat(63) + "1", targetType: "player", targetId: "child-a" });
  });
  it("reuses the receipt on a retry after a lost response, and drops it after a definitive refusal", async () => {
    const s = steps();
    s.send.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "functions/deadline-exceeded" }));
    await expect(request(child, s)).rejects.toThrow("timeout");
    await request(child, s);
    expect(s.send.mock.calls[0][0].receiptToken).toBe(s.send.mock.calls[1][0].receiptToken);
    s.send.mockRejectedValueOnce(Object.assign(new Error("Account deletion is not available yet."), { code: "functions/failed-precondition" }));
    await expect(request({ kind: "self" }, s)).rejects.toThrow("not available");
    await request({ kind: "self" }, s);
    expect(s.send.mock.calls[2][0].receiptToken).not.toBe(s.send.mock.calls[3][0].receiptToken);
  });
  it("keeps separate receipts for each child and for the parent account", async () => {
    const s = steps();
    await request(child, s); await request({ kind: "player", playerId: "child-b", name: "Bea" }, s); await request({ kind: "self" }, s);
    expect(new Set(s.send.mock.calls.map(call => call[0].receiptToken)).size).toBe(3);
  });
  it("never reports acceptance to a login that replaced the one that asked", async () => {
    const s = steps();
    s.reauthenticate.mockImplementationOnce(async () => { s.setUid("someone-else"); });
    await expect(request(child, s)).rejects.toThrow("account changed"); expect(s.send).not.toHaveBeenCalled();
    s.setUid("parent-uid");
    s.send.mockImplementationOnce(async () => { s.setUid("someone-else"); return { accepted: true }; });
    await expect(request(child, s)).rejects.toThrow("account changed");
  });
  it("treats an unaccepted response as unconfirmed", async () => {
    const s = steps(); s.send.mockResolvedValue({ accepted: false });
    await expect(request(child, s)).rejects.toThrow("not confirmed");
  });
  it("submits a child's deletion for that child, and the parent's own without a target, after re-authenticating", async () => {
    const calls: [string, Record<string, string>][] = [], reauth = vi.fn(async () => {});
    const env = { currentUser: () => ({ uid: "parent-uid", email: "parent@example.test", reauthenticate: reauth }),
      call: vi.fn(async (name: string, data: Record<string, string>) => { calls.push([name, data]); return { data: { accepted: true, deletingCaller: data.targetId === undefined } }; }),
      newToken: () => "b".repeat(64) };
    await submitGuardianDeletion({ actorUid: "parent-uid", target: child, typed: "DELETE", password: "synthetic", needsPassword: true }, env);
    const own = await submitGuardianDeletion({ actorUid: "parent-uid", target: { kind: "self" }, typed: "DELETE", password: "synthetic", needsPassword: true }, env);
    expect(calls).toEqual([
      ["requestAccountDeletion", { confirmation: "DELETE", receiptToken: "b".repeat(64), targetType: "player", targetId: "child-a" }],
      ["requestAccountDeletion", { confirmation: "DELETE", receiptToken: "b".repeat(64) }],
    ]);
    expect(reauth).toHaveBeenCalledWith("parent@example.test", "synthetic"); expect(own.deletingCaller).toBe(true);
  });
  it("skips the password step for a login without one", async () => {
    const reauth = vi.fn(async () => {});
    await submitGuardianDeletion({ actorUid: "parent-uid", target: child, typed: "DELETE", password: "", needsPassword: false },
      { currentUser: () => ({ uid: "parent-uid", email: null, reauthenticate: reauth }), call: async () => ({ data: { accepted: true } }) });
    expect(reauth).not.toHaveBeenCalled();
  });
  it("makes 64-character lowercase hex receipts", () => {
    expect(randomReceiptToken()).toMatch(/^[a-f0-9]{64}$/);
    expect(randomReceiptToken(bytes => { bytes.fill(255); })).toBe("f".repeat(64));
  });
});
