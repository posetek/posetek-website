import { Fragment, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from "react";
import { menuButtonLabel } from "./home-logic";
import { ScrambleText } from "./MarketingEffects";
import { initializeMarketingSound, playMarketingSound, setMarketingSoundEnabled, subscribeMarketingSound } from "./marketing-sound";
import "./marketing-header.css";

export type MarketingAudience = "players" | "coaches";
export const TEAM_ENQUIRY_HREF = "mailto:dylank@posetek.net?subject=PoseTek%20team%20enquiry";

const sectionLinks = {
  players: [
    ["Tests", "#tests"], ["Athlete profile", "#profile"], ["Training", "#training"],
    ["AI Coach", "#ai-coach"], ["Technique", "#technique"],
  ],
  coaches: [
    ["Your club", "#club"], ["Every player", "#players"],
    ["Development", "#development"], ["Get in touch", "#contact"],
  ],
} as const;

function Brand() {
  return <><img className="pt-marketing-mark" src="/brand/posetek-p.svg" alt="" width="48" height="48" /><span className="pt-marketing-wordmark">POSETEK</span></>;
}

/** Words wrap together; the link supplies one readable name for this decoration. */
function MenuLabel({ label, row }: { label: string; row: number }) {
  let character = 0;
  return <strong aria-hidden="true">{label.split(" ").map((word, index) => <Fragment key={`${word}-${index}`}>
    {index > 0 ? " " : null}<span className="pt-menu-word">{Array.from(word).map((letter, letterIndex) => {
      const index = Math.min(character++, 12);
      const timing = { "--enter-delay": `${row * 90 + index * 16}ms`, "--exit-delay": `${row * 20 + index * 8}ms` } as CSSProperties;
      return <span className="pt-menu-letter-mask" key={letterIndex}><span className="pt-menu-letter" style={timing}>{letter}</span></span>;
    })}</span>
  </Fragment>)}</strong>;
}

/** Public navigation remains separate from the authenticated application. */
export function MarketingHeader({ audience }: { audience: MarketingAudience }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [menuLettersRevealing, setMenuLettersRevealing] = useState(true);
  const [activeMenuItem, setActiveMenuItem] = useState<number | null>(null);
  const [previewAllowed, setPreviewAllowed] = useState(false);
  const soundEnabled = useSyncExternalStore(subscribeMarketingSound, initializeMarketingSound, () => false);
  const menuId = useId();
  const menuTitleId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);
  const closing = useRef(false);
  const sectionAfterClose = useRef<string | null>(null);
  const cta = audience === "coaches"
    ? { label: "Talk about your team", href: TEAM_ENQUIRY_HREF }
    : { label: "Book a test", href: "/bookPerformanceTest.html" };
  const pages = [
    { label: "Players", href: "/", title: "Start with evidence.", caption: "Your game. A clearer picture.", kind: "players" },
    { label: "Coaches", href: "/coaches", title: "One club. Every team.", caption: "See the team. Understand the individual.", kind: "coaches" },
    { label: audience === "coaches" ? "Get in touch" : "Book a test", href: cta.href, title: audience === "coaches" ? "Talk about your team." : "Establish your baseline.", caption: "Start with evidence. Train what’s next.", kind: "contact" },
  ];
  const previewPage = pages[activeMenuItem ?? 0];
  const finishClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closing.current = false;
    setMenuClosing(false); setMenuOpen(false); setActiveMenuItem(null);
  }, []);
  const closeMenu = useCallback(() => {
    sectionAfterClose.current = null;
    playMarketingSound("close");
    setMenuLettersRevealing(false); setActiveMenuItem(null);
    if (closing.current || matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) { finishClose(); return; }
    closing.current = true; setMenuClosing(true);
    closeTimer.current = window.setTimeout(finishClose, 400);
  }, [finishClose]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const panel = dialog.current, peek = preview.current;
    if (!menuOpen || !panel || !peek) return;
    const pointer = matchMedia("(min-width: 1001px) and (hover: hover) and (pointer: fine)");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, active: HTMLAnchorElement | null = null, previousX: number | null = null;
    let point = { x: 0, y: 0, angle: 0 };
    const allowed = () => pointer.matches && !motion.matches && !document.hidden && !closing.current;
    const position = (x: number, y: number) => {
      point = {
        x: Math.max(20, Math.min(x + 26, innerWidth - peek.offsetWidth - 20)),
        y: Math.max(20, Math.min(y - peek.offsetHeight * .65, innerHeight - peek.offsetHeight - 20)),
        angle: previousX === null ? 0 : Math.max(-8, Math.min(8, (x - previousX) * .4)),
      };
      previousX = x;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (!allowed()) return;
        peek.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
        peek.style.setProperty("--peek-angle", `${point.angle}deg`);
      });
    };
    const hide = () => { active = null; previousX = null; cancelAnimationFrame(frame); frame = 0; setActiveMenuItem(null); };
    const update = () => {
      setPreviewAllowed(allowed());
      if (!allowed()) hide();
      if ((motion.matches || document.hidden) && closing.current) finishClose();
    };
    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>("[data-menu-page]"));
    const removals = links.map((link, index) => {
      const show = (event: Event) => {
        if (closing.current) return;
        if (event.type === "pointerenter" && (!(event instanceof PointerEvent) || event.pointerType === "touch" || !pointer.matches)) return;
        active = link; setActiveMenuItem(index);
        if (!allowed()) return;
        const bounds = link.getBoundingClientRect();
        position(event instanceof PointerEvent ? event.clientX : bounds.right - peek.offsetWidth - 30,
          event instanceof PointerEvent ? event.clientY : bounds.top + bounds.height * .5);
      };
      const leave = () => { if (!link.matches(":focus-visible")) hide(); };
      link.addEventListener("pointerenter", show); link.addEventListener("pointerleave", leave); link.addEventListener("focus", show); link.addEventListener("blur", hide);
      return () => { link.removeEventListener("pointerenter", show); link.removeEventListener("pointerleave", leave); link.removeEventListener("focus", show); link.removeEventListener("blur", hide); };
    });
    const move = (event: PointerEvent) => { if (active && allowed() && event.pointerType !== "touch") position(event.clientX, event.clientY); };
    panel.addEventListener("pointermove", move); panel.addEventListener("pointerleave", hide);
    pointer.addEventListener("change", update); motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update); window.addEventListener("blur", hide); update();
    return () => {
      cancelAnimationFrame(frame); removals.forEach(remove => remove());
      panel.removeEventListener("pointermove", move); panel.removeEventListener("pointerleave", hide);
      pointer.removeEventListener("change", update); motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update); window.removeEventListener("blur", hide);
    };
  }, [menuOpen, finishClose]);

  useEffect(() => {
    if (!menuOpen || !dialog.current) return;
    const panel = dialog.current;
    const opener = menuButton.current;
    const priorOverflow = document.body.style.overflow;
    const priorPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const background = Array.from(header.current?.parentElement?.children || [])
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== header.current)
      .map(node => ({ node, inert: node.inert }));
    background.forEach(({ node }) => { node.inert = true; });
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    }
    closeButton.current?.focus({ preventScroll: true });

    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]'));
      const first = targets[0], last = targets.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = priorOverflow;
      document.body.style.paddingRight = priorPadding;
      background.forEach(({ node, inert }) => { node.inert = inert; });
      const destination = sectionAfterClose.current;
      sectionAfterClose.current = null;
      if (destination) {
        const section = document.getElementById(destination);
        // Gallery media precedes its caption, and may contain its own h3.
        // Focus the chapter heading, rather than a nested demonstration title.
        const target = section?.querySelector<HTMLElement>("h1,h2") || section?.querySelector<HTMLElement>("h3") || section;
        if (target) {
          // Native anchor navigation runs after the click and can clear focus.
          // Let it update the hash/history/scroll first, then focus the heading.
          requestAnimationFrame(() => {
            if (!target.isConnected || target.closest("[inert]")) return;
            if (!target.hasAttribute("tabindex")) {
              target.tabIndex = -1;
              target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
            }
            target.focus({ preventScroll: true });
          });
          return;
        }
      }
      opener?.focus({ preventScroll: true });
    };
  }, [menuOpen, closeMenu]);
  const followSection = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    // Keep native hash/history behavior; defer focus until the inert page is restored.
    sectionAfterClose.current = href.slice(1);
    playMarketingSound("action");
    // Restore the native destination immediately; only dismissals animate out.
    finishClose();
  };
  const toggleSound = () => {
    const next = !soundEnabled;
    setMarketingSoundEnabled(next);
    if (next) playMarketingSound("enable");
  };
  const soundControl = <button className="pt-marketing-sound" type="button" aria-label="Interface sound" aria-pressed={soundEnabled} onClick={toggleSound}>
    <span className="pt-sound-bars" aria-hidden="true"><i /><i /><i /><i /></span><span>Sound {soundEnabled ? "on" : "off"}</span>
  </button>;

  return <header ref={header} className={`site-header marketing-header${menuOpen ? " menu-open" : ""}`}>
    <nav className="pt-marketing-bar" aria-label="Primary navigation" inert={menuOpen}>
      <a className="pt-marketing-brand" href="/" aria-label="PoseTek home" onClick={() => playMarketingSound("action")}><Brand /></a>
      <div className="pt-marketing-audiences" role="group" aria-label="Explore PoseTek for">
        <a href="/" aria-current={audience === "players" ? "page" : undefined} onClick={() => playMarketingSound("action")}>Players</a>
        <a href="/coaches" aria-current={audience === "coaches" ? "page" : undefined} onClick={() => playMarketingSound("action")}>Coaches</a>
      </div>
      <div className="pt-marketing-actions">
        <a className="pt-marketing-signin" href="/signin" onClick={() => playMarketingSound("action")}><ScrambleText>Sign in</ScrambleText></a>
        <a className="pt-marketing-cta" href={cta.href} onClick={() => playMarketingSound("action")}><ScrambleText>{cta.label}</ScrambleText><span aria-hidden="true">↗</span></a>
        {soundControl}
        <button className="pt-marketing-menu-button" type="button" ref={menuButton} aria-label={menuButtonLabel(menuOpen)} aria-controls={menuId} aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => { playMarketingSound("open"); closing.current = false; setMenuClosing(false); setMenuLettersRevealing(true); setMenuOpen(true); }}>
          <span>Menu</span><span className="pt-menu-glyph" aria-hidden="true"><i /><i /></span>
        </button>
      </div>
    </nav>
    <div ref={dialog} className="pt-marketing-menu" id={menuId} role="dialog" aria-modal="true" aria-labelledby={menuTitleId} hidden={!menuOpen} data-letter-reveal={menuLettersRevealing} data-closing={menuClosing} onPointerDownCapture={() => setMenuLettersRevealing(false)} onKeyDownCapture={() => setMenuLettersRevealing(false)} onClickCapture={() => setMenuLettersRevealing(false)}>
      <div className="pt-menu-curtain" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <span className="pt-menu-curtain-slice" key={index} style={{ "--slice-order": (index * 7) % 10 } as CSSProperties}/>)}</div>
      <div className="pt-menu-top">
        <a className="pt-marketing-brand" href="/" aria-label="PoseTek home" onClick={() => playMarketingSound("action")}><Brand /></a>
        <div className="pt-menu-top-controls">{soundControl}<button ref={closeButton} className="pt-marketing-menu-button" type="button" aria-label="Close navigation" onClick={closeMenu}><span>Close</span><span className="pt-menu-close-glyph" aria-hidden="true">×</span></button></div>
      </div>
      <div className="pt-menu-content">
        <p className="pt-menu-eyebrow" id={menuTitleId}>Explore PoseTek</p>
        <nav className="pt-menu-pages" aria-label="Audience navigation" onFocusCapture={() => setMenuLettersRevealing(false)}>
          {pages.map((page, index) => <a key={page.href} href={page.href} aria-label={page.label} data-menu-page={page.kind} data-dimmed={activeMenuItem !== null && activeMenuItem !== index} data-active={activeMenuItem === index} onClick={event => { playMarketingSound("action"); if (event.button === 0 && !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) finishClose(); }}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><MenuLabel label={page.label} row={index}/><span className="pt-menu-link-arrow" aria-hidden="true">↗</span></a>)}
        </nav>
        <div className="pt-menu-bottom">
          <nav className="pt-menu-sections" aria-label="On this page">{sectionLinks[audience].map(([label, href]) => <a key={href} href={href} onClick={event => followSection(event, href)}><ScrambleText>{label}</ScrambleText><span aria-hidden="true">↘</span></a>)}</nav>
          <div className="pt-menu-account"><a href="/signin" onClick={() => playMarketingSound("action")}><ScrambleText>{audience === "coaches" ? "Coach sign in" : "Sign in"}</ScrambleText><span aria-hidden="true">↗</span></a><a href="/privacy" onClick={() => playMarketingSound("action")}><ScrambleText>Privacy</ScrambleText></a></div>
        </div>
      </div>
      <p className="pt-menu-footnote">Start with evidence. Train what’s next.</p>
      <div ref={preview} className="pt-menu-peek" aria-hidden="true" data-visible={previewAllowed && activeMenuItem !== null && !menuClosing} data-page={previewPage.kind}>
        <div className="pt-menu-peek-panel"><div className="pt-menu-peek-content" key={previewPage.kind}>
          <div className="pt-menu-peek-bar"><span>POSETEK</span><span>{previewPage.label}</span></div>
          <div className="pt-menu-peek-body"><div><span className="pt-menu-peek-label">{previewPage.label}</span><p>{previewPage.title}</p><span className="pt-menu-peek-caption">{previewPage.caption}</span></div><div className="pt-menu-peek-art"><img src="/brand/posetek-p.svg" alt="" width="48" height="48"/><i/><i/><i/></div></div>
          <div className="pt-menu-peek-foot">TEST / UNDERSTAND / TRAIN / RETEST</div>
        </div></div>
      </div>
    </div>
  </header>;
}
