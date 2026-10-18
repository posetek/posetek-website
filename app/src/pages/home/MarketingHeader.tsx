import { Fragment, useEffect, useRef, type CSSProperties } from "react";
import { TEAM_ENQUIRY_HREF, marketingSections, type MarketingAudience } from "./marketing-links";
import { installMarketingNavigation } from "./marketing-navigation";
import "./marketing-header.css";
export { TEAM_ENQUIRY_HREF, type MarketingAudience } from "./marketing-links";

function Brand() {
  return <><img className="pt-marketing-mark" src="/brand/posetek-p.svg" alt="" width="48" height="48" /><span className="pt-marketing-wordmark">POSETEK</span></>;
}
function Label({ children }: { children: string }) {
  return <span className="interaction-text" data-header-scramble={children}><span className="interaction-text-source">{children}</span><span className="interaction-text-visual" aria-hidden="true">{children}</span></span>;
}
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
function SoundControl() {
  return <button className="pt-marketing-sound" type="button" aria-label="Interface sound" aria-pressed="false" disabled data-header-sound><span className="pt-sound-bars" aria-hidden="true"><i /><i /><i /><i /></span><span data-sound-label>Sound off</span></button>;
}

/** Astro renders this without hydration. Legacy entries use the same DOM controller. */
export function MarketingHeader({ audience, legacy = false }: { audience: MarketingAudience; legacy?: boolean }) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!legacy) return;
    const cleanup = installMarketingNavigation(host.current);
    let dispose: (() => void) | undefined, cancelled = false;
    void import("./marketing-header-enhancements").then(({ enhanceMarketingHeader }) => {
      if (!cancelled && host.current) dispose = enhanceMarketingHeader(host.current);
    }).catch(() => {});
    return () => { cancelled = true; dispose?.(); cleanup?.(); };
  }, [legacy]);
  const cta = audience === "coaches" ? { label: "Talk about your team", href: TEAM_ENQUIRY_HREF } : { label: "Book a test", href: "/bookPerformanceTest.html" };
  const pages = [
    { label: "Players", href: "/", title: "Start with evidence.", caption: "Your game. A clearer picture.", kind: "players" },
    { label: "Coaches", href: "/coaches", title: "One club. Every team.", caption: "See the team. Understand the individual.", kind: "coaches" },
    { label: audience === "coaches" ? "Get in touch" : "Book a test", href: cta.href, title: audience === "coaches" ? "Talk about your team." : "Establish your baseline.", caption: "Start with evidence. Train what’s next.", kind: "contact" },
  ];
  return <header ref={host} className="site-header marketing-header" data-marketing-header>
    <nav className="pt-marketing-bar" aria-label="Primary navigation">
      <a className="pt-marketing-brand" href="/" aria-label="PoseTek home"><Brand /></a>
      <div className="pt-marketing-audiences" role="group" aria-label="Explore PoseTek for"><a href="/" aria-current={audience === "players" ? "page" : undefined}>Players</a><a href="/coaches" aria-current={audience === "coaches" ? "page" : undefined}>Coaches</a></div>
      <div className="pt-marketing-actions"><a className="pt-marketing-signin" href="/signin"><Label>Sign in</Label></a><a className="pt-marketing-cta" href={cta.href}><Label>{cta.label}</Label><span aria-hidden="true">↗</span></a><SoundControl /></div>
    </nav>
    <div data-marketing-progress-slot aria-hidden="true" />
    <details className="pt-navigation-disclosure">
      <summary className="pt-marketing-menu-button" role="button" aria-label="Open navigation" aria-controls="marketing-menu"><span>Menu</span><span className="pt-menu-glyph" aria-hidden="true"><i /><i /></span></summary>
      <div className="pt-marketing-menu" id="marketing-menu" aria-labelledby="marketing-menu-title" data-letter-reveal="false" data-closing="false">
        <div className="pt-menu-curtain" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <span className="pt-menu-curtain-slice" key={index} style={{ "--slice-order": (index * 7) % 10 } as CSSProperties}/>)}</div>
        <div className="pt-menu-top"><a className="pt-marketing-brand" href="/" aria-label="PoseTek home"><Brand /></a><div className="pt-menu-top-controls"><SoundControl /><button className="pt-marketing-menu-button" type="button" aria-label="Close navigation" data-menu-close><span>Close</span><span className="pt-menu-close-glyph" aria-hidden="true">×</span></button></div></div>
        <div className="pt-menu-content"><p className="pt-menu-eyebrow" id="marketing-menu-title">Explore PoseTek</p>
          <nav className="pt-menu-pages" aria-label="Audience navigation">{pages.map((page, index) => <a key={page.kind} href={page.href} aria-label={page.label} data-menu-page={page.kind} data-preview-title={page.title} data-preview-caption={page.caption} data-dimmed="false" data-active="false"><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><MenuLabel label={page.label} row={index}/><span className="pt-menu-link-arrow" aria-hidden="true">↗</span></a>)}</nav>
          <div className="pt-menu-bottom"><nav className="pt-menu-sections" aria-label="On this page">{marketingSections[audience].map(([label, href]) => <a key={href} href={href}><Label>{label}</Label><span aria-hidden="true">↘</span></a>)}</nav><div className="pt-menu-account"><a href="/signin"><Label>{audience === "coaches" ? "Coach sign in" : "Sign in"}</Label><span aria-hidden="true">↗</span></a><a href="/privacy"><Label>Privacy</Label></a></div></div>
        </div>
        <p className="pt-menu-footnote">Start with evidence. Train what’s next.</p>
        <div className="pt-menu-peek" aria-hidden="true" data-visible="false" data-page="players"><div className="pt-menu-peek-panel"><div className="pt-menu-peek-content"><div className="pt-menu-peek-bar"><span>POSETEK</span><span data-peek-label>Players</span></div><div className="pt-menu-peek-body"><div><span className="pt-menu-peek-label" data-peek-label>Players</span><p data-peek-title>Start with evidence.</p><span className="pt-menu-peek-caption" data-peek-caption>Your game. A clearer picture.</span></div><div className="pt-menu-peek-art"><img src="/brand/posetek-p.svg" alt="" width="48" height="48"/><i/><i/><i/></div></div><div className="pt-menu-peek-foot">TEST / UNDERSTAND / TRAIN / RETEST</div></div></div></div>
      </div>
    </details>
  </header>;
}
