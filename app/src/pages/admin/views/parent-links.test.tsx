import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
vi.mock("../../../lib/firebase", () => ({ auth: {} }));
vi.mock("../../../lib/organization-data", () => ({ clubCall: vi.fn() }));
import { SignupInvitationControls } from "./SignupStatus";
import type { ParentLinkActions } from "./SignupStatus";
import type { InvitationView } from "../lib/invitation";
import { loadingParentLinks, parentLinksController } from "../lib/parent-links";
import type { ParentLinksPort, ParentLinksView } from "../lib/parent-links";
import { guardianLinkError, parsePlayerGuardians } from "../../../lib/guardians";
import type { PlayerGuardians } from "../../../lib/guardians";
import { familyChildPath, familyPreviewRequest, previewParent } from "../../family/family";

const CODE = "PAR-" + "0123456789ABCDEF".repeat(2);
const invitation = (playerIds = ["player"]) => ({ invitationId: "invite-1", code: CODE, signupUrl: `https://posetek.net/signin#parentCode=${CODE}`, playerIds });
const guardians = (extra: Partial<PlayerGuardians> = {}): PlayerGuardians => ({ playerId: "player", issuingEnabled: true, guardians: [], invitation: null, siblingCandidates: [], ...extra });
const linked = { uid: "parent-uid", email: "parent@example.test", linkedAtMillis: Date.UTC(2026, 10, 13, 18), playerIds: ["player", "sibling"] };
const noop: ParentLinkActions = { retry() {}, copy() {}, confirmCopy() {}, cancel() {}, askRemove() {}, remove() {}, revoke() {} };
const ready: InvitationView = { invitation: { playerId: "player", status: "ready", code: "PLR-SAMPLE-123", signupUrl: "https://posetek.net/signin#playerCode=PLR-SAMPLE-123" }, pending: null, message: "", error: false };

function render(parents: Partial<ParentLinksView>, options: { admin?: boolean; invitation?: InvitationView; variant?: "admin" | "club" } = {}) {
  const view: ParentLinksView = { ...loadingParentLinks(), pending: null, ...parents };
  return renderToStaticMarkup(<MemoryRouter><SignupInvitationControls playerName="Example Player" view={options.invitation || ready} variant={options.variant}
    onGenerate={() => {}} onRetry={() => {}} onCopy={() => {}} parents={{ playerId: "player", view, admin: options.admin ?? false, actions: noop }} /></MemoryRouter>);
}

function port(reads: PlayerGuardians[]) {
  const queue = [...reads];
  const calls = { ensure: [] as string[][], copied: [] as string[], removed: [] as string[], revoked: [] as string[] };
  const value: ParentLinksPort = {
    read: vi.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0])),
    ensure: vi.fn(async ids => { calls.ensure.push(ids); return invitation(ids); }),
    revoke: vi.fn(async id => { calls.revoked.push(id); return true; }),
    remove: vi.fn(async (_player, uid) => { calls.removed.push(uid); return true; }),
    copy: vi.fn(async text => { calls.copied.push(text); }),
    names: vi.fn(async () => ({ sibling: "Sam Synthetic" })),
    isCurrent: () => true,
  };
  return { value, calls };
}
const run = (reads: PlayerGuardians[]) => {
  const p = port(reads); let view = loadingParentLinks();
  const controller = parentLinksController("player", p.value, next => { view = next; });
  return { ...p, controller, view: () => view };
};

describe("parent links in the shared signup control", () => {
  it("reads 'Parent linked' instead of 'Awaiting signup' once a parent is confirmed, and lists them", () => {
    const html = render({ data: guardians({ guardians: [linked] }), names: { sibling: "Sam Synthetic" } });
    expect(html).toContain("Parent linked"); expect(html).not.toContain("Awaiting signup");
    expect(html).toContain("parent@example.test · linked Nov 13, 2026 · also linked to Sam Synthetic");
    expect(html).toContain('aria-label="Remove parent@example.test as a parent of Example Player"');
    expect(render({ data: guardians({ guardians: [linked] }) }, { variant: "club" })).toContain("Parent linked");
  });
  it("never treats a failed read as nobody linked", () => {
    const html = render({ data: null, error: true, message: "Parent links could not be checked." });
    expect(html).toContain("Awaiting signup"); expect(html).not.toContain("Parent linked");
    expect(html).toContain("Parent links could not be checked."); expect(html).toContain("Retry parent links");
    expect(html).not.toContain("Copy parent link");
  });
  it("offers Copy parent link and code only while issuing is on, and masks the parent block", () => {
    const on = render({ data: guardians() });
    expect(on).toContain('aria-label="Copy parent link for Example Player"'); expect(on).toContain('aria-label="Copy parent code for Example Player"');
    expect(on).toMatch(/class="admin-parent-links" data-clarity-mask="true"/);
    expect(on).not.toContain(CODE);
    const off = render({ data: guardians({ issuingEnabled: false }) });
    expect(off).not.toContain("Copy parent");
  });
  it("shows an open link as pending with Revoke", () => {
    const html = render({ data: guardians({ invitation: invitation() }) });
    expect(html).toContain("Parent link pending"); expect(html).toContain('aria-label="Revoke the parent link for Example Player"');
  });
  it("shows sibling suggestions unchecked, with one confirm", () => {
    const html = render({ data: guardians(), choosing: { kind: "link", candidates: [{ playerId: "sibling", firstName: "Sam", lastName: "Synthetic" }] } });
    expect(html).toContain("Sam Synthetic"); expect(html).not.toContain("checked=\"\""); expect(html.match(/Copy parent link/g)).toHaveLength(1);
  });
  it("offers Parent view to PoseTek admins only", () => {
    expect(render({ data: guardians({ guardians: [linked] }) }, { admin: true })).toContain('href="/family?previewParent=parent-uid&amp;fromPlayer=player"');
    expect(render({ data: guardians({ guardians: [linked] }) }, { admin: false })).not.toContain("Parent view");
  });
  it("asks before removing", () => {
    const html = render({ data: guardians({ guardians: [linked] }), confirmingRemove: "parent-uid" });
    expect(html).toContain("Remove parent@example.test? They lose access to Example Player at once.");
  });
});

describe("parent links controller", () => {
  it("copies straight away without siblings, reusing the open link", async () => {
    const r = run([guardians({ invitation: invitation(["player", "sibling"]) })]);
    await r.controller.load(); await r.controller.copy("link");
    expect(r.calls.ensure).toEqual([["player", "sibling"]]); expect(r.calls.copied).toEqual([`https://posetek.net/signin#parentCode=${CODE}`]);
    expect(r.view().message).toBe("Parent link copied.");
  });
  it("re-reads before copying, asks about siblings, and the link carries only the chosen ones", async () => {
    const candidates = [{ playerId: "sibling", firstName: "Sam", lastName: "Synthetic" }, { playerId: "other", firstName: "Alex", lastName: "Synthetic" }];
    const r = run([guardians(), guardians({ siblingCandidates: candidates })]);
    await r.controller.load(); await r.controller.copy("code");
    expect(r.value.read).toHaveBeenCalledTimes(2); expect(r.calls.ensure).toEqual([]);
    expect(r.view().choosing?.candidates).toEqual(candidates);
    await r.controller.confirmCopy(["sibling", "not-offered"]);
    expect(r.calls.ensure).toEqual([["player", "sibling"]]); expect(r.calls.copied).toEqual([CODE]); expect(r.view().choosing).toBeNull();
  });
  it("does nothing while issuing is off", async () => {
    const r = run([guardians({ issuingEnabled: false })]);
    await r.controller.load(); await r.controller.copy("link");
    expect(r.calls.ensure).toEqual([]); expect(r.calls.copied).toEqual([]);
  });
  it("removes only after confirmation, and shows the server's next read", async () => {
    const r = run([guardians({ guardians: [linked] }), guardians()]);
    await r.controller.load();
    await r.controller.remove("parent-uid"); expect(r.calls.removed).toEqual([]);
    r.controller.askRemove("parent-uid"); await r.controller.remove("parent-uid");
    expect(r.calls.removed).toEqual(["parent-uid"]); expect(r.view().data?.guardians).toEqual([]); expect(r.view().message).toBe("Parent removed.");
  });
  it("revokes an open link and re-reads", async () => {
    const r = run([guardians({ invitation: invitation() }), guardians()]);
    await r.controller.load(); await r.controller.revoke("invite-1");
    expect(r.calls.revoked).toEqual(["invite-1"]); expect(r.view().data?.invitation).toBeNull();
  });
  it("shows a refused issue with fixed copy, including the six-parent limit", async () => {
    const r = run([guardians()]);
    vi.mocked(r.value.ensure).mockRejectedValueOnce(Object.assign(new Error("server text"), { code: "functions/failed-precondition", details: { reason: "limit" } }));
    await r.controller.load(); await r.controller.copy("link");
    expect(r.view().message).toBe("A chosen player already has the most parents allowed."); expect(r.view().error).toBe(true);
    expect(guardianLinkError({ code: "functions/failed-precondition", details: { reason: "issuing-disabled" } })).toBe("Parent links are not available yet.");
  });
  it("reports a failed read as unknown", async () => {
    const r = run([guardians()]); vi.mocked(r.value.read).mockRejectedValueOnce(new Error("offline"));
    await r.controller.load();
    expect(r.view().data).toBeNull(); expect(r.view().message).toBe("Parent links could not be checked.");
  });
});

describe("getPlayerGuardians response", () => {
  it("keeps each parent's children and always includes the requested player", () => {
    const parsed = parsePlayerGuardians("player", { playerId: "player", issuingEnabled: true, invitation: null, siblingCandidates: [],
      guardians: [{ uid: "parent-uid", email: null, linkedAtMillis: null, playerIds: ["sibling"] }] });
    expect(parsed.guardians[0].playerIds).toEqual(["player", "sibling"]);
  });
  it("refuses a link whose fragment does not carry its own code, or an answer for another player", () => {
    expect(() => parsePlayerGuardians("player", { ...guardians(), invitation: { ...invitation(), signupUrl: "https://posetek.net/signin#parentCode=PAR-OTHER-CODE" } })).toThrow();
    expect(() => parsePlayerGuardians("player", { ...guardians(), playerId: "other" })).toThrow();
  });
});

describe("admin Parent view of /family", () => {
  const search = "?previewParent=parent-uid&fromPlayer=player";
  it("previews for an admin only; anyone else gets the normal picker", () => {
    expect(familyPreviewRequest(search, true)).toEqual({ parentUid: "parent-uid", playerId: "player" });
    expect(familyPreviewRequest(search, false)).toBeNull();
    expect(familyPreviewRequest("?previewParent=a/b&fromPlayer=player", true)).toBeNull();
    expect(familyPreviewRequest("?fromPlayer=player", true)).toBeNull();
  });
  it("lists that parent's children, each opening the staff Player view", () => {
    expect(previewParent(guardians({ guardians: [linked] }), "parent-uid")).toEqual({ email: "parent@example.test", playerIds: ["player", "sibling"] });
    expect(previewParent(guardians({ guardians: [linked] }), "removed-parent")).toBeNull();
    expect(familyChildPath("sibling", true)).toBe("/athlete?player=sibling&workspace=player");
    expect(familyChildPath("sibling", false)).toBe("/athlete?player=sibling&userType=player&view=stats");
  });
});
