import { afterEach, describe, expect, it, vi } from "vitest";
import * as framing from "./movement/framing";
import recorded from "./movement/recorded-movement.json";
import { centerLinePoint, fitRecording, framingRecording, recordingBounds, type PoseDemoData, type PoseSequence } from "./pose-demo";
import { createPoseDemoController, type PoseDemoOptions } from "./use-pose-demo";

describe("the whole-rep framing copied from the recorded-movement demo", () => {
  it("frames every bundled homepage recording exactly as movement/framing.ts does", () => {
    for (const sequence of recorded.sequences) {
      const aspect = sequence.sourceAspectRatio ?? recorded.sourceAspectRatio;
      const bounds = recordingBounds(sequence, aspect);
      expect(bounds).toEqual(framing.recordingBounds(sequence, aspect));
      for (const [width, height, ratio] of [[326, 260, 2], [720, 365, 1], [393, 220, 3]]) expect(fitRecording(width, height, ratio, bounds)).toEqual(framing.fitRecording(width, height, ratio, bounds));
    }
    expect(recordingBounds({ frames: [] }, 16 / 9)).toEqual(framing.recordingBounds({ frames: [] }, 16 / 9));
  });
});

const run: PoseSequence = {
  key: "changeOfDirection", title: "", label: "", markers: {}, metrics: [], fps: 10,
  frames: [[], [], []],
  centerLine: [{ x: .2, top: .4, bottom: .58 }, null, { x: .3, top: .41, bottom: .58 }],
  phases: [{ from: 0, title: "Out", color: "#66c2ff" }],
  calibration: {
    markers: [{ id: 1, corners: [[.18, .56], [.2, .56], [.2, .58], [.18, .58]] }],
    baseline: { start: [.19, .58], end: [.83, .58], distanceMeters: 9.5 },
    ground: { start: [0, .58], end: [1, .58] },
  },
};

describe("replay inputs to the demo data", () => {
  it("puts a centre line's middle where the body's centre is drawn", () => {
    expect(centerLinePoint({ x: .3, top: .4, bottom: .6 })).toEqual([.3, .5]);
    expect(centerLinePoint(null)).toBeNull();
  });

  it("frames both ends of every centre line, and the shadow's too", () => {
    const shadow: PoseSequence = { ...run, centerLine: [{ x: .9, top: .1, bottom: .2 }], calibration: undefined };
    const recording = framingRecording(run, shadow);
    expect(recording.frames.flat()).toEqual(expect.arrayContaining([[.2, .4], [.2, .58], [.3, .41], [.9, .1], [.9, .2]]));
    expect(recording.calibration).toBe(run.calibration);
  });
});

function fixture(sequence: PoseSequence, options: PoseDemoOptions) {
  const log: unknown[][] = [];
  const context = new Proxy({} as Record<string, unknown>, {
    get: (_, key) => key === "measureText" ? (text: string) => ({ width: text.length * 6 }) : (...args: unknown[]) => { log.push([key, ...args]); },
    set: (_, key, value) => { log.push(["set", key, value]); return true; },
  });
  const node = () => ({ textContent: "", dataset: {}, style: { setProperty: vi.fn() }, setAttribute: vi.fn() });
  const canvas = { ...node(), width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 640, height: 360 }), animate: vi.fn() };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }), devicePixelRatio: 1 });
  vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const data: PoseDemoData = { version: 1, layout: "mediapipe33", fps: 10, sourceAspectRatio: 16 / 9, autoAdvance: false, sequences: [sequence] };
  const controller = createPoseDemoController(data, { canvas, playButton: node(), playIcon: node(), scrubber: { ...node(), value: "0", max: "2" }, timer: node(), phaseChip: node(), telemetryPhase: null } as unknown as Parameters<typeof createPoseDemoController>[1], vi.fn(), options)!;
  return { controller, log };
}

afterEach(() => vi.unstubAllGlobals());

describe("replay options on the demo controller", () => {
  it("draws the gate distance, the markers and the athlete's centre line", () => {
    const { controller, log } = fixture(run, { fitRecording: true, recordedLook: true });
    log.length = 0;
    controller.scrub("2");
    expect(log).toContainEqual(["fillText", "31.2 ft", expect.any(Number), expect.any(Number)]);
    // The marker's four corners, then the current line from its top to its bottom.
    expect(log.filter(call => call[0] === "fillRect")).toHaveLength(4);
    const strokes = log.filter(call => call[0] === "set" && call[1] === "strokeStyle").map(call => call[2]);
    expect(strokes).toContain("#edf6e8");
    expect(strokes).toContain("#66c2ff");
    controller.destroy();
  });

  it("fits the rep instead of the camera frame", () => {
    const first = fixture(run, {}), fitted = fixture(run, { fitRecording: true });
    const lineTo = (log: unknown[][]) => log.filter(call => call[0] === "lineTo").map(call => call.slice(1));
    expect(lineTo(fitted.log)).not.toEqual(lineTo(first.log));
    first.controller.destroy(); fitted.controller.destroy();
  });

  it("draws a shadow under the athlete once it arrives, without restarting", () => {
    const { controller, log } = fixture(run, { recordedLook: true });
    controller.scrub("2");
    log.length = 0;
    const shadow: PoseSequence = { ...run, calibration: undefined, centerLine: [{ x: .5, top: .3, bottom: .58 }] };
    const frameFor = vi.fn(() => 0);
    controller.setShadow({ sequence: shadow, frameFor });
    expect(frameFor).toHaveBeenCalledWith(2);
    const strokes = log.filter(call => call[0] === "set" && call[1] === "strokeStyle").map(call => call[2]);
    expect(strokes.indexOf("#8fa39b80")).toBeGreaterThan(-1);
    expect(strokes.indexOf("#8fa39b80")).toBeLessThan(strokes.indexOf("#edf6e8"));
    controller.setShadow(null);
    controller.destroy();
  });
});
