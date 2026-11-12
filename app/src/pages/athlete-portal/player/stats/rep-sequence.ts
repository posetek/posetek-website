/* eslint-disable @typescript-eslint/no-explicit-any */
// One recorded rep as a homepage pose-demo sequence (home/pose-demo.ts `PoseSequence`), so the
// Stats pose player can replay it with the homepage demo's controller. This is the runtime
// counterpart of scripts/prepare-homepage-poses.mjs, which built the demo's clips offline from
// the same files:
//   - vertical jump: pose.json → frames; torso_midpoints.json → `verticalJump.com`;
//     metadata `ground_loc_y` / `chest_starting_loc` → ground and baseline; the rep's published
//     `jumpHeight` → the peak; key_frames.json [coil, mid-extension, takeoff, peak] → phases.
//   - broad jump: pose.json → frames; foot_piecewise_fit.json → takeoff/landing foot x and
//     frames; com_midpoints.json / foot_centers.json → the trails; `ground_loc_y` → the ground.
//   - sprint, dribbling, shuttle (recorded without pose): tracking.json → one smoothed centre
//     line per frame; metadata start/turn/end frames → phases.
//   - every drill: metadata `arucoMarkers` (sprint: aruco_points.json) → the markers, the gate
//     and the ground line, as the admin rep tools and the phone draw them.
// Nothing here reads the network or the DOM; the loaders hand it the parsed files.

import { groundFromMarkers, markerFrom, pointFrom } from '../../../admin/lib/repEvidence';
import { framingRecording, recordingBounds } from '../../../home/pose-demo';
import type { PoseCalibration, PoseCenterLine, PoseFrame, PosePhase, PosePoint, PoseSequence } from '../../../home/pose-demo';
import type { PosePoint as ParsedPoint } from '../../../../lib/pose-playback';
import type { ReplayTracking } from '../../../../lib/replay-tracking';
import { finiteNumber as num, metricValue } from '../../../../lib/result-values';
import type { Row } from '../execution';

/** Everything one rep's replay is built from. Shared, cached objects: read, never changed. */
export interface RepFiles {
  drill: string;
  rep: Row;
  metadata: Record<string, any>;
  /** Parsed pose.json (lib/pose-playback `poseFrames`); empty for a rep recorded without pose. */
  frames: ParsedPoint[][];
  tracking: ReplayTracking | null;
  /** The drill's other artifacts by file name (torso_midpoints.json, foot_piecewise_fit.json, …). */
  json: Record<string, any>;
  /** The recording's size and length from its header only, when it was read (never shown). */
  video: { width: number; height: number; duration: number } | null;
}

/** Where a rep stands, for moving another rep (the team median) onto it. */
export interface RepScene {
  /** Picture width / height. */
  aspect: number;
  /** The ground's y at the rep's start spot. */
  groundY: number | null;
  /** Metres per picture width: `m_to_normalized_units`, or the gate's marker distance over its width. */
  metersPerWidth: number | null;
  /** The start spot along the ground: the takeoff foot, the start marker, or where the athlete stands. */
  originX: number | null;
  /** The way the athlete travels: 1 to the right, -1 to the left. */
  direction: 1 | -1 | null;
}

export interface RepReplay {
  sequence: PoseSequence & { fps: number };
  /** The sequence frame two replays line up on (takeoff, or the start of the run), or null. */
  anchor: number | null;
  scene: RepScene;
  /** True when no frame rate was saved or measurable and the phone's nominal capture rate is used. */
  nominalRate: boolean;
  /** The rep's metadata.json (shared, read-only), for the numbers shown under the replay. */
  metadata: Record<string, any>;
}

/** The phone records the tests at 120 frames a second (JumpProcessingService: nearest 1280×720 120 fps format). */
export const NOMINAL_FPS = 120;
const POSE_DRILLS = new Set(['jump', 'broadJump']);
const PHASE = { ready: '#8fa39b', start: '#66c2ff', turn: '#ffc969', back: '#71d39b', run: '#b7f34a' };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

// MARK: - Picture and timing

/**
 * The picture's size: saved with the rep, else read off an ArUco marker (its pixel position over its
 * normalized one — the jump stations save no picture size), else the recording's header.
 */
export function pictureSize(meta: Record<string, any>, video: RepFiles['video'] = null, extraMarkers: any[] = []): { width: number; height: number } | null {
  const width = num(meta.videoDisplayWidth ?? meta.frameWidth ?? meta.videoWidth ?? meta.imageWidth);
  const height = num(meta.videoDisplayHeight ?? meta.frameHeight ?? meta.videoHeight ?? meta.imageHeight);
  if (width && height && width > 0 && height > 0) return { width, height };
  for (const raw of [...(Array.isArray(meta.arucoMarkers) ? meta.arucoMarkers : []), ...extraMarkers]) {
    const pixel = raw?.centerPixel, normal = raw?.centerNormalized;
    const px = num(pixel?.x), py = num(pixel?.y), nx = num(normal?.x), ny = num(normal?.y);
    if (px === null || py === null || nx === null || ny === null || nx < .05 || ny < .05) continue;
    const size = { width: Math.round(px / nx), height: Math.round(py / ny) };
    if (size.width > 100 && size.height > 100 && size.width < 10000 && size.height < 10000) return size;
  }
  return video && video.width > 0 && video.height > 0 ? { width: video.width, height: video.height } : null;
}

/** A jump's frame rate from its flight: the frames between takeoff and landing over the measured flight time. */
export function flightFrameRate(rep: Row, meta: Record<string, any>, fit: any = null): number | null {
  const flight = num(rep.flightTimeSeconds);
  const takeoff = num(fit?.takeoffFrame ?? meta.takeoffFrame ?? rep.takeoffFrame), landing = num(fit?.landingFrame ?? meta.landingFrame ?? rep.landingFrame);
  if (!flight || flight <= 0 || takeoff === null || landing === null || landing <= takeoff) return null;
  const rate = (landing - takeoff) / flight;
  return rate >= 10 && rate <= 1000 ? rate : null;
}

/**
 * Frames a second: saved with the rep or its tracking, else the recording's frame count over its
 * length, else (jumps) the flight. Null when none of them is known.
 */
export function frameRate(files: RepFiles, count: number): number | null {
  const saved = num(files.metadata.framesPerSecond ?? files.metadata.fps ?? files.metadata.frameRate) ?? files.tracking?.fps ?? null;
  if (saved && saved > 0 && saved <= 1000) return saved;
  const duration = files.video?.duration;
  if (duration && Number.isFinite(duration) && duration > 0 && count > 1) {
    const rate = count / duration;
    if (rate >= 10 && rate <= 1000) return rate;
  }
  return flightFrameRate(files.rep, files.metadata, files.json['foot_piecewise_fit.json']);
}

// MARK: - Scene: markers, gate, ground

type Line = { a: { x: number; y: number }; b: { x: number; y: number } };
/** The ground's y at x along a line through two points (level when the points share an x). */
export const groundAt = (line: Line, x: number) => Math.abs(line.b.x - line.a.x) < 1e-6 ? line.a.y : line.a.y + (x - line.a.x) * (line.b.y - line.a.y) / (line.b.x - line.a.x);

interface Scene {
  calibration: PoseCalibration | undefined;
  ground: Line | null;
  gate: { left: number; right: number; distanceMeters: number | null } | null;
}

/**
 * The rep's markers, its gate and its ground. The ground follows the phone's order (PoseSceneMarkers):
 * the markers' bottom edge, else the saved ground line, else a level line at the saved ground y.
 */
export function repScene(files: RepFiles, size: { width: number; height: number } | null): Scene {
  const meta = files.metadata, points = files.json['aruco_points.json'] || null;
  const pointsSize = points?.frame_shape ? { width: num(points.frame_shape.x) ?? 0, height: num(points.frame_shape.y) ?? 0 } : size;
  // The rep's own markers; a sprint keeps its markers in aruco_points.json instead.
  const own = Array.isArray(meta.arucoMarkers) ? meta.arucoMarkers : [];
  const raw = own.length ? own.map((marker: any) => markerFrom(marker, 'rep', size))
    : (Array.isArray(points?.markers) ? points.markers : []).map((marker: any) => markerFrom(marker, 'rep.aruco_points', pointsSize));
  const markers = (raw as ReturnType<typeof markerFrom>[]).filter((marker): marker is NonNullable<typeof marker> => !!marker && marker.corners.length === 4);
  const fromMarkers = groundFromMarkers(markers);
  const savedA = pointFrom(meta.arucoGate?.groundLine?.point1) ?? pointFrom(points?.ground_line?.point1, pointsSize);
  const savedB = pointFrom(meta.arucoGate?.groundLine?.point2) ?? pointFrom(points?.ground_line?.point2, pointsSize);
  const level = num(meta.arucoGate?.groundYNorm) ?? num(points?.ground_y) ?? num(meta.ground_loc_y) ?? num(meta.groundYNorm);
  const ground: Line | null = fromMarkers ? fromMarkers
    : savedA && savedB ? { a: savedA, b: savedB }
      : level !== null && level >= 0 && level <= 1 ? { a: { x: 0, y: level }, b: { x: 1, y: level } } : null;
  const startX = num(meta.arucoGate?.startXNorm) ?? pointFrom(points?.point1, pointsSize)?.x ?? null;
  const stopX = num(meta.arucoGate?.stopXNorm) ?? pointFrom(points?.point2, pointsSize)?.x ?? null;
  const distance = num(meta.markerDistance) ?? num(meta.arucoGate?.markerDistance) ?? num(points?.marker_distance);
  const gate = startX !== null && stopX !== null && Math.abs(stopX - startX) > .05
    ? { left: Math.min(startX, stopX), right: Math.max(startX, stopX), distanceMeters: distance && distance > 0 ? distance : null } : null;
  const calibration: PoseCalibration | undefined = markers.length || ground || gate ? {
    markers: markers.map(marker => ({ id: marker.id, corners: marker.corners.map(corner => [corner.x, corner.y]) })),
    ...(ground ? { ground: { start: [0, groundAt(ground, 0)], end: [1, groundAt(ground, 1)] } } : {}),
    ...(gate && gate.distanceMeters && ground ? { baseline: { start: [gate.left, groundAt(ground, gate.left)], end: [gate.right, groundAt(ground, gate.right)], distanceMeters: gate.distanceMeters } } : {}),
  } : undefined;
  return { calibration, ground, gate };
}

// MARK: - Centre line for reps recorded without pose

/** A sample of the tracked body: its time and the line's x, bottom and height. */
type Sample = { t: number; x: number; bottom: number; height: number };

/** The longest stretch with no tracked body that is still bridged, in seconds. */
export const CENTER_MAX_GAP_S = .25;
const SMOOTHING_S = { x: .06, bottom: .1, height: .25 };

/** Drops the samples whose value is far from the median of its neighbours (a Hampel filter). */
function rejectOutliers(samples: Sample[], key: 'x' | 'bottom' | 'height', window: number, floor: number): Sample[] {
  return samples.filter((sample, index) => {
    const near: number[] = [];
    for (let other = index; other >= 0 && sample.t - samples[other].t <= window; other -= 1) near.push(samples[other][key]);
    for (let other = index + 1; other < samples.length && samples[other].t - sample.t <= window; other += 1) near.push(samples[other][key]);
    if (near.length < 3) return true;
    const middle = median(near)!, spread = median(near.map(value => Math.abs(value - middle)))!;
    return Math.abs(sample[key] - middle) <= Math.max(floor, 3 * 1.4826 * spread);
  });
}

/**
 * A local straight-line fit with Gaussian weights around `t` (so steady motion is not pulled
 * toward either side of an uneven sampling), or the weighted mean when a line cannot be fitted.
 */
function smoothAt(samples: Sample[], key: 'x' | 'bottom' | 'height', t: number, sigma: number): number | null {
  let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
  for (const sample of samples) {
    const d = sample.t - t;
    if (Math.abs(d) > 3 * sigma) continue;
    const w = Math.exp(-.5 * (d / sigma) ** 2);
    s0 += w; s1 += w * d; s2 += w * d * d; t0 += w * sample[key]; t1 += w * d * sample[key];
  }
  if (s0 < 1e-9) return null;
  const det = s0 * s2 - s1 * s1;
  return det > 1e-12 * s0 * s0 ? (s2 * t0 - s1 * t1) / det : t0 / s0;
}

/**
 * The athlete as one vertical line per frame (Nolan, 2026-11-11: "show the center location,
 * represent it as an appropriate height line, and then smooth those results"). The tracker examined
 * only some frames and its box jitters, so: outlying boxes are dropped, then x, the feet and the
 * height are each smoothed over time and evaluated at every frame. A frame more than
 * `CENTER_MAX_GAP_S` from any tracked frame stays empty. The line sits on the body's centre (the
 * tracker's `com`, the box's centre) and is as tall as the box.
 */
export function smoothCenterLine(tracking: ReplayTracking, fps: number): (PoseCenterLine | null)[] {
  const timeOf = (index: number) => index / fps;
  const all: Sample[] = [];
  tracking.frames.forEach((frame, index) => {
    const box = frame.person;
    if (!box || !(box.h > 0)) return;
    all.push({ t: timeOf(index), x: frame.com?.x ?? box.x + box.w / 2, bottom: box.y + box.h, height: box.h });
  });
  if (!all.length) return tracking.frames.map(() => null);
  const byX = rejectOutliers(all, 'x', .2, .03), byBottom = rejectOutliers(all, 'bottom', .2, .02), byHeight = rejectOutliers(all, 'height', .3, .015);
  const times = all.map(sample => sample.t);
  let cursor = 0;
  return tracking.frames.map((_, index) => {
    const t = timeOf(index);
    while (cursor + 1 < times.length && times[cursor + 1] <= t) cursor += 1;
    const nearest = Math.min(Math.abs(times[cursor] - t), cursor + 1 < times.length ? Math.abs(times[cursor + 1] - t) : Infinity);
    if (nearest > CENTER_MAX_GAP_S) return null;
    const x = smoothAt(byX, 'x', t, SMOOTHING_S.x), bottom = smoothAt(byBottom, 'bottom', t, SMOOTHING_S.bottom), height = smoothAt(byHeight, 'height', t, SMOOTHING_S.height);
    if (x === null || bottom === null || height === null || height <= 0) return null;
    return { x: clamp(x, 0, 1), top: clamp(bottom - height, 0, 1), bottom: clamp(bottom, 0, 1) };
  });
}

// MARK: - Sequences

/** Pose frames in the demo's form: 33 `[x, y]` landmarks, null where a landmark was not seen. */
const demoFrame = (points: ParsedPoint[] | undefined): PoseFrame => points?.length === 33
  ? points.map(point => point.x === null || point.y === null ? null : [point.x, point.y]) : [];
const hipsSeen = (frame: PoseFrame) => !!frame[23] && !!frame[24];

/** `[first, last]` frame of a window around the action, kept inside the frames that have something to draw. */
export function clipWindow(usable: number[], fps: number, from: number | null, to: number | null, before: number, after: number): [number, number] | null {
  if (!usable.length) return null;
  let first = usable[0], last = usable[usable.length - 1];
  if (from !== null) first = Math.max(first, Math.round(from - before * fps));
  if (to !== null) last = Math.min(last, Math.round(to + after * fps));
  return last > first ? [first, last] : [usable[0], usable[usable.length - 1]];
}

const series = (value: any, size: { width: number; height: number } | null, first: number, last: number): (PosePoint | null)[] =>
  Array.from({ length: last - first + 1 }, (_, offset) => {
    const point = Array.isArray(value) ? pointFrom(value[first + offset], size) : null;
    return point ? [point.x, point.y] : null;
  });

/**
 * Ascending phases inside the clip. A phase starting after the clip is left out; one starting
 * before it begins the clip, replacing any earlier phase that would start at the same frame.
 */
export function clipPhases(list: [number | null, string, string][], first: number, count: number): (PosePhase & { from: number })[] | undefined {
  const kept: (PosePhase & { from: number })[] = [];
  for (const [frame, title, color] of list) {
    if (frame === null) continue;
    const from = Math.max(0, Math.round(frame) - first);
    if (from >= count) continue;
    while (kept.length && from <= kept[kept.length - 1].from) kept.pop();
    kept.push({ from, title, color });
  }
  return kept.length ? kept : undefined;
}

/** A frame index from the clip's start, or null when the frame is not in it. */
const local = (frame: number | null, first: number, count: number) => frame === null || frame < first || frame - first >= count ? null : Math.round(frame - first);
const feet = (meters: number) => `${(meters * 3.28084).toFixed(1)} ft`;

/**
 * One rep as a demo sequence plus what is needed to line another rep up with it. Null when the
 * rep has nothing to replay (no pose and no tracked body).
 */
export function buildRepReplay(files: RepFiles): RepReplay | null {
  const { drill, rep, metadata: meta, json } = files;
  const size = pictureSize(meta, files.video, files.json['aruco_points.json']?.markers || []);
  const aspect = size ? size.width / size.height : 16 / 9;
  const scene = repScene(files, size);
  const poseDrill = POSE_DRILLS.has(drill) && files.frames.length > 0;
  const count = poseDrill ? files.frames.length : files.tracking?.frames.length ?? 0;
  if (!count) return null;
  const measured = frameRate(files, count);
  const fps = measured ?? NOMINAL_FPS;
  const base = { key: drill, title: '', label: '', metrics: [] as string[][], fps, sourceAspectRatio: aspect, calibration: scene.calibration };

  if (poseDrill) {
    const all = files.frames.map(demoFrame);
    const usable = all.map((frame, index) => hipsSeen(frame) ? index : -1).filter(index => index >= 0);
    if (!usable.length) return null;
    const keyFrames = (Array.isArray(json['key_frames.json']) ? json['key_frames.json'] : []).map(num);
    let sequence: PoseSequence, anchor: number | null, originX: number | null, direction: 1 | -1 | null = null;
    if (drill === 'jump') {
      // key_frames.json: [coil, mid-extension, takeoff, peak] (JumpProcessingService).
      const takeoff = keyFrames[2] ?? null, peak = keyFrames[3] ?? null;
      const [first, last] = clipWindow(usable, fps, takeoff, peak, 1.5, 1.4)!;
      const length = last - first + 1, com = series(json['torso_midpoints.json'], size, first, last);
      const groundY = num(meta.ground_loc_y), baselineY = num(meta.chest_starting_loc), peakMeters = metricValue(rep, 'jumpHeight', meta);
      const overlay = groundY !== null && baselineY !== null && peakMeters !== null && com.some(Boolean);
      sequence = {
        ...base, frames: all.slice(first, last + 1), markers: {},
        previewFrame: local(peak, first, length) ?? undefined,
        phases: clipPhases([[0, 'Load', PHASE.start], [takeoff, 'Flight', PHASE.run], [peak === null ? null : peak + 1, 'Descent', PHASE.turn]], first, length),
        // The phone publishes the jump's height only, so no per-frame rise is shown beside it.
        verticalJump: overlay ? { com, heightMeters: [], baselineY: baselineY!, groundY: groundY!, peakMeters: peakMeters!, takeoff: local(takeoff, first, length) ?? 0, apex: local(peak, first, length) ?? 0 } : undefined,
        // The jump overlay draws its own ground line.
        calibration: overlay && scene.calibration ? { ...scene.calibration, ground: undefined } : scene.calibration,
      };
      anchor = local(takeoff, first, length);
      const hips = all.slice(first, Math.min(last, takeoff ?? last) + 1).map(frame => frame[23] && frame[24] ? (frame[23][0] + frame[24][0]) / 2 : null).filter((x): x is number => x !== null);
      originX = median(hips);
    } else {
      const fit = json['foot_piecewise_fit.json'] || {};
      const takeoff = num(fit.takeoffFrameIndex) ?? num(meta.takeoffFrame ?? rep.takeoffFrame) ?? keyFrames[0] ?? null;
      const landing = num(fit.landingFrameIndex) ?? num(meta.landingFrame ?? rep.landingFrame) ?? keyFrames[1] ?? null;
      const [first, last] = clipWindow(usable, fps, takeoff, landing, 1.5, 1.2)!;
      const length = last - first + 1;
      const groundY = num(meta.ground_loc_y), takeoffX = num(fit.startFootXNorm), landingX = num(fit.endFootXNorm);
      const distance = metricValue(rep, 'broadJumpDistance', meta);
      sequence = {
        ...base, frames: all.slice(first, last + 1),
        markers: { ...(local(takeoff, first, length) !== null ? { takeoff: local(takeoff, first, length)! } : {}), ...(local(landing, first, length) !== null ? { landing: local(landing, first, length)! } : {}) },
        previewFrame: local(takeoff, first, length) ?? undefined,
        metrics: [['Distance', distance === null ? '—' : feet(distance)]],
        overlays: groundY !== null && takeoffX !== null && landingX !== null
          ? { groundY, takeoffX, landingX, com: series(json['com_midpoints.json'], size, first, last), foot: series(json['foot_centers.json'], size, first, last) } : undefined,
      };
      anchor = local(takeoff, first, length);
      originX = takeoffX;
      direction = takeoffX !== null && landingX !== null && landingX !== takeoffX ? (landingX > takeoffX ? 1 : -1) : null;
    }
    const groundY = scene.ground && originX !== null ? groundAt(scene.ground, originX) : num(meta.ground_loc_y);
    return { sequence: sequence as RepReplay['sequence'], anchor, scene: { aspect, groundY, metersPerWidth: positive(num(meta.m_to_normalized_units)), originX, direction }, nominalRate: measured === null, metadata: meta };
  }

  if (!files.tracking) return null;
  const lines = smoothCenterLine(files.tracking, fps);
  const usable = lines.map((line, index) => line ? index : -1).filter(index => index >= 0);
  if (!usable.length) return null;
  const points = json['aruco_points.json'] || {};
  const start = num(meta.startFrame) ?? num(points.start_frame), end = num(meta.endFrame) ?? num(points.end_frame);
  const [first, last] = clipWindow(usable, fps, start, end, .5, .75)!;
  const length = last - first + 1;
  const shuttle = drill === 'dribbling' || drill === 'changeOfDirection';
  const phaseList: [number | null, string, string][] = shuttle
    ? [[0, 'Ready', PHASE.ready], [start, 'Out', PHASE.start], [nextFrame(num(meta.phase1EndFrame)), 'Turn', PHASE.turn], [nextFrame(num(meta.phase2EndFrame)), 'Back', PHASE.back], [nextFrame(end), 'Finish', PHASE.ready]]
    : start !== null ? [[0, 'Ready', PHASE.ready], [start, 'Sprint', PHASE.run], [nextFrame(end), 'Finish', PHASE.ready]] : [[0, 'Sprint', PHASE.run]];
  const sequence: PoseSequence = {
    ...base, frames: Array.from({ length }, () => []), markers: {},
    centerLine: lines.slice(first, last + 1),
    phases: clipPhases(phaseList, first, length),
    previewFrame: local(num(meta.apexFrame), first, length) ?? undefined,
  };
  const anchor = local(start, first, length);
  // The run starts at the gate marker nearer where the athlete first stands.
  const opening = lines[usable[0]]!.x;
  const gate = scene.gate;
  const fromLeft = gate ? Math.abs(opening - gate.left) <= Math.abs(opening - gate.right) : null;
  const originX = gate ? (fromLeft ? gate.left : gate.right) : opening;
  const groundY = scene.ground ? groundAt(scene.ground, originX) : median(usable.map(index => lines[index]!.bottom));
  return {
    sequence: sequence as RepReplay['sequence'], anchor, nominalRate: measured === null, metadata: meta,
    scene: { aspect, groundY, metersPerWidth: gate?.distanceMeters ? gate.distanceMeters / (gate.right - gate.left) : null, originX, direction: fromLeft === null ? null : fromLeft ? 1 : -1 },
  };
}

const positive = (value: number | null) => value !== null && value > 0 ? value : null;

/** The stage's shape limits: an upright 4:5 (a vertical jump) to a wide 12:5 (a run between two markers). */
export const STAGE_ASPECT = { min: .8, max: 2.4 };

/** The stage's width over height for a rep: the shape of everything the whole-rep fit keeps on screen. */
export function stageAspect(replay: RepReplay): number {
  const bounds = recordingBounds(framingRecording(replay.sequence), replay.scene.aspect);
  const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY;
  return height > 1e-6 ? clamp(width / height, STAGE_ASPECT.min, STAGE_ASPECT.max) : 16 / 9;
}
const nextFrame = (frame: number | null) => frame === null ? null : frame + 1;

// MARK: - The team median as a shadow

/** Where a sequence's body stands, when its scene does not say: the middle hip x and the middle foot y. */
function stance(sequence: PoseSequence): { x: number | null; y: number | null } {
  const xs: number[] = [], ys: number[] = [];
  for (const frame of sequence.frames) {
    if (frame[23] && frame[24]) xs.push((frame[23][0] + frame[24][0]) / 2);
    if (frame[27] && frame[28]) ys.push((frame[27][1] + frame[28][1]) / 2);
  }
  for (const line of sequence.centerLine ?? []) if (line) { xs.push(line.x); ys.push(line.bottom); }
  return { x: median(xs), y: median(ys) };
}

/**
 * The shadow's sequence moved onto the athlete's: the same start spot on the ground and, where both
 * reps carry a scale (the jump stations' `m_to_normalized_units`, the shuttle gates' marker distance),
 * the same size in metres, so a longer or higher result reads as longer or higher. Mirrored when the
 * two ran opposite ways. Only the body is kept (frames, centre line); inputs are not changed.
 */
export function alignShadow(own: RepReplay, shadow: RepReplay): PoseSequence {
  const ownStance = stance(own.sequence), shadowStance = stance(shadow.sequence);
  const ownX = own.scene.originX ?? ownStance.x, shadowX = shadow.scene.originX ?? shadowStance.x;
  const ownGround = own.scene.groundY ?? ownStance.y, shadowGround = shadow.scene.groundY ?? shadowStance.y;
  const scaled = own.scene.metersPerWidth && shadow.scene.metersPerWidth;
  const kx = scaled ? clamp(shadow.scene.metersPerWidth! / own.scene.metersPerWidth!, .4, 2.5) : 1;
  const ky = kx * own.scene.aspect / shadow.scene.aspect;
  const mirror = own.scene.direction && shadow.scene.direction && own.scene.direction !== shadow.scene.direction ? -1 : 1;
  const mapX = (x: number) => ownX === null || shadowX === null ? x : ownX + (x - shadowX) * kx * mirror;
  const mapY = (y: number) => ownGround === null || shadowGround === null ? y : ownGround - (shadowGround - y) * ky;
  const source = shadow.sequence;
  return {
    key: source.key, title: source.title, label: source.label, metrics: [], markers: {}, fps: source.fps, sourceAspectRatio: own.scene.aspect, phases: source.phases,
    frames: source.frames.map(frame => frame.map(point => point ? [mapX(point[0]), mapY(point[1])] : null)),
    ...(source.centerLine ? { centerLine: source.centerLine.map(line => line ? { x: mapX(line.x), top: mapY(line.top), bottom: mapY(line.bottom) } : null) } : {}),
  };
}

/**
 * The shadow's frame for each of the athlete's frames: both replays run in real time from the frame
 * they line up on (takeoff, or the start of the run), so they reach it together. Before its first
 * frame or after its last the shadow holds still there. Without both anchors both start at frame 0.
 */
export function shadowClock(own: RepReplay, shadow: RepReplay): (frame: number) => number | null {
  const last = shadow.sequence.frames.length - 1, ratio = shadow.sequence.fps / own.sequence.fps;
  const anchored = own.anchor !== null && shadow.anchor !== null;
  return frame => {
    if (last < 0) return null;
    const at = anchored ? shadow.anchor! + (frame - own.anchor!) * ratio : frame * ratio;
    return clamp(Math.round(at), 0, last);
  };
}
