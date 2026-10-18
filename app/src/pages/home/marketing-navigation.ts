/** Self-contained: Astro serializes this small controller inline before page hydration.
 * The legacy React entry calls the exact same controller. No renderer imports. */
export function installMarketingNavigation(header: HTMLElement | null): (() => void) | undefined {
  if (!header || header.dataset.enhanced === "true") return;
  const disclosure = header.querySelector<HTMLDetailsElement>("details");
  const opener = disclosure?.querySelector<HTMLElement>("summary");
  const panel = header.querySelector<HTMLElement>(".pt-marketing-menu");
  const close = header.querySelector<HTMLButtonElement>("[data-menu-close]");
  const bar = header.querySelector<HTMLElement>(".pt-marketing-bar");
  if (!disclosure || !opener || !panel || !close || !bar) return;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let phase = "closed", timer = 0, destination: string | null = null;
  let restore: (() => void) | undefined;
  const removals: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener);
    removals.push(() => target.removeEventListener(type, listener));
  };
  const publish = (next: string) => {
    phase = next;
    header.dataset.navigation = next;
    document.documentElement.dataset.marketingNavigation = next;
    window.dispatchEvent(new CustomEvent("marketing:navigation", { detail: { phase: next } }));
  };
  const cue = (name: string) => header.dispatchEvent(new CustomEvent("marketing:cue", { detail: name }));
  const settleLetters = () => { panel.dataset.letterReveal = "false"; };
  const finish = () => {
    clearTimeout(timer);
    panel.hidden = true; disclosure.open = false;
    panel.dataset.closing = "false";
    header.classList.remove("menu-open");
    opener.setAttribute("aria-expanded", "false");
    opener.setAttribute("aria-label", "Open navigation");
    restore?.(); restore = undefined;
    publish("closed");
    const section = destination ? document.getElementById(destination) : null;
    destination = null;
    const target = section?.querySelector<HTMLElement>("h1,h2") || section;
    if (target) requestAnimationFrame(() => {
      if (!target.isConnected || target.closest("[inert]")) return;
      if (!target.hasAttribute("tabindex")) {
        target.tabIndex = -1;
        target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
      }
      target.focus({ preventScroll: true });
    });
    else opener.focus({ preventScroll: true });
  };
  const dismiss = () => {
    if (phase === "closed") return;
    cue("close"); settleLetters(); destination = null;
    if (phase === "closing" || motion.matches || document.hidden) { finish(); return; }
    clearTimeout(timer); publish("closing");
    panel.dataset.closing = "true";
    timer = window.setTimeout(finish, 400);
  };
  const open = () => {
    if (phase === "opening" || phase === "open") return;
    clearTimeout(timer);
    // Announce intent before any layout or animation starts.
    publish("opening");
    disclosure.open = true; panel.hidden = false; panel.scrollTop = 0;
    panel.dataset.closing = "false"; panel.dataset.letterReveal = "true";
    header.classList.add("menu-open");
    opener.setAttribute("aria-expanded", "true");
    opener.setAttribute("aria-label", "Navigation open");
    if (!restore) {
      const priorOverflow = document.body.style.overflow, priorPadding = document.body.style.paddingRight;
      const scrollbar = innerWidth - document.documentElement.clientWidth;
      const states = new Map<HTMLElement, boolean>();
      const inertBackground = () => {
        const nodes = [...Array.from(header.parentElement?.children || []), bar, opener]
          .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== header && node.tagName !== "SCRIPT");
        for (const node of nodes) {
          if (!states.has(node)) states.set(node, node.inert);
          node.inert = true;
        }
      };
      inertBackground();
      // This inline controller can run before the streamed React root exists.
      // Newly parsed siblings must join the same modal ownership boundary.
      const additions = new MutationObserver(inertBackground);
      if (header.parentElement) additions.observe(header.parentElement, { childList: true });
      document.body.style.overflow = "hidden";
      if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
      restore = () => {
        additions.disconnect();
        document.body.style.overflow = priorOverflow; document.body.style.paddingRight = priorPadding;
        states.forEach((inert, node) => { node.inert = inert; });
      };
    }
    close.focus({ preventScroll: true });
    cue("open");
    if (motion.matches) publish("open");
    else timer = window.setTimeout(() => publish("open"), 1020);
  };
  listen(opener, "click", event => { event.preventDefault(); if (phase === "closed" || phase === "closing") open(); else dismiss(); });
  listen(close, "click", dismiss);
  listen(disclosure, "toggle", () => {
    if (disclosure.open && phase === "closed") open();
    else if (!disclosure.open && phase !== "closed") finish();
  });
  listen(document, "keydown", event => {
    if (phase === "closed") return;
    const key = event as KeyboardEvent;
    if (key.key === "Escape") { key.preventDefault(); dismiss(); return; }
    if (key.key !== "Tab") return;
    settleLetters();
    const targets = Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (!first || !last) return;
    if (key.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { key.preventDefault(); last.focus(); }
    else if (!key.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { key.preventDefault(); first.focus(); }
  });
  listen(panel, "pointerdown", settleLetters);
  listen(panel, "focusin", event => { if (event.target !== close) settleLetters(); });
  listen(panel, "click", event => {
    const click = event as MouseEvent;
    const link = click.target instanceof Element ? click.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || click.button !== 0 || click.metaKey || click.ctrlKey || click.altKey || click.shiftKey) return;
    destination = link.getAttribute("href")?.startsWith("#") ? link.hash.slice(1) : null;
    cue("action"); finish(); // Native click still owns hash, history and navigation.
  });
  const adapt = () => {
    if (phase === "closing" && (motion.matches || document.hidden)) finish();
    else if (phase === "opening" && (motion.matches || document.hidden)) { clearTimeout(timer); settleLetters(); publish("open"); }
  };
  listen(motion, "change", adapt); listen(document, "visibilitychange", adapt);
  const adopted = disclosure.open;
  panel.hidden = !adopted;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
  opener.setAttribute("aria-haspopup", "dialog"); opener.setAttribute("aria-expanded", String(adopted));
  header.dataset.enhanced = "true";
  if (adopted) open(); else publish("closed");
  return () => {
    removals.forEach(remove => remove()); clearTimeout(timer); restore?.();
    delete header.dataset.enhanced; publish("closed");
    panel.hidden = false; panel.removeAttribute("role"); panel.removeAttribute("aria-modal");
  };
}
