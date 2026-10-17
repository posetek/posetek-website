import { useEffect, useId, useRef } from "react";
import { DimensionalMark } from "./DimensionalMark";
import { TEAM_ENQUIRY_HREF } from "./MarketingHeader";
import type { MarketingAudience } from "./MarketingHeader";
import "./marketing-footer.css";

function FooterArrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h16m-7-7 7 7-7 7"} stroke="currentColor" strokeWidth="1.5"/></svg>;
}

/** Shared public closing chapter. All destinations remain ordinary links. */
export function MarketingFooter({ audience }: { audience: MarketingAudience }) {
  const footer = useRef<HTMLElement>(null);
  const headingId = useId();
  const coaches = audience === "coaches";

  useEffect(() => {
    const element = footer.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let frame = 0;
    const draw = () => {
      frame = 0;
      if (!visible || document.hidden || motion.matches) return;
      const top = element.getBoundingClientRect().top;
      const offset = Math.max(0, Math.min(24, top / window.innerHeight * 24));
      element.style.setProperty("--footer-invitation-offset", `${offset}px`);
    };
    const update = () => {
      if (motion.matches) {
        element.style.removeProperty("--footer-invitation-offset");
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (visible && !document.hidden && !frame) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      update();
    });
    observer.observe(element);
    window.addEventListener("scroll", update, { passive: true });
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", update);
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, []);

  return <footer className="marketing-footer" ref={footer} aria-labelledby={headingId}>
    <div className="marketing-footer-inner">
      <div className="marketing-footer-topline"><span>POSETEK / {coaches ? "FOR COACHES" : "FOR PLAYERS"}</span><a href="#top">Back to top <span aria-hidden="true">↑</span></a></div>
      <div className="marketing-footer-invitation">
        <p className="marketing-footer-kicker"><span aria-hidden="true">[</span> YOUR NEXT STEP <span aria-hidden="true">]</span></p>
        <h2 id={headingId}>Start with evidence.<br/><span>Train what’s next.</span></h2>
        <div className="marketing-footer-contact">
          <p>{coaches ? "See the team. Understand the individual." : "Your game. A clearer picture."}</p>
          <a className="marketing-footer-cta" href={coaches ? TEAM_ENQUIRY_HREF : "/bookPerformanceTest.html"}><span>{coaches ? "Talk about your team" : "Book a performance test"}</span><FooterArrow diagonal/></a>
          <a className="marketing-footer-secondary" href="/signin">{coaches ? "Coach sign in" : "Already with PoseTek? Sign in"}<FooterArrow/></a>
        </div>
      </div>
      <div className="marketing-footer-stage">
        <a className="marketing-footer-next" href={coaches ? "/" : "/coaches"} data-cursor={coaches ? "Explore players" : "Explore coaches"}>
          <span className="marketing-footer-next-label">KEEP EXPLORING <span aria-hidden="true">↗</span></span>
          <span className="marketing-footer-next-preview" aria-hidden="true"><span className="marketing-footer-next-grid"/><span className="marketing-footer-next-number">{coaches ? "01" : "02"}</span><span className="marketing-footer-next-word">{coaches ? "Your\ngame." : "Your\nteam."}</span><span className="marketing-footer-next-dot"/></span>
          <span className="marketing-footer-next-title">PoseTek for {coaches ? "players" : "coaches"}<FooterArrow/></span>
          <span className="marketing-footer-next-description">{coaches ? "From your first test to your next step." : "One connected approach for your club."}</span>
        </a>
        <DimensionalMark/>
        <span className="marketing-footer-register" aria-hidden="true">TEST / UNDERSTAND / TRAIN / RETEST</span>
      </div>
      <div className="marketing-footer-bottom">
        <a className="marketing-footer-brand" href="/" aria-label="PoseTek home"><img src="/brand/posetek-p.svg" alt="" width="32" height="32" loading="lazy"/><span>POSETEK</span></a>
        <nav aria-label="Footer navigation"><a href="/bookPerformanceTest.html">Book a test</a><a href={TEAM_ENQUIRY_HREF}>Team enquiries</a><a href="/signin">Sign in</a><a href="/privacy">Privacy</a></nav>
        <span className="marketing-footer-copyright">© 2026 PoseTek</span>
      </div>
    </div>
  </footer>;
}
