import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectorySource } from "./adminDirectory";
const harness = vi.hoisted(() => ({ user: { uid: "admin" } as { uid: string } | null, observers: [] as ((user: { uid: string } | null) => void)[], invalidations: [] as (() => void)[] }));
vi.mock("../../../lib/firebase", () => ({ auth: {
  get currentUser() { return harness.user; },
  onAuthStateChanged(listener: (user: { uid: string } | null) => void) { harness.observers.push(listener); queueMicrotask(() => listener(harness.user)); return () => {}; },
} }));
vi.mock("../../../lib/organization-data", () => ({ subscribeClubContextInvalidation: (listener: () => void) => { harness.invalidations.push(listener); }, invalidateClubContext: () => harness.invalidations.forEach(listener => listener()) }));
const unused = async () => { throw new Error("unused"); };
const source = () => ({ organizations: vi.fn(async () => []), context: vi.fn(async () => ({ role: "admin", organization: { id: "club" } })), roster: vi.fn(), coaches: vi.fn(), teams: vi.fn(), lookup: vi.fn() }) as unknown as DirectorySource;
beforeEach(() => { vi.resetModules(); harness.user = { uid: "admin" }; harness.observers = []; harness.invalidations = []; });
function signIn(uid: string | null) { harness.user = uid ? { uid } : null; harness.observers.forEach(observer => observer(harness.user)); }

describe("directory lifetime boundaries", () => {
  it("clears sign-out followed by same UID even without a mounted directory tab", async () => {
    const { directorySession } = await import("./directoryRetention"); const backend = source();
    const session = directorySession(backend); await session.organizations().load(unused);
    signIn(null); signIn("admin");
    expect(session.organizations().peek()).toBeUndefined();
    await directorySession(backend).organizations().load(unused);
    expect(backend.organizations).toHaveBeenCalledTimes(2);
  });
  it("discards source and actor observations, including a delayed old read", async () => {
    const { directorySession } = await import("./directoryRetention"); const backend = source();
    let finish!: (rows: []) => void; vi.mocked(backend.organizations).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = directorySession(backend); const pending = old.organizations().load(unused);
    await vi.waitFor(() => expect(backend.organizations).toHaveBeenCalledTimes(1));
    signIn("other"); finish([]); await pending; expect(old.organizations().peek()).toBeUndefined();
    await old.organizations().load(unused);
    directorySession(source()); expect(old.organizations().peek()).toBeUndefined();
  });
  it("fails closed across directory observations after a report authority rejection until explicit invalidation", async () => {
    const { directorySession, failDirectorySession } = await import("./directoryRetention");
    const backend = source(); const session = directorySession(backend); session.selectOrganization("club");
    await session.organizations().load(unused); await session.context("club").load(unused);
    const changed = vi.fn(); session.organizations().subscribe(changed);
    failDirectorySession(new Error("Permission denied"));
    expect(changed).toHaveBeenCalledTimes(1); expect(session.organizations().peek()).toBeUndefined(); expect(session.context("club").peek()).toBeUndefined();
    await expect(session.context("club").load(unused)).rejects.toThrow("Permission denied");
    expect(backend.context).toHaveBeenCalledTimes(1);
    harness.invalidations.forEach(listener => listener());
    await session.context("club").load(unused); expect(backend.context).toHaveBeenCalledTimes(2);
  });
  it("global context invalidation removes shared scope while retaining organization choices", async () => {
    const { directorySession } = await import("./directoryRetention"); const backend = source(); const session = directorySession(backend); session.selectOrganization("club");
    await session.organizations().load(unused); await session.context("club").load(unused);
    harness.invalidations.forEach(listener => listener());
    expect(session.context("club").peek()).toBeUndefined(); expect(session.organizations().peek()).toBeDefined();
  });
});
