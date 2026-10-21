const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
const SCROLL_CONTROL = "input,textarea,select,button,[role=slider],[role=tab],[contenteditable=true]";

/** Keep native fragment/history landings stable as mounted chapters finish loading. */
export function attachMarketingGalleryMotion(node: HTMLElement) {
  const cards = Array.from(node.querySelectorAll<HTMLElement>(node.hasAttribute("data-showcase-gallery") ? "[data-showcase-chapter], [data-showcase-panel]" : ":scope > section"));
  let frame = 0, disposed = false;
  let navigationLocked = Boolean(location.hash), navigationScrolling = navigationLocked;
  let navigationTimer = 0, pendingFragmentShift = 0;
  let fragmentAnchor: HTMLElement | null = null, fragmentDocumentTop: number | null = null;
  // A reload can restore the previous document's absolute scroll position after
  // hydration has already targeted the fragment. Lazy chapters may now be shorter.
  // Only that initial reload gets a fresh canonical landing; history owns its offset.
  let reloadHash = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload" ? location.hash : "";
  let reloadFrame = 0;

  const hashTarget = () => {
    if (!location.hash) return null;
    try {
      let target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target?.dataset.showcaseDemoAlias && node.dataset.showcaseEnhanced) {
        target = document.getElementById(`demo-panel-${target.dataset.showcaseDemoAlias}`) || target;
      }
      return target && node.contains(target) ? target : null;
    } catch { return null; }
  };
  const finishNavigation = () => {
    if (!navigationScrolling || document.hidden) return;
    clearTimeout(navigationTimer); navigationScrolling = false;
    if (navigationLocked && hashTarget() === fragmentAnchor && Math.abs(pendingFragmentShift) > .5) {
      // Preserve the browser's restored offset, which need not equal scroll-margin.
      window.scrollBy({ top: pendingFragmentShift, behavior: "instant" });
    }
    pendingFragmentShift = 0;
  };
  const waitForNavigation = () => {
    clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(finishNavigation, 180);
  };
  const cancelReloadLanding = () => {
    reloadHash = ""; cancelAnimationFrame(reloadFrame); reloadFrame = 0;
  };
  const restoreReloadLanding = () => {
    reloadFrame = 0;
    if (disposed || document.hidden || !navigationLocked || reloadHash !== location.hash) return;
    const target = hashTarget();
    cancelReloadLanding();
    if (!target) return;
    const top = target.getBoundingClientRect().top - (Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
    pendingFragmentShift = 0; navigationScrolling = false; clearTimeout(navigationTimer);
    if (Math.abs(top) > .5) window.scrollBy({ top, behavior: "instant" });
    fragmentAnchor = target;
    fragmentDocumentTop = target.getBoundingClientRect().top + window.scrollY;
  };
  const scheduleReloadLanding = () => {
    if (reloadHash && document.readyState === "complete" && !document.hidden && !reloadFrame) reloadFrame = requestAnimationFrame(restoreReloadLanding);
  };
  const layout = () => {
    frame = 0;
    if (disposed || document.hidden) return;
    const fragment = navigationLocked ? hashTarget() : null;
    const documentTop = fragment ? fragment.getBoundingClientRect().top + window.scrollY : null;
    const shift = fragment === fragmentAnchor && fragmentDocumentTop !== null && documentTop !== null ? documentTop - fragmentDocumentTop : 0;
    if (Math.abs(shift) > .5) {
      if (navigationScrolling) pendingFragmentShift += shift;
      else window.scrollBy({ top: shift, behavior: "instant" });
    }
    fragmentAnchor = fragment; fragmentDocumentTop = documentTop;
    node.dispatchEvent(new Event("marketing-gallery-position", { bubbles: true }));
  };
  const scheduleLayout = () => {
    if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(layout);
  };
  const lockNavigation = () => {
    navigationLocked = Boolean(location.hash); navigationScrolling = navigationLocked; pendingFragmentShift = 0;
    fragmentAnchor = hashTarget();
    fragmentDocumentTop = fragmentAnchor ? fragmentAnchor.getBoundingClientRect().top + window.scrollY : null;
    if (navigationScrolling) waitForNavigation();
  };
  const historyNavigation = () => { cancelReloadLanding(); lockNavigation(); };
  const pageShow = (event: PageTransitionEvent) => {
    if (event.persisted) { historyNavigation(); return; }
    // Do not reacquire ownership if the visitor took over before the load ended.
    if (!navigationLocked) return;
    lockNavigation();
    scheduleReloadLanding();
  };
  const navigation = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const destination = new URL(anchor.href, location.href);
    if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search && destination.hash) historyNavigation();
  };
  const scrollIntent = (event: Event) => {
    if (event instanceof KeyboardEvent && (!SCROLL_KEYS.has(event.key) || (event.target instanceof Element && event.target.closest(SCROLL_CONTROL)))) return;
    cancelReloadLanding();
    navigationLocked = false; navigationScrolling = false; pendingFragmentShift = 0; clearTimeout(navigationTimer);
    fragmentAnchor = null; fragmentDocumentTop = null;
  };
  const focusIn = (event: FocusEvent) => {
    // Programmatic heading focus belongs to navigation; an actual control is takeover.
    if (event.target instanceof Element && event.target.closest(`a[href],${SCROLL_CONTROL},[role=button]`)) scrollIntent(event);
  };
  const scroll = () => { if (navigationScrolling) waitForNavigation(); };
  const visibility = () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; cancelAnimationFrame(reloadFrame); reloadFrame = 0; clearTimeout(navigationTimer); }
    else { scheduleLayout(); scheduleReloadLanding(); if (navigationScrolling) waitForNavigation(); }
  };
  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleLayout) : null;
  node.dataset.galleryMotion = "static";
  node.dataset.galleryLayout = "editorial";
  layout();
  cards.forEach(card => resizeObserver?.observe(card));
  node.addEventListener("pointerdown", scrollIntent, true);
  node.addEventListener("focusin", focusIn);
  document.addEventListener("click", navigation, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("hashchange", historyNavigation);
  window.addEventListener("popstate", historyNavigation);
  window.addEventListener("pageshow", pageShow);
  window.addEventListener("wheel", scrollIntent, { passive: true });
  window.addEventListener("touchmove", scrollIntent, { passive: true });
  window.addEventListener("keydown", scrollIntent);
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("scrollend", finishNavigation);
  window.addEventListener("resize", scheduleLayout);
  if (navigationScrolling) waitForNavigation();
  scheduleReloadLanding();
  return () => {
    disposed = true;
    resizeObserver?.disconnect(); cancelAnimationFrame(frame); cancelReloadLanding(); clearTimeout(navigationTimer);
    node.removeEventListener("pointerdown", scrollIntent, true); node.removeEventListener("focusin", focusIn);
    document.removeEventListener("click", navigation, true); document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("hashchange", historyNavigation); window.removeEventListener("popstate", historyNavigation); window.removeEventListener("pageshow", pageShow);
    window.removeEventListener("wheel", scrollIntent); window.removeEventListener("touchmove", scrollIntent); window.removeEventListener("keydown", scrollIntent);
    window.removeEventListener("scroll", scroll); window.removeEventListener("scrollend", finishNavigation); window.removeEventListener("resize", scheduleLayout);
  };
}
