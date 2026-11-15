import { describe, expect, it, vi } from "vitest";
import {
  addParentInvitation, captureParentInvitationLink, createInvitedParent, forgetParentInvitationLink, guardianRedeemMessage,
  initialParentInvitationLink, parentCodeFromInput, parentLinkAction, pausedRedemptionError, readParentInvitationLink,
} from "./parent-invitation-link";
import { readPlayerInvitationLink } from "./player-invitation-link";

const code = "PAR-" + "0123456789ABCDEF".repeat(2);
describe("private parent invitation links", () => {
  it.each([`#parentCode=${code}`, `?parentCode=${code}`])("prefills supported links and removes the secret: %s", suffix => {
    const result = readParentInvitationLink(`https://posetek.net/signin${suffix}`);
    expect(result.invitation).toEqual({ present: true, code });
    expect(result.cleanUrl).toBe("https://posetek.net/signin");
  });
  it("keeps the report continuation and other query parameters", () => {
    const result = readParentInvitationLink(`https://posetek.net/signin?reportPlayer=synthetic-child#parentCode=${code.toLowerCase()}`);
    expect(result.invitation.code).toBe(code.toLowerCase());
    expect(result.cleanUrl).toBe("https://posetek.net/signin?reportPlayer=synthetic-child");
  });
  it.each(["?parentCode=", "#parentCode=%3Cscript%3E", `?parentCode=${code}#parentCode=PAR-OTHER-CODE`, `?parentCode=${"A".repeat(65)}`])("rejects empty/malformed/conflicting links without leaving secrets: %s", suffix => {
    const result = readParentInvitationLink(`https://posetek.net/signin${suffix}`);
    expect(result.invitation).toEqual({ present: true, code: "" });
    expect(result.cleanUrl).toBe("https://posetek.net/signin");
  });
  it.each([`#parentCode=${code}&playerCode=PLR-SYNTHETIC-CODE`, `?playerCode=PLR-SYNTHETIC-CODE#parentCode=${code}`])("fills in neither code from a link carrying both kinds: %s", suffix => {
    const href = `https://posetek.net/signin${suffix}`;
    const parent = readParentInvitationLink(href), player = readPlayerInvitationLink(href);
    expect(parent.invitation.code).toBe(""); expect(player.invitation.code).toBe("");
    // Whichever reader runs first removes both secrets.
    expect(parent.cleanUrl).toBe("https://posetek.net/signin"); expect(player.cleanUrl).toBe("https://posetek.net/signin");
  });
  it("does not open the Parent panel for normal sign-in or other routes", () => {
    expect(readParentInvitationLink("https://posetek.net/signin?returnTo=%2Ffeed").invitation.present).toBe(false);
    expect(readParentInvitationLink(`https://posetek.net/join#parentCode=${code}`).invitation.present).toBe(false);
  });
  it("captures before render without persistent browser storage", () => {
    const replaceState = vi.fn();
    captureParentInvitationLink({ location: { href: `https://posetek.net/signin#parentCode=${code}` }, history: { state: { previous: true }, replaceState } } as any);
    expect(initialParentInvitationLink()).toEqual({ present: true, code });
    expect(replaceState).toHaveBeenCalledWith({ previous: true }, "", "https://posetek.net/signin");
    forgetParentInvitationLink();
    expect(initialParentInvitationLink()).toEqual({ present: false, code: "" });
  });
  it("accepts the boot capture from the isolated sign-in page and drops it from window", () => {
    const browser = { __posetekParentInvitation: { present: true, code }, location: { href: "https://posetek.net/signin" }, history: { state: null, replaceState: vi.fn() } } as any;
    captureParentInvitationLink(browser);
    expect(initialParentInvitationLink()).toEqual({ present: true, code });
    expect(browser.__posetekParentInvitation).toBeUndefined();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    forgetParentInvitationLink();
  });
});

describe("Add player input (§11.2)", () => {
  it.each([
    [code, code],
    [`  ${code}\n`, code],
    [`https://posetek.net/signin#parentCode=${code}`, code],
    [`Open https://posetek.net/signin#parentCode=${code} to join`, code],
    [`https://posetek.net/signin?reportPlayer=x#parentCode=${encodeURIComponent(code)}&other=1`, code],
    [`parentCode=${code.toLowerCase()}`, code.toLowerCase()],
  ])("extracts the code from %j", (input, expected) => {
    expect(parentCodeFromInput(input)).toBe(expected);
  });
  it.each(["", "   ", "parentCode=", "parentCode=%E0%A4%A", "PAR-<script>", "https://posetek.net/signin", "A".repeat(65)])("rejects %j", input => {
    expect(parentCodeFromInput(input)).toBe("");
  });
});

describe("refused parent links", () => {
  const refused = (reason: string) => Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: { reason } });
  it("names the kind of sign-in and the way out for each account the server refuses", () => {
    expect(guardianRedeemMessage(refused("player-login"))).toBe("This sign-in is a player account. To create a parent account, sign out and use a different email.");
    expect(guardianRedeemMessage(refused("staff-login"))).toMatch(/coach or staff account.*different email/);
    expect(guardianRedeemMessage(refused("admin-login"))).toMatch(/PoseTek admin account.*different email/);
    expect(guardianRedeemMessage(refused("limit"))).toMatch(/cannot add more players/);
    expect(guardianRedeemMessage(refused("deletion-pending"))).toMatch(/being deleted/);
    expect(guardianRedeemMessage(refused("redemption-disabled"))).toBe("Parent links are paused. Try again later.");
    expect(guardianRedeemMessage({ code: "functions/not-found" })).toMatch(/invalid or has already been used/);
    expect(guardianRedeemMessage({ code: "functions/internal", message: "raw secret" })).toBeNull();
  });
  it("decides the signed-in action from the resolved account without a sign-out", () => {
    expect(parentLinkAction("parent")).toEqual({ kind: "add" });
    expect(parentLinkAction(null)).toEqual({ kind: "add" });
    expect(parentLinkAction("player")).toEqual({ kind: "guidance", message: guardianRedeemMessage(refused("player-login")) });
    expect(parentLinkAction("admin")).toEqual({ kind: "guidance", message: guardianRedeemMessage(refused("admin-login")) });
    for (const role of ["manager", "coach", "independent"]) expect(parentLinkAction(role)).toEqual({ kind: "guidance", message: guardianRedeemMessage(refused("staff-login")) });
  });
});

function steps() {
  const user = { uid: "new-parent" };
  let active: typeof user | null = null;
  return {
    currentUser: vi.fn((): typeof user | null => active), validate: vi.fn(async () => true),
    create: vi.fn(async () => { active = user; return user; }), verify: vi.fn(async () => {}),
    redeem: vi.fn(async (): Promise<unknown> => ({ data: { playerIds: ["child-a", "child-b"], addedPlayerIds: ["child-a", "child-b"] } })),
    discard: vi.fn(async () => { active = null; }), resolve: vi.fn(async (): Promise<string[] | null> => null), created: vi.fn(),
  };
}
const input = { code, email: " parent@example.test ", password: "synthetic-password" };
describe("parent signup preflight and account safety", () => {
  it("rejects an invalid or used code without creating an account or sending verification", async () => {
    const calls = steps(); calls.validate.mockResolvedValue(false);
    await expect(createInvitedParent(input, calls)).rejects.toThrow("already been used");
    expect(calls.create).not.toHaveBeenCalled(); expect(calls.verify).not.toHaveBeenCalled(); expect(calls.redeem).not.toHaveBeenCalled();
  });
  it("fails closed on validation/network errors", async () => {
    const calls = steps(); calls.validate.mockRejectedValue(new Error("Network unavailable"));
    await expect(createInvitedParent(input, calls)).rejects.toThrow("Network unavailable");
    expect(calls.create).not.toHaveBeenCalled();
  });
  it("never creates/replaces an account while already signed in", async () => {
    const calls = steps(); calls.currentUser.mockReturnValue({ uid: "existing-user" });
    await expect(createInvitedParent(input, calls)).rejects.toThrow("already signed in");
    expect(calls.validate).not.toHaveBeenCalled(); expect(calls.create).not.toHaveBeenCalled(); expect(calls.discard).not.toHaveBeenCalled();
  });
  it("rechecks sign-in after validation", async () => {
    const calls = steps(); calls.currentUser.mockReturnValueOnce(null).mockReturnValue({ uid: "existing-user" });
    await expect(createInvitedParent(input, calls)).rejects.toThrow("sign-in changed");
    expect(calls.create).not.toHaveBeenCalled();
  });
  it("validates, creates, verifies and redeems, returning every linked child", async () => {
    const calls = steps();
    expect(await createInvitedParent(input, calls)).toEqual(["child-a", "child-b"]);
    expect(calls.create).toHaveBeenCalledWith("parent@example.test", input.password);
    expect(calls.redeem).toHaveBeenCalledWith(code);
    expect(calls.validate.mock.invocationCallOrder[0]).toBeLessThan(calls.create.mock.invocationCallOrder[0]);
    expect(calls.verify.mock.invocationCallOrder[0]).toBeLessThan(calls.redeem.mock.invocationCallOrder[0]);
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it.each(["functions/not-found", "functions/failed-precondition", "functions/invalid-argument", "functions/permission-denied"])("cleans only this new account when redemption is refused (%s)", async failure => {
    const calls = steps(); calls.redeem.mockRejectedValue(Object.assign(new Error("Refused"), { code: failure }));
    await expect(createInvitedParent(input, calls)).rejects.toThrow("Refused");
    expect(calls.resolve).toHaveBeenCalledWith({ uid: "new-parent" });
    expect(calls.discard).toHaveBeenCalledWith({ uid: "new-parent" });
  });
  it("never deletes the account after successful redemption with an unexpected response", async () => {
    const calls = steps(); calls.redeem.mockResolvedValue({ data: { playerIds: [] } });
    await expect(createInvitedParent(input, calls)).rejects.toThrow("account was created");
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it("reconciles a successful link whose response was lost, from the caller's own guardians record", async () => {
    const calls = steps(); calls.redeem.mockRejectedValue(new Error("Network error")); calls.resolve.mockResolvedValue(["child-a"]);
    expect(await createInvitedParent(input, calls)).toEqual(["child-a"]);
    expect(calls.resolve.mock.invocationCallOrder[0]).toBeGreaterThan(calls.redeem.mock.invocationCallOrder[0]);
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it("retains the account when the guardians record is unreadable (rules not yet published)", async () => {
    // The real resolve (findGuardian) answers a denied read with null, never a rejection.
    const calls = steps(); calls.redeem.mockRejectedValue(new Error("Network error"));
    calls.resolve.mockResolvedValue(null);
    await expect(createInvitedParent(input, calls)).rejects.toThrow("linking could not be confirmed");
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it("retains the account when the guardians read itself fails offline", async () => {
    const calls = steps(); calls.redeem.mockRejectedValue(new Error("Network error"));
    calls.resolve.mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(createInvitedParent(input, calls)).rejects.toThrow("could not be confirmed");
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it("retains an account when the link outcome is unknown, and resumes without another Auth creation", async () => {
    const calls = steps(); calls.redeem.mockRejectedValueOnce(new Error("Network error"));
    await expect(createInvitedParent(input, calls)).rejects.toThrow("linking could not be confirmed");
    expect(calls.discard).not.toHaveBeenCalled();
    expect(await createInvitedParent(input, calls, { uid: "new-parent" })).toEqual(["child-a", "child-b"]);
    expect(calls.create).toHaveBeenCalledTimes(1); expect(calls.verify).toHaveBeenCalledTimes(2);
  });
  it("retries a lost redemption for the same login without the preflight, which now reads the code as used", async () => {
    const calls = steps(); calls.redeem.mockRejectedValueOnce(new Error("Network error"));
    await expect(createInvitedParent(input, calls)).rejects.toThrow("linking could not be confirmed");
    calls.validate.mockResolvedValue(false); calls.validate.mockClear();
    expect(await createInvitedParent(input, calls, { uid: "new-parent" })).toEqual(["child-a", "child-b"]);
    expect(calls.validate).not.toHaveBeenCalled(); expect(calls.redeem).toHaveBeenCalledTimes(2);
  });
  it("resumes straight to the linked children when a retained account was in fact linked", async () => {
    const calls = steps(); calls.currentUser.mockReturnValue({ uid: "new-parent" }); calls.resolve.mockResolvedValue(["child-a"]);
    expect(await createInvitedParent(input, calls, { uid: "new-parent" })).toEqual(["child-a"]);
    expect(calls.validate).not.toHaveBeenCalled(); expect(calls.redeem).not.toHaveBeenCalled();
  });
  it("does not link under an account switched during email verification", async () => {
    const calls = steps(); calls.verify.mockImplementation(async () => { calls.currentUser.mockReturnValue({ uid: "different-user" }); });
    await expect(createInvitedParent(input, calls)).rejects.toThrow("sign-in changed");
    expect(calls.redeem).not.toHaveBeenCalled();
  });
  it("retains an already-linked account if identity changes after redemption", async () => {
    const calls = steps(); calls.redeem.mockImplementation(async () => { calls.currentUser.mockReturnValue({ uid: "different-user" }); return { data: { playerIds: ["child-a"] } }; });
    await expect(createInvitedParent(input, calls)).rejects.toThrow("account was created");
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it("does not report a reconciled link to an account that replaced the new one", async () => {
    const calls = steps(); calls.redeem.mockRejectedValue(new Error("Network error"));
    calls.resolve.mockImplementation(async () => { calls.currentUser.mockReturnValue({ uid: "different-user" }); return ["child-a"]; });
    await expect(createInvitedParent(input, calls)).rejects.toThrow("account was created");
    expect(calls.discard).not.toHaveBeenCalled();
  });
  it("never deletes a retained account when sign-in changes during resumed resolution", async () => {
    const calls = steps(); calls.currentUser.mockReturnValue({ uid: "new-parent" });
    calls.resolve.mockImplementation(async () => { calls.currentUser.mockReturnValue({ uid: "different-user" }); return ["child-a"]; });
    await expect(createInvitedParent(input, calls, { uid: "new-parent" })).rejects.toThrow("sign-in changed");
    expect(calls.discard).not.toHaveBeenCalled(); expect(calls.redeem).not.toHaveBeenCalled();
  });
});

describe("paused parent links (redemption-disabled)", () => {
  const paused = () => Object.assign(new Error("paused"), { code: "functions/failed-precondition", details: { reason: "redemption-disabled" } });
  it("stops a new sign-up without keeping the login, and says links are paused", async () => {
    const calls = steps(); calls.redeem.mockRejectedValue(paused());
    const error = await createInvitedParent(input, calls).catch(failure => failure);
    expect(guardianRedeemMessage(error)).toBe("Parent links are paused. Try again later.");
    expect(calls.discard).toHaveBeenCalledWith({ uid: "new-parent" });
  });
  it("D3: a paused preflight creates no login at all and says links are paused", async () => {
    const calls = steps(); calls.validate.mockRejectedValue(pausedRedemptionError());
    const error = await createInvitedParent(input, calls).catch(failure => failure);
    expect(guardianRedeemMessage(error)).toBe("Parent links are paused. Try again later.");
    expect(calls.create).not.toHaveBeenCalled(); expect(calls.redeem).not.toHaveBeenCalled(); expect(calls.discard).not.toHaveBeenCalled();
  });
  it("gives Add to my account and Add player the same message", async () => {
    const error = await addParentInvitation(code, { currentUid: () => "parent", redeem: async () => { throw paused(); } }).catch(failure => failure);
    expect(guardianRedeemMessage(error)).toBe("Parent links are paused. Try again later.");
  });
});

describe("Add to my account / Add player", () => {
  it("redeems for the signed-in login and returns every linked child", async () => {
    const redeem = vi.fn(async () => ({ data: { playerIds: ["child-a", "child-b", "child-c"], addedPlayerIds: ["child-c"] } }));
    expect(await addParentInvitation(code, { currentUid: () => "parent", redeem })).toEqual(["child-a", "child-b", "child-c"]);
    expect(redeem).toHaveBeenCalledWith(code);
  });
  it("treats a repeat by the same login as success", async () => {
    const redeem = vi.fn(async () => ({ data: { playerIds: ["child-a"], addedPlayerIds: [] } }));
    expect(await addParentInvitation(code, { currentUid: () => "parent", redeem })).toEqual(["child-a"]);
  });
  it("does not report the result to a login that replaced the caller", async () => {
    let uid = "parent";
    const redeem = vi.fn(async () => { uid = "someone-else"; return { data: { playerIds: ["child-a"] } }; });
    await expect(addParentInvitation(code, { currentUid: () => uid, redeem })).rejects.toThrow("sign-in changed");
  });
  it("calls nothing while signed out or for a malformed code", async () => {
    const redeem = vi.fn();
    await expect(addParentInvitation(code, { currentUid: () => null, redeem })).rejects.toThrow("Sign in");
    await expect(addParentInvitation("bad", { currentUid: () => "parent", redeem })).rejects.toThrow("invalid");
    expect(redeem).not.toHaveBeenCalled();
  });
});
