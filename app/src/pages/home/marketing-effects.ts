import { useEffect, useRef, useState, type RefObject } from "react";

const reduceQuery = "(prefers-reduced-motion: reduce)";
const fineQuery = "(hover: hover) and (pointer: fine)";

/** Lain's media replay resets below the viewport; content passed above stays readable. */
export function useRepeatReveal(host: RefObject<HTMLDivElement | null>, kind: "heading" | "media") {
  const [revealing, setRevealing] = useState(false);
  const [cycle, setCycle] = useState(0);
  const finishRef = useRef<() => void>(() => {});
  useEffect(() => {
    const node = host.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const motion = matchMedia(reduceQuery);
    let timer = 0, animation: Animation | undefined, armed = true;
    const finish = () => {
      clearTimeout(timer); animation?.cancel(); animation = undefined;
      setRevealing(false); node.dataset.revealState = "visible";
    };
    finishRef.current = () => { armed = false; finish(); };
    const viewportObserver = new IntersectionObserver(([entry]) => {
      const bounds = entry.boundingClientRect;
      node.dataset.viewport = bounds.bottom <= 0 ? "above" : bounds.top >= innerHeight ? "below" : "inside";
      if (entry.isIntersecting) return;
      finish();
      if (bounds.top >= innerHeight && !node.contains(document.activeElement)) {
        armed = true;
        if (!motion.matches) node.dataset.revealState = "waiting";
      }
    });
    const enter = ([entry]: IntersectionObserverEntry[]) => {
      if (motion.matches || document.hidden) { finish(); return; }
      if (!entry.isIntersecting) return;
      if (!armed || node.contains(document.activeElement)) return;
      armed = false; node.dataset.revealState = "entering";
      if (kind === "media") { setCycle(value => value + 1); setRevealing(true); }
      else animation = node.animate([
        { clipPath: "inset(0 0 100% 0)", transform: "translateY(36px)" },
        { clipPath: "inset(0)", transform: "translateY(0)" },
      ], { duration: 760, easing: "cubic-bezier(.16,1,.3,1)" });
      timer = window.setTimeout(finish, kind === "media" ? 780 : 760);
    };
    // IntersectionObserver percentage margins use viewport width. Use pixels so
    // the entrance is 88% of viewport height at every screen aspect ratio.
    let entryObserver: IntersectionObserver;
    const observeEntry = () => {
      entryObserver?.disconnect();
      entryObserver = new IntersectionObserver(enter, { rootMargin: `0px 0px -${innerHeight * .12}px 0px`, threshold: 0 });
      entryObserver.observe(node);
    };
    viewportObserver.observe(node); observeEntry();
    const stop = () => { finish(); };
    motion.addEventListener("change", stop); document.addEventListener("visibilitychange", stop);
    window.addEventListener("resize", observeEntry);
    return () => { viewportObserver.disconnect(); entryObserver.disconnect(); clearTimeout(timer); animation?.cancel(); motion.removeEventListener("change", stop); document.removeEventListener("visibilitychange", stop); window.removeEventListener("resize", observeEntry); finishRef.current = () => {}; };
  }, [host, kind]);
  return { revealing, cycle, finish: () => finishRef.current() };
}

// Only pictures/charts move. Playback controls, text, ranges, tabs and live forms do not.
const artwork = ".pitch-scene,.session-video canvas,.radar-wrap > svg,.technique-stage,.coach-preview-pitch > svg,.cx-profile-radar > svg,svg.pd-pitch";
const controls = "a:not([data-preview-link]),button,input,select,textarea,[role=button],[role=slider],[role=tab],[tabindex]:not([tabindex='-1']),[contenteditable=true]";

/** Bounded tilt/zoom/blur on actual visual layers; all work is event driven and settles. */
export function usePreviewMotion(host: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const pointer = matchMedia(fineQuery), motion = matchMedia(reduceQuery);
    let frame = 0, settle = 0, active = false, pressed = false, visible = false;
    let x = 0, y = 0, scrollOffset = 0, lastScroll = scrollY;
    const pulses: Animation[] = [];
    const arts = () => Array.from(node.querySelectorAll<HTMLElement | SVGElement>(artwork));
    const isInteractive = (item: Element) => item.matches(controls) || !!item.querySelector(controls);
    const reset = () => {
      active = false; scrollOffset = 0; cancelAnimationFrame(frame); clearTimeout(settle); frame = 0;
      pulses.splice(0).forEach(animation => animation.cancel());
      node.dataset.previewActive = "false";
      for (const item of arts()) { item.style.removeProperty("transform"); item.style.removeProperty("filter"); }
      node.style.removeProperty("--preview-x"); node.style.removeProperty("--preview-y");
    };
    const allowed = () => pointer.matches && !motion.matches && !document.hidden && visible && !pressed && !node.contains(document.activeElement);
    const draw = () => {
      frame = 0;
      if (!allowed()) { reset(); return; }
      for (const item of arts()) {
        if (isInteractive(item)) { item.style.removeProperty("transform"); continue; }
        item.dataset.motionArt = "true";
        item.style.transform = `perspective(900px) translate3d(${active ? x * 5 : 0}px,${(active ? y * 5 : 0) + scrollOffset}px,0) rotateX(${active ? -y * 2 : 0}deg) rotateY(${active ? x * 3 : 0}deg) scale(${active ? 1.035 : 1})`;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const move = (event: PointerEvent) => {
      if (!allowed() || !(event.target instanceof Element) || event.target.closest(controls)) { if (active) reset(); return; }
      const bounds = node.getBoundingClientRect();
      x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      if (!active) {
        active = true; node.dataset.previewActive = "true";
        for (const item of arts().filter(item => !isInteractive(item))) pulses.push(item.animate([{ filter: "blur(0px)" }, { filter: "blur(3px)", offset: .23 }, { filter: "blur(0px)" }], { duration: 680, easing: "cubic-bezier(.22,1,.36,1)" }));
      }
      node.style.setProperty("--preview-x", `${(x + 1) * 50}%`); node.style.setProperty("--preview-y", `${(y + 1) * 50}%`);
      schedule();
    };
    const leave = () => { pressed = false; node.dataset.motionPaused = "false"; reset(); };
    const hold = () => { pressed = true; node.dataset.motionPaused = "true"; reset(); };
    const scroll = () => {
      const delta = scrollY - lastScroll; lastScroll = scrollY;
      if (!allowed() || innerWidth < 768 || node.contains(document.activeElement)) return;
      scrollOffset = Math.max(-9, Math.min(9, delta * -.12)); schedule();
      clearTimeout(settle); settle = window.setTimeout(() => { scrollOffset = 0; schedule(); }, 140);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) reset(); });
    observer.observe(node);
    node.addEventListener("pointermove", move); node.addEventListener("pointerleave", leave);
    node.addEventListener("pointerdown", hold, true); node.addEventListener("focusin", hold);
    node.addEventListener("focusout", leave);
    window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset); motion.addEventListener("change", reset); pointer.addEventListener("change", reset);
    return () => {
      observer.disconnect(); reset(); node.removeEventListener("pointermove", move); node.removeEventListener("pointerleave", leave);
      node.removeEventListener("pointerdown", hold, true); node.removeEventListener("focusin", hold); node.removeEventListener("focusout", leave);
      window.removeEventListener("scroll", scroll); window.removeEventListener("blur", reset); document.removeEventListener("visibilitychange", reset);
      motion.removeEventListener("change", reset); pointer.removeEventListener("change", reset);
    };
  }, [host]);
}
