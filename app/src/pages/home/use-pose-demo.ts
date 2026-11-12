// Imperative half of the legacy landing-pose-demo.js port: canvas drawing, the
// requestAnimationFrame loop and the visibility / resize / reduced-motion
// listeners. Elements arrive through refs instead of getElementById and the
// hook tears everything down on unmount.
//
// React state only mirrors the current sequence index — it drives the drill
// title, label, metric grid, switcher buttons and telemetry flaps in
// HomePage.tsx. The per-frame hot path (canvas, timer, phase chip, scrubber
// value + aria-valuetext, phase telemetry, play button state) writes to the DOM
// directly, exactly like the legacy script, so a 60fps tick never re-renders
// the page. Those elements are rendered once with constant initial text so
// React never overwrites what the controller wrote.
//
// Optional inputs (PoseDemoOptions) let the same controller replay an athlete's own rep: the
// homepage recorded-movement framing and look, the sequence's ArUco markers / gate / ground
// (`calibration`), a centre line for reps recorded without pose (`centerLine`) and a second,
// fainter sequence drawn underneath (the team median). With no options and the bundled demo
// data none of that runs, so the homepage demo draws exactly as before.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  END_HOLD_MS,
  INITIAL_VIEWPORT,
  MEDIAPIPE33_EDGES,
  advanceFrame,
  backingStoreSize,
  broadJumpLabelY,
  centerLinePoint,
  changeOfDirectionPhaseRanges,
  clampFrame,
  elapsedSeconds,
  fitRecording,
  fitViewport,
  frameDelta,
  framingRecording,
  hipCenter,
  isPoseDemoData,
  lastFrameIndex,
  mapPoint,
  phaseChipText,
  phaseForChangeOfDirection,
  phaseForFrame,
  recordingBounds,
  restingFrame,
  scrubberValueText,
  timerText,
  trailRange,
  validPoint,
  wrapSequenceIndex,
  type CanvasPoint,
  type PoseDemoData,
  type PoseFrame,
  type PosePoint,
  type PoseSequence,
  type PoseViewport,
} from "./pose-demo";

export interface PoseDemoElements {
  canvas: HTMLCanvasElement;
  playButton: HTMLButtonElement;
  playIcon: HTMLElement;
  scrubber: HTMLInputElement;
  timer: HTMLElement;
  phaseChip: HTMLElement;
  telemetryPhase: HTMLElement | null;
}

export interface PoseDemoController {
  /** Legacy `posePlayButton` click. */
  togglePlay(): void;
  /** Legacy `poseScrubber` input. */
  scrub(value: string): void;
  /** Legacy `[data-pose-drill]` click. */
  selectDrill(key: string): void;
  stepSequence(direction: -1 | 1): void;
  /** Replaces the shadow without restarting playback (it usually arrives after the rep). */
  setShadow(shadow: PoseShadow | null): void;
  destroy(): void;
}

/** A second sequence drawn faintly under the current one, already moved onto its ground and scale. */
export interface PoseShadow {
  sequence: PoseSequence;
  /** The shadow's frame for one of the current sequence's frames, or null when it is not shown. */
  frameFor(frame: number): number | null;
}

export interface PoseDemoOptions {
  /**
   * Fit the whole rep (every frame, the shadow, markers and overlays) like the homepage's
   * recorded-movement demo (`recordingBounds` / `fitRecording`) instead of letterboxing the camera frame.
   */
  fitRecording?: boolean;
  /**
   * The recorded-movement presentation (movement/PROVENANCE.md, September 16 refinement): thin
   * limbs with finer hand and foot detail, nose/ear dots only, and trails that fade with age.
   */
  recordedLook?: boolean;
  shadow?: PoseShadow | null;
}

const isPoint = (point: PosePoint | null): point is PosePoint => Boolean(point);
/** The recorded-movement skeleton's finer strokes: hands (17–22) and feet (29–32). */
const isDetailLandmark = (index: number) => (index >= 17 && index <= 22) || index >= 29;
const SHADOW_COLOR = "#8fa39b";

/**
 * Wires the demo exactly like the legacy IIFE did. Returns null (and does
 * nothing) when the data or canvas is unusable — legacy left the static markup
 * untouched in that case.
 */
export function createPoseDemoController(
  data: PoseDemoData,
  elements: PoseDemoElements,
  onSequenceChange: (index: number) => void,
  options: PoseDemoOptions = {},
): PoseDemoController | null {
  if (!isPoseDemoData(data)) return null;
  const { canvas, playButton, playIcon, scrubber, timer, phaseChip, telemetryPhase } = elements;
  const maybeContext = canvas.getContext("2d");
  if (!maybeContext) return null;
  const context: CanvasRenderingContext2D = maybeContext;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    sequenceIndex: 0,
    frame: 0,
    playing: false,
    visible: false,
    userPaused: reducedMotionQuery.matches,
    lastTimestamp: 0,
    accumulator: 0,
    endHold: 0,
    animationId: 0,
    viewport: { ...INITIAL_VIEWPORT } as PoseViewport,
    shadow: options.shadow ?? null,
  };

  const currentSequence = (): PoseSequence => data.sequences[state.sequenceIndex];
  const currentFps = () => currentSequence().fps ?? data.fps;
  const currentAspect = () => currentSequence().sourceAspectRatio ?? data.sourceAspectRatio;
  const project = (point: PosePoint | null | undefined): CanvasPoint | null =>
    mapPoint(point, state.viewport, currentAspect());

  function drawPath(points: (PosePoint | null)[], color: string, width: number, dashed?: number[]): void {
    context.save();
    if (dashed) context.setLineDash(dashed);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    let connected = false;
    points.forEach(point => {
      const mapped = project(point);
      if (!mapped) { connected = false; return; }
      if (connected) context.lineTo(mapped.x, mapped.y);
      else context.moveTo(mapped.x, mapped.y);
      connected = true;
    });
    context.stroke();
    context.restore();
  }

  /** The recorded-movement trail: each segment brighter than the one before it; gaps stay open. */
  function drawFadingPath(points: (PosePoint | null)[], color: string, width: number): void {
    context.save();
    for (let index = 1; index < points.length; index += 1) {
      if (!points[index - 1] || !points[index]) continue;
      context.globalAlpha = .12 + .88 * index / Math.max(1, points.length - 1);
      drawPath([points[index - 1], points[index]], color, width);
    }
    context.restore();
  }

  /**
   * The sequence's scene, drawn first: the ground line, a measured distance along the ground
   * (dashed, with its length) and each ArUco marker, as the recorded-movement demo draws them.
   */
  function drawCalibration(sequence: PoseSequence): void {
    const calibration = sequence.calibration;
    if (!calibration) return;
    if (calibration.ground) drawPath([calibration.ground.start, calibration.ground.end], "#71d39b8c", 1.5);
    const baseline = calibration.baseline;
    if (baseline && Number.isFinite(baseline.distanceMeters) && baseline.distanceMeters! > 0) {
      const start = project(baseline.start), end = project(baseline.end);
      if (start && end) {
        drawPath([baseline.start, baseline.end], "#b7f34a55", 1, [3, 4]);
        context.save();
        context.fillStyle = "#a4bd99";
        context.font = "500 10px 'IBM Plex Mono', monospace";
        context.textAlign = "center";
        context.fillText(`${(baseline.distanceMeters! / .3048).toFixed(1)} ft`, (start.x + end.x) / 2, (start.y + end.y) / 2 + 14);
        context.restore();
      }
    }
    calibration.markers.forEach(marker => {
      if (marker.corners.length !== 4) return;
      const corners = marker.corners.map(project);
      if (corners.some(corner => !corner)) return;
      const points = corners as CanvasPoint[];
      context.save();
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(point => context.lineTo(point.x, point.y));
      context.closePath();
      context.fillStyle = "#061810bf";
      context.fill();
      context.strokeStyle = "#b7f34a";
      context.lineWidth = 1.25;
      context.stroke();
      points.forEach(point => { context.fillStyle = "#d9f5be"; context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3); });
      context.restore();
    });
  }

  /** The shadow, under everything the current sequence draws: a wide grey skeleton or centre line. */
  function drawShadow(): void {
    const shadow = state.shadow;
    const index = shadow?.frameFor(state.frame);
    if (!shadow || index === null || index === undefined) return;
    const sequence = shadow.sequence;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    if (sequence.centerLine) {
      // Where the shadow has run so far, then the shadow itself as a line as tall as its body.
      drawPath(sequence.centerLine.slice(0, index + 1).map(centerLinePoint), "#8fa39b40", 1.5);
      const line = sequence.centerLine[index];
      if (line) drawPath([[line.x, line.top], [line.x, line.bottom]], "#8fa39b80", 7);
    } else {
      const frame = sequence.frames[index] || [];
      context.globalAlpha = .55;
      context.strokeStyle = SHADOW_COLOR;
      context.lineWidth = options.recordedLook ? 5 : 7;
      context.beginPath();
      MEDIAPIPE33_EDGES.forEach(([firstIndex, secondIndex]) => {
        const first = project(validPoint(frame, firstIndex));
        const second = project(validPoint(frame, secondIndex));
        if (!first || !second) return;
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
      });
      context.stroke();
    }
    context.restore();
  }

  /**
   * A rep recorded without pose: the run so far as a path coloured by phase, the athlete as one
   * vertical line as tall as the tracked body, and the body's centre as a dot in the phase colour.
   */
  function drawCenterLineOverlay(sequence: PoseSequence): void {
    const lines = sequence.centerLine;
    if (!lines) return;
    let run: PosePoint[] = [], color = "";
    for (let index = 0; index <= Math.min(state.frame, lines.length - 1); index += 1) {
      const point = centerLinePoint(lines[index]);
      if (!point) { if (run.length > 1) drawPath(run, color, 2.5); run = []; continue; }
      const phaseColor = phaseForFrame(sequence, index).color;
      if (phaseColor !== color && run.length) {
        if (run.length > 1) drawPath(run, color, 2.5);
        run = [run[run.length - 1]];
      }
      color = phaseColor;
      run.push(point);
    }
    if (run.length > 1) drawPath(run, color, 2.5);
    const line = lines[state.frame];
    const top = line && project([line.x, line.top]), bottom = line && project([line.x, line.bottom]);
    const center = project(centerLinePoint(line));
    if (!line || !top || !bottom || !center) return;
    context.save();
    context.lineCap = "round";
    context.strokeStyle = "#edf6e8";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(top.x, top.y);
    context.lineTo(bottom.x, bottom.y);
    context.stroke();
    [top, bottom].forEach(end => {
      context.fillStyle = "#b7f34a";
      context.beginPath();
      context.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
      context.fill();
    });
    context.fillStyle = phaseForFrame(sequence, state.frame).color;
    context.beginPath();
    context.arc(center.x, center.y, 4.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#fff";
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  function drawBroadJumpOverlay(sequence: PoseSequence): void {
    const overlay = sequence.overlays;
    if (!overlay) return;
    const groundStart = project([0, overlay.groundY]);
    const groundEnd = project([1, overlay.groundY]);
    if (!groundStart || !groundEnd) return;
    // A sequence whose scene already drew the ground (drawCalibration) keeps that line visible.
    if (!sequence.calibration?.ground) {
      context.save();
      context.strokeStyle = "rgba(0,0,0,.75)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(groundStart.x, groundStart.y);
      context.lineTo(groundEnd.x, groundEnd.y);
      context.stroke();
      context.restore();
    }

    ([[overlay.takeoffX, "#71d39b"], [overlay.landingX, "#ff7d7d"]] as const).forEach(([x, color]) => {
      const bottom = project([x, 1]);
      drawPath([[x, 0], [x, 1]], color, 2, [7, 5]);
      if (!bottom) return;
      context.save();
      context.fillStyle = color;
      context.beginPath();
      context.arc(bottom.x, bottom.y, 3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });

    const trail = trailRange(state.frame);
    if (options.recordedLook) {
      drawFadingPath(overlay.com.slice(trail.start, trail.end), "#66d6e8", 2);
      drawFadingPath(overlay.foot.slice(trail.start, trail.end), "#ffad5c", 2);
    } else {
      drawPath(overlay.com.slice(trail.start, trail.end).filter(isPoint), "#66d6e8", 2);
      drawPath(overlay.foot.slice(trail.start, trail.end).filter(isPoint), "#ffad5c", 2);
    }

    ([[overlay.com[state.frame], "#66d6e8", 4], [overlay.foot[state.frame], "#ffad5c", 3.5]] as const).forEach(
      ([point, color, radius]) => {
        const mapped = project(point);
        if (!mapped) return;
        context.fillStyle = color;
        context.beginPath();
        context.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
        context.fill();
      },
    );

    const start = project([overlay.takeoffX, overlay.groundY]);
    const end = project([overlay.landingX, overlay.groundY]);
    if (!start || !end) return;
    const label = sequence.metrics[0][1];
    const centerX = (start.x + end.x) / 2;
    const labelY = broadJumpLabelY(state.viewport.offsetY, start.y);
    context.save();
    context.fillStyle = "rgba(0,0,0,.72)";
    context.fillRect(centerX - 33, labelY - 14, 66, 22);
    context.fillStyle = "#f7fbf9";
    context.font = "700 11px 'IBM Plex Mono', monospace";
    context.textAlign = "center";
    context.fillText(label, centerX, labelY + 1);
    context.restore();
  }

  function drawVerticalJumpOverlay(sequence: PoseSequence): void {
    const overlay = sequence.verticalJump;
    if (!overlay) return;
    const point = overlay.com[state.frame];
    const center = project(point);
    if (!point || !center) return;
    const baseline = project([point[0], overlay.baselineY])!;
    drawPath([[.12,overlay.groundY],[.88,overlay.groundY]], "#71d39b66", 1);
    drawPath([[.35,overlay.baselineY],[.72,overlay.baselineY]], "#66d6e855", 1, [4,4]);
    const trail = trailRange(state.frame);
    if (options.recordedLook) drawFadingPath(overlay.com.slice(trail.start,trail.end), "#66d6e8", 2);
    else drawPath(overlay.com.slice(trail.start,trail.end), "#66d6e8", 2);
    context.save();
    context.strokeStyle = "#66d6e8"; context.fillStyle = "#66d6e8"; context.lineWidth = 1.5;
    context.beginPath(); context.arc(center.x,center.y,4,0,Math.PI*2); context.fill();
    const x = center.x + 20;
    context.beginPath(); context.moveTo(x,baseline.y); context.lineTo(x,center.y);
    context.moveTo(x-4,baseline.y); context.lineTo(x+4,baseline.y);
    context.moveTo(x-4,center.y); context.lineTo(x+4,center.y); context.stroke();
    // A rep without a per-frame height (the phone publishes only the jump's height) shows the peak alone.
    const rise = overlay.heightMeters[state.frame];
    const label = Number.isFinite(rise) ? `COM rise ${(rise/.0254).toFixed(1)} in` : null;
    const peak = `Peak ${(overlay.peakMeters/.0254).toFixed(1)} in`;
    context.font = "600 10px 'IBM Plex Mono', monospace";
    const width = Math.max(label ? context.measureText(label).width : 0,context.measureText(peak).width)+16;
    const labelX = Math.max(8,Math.min(x+10,state.viewport.width-width-8));
    const labelY = Math.max(40,Math.min(center.y-14,state.viewport.height-72));
    context.fillStyle = "#071b16ee"; context.fillRect(labelX,labelY-15,width,label ? 38 : 23);
    if (label) { context.fillStyle = "#bdeff0"; context.fillText(label,labelX+8,labelY); }
    context.fillStyle = "#b7f34a"; context.fillText(peak,labelX+8,label ? labelY+15 : labelY);
    context.restore();
  }

  function drawChangeOfDirectionOverlay(sequence: PoseSequence): void {
    changeOfDirectionPhaseRanges(sequence).forEach(range => {
      const upper = Math.min(state.frame, range.end);
      if (upper < range.start) return;
      const centers: (PosePoint | null)[] = [];
      for (let index = range.start; index <= upper; index += 1) centers.push(hipCenter(sequence.frames[index]));
      drawPath(centers.filter(isPoint), range.color, 2.5);
    });
    const center = project(hipCenter(sequence.frames[state.frame]));
    if (!center) return;
    const phase = phaseForChangeOfDirection(sequence, state.frame);
    context.fillStyle = phase.color;
    context.beginPath();
    context.arc(center.x, center.y, 4.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#fff";
    context.lineWidth = 1;
    context.stroke();
  }

  /** The recorded-movement skeleton: 1.5 px limbs, 1 px hand and foot detail, nose and ear dots only. */
  function drawRecordedSkeleton(frame: PoseFrame): void {
    const points = frame.map(point => project(point));
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const detail of [false, true]) {
      context.beginPath();
      MEDIAPIPE33_EDGES.forEach(([from, to]) => {
        if ((isDetailLandmark(from) || isDetailLandmark(to)) !== detail) return;
        const start = points[from], end = points[to];
        if (!start || !end) return;
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
      });
      context.strokeStyle = detail ? "#aacbbb" : "#edf6e8";
      context.lineWidth = detail ? 1 : 1.5;
      context.stroke();
    }
    points.forEach((point, index) => {
      if (!point || (index < 11 && ![0, 7, 8].includes(index))) return;
      context.beginPath();
      context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
      context.fillStyle = index >= 11 && !isDetailLandmark(index) ? "#b7f34a" : index < 11 ? "#aacbbb" : "#dcebdc";
      context.fill();
    });
    context.restore();
  }

  function drawSkeleton(frame: PoseFrame): void {
    if (options.recordedLook) { drawRecordedSkeleton(frame); return; }
    context.save();
    context.strokeStyle = "rgba(247,251,249,.96)";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    MEDIAPIPE33_EDGES.forEach(([firstIndex, secondIndex]) => {
      const first = project(validPoint(frame, firstIndex));
      const second = project(validPoint(frame, secondIndex));
      if (!first || !second) return;
      context.moveTo(first.x, first.y);
      context.lineTo(second.x, second.y);
    });
    context.stroke();
    frame.forEach(point => {
      const mapped = project(point);
      if (!mapped) return;
      context.fillStyle = "#b7f34a";
      context.beginPath();
      context.arc(mapped.x, mapped.y, 1.5, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function updateDynamicLabels(sequence: PoseSequence): void {
    const elapsed = elapsedSeconds(state.frame, currentFps());
    const phase = phaseForFrame(sequence, state.frame);
    timer.textContent = timerText(state.frame, sequence, currentFps());
    phaseChip.textContent = phaseChipText(phase, elapsed);
    phaseChip.style.setProperty("--phase-color", phase.color);
    if (telemetryPhase && telemetryPhase.textContent !== phase.title) telemetryPhase.textContent = phase.title;
    scrubber.value = String(state.frame);
    scrubber.setAttribute("aria-valuetext", scrubberValueText(phase, elapsed));
  }

  function drawFrame(): void {
    const sequence = currentSequence();
    const frame = sequence.frames[state.frame] || sequence.frames[0];
    const view = state.viewport;
    context.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
    context.clearRect(0, 0, view.width, view.height);
    drawCalibration(sequence);
    drawShadow();
    if (sequence.key === "broadJump") drawBroadJumpOverlay(sequence);
    else if (sequence.key === "changeOfDirection") drawChangeOfDirectionOverlay(sequence);
    drawSkeleton(frame);
    if (sequence.verticalJump) drawVerticalJumpOverlay(sequence);
    drawCenterLineOverlay(sequence);
    if (sequence.ball) {
      const trail = trailRange(state.frame);
      const points = sequence.ball.slice(trail.start,trail.end).map(p=>p ? [p.x,p.y] : null);
      if (options.recordedLook) drawFadingPath(points, "#ffc969", 1.5);
      else drawPath(points, "#ffc969", 1.5);
    }
    const ball = sequence.ball?.[state.frame];
    if (ball) {
      const center = project([ball.x,ball.y]);
      if (center) {
        context.beginPath(); context.arc(center.x,center.y,Math.max(3,ball.radius*view.scale),0,Math.PI*2);
        context.fillStyle = "#b7f34a22"; context.fill(); context.strokeStyle = "#ffc969"; context.lineWidth = 1.5; context.stroke();
      }
    }
    updateDynamicLabels(sequence);
  }

  function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    state.viewport = options.fitRecording
      ? fitRecording(rect.width, rect.height, window.devicePixelRatio, recordingBounds(framingRecording(currentSequence(), state.shadow?.sequence), currentAspect()))
      : fitViewport(rect.width, rect.height, window.devicePixelRatio, currentAspect());
    const pixels = backingStoreSize(state.viewport);
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) {
      canvas.width = pixels.width;
      canvas.height = pixels.height;
    }
    drawFrame();
  }

  function updatePlayControl(): void {
    playIcon.dataset.playing = String(state.playing);
    playButton.setAttribute("aria-label", state.playing ? "Pause pose playback" : "Play pose playback");
    playButton.setAttribute("aria-pressed", String(state.playing));
  }

  function stopAnimation(): void {
    if (state.animationId) cancelAnimationFrame(state.animationId);
    state.animationId = 0;
    state.playing = false;
    state.lastTimestamp = 0;
    updatePlayControl();
  }

  function requestTick(): void {
    if (!state.animationId && state.playing && state.visible && !document.hidden) {
      state.animationId = requestAnimationFrame(tick);
    }
  }

  function startAnimation(): void {
    if (!state.visible || document.hidden) return;
    state.playing = true;
    state.lastTimestamp = 0;
    updatePlayControl();
    requestTick();
  }

  function selectSequence(index: number, autoplay: boolean): void {
    const nextIndex = wrapSequenceIndex(index, data.sequences.length);
    if (nextIndex !== state.sequenceIndex && !reducedMotionQuery.matches) {
      canvas.animate?.([{ opacity: .35, transform: "translateX(8px)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 260, easing: "ease-out" });
    }
    state.sequenceIndex = nextIndex;
    state.accumulator = 0;
    state.endHold = 0;
    const sequence = currentSequence();
    state.frame = restingFrame(sequence, reducedMotionQuery.matches, autoplay);
    // Legacy set `scrubber.max` here too. React also renders it from state, but
    // the imperative write lands before drawFrame() sets the value below, so a
    // reduced-motion resting frame beyond the previous max isn't clamped.
    scrubber.max = String(lastFrameIndex(sequence));
    // Title, label, metric grid, switcher state and telemetry flaps render from
    // React state (legacy rewrote those nodes here).
    onSequenceChange(state.sequenceIndex);
    resizeCanvas();
    if (autoplay) startAnimation();
  }

  function tick(timestamp: number): void {
    state.animationId = 0;
    if (!state.playing || !state.visible || document.hidden) return;
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const delta = frameDelta(timestamp, state.lastTimestamp);
    state.lastTimestamp = timestamp;
    const sequence = currentSequence();
    if (state.frame >= lastFrameIndex(sequence)) {
      state.endHold += delta;
      if (state.endHold >= END_HOLD_MS) selectSequence(state.sequenceIndex + (data.autoAdvance === false ? 0 : 1), false);
    } else {
      const next = advanceFrame(state.frame, state.accumulator, delta, currentFps(), lastFrameIndex(sequence));
      state.accumulator = next.accumulator;
      if (next.advanced) {
        state.frame = next.frame;
        drawFrame();
      }
    }
    requestTick();
  }

  const observer = new IntersectionObserver(
    entries => {
      state.visible = Boolean(entries[0]?.isIntersecting);
      if (!state.visible) {
        if (state.animationId) cancelAnimationFrame(state.animationId);
        state.animationId = 0;
        state.lastTimestamp = 0;
        return;
      }
      if (!state.userPaused) startAnimation();
    },
    { threshold: 0.2 },
  );
  observer.observe(canvas);

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      if (state.animationId) cancelAnimationFrame(state.animationId);
      state.animationId = 0;
      state.lastTimestamp = 0;
    } else if (!state.userPaused) {
      startAnimation();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const onMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    if (event.matches) {
      state.userPaused = true;
      stopAnimation();
    }
  };
  reducedMotionQuery.addEventListener?.("change", onMotionPreferenceChange);

  const resizeObserver = new ResizeObserver(() => resizeCanvas());
  resizeObserver.observe(canvas);
  selectSequence(0, false);
  resizeCanvas();

  return {
    togglePlay() {
      if (state.playing) {
        state.userPaused = true;
        stopAnimation();
        return;
      }
      if (state.frame >= lastFrameIndex(currentSequence())) state.frame = 0;
      state.userPaused = false;
      state.endHold = 0;
      drawFrame();
      startAnimation();
    },
    scrub(value: string) {
      state.userPaused = true;
      stopAnimation();
      state.frame = clampFrame(value, lastFrameIndex(currentSequence()));
      drawFrame();
    },
    selectDrill(key: string) {
      const index = data.sequences.findIndex(sequence => sequence.key === key);
      if (index < 0) return;
      stopAnimation();
      state.userPaused = reducedMotionQuery.matches;
      selectSequence(index, !state.userPaused);
    },
    stepSequence(direction) {
      stopAnimation();
      selectSequence(state.sequenceIndex + direction, !state.userPaused);
    },
    setShadow(shadow) {
      state.shadow = shadow;
      resizeCanvas();
    },
    destroy() {
      if (state.animationId) cancelAnimationFrame(state.animationId);
      state.animationId = 0;
      state.playing = false;
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.removeEventListener?.("change", onMotionPreferenceChange);
    },
  };
}

export interface PoseDemoRefs {
  canvas: RefObject<HTMLCanvasElement | null>;
  playButton: RefObject<HTMLButtonElement | null>;
  playIcon: RefObject<HTMLSpanElement | null>;
  scrubber: RefObject<HTMLInputElement | null>;
  timer: RefObject<HTMLElement | null>;
  phaseChip: RefObject<HTMLSpanElement | null>;
  telemetryPhase: RefObject<HTMLElement | null>;
}

/**
 * Mounts the controller against the page's ref'd elements (one ref per legacy
 * element id) and mirrors the current sequence index into React state.
 */
export function usePoseDemo(data: PoseDemoData, refs: PoseDemoRefs) {
  const { canvas, playButton, playIcon, scrubber, timer, phaseChip, telemetryPhase } = refs;
  const controllerRef = useRef<PoseDemoController | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);

  useEffect(() => {
    const canvasElement = canvas.current;
    const playButtonElement = playButton.current;
    const playIconElement = playIcon.current;
    const scrubberElement = scrubber.current;
    const timerElement = timer.current;
    const phaseChipElement = phaseChip.current;
    if (
      !canvasElement || !playButtonElement || !playIconElement || !scrubberElement || !timerElement || !phaseChipElement
    ) {
      return;
    }
    const controller = createPoseDemoController(
      data,
      {
        canvas: canvasElement,
        playButton: playButtonElement,
        playIcon: playIconElement,
        scrubber: scrubberElement,
        timer: timerElement,
        phaseChip: phaseChipElement,
        telemetryPhase: telemetryPhase.current,
      },
      setSequenceIndex,
    );
    if (!controller) return;
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [data, canvas, playButton, playIcon, scrubber, timer, phaseChip, telemetryPhase]);

  return {
    sequenceIndex,
    togglePlay: () => controllerRef.current?.togglePlay(),
    scrub: (event: FormEvent<HTMLInputElement>) => controllerRef.current?.scrub(event.currentTarget.value),
    selectDrill: (key: string) => controllerRef.current?.selectDrill(key),
    stepSequence: (direction: -1 | 1) => controllerRef.current?.stepSequence(direction),
  };
}
