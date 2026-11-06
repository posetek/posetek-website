// Firebase reads and the callable writes behind the rep tools.
//
// Reads go straight to Firestore/Storage — an admin may read every athlete
// record. Writes go through the `adminReviseRep` / `adminRestoreRepRevision`
// callables (functions/rep-revisions.js): the rules deny every client, admins
// included, a write to reps or to athlete recording folders, so the Admin SDK
// behind those callables is the only path that can overwrite a rep in place.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { cloud, db, storage } from "../../../lib/firebase";
import type { Drill } from "../../athlete-portal/lib/drills";
import { normalizeRep, sessionFolder } from "../../athlete-portal/lib/metrics";
import { artifactFolder } from "../../athlete-portal/lib/metrics";
import { JUMP_ARTIFACTS, type JumpSources } from "./jumpTechnique";
import { parseArtifactJson } from "./repTools";
import type { RevisionPayload } from "./repTools";
import type { BroadJumpEvidence } from "./resultValidation";

export interface RepArtifactBundle {
  folder: string;
  sessionRoot: string;
  mediaUrl: string | null;
  mediaName: string | null;
  pose: any;
  tracking: any;
  trackingLoadError: boolean;
  metadata: any;
  reprocessContext: any;
  arucoCorners: any;
  markerConfig: any;
  adminAnnotations: any;
  ballBoxes: any;
  jumpTechnique: JumpSources;
  /** foot_piecewise_fit.json, foot_centers.json and com_midpoints.json for a broad jump. */
  broadJump: BroadJumpEvidence | null;
  /** Artifact names found directly in the rep folder. */
  files: string[];
  /** Every JSON file read from the rep folder, by name (the ones above included). */
  json: Record<string, any>;
  /** JSON files read from the session root (calibration photo markers, gate taps, …), by name. */
  sessionJson: Record<string, any>;
  /** Every file name directly in the session root. */
  sessionFiles: string[];
}

/** Bounds on the extra files read for the evidence panel; pose and tracking are read regardless. */
const MAX_EXTRA_REP_FILES = 40;
const MAX_SESSION_FILES = 20;

async function readMany(folder: any, names: string[]): Promise<Record<string, any>> {
  const entries: [string, any][] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, names.length) }, async () => {
    while (next < names.length) {
      const name = names[next++];
      entries.push([name, await readJsonAt(folder.child(name))]);
    }
  }));
  return Object.fromEntries(entries.filter(([, value]) => value !== null));
}

async function readJsonAt(ref: any): Promise<any> {
  try {
    const url = await ref.getDownloadURL();
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return parseArtifactJson(await response.text());
  } catch {
    return null;
  }
}

const MARKER_CONFIG_NAMES: Record<string, string> = {
  changeOfDirection: "change_of_direction_marker.json",
  dribbling: "dribbling_marker.json",
  sprint: "sprint_marker.json",
};

export async function loadRep(playerId: string, repId: string): Promise<any | null> {
  const doc = await db.collection("players").doc(playerId).collection("reps").doc(repId).get();
  return doc.exists ? normalizeRep(doc) : null;
}

export async function loadRepArtifacts(drill: Drill, rep: any, playerId: string): Promise<RepArtifactBundle> {
  const folder = artifactFolder(rep, drill, playerId);
  const base = storage.ref(folder);
  const sessionRoot = `${playerId}/${drill.storage}/${sessionFolder(rep)}`;
  const root = storage.ref(sessionRoot);

  let files: string[] = [];
  let mediaUrl: string | null = null;
  let mediaName: string | null = null;
  try {
    const listing = await base.listAll();
    files = listing.items.map(item => item.name);
    const movie = listing.items.find(item => /\.(mov|mp4)$/i.test(item.name));
    if (movie) {
      mediaUrl = await movie.getDownloadURL();
      mediaName = movie.name;
    }
  } catch (error) {
    console.warn("[rep tools] folder listing unavailable", folder, error);
  }

  const [pose, metadata, reprocessContext, adminAnnotations, ballBoxes, arucoCorners, markerConfig, tracking] = await Promise.all([
    readJsonAt(base.child("pose.json")),
    readJsonAt(base.child("metadata.json")),
    readJsonAt(base.child("reprocess_context.json")),
    readJsonAt(base.child("admin_annotations.json")),
    files.includes("ball_boxes.json") ? readJsonAt(base.child("ball_boxes.json")) : Promise.resolve(null),
    readJsonAt(root.child("aruco_corners.json")),
    MARKER_CONFIG_NAMES[drill.key] ? readJsonAt(root.child(MARKER_CONFIG_NAMES[drill.key])) : Promise.resolve(null),
    readJsonAt(base.child("tracking.json")),
  ]);

  const jumpTechnique = drill.key === "jump" ? Object.fromEntries(await Promise.all(JUMP_ARTIFACTS.map(async name => [name, await readJsonAt(base.child(name))]))) : {};
  const broadJump = drill.key === "broadJump"
    ? await Promise.all(["foot_piecewise_fit.json", "foot_centers.json", "com_midpoints.json"].map(name => readJsonAt(base.child(name))))
      .then(([fit, footCenters, comMidpoints]) => ({ fit, footCenters, comMidpoints }))
    : null;

  // Every other JSON file the phone wrote, so the reviewer sees the complete evidence.
  const known: Record<string, any> = {
    "pose.json": pose, "metadata.json": metadata, "reprocess_context.json": reprocessContext, "admin_annotations.json": adminAnnotations,
    "ball_boxes.json": ballBoxes, "tracking.json": tracking, ...jumpTechnique,
    ...(broadJump ? { "foot_piecewise_fit.json": broadJump.fit, "foot_centers.json": broadJump.footCenters, "com_midpoints.json": broadJump.comMidpoints } : {}),
  };
  const restNames = files.filter(name => /\.json$/i.test(name) && !Object.hasOwn(known, name)).slice(0, MAX_EXTRA_REP_FILES);
  const json = { ...Object.fromEntries(Object.entries(known).filter(([, value]) => value !== null && value !== undefined)), ...await readMany(base, restNames) };

  let sessionFiles: string[] = [];
  try {
    sessionFiles = (await root.listAll()).items.map(item => item.name);
  } catch (error) {
    console.warn("[rep tools] session listing unavailable", sessionRoot, error);
  }
  const markerName = MARKER_CONFIG_NAMES[drill.key];
  const sessionKnown: Record<string, any> = { "aruco_corners.json": arucoCorners, ...(markerName ? { [markerName]: markerConfig } : {}) };
  const sessionRest = sessionFiles.filter(name => /\.json$/i.test(name) && !Object.hasOwn(sessionKnown, name)).slice(0, MAX_SESSION_FILES);
  const sessionJson = { ...Object.fromEntries(Object.entries(sessionKnown).filter(([, value]) => value !== null)), ...await readMany(root, sessionRest) };

  return { folder, sessionRoot, mediaUrl, mediaName, pose, tracking, trackingLoadError: files.includes("tracking.json") && tracking === null, metadata, reprocessContext, arucoCorners, markerConfig, adminAnnotations, ballBoxes, jumpTechnique, broadJump, files, json, sessionJson, sessionFiles };
}

export interface RepRevisionRow {
  id: string;
  createdAtMillis: number;
  byEmail: string | null;
  note: string;
  fields: Record<string, any>;
  restored: boolean;
  previous?: Record<string, any>;
  recoveryRequired?: boolean;
}

export async function loadRepRevisions(playerId: string, repId: string): Promise<RepRevisionRow[]> {
  const result = await cloud.httpsCallable("adminGetRepRevisions")({ playerId, repId });
  const data = result.data as { revisions: RepRevisionRow[] };
  if (!Array.isArray(data.revisions)) throw new Error("Revision history could not be loaded.");
  return data.revisions;
}

export interface ReviseResult {
  revisionId: string;
  folder: string;
  rep: any;
}

export async function pushRepRevision(payload: RevisionPayload): Promise<ReviseResult> {
  const result = await cloud.httpsCallable("adminReviseRep")(payload);
  return result.data as ReviseResult;
}

export async function restoreRepRevision(playerId: string, repId: string, revisionId: string): Promise<any> {
  const result = await cloud.httpsCallable("adminRestoreRepRevision")({ playerId, repId, revisionId });
  return result.data;
}

export async function pushJumpTechnique(payload: {
  playerId: string; repId: string; drill: "jump"; note: string;
  jumpTechnique: { keyFrames: number[]; expectedKeyFrames: number[]; expectedRevisionId: string | null };
}): Promise<ReviseResult> {
  const result = await cloud.httpsCallable("adminReviseRep")(payload);
  return result.data as ReviseResult;
}
