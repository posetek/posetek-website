import { describe, expect, it } from "vitest";
import { MARKER_SIDE_METERS, frameSeriesGroups, groundFromMarkers, markerFrom, markerSeparation, sceneEvidence } from "./repEvidence";
import { drillEvidence, startingCom } from "./drillEvidence";

const W = 1920, H = 1080;
/** A square marker of `px` pixels whose bottom edge sits at normalized `bottom`, as ArucoMarkerObservation.jsonPayload writes it. */
function marker(id: number, cx: number, bottom: number, px = 40, role: string | null = null) {
  const hw = px / 2 / W, hh = px / 2 / H, cy = bottom - hh;
  const corners = [{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: bottom }, { x: cx - hw, y: bottom }];
  return { id, role, cornersNormalized: corners, cornersPixels: corners.map(p => ({ x: p.x * W, y: p.y * H })), centerNormalized: { x: cx, y: cy } };
}

describe("markers", () => {
  it("reads normalized corners, falling back to pixels over the image size", () => {
    const parsed = markerFrom(marker(3, 0.5, 0.8), "rep", null)!;
    expect(parsed.id).toBe(3);
    expect(parsed.corners[2].y).toBeCloseTo(0.8);
    const pixelsOnly = markerFrom({ id: 4, cornersPixels: [{ x: 960, y: 540 }, { x: 1000, y: 540 }, { x: 1000, y: 580 }, { x: 960, y: 580 }] }, "session.calibration", { width: W, height: H })!;
    expect(pixelsOnly.corners[0]).toEqual({ x: 0.5, y: 0.5 });
    expect(pixelsOnly.center!.x).toBeCloseTo(980 / W);
  });

  it("puts the ground through one marker's two lowest corners, level when the edge is short", () => {
    const tilted = markerFrom({ id: 1, cornersNormalized: [{ x: 0.4, y: 0.7 }, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.82 }, { x: 0.4, y: 0.8 }] }, "rep", null)!;
    expect(groundFromMarkers([tilted])).toEqual({ a: { x: 0.4, y: 0.8 }, b: { x: 0.5, y: 0.82 } });
    const small = markerFrom(marker(2, 0.5, 0.8, 20), "rep", null)!;
    const level = groundFromMarkers([small])!;
    expect(level.a.y).toBeCloseTo(0.8);
    expect(level.a.x).toBe(0);
    expect(level.b.x).toBe(1);
  });

  it("puts the ground through the bottom-edge midpoints of the outer markers", () => {
    const line = groundFromMarkers([markerFrom(marker(7, 0.9, 0.81), "rep", null)!, markerFrom(marker(3, 0.1, 0.79), "rep", null)!])!;
    expect(line.a).toEqual({ x: 0.1, y: 0.79 });
    expect(line.b.x).toBeCloseTo(0.9);
    expect(line.b.y).toBeCloseTo(0.81);
  });

  it("measures two markers' separation from their own size and compares it with the distance used", () => {
    // 40 px markers 1536 px apart: 1536 / 40 × 0.149225 m.
    const markers = [markerFrom(marker(3, 0.1, 0.8), "rep", null)!, markerFrom(marker(7, 0.9, 0.8), "rep", null)!];
    const separation = markerSeparation(markers, { width: W, height: H }, 5, "manual")!;
    expect(separation.measuredMeters).toBeCloseTo((0.8 * W / 40) * MARKER_SIDE_METERS, 6);
    expect(separation.difference).toBeCloseTo(separation.measuredMeters / 5 - 1, 9);
    expect(markerSeparation(markers.slice(0, 1), { width: W, height: H }, 5, null)).toBeNull();
  });

  it("draws session calibration markers only when the clip has none and the geometry is trusted", () => {
    const corners = { image: { width: W, height: H }, markers: [marker(1, 0.2, 0.8), marker(2, 0.8, 0.8)] };
    expect(sceneEvidence({ metadata: {}, arucoCorners: corners, json: {} }).markers.map(m => m.source)).toEqual(["session.calibration", "session.calibration"]);
    expect(sceneEvidence({ metadata: { calibrationGeometryTrusted: false }, arucoCorners: corners, json: {} }).markers).toEqual([]);
    const own = sceneEvidence({ metadata: { arucoMarkers: [marker(9, 0.5, 0.8)] }, arucoCorners: corners, json: {} });
    expect(own.markers.map(m => m.id)).toEqual([9]);
    expect(own.calibrationMarkers).toHaveLength(2);
  });

  it("uses the sprint's aruco_points.json markers, configured distance and source", () => {
    const scene = sceneEvidence({ metadata: { frameWidth: W, frameHeight: H }, arucoCorners: null, json: {
      "aruco_points.json": { frame_shape: { x: W, y: H }, markers: [marker(3, 0.1, 0.8), marker(7, 0.9, 0.8)], point1: { x: 0.1, y: 0.78 }, point2: { x: 0.9, y: 0.78 }, marker_distance: 10, marker_distance_source: "manual" },
    } });
    expect(scene.markers).toHaveLength(2);
    expect(scene.points.map(p => p.label)).toEqual(["gate 1", "gate 2"]);
    expect(scene.separation).toMatchObject({ configuredMeters: 10, configuredSource: "manual" });
  });
});

describe("frame series", () => {
  it("plots per-frame numeric files grouped by unit and skips short or nested arrays", () => {
    const groups = frameSeriesGroups({
      "velocity.json": Array.from({ length: 20 }, (_, i) => i / 2),
      "kalman_velocity.json": Array.from({ length: 20 }, (_, i) => i / 2 + 0.1),
      "acceleration.json": Array.from({ length: 20 }, () => 1),
      "key_frames.json": [3, 9],
      "COM.json": Array.from({ length: 20 }, () => [0.5, 0.5]),
    });
    expect(groups.map(group => [group.key, group.series.length])).toEqual([["speed", 2], ["acceleration", 1]]);
  });
});

describe("drill evidence", () => {
  it("takes the sprint's start, motion onset and finish from aruco_points.json", () => {
    const evidence = drillEvidence({ drillKey: "sprint", json: {
      "aruco_points.json": { start_frame: 8, motion_onset_frame: 12, end_frame: 84, point1: { x: 0.9, y: 0.78 }, point2: { x: 0.1, y: 0.78 }, marker_distance: 10 },
      "COM.json": Array.from({ length: 90 }, (_, i) => [0.1 + i * 0.009, 0.56]),
      "velocity.json": Array.from({ length: 90 }, () => 5),
    }, metadata: {}, rep: {}, pose: null, tracking: null, frames: {}, fps: 60 });
    expect(evidence.events.map(e => [e.label, e.frame])).toEqual([["Start", 8], ["Motion onset", 12], ["Finish", 84]]);
    expect(evidence.anchors.map(a => [a.label, a.frame])).toEqual([["start COM", 8], ["finish COM", 84]]);
    expect(evidence.gates.map(g => g.x)).toEqual([0.1, 0.9]);
    expect(evidence.readout(20)).toEqual(["11.2 mph · 5.00 m/s"]);
  });

  it("colours the shuttle COM path by phase and marks start, apex and finish", () => {
    const tracking = { frames: Array.from({ length: 60 }, (_, index) => ({ index, com: { x: index / 60, y: 0.5 } })) };
    const evidence = drillEvidence({ drillKey: "changeOfDirection", json: {}, metadata: {}, rep: {}, pose: null, tracking,
      frames: { startFrame: 5, phase1EndFrame: 20, apexFrame: 25, phase2EndFrame: 30, endFrame: 50 }, fps: 60 });
    expect(evidence.trails[0].phases!.map(p => p.label)).toEqual(["OUT", "TURN", "BACK"]);
    expect(evidence.anchors.map(a => a.frame)).toEqual([5, 25, 50]);
    expect(evidence.readout(22)[0]).toMatch(/^TURN · 0\.28 s$/);
  });

  it("aligns the jump's velocity and force to clip frames from max(0, max coil − 100)", () => {
    const evidence = drillEvidence({ drillKey: "jump", json: {
      "key_frames.json": [120, 130, 140, 150],
      "velocity.json": [[0, -1], [0, -2]],
      "grf.json": [700, 800],
      "chest_offsets.json": Array.from({ length: 160 }, (_, f) => [0, f === 150 ? -0.4 : 0]),
      "torso_midpoints.json": Array.from({ length: 160 }, () => [0.5, 0.5]),
    }, metadata: { chest_starting_loc: 0.52 }, rep: {}, pose: null, tracking: null, frames: {}, fps: 60 });
    const velocity = evidence.series.find(group => group.key === "jump-velocity")!.series[0].values;
    expect(velocity[20]).toBe(1);
    expect(velocity[21]).toBe(2);
    expect(velocity[19]).toBeNull();
    expect(evidence.series.find(group => group.key === "jump-grf")!.series[0].values[21]).toBe(800);
    expect(evidence.anchors[0]).toMatchObject({ label: "starting COM", point: { x: 0.5, y: 0.52 } });
    expect(evidence.events.map(e => e.label)).toEqual(["Max coil", "Mid extension", "Takeoff", "Peak (saved)"]);
    expect(evidence.seriesHandled).toContain("grf.json");
  });

  it("places the starting COM at the mean x of the first ten points and the saved baseline y", () => {
    expect(startingCom([null, { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.62 }], 0.55)).toEqual({ x: 0.5, y: 0.55 });
    expect(startingCom([], 0.5)).toBeNull();
  });
});
