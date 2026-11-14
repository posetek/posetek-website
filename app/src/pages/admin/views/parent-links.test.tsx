import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
vi.mock("../../../lib/firebase", () => ({ auth: {} }));
vi.mock("../../../lib/organization-data", () => ({ clubCall: vi.fn() }));
import SignupStatus, { SignupInvitationControls } from "./SignupStatus";
import type { ParentLinkActions, ParentLinksProps } from "./SignupStatus";
import type { InvitationView } from "../lib/invitation";
import { loadingParentLinks, parentLinksController, showsParentLinked, signedOutParentLinks } from "../lib/parent-links";
import type { ParentLinksPort, ParentLinksView } from "../lib/parent-links";
import { ensureGuardianInvitation, getPlayerGuardians, guardianLinkError, parentLinkedFrom, parsePlayerGuardians, resetGuardianReadReporting } from "../../../lib/guardians";
import type { PlayerGuardians } from "../../../lib/guardians";
import { familyChildPath, familyPreviewRequest, previewParent } from "../../family/family";

const CODE = "PAR-" + "0123456789ABCDEF".repeat(2);
const invitation = (playerIds = ["player"]) => ({ invitationId: "invite-1", code: CODE, signupUrl: `https://posetek.net/signin#parentCode=${CODE}`, playerIds });
const guardians = (extra: Partial<PlayerGuardians> = {}): PlayerGuardians => {
  const invitationOnly = extra.invitation ?? null;
  return { playerId: "player", issuingEnabled: true, guardians: [], invitation: null, siblingCandidates: [], otherOpenInvitationCount: 0,
    invitations: invitationOnly ? [invitationOnly] : [], ...extra };
};
const linked = { uid: "parent-uid", email: "parent@example.test", linkedAtMillis: Date.UTC(2026, 10, 13, 18), playerIds: ["player", "sibling"] };
const noop: ParentLinkActions = { retry() {}, copy() {}, confirmCopy() {}, cancel() {}, askRemove() {}, remove() {}, askRevoke() {}, revoke() {} };
const ready: InvitationView = { invitation: { playerId: "player", status: "ready", code: "PLR-SAMPLE-123", signupUrl: "https://posetek.net/signin#playerCode=PLR-SAMPLE-123" }, pending: null, message: "", error: false };

function render(parents: Partial<ParentLinksView>, options: { admin?: boolean; invitation?: InvitationView; variant?: "admin" | "club"; open?: boolean; parentLinked?: boolean } = {}) {
  const view: ParentLinksView = { ...loadingParentLinks(), pending: null, ...parents };
  const props: ParentLinksProps = { playerId: "player", view, admin: options.admin ?? false, actions: noop, open: options.open ?? true, onToggle() {}, parentLinked: options.parentLinked };
  return renderToStaticMarkup(<MemoryRouter><SignupInvitationControls playerName="Example Player" view={options.invitation || ready} variant={options.variant}
    onGenerate={() => {}} onRetry={() => {}} onCopy={() => {}} parents={props} /></MemoryRouter>);
}

function port(reads: PlayerGuardians[], answers: { removed?: boolean; revoked?: boolean } = {}) {
  const queue = [...reads];
  const calls = { ensure: [] as string[][], copied: [] as string[], removed: [] as string[], revoked: [] as string[] };
  const value: ParentLinksPort = {
    read: vi.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0])),
    ensure: vi.fn(async ids => { calls.ensure.push(ids); return invitation(ids); }),
    revoke: vi.fn(async id => { calls.revoked.push(id); return answers.revoked ?? true; }),
    remove: vi.fn(async (_player, uid) => { calls.removed.push(uid); return answers.removed ?? true; }),
    copy: vi.fn(async text => { calls.copied.push(text); }),
    names: vi.fn(async () => ({ sibling: "Sam Synthetic", cousin: "Cam Synthetic" })),
    isCurrent: () => true,
  };
  return { value, calls };
}
const run = (reads: PlayerGuardians[], answers?: { removed?: boolean; revoked?: boolean }) => {
  const p = port(reads, answers); let view = loadingParentLinks();
  const controller = parentLinksController("player", p.value, next => { view = next; });
  return { ...p, controller, view: () => view };
};

describe("parent links in the shared signup control", () => {
  it("makes no parent call until the row's Parents disclosure is opened", () => {
    const closed = render({ data: null }, { open: false });
    expect(closed).toContain('aria-label="Parents for Example Player"'); expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain("admin-parent-links");
    // Rendering the live row never reads parent links on its own.
    const html = renderToStaticMarkup(<MemoryRouter><SignupStatus playerId="player" playerName="Example Player" registered /></MemoryRouter>);
    expect(html).toContain("Parents"); expect(html).not.toContain("Checking parent links");
  });
  it("derives Parent linked from roster data without a read, and keeps today's status when there is none", () => {
    expect(render({ data: null }, { open: false, parentLinked: true })).toContain("Parent linked");
    const none = render({ data: null }, { open: false });
    expect(none).toContain("Awaiting signup"); expect(none).not.toContain("Parent linked");
    expect(parentLinkedFrom({ guardianUIDs: ["p"] })).toBe(true);
    expect(parentLinkedFrom({ guardianUIDs: [] })).toBe(false);
    expect(parentLinkedFrom({ parentLinked: true })).toBe(true);
    expect(parentLinkedFrom({ firstName: "Avery" })).toBeUndefined();
    // A completed read wins over the roster hint.
    const view = (data: PlayerGuardians | null): ParentLinksView => ({ ...loadingParentLinks(), pending: null, data });
    expect(showsParentLinked(view(guardians()), true)).toBe(false);
    expect(showsParentLinked(view(guardians({ guardians: [linked] })), false)).toBe(true);
    expect(showsParentLinked(view(null), true)).toBe(true);
  });
  it("reads 'Parent linked' instead of 'Awaiting signup' once a parent is confirmed, and lists them", () => {
    const html = render({ data: guardians({ guardians: [linked] }), names: { sibling: "Sam Synthetic" } });
    expect(html).toContain("Parent linked"); expect(html).not.toContain("Awaiting signup");
    expect(html).toContain("parent@example.test · linked Nov 13, 2026 · also linked to Sam Synthetic");
    expect(html).toContain('aria-label="Remove parent@example.test as a parent of Example Player"');
    expect(render({ data: guardians({ guardians: [linked] }) }, { variant: "club" })).toContain("Parent linked");
  });
  it("says sign in again when Parents is opened signed out, never an endless check", () => {
    const html = render(signedOutParentLinks());
    expect(html).toContain("Sign in again to manage parent links.");
    expect(html).not.toContain("Checking parent links"); expect(html).not.toContain("Retry parent links");
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
    expect(render({ data: guardians({ issuingEnabled: false }) })).not.toContain("Copy parent");
  });
  it("shows an open link as pending with the players it covers, and asks before revoking", () => {
    const html = render({ data: guardians({ invitation: invitation(["player", "sibling"]) }), names: { sibling: "Sam Synthetic" } });
    expect(html).toContain("Parent link pending · Example Player, Sam Synthetic");
    expect(html).toContain('aria-label="Revoke the parent link for Example Player, Sam Synthetic"');
    expect(html).not.toContain("It stops working at once");
    const confirming = render({ data: guardians({ invitation: invitation(["player", "sibling"]) }), names: { sibling: "Sam Synthetic" }, confirmingRevoke: "invite-1" });
    expect(confirming).toContain("Revoke the parent link for Example Player, Sam Synthetic? It stops working at once.");
  });
  it("lists every open link this account may manage, with players and created date, and counts the others", () => {
    const newest = { ...invitation(["player", "sibling"]), invitationId: "invite-2", createdAtMillis: Date.UTC(2026, 10, 14, 18) };
    const older = { ...invitation(["player"]), invitationId: "invite-1", createdAtMillis: Date.UTC(2026, 10, 12, 18) };
    const html = render({ data: guardians({ invitation: newest, invitations: [newest, older], otherOpenInvitationCount: 2 }), names: { sibling: "Sam Synthetic" } });
    expect(html).toContain("Parent link pending · Example Player, Sam Synthetic · created Nov 14, 2026");
    expect(html).toContain("Parent link pending · Example Player · created Nov 12, 2026");
    expect(html.indexOf("created Nov 14")).toBeLessThan(html.indexOf("created Nov 12"));
    expect(html).toContain("2 other parent links are open that this account cannot manage.");
    const confirming = render({ data: guardians({ invitation: newest, invitations: [newest, older] }), confirmingRevoke: "invite-1" });
    expect(confirming).toContain("Revoke the parent link for Example Player? It stops working at once.");
    expect(confirming.match(/It stops working at once/g)).toHaveLength(1);
    expect(render({ data: guardians({ otherOpenInvitationCount: 1 }) })).toContain("1 other parent link is open that this account cannot manage.");
  });
  it("shows the open link's children as fixed and the suggestions unchecked, with one confirm", () => {
    const html = render({ data: guardians(), names: { sibling: "Sam Synthetic" }, choosing: { kind: "link", fixed: ["player", "sibling"], epoch: 1, candidates: [{ playerId: "cousin", firstName: "Cam", lastName: "Synthetic" }] } });
    expect(html).toMatch(/<input type="checkbox" disabled="" checked=""\/>Example Player/);
    expect(html).toMatch(/<input type="checkbox" disabled="" checked=""\/>Sam Synthetic/);
    expect(html).toMatch(/<input type="checkbox"\/>Cam Synthetic/);
    expect(html.match(/Copy parent link/g)).toHaveLength(1);
  });
  it("offers Parent view to PoseTek admins only", () => {
    expect(render({ data: guardians({ guardians: [linked] }) }, { admin: true })).toContain('href="/family?previewParent=parent-uid&amp;fromPlayer=player"');
    expect(render({ data: guardians({ guardians: [linked] }) }, { admin: false })).not.toContain("Parent view");
  });
  it("asks before removing", () => {
    expect(render({ data: guardians({ guardians: [linked] }), confirmingRemove: "parent-uid" })).toContain("Remove parent@example.test? They lose access to Example Player at once.");
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
  it("keeps the open link's children when siblings are added", async () => {
    const open = guardians({ invitation: invitation(["player", "sibling"]), siblingCandidates: [{ playerId: "cousin", firstName: "Cam", lastName: "Synthetic" }] });
    const r = run([open]);
    await r.controller.load(); await r.controller.copy("link");
    expect(r.view().choosing?.fixed).toEqual(["player", "sibling"]);
    await r.controller.confirmCopy([]);
    expect(r.calls.ensure).toEqual([["player", "sibling"]]);
    await r.controller.copy("link"); await r.controller.confirmCopy(["cousin"]);
    expect(r.calls.ensure.at(-1)).toEqual(["player", "sibling", "cousin"]);
  });
  it("opens the chooser with a new epoch every time, so earlier ticks never return", async () => {
    const r = run([guardians({ siblingCandidates: [{ playerId: "sibling", firstName: "Sam", lastName: "Synthetic" }] })]);
    await r.controller.load(); await r.controller.copy("link");
    const first = r.view().choosing!.epoch;
    r.controller.cancel(); expect(r.view().choosing).toBeNull();
    await r.controller.copy("link"); expect(r.view().choosing!.epoch).not.toBe(first);
    r.controller.askRemove("parent-uid"); expect(r.view().choosing).toBeNull();
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
  it("says Parent removed only when the server answers true", async () => {
    const r = run([guardians({ guardians: [linked] })], { removed: false });
    await r.controller.load(); r.controller.askRemove("parent-uid"); await r.controller.remove("parent-uid");
    expect(r.view().message).toBe(""); expect(r.view().data?.guardians).toEqual([linked]);
  });
  it("revokes only after confirmation, re-reads, and says so only on true", async () => {
    const r = run([guardians({ invitation: invitation() }), guardians()]);
    await r.controller.load();
    await r.controller.revoke("invite-1"); expect(r.calls.revoked).toEqual([]);
    r.controller.askRevoke("invite-1"); await r.controller.revoke("invite-1");
    expect(r.calls.revoked).toEqual(["invite-1"]); expect(r.view().data?.invitation).toBeNull(); expect(r.view().message).toBe("Parent link revoked.");
    const refused = run([guardians({ invitation: invitation() })], { revoked: false });
    await refused.controller.load(); refused.controller.askRevoke("invite-1"); await refused.controller.revoke("invite-1");
    expect(refused.view().message).toBe(""); expect(refused.view().data?.invitation?.invitationId).toBe("invite-1");
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

describe("guardian callables", () => {
  beforeEach(resetGuardianReadReporting);
  it("reads every visible open link and the count of the others, and tolerates a server without them", () => {
    const newest = { ...invitation(["player", "sibling"]), invitationId: "invite-2", createdAtMillis: 1_794_000_000_000 };
    const parsed = parsePlayerGuardians("player", { playerId: "player", issuingEnabled: true, guardians: [], siblingCandidates: [],
      invitation: newest, invitations: [newest, { ...invitation(), createdAtMillis: null }], otherOpenInvitationCount: 3 });
    expect(parsed.invitations.map(entry => entry.invitationId)).toEqual(["invite-2", "invite-1"]);
    expect(parsed.otherOpenInvitationCount).toBe(3);
    const older = parsePlayerGuardians("player", { playerId: "player", issuingEnabled: true, guardians: [], siblingCandidates: [], invitation: invitation() });
    expect(older.invitations.map(entry => entry.invitationId)).toEqual(["invite-1"]); expect(older.otherOpenInvitationCount).toBe(0);
    expect(parsePlayerGuardians("player", { playerId: "player", issuingEnabled: true, guardians: [], siblingCandidates: [], invitation: null }).invitations).toEqual([]);
    expect(() => parsePlayerGuardians("player", { ...guardians(), otherOpenInvitationCount: -1 })).toThrow();
    expect(() => parsePlayerGuardians("player", { ...guardians(), invitations: [{ ...invitation(), createdAtMillis: "yesterday" }] })).toThrow();
  });
  it("keeps each parent's children and always includes the requested player", () => {
    const parsed = parsePlayerGuardians("player", { playerId: "player", issuingEnabled: true, invitation: null, siblingCandidates: [],
      guardians: [{ uid: "parent-uid", email: null, linkedAtMillis: null, playerIds: ["sibling"] }] });
    expect(parsed.guardians[0].playerIds).toEqual(["player", "sibling"]);
  });
  it("refuses a link whose fragment does not carry its own code, or an answer for another player", () => {
    expect(() => parsePlayerGuardians("player", { ...guardians(), invitation: { ...invitation(), signupUrl: "https://posetek.net/signin#parentCode=PAR-OTHER-CODE" } })).toThrow();
    expect(() => parsePlayerGuardians("player", { ...guardians(), playerId: "other" })).toThrow();
  });
  it("copies a link only when it carries exactly the chosen children", async () => {
    const call = (playerIds: string[]) => async () => invitation(playerIds);
    expect((await ensureGuardianInvitation(["sibling", "player"], call(["player", "sibling"]))).playerIds).toEqual(["player", "sibling"]);
    await expect(ensureGuardianInvitation(["player"], call(["player", "sibling"]))).rejects.toThrow("does not match");
    await expect(ensureGuardianInvitation(["player", "sibling"], call(["player"]))).rejects.toThrow("does not match");
  });
  it("reports a failed read at most once per page", async () => {
    const report = vi.fn(), failing = async () => { throw Object.assign(new Error("not found"), { code: "functions/not-found" }); };
    await expect(getPlayerGuardians("a", failing, report)).rejects.toThrow();
    await expect(getPlayerGuardians("b", failing, report)).rejects.toThrow();
    expect(report).toHaveBeenCalledOnce();
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
