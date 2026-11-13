import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drillByKey } from "../../athlete-portal/lib/drills";
import { loadRepArtifacts } from "./repToolsData";

const firebase = vi.hoisted(() => ({ ref: vi.fn() }));
vi.mock("../../../lib/firebase", () => ({
  storage: { ref: firebase.ref },
  cloud: {},
  db: {},
}));

// Synthetic storage only: no Firebase initialization or real athlete fixtures.
const playerId = "synthetic-player";
const sessionRoot = `${playerId}/changeOfDirection/session9`;
const folder = `${sessionRoot}/kick3/capture_synthetic`;
const rep = { sessionNumber: 9, repNumber: 3, storagePath: `gs://synthetic-bucket/${folder}/metadata.json` };
const drill = drillByKey("changeOfDirection");
const listed = new Map<string, string[]>();
const bodies = new Map<string, { body: string; status?: number }>();
const downloads: string[] = [];
const listings: string[] = [];
const denied = new Set<string>();
const urlFor = (path: string) => `https://storage.example.test/${encodeURIComponent(path)}`;

function storageRef(path: string) {
  return {
    name: path.split("/").at(-1),
    child: (name: string) => storageRef(`${path}/${name}`),
    getDownloadURL: async () => {
      downloads.push(path);
      if (denied.has(path)) throw new Error("Synthetic permission denial");
      return urlFor(path);
    },
    listAll: async () => {
      listings.push(path);
      return { items: (listed.get(path) || []).map(name => storageRef(`${path}/${name}`)) };
    },
  };
}

beforeEach(() => {
  listed.clear();
  bodies.clear();
  denied.clear();
  downloads.length = 0;
  listings.length = 0;
  firebase.ref.mockReset().mockImplementation(storageRef);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = decodeURIComponent(new URL(url).pathname.slice(1));
    const data = bodies.get(path);
    return new Response(data?.body ?? "", { status: data?.status ?? (data ? 200 : 404) });
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("rep artifact tracking reads", () => {
  it("loads tracking from the exact capture folder without compacting sparse frame rows", async () => {
    const tracking = {
      frames: [
        { frame: 0, timestamp: 0, centerOfMass: [0.2, 0.5] },
        null,
        { frame: 7, timestamp: 0.117, centerOfMass: null },
      ],
      totalFrames: 8,
    };
    listed.set(folder, ["metadata.json", "tracking.json"]);
    bodies.set(`${folder}/tracking.json`, { body: JSON.stringify(tracking) });
    bodies.set(`${sessionRoot}/kick3/tracking.json`, { body: JSON.stringify({ wrongCapture: true }) });

    const bundle = await loadRepArtifacts(drill, rep, playerId);

    expect(bundle.folder).toBe(folder);
    expect(bundle.sessionRoot).toBe(sessionRoot);
    expect(bundle.tracking).toEqual(tracking);
    expect(bundle.tracking.frames).toHaveLength(3);
    expect(bundle.tracking.frames[1]).toBeNull();
    expect(bundle.tracking.frames[2].frame).toBe(7);
    expect(bundle.trackingLoadError).toBe(false);
    expect(bundle.mediaUrl).toBeNull();
    expect(bundle.mediaName).toBeNull();
    // The rep folder, then the session root (its top-level calibration files only; never a sibling capture).
    expect(listings).toEqual([folder, sessionRoot]);
    expect(downloads.filter(path => path.endsWith("/tracking.json"))).toEqual([`${folder}/tracking.json`]);
    expect(fetch).toHaveBeenCalledWith(urlFor(`${folder}/tracking.json`), { cache: "no-store" });
  });

  it("keeps an absent tracking artifact distinct from a failed listed artifact", async () => {
    listed.set(folder, ["metadata.json"]);
    const bundle = await loadRepArtifacts(drill, rep, playerId);
    expect(bundle.tracking).toBeNull();
    expect(bundle.trackingLoadError).toBe(false);
    expect(bundle.files).toEqual(["metadata.json"]);
  });

  it.each([
    ["HTTP failure", { body: "unavailable", status: 503 }],
    ["malformed JSON", { body: "{broken" }],
    ["empty body", { body: "" }],
  ])("reports a listed tracking artifact with %s as unreadable", async (_label, response) => {
    listed.set(folder, ["tracking.json"]);
    bodies.set(`${folder}/tracking.json`, response);
    const bundle = await loadRepArtifacts(drill, rep, playerId);
    expect(bundle.tracking).toBeNull();
    expect(bundle.trackingLoadError).toBe(true);
  });

  it("reports a listed tracking artifact whose download URL is denied", async () => {
    listed.set(folder, ["tracking.json"]);
    denied.add(`${folder}/tracking.json`);
    const bundle = await loadRepArtifacts(drill, rep, playerId);
    expect(bundle.tracking).toBeNull();
    expect(bundle.trackingLoadError).toBe(true);
  });

  it("preserves the original movie URL and pose artifacts alongside tracking", async () => {
    const pose = [[[0.2, 0.4, 0, 1]], null];
    const tracking = [{ frame: 0, centerOfMass: [0.2, 0.4] }, null];
    listed.set(folder, ["original.MOV", "pose.json", "tracking.json"]);
    bodies.set(`${folder}/pose.json`, { body: JSON.stringify(pose) });
    bodies.set(`${folder}/tracking.json`, { body: JSON.stringify(tracking) });
    const bundle = await loadRepArtifacts(drill, rep, playerId);
    expect(bundle.mediaUrl).toBe(urlFor(`${folder}/original.MOV`));
    expect(bundle.mediaName).toBe("original.MOV");
    expect(bundle.pose).toEqual(pose);
    expect(bundle.tracking).toEqual(tracking);
    expect(bundle.trackingLoadError).toBe(false);
  });
});
