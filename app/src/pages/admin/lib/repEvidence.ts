// Everything a rep saved that can be drawn over its frame or plotted against
// its frames, gathered from every file the phone wrote — so a reviewer sees the
// complete evidence, not only what one drill's math reads.
//
// Scene geometry (normalized 0..1 of the upright display frame, y down):
//   - ArUco markers: `ArucoMarkerObservation.jsonPayload` objects (id, role,
//     cornersPixels, cornersNormalized, centerNormalized; OpenCV corner order
//     top-left, top-right, bottom-right, bottom-left), from the rep's
//     metadata.json `arucoMarkers`, sprint's aruco_points.json `markers`, and the
//     session root's aruco_corners.json (the calibration photo).
//   - Ground: aruco_points.json `ground_line` / `ground_y`, metadata `ground_loc_y`.
//   - Gate: aruco_points.json `point1` / `point2`, metadata `arucoGate`.
// Frame series: any per-frame numeric array file (velocity.json,
// kalman_velocity.json, com_height.json, …), grouped by unit for plotting.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { num } from "./repTools";
import type { Point } from "./repTools";

export type EvidenceSource = "rep" | "rep.aruco_points" | "session.calibration";

export interface EvidenceMarker {
  id: number | null;
  role: string | null;
  /** Normalized corners in the order the phone wrote them (OpenCV: TL, TR, BR, BL). */
  corners: Point[];
  center: Point | null;
  /** Corners in the pixel space the phone measured them in (cornersPixels), when saved. */
  pixelCorners: Point[] | null;
  source: EvidenceSource;
}

export interface EvidenceLine { a: Point; b: Point; kind: "ground" | "gate"; label: string; source: string }
export interface EvidencePoint { point: Point; label: string; source: string }

export interface SceneEvidence {
  markers: EvidenceMarker[];
  lines: EvidenceLine[];
  points: EvidencePoint[];
  /** False when the session calibration photo's lens geometry did not match the clip. */
  calibrationTrusted: boolean;
  /** Every marker in the session calibration photo, drawn or not. */
  calibrationMarkers: EvidenceMarker[];
  /** Two-marker drills: how far apart the markers measure vs. the distance the processing used. */
  separation: MarkerSeparation | null;
}

/** ArucoMarkerPhysicalSize.sideLengthMeters (5.875 in). */
export const MARKER_SIDE_METERS = 5.875 * 0.0254;

export interface MarkerSeparation {
  a: Point;
  b: Point;
  /** Center-to-center distance in pixels, scaled by each marker's own size (mean of the two). */
  measuredMeters: number;
  configuredMeters: number | null;
  configuredSource: string | null;
  /** measured / configured − 1. */
  difference: number | null;
}

/**
 * The markers' apparent separation: center distance in pixels × meters per
 * pixel, where each marker's meters per pixel is its 5.875 in side over its
 * mean edge length in pixels, averaged over the two. A planar estimate (no
 * perspective correction); it is a check on the configured distance, not a
 * replacement for it.
 */
export function markerSeparation(markers: EvidenceMarker[], frameSize: Size | null, configuredMeters: number | null, configuredSource: string | null): MarkerSeparation | null {
  const usable = markers.filter(marker => marker.center && marker.corners.length >= 4);
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((m, n) => m.center!.x - n.center!.x);
  const [left, right] = [sorted[0], sorted[sorted.length - 1]];
  const pixels = (marker: EvidenceMarker): Point[] | null => marker.pixelCorners
    ?? (frameSize ? marker.corners.map(p => ({ x: p.x * frameSize.width, y: p.y * frameSize.height })) : null);
  // Both markers must be measured in one pixel space.
  const usePixels = left.pixelCorners && right.pixelCorners;
  const pl = usePixels ? left.pixelCorners! : pixels({ ...left, pixelCorners: null });
  const pr = usePixels ? right.pixelCorners! : pixels({ ...right, pixelCorners: null });
  if (!pl || !pr) return null;
  const meanEdge = (corners: Point[]) => corners.reduce((sum, p, index) => sum + Math.hypot(corners[(index + 1) % 4].x - p.x, corners[(index + 1) % 4].y - p.y), 0) / 4;
  const center = (corners: Point[]) => ({ x: corners.reduce((sum, p) => sum + p.x, 0) / 4, y: corners.reduce((sum, p) => sum + p.y, 0) / 4 });
  const edgeL = meanEdge(pl), edgeR = meanEdge(pr);
  if (!(edgeL > 0) || !(edgeR > 0)) return null;
  const metersPerPixel = (MARKER_SIDE_METERS / edgeL + MARKER_SIDE_METERS / edgeR) / 2;
  const cl = center(pl), cr = center(pr);
  const measuredMeters = Math.hypot(cr.x - cl.x, cr.y - cl.y) * metersPerPixel;
  const configured = configuredMeters !== null && configuredMeters > 0 ? configuredMeters : null;
  return { a: left.center!, b: right.center!, measuredMeters, configuredMeters: configured, configuredSource, difference: configured ? measuredMeters / configured - 1 : null };
}

interface Size { width: number; height: number }

function sizeOf(value: any): Size | null {
  const width = num(value?.width) ?? num(value?.x), height = num(value?.height) ?? num(value?.y);
  return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
}

/** {x, y} or [x, y]; pixel values (> 1.5) are normalized by the size they were measured in. */
export function pointFrom(value: any, size: Size | null = null): Point | null {
  const x = Array.isArray(value) ? num(value[0]) : num(value?.x);
  const y = Array.isArray(value) ? num(value[1]) : num(value?.y);
  if (x === null || y === null) return null;
  if (Math.abs(x) <= 1.5 && Math.abs(y) <= 1.5) return { x, y };
  return size ? { x: x / size.width, y: y / size.height } : null;
}

export function markerFrom(raw: any, source: EvidenceSource, size: Size | null): EvidenceMarker | null {
  if (!raw || typeof raw !== "object") return null;
  const markerSize = sizeOf(raw.imageSize) ?? size;
  const normalized = Array.isArray(raw.cornersNormalized) ? raw.cornersNormalized.map((p: any) => pointFrom(p)) : [];
  const pixels = Array.isArray(raw.cornersPixels) ? raw.cornersPixels.map((p: any) => pointFrom(p, markerSize)) : [];
  const corners = (normalized.length >= 4 && normalized.every(Boolean) ? normalized : pixels.length >= 4 && pixels.every(Boolean) ? pixels : []) as Point[];
  const center = pointFrom(raw.centerNormalized) ?? pointFrom(raw.centerPixel, markerSize)
    ?? (corners.length ? { x: corners.reduce((s, p) => s + p.x, 0) / corners.length, y: corners.reduce((s, p) => s + p.y, 0) / corners.length } : null);
  if (!corners.length && !center) return null;
  const id = num(raw.id ?? raw.markerId);
  const rawPixels = Array.isArray(raw.cornersPixels) ? raw.cornersPixels.map((p: any) => {
    const x = Array.isArray(p) ? num(p[0]) : num(p?.x), y = Array.isArray(p) ? num(p[1]) : num(p?.y);
    return x !== null && y !== null ? { x, y } : null;
  }) : [];
  const pixelCorners = rawPixels.length >= 4 && rawPixels.every(Boolean) && rawPixels.some((p: Point) => p.x > 1.5 || p.y > 1.5) ? rawPixels as Point[] : null;
  return { id: id === null ? null : Math.round(id), role: typeof raw.role === "string" ? raw.role : null, corners, center, pixelCorners, source };
}

const sameMarker = (a: EvidenceMarker, b: EvidenceMarker) => a.id === b.id && a.center && b.center
  && Math.abs(a.center.x - b.center.x) < 0.004 && Math.abs(a.center.y - b.center.y) < 0.004;

export function sceneEvidence(input: { metadata: any; arucoCorners: any; json: Record<string, any> }): SceneEvidence {
  const { metadata, arucoCorners, json } = input;
  const frameSize = sizeOf({ width: metadata?.videoDisplayWidth ?? metadata?.frameWidth, height: metadata?.videoDisplayHeight ?? metadata?.frameHeight });
  const points = json["aruco_points.json"];
  const pointsSize = sizeOf(points?.frame_shape) ?? frameSize;
  const markers: EvidenceMarker[] = [];
  const add = (marker: EvidenceMarker | null) => {
    if (marker && !markers.some(existing => sameMarker(existing, marker))) markers.push(marker);
  };
  for (const raw of Array.isArray(metadata?.arucoMarkers) ? metadata.arucoMarkers : []) add(markerFrom(raw, "rep", frameSize));
  for (const raw of Array.isArray(points?.markers) ? points.markers : []) add(markerFrom(raw, "rep.aruco_points", pointsSize));
  const calibrationSize = sizeOf(arucoCorners?.image);
  const calibrationTrusted = metadata?.calibrationGeometryTrusted !== false;
  const calibration = (Array.isArray(arucoCorners?.markers) ? arucoCorners.markers : []).map((raw: any) => markerFrom(raw, "session.calibration", calibrationSize)).filter(Boolean) as EvidenceMarker[];
  if (!markers.length && calibrationTrusted) calibration.forEach(add);

  // Ground, in the phone's order (PoseSceneMarkers / SprintProcessingMath.groundLine): through the
  // markers' lowest corners, else the saved ground line, else a level line at the saved ground y.
  const lines: EvidenceLine[] = [];
  const fromMarkers = groundFromMarkers(markers);
  const savedA = pointFrom(points?.ground_line?.point1, pointsSize) ?? pointFrom(metadata?.arucoGate?.groundLine?.point1);
  const savedB = pointFrom(points?.ground_line?.point2, pointsSize) ?? pointFrom(metadata?.arucoGate?.groundLine?.point2);
  if (fromMarkers) lines.push({ ...fromMarkers, kind: "ground", label: "ground", source: "marker bottom corners" });
  else if (savedA && savedB) lines.push({ a: savedA, b: savedB, kind: "ground", label: "ground", source: points?.ground_line ? "aruco_points.json ground_line" : "metadata arucoGate.groundLine" });
  else {
    const groundY = num(points?.ground_y) ?? num(metadata?.arucoGate?.groundYNorm) ?? num(metadata?.ground_loc_y) ?? num(metadata?.groundYNorm);
    if (groundY !== null && groundY >= 0 && groundY <= 1) {
      lines.push({ a: { x: 0, y: groundY }, b: { x: 1, y: groundY }, kind: "ground", label: "ground", source: num(points?.ground_y) !== null ? "aruco_points.json ground_y" : num(metadata?.arucoGate?.groundYNorm) !== null ? "metadata arucoGate.groundYNorm" : "metadata ground_loc_y" });
    }
  }

  const gatePoints: EvidencePoint[] = [];
  const p1 = pointFrom(points?.point1, pointsSize), p2 = pointFrom(points?.point2, pointsSize);
  if (p1) gatePoints.push({ point: p1, label: "gate 1", source: "aruco_points.json point1" });
  if (p2) gatePoints.push({ point: p2, label: "gate 2", source: "aruco_points.json point2" });

  const configured = num(points?.marker_distance) ?? num(points?.distance) ?? num(metadata?.markerDistance) ?? num(metadata?.arucoGate?.markerDistance);
  const configuredSource = typeof points?.marker_distance_source === "string" ? points.marker_distance_source
    : typeof metadata?.markerDistanceSource === "string" ? metadata.markerDistanceSource : null;
  const separation = markerSeparation(markers, pointsSize ?? frameSize, configured, configuredSource);
  return { markers, lines, points: gatePoints, calibrationTrusted, calibrationMarkers: calibration, separation };
}

/**
 * The ground under the markers: one marker → through its two lowest corners
 * (level when that edge spans < 4% of the width, as the phone draws it);
 * several → through the midpoints of the leftmost and rightmost bottom edges.
 */
export function groundFromMarkers(markers: EvidenceMarker[]): { a: Point; b: Point } | null {
  const bottoms = markers.filter(marker => marker.corners.length >= 4).map(marker => {
    const [p, q] = [...marker.corners].sort((m, n) => n.y - m.y).slice(0, 2).sort((m, n) => m.x - n.x);
    return { p, q, mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
  });
  if (!bottoms.length) return null;
  if (bottoms.length === 1) {
    const { p, q } = bottoms[0];
    if (Math.abs(q.x - p.x) < 0.04) { const y = (p.y + q.y) / 2; return { a: { x: 0, y }, b: { x: 1, y } }; }
    return { a: p, b: q };
  }
  const sorted = bottoms.sort((m, n) => m.mid.x - n.mid.x);
  return { a: sorted[0].mid, b: sorted[sorted.length - 1].mid };
}

// MARK: - Frame series

export interface FrameSeries { name: string; label: string; values: (number | null)[] }
export interface SeriesGroup { key: string; title: string; unit: string; series: FrameSeries[] }

/** Known per-frame files and the chart (one unit each) they belong to. */
const SERIES_SPECS: { file: string; group: string; label: string }[] = [
  { file: "velocity.json", group: "speed", label: "Speed" },
  { file: "kalman_velocity.json", group: "speed", label: "Kalman" },
  { file: "model_velocity.json", group: "speed", label: "Model fit" },
  { file: "acceleration.json", group: "acceleration", label: "Acceleration" },
  { file: "kalman_acceleration.json", group: "acceleration", label: "Kalman" },
  { file: "model_acceleration.json", group: "acceleration", label: "Model fit" },
  { file: "com_height.json", group: "height", label: "Center-of-mass height" },
  { file: "grf.json", group: "force", label: "Ground reaction force" },
];
const GROUPS: Record<string, { title: string; unit: string }> = {
  speed: { title: "Speed", unit: "m/s" },
  acceleration: { title: "Acceleration", unit: "m/s²" },
  height: { title: "Center-of-mass height", unit: "m" },
  force: { title: "Ground reaction force", unit: "as saved" },
};

/** A flat per-frame numeric array (nulls allowed, at least ten entries); null for anything else. */
export function numericSeries(value: unknown): (number | null)[] | null {
  if (!Array.isArray(value) || value.length < 10) return null;
  let finite = 0;
  const out = value.map(entry => {
    const parsed = typeof entry === "number" && Number.isFinite(entry) ? entry : null;
    if (parsed !== null) finite++;
    if (parsed === null && entry !== null && !(typeof entry === "number")) throw new Error("not numeric");
    return parsed;
  });
  return finite >= 2 ? out : null;
}

function safeSeries(value: unknown): (number | null)[] | null {
  try { return numericSeries(value); } catch { return null; }
}

/**
 * Per-frame series worth plotting against the frame cursor: the known files
 * grouped by unit (at most three per chart), then any other flat numeric
 * array file under its own name.
 */
export function frameSeriesGroups(json: Record<string, any>, handled: string[] = []): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();
  const used = new Set<string>(handled);
  for (const spec of SERIES_SPECS) {
    if (used.has(spec.file)) continue;
    const values = safeSeries(json[spec.file]);
    if (!values) continue;
    used.add(spec.file);
    const meta = GROUPS[spec.group];
    const group = groups.get(spec.group) ?? { key: spec.group, title: meta.title, unit: meta.unit, series: [] };
    if (group.series.length < 3) group.series.push({ name: spec.file, label: spec.label, values });
    groups.set(spec.group, group);
  }
  for (const [file, value] of Object.entries(json)) {
    if (used.has(file) || !/\.json$/.test(file)) continue;
    const values = safeSeries(value);
    if (!values) continue;
    const label = file.replace(/\.json$/, "").replace(/_/g, " ");
    groups.set(file, { key: file, title: label, unit: "as saved", series: [{ name: file, label, values }] });
  }
  return [...groups.values()];
}

/** Per-frame point tracks that are not already drawn elsewhere (e.g. sprint COM.json), as normalized points. */
export function pointTracks(json: Record<string, any>, size: Size | null, skip: string[]): { name: string; track: (Point | null)[] }[] {
  const tracks: { name: string; track: (Point | null)[] }[] = [];
  for (const [file, value] of Object.entries(json)) {
    if (skip.includes(file) || !Array.isArray(value) || value.length < 2) continue;
    if (/meters/i.test(file)) continue; // meters, not image coordinates
    const sample = value.find(entry => entry !== null && entry !== undefined);
    if (!Array.isArray(sample) || sample.length !== 2 || typeof sample[0] !== "number") continue;
    const track = value.map(entry => (Array.isArray(entry) ? pointFrom(entry, size) : null));
    if (track.filter(Boolean).length >= 2) tracks.push({ name: file, track });
  }
  return tracks;
}
