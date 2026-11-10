// What each drill's processing measured, as drawable evidence: the paths,
// anchors (starting COM, apex, …), gate, ball and event frames the phone's own
// replay shows, built from the files the phone saved. Pure; drawn by
// views/drawDrillEvidence.ts. Coordinates are normalized 0..1 of the upright
// frame, y down. Sources (PoseTek-mobile-app origin/main):
//   sprint     COM.json (SprintProcessingService.swift:589), aruco_points.json
//              start/motion_onset/end frames and gate points, velocity.json.
//   COD/drib.  tracking.json com (DrillTrackingArtifact.swift), phase frames in
//              metadata (CodProcessingMath.swift), ball_boxes.json.
//   shooting   orig_ball.json, ball_trajectory.json, ball_information.json,
//              pose foot landmarks (DeadballGeometry.swift:136-251).
//   jump / broad jump  torso / COM midpoints, baseline COM, key frames.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { int, num } from "./repTools";
import type { Point } from "./repTools";
import { pointFrom } from "./repEvidence";
import type { SeriesGroup } from "./repEvidence";

export interface Phase { from: number; to: number; color: string; label: string }
export interface Trail {
  label: string;
  points: (Point | null)[];
  color: string;
  /** Frames of history drawn behind the current frame; null draws from the first frame. */
  window: number | null;
  /** Optional colouring by frame range (COD: out / turn / back). */
  phases?: Phase[];
}
export interface Anchor { label: string; point: Point; frame: number | null; color: string }
export interface EvidenceEventFrame { key: string; label: string; frame: number; source: string }
export interface Box { x1: number; y1: number; x2: number; y2: number }

export interface DrillEvidence {
  trails: Trail[];
  anchors: Anchor[];
  /** Vertical gate lines from the top of the frame to the ground. */
  gates: { x: number; label: string; color: string }[];
  /** Per-frame ball boxes drawn as a ring (COD / dribbling). */
  ballBoxes: (Box | null)[] | null;
  /** Shooting: the resting ball and its tracked flight. */
  kick: { rest: Box | null; trajectory: { frame: number; point: Point }[]; contactFrame: number | null } | null;
  /** Event frames the phone measured that are not editable fields (sprint start/onset/end, kick contact). */
  events: EvidenceEventFrame[];
  /** Per-frame readouts shown on the stage (phase, speed, height). */
  readout: (frame: number) => string[];
  /** Drill-specific per-frame series (aligned to clip frames), plotted with the generic ones. */
  series: SeriesGroup[];
  /** Files whose generic plot would be misaligned or meaningless; the drill plots them itself. */
  seriesHandled: string[];
  notes: string[];
}

export const EVIDENCE_COLORS = {
  com: "#4bd7e8",
  out: "#71d39b",
  turn: "#ffd166",
  back: "#4bd7e8",
  start: "#71d39b",
  end: "#ff7d7d",
  ball: "#7cff18",
  foot: "#73e6c7",
  peak: "#c9a7ff",
};

function points(value: unknown): (Point | null)[] {
  return Array.isArray(value) ? value.map(entry => pointFrom(entry)) : [];
}

function box(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [x1, y1, x2, y2] = value.map(num);
  return x1 !== null && y1 !== null && x2 !== null && y2 !== null ? { x1, y1, x2, y2 } : null;
}

function trackingCom(tracking: any): (Point | null)[] {
  const frames = Array.isArray(tracking?.frames) ? tracking.frames : [];
  const out: (Point | null)[] = [];
  for (const row of frames) {
    const index = int(row?.index);
    if (index === null || index < 0 || index > 100_000) continue;
    out[index] = pointFrom(row?.com) ?? (row?.person ? pointFrom({ x: num(row.person.x)! + num(row.person.w)! / 2, y: num(row.person.y)! + num(row.person.h)! / 2 }) : null);
  }
  return Array.from({ length: out.length }, (_, index) => out[index] ?? null);
}

const firstPoint = (track: (Point | null)[], from = 0): { frame: number; point: Point } | null => {
  for (let f = Math.max(0, from); f < track.length; f++) if (track[f]) return { frame: f, point: track[f]! };
  return null;
};

/** The centroid of one foot's ankle, heel and toe landmarks (DeadballGeometry.footPoint). */
export function footTrack(pose: any, side: "left" | "right"): (Point | null)[] {
  const frames = Array.isArray(pose) ? pose : Array.isArray(pose?.frames) ? pose.frames : [];
  const indices = side === "left" ? [27, 29, 31] : [28, 30, 32];
  return frames.map((frame: any) => {
    if (!Array.isArray(frame) || frame.length < 33) return null;
    const found = indices.map(index => frame[index]).filter((row: any) => Array.isArray(row) && num(row[0]) !== null && num(row[1]) !== null && (num(row[3]) ?? 1) >= 0.1);
    if (!found.length) return null;
    return { x: found.reduce((s: number, row: any) => s + Number(row[0]), 0) / found.length, y: found.reduce((s: number, row: any) => s + Number(row[1]), 0) / found.length };
  });
}

/** The torso midpoint per frame (shoulders + hips) from MediaPipe pose, as the jump math defines it. */
export function torsoTrack(pose: any): (Point | null)[] {
  const frames = Array.isArray(pose) ? pose : Array.isArray(pose?.frames) ? pose.frames : [];
  return frames.map((frame: any) => {
    if (!Array.isArray(frame) || frame.length < 25) return null;
    const rows = [11, 12, 23, 24].map(index => frame[index]).filter((row: any) => Array.isArray(row) && num(row[0]) !== null && num(row[1]) !== null && (num(row[3]) ?? 1) >= 0.1);
    if (rows.length < 4) return null;
    return { x: rows.reduce((s: number, row: any) => s + Number(row[0]), 0) / 4, y: rows.reduce((s: number, row: any) => s + Number(row[1]), 0) / 4 };
  });
}

/** The starting COM the phone draws: mean x of the first ten COM points, at the saved baseline y when present. */
export function startingCom(com: (Point | null)[], baselineY: number | null): Point | null {
  const first = com.filter((point): point is Point => point !== null).slice(0, 10);
  if (!first.length) return null;
  const x = first.reduce((sum, point) => sum + point.x, 0) / first.length;
  const y = baselineY !== null && baselineY >= 0 && baselineY <= 1 ? baselineY : first.reduce((sum, point) => sum + point.y, 0) / first.length;
  return { x, y };
}

export function drillEvidence(input: {
  drillKey: string;
  json: Record<string, any>;
  metadata: any;
  rep: any;
  pose: any;
  tracking: any;
  frames: Record<string, number | null | undefined>;
  fps: number | null;
}): DrillEvidence {
  const { drillKey, json, metadata, rep, pose, tracking, frames, fps } = input;
  const evidence: DrillEvidence = { trails: [], anchors: [], gates: [], ballBoxes: null, kick: null, events: [], readout: () => [], series: [], seriesHandled: [], notes: [] };
  const frame = (key: string) => int(frames[key]);

  if (drillKey === "sprint") {
    const aruco = json["aruco_points.json"];
    const com = points(json["COM.json"]);
    if (com.some(Boolean)) evidence.trails.push({ label: "COM (Kalman along the run)", points: com, color: EVIDENCE_COLORS.com, window: 30 });
    for (const [key, label] of [["start_frame", "Start"], ["motion_onset_frame", "Motion onset"], ["end_frame", "Finish"]] as const) {
      const value = int(aruco?.[key]);
      if (value !== null) evidence.events.push({ key, label, frame: value, source: "aruco_points.json" });
    }
    const start = int(aruco?.start_frame);
    const startCom = start !== null ? (com[start] ? { frame: start, point: com[start]! } : firstPoint(com, start)) : firstPoint(com);
    if (startCom) evidence.anchors.push({ label: "start COM", point: startCom.point, frame: startCom.frame, color: EVIDENCE_COLORS.start });
    const end = int(aruco?.end_frame);
    if (end !== null && com[end]) evidence.anchors.push({ label: "finish COM", point: com[end]!, frame: end, color: EVIDENCE_COLORS.end });
    const p1 = pointFrom(aruco?.point1), p2 = pointFrom(aruco?.point2);
    if (p1 && p2) {
      const [left, right] = p1.x <= p2.x ? [p1, p2] : [p2, p1];
      const distance = num(aruco?.marker_distance) ?? num(aruco?.distance);
      evidence.gates.push({ x: left.x, label: "left gate", color: EVIDENCE_COLORS.start }, { x: right.x, label: `right gate${distance !== null ? ` · ${distance.toFixed(2)} m apart` : ""}`, color: EVIDENCE_COLORS.end });
    }
    const velocity = Array.isArray(json["velocity.json"]) ? json["velocity.json"] : [];
    evidence.readout = f => {
      const v = num(velocity[f]);
      return v === null ? [] : [`${(v * 2.23694).toFixed(1)} mph · ${v.toFixed(2)} m/s`];
    };
    if (!com.some(Boolean)) evidence.notes.push("No COM.json saved for this sprint.");
    if (!aruco) evidence.notes.push("No aruco_points.json: the sprint had no marker calibration, so there is no gate, ground or start/finish frame.");
  }

  if (drillKey === "changeOfDirection" || drillKey === "dribbling") {
    const com = trackingCom(tracking);
    const s = frame("startFrame"), p1 = frame("phase1EndFrame"), p2 = frame("phase2EndFrame"), e = frame("endFrame"), apex = frame("apexFrame");
    const phases: Phase[] = [];
    if (s !== null && p1 !== null) phases.push({ from: s, to: p1, color: EVIDENCE_COLORS.out, label: "OUT" });
    if (p1 !== null && p2 !== null) phases.push({ from: p1, to: p2, color: EVIDENCE_COLORS.turn, label: "TURN" });
    if (p2 !== null && e !== null) phases.push({ from: p2, to: e, color: EVIDENCE_COLORS.back, label: "BACK" });
    if (com.some(Boolean)) evidence.trails.push({ label: "COM (person box center)", points: com, color: "rgba(255,255,255,0.55)", window: null, phases });
    for (const [f, label, color] of [[s, "start COM", EVIDENCE_COLORS.start], [apex, "turn (apex)", EVIDENCE_COLORS.turn], [e, "finish COM", EVIDENCE_COLORS.end]] as const) {
      if (f !== null && com[f]) evidence.anchors.push({ label, point: com[f]!, frame: f, color });
    }
    const boxes = Array.isArray(json["ball_boxes.json"]) ? json["ball_boxes.json"].map(box) : null;
    if (boxes?.some(Boolean)) evidence.ballBoxes = boxes;
    evidence.readout = f => {
      const phase = phases.find(item => f >= item.from && f <= item.to);
      const elapsed = s !== null && fps && f >= s ? ` · ${((Math.min(f, e ?? f) - s) / fps).toFixed(2)} s` : "";
      return [`${phase?.label ?? (s !== null && f < s ? "IDLE" : e !== null && f > e ? "DONE" : "—")}${elapsed}`];
    };
    if (!com.some(Boolean)) evidence.notes.push("tracking.json has no person/COM detections for this rep.");
  }

  if (drillKey === "shooting") {
    const trajectory = json["ball_trajectory.json"];
    const info = json["ball_information.json"];
    const ts = Array.isArray(trajectory?.t_values) ? trajectory.t_values : [];
    const xs = Array.isArray(trajectory?.x_values) ? trajectory.x_values : [];
    const ys = Array.isArray(trajectory?.y_values) ? trajectory.y_values : [];
    const path: { frame: number; point: Point }[] = [];
    ts.forEach((t: unknown, index: number) => {
      const f = int(t), x = num(xs[index]), y = num(ys[index]);
      if (f !== null && x !== null && y !== null) path.push({ frame: f, point: { x, y } });
    });
    const contact = int(info?.contact_frame) ?? int(trajectory?.contact_frame) ?? frame("contact_frame");
    const transition = int(trajectory?.transition_frame) ?? frame("transition_frame");
    evidence.kick = { rest: box(json["orig_ball.json"]), trajectory: path, contactFrame: contact };
    if (contact !== null) evidence.events.push({ key: "contact", label: "Contact", frame: contact, source: info?.contact_frame != null ? "ball_information.json" : "ball_trajectory.json" });
    if (transition !== null) evidence.events.push({ key: "transition", label: "Backswing", frame: transition, source: "ball_trajectory.json" });
    const side = rep?.strike_foot === "left" || rep?.strike_foot === "right" ? rep.strike_foot : metadata?.strike_foot === "left" || metadata?.strike_foot === "right" ? metadata.strike_foot : null;
    if (side && pose) {
      const foot = footTrack(pose, side);
      const from = transition ?? 0, to = contact !== null ? contact + 30 : foot.length - 1;
      const clipped = foot.map((point, f) => (f >= from && f <= to ? point : null));
      if (clipped.some(Boolean)) evidence.trails.push({ label: `${side} foot path`, points: clipped, color: EVIDENCE_COLORS.foot, window: null });
    }
    const mph = num(info?.ball_speed_mph);
    evidence.readout = f => (mph !== null && contact !== null && f >= contact ? [`${mph.toFixed(1)} mph${num(info?.launch_angle) !== null ? ` · ${num(info.launch_angle)!.toFixed(1)}°` : ""}`] : []);
    if (!path.length) evidence.notes.push("No ball_trajectory.json points: the ball was not tracked after contact.");
  }

  if (drillKey === "broadJump") {
    // BroadJumpProcessingService: com_midpoints.json (0.4·shoulder + 0.6·hip), baselineComYNorm, key_frames [takeoff, landing].
    const com = points(json["com_midpoints.json"]).some(Boolean) ? points(json["com_midpoints.json"]) : torsoTrack(pose);
    const source = points(json["com_midpoints.json"]).some(Boolean) ? "com_midpoints.json" : "pose torso midpoint";
    if (com.some(Boolean)) evidence.trails.push({ label: `COM path (${source})`, points: com, color: EVIDENCE_COLORS.com, window: null });
    const keyFrames = Array.isArray(json["key_frames.json"]) ? json["key_frames.json"].map(int) : [];
    if (keyFrames[0] != null) evidence.events.push({ key: "kf-takeoff", label: "Takeoff", frame: keyFrames[0]!, source: "key_frames.json" });
    if (keyFrames[1] != null) evidence.events.push({ key: "kf-landing", label: "Landing", frame: keyFrames[1]!, source: "key_frames.json" });
    const baseline = startingCom(com, num(metadata?.baselineComYNorm));
    if (baseline) evidence.anchors.push({ label: "starting COM (baseline)", point: baseline, frame: 0, color: EVIDENCE_COLORS.start });
    const takeoff = frame("takeoffFrame") ?? keyFrames[0] ?? null, landing = frame("landingFrame") ?? keyFrames[1] ?? null;
    const height = Array.isArray(json["com_height.json"]) ? json["com_height.json"].map(num) : [];
    let peak: number | null = null;
    if (takeoff !== null && landing !== null) for (let f = takeoff; f <= landing && f < height.length; f++) if (height[f] !== null && (peak === null || height[f]! > height[peak]!)) peak = f;
    for (const [f, label, color] of [[takeoff, "takeoff COM", EVIDENCE_COLORS.start], [peak, "peak COM", EVIDENCE_COLORS.peak], [landing, "landing COM", EVIDENCE_COLORS.end]] as const) {
      if (f !== null && com[f]) evidence.anchors.push({ label, point: com[f]!, frame: f, color });
    }
    if (peak !== null) evidence.events.push({ key: "peak", label: "Peak COM", frame: peak, source: "com_height.json" });
    evidence.readout = f => {
      const h = height[f] ?? null;
      return h === null ? [] : [`COM ${h >= 0 ? "+" : ""}${(h * 39.37007874).toFixed(1)} in vs. start`];
    };
    if (!com.some(Boolean)) evidence.notes.push("No COM path: no com_midpoints.json and no pose torso landmarks.");
  }

  if (drillKey === "jump") {
    // JumpProcessingService: torso_midpoints.json, chest_starting_loc, key_frames [maxCoil, midExtension, takeoff, peak],
    // chest_offsets.json (m, y down), velocity/acceleration [[x,y]] and grf [N] from max(0, maxCoil − 100).
    const com = points(json["torso_midpoints.json"]).some(Boolean) ? points(json["torso_midpoints.json"]) : torsoTrack(pose);
    const source = points(json["torso_midpoints.json"]).some(Boolean) ? "torso_midpoints.json" : "pose torso midpoint";
    if (com.some(Boolean)) evidence.trails.push({ label: `COM path (${source})`, points: com, color: EVIDENCE_COLORS.com, window: null });
    const start = startingCom(com, num(metadata?.chest_starting_loc));
    if (start) evidence.anchors.push({ label: "starting COM", point: start, frame: 0, color: EVIDENCE_COLORS.start });
    const keyFrames = Array.isArray(json["key_frames.json"]) ? json["key_frames.json"].map(int) : [];
    const names = ["Max coil", "Mid extension", "Takeoff", "Peak (saved)"];
    keyFrames.slice(0, 4).forEach((f, index) => {
      if (f === null) return;
      evidence.events.push({ key: `kf-${index}`, label: names[index], frame: f, source: "key_frames.json" });
      if (com[f]) evidence.anchors.push({ label: `${names[index].toLowerCase()} COM`, point: com[f]!, frame: f, color: index === 3 ? EVIDENCE_COLORS.peak : index === 2 ? EVIDENCE_COLORS.start : EVIDENCE_COLORS.turn });
    });
    const offsets = Array.isArray(json["chest_offsets.json"]) ? json["chest_offsets.json"] : [];
    const rise = offsets.map((row: any) => (Array.isArray(row) && num(row[1]) !== null ? -Number(row[1]) : null));
    // The phone's Peak chip: the highest chest rise over all frames (JumpSessionView), which can differ from key_frames[3].
    let highest: number | null = null;
    rise.forEach((value: number | null, f: number) => { if (value !== null && (highest === null || value > rise[highest]!)) highest = f; });
    if (highest !== null && highest !== keyFrames[3]) {
      evidence.events.push({ key: "peak-chest", label: "Peak (chest rise)", frame: highest, source: "chest_offsets.json" });
      if (com[highest]) evidence.anchors.push({ label: "highest chest COM", point: com[highest]!, frame: highest, color: EVIDENCE_COLORS.peak });
    }
    evidence.readout = f => {
      const value = rise[f] ?? null;
      return value === null ? [] : [`chest +${(value * 39.37007874).toFixed(1)} in vs. start`];
    };
    const offset = keyFrames[0] != null ? Math.max(0, keyFrames[0]! - 100) : null;
    const aligned = (file: string, pick: (row: any) => number | null): (number | null)[] | null => {
      const raw = json[file];
      if (!Array.isArray(raw) || offset === null) return null;
      const out: (number | null)[] = new Array(offset + raw.length).fill(null);
      raw.forEach((row: any, index: number) => { out[offset + index] = pick(row); });
      return out.some(value => value !== null) ? out : null;
    };
    const vertical = (row: any) => (Array.isArray(row) && num(row[1]) !== null ? -Number(row[1]) : null);
    if (rise.some((value: number | null) => value !== null)) evidence.series.push({ key: "jump-rise", title: "Chest rise above start", unit: "in", series: [{ name: "chest_offsets.json", label: "Chest rise", values: rise.map((v: number | null) => (v === null ? null : v * 39.37007874)) }] });
    const velocity = aligned("velocity.json", vertical);
    if (velocity) evidence.series.push({ key: "jump-velocity", title: "Vertical velocity (up +)", unit: "m/s", series: [{ name: "velocity.json", label: "Vertical velocity", values: velocity }] });
    const acceleration = aligned("acceleration.json", vertical);
    if (acceleration) evidence.series.push({ key: "jump-acceleration", title: "Vertical acceleration (up +)", unit: "m/s²", series: [{ name: "acceleration.json", label: "Vertical acceleration", values: acceleration }] });
    const grf = aligned("grf.json", num);
    if (grf) evidence.series.push({ key: "jump-grf", title: "Ground reaction force", unit: "N", series: [{ name: "grf.json", label: "GRF", values: grf }] });
    evidence.seriesHandled.push("velocity.json", "acceleration.json", "grf.json", "chest_offsets.json");
    if (!com.some(Boolean)) evidence.notes.push("No COM path: no torso_midpoints.json and no pose torso landmarks.");
    if (offset === null && (json["velocity.json"] || json["grf.json"])) evidence.notes.push("velocity / acceleration / GRF are saved without key frames, so they cannot be aligned to clip frames.");
  }
  return evidence;
}
