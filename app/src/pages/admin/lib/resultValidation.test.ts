import { describe, expect, it, vi } from "vitest";

// Synthetic Firestore only: no Firebase initialization or real athlete data.
const store = vi.hoisted(() => ({
  participants: [] as { id: string; data: Record<string, unknown> }[],
  reps: new Map<string, { id: string; data: Record<string, unknown> }[]>(),
  denied: new Set<string>(),
  queries: [] as string[],
}));
vi.mock("../../../lib/firebase", () => {
  const docs = (rows: { id: string; data: Record<string, unknown> }[]) => ({ docs: rows.map(row => ({ id: row.id, data: () => row.data })) });
  return {
    storage: {},
    cloud: {},
    auth: {},
    db: {
      collection: (name: string) => ({
        doc: (id: string) => ({
          collection: (child: string) => {
            if (name === "testingEvents" && child === "participants") return { get: async () => docs(store.participants) };
            return {
              where: (field: string, op: string, value: string) => ({
                get: async () => {
                  store.queries.push(`${name}/${id}/${child} ${field} ${op} ${value}`);
                  if (store.denied.has(id)) throw new Error("permission-denied");
                  return docs((store.reps.get(id) ?? []).filter(row => row.data[field] === value));
                },
              }),
            };
          },
        }),
      }),
    },
  };
});
import {
  BROAD_JUMP_MAX_DISTANCE_METERS,
  broadJumpDistance,
  broadJumpScale,
  feetMoved,
  initialBroadJumpFeet,
  metersToFeetText,
  phoneBroadJumpFeet,
  primaryMetricValue,
  primaryResultText,
  processingFlagged,
  validationNote,
  validationRevision,
  validationStatus,
  withAnnotationHistory,
} from "./resultValidation";
import { loadValidationQueue, queueRow, sortQueue } from "./resultValidationData";

describe("primary metric", () => {
  it("reads the field Insights qualifies each drill by", () => {
    expect(primaryMetricValue("broadJump", { broadJumpDistance: 1.9 })).toBe(1.9);
    expect(primaryMetricValue("sprint", { maxVelocity: 7.1 })).toBe(7.1);
    expect(primaryMetricValue("changeOfDirection", { totalTime: 5.2 })).toBe(5.2);
    expect(primaryMetricValue("shooting", { velocity: 22 })).toBe(22);
    expect(primaryMetricValue("jump", { jump_height_in: 10 })).toBeCloseTo(0.254);
  });

  it("treats zero, negative and missing values as no result", () => {
    expect(primaryMetricValue("broadJump", { broadJumpDistance: 0 })).toBeNull();
    expect(primaryMetricValue("broadJump", { broadJumpDistance: -1 })).toBeNull();
    expect(primaryMetricValue("broadJump", {})).toBeNull();
    expect(primaryMetricValue("freeRecord", { velocity: 3 })).toBeNull();
  });
});

describe("processing flags", () => {
  it("flags invalid, partial and failed-step reps only", () => {
    expect(processingFlagged({ resultsValid: true, processingStatus: "complete", failedSteps: [] })).toBe(false);
    expect(processingFlagged({})).toBe(false);
    expect(processingFlagged({ resultsValid: false })).toBe(true);
    expect(processingFlagged({ processingStatus: "partial" })).toBe(true);
    expect(processingFlagged({ failedSteps: ["cod.metrics"] })).toBe(true);
  });
});

describe("validation status", () => {
  it("reads the decision back from the revision note", () => {
    expect(validationStatus({}).state).toBe("open");
    expect(validationStatus({ adminRevision: { revisionId: "r1", note: "Validated" } }).state).toBe("validated");
    expect(validationStatus({ adminRevision: { revisionId: "r1", note: "Adjusted · heel slid" } }).state).toBe("adjusted");
    expect(validationStatus({ adminRevision: { revisionId: "r1", note: "Rejected · two athletes in frame" } }).state).toBe("rejected");
    expect(validationStatus({ adminRevision: { revisionId: "r1", note: "fixed the apex" } }).state).toBe("revised");
    expect(validationStatus({ adminRevision: { revisionId: "r1", note: null, byEmail: "a@posetek.net", atMillis: 5 } })).toEqual({ state: "revised", byEmail: "a@posetek.net", atMillis: 5, note: null });
  });

  it("prefixes notes with the decision and keeps them under the callable limit", () => {
    expect(validationNote("validated", "  ")).toBe("Validated");
    expect(validationNote("adjusted", "landing heel")).toBe("Adjusted · landing heel");
    expect(validationNote("rejected", "x".repeat(3000)).length).toBe(2000);
  });
});

describe("validation revision", () => {
  const original = { broadJumpDistance: 1.8, takeoffFrame: 30, landingFrame: 52 };

  it("validates the recorded value and marks the evidence valid, so it qualifies as an accepted revision", () => {
    const plan = validationRevision({ drillKey: "broadJump", decision: "validated", original, after: original, changedFields: {}, note: "" });
    expect(plan).toEqual({
      fields: { broadJumpDistance: 1.8 },
      metadataExtras: { resultsValid: true, processingStatus: "complete", failedSteps: [] },
      note: "Validated",
    });
  });

  it("cannot validate a rep that has no result", () => {
    const plan = validationRevision({ drillKey: "broadJump", decision: "validated", original: {}, after: {}, changedFields: {}, note: "" });
    expect(plan).toHaveProperty("error");
  });

  it("writes the changed fields and the adjusted primary metric", () => {
    const plan = validationRevision({
      drillKey: "broadJump", decision: "adjusted", original,
      after: { ...original, broadJumpDistance: 1.62, landingFrame: 50 },
      changedFields: { broadJumpDistance: 1.62, landingFrame: 50 }, note: "heel",
    });
    expect(plan).toEqual({
      fields: { broadJumpDistance: 1.62, landingFrame: 50 },
      metadataExtras: { resultsValid: true, processingStatus: "complete", failedSteps: [] },
      note: "Adjusted · heel",
    });
  });

  it("always includes the primary metric in an adjustment, even when only a label changed", () => {
    const plan = validationRevision({ drillKey: "shooting", decision: "adjusted", original: { velocity: 20 }, after: { velocity: 20, strike_foot: "left" }, changedFields: { strike_foot: "left" }, note: "" });
    expect(plan).toMatchObject({ fields: { strike_foot: "left", velocity: 20 } });
  });

  it("refuses an adjustment that leaves no positive result", () => {
    const plan = validationRevision({ drillKey: "sprint", decision: "adjusted", original: { max_velocity: 7 }, after: { max_velocity: null }, changedFields: { max_velocity: null }, note: "" });
    expect(plan).toHaveProperty("error");
  });

  it("rejects without changing any recorded value", () => {
    const plan = validationRevision({ drillKey: "changeOfDirection", decision: "rejected", original: { totalTime: 5 }, after: { totalTime: 4 }, changedFields: { totalTime: 4 }, note: "wrong athlete" });
    expect(plan).toEqual({
      fields: {},
      metadataExtras: { resultsValid: false, processingStatus: "partial", failedSteps: ["admin.rejected"] },
      note: "Rejected · wrong athlete",
    });
  });
});

describe("annotation history", () => {
  it("carries every earlier annotation file inside the new one", () => {
    const first = withAnnotationHistory({ v: 1 }, null);
    expect(first).toEqual({ v: 1, annotationHistory: [] });
    const saved = { ...first, revisionId: "r1" };
    const second = withAnnotationHistory({ v: 2 }, saved);
    expect(second).toEqual({ v: 2, annotationHistory: [{ v: 1, revisionId: "r1" }] });
    const third = withAnnotationHistory({ v: 3 }, { ...second, revisionId: "r2" });
    expect(third.annotationHistory).toEqual([{ v: 1, revisionId: "r1" }, { v: 2, revisionId: "r2" }]);
  });

  it("drops the oldest entries only past the size budget", () => {
    const big = "x".repeat(1_400_000);
    const result = withAnnotationHistory({ v: 3 }, { blob: big, annotationHistory: [{ blob: big }] });
    expect(result.annotationHistory).toHaveLength(1);
  });
});

describe("broad jump feet", () => {
  const evidence = {
    fit: { startFootXNorm: 0.3, endFootXNorm: 0.62, takeoffFrameIndex: 2, landingFrameIndex: 3 },
    footCenters: [[0.3, 0.8], [0.3, 0.8], [0.31, 0.81], [0.62, 0.83]],
    comMidpoints: [],
  };

  it("starts from the phone's measured feet at the takeoff and landing frames", () => {
    expect(phoneBroadJumpFeet(evidence, { ground_loc_y: 0.84 })).toEqual({
      start: { frame: 2, x: 0.3, y: 0.81 },
      landing: { frame: 3, x: 0.62, y: 0.83 },
    });
  });

  it("falls back to the ground line, and to nothing when the fit is missing", () => {
    expect(phoneBroadJumpFeet({ fit: { startFootXNorm: 0.3 }, footCenters: null, comMidpoints: null }, { ground_loc_y: 0.84 }))
      .toEqual({ start: { frame: null, x: 0.3, y: 0.84 }, landing: null });
    expect(phoneBroadJumpFeet(null, {})).toEqual({ start: null, landing: null });
  });

  it("prefers feet saved by an earlier validation", () => {
    const phone = phoneBroadJumpFeet(evidence, {});
    const saved = { broadJump: { startFoot: { frame: 1, x: 0.29, y: 0.8 }, landingFoot: { frame: 3, x: 0.6, y: 0.82 } } };
    expect(initialBroadJumpFeet(saved, phone)).toEqual({ start: { frame: 1, x: 0.29, y: 0.8 }, landing: { frame: 3, x: 0.6, y: 0.82 } });
    expect(initialBroadJumpFeet(null, phone)).toEqual(phone);
  });

  it("measures |end − start| × m_to_normalized_units, like BroadJumpProcessingMath", () => {
    const scale = broadJumpScale({ m_to_normalized_units: 5 });
    expect(scale).toBe(5);
    expect(broadJumpDistance(phoneBroadJumpFeet(evidence, {}), scale)).toBeCloseTo(1.6);
    expect(broadJumpDistance({ start: { frame: 0, x: 0.6, y: 0 }, landing: { frame: 0, x: 0.3, y: 0 } }, 5)).toBeCloseTo(1.5);
    expect(broadJumpDistance(phoneBroadJumpFeet(evidence, {}), broadJumpScale({}))).toBeNull();
    expect(BROAD_JUMP_MAX_DISTANCE_METERS).toBe(4);
  });

  it("notices when a foot moved", () => {
    const phone = phoneBroadJumpFeet(evidence, {});
    expect(feetMoved(phone, phoneBroadJumpFeet(evidence, {}))).toBe(false);
    expect(feetMoved(phone, { ...phone, landing: { frame: 3, x: 0.6, y: 0.83 } })).toBe(true);
  });
});

describe("display", () => {
  it("shows results in the units coaches read", () => {
    expect(metersToFeetText(1.8288)).toBe("6′ 0.0″");
    expect(primaryResultText("broadJump", 1.8288)).toBe("6′ 0.0″ (1.83 m)");
    expect(primaryResultText("jump", 0.254)).toBe("10.0 in");
    expect(primaryResultText("sprint", 10)).toBe("22.4 mph");
    expect(primaryResultText("dribbling", 7.256)).toBe("7.26 s");
    expect(primaryResultText("sprint", null)).toBe("No result");
  });
});

describe("queue rows", () => {
  const player = { id: "p1", name: "Ava", rosterOrder: 0 };

  it("builds a row per processed drill rep and skips free records", () => {
    const row = queueRow({ id: "r1", repType: "broadJump", sessionNumber: 2, repNumber: 1, broadJumpDistance: 1.7, processingStatus: "partial" }, player);
    expect(row).toMatchObject({ key: "p1/r1", drillKey: "broadJump", sessionNumber: 2, repNumber: 1, value: 1.7, flagged: true, status: { state: "open" } });
    expect(queueRow({ id: "r2", repType: "freeRecord" }, player)).toBeNull();
    expect(queueRow({ id: "r3", repType: "mystery" }, player)).toBeNull();
    expect(queueRow({ id: "r4", repType: "side_kick", velocity: 20 }, player)?.drillKey).toBe("shooting");
  });

  it("orders by roster, drill, session and rep", () => {
    const rows = [
      queueRow({ id: "c", repType: "sprint", sessionNumber: 1, repNumber: 1 }, player)!,
      queueRow({ id: "b", repType: "broadJump", sessionNumber: 1, repNumber: 2 }, player)!,
      queueRow({ id: "a", repType: "broadJump", sessionNumber: 1, repNumber: 1 }, player)!,
      queueRow({ id: "z", repType: "sprint", sessionNumber: 1, repNumber: 1 }, { id: "p0", name: "Zed", rosterOrder: -1 })!,
    ];
    expect(sortQueue(rows).map(row => row.repId)).toEqual(["z", "c", "a", "b"]);
  });
});

describe("loading a session queue", () => {
  it("reads each participant's reps for that session only and reports unreadable players", async () => {
    store.participants = [
      { id: "p2", data: { playerDocId: "p2", displayName: "Ben", rosterOrder: 1 } },
      { id: "p1", data: { playerDocId: "p1", displayName: "Ava", rosterOrder: 0 } },
      { id: "p3", data: { playerDocId: "p3", displayName: "Cam", rosterOrder: 2 } },
    ];
    store.reps.set("p1", [
      { id: "a1", data: { repType: "broadJump", testingEventId: "e1", sessionNumber: 1, repNumber: 1, broadJumpDistance: 1.7 } },
      { id: "a2", data: { repType: "broadJump", testingEventId: "other", sessionNumber: 1, repNumber: 2, broadJumpDistance: 1.8 } },
    ]);
    store.reps.set("p2", [{ id: "b1", data: { repType: "sprint", testingEventId: "e1", sessionNumber: 2, repNumber: 1, max_velocity: 6, adminRevision: { revisionId: "r", note: "Validated" } } }]);
    store.denied.add("p3");
    const queue = await loadValidationQueue("e1");
    expect(queue.rows.map(row => [row.playerName, row.repId, row.status.state])).toEqual([["Ava", "a1", "open"], ["Ben", "b1", "validated"]]);
    expect(queue.failedPlayers).toEqual(["Cam"]);
    expect(store.queries.every(query => query.endsWith("testingEventId == e1"))).toBe(true);
  });
});
