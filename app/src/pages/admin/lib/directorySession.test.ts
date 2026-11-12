import { describe, expect, it, vi } from "vitest";
import { DIRECTORY_FRESHNESS_MS, DirectorySession } from "./directorySession";
import type { DirectorySource } from "./adminDirectory";
import type { OrganizationRow } from "./accounts";

const org = (id = "club"): OrganizationRow => ({ id, name: id, schemaVersion: 2, logoUrl: null, code: "", coachIds: [] });
const context = (id = "club") => ({ role: "admin" as const, organization: { id, name: id, schemaVersion: 2 }, organizations: [], teams: [], staff: [], invitations: [], players: [] });
function fixture() {
  let now = 0;
  const source: DirectorySource = { organizations: vi.fn(async () => [org()]), context: vi.fn(async id => context(id)), roster: vi.fn(async (_org, ctx) => ({ players: [], context: ctx || context(), notices: [] })), coaches: vi.fn(), teams: vi.fn(), lookup: vi.fn() };
  const invalidation = vi.fn(() => session.clearScopes());
  const session = new DirectorySession(source, invalidation, () => now);
  session.selectOrganization("club");
  return { source, session, invalidation, advance: (ms: number) => { now += ms; } };
}
const unused = async () => { throw new Error("Retention must use its own typed reader"); };

describe("admin directory shared observations", () => {
  it("shares one context and roster across same-organization tabs and deduplicates concurrent reads", async () => {
    const { source, session } = fixture();
    const roster = session.roster(org());
    const [first, second] = await Promise.all([roster.load(unused), roster.load(unused)]);
    expect(first).toBe(second);
    expect(session.context("club").peek()?.data).toBe(first.context);
    expect(session.roster(org()).peek()?.data).toBe(first);
    await session.context("club").load(unused);
    expect(source.context).toHaveBeenCalledTimes(1); expect(source.roster).toHaveBeenCalledTimes(1);
    expect(source.roster).toHaveBeenCalledWith(org(), first.context);
    expect(source.organizations).not.toHaveBeenCalled();
  });
  it("keeps management-first reads lazy, then reuses its context for Players", async () => {
    const { source, session } = fixture();
    const ready = await session.context("club").load(unused);
    expect(source.roster).not.toHaveBeenCalled();
    await session.roster(org()).load(unused);
    expect(source.context).toHaveBeenCalledTimes(1);
    expect(source.roster).toHaveBeenCalledWith(org(), ready);
  });
  it("retains current organization choices without eagerly reading context or roster", async () => {
    const { source, session } = fixture();
    await session.organizations().load(unused); await session.organizations().load(unused);
    expect(source.organizations).toHaveBeenCalledTimes(1); expect(source.context).not.toHaveBeenCalled(); expect(source.roster).not.toHaveBeenCalled();
  });
  it("expires at sixty seconds and force refresh bypasses fresh context and roster", async () => {
    const { source, session, advance, invalidation } = fixture();
    await session.roster(org()).load(unused);
    advance(DIRECTORY_FRESHNESS_MS - 1); expect(session.roster(org()).peek()).toBeDefined();
    advance(1); expect(session.roster(org()).peek()).toBeUndefined();
    await session.roster(org()).load(unused);
    session.context("club").invalidate();
    await session.roster(org()).load(unused);
    expect(invalidation).toHaveBeenCalledTimes(1); expect(source.context).toHaveBeenCalledTimes(3); expect(source.roster).toHaveBeenCalledTimes(3);
  });
  it("discards the prior selected organization and prevents late roster publication", async () => {
    const { source, session } = fixture();
    let finish!: (value: Awaited<ReturnType<DirectorySource["roster"]>>) => void;
    vi.mocked(source.roster).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = session.roster(org()); const pending = old.load(unused);
    await vi.waitFor(() => expect(source.roster).toHaveBeenCalledTimes(1));
    session.selectOrganization("other");
    await session.roster(org("other")).load(unused);
    finish({ players: [], context: context(), notices: [] }); await pending;
    expect(old.peek()).toBeUndefined();
    session.selectOrganization("club"); await session.roster(org()).load(unused);
    expect(source.context).toHaveBeenCalledTimes(3);
  });
  it("does not start an old roster after its delayed context was invalidated", async () => {
    const { source, session } = fixture(); let finish!: (value: ReturnType<typeof context>) => void;
    vi.mocked(source.context).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = session.roster(org()).load(unused); const failure = expect(pending).rejects.toThrow("selection changed");
    await vi.waitFor(() => expect(source.context).toHaveBeenCalledTimes(1));
    session.clearScopes(); finish(context()); await failure;
    expect(source.roster).not.toHaveBeenCalled(); expect(session.context("club").peek()).toBeUndefined();
  });
  it("broadcasts mutation invalidation without dropping organization choices or retaining a failed context", async () => {
    const { source, session } = fixture();
    await session.organizations().load(unused); await session.roster(org()).load(unused);
    const changed = vi.fn(); session.context("club").subscribe(changed); session.clearScopes();
    expect(changed).toHaveBeenCalledTimes(1); expect(session.roster(org()).peek()).toBeUndefined(); expect(session.organizations().peek()).toBeDefined();
    vi.mocked(source.context).mockRejectedValueOnce(new Error("Permission denied"));
    await expect(session.context("club").load(unused)).rejects.toThrow("Permission denied");
    expect(session.context("club").peek()).toBeUndefined();
    expect(session.organizations().peek()).toBeUndefined();
    await expect(session.context("club").load(unused)).rejects.toThrow("Permission denied");
    expect(source.context).toHaveBeenCalledTimes(2);
    session.context("club").invalidate();
    await session.context("club").load(unused); expect(source.context).toHaveBeenCalledTimes(3);
  });
  it("inherits context expiry rather than renewing an old context through a new roster", async () => {
    const { source, session, advance } = fixture();
    await session.context("club").load(unused); advance(59_000);
    await session.roster(org()).load(unused); advance(2_000);
    expect(session.roster(org()).peek()).toBeUndefined();
    await session.roster(org()).load(unused);
    expect(source.context).toHaveBeenCalledTimes(2); expect(source.roster).toHaveBeenCalledTimes(2);
  });
  it("does not extend a delayed roster using a newer unrelated context observation", async () => {
    const { source, session, advance } = fixture();
    await session.context("club").load(unused); advance(59_000);
    let finish!: (value: Awaited<ReturnType<DirectorySource["roster"]>>) => void;
    vi.mocked(source.roster).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = session.roster(org()).load(unused);
    await vi.waitFor(() => expect(source.roster).toHaveBeenCalledTimes(1));
    advance(2_000); await session.context("club").load(unused);
    finish({ players: [], context: context(), notices: [] }); await pending;
    expect(session.roster(org()).peek()).toBeUndefined();
  });
  it("does not let nonserializable data turn a successful read into an error", async () => {
    const { source, session } = fixture();
    const cyclic = org() as OrganizationRow & { cyclic?: unknown }; cyclic.cyclic = cyclic;
    vi.mocked(source.organizations).mockResolvedValue([cyclic]);
    await expect(session.organizations().load(unused)).resolves.toEqual([cyclic]);
    expect(session.organizations().peek()).toBeUndefined();
  });
  it("keeps an expired display snapshot during revalidation without treating it as fresh authority", async () => {
    const { session, source, advance } = fixture();
    const handle = session.roster(org()), first = await handle.load(unused);
    advance(DIRECTORY_FRESHNESS_MS + 1);
    expect(handle.peek()).toBeUndefined(); expect(handle.snapshot?.()?.data).toBe(first);
    let finish!: (value: ReturnType<typeof context>) => void;
    vi.mocked(source.context).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = handle.load(unused);
    await vi.waitFor(() => expect(source.context).toHaveBeenCalledTimes(2));
    expect(handle.snapshot?.()?.data).toBe(first); expect(handle.peek()).toBeUndefined();
    finish(context()); await pending;
    expect(handle.peek()).toBeDefined();
    session.fail(new Error("Permission denied")); expect(handle.snapshot?.()).toBeUndefined();
  });
  it("does not reuse display snapshots across scope or mutation boundaries", async () => {
    const { session } = fixture();
    const handle = session.roster(org()); await handle.load(unused);
    session.selectOrganization("other"); expect(handle.snapshot?.()).toBeUndefined();
    session.selectOrganization("club"); const current = session.roster(org()); await current.load(unused);
    session.clearScopes(); expect(current.snapshot?.()).toBeUndefined();
  });
  it("does not retain oversized payloads", async () => {
    const { source, session } = fixture(); vi.mocked(source.organizations).mockResolvedValue([{ ...org(), name: "x".repeat(3 * 1024 * 1024) }]);
    await session.organizations().load(unused); expect(session.organizations().peek()).toBeUndefined();
  });
});
