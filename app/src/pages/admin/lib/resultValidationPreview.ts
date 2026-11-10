// DEV-only synthetic data for /admin/result-validation?preview=1. Nothing here
// reads or writes Firebase: saves update an in-memory copy of the reps.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { RepToolsSource } from "./repToolsSource";
import type { PlayerRow } from "./accounts";
import type { RepArtifactBundle, RepRevisionRow } from "./repToolsData";
import { queueRow, sortQueue } from "./resultValidationData";
import type { TestingSessionRow, ValidationQueue } from "./resultValidationData";

const EVENT_ID = "preview-event-u14";
const FPS = 60;
const FRAMES = 96;

const PLAYERS = [
  { id: "preview-ava", name: "Ava Martinez", rosterOrder: 0 },
  { id: "preview-ben", name: "Ben Okafor", rosterOrder: 1 },
  { id: "preview-cam", name: "Cam Nguyen", rosterOrder: 2 },
];

const SESSIONS: TestingSessionRow[] = [
  { id: EVENT_ID, name: "U14 Boys — fall combine", status: "closed", participantCount: 3, createdAtMillis: Date.UTC(2026, 10, 3, 17), teamIds: ["preview-team"], organizationId: "preview-org" },
  { id: "preview-event-u12", name: "U12 Girls — preseason testing", status: "closed", participantCount: 0, createdAtMillis: Date.UTC(2026, 9, 28, 16), teamIds: ["preview-team-2"], organizationId: "preview-org" },
];

interface PreviewRep { playerId: string; rep: any; metadata: any; broadJump: any; pose: any[]; tracking: any; extra: Record<string, any>; sessionJson: Record<string, any>; adminAnnotations: any; revisions: RepRevisionRow[] }
const REPS = new Map<string, PreviewRep>();
/** What seeded legacy revisions replaced, for restoring them in the preview. */
const PREVIEW_LEGACY = new Map<string, { rep: any; metadata: any }>();

// MARK: - A synthetic athlete: MediaPipe's 33 landmarks as [x, y, z, visibility]

function figure(hipX: number, hipY: number, crouch: number, tuck: number): number[][] {
  const rows: number[][] = Array.from({ length: 33 }, () => [hipX, hipY, 0, 0.05]);
  const set = (index: number, x: number, y: number) => { rows[index] = [x, y, 0, 0.95]; };
  const shoulderY = hipY - 0.2 + crouch * 0.05;
  set(0, hipX + 0.012, shoulderY - 0.07);
  set(11, hipX - 0.012, shoulderY); set(12, hipX + 0.012, shoulderY);
  set(13, hipX - 0.03, shoulderY + 0.09); set(14, hipX + 0.01, shoulderY + 0.09);
  set(15, hipX - 0.04 + tuck * 0.06, shoulderY + 0.17 - tuck * 0.12); set(16, hipX + 0.0 + tuck * 0.06, shoulderY + 0.17 - tuck * 0.12);
  set(23, hipX - 0.008, hipY); set(24, hipX + 0.008, hipY);
  const kneeX = hipX + 0.025 * (crouch + tuck), kneeY = hipY + 0.13 - crouch * 0.03 - tuck * 0.05;
  set(25, kneeX - 0.006, kneeY); set(26, kneeX + 0.006, kneeY);
  const ankleX = hipX - 0.004 + tuck * 0.02, ankleY = hipY + 0.26 - crouch * 0.07 - tuck * 0.1;
  set(27, ankleX - 0.004, ankleY); set(28, ankleX + 0.004, ankleY);
  set(29, ankleX - 0.012, ankleY + 0.012); set(30, ankleX - 0.008, ankleY + 0.012);
  set(31, ankleX + 0.016, ankleY + 0.014); set(32, ankleX + 0.02, ankleY + 0.014);
  return rows;
}

/** Stand, load, fly from x 0.30 to 0.61, land and absorb. Ground at y 0.82. */
function broadJumpPose(): any[] {
  return Array.from({ length: FRAMES }, (_, f) => {
    const takeoff = 34, landing = 58;
    if (f < takeoff) {
      const load = f < 20 ? 0 : Math.min(1, (f - 20) / 12);
      return figure(0.3, 0.56 + load * 0.07, load, 0);
    }
    if (f <= landing) {
      const t = (f - takeoff) / (landing - takeoff);
      return figure(0.3 + 0.31 * t, 0.56 - Math.sin(Math.PI * t) * 0.16, 0.2, Math.sin(Math.PI * t));
    }
    const absorb = Math.max(0, 1 - (f - landing) / 18);
    return figure(0.61, 0.56 + absorb * 0.06, absorb, 0);
  });
}

function footCenters(pose: any[]): number[][] {
  return pose.map(frame => {
    const points = [28, 30, 32].map(index => frame[index]);
    return [points.reduce((sum, p) => sum + p[0], 0) / 3, points.reduce((sum, p) => sum + p[1], 0) / 3];
  });
}

// MARK: - Synthetic markers and tracks, in the formats the phone writes

const W = 1920, H = 1080;

/** ArucoMarkerObservation.jsonPayload: a square marker (in pixels) whose bottom edge sits at `bottom`. */
function marker(id: number, centerX: number, bottom: number, role: string | null = null, sizePx = 70) {
  const hw = sizePx / 2 / W, hh = sizePx / 2 / H, cy = bottom - hh;
  const corners = [{ x: centerX - hw, y: cy - hh }, { x: centerX + hw, y: cy - hh }, { x: centerX + hw, y: bottom }, { x: centerX - hw, y: bottom }];
  return {
    id, dictionary: "DICT_4X4_100", role,
    cornersNormalized: corners, cornersPixels: corners.map(p => ({ x: p.x * W, y: p.y * H })),
    centerNormalized: { x: centerX, y: cy }, centerPixel: { x: centerX * W, y: cy * H },
  };
}

function trackingFrom(com: ([number, number] | null)[], fps = FPS) {
  return {
    schemaVersion: 1, drill: "preview", fps, frameCount: com.length, coordinates: "normalized-top-left",
    frames: com.map((point, index) => ({
      index, timestampMs: Math.round((index / fps) * 1000),
      person: point ? { x: point[0] - 0.025, y: point[1] - 0.21, w: 0.05, h: 0.42 } : null,
      com: point ? { x: point[0], y: point[1] } : null, ball: null,
    })),
  };
}

function sprintEvidence(topSpeed: number) {
  const start = 8, onset = 12, end = 84;
  const left = marker(3, 0.1, 0.8, null, 24), right = marker(7, 0.88, 0.8, null, 24);
  const velocity = Array.from({ length: FRAMES }, (_, f) => (f < onset ? 0 : topSpeed * (1 - Math.exp(-(f - onset) / FPS / 1.1))));
  let x = 0;
  const travelled = velocity.map(v => (x += v / FPS));
  const atEnd = travelled[end] || 1;
  const com: [number, number][] = travelled.map(d => [0.1 + (d / atEnd) * 0.78, 0.56 + Math.sin(d * 3) * 0.004]);
  const acceleration = velocity.map((v, f) => (f === 0 ? 0 : (v - velocity[f - 1]) * FPS));
  return {
    extra: {
      "COM.json": com,
      "velocity.json": velocity,
      "kalman_velocity.json": velocity.map((v, f) => Math.max(0, v + Math.sin(f * 1.7) * 0.25)),
      "model_velocity.json": velocity.map((v, f) => (f >= start && f <= end ? v : null)),
      "acceleration.json": acceleration,
      "sprint_model_fit.json": { status: "model", metric_source: "model", vMax: topSpeed, tau: 1.1, rmse: 0.18, rejected_frames: [41, 42] },
      "aruco_points.json": {
        frame_shape: { x: W, y: H }, markers: [left, right],
        point1: left.centerNormalized, point2: right.centerNormalized,
        ground_line: { point1: { x: 0.1, y: 0.8 }, point2: { x: 0.88, y: 0.8 } }, ground_y: 0.8,
        distance: 10, marker_distance: 10, marker_distance_source: "manual", starting_side: "left",
        start_frame: start, motion_onset_frame: onset, end_frame: end,
      },
    },
    tracking: trackingFrom(com),
    metadata: { fps: FPS, frameWidth: W, frameHeight: H, poseComputed: false, poseSkippedReason: "poseForReplay=off", markerSource: "video", tracker: "local_yolov3_scout_then_dense", resultsValid: true, processingStatus: "complete", failedSteps: [] },
  };
}

function shuttleEvidence() {
  const left = marker(2, 0.18, 0.82, null, 34), right = marker(5, 0.82, 0.82, null, 34);
  const frames = { startFrame: 6, phase1EndFrame: 40, apexFrame: 46, phase2EndFrame: 52, endFrame: 88 };
  const com: [number, number][] = Array.from({ length: FRAMES }, (_, f) => {
    const t = f < 6 ? 0 : f <= 46 ? (f - 6) / 40 : Math.max(0, 1 - (f - 46) / 42);
    return [0.18 + 0.66 * Math.sin((t * Math.PI) / 2), 0.58];
  });
  return {
    frames,
    tracking: trackingFrom(com),
    metadata: {
      ...frames, arucoMarkers: [left, right], markerDistance: 9.144, poseComputed: false, markerSource: "video",
      arucoGate: { startXNorm: 0.18, stopXNorm: 0.82, groundYNorm: 0.82, groundLine: { point1: { x: 0.18, y: 0.82 }, point2: { x: 0.82, y: 0.82 } } },
    },
  };
}

/** Load, extend, fly straight up and land. Ground at y 0.83; marker beside the athlete. */
function verticalJump() {
  const scale = 2.2;
  const pose = Array.from({ length: FRAMES }, (_, f) => {
    if (f < 16) return figure(0.45, 0.56, 0, 0);
    if (f < 28) return figure(0.45, 0.56 + ((f - 16) / 12) * 0.06, (f - 16) / 12, 0);
    if (f < 34) return figure(0.45, 0.62 - ((f - 28) / 6) * 0.07, 1 - (f - 28) / 6, 0);
    if (f <= 58) { const t = (f - 34) / 24; return figure(0.45, 0.55 - Math.sin(Math.PI * t) * 0.13, 0, Math.sin(Math.PI * t) * 0.3); }
    return figure(0.45, 0.56 + Math.max(0, 1 - (f - 58) / 12) * 0.05, Math.max(0, 1 - (f - 58) / 12), 0);
  });
  const torso = pose.map(frame => [(frame[11][0] + frame[12][0] + frame[23][0] + frame[24][0]) / 4, 0.4 * (frame[11][1] + frame[12][1]) / 2 + 0.6 * (frame[23][1] + frame[24][1]) / 2]);
  const chestY0 = torso.slice(0, 10).reduce((sum, p) => sum + p[1], 0) / 10;
  const offsets = torso.map(p => [0, (p[1] - chestY0) * scale]);
  const keyFrames = [27, 31, 34, 46];
  const offset = Math.max(0, keyFrames[0] - 100);
  const velocity = offsets.slice(offset, keyFrames[2] + 1).map((p, i, all) => [0, i ? (p[1] - all[i - 1][1]) * FPS : 0]);
  const acceleration = velocity.map((p, i, all) => [0, i ? (p[1] - all[i - 1][1]) * FPS : 0]);
  const grf = acceleration.map(p => 1.5 * 45 * (9.81 - p[1]));
  const peakRise = -Math.min(...offsets.map(p => p[1]));
  return {
    pose, jumpHeight: peakRise,
    extra: {
      "torso_midpoints.json": torso, "key_frames.json": keyFrames, "chest_offsets.json": offsets,
      "velocity.json": velocity, "acceleration.json": acceleration, "grf.json": grf,
      "joint_angles_key_frames.json": [[62, 95, 88, 20, 160], [70, 120, 130, 40, 150], [85, 172, 175, 160, 170], [88, 178, 178, 170, 175]],
    },
    metadata: { m_to_normalized_units: scale, ground_loc_y: 0.83, chest_starting_loc: chestY0, arucoMarkers: [marker(11, 0.68, 0.83)] },
  };
}

function kickEvidence() {
  const contact = 40, transition = 30;
  const rest = [0.48, 0.79, 0.505, 0.835];
  const t: number[] = [], xs: number[] = [], ys: number[] = [];
  for (let f = contact; f <= contact + 30; f++) { const k = f - contact; t.push(f); xs.push(0.4925 + k * 0.014); ys.push(0.8125 - k * 0.012 + k * k * 0.00012); }
  return {
    pose: Array.from({ length: FRAMES }, (_, f) => figure(0.42 + Math.max(0, Math.min(1, (f - transition) / 10)) * 0.03, 0.56, 0, 0)),
    extra: {
      "orig_ball.json": rest,
      "ball_boxes.json": Array.from({ length: FRAMES }, () => rest),
      "ball_trajectory.json": { t_values: t, x_values: xs, y_values: ys, contact_frame: contact, transition_frame: transition, direction: "left_to_right" },
      "ball_information.json": { ball_speed_ms: 24.1, ball_speed_mph: 53.9, launch_angle: 18.2, contact_frame: contact },
    },
    metadata: { frameWidth: W, frameHeight: H, m_per_px: 0.0021, aruco_marker_length_m: 0.149225, arucoMarkers: [marker(9, 0.75, 0.84, "deadball")], tracker: "kalman", resultsValid: true, processingStatus: "complete" },
  };
}

function addRep(playerId: string, id: string, rep: any, metadata: any, pose: any[], broadJump: any = null, more: { tracking?: any; extra?: Record<string, any>; sessionJson?: Record<string, any> } = {}) {
  REPS.set(`${playerId}/${id}`, {
    playerId,
    rep: { id, createdAtMillis: SESSIONS[0].createdAtMillis! + REPS.size * 60_000, testingEventId: EVENT_ID, testingParticipantId: playerId, ...rep },
    metadata: { framesPerSecond: FPS, totalFrames: FRAMES, videoDisplayWidth: W, videoDisplayHeight: H, ...metadata },
    broadJump, pose, tracking: more.tracking ?? null, extra: more.extra ?? {}, sessionJson: more.sessionJson ?? {}, adminAnnotations: null, revisions: [],
  });
}

function seed() {
  if (REPS.size) return;
  const jumpPose = broadJumpPose();
  const feet = footCenters(jumpPose);
  const comMidpoints = jumpPose.map(frame => [(frame[11][0] + frame[23][0]) / 2, 0.4 * frame[11][1] + 0.6 * frame[23][1]]);
  const baselineY = comMidpoints.slice(0, 10).reduce((sum, p) => sum + p[1], 0) / 10;
  PLAYERS.forEach((player, index) => {
    // The phone measured the landing foot after it slid forward: 0.035 too far for Ava.
    const slide = index === 0 ? 0.035 : 0.004 * index;
    const startX = feet[34][0], endX = feet[58][0] + slide;
    const scale = 5.2;
    const distance = Math.abs(endX - startX) * scale;
    const fit = { footSide: "right", takeoffFrameIndex: 34, landingFrameIndex: 58, takeoffFrame: 34, landingFrame: 58, startFootXNorm: startX, endFootXNorm: endX, segments: [] };
    for (const rep of [1, 2]) {
      const shift = (rep - 1) * 0.01;
      const id = `bj-${player.id}-${rep}`;
      const flaggedRep = index === 2 && rep === 2;
      addRep(player.id, id,
        { repType: "broadJump", sessionNumber: 1, repNumber: rep, broadJumpDistance: flaggedRep ? null : distance + shift, takeoffFrame: 34, landingFrame: 58, ...(flaggedRep ? { resultsValid: false, processingStatus: "partial" } : {}) },
        { broadJumpDistance: flaggedRep ? null : distance + shift, m_to_normalized_units: scale, ground_loc_y: 0.832, baselineComYNorm: baselineY, footSide: "right", arucoMarkers: [marker(4, 0.2, 0.832)], resultsValid: !flaggedRep, ...(flaggedRep ? { processingStatus: "partial", failedSteps: ["broadJump.fit"] } : {}) },
        jumpPose, { fit, footCenters: feet, comMidpoints },
        { extra: { "key_frames.json": [34, 58], "com_height.json": comMidpoints.map(p => (baselineY - p[1]) * scale) } });
    }
    const sprint = sprintEvidence(7.4 + index * 0.4);
    addRep(player.id, `sp-${player.id}`, { repType: "sprint", sessionNumber: 2, repNumber: 1, max_velocity: 7.2 + index * 0.4, totalTime: 2.9 - index * 0.1, distance: 10 },
      sprint.metadata, [], null, { tracking: sprint.tracking, extra: sprint.extra });
    const shuttle = shuttleEvidence();
    addRep(player.id, `cod-${player.id}`, { repType: "changeOfDirection", sessionNumber: 3, repNumber: 1, totalTime: 5.1 + index * 0.2, ...shuttle.frames },
      { totalTime: 5.1 + index * 0.2, ...shuttle.metadata }, [], null, { tracking: shuttle.tracking });
    const jump = verticalJump();
    addRep(player.id, `vj-${player.id}`, { repType: "jump", sessionNumber: 4, repNumber: 1, jumpHeight: jump.jumpHeight },
      jump.metadata, jump.pose, null, { extra: jump.extra });
    const kick = kickEvidence();
    addRep(player.id, `sh-${player.id}`, { repType: "deadballShot", sessionNumber: 5, repNumber: 1, velocity: 24.1, launch_angle: 18.2, strike_foot: "right" },
      kick.metadata, kick.pose, null, { extra: kick.extra });
  });
  // A legacy rejection (saved before flagging existed): the result was marked invalid.
  const rejected = REPS.get(`${PLAYERS[0].id}/vj-${PLAYERS[0].id}`)!;
  PREVIEW_LEGACY.set("preview-rejected", { rep: structuredClone(rejected.rep), metadata: structuredClone(rejected.metadata) });
  rejected.rep.adminRevision = { revisionId: "preview-rejected", method: "manual_annotation", byEmail: "admin@posetek.test", atMillis: Date.UTC(2026, 10, 5, 23), note: "Rejected · ended too early" };
  rejected.metadata = { ...rejected.metadata, resultsValid: false, processingStatus: "partial", failedSteps: ["admin.rejected"] };
  rejected.revisions.unshift({ id: "preview-rejected", createdAtMillis: Date.UTC(2026, 10, 5, 23), byEmail: "admin@posetek.test", note: "Rejected · ended too early", fields: {}, restored: false });

  // One rep already validated, as it would read back from Firestore.
  const done = REPS.get(`${PLAYERS[1].id}/bj-${PLAYERS[1].id}-1`)!;
  done.rep.adminRevision = { revisionId: "preview-earlier", method: "manual_annotation", byEmail: "coach@posetek.test", atMillis: Date.UTC(2026, 10, 4, 18), note: "Validated" };
}

// MARK: - A synthetic organization for the age curve

/** Cam has no birth date or age on file, like many real profiles. */
const sessionProfile = (id: string) => {
  const index = Math.max(0, PLAYERS.findIndex(player => player.id === id));
  if (id === "preview-cam") return { gender: "male" };
  return { birthDate: new Date(Date.UTC(2012, 8 - index * 5, 10)).toISOString().slice(0, 10), gender: "male" };
};

/** Typical value by age in stored units, and how much it varies. */
const TRENDS: Record<string, { field: string; type: string; at9: number; perYear: number; spread: number }> = {
  broadJump: { field: "broadJumpDistance", type: "broadJump", at9: 1.25, perYear: 0.085, spread: 0.14 },
  sprint: { field: "max_velocity", type: "sprint", at9: 5.4, perYear: 0.32, spread: 0.45 },
  jump: { field: "jumpHeight", type: "jump", at9: 0.24, perYear: 0.022, spread: 0.04 },
  changeOfDirection: { field: "totalTime", type: "changeOfDirection", at9: 6.3, perYear: -0.12, spread: 0.35 },
  dribbling: { field: "totalTime", type: "dribbling", at9: 8.2, perYear: -0.16, spread: 0.5 },
  shooting: { field: "velocity", type: "deadballShot", at9: 14, perYear: 1.4, spread: 2.2 },
};

function organizationReps(drillKey: string) {
  seed();
  const trend = TRENDS[drillKey];
  let state = 1234567 + drillKey.length * 97;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const normal = () => Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
  const out: { playerId: string; playerName: string; profile: any; rep: any }[] = [];
  if (trend) {
    for (let athlete = 0; athlete < 60; athlete++) {
      const age = 9 + random() * 9.5;
      const birth = new Date(Date.UTC(2026, 10, 3) - age * 365.2425 * 86_400_000);
      const talent = normal();
      const profile = { birthDate: birth.toISOString().slice(0, 10), gender: "male" };
      for (let rep = 0; rep < 2 + Math.floor(random() * 3); rep++) {
        const value = trend.at9 + trend.perYear * (age - 9) + trend.spread * (0.8 * talent + 0.45 * normal());
        out.push({ playerId: `org-${athlete}`, playerName: `Athlete ${athlete + 1}`, profile, rep: { id: `org-${athlete}-${rep}`, repType: trend.type, createdAtMillis: Date.UTC(2026, 9, 1 + rep * 7), [trend.field]: Math.max(0.05, value) } });
      }
    }
  }
  // The session's own athletes belong to the organization too, except Cam (an unlinked player record).
  for (const entry of REPS.values()) {
    if (entry.playerId === "preview-cam") continue;
    const player = PLAYERS.find(item => item.id === entry.playerId)!;
    out.push({ playerId: entry.playerId, playerName: player.name, profile: sessionProfile(entry.playerId), rep: entry.rep });
  }
  return out.filter(item => drillKeyMatches(item.rep, drillKey));
}

function drillKeyMatches(rep: any, drillKey: string) {
  const type = rep.repType || rep.drillType;
  return drillKey === "shooting" ? ["deadballShot", "side_kick", "shooting"].includes(type) : type === drillKey;
}

// MARK: - The backend the page and the rep tools use in preview

export function previewBackend() {
  seed();
  let revisionCounter = 0;
  // What each revision replaced, so a restore can put it back (adminRestoreRepRevision).
  const before = new Map<string, { rep: any; metadata: any }>(PREVIEW_LEGACY);
  const repTools: RepToolsSource = {
    loadRep: async (playerId, repId) => structuredClone(REPS.get(`${playerId}/${repId}`)?.rep ?? null),
    loadPlayer: async playerId => {
      const player = PLAYERS.find(item => item.id === playerId);
      return player ? ({ id: player.id, name: player.name, email: "", coachId: null, organizationId: null, teamId: null, registered: true, signupCode: null, raw: {} } as PlayerRow) : null;
    },
    loadRepArtifacts: async (_drill, rep, playerId): Promise<RepArtifactBundle> => {
      const entry = REPS.get(`${playerId}/${rep.id}`)!;
      const json: Record<string, any> = {
        ...(entry.pose.length ? { "pose.json": entry.pose } : {}), "metadata.json": structuredClone(entry.metadata),
        ...(entry.tracking ? { "tracking.json": entry.tracking } : {}),
        ...(entry.broadJump ? { "foot_centers.json": entry.broadJump.footCenters, "foot_piecewise_fit.json": entry.broadJump.fit, "com_midpoints.json": entry.broadJump.comMidpoints } : {}),
        ...entry.extra,
      };
      return {
        folder: `${playerId}/preview/${rep.id}`, sessionRoot: `${playerId}/preview`, mediaUrl: null, mediaName: null,
        pose: entry.pose.length ? entry.pose : null, tracking: entry.tracking, trackingLoadError: false, metadata: structuredClone(entry.metadata), reprocessContext: null,
        arucoCorners: null, markerConfig: null, adminAnnotations: structuredClone(entry.adminAnnotations), ballBoxes: entry.extra["ball_boxes.json"] ?? null, jumpTechnique: {},
        broadJump: entry.broadJump,
        files: Object.keys(json),
        json,
        sessionJson: entry.sessionJson,
        sessionFiles: Object.keys(entry.sessionJson),
      };
    },
    loadRepRevisions: async (playerId, repId) => structuredClone(REPS.get(`${playerId}/${repId}`)?.revisions ?? []),
    pushRepRevision: async payload => {
      const entry = REPS.get(`${payload.playerId}/${payload.repId}`);
      if (!entry) throw new Error("That rep no longer exists.");
      await new Promise(resolve => setTimeout(resolve, 250));
      const revisionId = `preview-${++revisionCounter}`;
      const provenance = { revisionId, method: "manual_annotation", byEmail: "admin@posetek.test", atMillis: Date.now(), note: payload.note || null };
      before.set(revisionId, { rep: structuredClone(entry.rep), metadata: structuredClone(entry.metadata) });
      entry.revisions.unshift({ id: revisionId, createdAtMillis: Date.now(), byEmail: "admin@posetek.test", note: payload.note, fields: payload.fields, restored: false });
      entry.rep = { ...entry.rep, ...payload.fields, adminRevision: provenance };
      entry.metadata = { ...entry.metadata, ...payload.metadata, adminRevision: provenance };
      if (payload.annotations) entry.adminAnnotations = { ...payload.annotations, revisionId };
      console.info("[result validation preview] saved", payload);
      return { revisionId, folder: `${payload.playerId}/preview/${payload.repId}`, rep: structuredClone(entry.rep) };
    },
    restoreRepRevision: async (playerId: string, repId: string, revisionId: string) => {
      const entry = REPS.get(`${playerId}/${repId}`);
      const previous = before.get(revisionId);
      const row = entry?.revisions.find(item => item.id === revisionId);
      if (!entry || !previous || !row) throw new Error("That revision does not exist.");
      if (row.restored) throw new Error("That revision was already restored.");
      await new Promise(resolve => setTimeout(resolve, 200));
      entry.rep = previous.rep;
      entry.metadata = previous.metadata;
      row.restored = true;
      return { revisionId, rep: structuredClone(entry.rep) };
    },
  };
  return {
    // Synthetic birth dates (ages 13–14 at the combine) and a synthetic benchmark with real spread.
    loadPlayerProfiles: async (ids: string[]) => Object.fromEntries(ids.map(id => [id, sessionProfile(id)])),
    loadOrganizationReps: async (organizationId: string, drillKey: string) => {
      await new Promise(resolve => setTimeout(resolve, 400));
      return { organizationId, organizationName: "Vacaville SC (synthetic)", drillKey, players: 63, reps: organizationReps(drillKey), failedPlayers: 0, truncated: false };
    },
    loadBenchmarks: async () => ({ schemaVersion: 1, tier: "preview", generation: 0, cells: Object.fromEntries(
      ["u12", "u14", "u16", "u18", "senior"].map((band, index) => [`${band}|male`, {
        broadJumpDistance: { derivation: "measured", athletes: 40 + index * 10, percentiles: { p25: 1.45 + index * 0.18, p50: 1.6 + index * 0.18, p75: 1.75 + index * 0.18 } },
        sprintMaxSpeed: { derivation: "measured", athletes: 40, percentiles: { p25: 6.2 + index * 0.5, p50: 6.8 + index * 0.5, p75: 7.3 + index * 0.5 } },
        verticalJumpHeight: { derivation: "scaled", athletes: 1, percentiles: { p25: 0.3 + index * 0.04, p50: 0.34 + index * 0.04, p75: 0.38 + index * 0.04 } },
        codTotalTime: { derivation: "measured", athletes: 30, percentiles: { p25: 5.6 - index * 0.2, p50: 5.3 - index * 0.2, p75: 5.0 - index * 0.2 } },
        ballSpeed: { derivation: "measured", athletes: 30, percentiles: { p25: 18 + index * 2, p50: 21 + index * 2, p75: 24 + index * 2 } },
      }]))
    }),
    listTestingSessions: async (): Promise<TestingSessionRow[]> => SESSIONS,
    loadValidationQueue: async (eventId: string): Promise<ValidationQueue> => {
      const rows = [...REPS.values()].filter(entry => entry.rep.testingEventId === eventId)
        .map(entry => queueRow(entry.rep, PLAYERS.find(player => player.id === entry.playerId)!))
        .filter(row => row !== null);
      return { eventId, rows: sortQueue(rows), failedPlayers: [] };
    },
    repTools,
  };
}
