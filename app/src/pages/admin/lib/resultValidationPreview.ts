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
  { id: EVENT_ID, name: "U14 Boys — fall combine", status: "closed", participantCount: 3, createdAtMillis: Date.UTC(2026, 10, 3, 17), teamIds: ["preview-team"] },
  { id: "preview-event-u12", name: "U12 Girls — preseason testing", status: "closed", participantCount: 0, createdAtMillis: Date.UTC(2026, 9, 28, 16), teamIds: ["preview-team-2"] },
];

interface PreviewRep { playerId: string; rep: any; metadata: any; broadJump: any; pose: any[]; adminAnnotations: any; revisions: RepRevisionRow[] }
const REPS = new Map<string, PreviewRep>();

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

function standingPose(x: number, drift = 0): any[] {
  return Array.from({ length: FRAMES }, (_, f) => figure(x + drift * f, 0.56, 0, 0));
}

function addRep(playerId: string, id: string, rep: any, metadata: any, pose: any[], broadJump: any = null) {
  REPS.set(`${playerId}/${id}`, {
    playerId,
    rep: { id, createdAtMillis: SESSIONS[0].createdAtMillis! + REPS.size * 60_000, testingEventId: EVENT_ID, testingParticipantId: playerId, ...rep },
    metadata: { framesPerSecond: FPS, totalFrames: FRAMES, videoDisplayWidth: 1920, videoDisplayHeight: 1080, ...metadata },
    broadJump, pose, adminAnnotations: null, revisions: [],
  });
}

function seed() {
  if (REPS.size) return;
  const jumpPose = broadJumpPose();
  const feet = footCenters(jumpPose);
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
        { broadJumpDistance: flaggedRep ? null : distance + shift, m_to_normalized_units: scale, ground_loc_y: 0.832, footSide: "right", resultsValid: !flaggedRep, ...(flaggedRep ? { processingStatus: "partial", failedSteps: ["broadJump.fit"] } : {}) },
        jumpPose, { fit, footCenters: feet, comMidpoints: jumpPose.map(frame => [frame[23][0], (frame[11][1] + frame[23][1]) / 2]) });
    }
    addRep(player.id, `sp-${player.id}`, { repType: "sprint", sessionNumber: 2, repNumber: 1, max_velocity: 6.4 + index * 0.4, totalTime: 2.9 - index * 0.1, startFrame: 4, endFrame: 88 },
      { max_velocity: 6.4 + index * 0.4 }, standingPose(0.15, 0.007));
    addRep(player.id, `cod-${player.id}`, { repType: "changeOfDirection", sessionNumber: 3, repNumber: 1, totalTime: 5.1 + index * 0.2, startFrame: 6, endFrame: 90 },
      { totalTime: 5.1 + index * 0.2 }, standingPose(0.5));
  });
  // One rep already validated, as it would read back from Firestore.
  const done = REPS.get(`${PLAYERS[1].id}/bj-${PLAYERS[1].id}-1`)!;
  done.rep.adminRevision = { revisionId: "preview-earlier", method: "manual_annotation", byEmail: "coach@posetek.test", atMillis: Date.UTC(2026, 10, 4, 18), note: "Validated" };
}

// MARK: - The backend the page and the rep tools use in preview

export function previewBackend() {
  seed();
  let revisionCounter = 0;
  const repTools: RepToolsSource = {
    loadRep: async (playerId, repId) => structuredClone(REPS.get(`${playerId}/${repId}`)?.rep ?? null),
    loadPlayer: async playerId => {
      const player = PLAYERS.find(item => item.id === playerId);
      return player ? ({ id: player.id, name: player.name, email: "", coachId: null, organizationId: null, teamId: null, registered: true, signupCode: null, raw: {} } as PlayerRow) : null;
    },
    loadRepArtifacts: async (_drill, rep, playerId): Promise<RepArtifactBundle> => {
      const entry = REPS.get(`${playerId}/${rep.id}`)!;
      return {
        folder: `${playerId}/preview/${rep.id}`, sessionRoot: `${playerId}/preview`, mediaUrl: null, mediaName: null,
        pose: entry.pose, tracking: null, trackingLoadError: false, metadata: structuredClone(entry.metadata), reprocessContext: null,
        arucoCorners: null, markerConfig: null, adminAnnotations: structuredClone(entry.adminAnnotations), ballBoxes: null, jumpTechnique: {},
        broadJump: entry.broadJump, files: ["pose.json", "metadata.json", ...(entry.broadJump ? ["foot_centers.json", "foot_piecewise_fit.json", "com_midpoints.json"] : [])],
      };
    },
    loadRepRevisions: async (playerId, repId) => structuredClone(REPS.get(`${playerId}/${repId}`)?.revisions ?? []),
    pushRepRevision: async payload => {
      const entry = REPS.get(`${payload.playerId}/${payload.repId}`);
      if (!entry) throw new Error("That rep no longer exists.");
      await new Promise(resolve => setTimeout(resolve, 250));
      const revisionId = `preview-${++revisionCounter}`;
      const provenance = { revisionId, method: "manual_annotation", byEmail: "admin@posetek.test", atMillis: Date.now(), note: payload.note || null };
      entry.revisions.unshift({ id: revisionId, createdAtMillis: Date.now(), byEmail: "admin@posetek.test", note: payload.note, fields: payload.fields, restored: false });
      entry.rep = { ...entry.rep, ...payload.fields, adminRevision: provenance };
      entry.metadata = { ...entry.metadata, ...payload.metadata, adminRevision: provenance };
      if (payload.annotations) entry.adminAnnotations = { ...payload.annotations, revisionId };
      console.info("[result validation preview] saved", payload);
      return { revisionId, folder: `${payload.playerId}/preview/${payload.repId}`, rep: structuredClone(entry.rep) };
    },
    restoreRepRevision: async () => { throw new Error("Restoring is not simulated in the preview."); },
  };
  return {
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
