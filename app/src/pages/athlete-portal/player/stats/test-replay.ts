// Loading for the Stats pose player: one rep's files, its replay built for the homepage demo's
// controller (rep-sequence.ts), and the team median's, all kept in memory (lib/replay-cache.ts)
// so switching cards, or coming back to one, loads nothing twice. Cached replays are shared:
// read-only (alignment and smoothing build new objects).

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
import { buildRepReplay } from './rep-sequence';
import type { RepFiles, RepReplay } from './rep-sequence';
import { METRIC_TESTS, bestRep, loadTeamComparison } from './test-comparison';

export const STAFF: Access[] = ['admin', 'manager', 'coach'];
const MEMORY_MS = 5 * 60_000;

/**
 * Whether a drill's replay shows the team median as a faint figure: the runs do; the two jumps show
 * the team average as a reference line instead (Nolan, 2026-11-11), so their median is never loaded.
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

/** One rep's replay, built once and kept: the athlete's own, or the team median's for the shadow. */
export function repReplay(drill: Drill, rep: Row, access: Access, playerId: string): Promise<RepReplay | null> {
  return remember(`replay:${access}:${playerId}:${drill.key}:${rep.id}:${rep.resultStatus?.revisionId ?? ''}`,
    async () => buildRepReplay(await loadRepFiles(drill, rep, access, playerId)), MEMORY_MS, { size: replaySize });
}

/**
 * Loads every test's replay in the background once the report is there, so the first click on
 * each score card is instant: the rep files first (lib/warm-rep-files.ts, after the browser is
 * idle), then each built replay and, for staff on a testing-event report, the team comparison and
 * (runs only, `teamShadow`) the team median's replay.
 * Never rejects; anything that fails loads again when its card is opened.
 */
export async function warmStatsReplays(report: AthleteTestReport, reps: Record<string, Row[]>, athlete: Row, access: Access, playerId: string): Promise<void> {
  const items = report.metrics.flatMap(metric => {
    const test = METRIC_TESTS[metric.id], rep = test ? bestRep(metric, reps, report.testDateMillis) : null;
    return test && rep ? [{ metric, drill: drillByKey(test.drill), rep }] : [];
  });
  await warmRepFiles(items.map(({ drill, rep }) => ({ drill, rep, playerId, access })));
  for (const { metric, drill, rep } of items) {
    await repReplay(drill, rep, access, playerId).catch(() => null);
    if (report.kind !== 'event' || !STAFF.includes(access)) continue;
    const team = await loadTeamComparison(metric, athlete, playerId, report.testDateMillis).catch(() => null);
    if (team?.median && teamShadow(drill.key)) await repReplay(drill, team.median.rep, access, team.median.playerId).catch(() => null);
  }
}
