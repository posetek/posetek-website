// The rep tools: one rep, its video, and everything an admin needs to fix a
// rep that did not process correctly the first time.
//
//   1. Scrub the video frame by frame and set the event frames (for change of
//      direction: start, turn start, turn apex, turn end, end).
//   2. Annotate the athlete's center of mass and the ball's center: click on
//      the video, the tool marks the point and jumps ahead by the stride
//      (default 3 — every third frame; the two skipped frames are
//      interpolated), until the range is done.
//   3. Read the re-derived rep next to the original, then push it. The push
//      overwrites the rep in place through the admin callable and keeps a
//      restorable snapshot of what was there.
//
// The math lives in ../lib/repTools.ts; this file only collects clicks and
// draws.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminModal from "./AdminModal";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { drillByKey } from "../../athlete-portal/lib/drills";
import { fullName, repNumber, sessionNumber } from "../../athlete-portal/lib/metrics";
import type { PlayerRow } from "../lib/accounts";
import type { RepArtifactBundle, RepRevisionRow } from "../lib/repToolsData";
import { LIVE_REP_TOOLS_SOURCE } from "../lib/repToolsSource";
import type { RepToolsSource } from "../lib/repToolsSource";
import {
  PRIMARY_METRIC,
  broadJumpDistance,
  broadJumpScale,
  feetMoved,
  initialBroadJumpFeet,
  metersToFeetText,
  parsePointSeries,
  phoneBroadJumpFeet,
  primaryMetricValue,
  primaryResultText,
  processingFlagged,
  validationRevision,
  validationStatus,
  withAnnotationHistory,
  BROAD_JUMP_MAX_DISTANCE_METERS,
} from "../lib/resultValidation";
import type { BroadJumpFeet, ValidationDecision } from "../lib/resultValidation";
import {
  KICK_FIT_WINDOW_FRAMES,
  SHUTTLE_FRAME_KEYS,
  annotationFrames,
  buildRevisionPayload,
  defaultAnnotationRange,
  deriveApexFrame,
  deriveContactFrame,
  deriveEndFrame,
  deriveKickMetrics,
  derivePhaseBoundaries,
  deriveShuttleMetrics,
  diffFields,
  formatFieldValue,
  hipTrackFromPose,
  inferStartingSide,
  int,
  interpolateTrack,
  kickArtifacts,
  measurementInputsChanged,
  num,
  isLabelOnlyEdit,
  resolveClipTiming,
  resolveGate,
  resolveKickScale,
  revisionPreviewFields,
  shuttleFramesFrom,
  sizeFromMetadata,
  stringFieldValues,
  toolSpecFor,
  trackToSignedMeters,
} from "../lib/repTools";
import type { FrameRange, Mark, Point, ShuttleFrames, StartingSide } from "../lib/repTools";
import JumpTechniqueEditor from "./JumpTechniqueEditor";
import { SavedEvidence, SeriesCharts } from "./RepEvidence";
import { frameSeriesGroups, sceneEvidence } from "../lib/repEvidence";
import { drillEvidence } from "../lib/drillEvidence";
import { drawDrillEvidence } from "./drawDrillEvidence";
import { resultsPath } from "../lib/results";
import { ADMIN_RETURN_STATE } from '../lib/useAdminNavigation';
import { drawTrackingFrame, parseTracking } from '../../../lib/replay-tracking';
import "../result-validation.scss";

type AnnotationTarget = "com" | "ball";
type ComSource = "annotated" | "pose" | "none";
type BallSource = "annotated" | "boxes" | "none";

interface AnnotationRun {
  target: AnnotationTarget;
  queue: number[];
  index: number;
}

interface Loaded {
  player: PlayerRow | null;
  rep: any;
  artifacts: RepArtifactBundle;
  revisions: RepRevisionRow[];
  revisionError: boolean;
}

const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [24, 26], [26, 28], [28, 30], [30, 32],
];

/** Set when the rep tools run inside the result-validation queue. */
export interface RepValidationContext {
  eventName: string;
  position: string;
  back: string;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onSaved: (rep: any, decision: ValidationDecision) => void;
  /** Focus mode: the workbench fills the screen; toggled with F or the button. */
  focus?: boolean;
  onToggleFocus?: () => void;
}

export interface RepToolsProps {
  playerId?: string;
  drillKey?: string;
  repId?: string;
  validation?: RepValidationContext;
  source?: RepToolsSource;
}

export default function RepTools({ playerId: playerProp, drillKey: drillProp, repId: repProp, validation, source = LIVE_REP_TOOLS_SOURCE }: RepToolsProps = {}) {
  const params = useParams();
  const playerId = playerProp ?? params.playerId ?? "";
  const drillKey = drillProp ?? params.drillKey ?? "";
  const repId = repProp ?? params.repId ?? "";
  const [search] = useSearchParams();
  const drill = drillByKey(drillKey);
  const tool = validation ? "Result validation" : "Rep tools";
  const spec = toolSpecFor(drill.key);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [savedRevision, setSavedRevision] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${tool} | PoseTek admin`;
    let live = true;
    setLoaded(null);
    setLoadError(null);
    (async () => {
      const rep = await source.loadRep(playerId, repId);
      if (!rep) throw new Error("That rep could not be found.");
      const [player, artifacts, revisions] = await Promise.all([
        source.loadPlayer(playerId).catch(() => null),
        source.loadRepArtifacts(drill, rep, playerId),
        source.loadRepRevisions(playerId, repId).then(rows => ({ rows, error: false })).catch(() => ({ rows: [] as RepRevisionRow[], error: true })),
      ]);
      if (live) setLoaded({ player, rep, artifacts, revisions: revisions.rows, revisionError: revisions.error });
    })().catch(error => { if (live) setLoadError(error?.message || "The rep could not be loaded."); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, repId, drill.key, generation]);

  const back = validation?.back ?? resultsPath(playerId, drill.key) + (search.size ? `?${search}` : '');
  const sessionParam = search.get("session");

  if (loadError) {
    return (
      <>
        <Heading back={back} tool={tool} title={tool} subtitle={drill.label} />
        <p className="form-message" role="alert">{loadError}</p>
      </>
    );
  }
  if (!loaded) {
    return (
      <>
        <Heading back={back} tool={tool} title={tool} subtitle={drill.label} />
        <div className="portal-loading"><span className="spinner" /><p>Loading the rep and its files…</p></div>
      </>
    );
  }

  const athleteName = loaded.player?.name ?? fullName(loaded.artifacts?.metadata ?? {});
  return (
    <>
    {savedRevision && !validation && <p className="admin-banner good" role="status">Saved revision {savedRevision}. The correction has been reloaded.</p>}
    <RepToolsLoaded
      key={`${repId}:${generation}`}
      drillLabel={drill.label}
      drillKey={drill.key}
      playerId={playerId}
      repId={repId}
      athleteName={athleteName}
      loaded={loaded}
      back={sessionParam && !validation ? `${back}?session=${encodeURIComponent(sessionParam)}` : back}
      spec={spec}
      validation={validation}
      source={source}
      onReload={(id) => { setSavedRevision(id ?? null); setGeneration(current => current + 1); }}
    />
    </>
  );
}

function Heading({ back, tool = "Rep tools", title, subtitle, actions }: { back: string; tool?: string; title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <section className="admin-heading">
      <Link className="icon-button" state={ADMIN_RETURN_STATE} to={back} aria-label={tool === "Rep tools" ? "Back to the results" : "Back to the queue"}>
        <span className="material-symbols-outlined">arrow_back</span>
      </Link>
      <div>
        <p className="eyebrow">{tool} · {subtitle}</p>
        <h1>{title}</h1>
      </div>
      {actions && <div className="admin-heading-actions">{actions}</div>}
    </section>
  );
}

// MARK: - The tool, once everything is loaded

interface ToolProps {
  drillLabel: string;
  drillKey: string;
  playerId: string;
  repId: string;
  athleteName: string;
  loaded: Loaded;
  back: string;
  spec: ReturnType<typeof toolSpecFor>;
  validation?: RepValidationContext;
  source: RepToolsSource;
  onReload: (revisionId?: string) => void;
}

type FootTarget = "start" | "landing";

function RepToolsLoaded({ drillLabel, drillKey, playerId, repId, athleteName, loaded, back, spec, validation, source, onReload }: ToolProps) {
  const { rep, artifacts, revisions } = loaded;
  const metadata = useMemo(() => artifacts.metadata ?? {}, [artifacts.metadata]);
  const rederive = Boolean(spec?.rederive);
  const dribbling = drillKey === "dribbling";

  // MARK: video + timing
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const poseTrack = useMemo(() => hipTrackFromPose(artifacts.pose), [artifacts.pose]);
  const poseFrames: any[] = useMemo(() => (Array.isArray(artifacts.pose) ? artifacts.pose : Array.isArray(artifacts.pose?.frames) ? artifacts.pose.frames : []), [artifacts.pose]);
  const tracking = useMemo(() => parseTracking(artifacts.tracking, metadata), [artifacts.tracking, metadata]);
  const hasTracking = Boolean(tracking?.frames.some(row => row.person || row.com || row.ball));
  const hasPose = metadata.poseComputed !== false && poseFrames.some(row => Array.isArray(row) && row.length >= 33);
  const hasVisualEvidence = Boolean(artifacts.mediaUrl || hasPose || hasTracking);
  // Everything else the phone saved: markers, ground and gate geometry, per-frame series, every file.
  const evidenceJson = useMemo(() => artifacts.json ?? {}, [artifacts.json]);
  const scene = useMemo(() => sceneEvidence({ metadata, arucoCorners: artifacts.arucoCorners, json: evidenceJson }), [metadata, artifacts.arucoCorners, evidenceJson]);
  const hasScene = scene.markers.length > 0 || scene.lines.length > 0 || scene.points.length > 0;
  const [showScene, setShowScene] = useState(true);
  const timing = useMemo(
    () => resolveClipTiming({ metadata, reprocessContext: artifacts.reprocessContext, poseFrameCount: poseFrames.length, videoDuration, trackingFrameCount: tracking?.frames.length, trackingFPS: tracking?.fps }),
    [metadata, artifacts.reprocessContext, poseFrames.length, videoDuration, tracking],
  );
  const { fps, totalFrames } = timing;
  const lastFrame = Math.max(0, totalFrames - 1);
  const timingMissing = timing.fpsSource === "default";
  const canPlay = Boolean(artifacts.mediaUrl || (hasVisualEvidence && timing.fpsSource !== "default" && lastFrame > 0));

  const [frame, setFrameState] = useState(0);
  const frameRef = useRef(0);
  const seekTo = useCallback((next: number, seekVideo = true) => {
    setPlaying(false);
    const clamped = Math.max(0, Math.min(lastFrame, Math.round(next)));
    frameRef.current = clamped;
    setFrameState(clamped);
    const video = videoRef.current;
    if (video && seekVideo && Number.isFinite(video.duration)) {
      video.pause();
      video.currentTime = Math.min(video.duration, (clamped + 0.5) / fps);
    }
  }, [fps, lastFrame]);

  // Tracking and pose frames have no HTML video clock. Advance their original
  // frame indices at the recorded rate; never fill missing detections.
  useEffect(() => {
    if (artifacts.mediaUrl || !playing || !canPlay) return;
    const initialFrame = frameRef.current;
    const started = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      const next = Math.min(lastFrame, initialFrame + Math.floor((now - started) * fps * rate / 1000));
      frameRef.current = next;
      setFrameState(next);
      if (next >= lastFrame) setPlaying(false);
      else handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [artifacts.mediaUrl, playing, canPlay, lastFrame, fps, rate]);

  // Video events: keep the frame counter on the presented frame.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => {
      setVideoDuration(video.duration || null);
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    };
    const onError = () => setVideoError("The browser could not decode this video. Safari plays the phone's HEVC .mov files; other browsers may not.");
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      if (!video.paused) {
        const next = Math.max(0, Math.min(lastFrame, Math.floor(video.currentTime * fps)));
        frameRef.current = next;
        setFrameState(next);
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    let handle = 0;
    const tick = () => {
      onTime();
      if ("requestVideoFrameCallback" in video) handle = (video as any).requestVideoFrameCallback(tick);
    };
    if ("requestVideoFrameCallback" in video) handle = (video as any).requestVideoFrameCallback(tick);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      if (handle && "cancelVideoFrameCallback" in video) (video as any).cancelVideoFrameCallback(handle);
    };
  }, [fps, lastFrame, artifacts.mediaUrl]);

  function togglePlay() {
    if (!canPlay) return;
    const video = videoRef.current;
    if (!video) {
      if (frameRef.current >= lastFrame) {
        frameRef.current = 0;
        setFrameState(0);
      }
      setPlaying(current => !current);
      return;
    }
    if (video.paused) { video.playbackRate = rate; void video.play(); } else video.pause();
  }

  // MARK: frames (event marks)
  const [frames, setFrames] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {};
    for (const field of spec?.frameFields ?? []) initial[field.key] = int(metadata?.[field.key]) ?? int(rep?.[field.key]);
    if (rederive) Object.assign(initial, shuttleFramesFrom(metadata, rep));
    return initial;
  });
  const setFrameField = (key: string, value: number | null) => setFrames(current => ({ ...current, [key]: value }));

  // MARK: direct numeric edits (non-shuttle drills)
  const [numbers, setNumbers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of spec?.numberFields ?? []) {
      const value = num(rep?.[field.key]) ?? num(metadata?.[field.key]);
      initial[field.key] = value === null ? "" : String(value);
    }
    return initial;
  });
  const [strings, setStrings] = useState(() => stringFieldValues(spec, rep, metadata));

  // MARK: annotation
  const [stride, setStride] = useState(3);
  const [rangeOverride, setRangeOverride] = useState<FrameRange | null>(null);
  const [kickWindow, setKickWindow] = useState(KICK_FIT_WINDOW_FRAMES);
  const [comMarks, setComMarks] = useState<Mark[]>(() => Array.isArray(artifacts.adminAnnotations?.com) ? artifacts.adminAnnotations.com.filter(validMark) : []);
  const [ballMarks, setBallMarks] = useState<Mark[]>(() => Array.isArray(artifacts.adminAnnotations?.ball) ? artifacts.adminAnnotations.ball.filter(validMark) : []);
  const [comSource, setComSource] = useState<ComSource>(() => (Array.isArray(artifacts.adminAnnotations?.com) && artifacts.adminAnnotations.com.length ? "annotated" : "none"));
  // A kick starts from "none" so the preview shows no change until the ball is
  // actually annotated; the phone's own fitted ball_boxes.json is an opt-in.
  const [ballSource, setBallSource] = useState<BallSource>(() => (Array.isArray(artifacts.adminAnnotations?.ball) && artifacts.adminAnnotations.ball.length ? "annotated" : Array.isArray(artifacts.ballBoxes) && spec?.derive !== "kick" ? "boxes" : "none"));
  const [run, setRun] = useState<AnnotationRun | null>(null);
  const [showPose, setShowPose] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showRecordedTracking, setShowRecordedTracking] = useState(true);
  const [sideOverride, setSideOverride] = useState<StartingSide | "auto">("auto");
  const initialMeasurements = useRef({ frames, numbers, comMarks, ballMarks, comSource, ballSource, sideOverride, window: kickWindow });
  const measurementsEdited = measurementInputsChanged(initialMeasurements.current, { frames, numbers, comMarks, ballMarks, comSource, ballSource, sideOverride, window: kickWindow });
  const measurementTimingBlocked = timingMissing && measurementsEdited && Boolean(spec?.derive);

  // The annotation range: the drill's default (start → end frames, or
  // contact − 10 → contact + 60 for a kick) until the admin edits it.
  const defaultRange = useMemo(() => defaultAnnotationRange(spec, frames, lastFrame), [spec, frames, lastFrame]);
  const range = rangeOverride ?? defaultRange;
  const rangeStart = Math.min(range.from, range.to);
  const rangeEnd = Math.max(range.from, range.to);
  const setRangeFrom = (value: number) => setRangeOverride({ from: Math.max(0, Math.min(lastFrame, Math.round(value))), to: range.to });
  const setRangeTo = (value: number) => setRangeOverride({ from: range.from, to: Math.max(0, Math.min(lastFrame, Math.round(value))) });

  const comAnnotatedTrack = useMemo(() => interpolateTrack(comMarks, totalFrames), [comMarks, totalFrames]);
  const ballAnnotatedTrack = useMemo(() => interpolateTrack(ballMarks, totalFrames), [ballMarks, totalFrames]);
  const ballBoxesTrack = useMemo<(Point | null)[]>(() => {
    if (!Array.isArray(artifacts.ballBoxes)) return [];
    return artifacts.ballBoxes.map((box: any) => (Array.isArray(box) && box.length >= 4 && num(box[0]) !== null ? { x: (Number(box[0]) + Number(box[2])) / 2, y: (Number(box[1]) + Number(box[3])) / 2 } : null));
  }, [artifacts.ballBoxes]);

  const comTrack = useMemo<(Point | null)[] | null>(() => (comSource === "annotated" ? comAnnotatedTrack : comSource === "pose" ? poseTrack : null), [comSource, comAnnotatedTrack, poseTrack]);
  const ballTrack = useMemo<(Point | null)[] | null>(() => (ballSource === "annotated" ? ballAnnotatedTrack : ballSource === "boxes" ? ballBoxesTrack : null), [ballSource, ballAnnotatedTrack, ballBoxesTrack]);

  const gate = useMemo(() => resolveGate({ metadata, rep, arucoCorners: artifacts.arucoCorners, markerConfig: artifacts.markerConfig }), [metadata, rep, artifacts.arucoCorners, artifacts.markerConfig]);
  const gateUsable = gate.source !== "unavailable";
  const inferredSide = useMemo(() => inferStartingSide(comTrack ?? [], gate, metadata?.gateStartSide ?? rep?.gateStartSide), [comTrack, gate, metadata, rep]);
  const side: StartingSide | null = sideOverride === "auto" ? inferredSide : sideOverride;

  const comMeters = useMemo(() => (gateUsable && comTrack && side ? trackToSignedMeters(comTrack, gate, side) : null), [gateUsable, comTrack, gate, side]);
  const ballMeters = useMemo(() => (gateUsable && ballTrack && side ? trackToSignedMeters(ballTrack, gate, side) : null), [gateUsable, ballTrack, gate, side]);

  // MARK: what the drill's processing measured (paths, anchors, gates, ball, events)
  const measured = useMemo(() => drillEvidence({ drillKey, json: evidenceJson, metadata, rep, pose: artifacts.pose, tracking: artifacts.tracking, frames, fps: timingMissing ? null : fps }),
    [drillKey, evidenceJson, metadata, rep, artifacts.pose, artifacts.tracking, frames, timingMissing, fps]);
  const seriesGroups = useMemo(() => [...measured.series, ...frameSeriesGroups(evidenceJson, measured.seriesHandled)], [measured, evidenceJson]);
  const [showMeasured, setShowMeasured] = useState(true);
  const groundLine = scene.lines.find(line => line.kind === "ground") ?? null;

  // MARK: broad jump — the start and landing foot the distance is measured between
  const isBroadJump = drillKey === "broadJump";
  const phoneFeet = useMemo(() => phoneBroadJumpFeet(artifacts.broadJump, metadata), [artifacts.broadJump, metadata]);
  const initialFeet = useMemo(() => initialBroadJumpFeet(artifacts.adminAnnotations, phoneFeet), [artifacts.adminAnnotations, phoneFeet]);
  const [feet, setFeet] = useState<BroadJumpFeet>(initialFeet);
  const [placingFoot, setPlacingFoot] = useState<FootTarget | null>(null);
  const footScale = broadJumpScale(metadata);
  const footDistance = broadJumpDistance(feet, footScale);
  const feetEdited = isBroadJump && feetMoved(feet, initialFeet);
  const feetDifferFromPhone = isBroadJump && feetMoved(feet, phoneFeet);
  const footTrack = useMemo(() => parsePointSeries(artifacts.broadJump?.footCenters), [artifacts.broadJump]);
  const canPlaceFeet = isBroadJump && hasVisualEvidence && !videoError;

  function placeFoot(which: FootTarget, point: Point) {
    const next: BroadJumpFeet = { ...feet, [which]: { frame: frameRef.current, x: point.x, y: point.y } };
    setFeet(next);
    const distance = broadJumpDistance(next, footScale);
    if (distance !== null) setNumbers(current => ({ ...current, broadJumpDistance: String(Number(distance.toFixed(4))) }));
  }

  function undoFeet() {
    setFeet(initialFeet);
    setPlacingFoot(null);
    setNumbers(current => ({ ...current, broadJumpDistance: initialMeasurements.current.numbers.broadJumpDistance ?? "" }));
  }

  function usePhoneFeet() {
    setFeet(phoneFeet);
    setPlacingFoot(null);
    const distance = broadJumpDistance(phoneFeet, footScale);
    if (distance !== null) setNumbers(current => ({ ...current, broadJumpDistance: String(Number(distance.toFixed(4))) }));
  }

  // MARK: the re-derived rep
  const original = useMemo(() => ({ ...metadata, ...rep }), [metadata, rep]);
  const derivation = useMemo(() => {
    if (!rederive || timingMissing) return null;
    const shuttle: ShuttleFrames = {
      startFrame: frames.startFrame ?? null,
      apexFrame: frames.apexFrame ?? null,
      phase1EndFrame: frames.phase1EndFrame ?? null,
      phase2EndFrame: frames.phase2EndFrame ?? null,
      endFrame: frames.endFrame ?? null,
    };
    return deriveShuttleMetrics({ frames: shuttle, fps, original, comMeters, ballMeters, dribbling });
  }, [rederive, timingMissing, frames, fps, original, comMeters, ballMeters, dribbling]);

  // A kick: velocity and launch angle from a straight-line fit through the
  // annotated ball centers after contact, scaled by the marker (the phone's
  // KickProcessingMath.trackBallTrajectory).
  const kickScale = useMemo(() => resolveKickScale(metadata, videoSize?.width ?? null), [metadata, videoSize]);
  const contactFrame = frames.contact_frame ?? null;
  const kick = useMemo(() => (spec?.derive === "kick" && !timingMissing
    ? deriveKickMetrics({ ballTrack, contactFrame, fps, windowFrames: kickWindow, scale: kickScale, original })
    : null), [spec, timingMissing, ballTrack, contactFrame, fps, kickWindow, kickScale, original]);

  const after = useMemo(() => revisionPreviewFields({ spec, original, frames, numbers, strings, derivation, kick, side, measurementsEdited }),
    [spec, original, frames, numbers, strings, derivation, kick, side, measurementsEdited]);

  const diffKeys = useMemo(() => [
    ...(spec?.frameFields ?? []).map(field => field.key),
    ...(spec?.numberFields ?? []).map(field => field.key),
    ...(spec?.stringFields ?? []).map(field => field.key),
    ...(Object.hasOwn(after, "gateStartSide") ? ["gateStartSide"] : []),
    ...(Object.hasOwn(after, "direction") ? ["direction"] : []),
  ], [spec, after]);
  const diff = useMemo(() => diffFields(original, after, diffKeys), [original, after, diffKeys]);
  const changedCount = diff.filter(row => row.changed).length;
  const labelFor = (key: string) => spec?.frameFields.find(f => f.key === key)?.label ?? spec?.numberFields.find(f => f.key === key)?.label ?? spec?.stringFields?.find(f => f.key === key)?.label ?? ({ gateStartSide: "Start side", direction: "Direction" } as Record<string, string>)[key] ?? key;
  const labelOnlyChange = isLabelOnlyEdit(spec, diff, measurementsEdited);

  // MARK: push
  const [note, setNote] = useState("");
  const [clearFlags, setClearFlags] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushed, setPushed] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreArmed, setRestoreArmed] = useState<string | null>(null);

  const resultsValid = derivation ? derivation.metrics.totalTime !== null : kick?.fit ? kick.fit.resultsValid : null;

  /** The fields, rewritten artifacts and annotation file a save writes: shared by "Push changes" and the validation decisions. */
  function assembleRevision() {
      const fields: Record<string, number | string | null | undefined> = {};
      for (const row of diff) {
        if (row.changed) fields[row.key] = row.after;
      }
      // For shuttle drills the derived metrics are written whether or not they
      // changed, so the document and metadata.json agree completely.
      if (derivation && !labelOnlyChange) {
        for (const key of derivation.derived) fields[key] = derivation.metrics[key];
        for (const key of SHUTTLE_FRAME_KEYS) fields[key] = frames[key] ?? null;
      }
      // A kick with a ball fit: the fitted velocity and angle are written, and
      // the two ball artifacts the phone's viewer reads are rebuilt from the track.
      let rewrite: Record<string, any> | null = null;
      if (kick && !labelOnlyChange) {
        for (const key of kick.derived) fields[key] = kick.metrics[key];
        fields.contact_frame = contactFrame;
        fields.transition_frame = frames.transition_frame ?? null;
        if (kick.fit?.direction) fields.direction = kick.fit.direction;
        if (kick.fit && ballTrack && contactFrame !== null) {
          rewrite = kickArtifacts({
            ballTrack,
            contactFrame,
            transitionFrame: frames.transition_frame ?? null,
            direction: kick.fit.direction ?? (typeof original.direction === "string" ? original.direction : null),
            windowEnd: kick.fit.windowEnd,
            metrics: kick.metrics,
            resultsValid: kick.fit.resultsValid,
          });
        }
      }
      const annotations: Record<string, any> = {
        schemaVersion: 1,
        tool: "posetek-web-admin-rep-tools",
        fps,
        fpsSource: timing.fpsSource,
        totalFrames,
        videoDisplayWidth: num(metadata?.videoDisplayWidth) ?? num(metadata?.frameWidth) ?? videoSize?.width ?? null,
        videoDisplayHeight: num(metadata?.videoDisplayHeight) ?? num(metadata?.frameHeight) ?? videoSize?.height ?? null,
        stride,
        range: { from: rangeStart, to: rangeEnd },
        kickWindow: spec?.derive === "kick" ? kickWindow : null,
        kickFit: kick?.fit ?? null,
        kickScale: spec?.derive === "kick" ? kickScale : null,
        comSource,
        ballSource,
        com: comMarks,
        ball: ballMarks,
        gate: gateUsable ? { leftX: gate.leftX, rightX: gate.rightX, markerDistance: gate.markerDistance, source: gate.source, distanceSource: gate.distanceSource } : null,
        startingSide: side,
        startingSideSource: sideOverride === "auto" ? "inferred" : "admin",
        frames: { ...frames },
        derivationNotes: derivation?.notes ?? kick?.notes ?? [],
      };
      if (isBroadJump) {
        annotations.broadJump = {
          startFoot: feet.start,
          landingFoot: feet.landing,
          phoneStartFoot: phoneFeet.start,
          phoneLandingFoot: phoneFeet.landing,
          source: feetDifferFromPhone ? "admin" : "phone",
          metersPerUnit: footScale,
          scaleSource: footScale === null ? null : "metadata.m_to_normalized_units",
          distanceMeters: footDistance,
          groundY: num(metadata?.ground_loc_y),
        };
      }
      return { fields, rewrite, annotations };
  }

  async function push() {
    if (measurementTimingBlocked) return;
    setPushing(true);
    setPushError(null);
    try {
      const { fields, rewrite, annotations } = assembleRevision();
      const metadataExtras: Record<string, any> = {};
      if (clearFlags && resultsValid !== null && !labelOnlyChange) {
        if (derivation) metadataExtras.failedSteps = resultsValid ? [] : ["cod.metrics"];
        metadataExtras.processingStatus = resultsValid ? "complete" : "partial";
        metadataExtras.resultsValid = resultsValid;
      }
      const annotationFile = labelOnlyChange ? null : withAnnotationHistory(annotations, artifacts.adminAnnotations);
      const payload = buildRevisionPayload({ playerId, repId, drill: drillKey, fields, metadataExtras, annotations: annotationFile, artifacts: labelOnlyChange ? null : rewrite, note });
      const result = await source.pushRepRevision(payload);
      setPushed(result.revisionId);
      setConfirming(false);
      onReload(result.revisionId);
    } catch (error: any) {
      setPushError(error?.message || "The change could not be pushed.");
    } finally {
      setPushing(false);
    }
  }

  async function restore(revisionId: string) {
    setRestoring(revisionId);
    setPushError(null);
    try {
      await source.restoreRepRevision(playerId, repId, revisionId);
      setRestoreArmed(null);
      onReload();
    } catch (error: any) {
      setPushError(error?.message || "The revision could not be restored.");
    } finally {
      setRestoring(null);
    }
  }

  // MARK: validation decisions
  const recordedPrimary = primaryMetricValue(drillKey, original);
  const afterPrimary = primaryMetricValue(drillKey, after);
  const status = validationStatus(rep);
  const flagged = processingFlagged(rep) || processingFlagged(metadata);
  const adjusting = changedCount > 0 || measurementsEdited || feetEdited;
  const [saving, setSaving] = useState<ValidationDecision | null>(null);

  async function saveValidation(decision: ValidationDecision) {
    if (saving || run) return;
    if (decision === "adjusted" && measurementTimingBlocked) return;
    setPushError(null);
    const assembled = assembleRevision();
    const changedFields = Object.fromEntries(Object.entries(assembled.fields).filter(([, value]) => value !== undefined)) as Record<string, number | string | null>;
    const plan = validationRevision({ drillKey, decision, original, after, changedFields: decision === "adjusted" ? changedFields : {}, note });
    if ("error" in plan) { setPushError(plan.error); return; }
    setSaving(decision);
    try {
      const key = PRIMARY_METRIC[drillKey]?.key ?? null;
      const annotations = withAnnotationHistory({
        ...assembled.annotations,
        tool: "posetek-web-admin-result-validation",
        validation: {
          schemaVersion: 1,
          decision,
          primaryMetric: key,
          recordedValue: recordedPrimary,
          validatedValue: decision === "rejected" || !key ? null : plan.fields[key] ?? null,
          previousState: status.state,
          processingFlagged: flagged,
          testingEventId: typeof rep?.testingEventId === "string" ? rep.testingEventId : null,
          decidedAtMillis: Date.now(),
        },
      }, artifacts.adminAnnotations);
      const payload = buildRevisionPayload({
        playerId, repId, drill: drillKey, fields: plan.fields, metadataExtras: plan.metadataExtras, annotations,
        artifacts: decision === "adjusted" && !labelOnlyChange ? assembled.rewrite : null, note: plan.note,
      });
      const result = await source.pushRepRevision(payload);
      validation?.onSaved(result.rep, decision);
      onReload(result.revisionId);
    } catch (error: any) {
      setPushError(error?.message || "The decision could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  // MARK: annotation run
  function startRun(target: AnnotationTarget) {
    if (!artifacts.mediaUrl || videoError) return;
    const queue = annotationFrames(Math.max(0, rangeStart), Math.min(lastFrame, rangeEnd), stride);
    if (!queue.length) return;
    const existing = target === "com" ? comMarks : ballMarks;
    // Resume where the previous pass stopped, if it stopped mid-range.
    const firstUnmarked = queue.findIndex(f => !existing.some(mark => mark.frame === f));
    const index = firstUnmarked === -1 ? 0 : firstUnmarked;
    setRun({ target, queue, index });
    if (target === "com") setComSource("annotated"); else setBallSource("annotated");
    seekTo(queue[index]);
  }

  function stopRun() { setRun(null); }

  function advanceRun(current: AnnotationRun) {
    const nextIndex = current.index + 1;
    if (nextIndex >= current.queue.length) { setRun(null); return; }
    setRun({ ...current, index: nextIndex });
    seekTo(current.queue[nextIndex]);
  }

  function undoRun(current: AnnotationRun) {
    const prevIndex = Math.max(0, current.index - 1);
    const frameToClear = current.queue[prevIndex];
    if (current.target === "com") setComMarks(marks => marks.filter(mark => mark.frame !== frameToClear));
    else setBallMarks(marks => marks.filter(mark => mark.frame !== frameToClear));
    setRun({ ...current, index: prevIndex });
    seekTo(frameToClear);
  }

  function onStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (placingFoot) {
      const point = pointFromEvent(event, stageRef.current, videoSize ?? sizeFromMetadata(metadata));
      if (!point) return;
      placeFoot(placingFoot, point);
      setPlacingFoot(null);
      return;
    }
    if (!run) return;
    const point = pointFromEvent(event, stageRef.current, videoSize ?? sizeFromMetadata(metadata));
    if (!point) return;
    const mark: Mark = { frame: frameRef.current, x: point.x, y: point.y };
    if (run.target === "com") setComMarks(marks => [...marks.filter(m => m.frame !== mark.frame), mark]);
    else setBallMarks(marks => [...marks.filter(m => m.frame !== mark.frame), mark]);
    advanceRun(run);
  }

  // Keyboard scrubbing: arrows step a frame (shift: the stride ×3), space plays.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight" && hasVisualEvidence) { event.preventDefault(); seekTo(frameRef.current + (event.shiftKey ? stride * 3 : 1)); }
      else if (event.key === "ArrowLeft" && hasVisualEvidence) { event.preventDefault(); seekTo(frameRef.current - (event.shiftKey ? stride * 3 : 1)); }
      else if (event.key === " ") { event.preventDefault(); togglePlay(); }
      else if (event.key === "Backspace" && run) { event.preventDefault(); undoRun(run); }
      else if (event.key === "Escape" && placingFoot) { event.preventDefault(); setPlacingFoot(null); }
      else if (event.key === "Escape" && validation?.focus && !run && !document.fullscreenElement) { event.preventDefault(); validation.onToggleFocus?.(); }
      else if (event.key === "]" && validation?.onNext && !saving) { event.preventDefault(); validation.onNext(); }
      else if (event.key === "[" && validation?.onPrevious && !saving) { event.preventDefault(); validation.onPrevious(); }
      else if ((event.key === "f" || event.key === "F") && !event.metaKey && !event.ctrlKey && validation?.onToggleFocus) { event.preventDefault(); validation.onToggleFocus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo, stride, run, rate, canPlay, hasVisualEvidence, placingFoot, validation, saving]);

  // MARK: drawing
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return;
    const draw = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const content = contentRect(rect.width, rect.height, videoSize ?? sizeFromMetadata(metadata));
      const map = (p: Point) => ({ x: content.x + p.x * content.w, y: content.y + p.y * content.h });

      // The gate.
      if (gateUsable) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        for (const x of [gate.leftX, gate.rightX]) {
          const p = map({ x, y: 0 });
          ctx.strokeStyle = "rgba(255, 201, 105, 0.8)";
          ctx.beginPath(); ctx.moveTo(p.x, content.y); ctx.lineTo(p.x, content.y + content.h); ctx.stroke();
        }
        ctx.restore();
      }

      // Scene: every ArUco marker (corner outline, its ground edge, id and role),
      // the ground line and the gate points the phone measured with. Calibration
      // photo markers are dashed; they came from a different image.
      if (showScene && hasScene) {
        ctx.save();
        ctx.font = "700 11px Inter, system-ui, sans-serif";
        for (const line of scene.lines) {
          // Extend the segment across the frame.
          const dx = line.b.x - line.a.x;
          const slope = Math.abs(dx) > 1e-6 ? (line.b.y - line.a.y) / dx : 0;
          const from = map({ x: 0, y: line.a.y - slope * line.a.x });
          const to = map({ x: 1, y: line.a.y + slope * (1 - line.a.x) });
          ctx.setLineDash([10, 6]);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.textAlign = "right";
          ctx.fillText(line.label, to.x - 6, to.y - 6);
        }
        for (const marker of scene.markers) {
          const calibration = marker.source === "session.calibration";
          const color = calibration ? "rgba(160, 220, 255, 0.9)" : "rgba(255, 201, 105, 0.95)";
          const corners = marker.corners.map(map);
          if (corners.length >= 4) {
            ctx.setLineDash(calibration ? [4, 4] : []);
            ctx.fillStyle = calibration ? "rgba(160, 220, 255, 0.10)" : "rgba(255, 201, 105, 0.18)";
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            corners.forEach((p, index) => (index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // OpenCV order TL, TR, BR, BL: BR→BL is the edge on the ground.
            ctx.setLineDash([]);
            ctx.strokeStyle = calibration ? "rgba(160, 220, 255, 0.9)" : "#ff9f43";
            ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(corners[2].x, corners[2].y); ctx.lineTo(corners[3].x, corners[3].y); ctx.stroke();
            corners.forEach((p, index) => {
              ctx.fillStyle = index === 0 ? "#ffffff" : color;
              ctx.beginPath(); ctx.arc(p.x, p.y, index === 0 ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
            });
          }
          const center = marker.center ? map(marker.center) : null;
          if (center) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(center.x, center.y, 2.5, 0, Math.PI * 2); ctx.fill();
            const top = corners.length ? Math.min(...corners.map(p => p.y)) : center.y;
            const label = `${calibration ? "calib " : ""}ID ${marker.id ?? "?"}${marker.role ? ` · ${marker.role}` : ""}`;
            const textWidth = ctx.measureText(label).width + 10;
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(center.x - textWidth / 2, top - 22, textWidth, 16);
            ctx.fillStyle = color;
            ctx.textAlign = "center";
            ctx.fillText(label, center.x, top - 10);
          }
        }
        // Two markers: how far apart they measure vs. the distance processing used.
        if (scene.separation) {
          const { a, b, measuredMeters, configuredMeters, configuredSource, difference } = scene.separation;
          const pa = map(a), pb = map(b);
          const off = difference !== null && Math.abs(difference) > 0.05;
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = off ? "#ffb020" : "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          ctx.setLineDash([]);
          const ft = (m: number) => `${(m * 3.28084).toFixed(1)} ft`;
          const text = `markers measure ${measuredMeters.toFixed(2)} m (${ft(measuredMeters)})${configuredMeters !== null ? ` · used ${configuredMeters.toFixed(2)} m${configuredSource ? ` (${configuredSource})` : ""} · ${difference! >= 0 ? "+" : ""}${(difference! * 100).toFixed(1)}%` : " · no configured distance saved"}`;
          ctx.font = "800 12px Inter, system-ui, sans-serif";
          const width = ctx.measureText(text).width + 16;
          const cx = (pa.x + pb.x) / 2, cy = Math.max(content.y + 48, Math.min(pa.y, pb.y) - 40);
          ctx.fillStyle = off ? "rgba(90, 55, 0, 0.88)" : "rgba(0, 0, 0, 0.75)";
          ctx.fillRect(cx - width / 2, cy - 14, width, 22);
          ctx.fillStyle = off ? "#ffd27a" : "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(text, cx, cy + 2);
          ctx.font = "700 11px Inter, system-ui, sans-serif";
        }
        for (const gatePoint of scene.points) {
          const p = map(gatePoint.point);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y + 11); ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.fillText(gatePoint.label, p.x + 10, p.y + 16);
        }
        ctx.restore();
      }

      // Pose skeleton, faint.
      const pose = poseFrames[frame];
      if (showPose && hasPose && Array.isArray(pose) && pose.length >= 33) {
        const at = (index: number): Point | null => {
          const row = pose[index];
          if (!Array.isArray(row) || num(row[0]) === null || num(row[1]) === null) return null;
          const visibility = num(row[3]);
          if (visibility !== null && visibility < 0.1) return null;
          return { x: Number(row[0]), y: Number(row[1]) };
        };
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(183, 243, 74, 0.55)";
        for (const [a, b] of SKELETON) {
          const p = at(a), q = at(b);
          if (!p || !q) continue;
          const m = map(p), n = map(q);
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(n.x, n.y); ctx.stroke();
        }
        const hip = poseTrack[frame];
        if (hip) {
          const h = map(hip);
          ctx.fillStyle = "rgba(183, 243, 74, 0.7)";
          ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Saved detector output is display-only: viewing it must not silently
      // replace reviewed annotations, derive distances, or qualify a result.
      if (showRecordedTracking && hasTracking && tracking) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(content.x, content.y, content.w, content.h);
        ctx.clip();
        ctx.translate(content.x, content.y);
        drawTrackingFrame(ctx, tracking, frame, content.w, content.h);
        ctx.restore();
      }

      if (showMeasured) {
        const groundAt = (x: number) => {
          if (!groundLine) return null;
          const dx = groundLine.b.x - groundLine.a.x;
          return Math.abs(dx) < 1e-6 ? groundLine.a.y : groundLine.a.y + ((x - groundLine.a.x) * (groundLine.b.y - groundLine.a.y)) / dx;
        };
        drawDrillEvidence(ctx, map, content, frame, measured, groundAt);
      }

      // Tracks: the interpolated path so far, and the marks.
      const drawTrack = (track: (Point | null)[] | null, marks: Mark[], color: string, radius: number) => {
        if (!showTracks || !track) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (let f = 0; f <= Math.min(frame, track.length - 1); f++) {
          const p = track[f];
          if (!p) { started = false; continue; }
          const m = map(p);
          if (!started) { ctx.moveTo(m.x, m.y); started = true; } else ctx.lineTo(m.x, m.y);
        }
        ctx.stroke();
        for (const mark of marks) {
          if (mark.frame > frame) continue;
          const m = map(mark);
          ctx.fillStyle = mark.frame === frame ? "#ffffff" : color;
          ctx.beginPath(); ctx.arc(m.x, m.y, mark.frame === frame ? radius + 2 : radius, 0, Math.PI * 2); ctx.fill();
        }
        const current = track[frame];
        if (current) {
          const m = map(current);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(m.x, m.y, radius + 5, 0, Math.PI * 2); ctx.stroke();
        }
      };
      drawTrack(comSource === "none" ? null : comTrack, comSource === "annotated" ? comMarks : [], "#4bd7e8", 4);
      drawTrack(ballSource === "none" ? null : ballTrack, ballSource === "annotated" ? ballMarks : [], "#ff8a5c", 3);

      // Broad jump: the ground line, the foot and torso paths so far, the
      // phone's measured feet (faint, once moved) and the feet being validated.
      if (isBroadJump) {
        const path = (track: (Point | null)[], color: string, radius: number) => {
          if (!track.length) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          let started = false;
          for (let f = 0; f <= Math.min(frame, track.length - 1); f++) {
            const p = track[f];
            if (!p) { started = false; continue; }
            const m = map(p);
            if (!started) { ctx.moveTo(m.x, m.y); started = true; } else ctx.lineTo(m.x, m.y);
          }
          ctx.stroke();
          const current = track[frame];
          if (current) {
            const m = map(current);
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(m.x, m.y, radius, 0, Math.PI * 2); ctx.fill();
          }
        };
        if (showTracks) path(footTrack, "#ffad5c", 3.5);
        const footLine = (mark: { x: number; y: number } | null, color: string, label: string, faint: boolean) => {
          if (!mark) return;
          const p = map(mark);
          ctx.save();
          ctx.globalAlpha = faint ? 0.5 : 1;
          ctx.setLineDash(faint ? [3, 5] : [7, 5]);
          ctx.strokeStyle = color;
          ctx.lineWidth = faint ? 1.5 : 2;
          ctx.beginPath(); ctx.moveTo(p.x, content.y); ctx.lineTo(p.x, content.y + content.h); ctx.stroke();
          ctx.setLineDash([]);
          if (!faint) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
          }
          ctx.font = "700 11px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = color;
          ctx.fillText(label, p.x, faint ? content.y + 16 : Math.max(content.y + 30, p.y - 14));
          ctx.restore();
        };
        if (feetDifferFromPhone) {
          footLine(phoneFeet.start, "#d5ddd8", "phone start", true);
          footLine(phoneFeet.landing, "#d5ddd8", "phone landing", true);
        }
        footLine(feet.start, "#71d39b", "Start", false);
        footLine(feet.landing, "#ff7d7d", "Landing", false);
        if (feet.start && feet.landing) {
          const a = map(feet.start), b = map(feet.landing);
          const y = Math.min(content.y + content.h - 12, Math.max(a.y, b.y) + 26);
          ctx.save();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, y); ctx.lineTo(b.x, y);
          ctx.moveTo(a.x, y - 6); ctx.lineTo(a.x, y + 6);
          ctx.moveTo(b.x, y - 6); ctx.lineTo(b.x, y + 6);
          ctx.stroke();
          const text = footDistance === null ? "no marker scale" : `${metersToFeetText(footDistance)} · ${footDistance.toFixed(2)} m`;
          ctx.font = "700 12px Inter, system-ui, sans-serif";
          const width = ctx.measureText(text).width + 16;
          const cx = (a.x + b.x) / 2;
          ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
          ctx.fillRect(cx - width / 2, y - 30, width, 22);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, cx, y - 19);
          ctx.restore();
        }
      }

      // Crosshair hint while annotating.
      if (placingFoot) {
        ctx.strokeStyle = placingFoot === "start" ? "rgba(113, 211, 155, 0.95)" : "rgba(255, 125, 125, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(content.x + 1, content.y + 1, content.w - 2, content.h - 2);
      } else if (run) {
        ctx.strokeStyle = run.target === "com" ? "rgba(75, 215, 232, 0.9)" : "rgba(255, 138, 92, 0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(content.x + 1, content.y + 1, content.w - 2, content.h - 2);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [frame, videoSize, metadata, gate, gateUsable, poseFrames, poseTrack, hasPose, tracking, hasTracking, showRecordedTracking, showPose, showTracks, comTrack, ballTrack, comMarks, ballMarks, comSource, ballSource, run,
    isBroadJump, feet, phoneFeet, feetDifferFromPhone, footTrack, footDistance, placingFoot, scene, hasScene, showScene, measured, showMeasured, groundLine]);

  // MARK: derive buttons (shuttle)
  function deriveFromTrack(what: "apex" | "end" | "phases") {
    if (!comMeters) return;
    const start = frames.startFrame ?? 0;
    if (what === "apex") setFrameField("apexFrame", deriveApexFrame(comMeters, start));
    if (what === "end" && frames.apexFrame !== null && frames.apexFrame !== undefined) setFrameField("endFrame", deriveEndFrame(comMeters, frames.apexFrame));
    if (what === "phases" && frames.apexFrame !== null && frames.apexFrame !== undefined) {
      const bounds = derivePhaseBoundaries(comMeters, start, frames.apexFrame, gate.markerDistance);
      setFrames(current => ({ ...current, ...bounds }));
    }
  }

  function findContactFromBall() {
    if (!ballTrack) return;
    const found = deriveContactFrame(ballTrack, rangeStart);
    if (found !== null) { setFrameField("contact_frame", found); seekTo(found); }
  }

  const sessionLabel = `Session ${sessionNumber(rep)} · Rep ${repNumber(rep)}`;
  const runMarks = run ? (run.target === "com" ? comMarks : ballMarks) : [];
  const runDone = run ? run.queue.filter(f => runMarks.some(mark => mark.frame === f)).length : 0;
  const trackedFrame = tracking?.frames[frame];
  const emptyTrackingFrame = hasTracking && !(trackedFrame?.person || trackedFrame?.com || trackedFrame?.ball);

  return (
    <>
      <Heading
        back={back}
        tool={validation ? "Result validation" : "Rep tools"}
        title={`${athleteName} · ${sessionLabel}`}
        subtitle={validation ? `${validation.eventName} · ${drillLabel}` : drillLabel}
        actions={validation ? (
          <div className="rv-nav" aria-label="Queue">
            <button className="quiet-button" type="button" disabled={!validation.onPrevious || Boolean(saving)} onClick={() => validation.onPrevious?.()} title="Previous rep ( [ )">
              <span className="material-symbols-outlined">chevron_left</span>Previous
            </button>
            <span className="rv-position">{validation.position}</span>
            <button className="quiet-button" type="button" disabled={!validation.onNext || Boolean(saving)} onClick={() => validation.onNext?.()} title="Next rep ( ] )">
              Next<span className="material-symbols-outlined">chevron_right</span>
            </button>
            {validation.onToggleFocus && (
              <button className="quiet-button" type="button" onClick={() => validation.onToggleFocus?.()} title={validation.focus ? "Exit focus mode (F or Esc)" : "Focus mode: fill the screen (F)"} aria-pressed={Boolean(validation.focus)}>
                <span className="material-symbols-outlined">{validation.focus ? "close_fullscreen" : "open_in_full"}</span>{validation.focus ? "Exit focus" : "Focus"}
              </button>
            )}
          </div>
        ) : <>{drillKey === "shooting" && <Link className="quiet-button" to={`/admin/analysis?player=${encodeURIComponent(playerId)}&rep=${encodeURIComponent(repId)}`}><span className="material-symbols-outlined">edit_note</span>Technique review</Link>}<Link className="quiet-button" to={`/athlete?player=${encodeURIComponent(playerId)}`}><span className="material-symbols-outlined">open_in_new</span>Their portal</Link></>}
      />

      {pushed && !validation && (
        <div className="admin-banner good">
          <span className="material-symbols-outlined">check_circle</span>
          <p>Pushed as revision {pushed}. The rep document and its metadata.json now carry the corrected values; the previous version is listed below and can be restored.</p>
        </div>
      )}
      {!artifacts.mediaUrl && (
        <div className="admin-banner warn">
          <span className="material-symbols-outlined">videocam_off</span>
          <p>{hasTracking ? "Saved tracking is available. Original video is unavailable; review the recorded positions below. Point annotations require original video."
            : hasPose ? `Saved pose frames are available. Original video is unavailable; review the poses below. ${isBroadJump ? "The start and landing foot can still be placed on the pose; tracking" : "Point"} annotations require original video.`
              : "No video, pose, or tracking data is available for this rep. Frame numbers come from metadata; they do not represent loaded images. Recorded values can still be edited directly."}</p>
        </div>
      )}
      {(artifacts.trackingLoadError || (artifacts.tracking && !tracking)) && <p className="admin-banner warn" role="alert">Saved tracking could not be loaded. Reload this rep to retry.</p>}
      {timingMissing && <p className="admin-banner warn">Frame timing is unavailable. Inspect frames manually; timing-based corrections require the recorded frame rate.</p>}
      {videoError && <div className="admin-banner warn"><span className="material-symbols-outlined">error</span><p>{videoError}</p></div>}
      {rederive && !gateUsable && (
        <div className="admin-banner warn">
          <span className="material-symbols-outlined">straighten</span>
          <p>No usable gate calibration was found for this rep (no arucoGate in metadata.json, no trusted session aruco_corners.json, no marker config), so distances cannot be re-derived. Times still can.</p>
        </div>
      )}
      {metadata?.processingStatus === "partial" || (Array.isArray(metadata?.failedSteps) && metadata.failedSteps.length > 0) ? (
        <div className="admin-banner warn">
          <span className="material-symbols-outlined">report</span>
          <p>Processing flagged this rep: {(metadata.failedSteps || []).join(", ") || "partial results"}.</p>
        </div>
      ) : null}

      <div className="rt-layout">
        <div className="rt-main">
          <section className="pose-card rt-card">
            <div
              className={`pose-stage rt-stage${run || placingFoot ? " annotating" : ""}`}
              ref={stageRef}
              onClick={onStageClick}
              role={run || placingFoot ? "button" : undefined}
              aria-label={placingFoot ? `Place the ${placingFoot === "start" ? "start" : "landing"} foot on frame ${frame}` : run ? `Mark the ${run.target === "com" ? "athlete's center of mass" : "ball's center"} on frame ${frame}` : undefined}
            >
              {artifacts.mediaUrl && <video ref={videoRef} src={artifacts.mediaUrl} playsInline preload="auto" muted />}
              <canvas ref={canvasRef} />
              <span className="viewer-badge">{drillLabel.toUpperCase()}</span>
              <span className="rt-frame-chip">
                frame {frame} / {lastFrame} · {timing.fpsSource === "default" ? "Frame timing unavailable" : `${(frame / fps).toFixed(3)} s · ${fps.toFixed(2)} fps (${timing.fpsSource})`}
              </span>
              {placingFoot && (
                <span className={`rt-mode-chip rv-foot-chip ${placingFoot}`}>
                  {placingFoot === "start" ? "Click where the start foot is planted (toe line)" : "Click where the landing foot hits the ground (heel line)"} · Esc cancels
                </span>
              )}
              {run && (
                <span className="rt-mode-chip">
                  {run.target === "com" ? "Click the athlete's center of mass" : "Click the center of the ball"} · {runDone} of {run.queue.length}
                </span>
              )}
              {!hasVisualEvidence && <p className="viewer-empty">No video, pose, or tracking data is available for this rep.</p>}
              {!artifacts.mediaUrl && !hasPose && showRecordedTracking && emptyTrackingFrame && <p className="viewer-empty">No tracked detection at this frame.</p>}
            </div>
            <div className="playback-bar rt-playback">
              <div className="rt-transport">
                <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(0)} aria-label="First frame"><span className="material-symbols-outlined">first_page</span></button>
                <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(frame - 10)} aria-label="Back 10 frames">−10</button>
                <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(frame - 1)} aria-label="Back one frame"><span className="material-symbols-outlined">chevron_left</span></button>
                <button className="play-button" type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} disabled={!canPlay}>
                  <span className="material-symbols-outlined">{playing ? "pause" : "play_arrow"}</span>
                </button>
                <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(frame + 1)} aria-label="Forward one frame"><span className="material-symbols-outlined">chevron_right</span></button>
                <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(frame + 10)} aria-label="Forward 10 frames">+10</button>
                <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(lastFrame)} aria-label="Last frame"><span className="material-symbols-outlined">last_page</span></button>
              </div>
              <input type="range" min={0} max={lastFrame} value={frame} disabled={!hasVisualEvidence} onChange={event => seekTo(Number(event.target.value))} aria-label="Frame" />
              <button className="speed-button" type="button" onClick={() => { const rates = [0.25, 0.5, 1, 2]; const next = rates[(rates.indexOf(rate) + 1) % rates.length]; setRate(next); if (videoRef.current) videoRef.current.playbackRate = next; }}>{rate}×</button>
            </div>
          </section>

          <section className="admin-card rt-overlays">
            <div className="admin-checks">
              <label><input type="checkbox" checked={showPose} onChange={event => setShowPose(event.target.checked)} />Pose skeleton</label>
              <label><input type="checkbox" checked={showTracks} onChange={event => setShowTracks(event.target.checked)} />Tracks</label>
              {hasTracking && <label><input type="checkbox" checked={showRecordedTracking} onChange={event => setShowRecordedTracking(event.target.checked)} />Recorded tracking</label>}
              {hasScene && <label><input type="checkbox" checked={showScene} onChange={event => setShowScene(event.target.checked)} />Markers &amp; ground</label>}
              <label><input type="checkbox" checked={showMeasured} onChange={event => setShowMeasured(event.target.checked)} />Measured evidence</label>
            </div>
            <p className="admin-note">Measured evidence: {[...measured.trails.map(trail => trail.label), ...measured.anchors.map(anchor => anchor.label), ...measured.gates.map(gate => gate.label), measured.kick ? "ball rest + flight" : "", measured.ballBoxes ? "ball" : ""].filter(Boolean).join(" · ") || "nothing saved for this drill"}.</p>
            {measured.notes.map(text => <p className="admin-note rv-flag" key={text}>{text}</p>)}
            {hasScene && <p className="admin-note">Markers: yellow outline = detected in this clip, dashed blue = from the session calibration photo; the thick edge is the side on the ground, the white corner is the marker's top-left. Dashed white = ground line; crosshairs = gate points.</p>}
            {hasTracking && <p className="admin-note">Recorded tracking: green athlete box, white center point, orange ball box. Missing detections remain blank. Viewing this overlay does not change results or replace annotations.</p>}
            <div className="frame-markers">
              {measured.events.map(event => (
                <button key={event.key} className="frame-marker re-event-chip" type="button" title={`From ${event.source}`} onClick={() => seekTo(event.frame)}>
                  {event.label} · {event.frame}
                </button>
              ))}
              {(spec?.frameFields ?? []).map(field => (
                <button key={field.key} className="frame-marker" type="button" disabled={!hasVisualEvidence || frames[field.key] === null || frames[field.key] === undefined} onClick={() => seekTo(frames[field.key] ?? 0)}>
                  {field.label}{frames[field.key] !== null && frames[field.key] !== undefined ? ` · ${frames[field.key]}` : ""}
                </button>
              ))}
            </div>
            <p className="admin-note">
              ← → step one frame, shift for {stride * 3}; space plays; backspace undoes the last mark while annotating.
              {artifacts.mediaName ? ` Video: ${artifacts.mediaName}.` : ""}
            </p>
          </section>

          <SeriesCharts groups={seriesGroups} frame={frame} lastFrame={lastFrame} fps={timingMissing ? null : fps} seekTo={seekTo}
            events={[
              ...measured.events.map(event => ({ label: event.label, frame: event.frame })),
              ...(spec?.frameFields ?? []).flatMap(field => (frames[field.key] === null || frames[field.key] === undefined ? [] : [{ label: field.label, frame: frames[field.key]! }])),
            ].filter((event, index, all) => all.findIndex(other => other.frame === event.frame) === index)} />
          <SavedEvidence scene={scene} files={artifacts.files} json={evidenceJson} sessionFiles={artifacts.sessionFiles ?? []} sessionJson={artifacts.sessionJson ?? {}}
            folder={artifacts.folder} sessionRoot={artifacts.sessionRoot} />
        </div>

        <aside className="rt-side">
          {validation && spec && (
            <section className="admin-card rv-decision">
              <div className="rv-decision-head">
                <h3>Validate this result</h3>
                <span className={`rv-status ${status.state}`}>{STATE_LABEL[status.state]}</span>
              </div>
              <dl className="rv-results">
                <div><dt>Recorded</dt><dd>{primaryResultText(drillKey, recordedPrimary)}</dd></div>
                <div className={adjusting && afterPrimary !== recordedPrimary ? "changed" : ""}>
                  <dt>{adjusting ? "Adjusted to" : "Will be saved as"}</dt>
                  <dd>{primaryResultText(drillKey, adjusting ? afterPrimary : recordedPrimary)}</dd>
                </div>
              </dl>
              {status.state !== "open" && (
                <p className="admin-note">
                  {STATE_LABEL[status.state]}{status.byEmail ? ` by ${status.byEmail}` : ""}{status.atMillis ? ` · ${new Date(status.atMillis).toLocaleString()}` : ""}. Saving again keeps that decision in the revision history.
                </p>
              )}
              {flagged && <p className="admin-note rv-flag">The phone flagged this rep ({[metadata?.processingStatus, ...(Array.isArray(metadata?.failedSteps) ? metadata.failedSteps : [])].filter(Boolean).join(", ") || "results invalid"}). Validating marks the saved value as the result.</p>}
              {isBroadJump && footDistance !== null && footDistance > BROAD_JUMP_MAX_DISTANCE_METERS && <p className="form-message" role="alert">The feet are {footDistance.toFixed(2)} m apart, over the phone's {BROAD_JUMP_MAX_DISTANCE_METERS} m limit. Check the foot positions.</p>}
              <label className="admin-field">
                <span>Note (optional, saved with the decision)</span>
                <textarea value={note} maxLength={1900} rows={2} placeholder={adjusting ? "What was wrong and what you fixed." : "Anything worth knowing about this rep."} onChange={event => setNote(event.target.value)} />
              </label>
              {pushError && <p className="form-message" role="alert">{pushError}</p>}
              <div className="rv-actions">
                <button className="quiet-button rv-reject" type="button" disabled={Boolean(saving) || Boolean(run)} onClick={() => saveValidation("rejected")}>
                  <span className="material-symbols-outlined">block</span>{saving === "rejected" ? "Rejecting…" : "Reject result"}
                </button>
                {adjusting ? (
                  <button className="primary-cta" type="button" disabled={Boolean(saving) || Boolean(run) || measurementTimingBlocked} onClick={() => saveValidation("adjusted")}>
                    <span className="material-symbols-outlined">edit</span>{saving === "adjusted" ? "Saving…" : "Save adjustment"}
                  </button>
                ) : (
                  <button className="primary-cta" type="button" disabled={Boolean(saving) || Boolean(run) || recordedPrimary === null} onClick={() => saveValidation("validated")}>
                    <span className="material-symbols-outlined">check_circle</span>{saving === "validated" ? "Saving…" : "Validate as recorded"}
                  </button>
                )}
              </div>
              <p className="admin-note">
                {adjusting ? `${changedCount} field${changedCount === 1 ? "" : "s"} change; the table below shows them. ` : ""}
                A decision saves a revision: the validated value becomes the result, and the phone's original values, pose and files are kept for training. Saving moves to the next open rep. [ and ] step through the queue.
              </p>
            </section>
          )}

          {isBroadJump && (
            <section className="admin-card rv-feet">
              <h3>Start and landing foot</h3>
              <p className="admin-note">
                The distance is the horizontal gap between the two feet × the marker scale, the way the phone measures it.
                {footScale !== null ? ` Scale: ${footScale.toFixed(3)} m per frame width (m_to_normalized_units).` : " This rep has no marker scale, so moving the feet cannot re-derive the distance; type it under Values instead."}
              </p>
              {(["start", "landing"] as FootTarget[]).map(which => {
                const mark = feet[which];
                return (
                  <div className="rt-annotate-row" key={which}>
                    <div>
                      <strong><span className={`rv-dot ${which}`} />{which === "start" ? "Start foot" : "Landing foot"}</strong>
                      <span className="admin-row-meta">
                        <span>{mark ? `x ${mark.x.toFixed(3)}${mark.frame !== null ? ` · frame ${mark.frame}` : ""}` : "not placed"}</span>
                        {mark && feetDifferFromPhone && phoneFeet[which] && Math.abs(phoneFeet[which]!.x - mark.x) > 1e-9 && <span>phone x {phoneFeet[which]!.x.toFixed(3)}</span>}
                      </span>
                    </div>
                    <div className="admin-row-actions">
                      {mark?.frame !== null && mark?.frame !== undefined && <button className="icon-button small" type="button" disabled={!hasVisualEvidence} onClick={() => seekTo(mark.frame ?? 0)} aria-label={`Go to the ${which} foot frame`}><span className="material-symbols-outlined">my_location</span></button>}
                      {placingFoot === which
                        ? <button className="primary-cta small" type="button" onClick={() => setPlacingFoot(null)}>Cancel</button>
                        : <button className="primary-cta small" type="button" disabled={!canPlaceFeet || Boolean(run)} onClick={() => setPlacingFoot(which)}>{mark ? "Move" : "Place"}</button>}
                    </div>
                  </div>
                );
              })}
              <p className="admin-note">
                Scrub to the takeoff (start) or landing frame, press Move, then click the foot on the {artifacts.mediaUrl ? "video" : "pose"}. Orange: foot track · cyan: torso · dashed white: ground.
                {!canPlaceFeet && !hasVisualEvidence ? " No video or pose is saved for this rep, so the feet cannot be placed." : ""}
              </p>
              <div className="admin-row-actions">
                {feetEdited && <button className="quiet-button small" type="button" onClick={undoFeet}>Undo foot changes</button>}
                {feetDifferFromPhone && (phoneFeet.start || phoneFeet.landing) && <button className="quiet-button small" type="button" onClick={usePhoneFeet}>Use the phone's feet</button>}
              </div>
            </section>
          )}

          {drillKey === "jump" && <JumpTechniqueEditor playerId={playerId} repId={repId} athleteName={athleteName}
            source={artifacts.jumpTechnique} originalHeight={num(rep.jumpHeight)} originalAngles={rep}
            revisionId={rep.adminRevision?.revisionId ?? null} currentFrame={frame} lastFrame={lastFrame} seekTo={seekTo} onSaved={onReload} />}

          {!spec && (
            <section className="admin-card">
              <h3>No tools for this drill</h3>
              <p className="admin-note">Free Record clips have no processed metrics to correct.</p>
            </section>
          )}

          {spec && (
            <section className="admin-card">
              <h3>Event frames</h3>
              <p className="admin-note">Scrub to the moment, then "Use current". {rederive ? "Every time below is re-derived from these frames over the measured fps, exactly as the phone does." : ""}</p>
              <div className="rt-frame-fields">
                {spec.frameFields.filter(field => drillKey !== "jump" || field.key === "landingFrame").map(field => (
                  <div className="rt-frame-field" key={field.key} title={field.hint}>
                    <span className="rt-frame-label">{field.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={lastFrame}
                      value={frames[field.key] ?? ""}
                      placeholder="—"
                      onChange={event => setFrameField(field.key, event.target.value === "" ? null : Math.max(0, Math.min(lastFrame, Math.round(Number(event.target.value)))))}
                      aria-label={`${field.label} frame`}
                    />
                    <button className="quiet-button small" type="button" disabled={!hasVisualEvidence} onClick={() => setFrameField(field.key, frame)}>Use current</button>
                    <button className="icon-button small" type="button" disabled={!hasVisualEvidence || frames[field.key] === null || frames[field.key] === undefined} onClick={() => seekTo(frames[field.key] ?? 0)} aria-label={`Go to ${field.label}`}><span className="material-symbols-outlined">my_location</span></button>
                  </div>
                ))}
              </div>
              {rederive && (
                <div className="rt-derive">
                  <span className="admin-note">From the athlete track:</span>
                  <button className="quiet-button small" type="button" disabled={!comMeters} onClick={() => deriveFromTrack("apex")}>Find apex</button>
                  <button className="quiet-button small" type="button" disabled={!comMeters || frames.apexFrame === null || frames.apexFrame === undefined} onClick={() => deriveFromTrack("end")}>Find end</button>
                  <button className="quiet-button small" type="button" disabled={!comMeters || frames.apexFrame === null || frames.apexFrame === undefined} onClick={() => deriveFromTrack("phases")}>Find turn phases (90%)</button>
                </div>
              )}
              {spec.derive === "kick" && (
                <div className="rt-derive">
                  <span className="admin-note">From the ball track:</span>
                  <button className="quiet-button small" type="button" disabled={!ballTrack} onClick={findContactFromBall}>Find contact (last frame at rest)</button>
                </div>
              )}
            </section>
          )}

          {spec && (
            <section className="admin-card">
              <h3>Annotate</h3>
              {!artifacts.mediaUrl && <p className="admin-note">Point annotations require original video. You can review saved positions and edit event frame numbers without adding image annotations.</p>}
              <p className="admin-note">
                Click on the video to mark the point; the tool jumps ahead {stride} frame{stride === 1 ? "" : "s"} and the skipped frames are interpolated,
                from frame {rangeStart} to {rangeEnd}
                {rangeOverride ? "" : spec.derive === "kick" ? " (contact − 10 → contact + the fit window)" : spec.derive === "shuttle" ? " (start → end)" : " (whole clip)"}.
                Stop any time; a stopped pass can be continued.
              </p>
              <div className="admin-field-row">
                <label className="admin-field">
                  <span>Stride (frames per click)</span>
                  <select value={stride} onChange={event => setStride(Number(event.target.value))} disabled={Boolean(run)}>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map(value => <option key={value} value={value}>{value}{value === 3 ? " (skip 2)" : ""}</option>)}
                  </select>
                </label>
                <div className="admin-field">
                  <span>From frame</span>
                  <div className="rt-range-field">
                    <input type="number" min={0} max={lastFrame} value={range.from} disabled={Boolean(run)} onChange={event => setRangeFrom(Number(event.target.value) || 0)} aria-label="Range start frame" />
                    <button className="quiet-button small" type="button" disabled={Boolean(run)} onClick={() => setRangeFrom(frame)}>Use current</button>
                  </div>
                </div>
                <div className="admin-field">
                  <span>To frame</span>
                  <div className="rt-range-field">
                    <input type="number" min={0} max={lastFrame} value={range.to} disabled={Boolean(run)} onChange={event => setRangeTo(Number(event.target.value) || 0)} aria-label="Range end frame" />
                    <button className="quiet-button small" type="button" disabled={Boolean(run)} onClick={() => setRangeTo(frame)}>Use current</button>
                  </div>
                </div>
                {spec.derive === "kick" && (
                  <label className="admin-field">
                    <span>Fit window after contact (frames)</span>
                    <select value={kickWindow} onChange={event => setKickWindow(Number(event.target.value))} disabled={Boolean(run)}>
                      {[20, 30, 45, 60, 90, 120].map(value => <option key={value} value={value}>{value}{value === KICK_FIT_WINDOW_FRAMES ? " (phone default)" : ""}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {rangeOverride && (
                <button className="quiet-button small" type="button" style={{ marginTop: 8 }} disabled={Boolean(run)} onClick={() => setRangeOverride(null)}>Reset the range to the default</button>
              )}

              {spec.derive !== "kick" && <div className="rt-annotate-row">
                <div>
                  <strong>Athlete center of mass</strong>
                  <span className="admin-row-meta"><span>{comMarks.length} marks</span></span>
                </div>
                {run?.target === "com" ? (
                  <div className="admin-row-actions">
                    <button className="quiet-button small" type="button" onClick={() => undoRun(run)} disabled={run.index === 0 && !runMarks.some(m => m.frame === run.queue[0])}>Undo</button>
                    <button className="quiet-button small" type="button" onClick={() => advanceRun(run)}>Skip</button>
                    <button className="primary-cta small" type="button" onClick={stopRun}>Stop</button>
                  </div>
                ) : (
                  <div className="admin-row-actions">
                    {comMarks.length > 0 && <button className="quiet-button small" type="button" disabled={Boolean(run)} onClick={() => { setComMarks([]); setComSource(poseTrack.some(Boolean) ? "pose" : "none"); }}>Clear</button>}
                    <button className="primary-cta small" type="button" disabled={Boolean(run) || !artifacts.mediaUrl || Boolean(videoError)} onClick={() => startRun("com")}>{comMarks.length ? "Continue" : "Start"}</button>
                  </div>
                )}
              </div>}
              {(spec.ball || dribbling) && (
                <div className="rt-annotate-row">
                  <div>
                    <strong>Ball center</strong>
                    <span className="admin-row-meta">
                      <span>{ballMarks.length} marks</span>
                      {spec.derive === "kick" && <span>velocity and launch angle are fitted from these</span>}
                      {Array.isArray(artifacts.ballBoxes) && <span>ball_boxes.json on file</span>}
                    </span>
                  </div>
                  {run?.target === "ball" ? (
                    <div className="admin-row-actions">
                      <button className="quiet-button small" type="button" onClick={() => undoRun(run)} disabled={run.index === 0 && !runMarks.some(m => m.frame === run.queue[0])}>Undo</button>
                      <button className="quiet-button small" type="button" onClick={() => advanceRun(run)}>Skip</button>
                      <button className="primary-cta small" type="button" onClick={stopRun}>Stop</button>
                    </div>
                  ) : (
                    <div className="admin-row-actions">
                      {ballMarks.length > 0 && <button className="quiet-button small" type="button" disabled={Boolean(run)} onClick={() => { setBallMarks([]); setBallSource(Array.isArray(artifacts.ballBoxes) ? "boxes" : "none"); }}>Clear</button>}
                      <button className="primary-cta small" type="button" disabled={Boolean(run) || !artifacts.mediaUrl || Boolean(videoError)} onClick={() => startRun("ball")}>{ballMarks.length ? "Continue" : "Start"}</button>
                    </div>
                  )}
                </div>
              )}

              {spec.derive === "kick" && (
                <div className="admin-form" style={{ marginTop: 12 }}>
                  <label className="admin-field">
                    <span>Ball track used for the fit</span>
                    <select value={ballSource} onChange={event => setBallSource(event.target.value as BallSource)} disabled={Boolean(run)}>
                      <option value="annotated" disabled={!ballMarks.length}>Annotated ball center{ballMarks.length ? "" : " (none yet)"}</option>
                      <option value="boxes" disabled={!Array.isArray(artifacts.ballBoxes)}>ball_boxes.json from the phone (its own fitted track)</option>
                      <option value="none">None — keep the original velocity and angle</option>
                    </select>
                  </label>
                  <p className="admin-note">
                    Scale: {kickScale.metersPerPixel !== null
                      ? `${kickScale.source} · ${(kickScale.metersPerPixel * 1000).toFixed(3)} mm per pixel · frame width ${kickScale.frameWidth ?? "?"} px`
                      : "no marker scale on this rep — the launch angle can be derived, the velocity cannot"}.
                    {kick?.fit ? ` Fit: ${kick.fit.samples} ball positions over frames ${kick.fit.windowStart}–${kick.fit.windowEnd}.` : ""}
                  </p>
                </div>
              )}

              {rederive && (
                <div className="admin-form" style={{ marginTop: 12 }}>
                  <div className="admin-field-row">
                    <label className="admin-field">
                      <span>Athlete track used for distances</span>
                      <select value={comSource} onChange={event => setComSource(event.target.value as ComSource)} disabled={Boolean(run)}>
                        <option value="annotated" disabled={!comMarks.length}>Annotated center of mass{comMarks.length ? "" : " (none yet)"}</option>
                        <option value="pose" disabled={!poseTrack.some(Boolean)}>Hip midpoint from pose.json</option>
                        <option value="none">None — keep the original distances</option>
                      </select>
                    </label>
                    {dribbling && (
                      <label className="admin-field">
                        <span>Ball track used for ball distance</span>
                        <select value={ballSource} onChange={event => setBallSource(event.target.value as BallSource)} disabled={Boolean(run)}>
                          <option value="annotated" disabled={!ballMarks.length}>Annotated ball center{ballMarks.length ? "" : " (none yet)"}</option>
                          <option value="boxes" disabled={!Array.isArray(artifacts.ballBoxes)}>ball_boxes.json from the phone</option>
                          <option value="none">None — keep the original</option>
                        </select>
                      </label>
                    )}
                    <label className="admin-field">
                      <span>Starting side</span>
                      <select value={sideOverride} onChange={event => setSideOverride(event.target.value as StartingSide | "auto")}>
                        <option value="auto">Auto{inferredSide ? ` (${inferredSide})` : " (unknown)"}</option>
                        <option value="left">Left marker</option>
                        <option value="right">Right marker</option>
                      </select>
                    </label>
                  </div>
                  <p className="admin-note">
                    Gate: {gateUsable ? `${gate.source} · ${gate.markerDistance.toFixed(3)} m between markers (${gate.distanceSource ?? "source unknown"}) · x ${gate.leftX.toFixed(3)}–${gate.rightX.toFixed(3)}` : "unavailable"}.
                  </p>
                </div>
              )}
            </section>
          )}

          {spec && (!rederive || Boolean(spec.stringFields?.length)) && (
            <section className="admin-card">
              <h3>Values</h3>
              {!rederive && !kick?.fit && spec.derive !== "kick" && <p className="admin-note">This drill is not re-derived on the web; type the corrected values directly. Units are the stored units (meters, m/s, seconds).</p>}
              {spec.derive === "kick" && !kick?.fit && <p className="admin-note">Annotate the ball to fit velocity and launch angle from its positions. Until then they can only be typed here (m/s and degrees).</p>}
              {kick?.fit && <p className="admin-note">Velocity and launch angle come from the ball fit above; only the foot is set here.</p>}
              <div className="admin-form">
                {(spec.stringFields ?? []).map(field => (
                  <label className="admin-field" key={field.key}>
                    <span>{field.label}</span>
                    <select value={strings[field.key] ?? ""} onChange={event => setStrings(current => ({ ...current, [field.key]: event.target.value || null }))}>
                      <option value="">Unassigned</option>
                      {strings[field.key] && !field.options.some(option => option.value === strings[field.key]) && <option value={strings[field.key]!}>{strings[field.key]} (current)</option>}
                      {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                ))}
                {!rederive && !kick?.fit && spec.numberFields.map(field => (
                  <label className="admin-field" key={field.key}>
                    <span>{field.label}{field.unit ? ` (${field.unit})` : ""}</span>
                    <input type="number" step="any" value={numbers[field.key] ?? ""} placeholder="—" onChange={event => setNumbers(current => ({ ...current, [field.key]: event.target.value }))} />
                  </label>
                ))}
              </div>
            </section>
          )}

          {spec && (
            <section className="admin-card rt-preview">
              <h3>Re-processed rep</h3>
              {derivation && !labelOnlyChange && derivation.notes.length > 0 && (
                <ul className="admin-issues">
                  {derivation.notes.map((text, index) => <li className="admin-issue warning" key={index}>{text}</li>)}
                </ul>
              )}
              {kick && !labelOnlyChange && kick.notes.length > 0 && (
                <ul className="admin-issues">
                  {kick.notes.map((text, index) => <li className="admin-issue warning" key={index}>{text}</li>)}
                </ul>
              )}
              <table className="rt-diff">
                <thead><tr><th>Field</th><th>Original</th><th>Re-processed</th></tr></thead>
                <tbody>
                  {diff.map(row => (
                    <tr key={row.key} className={row.changed ? "changed" : ""}>
                      <td>{labelFor(row.key)}</td>
                      <td>{formatFieldValue(row.key, row.before)}</td>
                      <td>{formatFieldValue(row.key, row.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultsValid !== null && !labelOnlyChange && !validation && (
                <label className="rt-check">
                  <input type="checkbox" checked={clearFlags} onChange={event => setClearFlags(event.target.checked)} />
                  <span>
                    {derivation
                      ? (resultsValid ? "Clear the processing failure flags (failedSteps, partial status) since the rep now has a total time." : "Mark the rep partial: it still has no total time.")
                      : (resultsValid ? "Mark the results valid (resultsValid, complete status): the fitted velocity is within the phone's 100 mph limit." : "Mark the rep partial: the fit gives no valid velocity.")}
                  </span>
                </label>
              )}
              {!validation && <>
              <label className="admin-field" style={{ marginTop: 12 }}>
                <span>Note (optional, saved with the revision)</span>
                <textarea value={note} maxLength={2000} placeholder="What was wrong and what you fixed." onChange={event => setNote(event.target.value)} />
              </label>
              {pushError && <p className="form-message" role="alert">{pushError}</p>}
              <div className="admin-form-actions">
                <span className="admin-note">{changedCount} field{changedCount === 1 ? "" : "s"} change.</span>
                <button className="primary-cta" type="button" disabled={pushing || Boolean(run) || measurementTimingBlocked || (changedCount === 0 && !comMarks.length && !ballMarks.length)} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setConfirming(true); }}>
                  <span className="material-symbols-outlined">publish</span>Push changes
                </button>
              </div>
              </>}
            </section>
          )}

          <section className="admin-card">
            <h3>Revisions</h3>
            {loaded.revisionError && <p className="form-message" role="alert">Revision history is unavailable. Reload to try again; this does not mean the rep has no revisions.</p>}
            {!loaded.revisionError && revisions.length === 0 && <p className="admin-note">No admin revisions yet. This rep is exactly as the phone processed it.</p>}
            {revisions.map(revision => (
              <div className="rt-revision" key={revision.id}>
                <div className="admin-row-meta">
                  <span>{revision.createdAtMillis ? new Date(revision.createdAtMillis).toLocaleString() : revision.id}</span>
                  {revision.byEmail && <span>{revision.byEmail}</span>}
                  <span>{Object.keys(revision.fields).length} fields</span>
                  {revision.restored && <span className="admin-chip">restored</span>}
                </div>
                {revision.recoveryRequired && <p role="alert">This save needs recovery. Restore its backup before another correction.</p>}
                {revision.note && <blockquote>{revision.note}</blockquote>}
                {!revision.restored && (
                  restoreArmed === revision.id ? (
                    <div className="admin-row-actions">
                      <button className="quiet-button small" type="button" onClick={() => setRestoreArmed(null)}>Keep current</button>
                      <button className="primary-cta small" type="button" disabled={restoring === revision.id} onClick={() => restore(revision.id)}>{restoring === revision.id ? "Restoring…" : "Confirm restore"}</button>
                    </div>
                  ) : (
                    <button className="quiet-button small" type="button" disabled={Boolean(restoring)} onClick={() => setRestoreArmed(revision.id)}>Restore the rep as it was before this</button>
                  )
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>

      {confirming && (
        <AdminModal label="Push the re-processed rep" onClose={() => setConfirming(false)} dismissDisabled={pushing}>
            <h3>Overwrite this rep?</h3>
            <p>
              {athleteName} · {sessionLabel} · {drillLabel}. The rep document and its metadata.json are replaced with the values on the right of the table; dashboards, leaderboards and the app read them immediately. The current version is kept as a revision you can restore.
            </p>
            <table className="rt-diff compact">
              <tbody>
                {diff.filter(row => row.changed).map(row => (
                  <tr key={row.key}><td>{labelFor(row.key)}</td><td>{formatFieldValue(row.key, row.before)}</td><td>→ {formatFieldValue(row.key, row.after)}</td></tr>
                ))}
                {diff.every(row => !row.changed) && <tr><td colSpan={3}>No field values change; only the annotation file is written.</td></tr>}
              </tbody>
            </table>
            {pushError && <p className="form-message" role="alert">{pushError}</p>}
            <div className="admin-dialog-actions">
              <button className="quiet-button" type="button" disabled={pushing} onClick={() => setConfirming(false)}>Not yet</button>
              <button className="primary-cta" type="button" disabled={pushing || measurementTimingBlocked} onClick={push}>{pushing ? "Pushing…" : "Push and overwrite"}</button>
            </div>
        </AdminModal>
      )}
    </>
  );
}

const STATE_LABEL: Record<string, string> = {
  open: "Not reviewed",
  validated: "Validated",
  adjusted: "Adjusted",
  rejected: "Rejected",
  revised: "Revised in rep tools",
};

// MARK: - Geometry helpers (stage ↔ normalized video coordinates)

function validMark(value: any): value is Mark {
  return value && Number.isInteger(value.frame) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/** The letterboxed rectangle a contain-fitted video occupies inside the stage. */
function contentRect(width: number, height: number, size: { width: number; height: number } | null) {
  if (!size || !size.width || !size.height) return { x: 0, y: 0, w: width, h: height };
  const scale = Math.min(width / size.width, height / size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

function pointFromEvent(event: React.MouseEvent, stage: HTMLDivElement | null, size: { width: number; height: number } | null): Point | null {
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  const content = contentRect(rect.width, rect.height, size);
  const x = (event.clientX - rect.left - content.x) / content.w;
  const y = (event.clientY - rect.top - content.y) / content.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
