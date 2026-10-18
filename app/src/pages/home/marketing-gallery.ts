const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
const SCROLL_CONTROL = "input,textarea,select,button,[role=slider],[role=tab],[contenteditable=true]";

/** A slow relative drift; paused interaction never accumulates a later catch-up. */
export function attachMarketingGalleryMotion(node: HTMLElement) {
  const wide = matchMedia("(min-width: 1100px)");
  const desktop = matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const cards = Array.from(node.querySelectorAll<HTMLElement>(":scope > section"));
  let frame = 0, layoutFrame = 0, drift = 0, lastScroll = window.scrollY, disposed = false;
  let visible = false, blurred = false, navigationLocked = Boolean(location.hash);
  let navigationScrolling = navigationLocked, navigationTimer = 0, pendingHashLayout = false, pendingFragmentShift = 0;
  let hovered: HTMLElement | null = null;
  let fragmentAnchor: HTMLElement | null = null, fragmentDocumentTop: number | null = null;

  const hashTarget = () => {
    if (!location.hash) return null;
    try {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      return target && node.contains(target) ? target : null;
    } catch { return null; }
  };
  const finishNavigation = () => {
    // Ordinary scrollend can precede draw's RAF; do not consume its pending delta.
    if (!navigationScrolling) return;
    clearTimeout(navigationTimer); navigationScrolling = false;
    if (navigationLocked && !document.hidden) {
      const target = hashTarget();
      if (target) {
        // Initial grid enhancement has no prior geometry and needs canonical
        // alignment. Later measured reflow preserves the native/history offset.
        const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        const shift = pendingHashLayout ? target.getBoundingClientRect().top - margin : pendingFragmentShift;
        if (Math.abs(shift) > .5) window.scrollBy({ top: shift, behavior: "instant" });
      }
    }
    pendingHashLayout = false; pendingFragmentShift = 0;
    lastScroll = window.scrollY;
  };
  const waitForNavigation = () => {
    clearTimeout(navigationTimer);
    // scrollend is preferred; the bounded idle fallback also covers old engines
    // and a same-fragment activation that produces no scroll event.
    navigationTimer = window.setTimeout(finishNavigation, 180);
  };

  const status = () => {
    if (!desktop.matches || reduced.matches) return "static";
    if (navigationLocked || hovered || node.contains(document.activeElement)) return "locked";
    if (!visible || document.hidden || blurred) return "paused";
    return "active";
  };
  const pause = () => {
    if (disposed) return;
    cancelAnimationFrame(frame); frame = 0;
    lastScroll = window.scrollY;
    node.dataset.galleryMotion = status();
  };
  const draw = () => {
    frame = 0;
    const state = status();
    node.dataset.galleryMotion = state;
    const current = window.scrollY;
    if (state === "active") {
      drift = Math.max(-160, Math.min(0, drift - (current - lastScroll) * .04));
      node.style.setProperty("--gallery-drift", `${drift.toFixed(2)}px`);
      // The HUD must sample the final visual position even if its scroll RAF ran first.
      node.dispatchEvent(new Event("marketing-gallery-position", { bubbles: true }));
    }
    lastScroll = current;
  };
  const scroll = () => {
    if (navigationScrolling) waitForNavigation();
    if (status() !== "active") { pause(); return; }
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const lockNavigation = () => {
    navigationLocked = true; navigationScrolling = true; pendingHashLayout = false; pendingFragmentShift = 0;
    fragmentAnchor = hashTarget();
    fragmentDocumentTop = fragmentAnchor ? fragmentAnchor.getBoundingClientRect().top + window.scrollY : null;
    waitForNavigation(); pause();
  };
  const navigation = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const destination = new URL(anchor.href, location.href);
    if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search && destination.hash) lockNavigation();
  };
  const scrollIntent = (event: Event) => {
    if (event instanceof KeyboardEvent && (!SCROLL_KEYS.has(event.key) || (event.target instanceof Element && event.target.closest(SCROLL_CONTROL)))) return;
    if (!navigationLocked) return;
    navigationLocked = false; navigationScrolling = false; pendingHashLayout = false; pendingFragmentShift = 0; clearTimeout(navigationTimer);
    fragmentAnchor = null; fragmentDocumentTop = null;
    pause();
  };
  const pointerDown = (event: PointerEvent) => { scrollIntent(event); pause(); };
  const focusIn = (event: FocusEvent) => {
    // A chapter heading receives focus after native navigation. Only actual
    // controls take over from that landing; do not release it for the heading.
    if (event.target instanceof Element && event.target.closest(`a[href],${SCROLL_CONTROL},[role=button]`)) scrollIntent(event);
    pause();
  };
  const enter = (event: PointerEvent) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    hovered = event.currentTarget as HTMLElement;
    pause();
  };
  const leave = (event: PointerEvent) => {
    if (hovered === event.currentTarget) hovered = null;
    pause();
  };
  const focusOut = (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    // During focusout activeElement may still be the old control. Read it after
    // the native focus move; this does not change the offset or move focus.
    queueMicrotask(pause);
  };
  const preference = () => {
    if (!desktop.matches || reduced.matches) {
      drift = 0;
      node.style.setProperty("--gallery-drift", "0px");
    }
    pause();
  };
  const layout = () => {
    layoutFrame = 0;
    if (disposed) return;
    // Keep the reader's current card/control in place when a lazy demo changes
    // height. Initial top-of-page hydration must not initiate scrolling.
    const focused = document.activeElement instanceof HTMLElement && node.contains(document.activeElement) ? document.activeElement : null;
    const fragment = navigationLocked ? hashTarget() : null;
    const previousFragmentTop = fragment === fragmentAnchor ? fragmentDocumentTop : null;
    const anchor = fragment || focused || cards.find(card => { const box = card.getBoundingClientRect(); return box.bottom > 100 && box.top < window.innerHeight; });
    const before = window.scrollY > 0 && anchor ? anchor.getBoundingClientRect().top : null;
    let changed = false;
    if (wide.matches && resizeObserver) {
      if (node.dataset.galleryLayout !== "masonry") { node.dataset.galleryLayout = "masonry"; changed = true; }
      // This inert probe resolves the parent's CSS clamp/viewport units to px.
      const gap = node.querySelector<HTMLElement>("[data-gallery-gap]")?.offsetHeight || 0;
      cards.forEach(card => {
        const style = getComputedStyle(card);
        const height = card.offsetHeight + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
        const span = `span ${Math.max(1, Math.ceil(height + gap))}`;
        if (card.style.gridRowEnd !== span) { card.style.gridRowEnd = span; changed = true; }
      });
    } else {
      if (node.dataset.galleryLayout) { delete node.dataset.galleryLayout; changed = true; }
      cards.forEach(card => { if (card.style.gridRowEnd) { card.style.removeProperty("grid-row-end"); changed = true; } });
    }
    // A mobile card reflows naturally before ResizeObserver runs, without any
    // grid span changing. Retain document-space geometry so a late demo/font
    // load preserves the native/history landing rather than sampling it too late.
    const nextFragmentTop = fragment ? fragment.getBoundingClientRect().top + window.scrollY : null;
    const fragmentShift = previousFragmentTop !== null && nextFragmentTop !== null ? nextFragmentTop - previousFragmentTop : 0;
    const fragmentMoved = Math.abs(fragmentShift) > .5;
    if (changed || fragmentMoved) {
      if (fragmentMoved) {
        if (navigationScrolling) pendingFragmentShift += fragmentShift;
        else window.scrollBy({ top: fragmentShift, behavior: "instant" });
      }
      else if (before !== null && anchor) {
        if (navigationScrolling) {
          if (fragment && previousFragmentTop === null) pendingHashLayout = true;
        }
        else {
          const shift = anchor.getBoundingClientRect().top - before;
          if (Math.abs(shift) > .5) window.scrollBy({ top: shift, behavior: "instant" });
        }
      }
      pause();
      node.dispatchEvent(new Event("marketing-gallery-position", { bubbles: true }));
    }
    fragmentAnchor = fragment; fragmentDocumentTop = nextFragmentTop;
  };
  const scheduleLayout = () => { if (!layoutFrame) layoutFrame = requestAnimationFrame(layout); };
  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleLayout) : null;
  layout();
  cards.forEach(card => resizeObserver?.observe(card));
  const gapProbe = node.querySelector<HTMLElement>("[data-gallery-gap]");
  if (gapProbe) resizeObserver?.observe(gapProbe);
  const blur = () => { blurred = true; pause(); };
  const focus = () => { blurred = false; pause(); };
  const observer = "IntersectionObserver" in window ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    pause();
  }) : null;
  observer?.observe(node);
  preference();

  cards.forEach(card => { card.addEventListener("pointerenter", enter); card.addEventListener("pointerleave", leave); });
  node.addEventListener("pointerdown", pointerDown, true);
  node.addEventListener("focusin", focusIn);
  node.addEventListener("focusout", focusOut);
  document.addEventListener("click", navigation, true);
  document.addEventListener("visibilitychange", pause);
  window.addEventListener("hashchange", lockNavigation);
  window.addEventListener("popstate", lockNavigation);
  window.addEventListener("pageshow", lockNavigation);
  window.addEventListener("wheel", scrollIntent, { passive: true });
  window.addEventListener("touchmove", scrollIntent, { passive: true });
  window.addEventListener("keydown", scrollIntent);
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("scrollend", finishNavigation);
  window.addEventListener("resize", preference);
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  desktop.addEventListener("change", preference);
  reduced.addEventListener("change", preference);
  wide.addEventListener("change", scheduleLayout);
  if (navigationScrolling) waitForNavigation();
  return () => {
    disposed = true;
    observer?.disconnect(); resizeObserver?.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); clearTimeout(navigationTimer);
    cards.forEach(card => { card.removeEventListener("pointerenter", enter); card.removeEventListener("pointerleave", leave); });
    node.removeEventListener("pointerdown", pointerDown, true);
    node.removeEventListener("focusin", focusIn); node.removeEventListener("focusout", focusOut);
    document.removeEventListener("click", navigation, true); document.removeEventListener("visibilitychange", pause);
    window.removeEventListener("hashchange", lockNavigation); window.removeEventListener("popstate", lockNavigation); window.removeEventListener("pageshow", lockNavigation);
    window.removeEventListener("wheel", scrollIntent); window.removeEventListener("touchmove", scrollIntent); window.removeEventListener("keydown", scrollIntent);
    window.removeEventListener("scroll", scroll); window.removeEventListener("resize", preference); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus);
    window.removeEventListener("scrollend", finishNavigation);
    window.removeEventListener("resize", scheduleLayout);
    desktop.removeEventListener("change", preference); reduced.removeEventListener("change", preference);
    wide.removeEventListener("change", scheduleLayout);
    cards.forEach(card => card.style.removeProperty("grid-row-end"));
    node.style.removeProperty("--gallery-drift"); delete node.dataset.galleryMotion; delete node.dataset.galleryLayout;
  };
}

