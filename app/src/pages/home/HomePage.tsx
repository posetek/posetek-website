import { useEffect, useState, type CSSProperties } from "react";
import { MotionConfig } from "motion/react";
import { ShowcaseGallery, ShowcasePair, ShowcaseChapter } from "./ShowcaseGallery";
import { ScrambleText } from "./MarketingEffects";
import { useThemeColor } from "../../lib/use-theme-color";
import { useBodyBackground } from "../../lib/use-body-background";
import { TestCards } from "./TestCards";
import { MarketingJourney, MarketingCursor, RevealFrame } from "./MarketingJourney";
import { MarketingFooter } from "./MarketingFooter";
import { LazyHomepageDemo } from "./LazyHomepageDemo";
import { AthleteProfile } from "./AthleteProfile";
import { PitchVisual } from "./PitchVisual";
import { MobileAppPreview } from "./MobileAppPreview";
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
  return <svg className="arrow" data-direction={down ? "down" : "right"} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={down ? "M12 4v15m-6-6 6 6 6-6" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export default function HomePage() {
  useThemeColor("#f1f1f3");
  useBodyBackground("#f1f1f3");
  const [selectedDrill, setSelectedDrill] = useState("sprint");
  const [requestedDrill, setRequestedDrill] = useState<{ key: string } | null>(null);
  const [workoutRequest, setWorkoutRequest] = useState({ text: "", id: 0 });

  const openWorkout = (text: string) => {
    setWorkoutRequest(previous => ({ text, id: previous.id + 1 }));
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

      <main id="main-content">
        <section className="hero shell" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="hero-title-block">
            <p className="eyebrow hero-enter"><span className="status-dot" />For clubs, coaches, and players</p>
            <p className="hero-question">What should the player train next?</p>
            <h1 id="hero-title" className="editorial-title"><span><span>Start with</span></span><span><span>evidence.</span></span></h1>
            </div>
            <div className="hero-summary">
            <p className="hero-description hero-enter" style={{ "--enter-delay": "160ms" } as CSSProperties}>Six performance tests. One connected mobile app.<br />{" "}Understand how a player moves, find their focus,<br className="desktop-break" /> and turn evidence into their next training session.</p>
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
        <ShowcaseGallery fluid>
          <ShowcasePair>
            <ShowcaseChapter id="tests" titleId="tests-title" number="01" label="Test & review" title={<>Six tests. <em>Every rep tells a story.</em></>} description="See how you move, control the ball, and strike. Choose a recorded rep to explore." artwork="players-testing" kind="movement" caption="Recorded reps · Six tests · Frame-by-frame playback" demoAnchors={["how-it-works"]} footer={<a href="#profile">Put it in perspective ↓</a>}>
              <div className="assessment-workspace">
                <div className="assessment-replay"><LazyHomepageDemo load={loadMovement} demoProps={{ requestedDrill, onDrillChange: setSelectedDrill, hideChoices: true }} forceLoad kind="movement" label="Recorded movement analysis" /></div>
                <TestCards selectedDrill={selectedDrill} onWatch={key => { setSelectedDrill(key); setRequestedDrill({ key }); }} />
              </div>
            </ShowcaseChapter>
            <ShowcaseChapter id="profile" titleId="profile-title" number="02" label="Athlete profile" title={<>Put performance <em>in perspective.</em></>} description="Bring results together, compare benchmarks, and identify what to train next." artwork="players-profile" kind="profile" caption="Five skill areas · Drill-specific results · Progress over time" footer={<a href="#training">Find the next step ↓</a>}>
              <div className="profile-showcase"><AthleteProfile /></div>
            </ShowcaseChapter>
          </ShowcasePair>
          <ShowcasePair>
            <ShowcaseChapter id="training" titleId="training-title" number="03" label="Workout planner" title={<>Turn results into <em>a focused plan.</em></>} description="Turn your focus into guided drills that fit your time and energy." artwork="players-training" kind="workout" caption="Sample workout · Set your focus · Try a guided session" requestToken={workoutRequest.id} footer={<a href="#retest">Close the loop ↓</a>}>
              <LazyHomepageDemo load={loadWorkout} demoProps={{ initialRequest: workoutRequest.text, requestId: workoutRequest.id }} forceLoad kind="workout" label="Interactive workout planner" />
            </ShowcaseChapter>
            <ShowcaseChapter id="ai-coach" aliases={["retest"]} titleId="retest-title" number="04" label="Retest with AI Coach" title={<>Train. Retest. <em>See what changes.</em></>} description="Repeat the tests. Understand what changed. Choose your next training focus." artwork="players-coach" kind="coach" caption="Sample athlete · Previous and latest results · Your next training focus" footer={<a href="#technique">Look closer at technique ↓</a>}>
              <LazyHomepageDemo load={loadCoach} demoProps={{ onOpenWorkout: openWorkout }} forceLoad kind="coach" label="AI Coach sample conversation" />
            </ShowcaseChapter>
          </ShowcasePair>
          <ShowcasePair>
            <ShowcaseChapter id="technique" titleId="technique-title" number="05" label="Technique analysis" title={<>The rep. The detail. <em>The difference.</em></>} description="Pause at key moments. Compare technique. Find a clear coaching focus." artwork="players-technique" kind="technique" caption="One kick · One cue at a time · Compare the same moment" footer={<a href="#mobile-app">Take the next step with you ↓</a>}>
              <LazyHomepageDemo load={loadTechnique} demoProps={{}} forceLoad kind="technique" label="Recorded technique analysis" />
            </ShowcaseChapter>
            <ShowcaseChapter id="mobile-app" titleId="closing-title" number="06" label="The PoseTek mobile app" title={<>Your next session. <em>In your pocket.</em></>} description="Review your results. Follow your plan. Take your next training step with you." artwork="players-mobile" kind="mobile" caption="Interactive preview · No workout is recorded" footer={<a href="/bookPerformanceTest.html">Establish your baseline ↗</a>}>
              <div className="mobile-showcase"><MobileAppPreview /></div>
            </ShowcaseChapter>
          </ShowcasePair>
        </ShowcaseGallery>
      </main>
      <MarketingFooter audience="players" />
      <MarketingCursor />
    </div>
  </MotionConfig>;
}
