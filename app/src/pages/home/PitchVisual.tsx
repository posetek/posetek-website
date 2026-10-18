import { useEffect, useRef, useState } from "react";
import { HERO_POSES, HERO_HOLD_MS, heroPose, nextHeroPose, shouldAnimateHero, type HeroLayer, type HeroPoseId, type OrbitAction } from "./latest-hero/pose-model";
import { PoseFallback } from "./latest-hero/PoseFallback";
import { createWorkerRenderer } from "./marketing-renderer/adapter";
import { navigationIsClosed, subscribeNavigation, type HeroView, type RendererState } from "./marketing-renderer/protocol";
import "./latest-hero/hero-viewer.css";

export function PitchVisual() {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handle = useRef<ReturnType<typeof createWorkerRenderer> | null>(null);
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [selected, setSelected] = useState<HeroPoseId>("shooting");
  const layer: HeroLayer = "skeleton";
  const cycling = true;
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rendererState, setRendererState] = useState<RendererState>("queued");
  const rotating = shouldAnimateHero(active, cycling, reducedMotion, interacting);
  const view = useRef<HeroView>({ kind: "hero", pose: selected, layer, reducedMotion, rotating: false, command: 0, action: "reset" });
  const pose = heroPose(selected);

  const interactionStart = () => { clearTimeout(interactionTimer.current); setInteracting(true); };
  const interactionEnd = () => {
    clearTimeout(interactionTimer.current);
    interactionTimer.current = setTimeout(() => setInteracting(false), 1500);
  };
  const command = (action: OrbitAction) => {
    interactionStart();
    view.current = { ...view.current, rotating: false, command: view.current.command + 1, action };
    handle.current?.update(view.current);
    interactionEnd();
  };
  const selectPose = (id: HeroPoseId) => { interactionStart(); setSelected(id); interactionEnd(); };

  useEffect(() => {
    view.current = { ...view.current, pose: selected, layer, reducedMotion, rotating };
    handle.current?.update(view.current);
  }, [selected, layer, reducedMotion, rotating]);

  useEffect(() => {
    if (!rotating || failed || !ready) return;
    const timer = setTimeout(() => setSelected(nextHeroPose(selected)), HERO_HOLD_MS);
    return () => clearTimeout(timer);
  }, [rotating, selected, failed, ready]);

  useEffect(() => {
    const wrapper = wrapperRef.current, host = hostRef.current;
    const explorer = host?.parentElement;
    if (!wrapper || !host || !explorer || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false, eligible = false, initialized = false;
    let pointer: number | null = null, previousX = 0, previousY = 0, deltaX = 0, deltaY = 0, dragFrame = 0;
    const renderer = createWorkerRenderer(host, view.current, {
      state(state, reason) {
        setRendererState(state);
        if (reason) { initialized = false; setReady(false); setFailed(true); wrapper.dataset.rendererFailure = reason; }
      },
      ready() { initialized = true; setReady(true); wrapper.dataset.rendererGpu = host.dataset.rendererGpu; },
      frame(telemetry) {
        wrapper.dataset.rendererFrames = String(telemetry.frames);
        if (telemetry.angle !== undefined) wrapper.dataset.orbitAngle = telemetry.angle.toFixed(3);
        if (telemetry.position && telemetry.target) view.current = { ...view.current, camera: { position: telemetry.position, target: telemetry.target } };
      },
    });
    handle.current = renderer;
    const end = () => {
      if (pointer === null) return;
      const released = pointer; pointer = null;
      if (explorer.hasPointerCapture(released)) explorer.releasePointerCapture(released);
      cancelAnimationFrame(dragFrame); dragFrame = 0; deltaX = deltaY = 0;
      interactionEnd();
    };
    const update = () => {
      eligible = visible && !document.hidden && navigationIsClosed();
      setActive(eligible); renderer.setActive(eligible);
      if (!eligible) end();
    };
    const updateMotion = () => setReducedMotion(motion.matches);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: .05 });
    observer.observe(wrapper);
    const down = (event: PointerEvent) => {
      if (!initialized || !eligible || pointer !== null || event.button !== 0 || !event.isPrimary) return;
      pointer = event.pointerId; previousX = event.clientX; previousY = event.clientY;
      explorer.setPointerCapture(pointer);
      interactionStart(); view.current = { ...view.current, rotating: false }; renderer.update(view.current);
    };
    const move = (event: PointerEvent) => {
      if (pointer !== event.pointerId || !eligible) return;
      deltaX += event.clientX - previousX; deltaY += event.clientY - previousY;
      previousX = event.clientX; previousY = event.clientY;
      if (!dragFrame) dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        const height = Math.max(1, explorer.clientHeight);
        renderer.orbit(deltaX / height, deltaY / height); deltaX = deltaY = 0;
      });
    };
    explorer.addEventListener("pointerdown", down); explorer.addEventListener("pointermove", move);
    explorer.addEventListener("pointerup", end); explorer.addEventListener("pointercancel", end); explorer.addEventListener("lostpointercapture", end);
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("blur", end);
    const unsubscribe = subscribeNavigation(update);
    update();
    return () => {
      observer.disconnect(); unsubscribe(); motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", update); clearTimeout(interactionTimer.current);
      window.removeEventListener("blur", end);
      explorer.removeEventListener("pointerdown", down); explorer.removeEventListener("pointermove", move);
      explorer.removeEventListener("pointerup", end); explorer.removeEventListener("pointercancel", end); explorer.removeEventListener("lostpointercapture", end);
      cancelAnimationFrame(dragFrame); renderer.destroy(); handle.current = null;
    };
  }, []);

  return <div ref={wrapperRef} className="pitch-visual hero-pose-viewer" data-renderer={ready ? "webgl" : "static"} data-renderer-owner="worker" data-renderer-state={rendererState} data-pose={selected} data-layer={layer} data-rotating={rotating && ready}>
    <div className="hero-viewer-heading"><span><i aria-hidden="true" />Movement in 3D</span><span className="hero-viewer-count">0{HERO_POSES.findIndex(item => item.id === selected) + 1}<span> / 03</span></span></div>
    <div className="hero-pose-caption" aria-live={cycling && !reducedMotion ? "off" : "polite"}><strong>{pose.label}</strong><span>{pose.detail}</span></div>
    <div className="pose-explorer" role="group" aria-label={`${ready ? 'Interactive' : 'Static'} reconstructed ${pose.label.toLowerCase()} pose`} aria-describedby="pose-explorer-help" tabIndex={0}
      onKeyDown={event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const keys: Record<string, OrbitAction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Home: "reset" };
        if (ready && keys[event.key]) { event.preventDefault(); command(keys[event.key]); }
      }}>
      <PoseFallback pose={pose} layer={layer} />
      <div ref={hostRef} className="pitch-scene" aria-hidden="true" />
    </div>
    <div className="hero-view-tools"><span className="hero-orbit-hint"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="m18 5 4 6-6 1M5 8l-3 3"/></svg>{ready ? 'Drag to rotate' : 'Static preview'}</span></div>
    <div className="hero-pose-controls">
      <div className="hero-pose-choices" role="group" aria-label="Choose a 3D pose">{HERO_POSES.map((item, index) => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => selectPose(item.id)}><span aria-hidden="true">0{index + 1}</span><span>{item.label}</span><i aria-hidden="true" /></button>)}</div>

    </div>
    <span className="pose-explorer-help" id="pose-explorer-help"><span>{ready ? "Arrow keys rotate · Home resets" : "Select a pose to explore"}</span><span>Recorded landmarks · Estimated depth</span></span>
  </div>;
}
