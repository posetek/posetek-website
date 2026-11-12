import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "viewer" } as { uid: string } | null,
  listeners: [] as ((user: unknown) => void)[],
  call: vi.fn(),
  downloadUrl: vi.fn(),
}));
vi.mock("../../../lib/firebase", () => ({
  default: {},
  auth: { get currentUser() { return mocks.user; }, onAuthStateChanged: (listener: (user: unknown) => void) => { mocks.listeners.push(listener); return () => {}; } },
  db: {},
  cloud: { httpsCallable: (name: string) => (data: unknown) => mocks.call(name, data) },
  storage: { ref: () => ({ child: () => ({ getDownloadURL: mocks.downloadUrl }) }) },
}));

import { authArtifacts, fetchJson } from "./loaders";
import type { Drill } from "./drills";
import { ARTIFACTS_TTL_MS, FILE_TTL_MS, URL_EXPIRY_MARGIN_MS, clearReplayCache, createMemoryCache, fileKey, remember, replayCacheStats } from "./replay-cache";
import { warmRepFiles } from "./warm-rep-files";

const jump = { key: "jump", artifacts: ["pose.json", "metadata.json"] } as unknown as Drill;
const sprint = { key: "sprint", artifacts: ["metadata.json", "tracking.json"] } as unknown as Drill;
const signed = (path: string, signature = "a") => `https://storage.googleapis.com/bucket/${path}?X-Goog-Signature=${signature}`;
const media = (repId: string, extra: Record<string, unknown> = {}) => ({
  artifactUrls: { "pose.json": signed(`p/${repId}/pose.json`), "metadata.json": signed(`p/${repId}/metadata.json`) },
  mediaUrl: null, source: "recording", expiresAtMillis: Date.now() + 15 * 60_000,
  resultStatus: { qualified: true, duplicate: false, reason: "", revisionId: null }, ...extra,
});
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const okJson = (body: unknown) => ({ ok: true, status: 200, headers: { get: (name: string) => name === "content-length" ? String(JSON.stringify(body).length) : null }, json: async () => body });
const fetchMock = vi.fn();
const callsTo = (name: string) => mocks.call.mock.calls.filter(([called]) => called === name).length;

beforeEach(() => {
  mocks.user = { uid: "viewer" };
  mocks.call.mockReset(); mocks.downloadUrl.mockReset(); fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearReplayCache();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("authArtifacts on a miss", () => {
  it("asks the media endpoint exactly as before and returns its answer, or {} when it is empty", async () => {
    const answer = media("r1");
    mocks.call.mockResolvedValueOnce({ data: answer }).mockResolvedValueOnce({ data: null });
    expect(await authArtifacts(jump, { id: "r1" }, "p")).toBe(answer);
    expect(mocks.call).toHaveBeenCalledWith("getAthleteRepMedia", { playerId: "p", drill: "jump", repId: "r1" });
    expect(await authArtifacts(jump, { id: "r2" }, "p")).toEqual({});
  });
  it("passes an endpoint failure through unchanged", async () => {
    mocks.call.mockRejectedValueOnce(new Error("permission-denied"));
    await expect(authArtifacts(jump, { id: "r1" }, "p")).rejects.toThrow("permission-denied");
  });
});

describe("fetchJson on a miss", () => {
  it("returns null for a missing URL without a request, and fetches with no-store", async () => {
    expect(await fetchJson(null)).toBeNull();
    expect(await fetchJson(undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(okJson({ frames: [1] }));
    expect(await fetchJson(signed("a/pose.json"))).toEqual({ frames: [1] });
    expect(fetchMock).toHaveBeenCalledWith(signed("a/pose.json"), { cache: "no-store" });
  });
  it("throws the same error for a failed response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, headers: { get: () => null }, json: async () => ({}) });
    await expect(fetchJson(signed("a/pose.json"))).rejects.toThrow("Could not load 403");
  });
});

describe("reuse", () => {
  it("answers the second request for a rep and a file from memory", async () => {
    mocks.call.mockResolvedValue({ data: media("r1") });
    fetchMock.mockResolvedValue(okJson({ frames: [1, 2] }));
    const first = await authArtifacts(jump, { id: "r1" }, "p");
    expect(await authArtifacts(jump, { id: "r1" }, "p")).toBe(first);
    expect(callsTo("getAthleteRepMedia")).toBe(1);
    const pose = await fetchJson(first.artifactUrls!["pose.json"]);
    expect(await fetchJson(first.artifactUrls!["pose.json"])).toBe(pose);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps file contents by storage location, so a newly signed URL for the same file reuses them", async () => {
    fetchMock.mockResolvedValue(okJson({ frames: [] }));
    await fetchJson(signed("a/pose.json", "first"));
    await fetchJson(signed("a/pose.json", "second"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fileKey(signed("a/pose.json", "x"))).toBe("https://storage.googleapis.com/bucket/a/pose.json");
    expect(fileKey("https://firebasestorage.googleapis.com/v0/b/bucket/o/a%2Fpose.json?alt=media&token=t")).toBe("https://firebasestorage.googleapis.com/v0/b/bucket/o/a%2Fpose.json");
    expect(fileKey("https://example.com/a.json?v=1")).toBe("https://example.com/a.json?v=1");
  });
  it("shares a request already in flight instead of repeating it", async () => {
    const answer = deferred<{ data: unknown }>(), file = deferred<unknown>();
    mocks.call.mockReturnValue(answer.promise); fetchMock.mockReturnValue(file.promise);
    const both = Promise.all([authArtifacts(jump, { id: "r1" }, "p"), authArtifacts(jump, { id: "r1" }, "p")]);
    const files = Promise.all([fetchJson(signed("a/pose.json")), fetchJson(signed("a/pose.json", "other"))]);
    answer.resolve({ data: media("r1") }); file.resolve(okJson({ frames: [3] }));
    const [[a, b], [x, y]] = await Promise.all([both, files]);
    expect(a).toBe(b); expect(x).toBe(y);
    expect(callsTo("getAthleteRepMedia")).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps different reps, athletes and drills apart", async () => {
    mocks.call.mockImplementation(async (_name, data: { repId: string }) => ({ data: media(data.repId) }));
    await authArtifacts(jump, { id: "r1" }, "p");
    await authArtifacts(jump, { id: "r2" }, "p");
    await authArtifacts(jump, { id: "r1" }, "q");
    await authArtifacts(sprint, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(4);
  });
});

describe("failures", () => {
  it("never keeps a failed load: the next request tries again", async () => {
    mocks.call.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce({ data: media("r1") });
    await expect(authArtifacts(jump, { id: "r1" }, "p")).rejects.toThrow("unavailable");
    expect((await authArtifacts(jump, { id: "r1" }, "p")).artifactUrls).toBeTruthy();
    fetchMock.mockRejectedValueOnce(new TypeError("Load failed")).mockResolvedValueOnce(okJson({ ok: 1 }));
    await expect(fetchJson(signed("a/metadata.json"))).rejects.toThrow("Load failed");
    expect(await fetchJson(signed("a/metadata.json"))).toEqual({ ok: 1 });
    expect(callsTo("getAthleteRepMedia")).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("gives every caller sharing a failed request the failure, then retries", async () => {
    const answer = deferred<{ data: unknown }>();
    mocks.call.mockReturnValueOnce(answer.promise).mockResolvedValueOnce({ data: media("r1") });
    const pair = Promise.allSettled([authArtifacts(jump, { id: "r1" }, "p"), authArtifacts(jump, { id: "r1" }, "p")]);
    answer.reject(new Error("deadline-exceeded"));
    expect((await pair).map(result => result.status)).toEqual(["rejected", "rejected"]);
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(2);
  });
});

describe("expiry", () => {
  it("drops a media answer before its signed URLs expire, and at most after ARTIFACTS_TTL_MS", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
    mocks.call.mockImplementation(async () => ({ data: media("r1", { expiresAtMillis: Date.now() + 3 * 60_000 }) }));
    await authArtifacts(jump, { id: "r1" }, "p");
    vi.setSystemTime(Date.now() + 3 * 60_000 - URL_EXPIRY_MARGIN_MS - 1000);
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(1);
    vi.setSystemTime(Date.now() + 2000);
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(2);
    // A long-lived answer is still asked again after ARTIFACTS_TTL_MS.
    mocks.call.mockImplementation(async () => ({ data: media("r9", { expiresAtMillis: Date.now() + 60 * 60_000 }) }));
    await authArtifacts(jump, { id: "r9" }, "p");
    vi.setSystemTime(Date.now() + ARTIFACTS_TTL_MS + 1);
    await authArtifacts(jump, { id: "r9" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(4);
  });
  it("does not keep an answer whose URLs are already about to expire", async () => {
    mocks.call.mockResolvedValue({ data: media("r1", { expiresAtMillis: Date.now() + 10_000 }) });
    await authArtifacts(jump, { id: "r1" }, "p");
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(2);
  });
  it("keeps file contents for FILE_TTL_MS, longer than the URLs they came from", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValue(okJson({ frames: [] }));
    await fetchJson(signed("a/pose.json"));
    vi.setSystemTime(Date.now() + FILE_TTL_MS - 1000);
    await fetchJson(signed("a/pose.json", "renewed"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    await fetchJson(signed("a/pose.json", "renewed"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("changed results", () => {
  it("treats a rep whose result status changed as a new entry and drops its old files", async () => {
    const before = { qualified: true, duplicate: false, reason: "", revisionId: null };
    const after = { qualified: true, duplicate: false, reason: "", revisionId: "rev-2" };
    mocks.call.mockResolvedValueOnce({ data: media("rc", { resultStatus: before }) }).mockResolvedValueOnce({ data: media("rc", { resultStatus: after }) });
    fetchMock.mockResolvedValue(okJson({ frames: [] }));
    const first = await authArtifacts(jump, { id: "rc", resultStatus: before }, "p");
    await fetchJson(first.artifactUrls!["pose.json"]);
    const second = await authArtifacts(jump, { id: "rc", resultStatus: after }, "p");
    expect(second.resultStatus).toEqual(after);
    expect(callsTo("getAthleteRepMedia")).toBe(2);
    await fetchJson(second.artifactUrls!["pose.json"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("signed-in user", () => {
  it("drops everything when the user changes, and keeps nothing while signed out", async () => {
    mocks.call.mockResolvedValue({ data: media("r1") });
    fetchMock.mockResolvedValue(okJson({ frames: [] }));
    await authArtifacts(jump, { id: "r1" }, "p");
    await fetchJson(signed("a/pose.json"));
    mocks.user = { uid: "someone-else" };
    await authArtifacts(jump, { id: "r1" }, "p");
    await fetchJson(signed("a/pose.json"));
    expect(callsTo("getAthleteRepMedia")).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    mocks.user = null;
    await authArtifacts(jump, { id: "r1" }, "p");
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(4);
    expect(replayCacheStats().entries).toBe(0);
  });
  it("frees memory as soon as the auth state reports a sign-out", async () => {
    mocks.call.mockResolvedValue({ data: media("r1") });
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(replayCacheStats().entries).toBe(1);
    mocks.user = null;
    mocks.listeners.forEach(listener => listener(null));
    expect(replayCacheStats().entries).toBe(0);
  });
  it("does not keep a load that finishes after the user changed", async () => {
    const answer = deferred<{ data: unknown }>();
    mocks.call.mockReturnValueOnce(answer.promise).mockResolvedValue({ data: media("r1") });
    const pending = authArtifacts(jump, { id: "r1" }, "p");
    mocks.user = { uid: "someone-else" };
    mocks.listeners.forEach(listener => listener(mocks.user));
    mocks.user = { uid: "viewer" };
    mocks.listeners.forEach(listener => listener(mocks.user));
    answer.resolve({ data: media("r1") });
    await pending;
    expect(replayCacheStats()).toMatchObject({ entries: 0, bytes: 0 });
    await authArtifacts(jump, { id: "r1" }, "p");
    expect(callsTo("getAthleteRepMedia")).toBe(2);
  });
});

describe("eviction", () => {
  it("evicts the least recently used entry past the entry count", async () => {
    const cache = createMemoryCache({ maxEntries: 2, maxBytes: 1e9, userId: () => "u" });
    const load = vi.fn(async (key: string) => key);
    await cache.remember("a", () => load("a"), 60_000);
    await cache.remember("b", () => load("b"), 60_000);
    await cache.remember("a", () => load("a"), 60_000); // a is now the most recent
    await cache.remember("c", () => load("c"), 60_000); // evicts b
    await cache.remember("a", () => load("a"), 60_000);
    await cache.remember("b", () => load("b"), 60_000);
    expect(load.mock.calls.map(([key]) => key)).toEqual(["a", "b", "c", "b"]);
  });
  it("evicts past the byte budget and never keeps a value larger than it", async () => {
    const cache = createMemoryCache({ maxEntries: 100, maxBytes: 1000, userId: () => "u" });
    const size = (value: number) => value;
    await cache.remember("a", async () => 400, 60_000, { size });
    await cache.remember("b", async () => 400, 60_000, { size });
    await cache.remember("c", async () => 400, 60_000, { size });
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 800 });
    await cache.remember("huge", async () => 5000, 60_000, { size });
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 800 });
    const load = vi.fn(async () => 400);
    await cache.remember("a", load, 60_000, { size });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("remember", () => {
  it("shares in-flight loads, keeps the value for its lifetime and forgets failures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const gate = deferred<string>();
    const load = vi.fn(() => gate.promise);
    const pair = Promise.all([remember("team:jump", load, 1000), remember("team:jump", load, 1000)]);
    gate.resolve("median");
    expect(await pair).toEqual(["median", "median"]);
    expect(await remember("team:jump", load, 1000)).toBe("median");
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1001);
    load.mockRejectedValueOnce(new Error("offline"));
    await expect(remember("team:jump", load, 1000)).rejects.toThrow("offline");
    load.mockResolvedValueOnce("again");
    expect(await remember("team:jump", load, 1000)).toBe("again");
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe("warmRepFiles", () => {
  it("loads each rep's media answer and files once, so opening the rep afterwards needs no request", async () => {
    mocks.call.mockImplementation(async (_name, data: { repId: string }) => ({ data: media(data.repId) }));
    fetchMock.mockImplementation(async () => okJson({ frames: [[{ x: 0.5, y: 0.5 }]] }));
    await warmRepFiles([{ drill: jump, rep: { id: "w1" }, playerId: "p" }, { drill: jump, rep: { id: "w2" }, playerId: "p" }, null]);
    expect(callsTo("getAthleteRepMedia")).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const payload = await authArtifacts(jump, { id: "w1" }, "p");
    await fetchJson(payload.artifactUrls!["pose.json"]);
    expect(callsTo("getAthleteRepMedia")).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("warms a staff box replay the media answer leaves out, and never rejects", async () => {
    mocks.call.mockImplementation(async (_name, data: { repId: string }) => data.repId === "bad"
      ? Promise.reject(new Error("unavailable"))
      : { data: { ...media(data.repId), artifactUrls: { "metadata.json": signed(`p/${data.repId}/metadata.json`) } } });
    mocks.downloadUrl.mockResolvedValue("https://firebasestorage.googleapis.com/v0/b/bucket/o/p%2Ft1%2Ftracking.json?alt=media&token=t");
    fetchMock.mockImplementation(async () => okJson({ frames: [] }));
    await expect(warmRepFiles([{ drill: sprint, rep: { id: "bad" }, playerId: "p", access: "admin" }, { drill: sprint, rep: { id: "t1" }, playerId: "p", access: "admin" }])).resolves.toBeUndefined();
    expect(mocks.downloadUrl).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url as string).pathname.split("/").pop())).toEqual(["metadata.json", "p%2Ft1%2Ftracking.json"]);
  });
  it("runs at most `concurrency` reps at a time", async () => {
    let running = 0, peak = 0;
    mocks.call.mockImplementation(async (_name, data: { repId: string }) => {
      running += 1; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
      return { data: { artifactUrls: {}, repId: data.repId } };
    });
    await warmRepFiles(["c1", "c2", "c3", "c4", "c5"].map(id => ({ drill: jump, rep: { id }, playerId: "p" })), { concurrency: 2 });
    expect(callsTo("getAthleteRepMedia")).toBe(5);
    expect(peak).toBe(2);
  });
});
