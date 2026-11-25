// Loading for the Stats pose player: one rep's files, its replay built for the homepage demo's
// controller (rep-sequence.ts), kept in memory (lib/replay-cache.ts)
// so switching cards, or coming back to one, loads nothing twice. Cached replays are shared:
// read-only (alignment and smoothing build new objects).

import { poseFrames } from '../../../../lib/pose-playback';
import type { PoseFrame } from '../../../home/pose-demo';
import { parseTracking } from '../../../../lib/replay-tracking';
import { storage } from '../../../../lib/firebase';
import { drillByKey } from '../../lib/drills';
import type { Drill } from '../../lib/drills';
import { fetchJson } from '../../lib/loaders';
import type { Access } from '../../lib/loaders';
import { artifactFolder } from '../../lib/metrics';
import { remember } from '../../lib/replay-cache';
import { warmRepFiles } from '../../lib/warm-rep-files';
import { loadRepReplay } from '../../views/SessionView';
import type { Row } from '../execution';
import type { AthleteTestReport } from '../report';
import { NOMINAL_FPS, buildRepReplay, clipWindow, frameRate, pictureSize } from './rep-sequence';
import type { RepFiles, RepReplay } from './rep-sequence';
import type { AnonymousMedian } from './test-comparison';
import { METRIC_TESTS, bestRep } from './test-comparison';

const STAFF: Access[] = ['admin', 'manager', 'coach'];
const MEMORY_MS = 5 * 60_000;

/**
 * Whether a drill's replay shows the team median as a faint figure: the runs do; the two jumps show
 * the team average as a reference line instead (Nolan, 2026-11-11).
 */
export const teamShadow = (drillKey: string) => drillKey !== 'jump' && drillKey !== 'broadJump';

/** The drill's files the replay draws besides pose.json, metadata.json and tracking.json. */
const EXTRA_FILES: Record<string, string[]> = {
  jump: ['torso_midpoints.json', 'key_frames.json'],
  broadJump: ['foot_piecewise_fit.json', 'key_frames.json', 'foot_centers.json', 'com_midpoints.json'],
  sprint: ['aruco_points.json'],
};

/**
 * STAFF ONLY: files the media answer (getAthleteRepMedia) does not list although they are stored,
 * read straight from the rep's storage folder, which staff may read and a player may not. A
 * player's replay goes without them.
 *   - sprint aruco_points.json: the sprint's markers, gate, ground line and start/finish frames
 *     (its metadata.json carries none of them), so a player's sprint shows the centre line only.
 */
const STAFF_DIRECT_FILES: Record<string, string[]> = { sprint: ['aruco_points.json'] };

type VideoFacts = NonNullable<RepFiles['video']>;
/**
 * The recording's size and length, read from its header only. The video itself is never shown:
 * the vertical jump saves no frame rate with its pose, and its length gives one.
 */
function videoFacts(url: string | null): Promise<VideoFacts | null> {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const video = document.createElement('video');
    const finish = (facts: VideoFacts | null) => { video.removeAttribute('src'); video.load(); resolve(facts); };
    const timer = window.setTimeout(() => finish(null), 8000);
    video.preload = 'metadata'; video.muted = true;
    video.onloadedmetadata = () => { window.clearTimeout(timer); finish(video.videoWidth && video.videoHeight ? { width: video.videoWidth, height: video.videoHeight, duration: video.duration } : null); };
    video.onerror = () => { window.clearTimeout(timer); finish(null); };
    video.src = url;
  });
}

/** One rep's files: the shared replay loader (pose, metadata, tracking) plus the drill's other files. */
async function loadRepFiles(drill: Drill, rep: Row, access: Access, playerId: string): Promise<RepFiles> {
  const data = await loadRepReplay(drill, rep, access, playerId, null);
  const json: Record<string, unknown> = {};
  await Promise.all((EXTRA_FILES[drill.key] || []).map(async name => {
    let url: string | undefined = data.artifactUrls[name];
    if (!url && STAFF.includes(access) && STAFF_DIRECT_FILES[drill.key]?.includes(name)) {
      try { url = await storage.ref(artifactFolder(rep, drill, playerId)).child(name).getDownloadURL(); }
      catch { /* Not stored, or this viewer may not read the folder. */ }
    }
    json[name] = await fetchJson(url).catch(() => null);
  }));
  const saved = data.metadata.framesPerSecond ?? data.metadata.fps ?? data.tracking?.fps;
  const video = data.frames.length && !saved && data.mediaUrl ? await videoFacts(data.mediaUrl) : null;
  return { drill: drill.key, rep, metadata: data.metadata, frames: data.frames, tracking: data.tracking, json, video };
}

/** A rough size for the memory budget: pose frames dominate. */
const replaySize = (replay: RepReplay | null) => replay ? 2048 + replay.sequence.frames.length * 33 * 24 + (replay.sequence.centerLine?.length ?? 0) * 40 : 256;

/** The athlete's own replay, built once per revision. */
export function repReplay(drill: Drill, rep: Row, access: Access, playerId: string): Promise<RepReplay | null> {
  return remember(`replay:${access}:${playerId}:${drill.key}:${rep.id}:${rep.resultStatus?.revisionId ?? ''}`,
    async () => buildRepReplay(await loadRepFiles(drill, rep, access, playerId)), MEMORY_MS, { size: replaySize });
}

// COCO's 17 recorded joints, in the MediaPipe order the canvas draws.
const COCO_TO_MEDIAPIPE = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/** Draw the anonymous payload in memory. Older stations supply pose landmarks instead of tracking boxes. */
export function medianReplay(drill: Drill, median: AnonymousMedian | null): RepReplay | null {
  if (!median?.artifacts || !teamShadow(drill.key)) return null;
  const metadata = { ...(median.artifacts['metadata.json'] as Row | undefined), ...median.rep };
  const tracking = parseTracking(median.artifacts['tracking.json'], metadata);
  const files: RepFiles = { drill: drill.key, rep: median.rep, metadata, tracking, frames: [], json: {}, video: null };
  if (tracking) return buildRepReplay(files);
  if (metadata.poseComputed === false) return null;
  const frames = poseFrames(median.artifacts['pose.json'], metadata).map(points => {
    const frame: PoseFrame = Array(33).fill(null);
    if (points.length === 17 || points.length === 33) points.forEach(({ x, y }, index) => {
      if (x !== null && y !== null) frame[points.length === 17 ? COCO_TO_MEDIAPIPE[index] : index] = [x, y];
    });
    return frame;
  });
  const usable = frames.flatMap((frame, index) => frame[23] && frame[24] ? [index] : []);
  if (!usable.length) return null;
  const measured = frameRate(files, frames.length), fps = measured ?? NOMINAL_FPS;
  const start = median.rep.startFrame ?? null, finish = median.rep.endFrame ?? median.rep.finishFrame ?? null;
  const [first, last] = clipWindow(usable, fps, start, finish, .5, .75)!;
  const size = pictureSize(metadata), aspect = size ? size.width / size.height : 16 / 9;
  const visible = frames.slice(first, last + 1);
  const opening = visible.find(frame => frame[23] && frame[24]);
  if (!opening) return null;
  return {
    sequence: { key: drill.key, title: '', label: '', metrics: [], markers: {}, fps, sourceAspectRatio: aspect, frames: visible },
    anchor: start !== null && start >= first && start <= last ? start - first : null, nominalRate: measured === null, metadata,
    scene: { aspect, groundY: null, metersPerWidth: null, originX: (opening[23]![0] + opening[24]![0]) / 2, direction: null },
  };
}

/** Warm the athlete's own replays. An event comparison reads the cohort only when its card is opened. */
export async function warmStatsReplays(report: AthleteTestReport, reps: Record<string, Row[]>, access: Access, playerId: string): Promise<void> {
  if (report.playerId !== playerId) return;
  const items = report.metrics.flatMap(metric => {
    const test = METRIC_TESTS[metric.id], rep = test ? bestRep(metric, reps, report.testDateMillis) : null;
    return test && rep ? [{ drill: drillByKey(test.drill), rep, playerId, access }] : [];
  });
  await warmRepFiles(items);
  for (const { drill, rep } of items) await repReplay(drill, rep, access, playerId).catch(() => null);
}
