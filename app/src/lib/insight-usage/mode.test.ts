import { describe, expect, it, vi } from "vitest";
import { usageMode } from "./mode";

describe("usage recorder mode", () => {
  it("records a player as today, without a guardians read", async () => {
    const isParent = vi.fn(async () => true);
    expect(await usageMode("player", "player-uid", isParent)).toBe("player");
    expect(isParent).not.toHaveBeenCalled();
  });
  it.each(["coach", "manager", "admin"])("never records %s, and never reads guardians for staff", async role => {
    const isParent = vi.fn(async () => true);
    expect(await usageMode(role, "staff-uid", isParent)).toBeNull();
    expect(isParent).not.toHaveBeenCalled();
  });
  it("records a login with a guardians record as a parent", async () => {
    expect(await usageMode("none", "parent-uid", async uid => uid === "parent-uid")).toBe("parent");
    expect(await usageMode(undefined, "parent-uid", async () => true)).toBe("parent");
  });
  it("treats no record or a failed read as not recording", async () => {
    expect(await usageMode("none", "someone", async () => false)).toBeNull();
    expect(await usageMode("none", "someone", async () => { throw new Error("offline"); })).toBeNull();
  });
});
