import { useEffect, useState, type CSSProperties } from "react";
import { MotionConfig } from "motion/react";
import { MarketingGallery } from "./MarketingGallery";
import { ScrambleText } from "./MarketingEffects";
import { useThemeColor } from "../../lib/use-theme-color";
import { useBodyBackground } from "../../lib/use-body-background";
import { TestCards } from "./TestCards";
import { HeadingReveal, MarketingJourney, MarketingCursor, RevealFrame } from "./MarketingJourney";
import { MarketingFooter } from "./MarketingFooter";
import { LazyHomepageDemo } from "./LazyHomepageDemo";
import { AthleteProfile } from "./AthleteProfile";
import { PitchVisual } from "./PitchVisual";
import { MobileAppPreview } from "./MobileAppPreview";
import { MarketingHeader } from "./MarketingHeader";
import { injectClarity } from "./clarity";
import "./magic.css";
import "./home.scss";
import "./scrolling-home.scss";
import "./mobile-app-preview.css";
import "./revamp.scss";
import "./marketing-composition.scss";
import "./marketing-demo-cards.scss";

const loadMovement = () => import("./movement/MovementDemo").then(module => ({ default: module.MovementDemo }));
const loadTechnique = () => import("./technique/TechniqueDemo");
const loadCoach = () => import("./product/CoachDemo");
const loadWorkout = () => import("./product/WorkoutDemo");

function Arrow({ down = false }: { down?: boolean }) {
  return <svg className="arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={down ? { transform: "rotate(90deg)" } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export default function HomePage() {
  useThemeColor("#f1f1f3");
  useBodyBackground("#f1f1f3");
  const [selectedDrill, setSelectedDrill] = useState("sprint");
  const [requestedDrill, setRequestedDrill] = useState<{ key: string } | null>(null);
  const [workoutRequest, setWorkoutRequest] = useState({ text: "", id: 0 });

  const openWorkout = (text: string) => {
    setWorkoutRequest(previous => ({ text, id: previous.id + 1 }));
    document.getElementById("training")?.scrollIntoView();
    document.getElementById("training-title")?.focus({ preventScroll: true });
  };

  useEffect(() => {
    document.title = "PoseTek | Start with evidence. Train what’s next.";
    injectClarity();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    const updateMotion = () => { root.style.scrollBehavior = media.matches ? "auto" : "smooth"; };
    updateMotion();
    media.addEventListener("change", updateMotion);
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
    return () => {
      root.style.scrollBehavior = previous;
      media.removeEventListener("change", updateMotion);
    };
  }, []);

  return <MotionConfig reducedMotion="user">
    <div className="pt-home pt-revamp">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <MarketingHeader audience="players" />

      <main id="main-content">
        <section className="hero shell" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="hero-title-block">
            <p className="eyebrow hero-enter"><span className="status-dot" />For clubs, coaches, and players</p>
            <p className="hero-question">What should the player train next?</p>
            <h1 id="hero-title" className="editorial-title"><span><span>Start with</span></span><span><span>evidence.</span></span></h1>
            </div>
            <div className="hero-summary">
            <p className="hero-description hero-enter" style={{ "--enter-delay": "160ms" } as CSSProperties}>Six performance tests. One connected mobile app.<br />Understand how a player moves, find their focus,<br className="desktop-break" /> and turn evidence into their next training session.</p>
            <div className="hero-actions hero-enter" style={{ "--enter-delay": "240ms" } as CSSProperties}>
              <a className="hero-explore" href="#tests"><span className="hero-explore-label"><ScrambleText>See your game differently</ScrambleText><span className="hero-explore-track" aria-hidden="true" /></span><span className="hero-explore-orbit" aria-hidden="true"><Arrow down /></span></a>
            </div>
            <a className="hero-mobile-link" href="#mobile-app"><svg viewBox="0 0 16 22" fill="none" aria-hidden="true"><rect x="2" y="1" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="1.3"/><path d="M6 4h4M6 18h4" stroke="currentColor" strokeLinecap="round"/></svg><ScrambleText>Explore the PoseTek mobile app</ScrambleText> <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <RevealFrame className="hero-art">
            <div className="art-coordinate" aria-hidden="true">PT / PERFORMANCE SYSTEM</div>
            <PitchVisual />
          </RevealFrame>
          <div className="hero-index" aria-label="PoseTek capabilities"><span><strong>06</strong>Performance tests</span><span><strong>33</strong>Tracked joints</span><span><strong>01</strong>Connected system</span><a href="#tests" aria-label="Explore the six tests"><Arrow down /></a></div>
        </section>

        <MarketingJourney audience="players" />
        <MarketingGallery>
        <section className="assessment shell section" id="tests" aria-labelledby="tests-title">
          <div className="assessment-workspace">
            <div id="how-it-works" className="assessment-replay"><RevealFrame>
              <LazyHomepageDemo load={loadMovement} demoProps={{ requestedDrill, onDrillChange: setSelectedDrill, hideChoices: true }} forceLoad={!!requestedDrill} kind="movement" label="Recorded movement analysis" />
            </RevealFrame></div>
            <TestCards selectedDrill={selectedDrill} onWatch={key => { setSelectedDrill(key); setRequestedDrill({ key }); }} />
          </div>

            <HeadingReveal className="section-heading"><div><p className="eyebrow">01 / Test. See. Understand.</p><h2 id="tests-title">Six tests.<br /><em>Every rep tells a story.</em></h2></div><p className="section-description">Six tests reveal how you move, control the ball, and strike.</p></HeadingReveal>
          <div className="demo-caption"><span>Recorded reps · Six tests · Frame-by-frame playback</span><a className="button-text" href="#profile"><ScrambleText>Put it in perspective</ScrambleText> <Arrow down /></a></div>
        </section>

        <section className="profile-section section" id="profile" aria-labelledby="profile-title">
          <div className="profile-layout shell">
            <RevealFrame className="profile-showcase"><AthleteProfile /></RevealFrame>
            <HeadingReveal className="profile-copy"><p className="eyebrow">02 / One profile. The whole picture.</p><h2 id="profile-title">Put performance<br /><em>in perspective.</em></h2><p>Bring results together, compare benchmarks, and identify what to train next.</p><div className="profile-benefits"><span><i />Explore five skill areas</span><span><i />Review drill-specific results</span><span><i />Track progress over time</span></div><a className="button-text" href="#training"><ScrambleText>Find the next step</ScrambleText> <Arrow down /></a></HeadingReveal>
          </div>
        </section>

        <section className="workout-section section" id="training" aria-labelledby="training-title">
          <div className="shell">
            <RevealFrame><LazyHomepageDemo load={loadWorkout} demoProps={{ initialRequest: workoutRequest.text, requestId: workoutRequest.id }} forceLoad={!!workoutRequest.text} kind="workout" label="Interactive workout planner" /></RevealFrame>
            <HeadingReveal className="section-heading"><div><p className="eyebrow">03 / Workout planner</p><h2 id="training-title" tabIndex={-1}>Turn results into<br /><em>a focused plan.</em></h2></div><p className="section-description">Turn your focus into guided drills that fit your time and energy.</p></HeadingReveal>
            <div className="demo-caption"><span>Sample workout · Set your focus · Try a guided session</span><a className="button-text" href="#retest"><ScrambleText>Close the loop</ScrambleText> <Arrow down /></a></div>
          </div>
        </section>

        <section className="coach-section retest-section shell section" id="ai-coach" aria-labelledby="retest-title">
          <span id="retest" className="section-anchor" />
          <RevealFrame><LazyHomepageDemo load={loadCoach} demoProps={{ onOpenWorkout: openWorkout }} kind="coach" label="AI Coach sample conversation" /></RevealFrame>
            <HeadingReveal className="section-heading"><div><p className="eyebrow">04 / Retest with AI Coach</p><h2 id="retest-title">Train. Retest.<br /><em>See what changes.</em></h2></div><p className="section-description">Repeat the tests. Understand what changed. Choose your next training focus.</p></HeadingReveal>
          <div className="demo-caption"><span>Sample athlete · Previous and latest results · Your next training focus</span><a className="button-text" href="#technique"><ScrambleText>Look closer at technique</ScrambleText> <Arrow down /></a></div>
        </section>

        <section className="technique-section shell section" id="technique" aria-labelledby="technique-title">
          <RevealFrame><LazyHomepageDemo load={loadTechnique} demoProps={{}} kind="technique" label="Recorded technique analysis" /></RevealFrame>
            <HeadingReveal className="section-heading"><div><p className="eyebrow">05 / Technique analysis</p><h2 id="technique-title">The rep. The detail.<br /><em>The difference.</em></h2></div><p className="section-description">Pause at key moments. Compare technique. Find a clear coaching focus.</p></HeadingReveal>
          <div className="demo-caption"><span>One kick · One cue at a time · Compare the same moment</span><a className="button-text" href="/bookPerformanceTest.html"><ScrambleText>Establish your baseline</ScrambleText> <Arrow /></a></div>
        </section>

        <section className="closing section" id="mobile-app" aria-labelledby="closing-title"><div className="shell closing-content mobile-closing-layout"><RevealFrame className="mobile-showcase"><MobileAppPreview /></RevealFrame>
            <HeadingReveal className="mobile-closing-copy"><p className="eyebrow">The PoseTek mobile app</p><h2 id="closing-title">Your next session.<br /><em>In your pocket.</em></h2><p>Review your results. Follow your plan. Take your next training step with you.</p><div className="closing-actions"><a className="button-primary" href="/bookPerformanceTest.html"><ScrambleText>Book a performance test</ScrambleText> <Arrow /></a><a className="button-text" href="/signin"><ScrambleText>Coach sign in</ScrambleText> <Arrow /></a></div></HeadingReveal></div></section>
        </MarketingGallery>
      </main>
      <MarketingFooter audience="players" />
      <MarketingCursor />
    </div>
  </MotionConfig>;
}
