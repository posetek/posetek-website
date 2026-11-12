import { useEffect, useMemo, useState } from 'react';
import PosePlayback, { edges17, edges33 } from '../../../../components/PosePlayback';
import { frameAtTime, poseTimeline } from '../../../../lib/pose-playback';
import type { PosePoint, Timeline } from '../../../../lib/pose-playback';
import { drawTrackingFrame } from '../../../../lib/replay-tracking';
import type { ReplayTracking } from '../../../../lib/replay-tracking';
import { finiteNumber, metricValue } from '../../../../lib/result-values';
import { drillByKey } from '../../lib/drills';
import type { Access } from '../../lib/loaders';
import { loadRepReplay } from '../../views/SessionView';
import type { ViewerData } from '../../views/SessionView';
import { averageText } from '../report';
import type { AthleteTestReport, ReportMetric } from '../report';
import type { Row } from '../execution';
import { METRIC_TESTS, SPLITS, bestRep, loadTeamComparison, splitText } from './test-comparison';
import type { TeamComparison } from './test-comparison';

const STAFF = ['admin', 'manager', 'coach'];
const frameCount = (data: ViewerData) => data.frames.length || data.tracking?.frames.length || 0;

type VideoFacts = { width: number; height: number; duration: number };
/**
 * The recording's size and length, read from its header only. The video itself is never shown:
 * some recordings (the jump stations) store neither the picture's shape nor a frame rate with
 * the pose, and without them the skeleton is stretched and cannot play.
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

/** A replay with the picture's shape, and a frame rate from the recording's length when it has none. */
export function withVideoFacts(data: ViewerData, facts: VideoFacts | null): ViewerData {
  if (!facts) return data;
  const count = frameCount(data), meta: Record<string, any> = { ...data.playbackMetadata };
  meta.videoDisplayWidth ??= facts.width; meta.videoDisplayHeight ??= facts.height;
  if (!poseTimeline(meta, count).times.length && Number.isFinite(facts.duration) && facts.duration > 0 && count > 1) meta.fps = count / facts.duration;
  return { ...data, playbackMetadata: meta };
}

/**
 * A frame rate for a jump saved without one and without a video: the frames between takeoff and
 * landing over the measured flight time. Null when the rep does not carry all three.
 */
export function flightFrameRate(rep: Row, meta: Record<string, any>): number | null {
  const flight = finiteNumber(rep.flightTimeSeconds), takeoff = finiteNumber(meta.takeoffFrame ?? rep.takeoffFrame), landing = finiteNumber(meta.landingFrame ?? rep.landingFrame);
  if (!flight || flight <= 0 || takeoff === null || landing === null || landing <= takeoff) return null;
  const rate = (landing - takeoff) / flight;
  return rate >= 10 && rate <= 1000 ? rate : null;
}

/** The longest run of unexamined frames that is filled in (a quarter of a second at 120 frames a second). */
const MAX_TRACKING_GAP = 30;

/**
 * The tracker examines only some frames (every tenth, then every fourth near the action), so a
 * replay of its boxes blinks. Frames between two examined ones take the straight line between
 * them; longer gaps stay empty.
 */
export function fillTracking(tracking: ReplayTracking): ReplayTracking {
  const frames = tracking.frames.map(frame => ({ ...frame }));
  for (const key of ['person', 'com', 'ball'] as const) {
    let last = -1;
    for (let index = 0; index < frames.length; index += 1) {
      const here = frames[index][key] as Record<string, number> | null;
      if (!here) continue;
      if (last >= 0 && index - last > 1 && index - last <= MAX_TRACKING_GAP) {
        const from = frames[last][key] as unknown as Record<string, number>;
        for (let fill = last + 1; fill < index; fill += 1) {
          const along = (fill - last) / (index - last);
          (frames[fill] as Record<string, unknown>)[key] = Object.fromEntries(Object.keys(from).map(part => [part, from[part] + (here[part] - from[part]) * along]));
        }
      }
      last = index;
    }
  }
  return { ...tracking, frames };
}

const loadReplay = async (drill: ReturnType<typeof drillByKey>, rep: Row, access: Access, playerId: string) => {
  const raw = await loadRepReplay(drill, rep, access, playerId, null);
  const loaded = raw.tracking ? { ...raw, tracking: fillTracking(raw.tracking) } : raw;
  const data = withVideoFacts(loaded, await videoFacts(loaded.mediaUrl));
  if (poseTimeline(data.playbackMetadata, frameCount(data)).times.length) return data;
  const rate = flightFrameRate(rep, data.metadata);
  return rate ? { ...data, playbackMetadata: { ...data.playbackMetadata, fps: rate } } : data;
};

type Clock = { timeline: Timeline; anchor: number };
/** A replay's clock, with the time of its first marker (start, takeoff or peak) as the anchor. */
function clock(data: ViewerData): Clock | null {
  const count = frameCount(data), timeline = poseTimeline(data.playbackMetadata, count);
  if (!timeline.times.length) return null;
  return { timeline, anchor: timeline.times[Math.min(data.markers[0]?.frame ?? 0, count - 1)] ?? 0 };
}

/**
 * The shadow's frame for one of the athlete's frames: both replays run from their first marker,
 * so the two reach it together. Without timing on either side the frame numbers are used.
 */
export function shadowFrame(own: Clock | null, shadow: Clock | null, frame: number, shadowCount: number): number {
  if (!own || !shadow) return Math.min(frame, Math.max(0, shadowCount - 1));
  return frameAtTime(shadow.timeline, shadow.anchor + (own.timeline.times[frame] ?? own.anchor) - own.anchor);
}

const seen = (point?: PosePoint | null): point is { x: number; y: number } => !!point && point.x !== null && point.y !== null && (point.visibility == null || point.visibility >= .1);
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

/** Where a skeleton stands over its clip: the middle hip position across the frames, and the middle ankle height. */
function stance(frames: PosePoint[][]): { x: number; y: number } | null {
  const xs: number[] = [], ys: number[] = [];
  for (const points of frames) {
    if (!points?.length) continue;
    const [hipA, hipB, ankleA, ankleB] = points.length <= 20 ? [11, 12, 15, 16] : [23, 24, 27, 28];
    if (seen(points[hipA]) && seen(points[hipB])) xs.push(((points[hipA].x as number) + (points[hipB].x as number)) / 2);
    if (seen(points[ankleA]) && seen(points[ankleB])) ys.push(((points[ankleA].y as number) + (points[ankleB].y as number)) / 2);
  }
  const x = median(xs), y = median(ys);
  return x === null || y === null ? null : { x, y };
}

/**
 * The shadow's pose moved onto the athlete's: the same spot on the ground and, where both
 * recordings carry their ground line and scale (the jump stations do), the same size in metres,
 * so a higher jump reads as higher. Returns the frames unchanged when either skeleton is unknown.
 */
export function alignShadow(own: ViewerData, shadow: ViewerData): PosePoint[][] {
  const mine = stance(own.frames), theirs = stance(shadow.frames);
  if (!mine || !theirs) return shadow.frames;
  const ownScale = finiteNumber(own.metadata.m_to_normalized_units), shadowScale = finiteNumber(shadow.metadata.m_to_normalized_units);
  const scale = ownScale && shadowScale && ownScale > 0 && shadowScale > 0 ? Math.min(2, Math.max(.5, ownScale / shadowScale)) : 1;
  const ownGround = finiteNumber(own.metadata.ground_loc_y) ?? mine.y, shadowGround = finiteNumber(shadow.metadata.ground_loc_y) ?? theirs.y;
  return shadow.frames.map(points => (points || []).map(point => seen(point)
    ? { ...point, x: mine.x + (point.x - theirs.x) * scale, y: ownGround - (shadowGround - point.y) * scale }
    : point));
}

/** The team median, drawn under the athlete: a wide grey skeleton, or its tracking at half strength. */
function drawShadow(context: CanvasRenderingContext2D, frames: PosePoint[][], data: ViewerData, index: number, width: number, height: number) {
  context.save();
  if (data.tracking) { context.globalAlpha = .45; drawTrackingFrame(context, data.tracking, index, width, height); context.restore(); return; }
  const points = frames[index] || [];
  context.globalAlpha = .6; context.lineWidth = 7; context.lineCap = 'round'; context.strokeStyle = '#8fa39b';
  for (const [a, b] of points.length <= 20 ? edges17 : edges33) {
    const p = points[a], q = points[b];
    if (!seen(p) || !seen(q)) continue;
    context.beginPath(); context.moveTo(p.x * width, p.y * height); context.lineTo(q.x * width, q.y * height); context.stroke();
  }
  context.restore();
}

type Props = {
  metric: ReportMetric;
  report: AthleteTestReport;
  reps: Record<string, Row[]>;
  athlete: Row;
  access: Access;
  playerId: string | null;
  /** Opens the test's full results page (every session and rep). */
  onAllAttempts: () => void;
};

/**
 * The pose player under the score cards: the athlete's best rep of the chosen test as pose only
 * (never the video), the team's median athlete as a shadow beneath it, and the rep's numbers
 * beside the team's averages.
 */
export default function TestPosePlayer({ metric, report, reps, athlete, access, playerId, onAllAttempts }: Props) {
  const test = METRIC_TESTS[metric.id], drill = drillByKey(test?.drill);
  const rep = useMemo(() => bestRep(metric, reps, report.testDateMillis), [metric, reps, report.testDateMillis]);
  const [own, setOwn] = useState<ViewerData | null>(null), [error, setError] = useState(false);
  const [team, setTeam] = useState<TeamComparison | null>(null), [shadow, setShadow] = useState<ViewerData | null>(null);
  const repId = rep ? String(rep.id) : null, event = report.kind === 'event';
  useEffect(() => {
    if (!rep || !playerId) return;
    let alive = true;
    loadReplay(drill, rep, access, playerId).then(data => { if (alive) setOwn(data); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
    // One load per rep: the rep object is replaced on every results refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repId, drill.key, access, playerId]);
  useEffect(() => {
    // The team's median and averages come from the team's own records, which only staff may read today.
    if (!event || !playerId || !STAFF.includes(access)) return;
    let alive = true;
    void loadTeamComparison(metric, athlete, playerId, report.testDateMillis).then(async comparison => {
      if (!alive || !comparison) return;
      setTeam(comparison);
      if (!comparison.median) return;
      const data = await loadReplay(drill, comparison.median.rep, access, comparison.median.playerId);
      if (alive && frameCount(data)) setShadow(data);
    }).catch(() => { /* The athlete's own replay stays usable without the comparison. */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric.id, event, access, playerId, athlete?.teamId, report.testDateMillis]);
  const ghost = useMemo(() => own && shadow ? { frames: alignShadow(own, shadow), own: clock(own), shadow: clock(shadow) } : null, [own, shadow]);
  const overlay = useMemo(() => {
    if (!own) return undefined;
    return (context: CanvasRenderingContext2D, width: number, height: number, frame: number) => {
      if (shadow && ghost) drawShadow(context, ghost.frames, shadow, shadowFrame(ghost.own, ghost.shadow, frame, frameCount(shadow)), width, height);
      if (own.tracking) drawTrackingFrame(context, own.tracking, frame, width, height);
    };
  }, [own, shadow, ghost]);
  const playable = !!own && frameCount(own) > 0;
  const portrait = !!own && Number(own.playbackMetadata.videoDisplayHeight) > Number(own.playbackMetadata.videoDisplayWidth);
  const headlineAverage = event && (metric.count ?? 0) >= 5 ? averageText(metric) : null;
  const rows = rep ? (SPLITS[drill.key] || []).map(split => ({
    label: split.label,
    mine: splitText(metricValue(rep, split.field, own?.metadata || {}, split.fallbacks || []), split),
    // The report's own average for the headline number; the team's records for the other splits.
    average: split.field === test.field && headlineAverage ? headlineAverage : splitText(team?.averages[split.field], split),
  })).filter(row => row.mine || row.average) : [];
  const compared = rows.some(row => row.average);
  return <section className="stats-pose" aria-label={`${metric.label} replay`} data-metric={metric.id} data-portrait={portrait || undefined}>
    <div className="stats-pose-head">
      <h3>{metric.label}</h3>
      {shadow && <span className="stats-pose-key"><i className="you" />You<i className="median" />Team median</span>}
    </div>
    {!rep ? <p className="stats-subheadline">No recorded attempt for this test yet.</p>
      : error ? <p className="stats-subheadline">This attempt could not be opened.</p>
        : !own ? <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading the replay</p>
          : !playable ? <p className="stats-subheadline">No pose was saved for this attempt.</p>
            // No `mediaUrl`: the player shows the pose (or tracking) only, never the recording.
            : <PosePlayback key={`${metric.id}:${repId}`} frames={own.frames} metadata={own.playbackMetadata} mediaUrl={null} markers={own.markers}
              title={metric.label} frameCount={own.tracking?.frames.length} overlay={overlay} />}
    {rows.length > 0 && <div className={`stats-splits${compared ? ' compared' : ''}`} role="table" aria-label={`${metric.label} numbers`}>
      <div role="row" className="stats-splits-head"><span role="columnheader" /><span role="columnheader">You</span>{compared && <span role="columnheader">Team avg</span>}</div>
      {rows.map(row => <div role="row" key={row.label}><span role="rowheader">{row.label}</span><strong role="cell">{row.mine ?? '—'}</strong>{compared && <span role="cell">{row.average ?? '—'}</span>}</div>)}
    </div>}
    {rep && <button type="button" className="stats-text-button stats-pose-all" onClick={onAllAttempts}>All attempts<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>}
  </section>;
}
