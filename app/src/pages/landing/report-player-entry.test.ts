import { describe, expect, it, vi } from "vitest";
import { readReportPlayerEntry, reportPlayerDestination, reportSignupDestination, initialReportPlayerDestination } from "./report-player-entry";
import { createInvitedPlayer } from "./player-invitation-link";
const entry = readReportPlayerEntry("?reportPlayer=canonical-child");
const target = "/athlete?player=canonical-child&userType=player&view=training";

describe("report player continuation", () => {
  it("continues the same authenticated player to Training, ignoring arbitrary returnTo", () => {
    for (const returnTo of ["https://outside.test", "/admin", "/athlete?player=other", "//outside.test"]) {
      const current = readReportPlayerEntry("?reportPlayer=canonical-child&returnTo=" + encodeURIComponent(returnTo));
      expect(reportPlayerDestination(current, "player", "canonical-child")).toBe(target);
    }
  });
  it.each(["admin", "manager", "coach", "independent", "pending", null] as const)("does not route %s into staff or player access", role => {
    expect(() => reportPlayerDestination(entry, role, "canonical-child")).toThrow("player's login");
  });
  it("rejects another player's account and an unresolved identity", () => {
    expect(() => reportPlayerDestination(entry, "player", "other-child")).toThrow("player's login");
    expect(() => reportPlayerDestination(entry, "player", null)).toThrow("player's login");
  });
  it.each(["", "a/b", "../admin", "https://outside.test", "A".repeat(129)])("fails closed for malformed target %s", id => {
    const current = readReportPlayerEntry("?reportPlayer=" + encodeURIComponent(id));
    expect(current.present).toBe(true);
    expect(() => reportPlayerDestination(current, "player", id)).toThrow("original report");
  });
  it("rejects duplicate child markers and retains ordinary sign-in behavior", () => {
    expect(() => reportPlayerDestination(readReportPlayerEntry("?reportPlayer=a&reportPlayer=a"), "player", "a")).toThrow();
    expect(reportPlayerDestination(readReportPlayerEntry("?returnTo=/admin"), "admin", null)).toBeNull();
  });
  it("uses the trusted redemption identity, never a requested sibling", () => {
    expect(reportSignupDestination(entry, "canonical-child")).toBe(target);
    expect(() => reportSignupDestination(entry, "sibling")).toThrow("does not match");
  });
  it("composes successful signup with exact-child Training and stops stale invitations before Auth creation", async () => {
    let active: {uid:string}|null=null;
    const steps={currentUser:()=>active,validate:vi.fn(async()=>true),create:vi.fn(async()=>active={uid:"new-user"}),verify:vi.fn(async()=>{}),redeem:vi.fn(async()=>({data:{playerId:"canonical-child"}})),resolve:vi.fn(async()=>null),discard:vi.fn(async()=>{})};
    const id=await createInvitedPlayer({code:"SYNTHETIC-CODE",email:"child@example.test",password:"fixture-password"},steps);
    expect(reportSignupDestination(entry,id)).toBe(target);
    active=null;steps.create.mockClear();steps.validate.mockResolvedValue(false);
    await expect(createInvitedPlayer({code:"USED-CODE",email:"child@example.test",password:"fixture-password"},steps)).rejects.toThrow("already been used");
    expect(steps.create).not.toHaveBeenCalled();
  });
});


describe("initial restored report session", () => {
  const user = { uid: "current-user", reload: async () => {}, getIdTokenResult: async () => ({claims: {}}) };
  it("enters the matching canonical player directly without a signup or login action", async () => {
    const load = vi.fn(async () => ({kind: "active" as const, role: "player" as const, playerId: "canonical-child"}));
    expect(await initialReportPlayerDestination(entry, user, load, () => true)).toBe(target);
    expect(load).toHaveBeenCalledOnce();
  });
  it("does not resolve signed-out users or ordinary sign-in visits", async () => {
    const load = vi.fn();
    expect(await initialReportPlayerDestination(entry, null, load, () => true)).toBeNull();
    expect(await initialReportPlayerDestination({present: false, playerId: null}, user, load, () => true)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it.each([
    {kind: "active" as const, role: "player" as const, playerId: "other-child"},
    {kind: "active" as const, role: "admin" as const},
    {kind: "activation" as const, reason: "unlinked" as const},
  ])("refuses automatic entry for another child, staff or unresolved account", async access => {
    await expect(initialReportPlayerDestination(entry, user, async () => access, () => true)).rejects.toThrow("player's login");
  });
  it("cancels a resolved target if the account changes while lookup is pending", async () => {
    let current=true;
    const load=vi.fn(async () => { current=false; return {kind: "active" as const, role: "player" as const, playerId: "canonical-child"}; });
    expect(await initialReportPlayerDestination(entry,user,load,()=>current)).toBeNull();
    current=false;load.mockClear();
    expect(await initialReportPlayerDestination(entry,user,load,()=>current)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
