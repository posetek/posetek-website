import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { menuButtonLabel } from "./home-logic";
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

/** Public navigation remains separate from the authenticated application. */
export function MarketingHeader({ audience }: { audience: MarketingAudience }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const soundEnabled = useSyncExternalStore(subscribeMarketingSound, initializeMarketingSound, () => false);
  const menuId = useId();
  const menuTitleId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const sectionAfterClose = useRef<string | null>(null);
  const cta = audience === "coaches"
    ? { label: "Talk about your team", href: TEAM_ENQUIRY_HREF }
    : { label: "Book a test", href: "/bookPerformanceTest.html" };

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
        sectionAfterClose.current = null;
        playMarketingSound("close");
        setMenuOpen(false);
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
        const target = section?.querySelector<HTMLElement>("h1,h2,h3") || section;
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
  }, [menuOpen]);

  const closeMenu = () => {
    sectionAfterClose.current = null;
    playMarketingSound("close");
    setMenuOpen(false);
  };
  const followSection = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    // Keep native hash/history behavior; defer focus until the inert page is restored.
    sectionAfterClose.current = href.slice(1);
    playMarketingSound("action");
    setMenuOpen(false);
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
        <a className="pt-marketing-signin" href="/signin" onClick={() => playMarketingSound("action")}>Sign in</a>
        <a className="pt-marketing-cta" href={cta.href} onClick={() => playMarketingSound("action")}>{cta.label}<span aria-hidden="true">↗</span></a>
        {soundControl}
        <button className="pt-marketing-menu-button" type="button" ref={menuButton} aria-label={menuButtonLabel(menuOpen)} aria-controls={menuId} aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => { playMarketingSound("open"); setMenuOpen(true); }}>
          <span>Menu</span><span className="pt-menu-glyph" aria-hidden="true"><i /><i /></span>
        </button>
      </div>
    </nav>
    <div ref={dialog} className="pt-marketing-menu" id={menuId} role="dialog" aria-modal="true" aria-labelledby={menuTitleId} hidden={!menuOpen}>
      <div className="pt-menu-top">
        <a className="pt-marketing-brand" href="/" aria-label="PoseTek home" onClick={() => playMarketingSound("action")}><Brand /></a>
        <div className="pt-menu-top-controls">{soundControl}<button ref={closeButton} className="pt-marketing-menu-button" type="button" aria-label="Close navigation" onClick={closeMenu}><span>Close</span><span className="pt-menu-close-glyph" aria-hidden="true">×</span></button></div>
      </div>
      <div className="pt-menu-content">
        <p className="pt-menu-eyebrow" id={menuTitleId}>Explore PoseTek</p>
        <nav className="pt-menu-pages" aria-label="Audience navigation">
          <a href="/" onClick={() => playMarketingSound("action")}><span>01</span><strong>Players</strong><span className="pt-menu-link-arrow" aria-hidden="true">↗</span></a>
          <a href="/coaches" onClick={() => playMarketingSound("action")}><span>02</span><strong>Coaches</strong><span className="pt-menu-link-arrow" aria-hidden="true">↗</span></a>
          <a href={cta.href} onClick={() => playMarketingSound("action")}><span>03</span><strong>{audience === "coaches" ? "Get in touch" : "Book a test"}</strong><span className="pt-menu-link-arrow" aria-hidden="true">↗</span></a>
        </nav>
        <div className="pt-menu-bottom">
          <nav className="pt-menu-sections" aria-label="On this page">{sectionLinks[audience].map(([label, href]) => <a key={href} href={href} onClick={event => followSection(event, href)}>{label}<span aria-hidden="true">↘</span></a>)}</nav>
          <div className="pt-menu-account"><a href="/signin" onClick={() => playMarketingSound("action")}>{audience === "coaches" ? "Coach sign in" : "Sign in"}<span aria-hidden="true">↗</span></a><a href="/privacy" onClick={() => playMarketingSound("action")}>Privacy</a></div>
        </div>
      </div>
      <p className="pt-menu-footnote">Start with evidence. Train what’s next.</p>
    </div>
  </header>;
}
