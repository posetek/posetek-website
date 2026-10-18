import { initializeMarketingSound, playMarketingSound, setMarketingSoundEnabled, subscribeMarketingSound } from "./marketing-sound";

/** Optional polish. Neither navigation state nor first-input handling depends on it. */
export function enhanceMarketingHeader(header: HTMLElement): () => void {
  if (header.dataset.polished === "true") return () => {};
  header.dataset.polished = "true";
  const removals: (() => void)[] = [];
  const listen = (target: EventTarget, event: string, callback: EventListener) => {
    target.addEventListener(event, callback);
    removals.push(() => target.removeEventListener(event, callback));
  };
  const soundButtons = Array.from(header.querySelectorAll<HTMLButtonElement>("[data-header-sound]"));
  const syncSound = () => {
    const enabled = initializeMarketingSound();
    for (const button of soundButtons) {
      button.disabled = false;
      button.setAttribute("aria-pressed", String(enabled));
      const label = button.querySelector("[data-sound-label]");
      if (label) label.textContent = `Sound ${enabled ? "on" : "off"}`;
    }
  };
  syncSound(); removals.push(subscribeMarketingSound(syncSound));
  for (const button of soundButtons) listen(button, "click", () => {
    const next = !initializeMarketingSound(); setMarketingSoundEnabled(next);
    if (next) playMarketingSound("enable");
  });
  listen(header, "marketing:cue", event => playMarketingSound((event as CustomEvent).detail));

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = matchMedia("(min-width: 1001px) and (hover: hover) and (pointer: fine)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const panel = header.querySelector<HTMLElement>(".pt-marketing-menu")!;
  const peek = header.querySelector<HTMLElement>(".pt-menu-peek")!;
  const links = Array.from(header.querySelectorAll<HTMLAnchorElement>("[data-menu-page]"));
  let frame = 0, active: HTMLAnchorElement | null = null, previousX: number | null = null;
  const allowed = () => pointer.matches && !motion.matches && !document.hidden && ["opening", "open"].includes(header.dataset.navigation || "");
  const hide = () => {
    cancelAnimationFrame(frame); frame = 0; active = null; previousX = null;
    peek.dataset.visible = "false";
    links.forEach(link => { link.dataset.active = "false"; link.dataset.dimmed = "false"; });
  };
  const position = (x: number, y: number) => {
    const angle = previousX === null ? 0 : Math.max(-8, Math.min(8, (x - previousX) * .4)); previousX = x;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0; if (!allowed()) return;
      const left = Math.max(20, Math.min(x + 26, innerWidth - peek.offsetWidth - 20));
      const top = Math.max(20, Math.min(y - peek.offsetHeight * .65, innerHeight - peek.offsetHeight - 20));
      peek.style.transform = `translate3d(${left}px,${top}px,0)`;
      peek.style.setProperty("--peek-angle", `${angle}deg`);
    });
  };
  links.forEach(link => {
    const show = (event: Event) => {
      if (header.dataset.navigation === "closing") return;
      if (event instanceof PointerEvent && (event.pointerType === "touch" || !pointer.matches)) return;
      active = link;
      links.forEach(item => { item.dataset.active = String(item === link); item.dataset.dimmed = String(item !== link); });
      peek.dataset.page = link.dataset.menuPage;
      peek.querySelectorAll("[data-peek-label]").forEach(node => { node.textContent = link.getAttribute("aria-label"); });
      peek.querySelector("[data-peek-title]")!.textContent = link.dataset.previewTitle || "";
      peek.querySelector("[data-peek-caption]")!.textContent = link.dataset.previewCaption || "";
      peek.dataset.visible = String(allowed());
      if (allowed()) {
        const bounds = link.getBoundingClientRect();
        position(event instanceof PointerEvent ? event.clientX : bounds.right - peek.offsetWidth - 30,
          event instanceof PointerEvent ? event.clientY : bounds.top + bounds.height * .5);
      }
    };
    listen(link, "pointerenter", show); listen(link, "focus", show);
    listen(link, "pointerleave", () => { if (!link.matches(":focus-visible")) hide(); }); listen(link, "blur", hide);
  });
  listen(panel, "pointermove", event => {
    const point = event as PointerEvent;
    if (active && allowed() && point.pointerType !== "touch") position(point.clientX, point.clientY);
  });
  listen(panel, "pointerleave", hide); listen(pointer, "change", hide); listen(motion, "change", hide);
  listen(document, "visibilitychange", hide); listen(window, "blur", hide);
  listen(window, "marketing:navigation", () => { if (!allowed()) hide(); });

  const stopScrambles: (() => void)[] = [];
  header.querySelectorAll<HTMLElement>("[data-header-scramble]").forEach(node => {
    const original = node.dataset.headerScramble || "", visual = node.querySelector<HTMLElement>(".interaction-text-visual")!;
    const trigger = node.closest("a,button") || node;
    let timer = 0;
    const stop = () => { clearInterval(timer); timer = 0; visual.textContent = original; node.dataset.scrambling = "false"; };
    stopScrambles.push(stop);
    listen(trigger, "pointerenter", () => {
      if (motion.matches || !fine.matches || document.hidden || timer) return;
      const started = performance.now(); node.dataset.scrambling = "true";
      timer = window.setInterval(() => {
        const progress = (performance.now() - started) / 320;
        if (progress >= 1) { stop(); return; }
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+[]";
        visual.textContent = Array.from(original).map((letter, index) => /\s/.test(letter) || index / original.length < progress ? letter : alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
      }, 40);
    });
    for (const event of ["pointerleave", "pointerdown", "focusin"]) listen(trigger, event, stop);
  });
  const stopAll = () => stopScrambles.forEach(stop => stop());
  listen(motion, "change", stopAll); listen(fine, "change", stopAll); listen(document, "visibilitychange", stopAll); listen(window, "blur", stopAll);
  return () => { hide(); stopAll(); removals.forEach(remove => remove()); delete header.dataset.polished; };
}
