import { createWorkerRenderer } from "./marketing-renderer/adapter";
import { GALLERY_TEXTURE_LIMIT, normalizedGalleryVelocity } from "./marketing-renderer/gallery-model";
import { createGalleryRevealProfiles, type GalleryRevealProfile } from "./marketing-renderer/gallery-reveal";
import { navigationIsClosed, subscribeNavigation, type GalleryCard, type GalleryView, type RendererTelemetry } from "./marketing-renderer/protocol";

type Frame = { element: HTMLElement; image: HTMLImageElement; card: GalleryCard };
type RevealState = { epoch: number; complete: boolean; below: boolean };

/** Progressive decorative rendering only. Native layout, fragments and demo controls stay DOM-owned. */
export function attachMarketingShowcaseMotion(root: HTMLElement): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const desktop = matchMedia("(min-width: 1024px)");
  const enhanced = () => !reduced.matches && fine.matches && desktop.matches;
  const overlay = document.createElement("div");
  overlay.dataset.showcaseOverlay = ""; overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, { position: "fixed", inset: "0", width: "100vw", height: `${innerHeight}px`, pointerEvents: "none", zIndex: "0", visibility: "hidden", overflow: "hidden" });
  // The ready frame becomes transparent above this layer; captions and hints keep
  // their ordinary DOM stacking order rather than being covered by a body canvas.
  root.prepend(overlay);
  let frames: Frame[] = [], revision = 0, scrollRevision = 0, pending = 0, layoutDirty = true;
  let disposed = false, active = false, ready = false, failed = false, focused = false;
  let lastScroll = scrollY, lastScrollTime = performance.now(), velocity = 0;
  let drawnScrollY = scrollY, drawnScrollX = scrollX, hovered: string | undefined;
  let pointerPosition: { x: number; y: number } | undefined;
  let initialHover = true;
  const reveals = new Map<string, RevealState>();
  let profiles: Map<string, GalleryRevealProfile> | undefined;
  let measuredWidth = 0, measuredHeight = 0;
  const observed = new Set<HTMLElement>();
  const initial: GalleryView = { kind: "gallery", revision, scrollRevision, width: innerWidth, height: innerHeight, scrollX, scrollY, velocity: 0, cards: [] };
  let latest = initial;

  const resetFrames = (state: "static" | "pending" | "failed") => { for (const frame of frames) frame.element.dataset.showcaseRenderer = state; };
  const showRevealState = (frame: Frame, drawing = false) => {
    const reveal = reveals.get(frame.card.id)!;
    frame.element.dataset.showcaseRevealEpoch = String(reveal.epoch);
    frame.element.dataset.showcaseReveal = reveal.complete ? "complete" : drawing ? "revealing" : "armed";
  };
  const compensateScroll = () => { overlay.style.transform = `translate3d(${drawnScrollX - scrollX}px, ${drawnScrollY - scrollY}px, 0)`; };
  const receiveFrame = (telemetry: RendererTelemetry) => {
    if (disposed || !active || !ready || telemetry.galleryRevision !== revision || !navigationIsClosed() || document.hidden || reduced.matches) return;
    drawnScrollY = telemetry.galleryScrollY ?? scrollY; drawnScrollX = telemetry.galleryScrollX ?? scrollX;
    compensateScroll();
    const reported = new Map(telemetry.galleryReveals?.map(reveal => [reveal.id, reveal]));
    const drawn = new Set(telemetry.galleryCards?.filter(id => reported.get(id)?.epoch === reveals.get(id)?.epoch)), broken = new Set(telemetry.galleryFailed);
    for (const frame of frames) {
      const id = frame.card.id;
      const reveal = reveals.get(id)!, report = reported.get(id);
      if (report?.epoch === reveal.epoch && report.complete) reveal.complete = true;
      frame.element.dataset.showcaseRenderer = broken.has(id) ? "failed" : drawn.has(id) ? "ready" : "static";
      showRevealState(frame, drawn.has(id));
    }
    overlay.dataset.galleryRevision = String(telemetry.galleryRevision);
    overlay.dataset.galleryBend = String(telemetry.bend ?? 0);
    overlay.dataset.galleryTextures = String(telemetry.galleryTextures ?? 0);
    overlay.dataset.galleryPending = JSON.stringify(telemetry.galleryPending ?? []);
    overlay.dataset.galleryCancelled = JSON.stringify(telemetry.galleryCancelled ?? []);
    overlay.style.visibility = drawn.size ? "visible" : "hidden";
  };
  const renderer = createWorkerRenderer(overlay, initial, {
    state(state) {
      if (disposed) return;
      if (state === "failed") { failed = true; active = false; overlay.style.visibility = "hidden"; resetFrames("failed"); }
      root.dataset.showcaseMotion = enhanced() ? state : "static";
    },
    ready() { ready = true; },
    frame: receiveFrame,
  });

  const measure = () => {
    layoutDirty = false;
    // All geometry reads precede presentation writes. Never measure the curved canvas.
    const measured: Frame[] = [];
    for (const element of root.querySelectorAll<HTMLElement>("[data-showcase-frame]")) {
      const image = element.querySelector<HTMLImageElement>("img[data-showcase-image], img");
      const id = element.dataset.showcaseFrame;
      if (!image || !id) continue;
      const rect = element.getBoundingClientRect();
      let src: URL;
      try { src = new URL(image.currentSrc || image.src, location.href); } catch { continue; }
      if (src.origin !== location.origin || !["https:", "http:"].includes(src.protocol)) continue;
      if (!reveals.has(id)) reveals.set(id, { epoch: 0, complete: rect.top + rect.height <= 0, below: rect.top >= innerHeight });
      const reveal = reveals.get(id)!;
      const previous = frames.find(frame => frame.element === element);
      measured.push({ element, image, card: { id, src: src.href, x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height, hovered: false, pointerX: previous?.card.pointerX ?? 0, pointerY: previous?.card.pointerY ?? 0, settled: reveal.complete, revealEpoch: reveal.epoch } });
    }
    if (!profiles && root.dataset.showcaseMotionPolicy === "fluid") {
      const seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 0x100000000);
      profiles = createGalleryRevealProfiles(measured.map(frame => frame.card.id), seed);
    }
    for (const frame of measured) {
      frame.card.revealProfile = profiles?.get(frame.card.id);
      if (frame.card.revealProfile) frame.element.dataset.showcaseRevealStyle = frame.card.revealProfile.pixels > 1 ? "accent" : "smooth";
    }
    const geometryChanged = measuredWidth !== innerWidth || measuredHeight !== innerHeight || measured.length !== frames.length || measured.some((frame, index) => {
      const before = frames[index];
      return !before || before.element !== frame.element || before.card.id !== frame.card.id ||
        (["x", "y", "width", "height"] as const).some(key => Math.abs(before.card[key] - frame.card[key]) > .1);
    });
    const changedSources = measured.filter((frame, index) => frame.card.src !== frames[index]?.card.src);
    // Image load and ResizeObserver notifications often repeat identical geometry.
    // Keeping its acknowledged frame prevents a sharp → pixelated flash on every load.
    if (!geometryChanged && !changedSources.length) return;
    revision += 1; root.dataset.showcaseRevision = String(revision);
    measuredWidth = innerWidth; measuredHeight = innerHeight;
    frames = measured;
    if (geometryChanged) {
      // A moved plane must receive a correctly aligned draw before replacing HTML.
      overlay.style.height = `${innerHeight}px`; overlay.style.visibility = "hidden"; resetFrames("static");
    } else {
      // A responsive image changing source does not move the other planes. Its
      // opaque HTML fallback covers only that old texture until the next draw.
      for (const frame of changedSources) frame.element.dataset.showcaseRenderer = "static";
    }
    for (const element of observed) if (!frames.some(frame => frame.element === element)) { observer?.unobserve(element); observed.delete(element); }
    for (const { element } of frames) if (!observed.has(element)) { observer?.observe(element); observed.add(element); }
  };
  const update = () => {
    pending = 0;
    if (disposed) return;
    if (layoutDirty) measure();
    for (const frame of frames) {
      const { card } = frame, reveal = reveals.get(card.id)!;
      const below = card.y >= scrollY + innerHeight;
      // Only a full exit below rearms. Passing above is permanently readable
      // for this traversal, even if its texture is evicted before reverse scroll.
      if (below && !reveal.below) { reveal.epoch += 1; reveal.complete = false; }
      if (card.y + card.height <= scrollY) reveal.complete = true;
      reveal.below = below; card.revealEpoch = reveal.epoch; card.settled = reveal.complete;
      showRevealState(frame);
    }
    const control = document.activeElement?.closest("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focused = !!control && root.contains(control) && control.matches(":focus-visible");
    const expanded = !!root.querySelector("[data-showcase-panel]:not([hidden])");
    // A pointer can become stationary before this decorative import resolves.
    // Native :hover supplies the current owner until real coordinates arrive;
    // never reconstruct hover after touch, window exit, or loss of focus.
    if (fine.matches && !expanded && !focused) updatePointer(pointerPosition ? document.elementFromPoint(pointerPosition.x, pointerPosition.y) : initialHover ? root.querySelector("[data-showcase-frame]:hover") : null);
    else hovered = undefined;
    const nearby = frames.filter(({ card }) => card.width > 0 && card.height > 0 && card.y + card.height > scrollY - 160 && card.y < scrollY + innerHeight + 160)
      .sort((a, b) => Math.abs(a.card.y + a.card.height / 2 - scrollY - innerHeight / 2) - Math.abs(b.card.y + b.card.height / 2 - scrollY - innerHeight / 2))
      .slice(0, GALLERY_TEXTURE_LIMIT);
    const visible = nearby.some(({ card }) => card.y + card.height > scrollY && card.y < scrollY + innerHeight);
    const nextActive = visible && !failed && !document.hidden && navigationIsClosed() && enhanced() && !focused && !expanded;
    latest = { kind: "gallery", revision, scrollRevision, width: innerWidth, height: innerHeight, scrollX, scrollY, velocity: nextActive ? velocity : 0,
      cards: nearby.map(({ card }) => ({ ...card, hovered: nextActive && fine.matches && card.id === hovered })) };
    renderer.update(latest);
    active = nextActive; renderer.setActive(active);
    if (!active) {
      hovered = undefined; velocity = 0; lastScroll = scrollY; lastScrollTime = performance.now();
      overlay.style.visibility = "hidden"; resetFrames(failed ? "failed" : "static");
      if (!enhanced()) root.dataset.showcaseMotion = "static";
    } else if (!ready) resetFrames("pending");
  };
  const queue = () => { if (!pending && !disposed) pending = requestAnimationFrame(update); };
  const invalidate = () => { layoutDirty = true; queue(); };
  const scroll = () => {
    const now = performance.now();
    velocity = normalizedGalleryVelocity(scrollY - lastScroll, now - lastScrollTime);
    lastScroll = scrollY; lastScrollTime = now; scrollRevision += 1;
    compensateScroll(); queue();
  };
  const suspend = () => {
    // Menu intent is synchronous; do not wait one animation frame to restore DOM artwork.
    if (document.hidden || !navigationIsClosed() || !enhanced()) {
      active = false; renderer.setActive(false); overlay.style.visibility = "hidden"; resetFrames("static"); hovered = undefined;
    }
    queue();
  };
  const updatePointer = (target: Element | null) => {
    const element = target?.closest<HTMLElement>("[data-showcase-frame]");
    const frame = frames.find(item => item.element === element);
    hovered = frame?.card.id;
    if (frame && pointerPosition) {
      frame.card.pointerX = Math.max(-1, Math.min(1, (pointerPosition.x + scrollX - frame.card.x) / frame.card.width * 2 - 1));
      frame.card.pointerY = Math.max(-1, Math.min(1, (pointerPosition.y + scrollY - frame.card.y) / frame.card.height * 2 - 1));
      frame.element.style.setProperty("--showcase-pointer-x", String(frame.card.pointerX));
      frame.element.style.setProperty("--showcase-pointer-y", String(frame.card.pointerY));
    }
  };
  const pointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") { clearPointer(); return; }
    if (!fine.matches) return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (event.buttons || !navigationIsClosed()) return;
    const previous = hovered;
    updatePointer(event.target as Element | null);
    // Remember coordinates over the hero/footer without starting a render loop.
    // Native scroll will hit-test them when a preview moves beneath the pointer.
    if (previous || hovered) queue();
  };
  const settle = (event: Event) => {
    hovered = undefined;
    const owner = (event.target as Element | null)?.closest<HTMLElement>("[data-showcase-frame], [data-showcase-chapter], [data-showcase-panel]");
    const id = owner?.dataset.showcaseFrame || owner?.dataset.showcaseChapter || owner?.dataset.showcasePanel;
    const reveal = id ? reveals.get(id) : undefined;
    if (reveal) reveal.complete = true;
    for (const frame of frames) showRevealState(frame);
    // The original sharp image is available on the first input without waiting
    // for a worker message or its next composited frame.
    active = false; renderer.setActive(false); revision += 1; root.dataset.showcaseRevision = String(revision);
    overlay.style.visibility = "hidden"; resetFrames("static"); queue();
  };
  const leaveGallery = () => { if (hovered) { hovered = undefined; queue(); } };
  const clearPointer = () => { const hadHover = !!hovered; hovered = undefined; pointerPosition = undefined; initialHover = false; if (hadHover) queue(); };
  const leaveWindow = (event: PointerEvent) => { if (!event.relatedTarget) clearPointer(); };
  const pointerDown = (event: PointerEvent) => { if (event.pointerType !== "mouse") clearPointer(); };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(invalidate);
  observer?.observe(root);
  const mutations = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(invalidate);
  mutations?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "src", "srcset"] });
  const unsubscribeNavigation = subscribeNavigation(suspend);
  window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", invalidate);
  window.addEventListener("blur", clearPointer); window.addEventListener("pointermove", pointer, { passive: true });
  window.addEventListener("pointerout", leaveWindow); window.addEventListener("pointerdown", pointerDown, { passive: true });
  window.addEventListener("marketing-gallery-position", invalidate);
  document.addEventListener("visibilitychange", suspend);
  reduced.addEventListener("change", suspend); fine.addEventListener("change", suspend); desktop.addEventListener("change", suspend);
  root.addEventListener("pointerleave", leaveGallery);
  root.addEventListener("pointerdown", settle); root.addEventListener("focusin", settle); root.addEventListener("focusout", queue);
  root.addEventListener("load", invalidate, true);
  queue();
  return () => {
    disposed = true; cancelAnimationFrame(pending); unsubscribeNavigation(); observer?.disconnect(); mutations?.disconnect();
    window.removeEventListener("scroll", scroll); window.removeEventListener("resize", invalidate); window.removeEventListener("marketing-gallery-position", invalidate);
    window.removeEventListener("blur", clearPointer); window.removeEventListener("pointermove", pointer);
    window.removeEventListener("pointerout", leaveWindow); window.removeEventListener("pointerdown", pointerDown);
    document.removeEventListener("visibilitychange", suspend); reduced.removeEventListener("change", suspend); fine.removeEventListener("change", suspend); desktop.removeEventListener("change", suspend);
    root.removeEventListener("pointerleave", leaveGallery); root.removeEventListener("pointerdown", settle);
    root.removeEventListener("focusin", settle); root.removeEventListener("focusout", queue); root.removeEventListener("load", invalidate, true);
    resetFrames("static"); renderer.destroy(); overlay.remove(); root.dataset.showcaseMotion = "static";
  };
}
