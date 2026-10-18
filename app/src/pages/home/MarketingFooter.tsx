import { useEffect, useId, useRef, type CSSProperties } from "react";
import { DimensionalMark } from "./DimensionalMark";
import { ScrambleText } from "./MarketingEffects";
import { TEAM_ENQUIRY_HREF } from "./MarketingHeader";
import type { MarketingAudience } from "./MarketingHeader";
import "./marketing-footer.css";

function FooterArrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h16m-7-7 7 7-7 7"} stroke="currentColor" strokeWidth="1.5"/></svg>;
}

function FooterTitleLine({ children }: { children: string }) {
  return <span className="marketing-footer-title-line" aria-hidden="true">{Array.from(children).map((letter, index) => <span className="marketing-footer-title-character" style={{ "--footer-letter": index } as CSSProperties} key={index}>{letter === " " ? "\u00a0" : letter}</span>)}</span>;
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
    let previousTime = 0;
    let progress = 0;
    let entered = false;
    let pull = 0;
    let releaseFrom = 0;
    let releaseAt = 0;
    let releaseTimer = 0;
    let touchY: number | null = null;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const easeInOut = (value: number) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
    const reset = () => {
      cancelAnimationFrame(frame);
      clearTimeout(releaseTimer);
      frame = releaseTimer = 0;
      previousTime = releaseAt = pull = 0;
      touchY = null;
      element.style.setProperty("--footer-pull", "0");
    };
    const draw = (now: number) => {
      frame = 0;
      if (motion.matches) { update(); return; }
      if (!visible || document.hidden) return;
      const bounds = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      const maximumScroll = document.documentElement.scrollHeight - viewport;
      const absoluteTop = bounds.top + window.scrollY;
      const start = absoluteTop - viewport;
      const end = Math.min(maximumScroll - 2, absoluteTop - viewport * .3);
      const focused = element.contains(document.activeElement);
      const targetProgress = focused ? 1 : clamp((window.scrollY - start) / Math.max(1, end - start));
      const elapsed = previousTime ? Math.min((now - previousTime) / 1000, .05) : 1 / 60;
      previousTime = now;
      progress += (targetProgress - progress) * (1 - Math.exp(-elapsed * 10));
      if (Math.abs(targetProgress - progress) < .0005) progress = targetProgress;
      if (focused || bounds.top <= viewport * .45) {
        entered = true;
        element.dataset.footerState = "in";
      } else element.dataset.footerState = entered ? "out" : "before";
      if (releaseAt) {
        const returning = clamp((now - releaseAt) / 1400);
        pull = releaseFrom * (1 - easeInOut(returning));
        if (returning === 1) releaseAt = pull = 0;
      }
      element.style.setProperty("--footer-grid-progress", progress.toFixed(4));
      element.style.setProperty("--footer-line-progress", clamp((progress - .65) / .35).toFixed(4));
      element.style.setProperty("--footer-pull", pull.toFixed(4));
      if (progress !== targetProgress || releaseAt) frame = requestAnimationFrame(draw);
      else previousTime = 0;
    };
    const update = () => {
      if (motion.matches) {
        reset();
        delete element.dataset.footerMotion;
        delete element.dataset.footerState;
        element.style.removeProperty("--footer-grid-progress");
        element.style.removeProperty("--footer-line-progress");
      } else {
        element.dataset.footerMotion = "true";
        if (!visible || document.hidden) {
          reset();
          if (!visible && !element.contains(document.activeElement) && element.getBoundingClientRect().top >= window.innerHeight) {
            progress = 0;
            element.style.setProperty("--footer-grid-progress", "0");
            element.style.setProperty("--footer-line-progress", "0");
            element.dataset.footerState = entered ? "out" : "before";
          }
        }
        else if (!frame) frame = requestAnimationFrame(draw);
      }
    };
    // Lain's bottom pull fills a preview bar and scales the miniature by 6%.
    // Here it is deliberately visual only: no wheel/touch event can navigate.
    const addPull = (amount: number) => {
      if (!visible || document.hidden || motion.matches) return;
      const atBottom = window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 4;
      if (!atBottom && pull <= 0) return;
      pull = clamp(pull + amount);
      releaseAt = 0;
      clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        releaseFrom = pull;
        releaseAt = performance.now();
        update();
      }, 900);
      update();
    };
    const wheel = (event: WheelEvent) => {
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      addPull(delta / (window.innerHeight * 4));
    };
    const touchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? null; };
    const touchMove = (event: TouchEvent) => {
      const next = event.touches[0]?.clientY;
      if (touchY === null || next === undefined) return;
      addPull((touchY - next) / (window.innerHeight * 2.6));
      touchY = next;
    };
    const touchEnd = () => { touchY = null; };
    const focus = () => {
      if (motion.matches) return;
      progress = 1;
      entered = true;
      element.dataset.footerState = "in";
      element.style.setProperty("--footer-grid-progress", "1");
      element.style.setProperty("--footer-line-progress", "1");
      update();
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      update();
    });
    observer.observe(element);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    element.addEventListener("wheel", wheel, { passive: true });
    element.addEventListener("touchstart", touchStart, { passive: true });
    element.addEventListener("touchmove", touchMove, { passive: true });
    element.addEventListener("touchend", touchEnd);
    element.addEventListener("touchcancel", touchEnd);
    element.addEventListener("focusin", focus);
    element.addEventListener("focusout", update);
    return () => {
      reset();
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", touchStart);
      element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("touchend", touchEnd);
      element.removeEventListener("touchcancel", touchEnd);
      element.removeEventListener("focusin", focus);
      element.removeEventListener("focusout", update);
      delete element.dataset.footerMotion;
      delete element.dataset.footerState;
    };
  }, []);

  return <footer className="marketing-footer" ref={footer} aria-labelledby={headingId}>
    <div className="marketing-footer-rules" aria-hidden="true"><i/><i/><i/></div>
    <div className="marketing-footer-inner">
      <div className="marketing-footer-topline"><span>POSETEK / {coaches ? "FOR COACHES" : "FOR PLAYERS"}</span><a href="#top"><ScrambleText>Back to top</ScrambleText><span className="marketing-footer-back-arrow" aria-hidden="true">↑</span></a></div>
      <div className="marketing-footer-invitation">
        <p className="marketing-footer-kicker"><span aria-hidden="true">[</span> YOUR NEXT STEP <span aria-hidden="true">]</span></p>
        <h2 id={headingId} aria-label="Start with evidence. Train what’s next."><FooterTitleLine>Start with evidence.</FooterTitleLine><FooterTitleLine>Train what’s next.</FooterTitleLine></h2>
        <div className="marketing-footer-contact">
          <p>{coaches ? "See the team. Understand the individual." : "Your game. A clearer picture."}</p>
          <a className="marketing-footer-cta" href={coaches ? TEAM_ENQUIRY_HREF : "/bookPerformanceTest.html"}><ScrambleText>{coaches ? "Talk about your team" : "Book a performance test"}</ScrambleText><FooterArrow diagonal/></a>
          <a className="marketing-footer-secondary" href="/signin"><ScrambleText>{coaches ? "Coach sign in" : "Already with PoseTek? Sign in"}</ScrambleText><FooterArrow/></a>
        </div>
      </div>
      <div className="marketing-footer-stage">
        <a className="marketing-footer-next" href={coaches ? "/" : "/coaches"} data-cursor={coaches ? "Explore players" : "Explore coaches"}>
          <span className="marketing-footer-next-label">KEEP EXPLORING <span aria-hidden="true">↗</span></span>
          <span className="marketing-footer-next-preview" aria-hidden="true"><span className="marketing-footer-next-scene"><span className="marketing-footer-next-grid"/><span className="marketing-footer-next-number">{coaches ? "01" : "02"}</span><span className="marketing-footer-next-word">{coaches ? "Your\ngame." : "Your\nteam."}</span><span className="marketing-footer-next-dot"/></span><span className="marketing-footer-next-progress"/></span>
          <span className="marketing-footer-next-title"><ScrambleText>{`PoseTek for ${coaches ? "players" : "coaches"}`}</ScrambleText><FooterArrow/></span>
          <span className="marketing-footer-next-description">{coaches ? "From your first test to your next step." : "One connected approach for your club."}</span>
        </a>
        <DimensionalMark/>
        <span className="marketing-footer-register" aria-hidden="true">TEST / UNDERSTAND / TRAIN / RETEST</span>
      </div>
      <div className="marketing-footer-bottom">
        <a className="marketing-footer-brand" href="/" aria-label="PoseTek home"><img src="/brand/posetek-p.svg" alt="" width="32" height="32" loading="lazy"/><span>POSETEK</span></a>
        <nav aria-label="Footer navigation"><a href="/bookPerformanceTest.html"><ScrambleText>Book a test</ScrambleText></a><a href={TEAM_ENQUIRY_HREF}><ScrambleText>Team enquiries</ScrambleText></a><a href="/signin"><ScrambleText>Sign in</ScrambleText></a><a href="/privacy"><ScrambleText>Privacy</ScrambleText></a></nav>
        <span className="marketing-footer-copyright">© 2026 PoseTek</span>
      </div>
    </div>
  </footer>;
}
