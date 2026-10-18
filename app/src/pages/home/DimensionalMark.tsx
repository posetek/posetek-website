import { useEffect, useId, useRef, useState } from "react";
import approvedBadge from "../../../astro/public/brand/posetek-p.svg?raw";
import { createWorkerRenderer } from "./marketing-renderer/adapter";
import { navigationIsClosed, subscribeNavigation, type BrandView, type RendererState } from "./marketing-renderer/protocol";

const approvedPath = approvedBadge.match(/<path\b[^>]*\bd="([^"]+)"/)?.[1] ?? "";

/** The approved SVG remains visible until a worker has completed a real frame. */
export function DimensionalMark() {
  const mount = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [state, setState] = useState<RendererState>("queued");
  const gradientId = useId();

  useEffect(() => {
    const element = mount.current;
    if (!element || !approvedPath || typeof IntersectionObserver === "undefined") return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const surface = element.closest(".marketing-footer") ?? element;
    const view: BrandView = { kind: "brand", x: 0, y: 0, rise: 0 };
    let visible = false, active = false, ready = false, frame = 0;
    const renderer = createWorkerRenderer(element, view, {
      state(next, reason) { setState(next); if (reason) { ready = false; setEnhanced(false); } },
      ready() { ready = true; setEnhanced(!motion.matches); },
      frame(telemetry) {
        element.dataset.markTiltX = (telemetry.tiltX ?? 0).toFixed(4);
        element.dataset.markTiltY = (telemetry.tiltY ?? 0).toFixed(4);
        element.dataset.markRise = (telemetry.rise ?? 0).toFixed(4);
        element.dataset.markMotion = telemetry.settling && active ? "settling" : "idle";
      },
    });
    const measure = () => {
      frame = 0;
      if (!active) return;
      const bounds = surface.getBoundingClientRect();
      view.rise = Math.max(0, Math.min(1, (innerHeight * .6 - bounds.top) / Math.max(1, bounds.height - innerHeight * .4)));
      renderer.update({ ...view });
    };
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(measure); };
    const update = () => {
      active = visible && !document.hidden && !motion.matches && navigationIsClosed();
      renderer.setActive(active); setEnhanced(ready && !motion.matches);
      if (active) schedule();
      else { cancelAnimationFrame(frame); frame = 0; view.x = view.y = 0; renderer.update({ ...view }); element.dataset.markMotion = "idle"; }
    };
    const resetPointer = () => { view.x = view.y = 0; schedule(); };
    const move = (event: Event) => {
      if (!(event instanceof PointerEvent) || event.pointerType === "touch" || !pointer.matches || !active) return;
      const bounds = surface.getBoundingClientRect();
      view.x = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      view.y = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)); schedule();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }); observer.observe(element);
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule); resize?.observe(surface);
    const unsubscribe = subscribeNavigation(update);
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", update); motion.addEventListener("change", update);
    pointer.addEventListener("change", resetPointer); window.addEventListener("blur", resetPointer);
    surface.addEventListener("pointermove", move); surface.addEventListener("pointerleave", resetPointer); surface.addEventListener("pointercancel", resetPointer);
    update();
    return () => {
      observer.disconnect(); resize?.disconnect(); unsubscribe(); cancelAnimationFrame(frame); renderer.destroy();
      window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", update); motion.removeEventListener("change", update);
      pointer.removeEventListener("change", resetPointer); window.removeEventListener("blur", resetPointer);
      surface.removeEventListener("pointermove", move); surface.removeEventListener("pointerleave", resetPointer); surface.removeEventListener("pointercancel", resetPointer);
    };
  }, []);

  return <div className="marketing-footer-mark" ref={mount} data-mark-state={enhanced ? "enhanced" : "static"} data-renderer-owner="worker" data-renderer-state={state} aria-hidden="true">
    <svg className="marketing-footer-mark-fallback" viewBox="0 0 1600 1750" focusable="false">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor="#8d9a90"/><stop offset="0.26" stopColor="#f0f1eb"/><stop offset="0.58" stopColor="#778a7e"/><stop offset="0.77" stopColor="#d8ded6"/><stop offset="1" stopColor="#adb9ad"/></linearGradient></defs>
      <path d={approvedPath} transform="translate(100 1640) scale(1 -1)" fill={`url(#${gradientId})`}/>
    </svg>
  </div>;
}
