import { describe, expect, it, vi } from "vitest";
import { accountDestination, familyDestination, signInProfileWrite } from "./account-entry";
import type { AccountRole } from "./account-entry";
import { getSafeReturnToUrl } from "./landing-helpers";
import { initialReportPlayerDestination, readReportPlayerEntry, reportParentNotLinked, reportParentSignupDestination, reportPlayerDestination } from "./report-player-entry";
import { parentLinkSignIn } from "./parent-sign-in";
import { guardianInvitationCheck, parentLinkAction, unavailableParentInvitation } from "./parent-invitation-link";

const origin = "https://posetek.example";
const base = origin + "/signin";
const route = (playerIds: string[], target = "") => accountDestination("parent", null, target ? "?returnTo=" + encodeURIComponent(target) : "", base, origin, playerIds);
const stats = (id: string) => `/athlete?player=${id}&userType=player&view=stats`;

describe("parent destinations", () => {
  it("opens the one child's Stats, else the picker", () => {
    expect(familyDestination([])).toBe("/family");
    expect(familyDestination(["child-a"])).toBe(stats("child-a"));
    expect(familyDestination(["child-a", "child-b", "child-c"])).toBe("/family");
    expect(route([])).toBe("/family");
    // A parent keeps its Stats landing; the child's own sign-in names no tab (Stats first, then Workouts).
    expect(route(["child-a"])).toBe(stats("child-a"));
    expect(accountDestination("player", "child-a", "", base, origin)).toBe("/athlete?player=child-a&userType=player");
    expect(route(["child-a", "child-b", "child-c"])).toBe("/family");
  });
  it("follows a safe player-facing return target and refuses staff, admin, feed and activation targets", () => {
    const training = "/athlete?player=child-b&userType=player&view=training";
    expect(route(["child-a", "child-b"], training)).toBe(origin + training);
    expect(route(["child-a", "child-b"], "/family")).toBe(origin + "/family");
    for (const target of ["/admin", "/admin/accounts", "/organization", "/insights", "/roster", "/feed", "/join"]) {
      expect(route(["child-a", "child-b"], target)).toBe("/family");
    }
  });
  it("accepts /family as a return target only for parents", () => {
    expect(getSafeReturnToUrl("?returnTo=%2Ffamily", base, origin)).toBe(origin + "/family");
    for (const role of ["admin", "manager", "coach", "independent", "player", "pending"] as AccountRole[]) {
      expect(accountDestination(role, "player-record", "?returnTo=%2Ffamily", base, origin)).toBe(accountDestination(role, "player-record", "", base, origin));
    }
  });
  it("never writes the child's lastLogin for a parent sign-in", () => {
    expect(signInProfileWrite("parent", null)).toBeNull();
    expect(signInProfileWrite("parent", "child-a")).toBeNull();
    expect(signInProfileWrite("player", "player-record")).toBe("player");
    expect(signInProfileWrite("player", null)).toBeNull();
    expect(signInProfileWrite("independent", null)).toBe("coach");
    expect(signInProfileWrite("admin", null)).toBe("admin");
    for (const role of ["manager", "coach", "pending"] as AccountRole[]) expect(signInProfileWrite(role, null)).toBeNull();
  });
});

describe("report continuation for a parent", () => {
  const entry = readReportPlayerEntry("?reportPlayer=child-b");
  const training = "/athlete?player=child-b&userType=player&view=training";
  it("accepts a parent linked to the report's child and lands on that child's Training", () => {
    expect(reportPlayerDestination(entry, "parent", null, ["child-a", "child-b"])).toBe(training);
  });
  it("refuses a parent who is not linked to the report's child, without telling it to use the player's login", () => {
    expect(() => reportPlayerDestination(entry, "parent", null, ["child-a"])).toThrow(reportParentNotLinked);
    expect(() => reportPlayerDestination(entry, "parent", null, [])).toThrow(reportParentNotLinked);
    // A parent's own playerId is never a substitute for its guardians record.
    expect(() => reportPlayerDestination(entry, "parent", "child-b", [])).toThrow(reportParentNotLinked);
    expect(reportParentNotLinked).not.toContain("player's login");
  });
  it("keeps the player behaviour unchanged", () => {
    expect(reportPlayerDestination(entry, "player", "child-b")).toBe(training);
    expect(reportPlayerDestination(entry, "player", "child-b", ["child-a"])).toBe(training);
    expect(() => reportPlayerDestination(entry, "player", "child-a", ["child-b"])).toThrow("player's login");
  });
  it("continues a parent signup only when the redemption linked the report's child", () => {
    expect(reportParentSignupDestination(entry, ["child-a", "child-b"])).toBe(training);
    expect(() => reportParentSignupDestination(entry, ["child-a"])).toThrow("does not match");
    expect(reportParentSignupDestination(readReportPlayerEntry(""), ["child-a"])).toBeNull();
  });
  it("sends an existing parent whose link misses the report's child to its own players, with no 'account was created' message", () => {
    expect(reportParentSignupDestination(entry, ["child-a"], true)).toBeNull();
    expect(reportParentSignupDestination(entry, ["child-a", "child-b"], true)).toBe(training);
  });
  it("enters a restored parent session for a linked child directly", async () => {
    const user = { uid: "parent-uid", reload: async () => {}, getIdTokenResult: async () => ({ claims: {} }) };
    const load = vi.fn(async () => ({ kind: "active" as const, role: "parent" as const, playerIds: ["child-b"] }));
    expect(await initialReportPlayerDestination(entry, user, load, () => true)).toBe(training);
    load.mockResolvedValue({ kind: "active", role: "parent", playerIds: ["child-a"] });
    await expect(initialReportPlayerDestination(entry, user, load, () => true)).rejects.toThrow(reportParentNotLinked);
  });
});

describe("signing in while a parent link waits (review 1 and 7, re-review N1 and N2, final pass D2 and D3)", () => {
  const report = readReportPlayerEntry("?reportPlayer=child-b");
  const none = readReportPlayerEntry("");
  const training = "/athlete?player=child-b&userType=player&view=training";
  const parentOf = (...playerIds: string[]) => ({ kind: "active" as const, role: "parent" as const, playerIds });
  it("lets the report's own child login continue as before, whatever the code's state", () => {
    for (const code of ["unused", "used", "paused", "unknown"] as const) {
      expect(parentLinkSignIn(report, { kind: "active", role: "player", playerId: "child-b" }, code)).toEqual({ kind: "continue", destination: training });
    }
  });
  it("continues a parent already linked to the report's child only when the waiting code can no longer add anyone", () => {
    expect(parentLinkSignIn(report, parentOf("child-b"), "used")).toEqual({ kind: "continue", destination: training });
    expect(parentLinkSignIn(report, parentOf("child-b"), "unknown")).toEqual({ kind: "continue", destination: training });
    // An unused code may carry a sibling: Add to my account, never dropped silently.
    expect(parentLinkSignIn(report, parentOf("child-b"), "unused")).toEqual({ kind: "add" });
  });
  it("returns an existing parent or an unlinked login to Add to my account when the code is unused", () => {
    expect(parentLinkSignIn(none, parentOf("child-a"), "unused")).toEqual({ kind: "add" });
    expect(parentLinkSignIn(none, { kind: "activation", reason: "unlinked" }, "unused")).toEqual({ kind: "add" });
  });
  it("D2: shows a parent with a used or invalid code the existing message once, as a notice, instead of trapping it", () => {
    expect(parentLinkSignIn(none, parentOf("child-a"), "used")).toEqual({ kind: "notice", message: unavailableParentInvitation, guidance: false });
    expect(parentLinkSignIn(report, parentOf("child-a"), "used")).toEqual({ kind: "notice", message: unavailableParentInvitation, guidance: false });
  });
  it("D3: paused links are a notice that keeps the link, never treated as a used code", () => {
    expect(parentLinkSignIn(none, parentOf("child-a"), "paused")).toEqual({ kind: "notice", message: "Parent links are paused. Try again later.", guidance: false });
    // Not continued past a sibling either, as for an unused code.
    expect(parentLinkSignIn(report, parentOf("child-b"), "paused")).toEqual({ kind: "notice", message: "Parent links are paused. Try again later.", guidance: false });
  });
  it("answers every other account with guidance, which the page shows once to that sign-in", () => {
    expect(parentLinkSignIn(report, { kind: "active", role: "player", playerId: "other-child" }, "unknown")).toEqual({ kind: "notice", message: (parentLinkAction("player") as { message: string }).message, guidance: true });
    expect(parentLinkSignIn(none, { kind: "active", role: "player", playerId: "child-b" }, "unknown")).toMatchObject({ kind: "notice", guidance: true });
    for (const role of ["admin", "manager", "coach", "independent"] as const) expect(parentLinkSignIn(none, { kind: "active", role }, "unknown")).toMatchObject({ kind: "notice", guidance: true });
  });
  it("reads a paused answer from validateGuardianInvitation, and a server without reason as before", () => {
    expect(guardianInvitationCheck({ valid: false, reason: "redemption-disabled" })).toEqual({ valid: false, paused: true });
    expect(guardianInvitationCheck({ valid: false })).toEqual({ valid: false, paused: false });
    expect(guardianInvitationCheck({ valid: true })).toEqual({ valid: true, paused: false });
    expect(guardianInvitationCheck({ valid: true, reason: "redemption-disabled" })).toEqual({ valid: true, paused: false });
  });
});
