import { useEffect, useState, type CSSProperties } from "react";
import { MotionConfig } from "motion/react";
import { ShowcaseGallery, ShowcasePair, ShowcaseChapter } from "./ShowcaseGallery";
import { ScrambleText } from "./MarketingEffects";
import { useThemeColor } from "../../lib/use-theme-color";
import { useBodyBackground } from "../../lib/use-body-background";
import { TestCards } from "./TestCards";
import { MarketingJourney, MarketingCursor, RevealFrame } from "./MarketingJourney";
import { MarketingFooter } from "./MarketingFooter";
import { openDemoFromLink } from "./marketing-links";
import { LazyHomepageDemo } from "./LazyHomepageDemo";
import { AthleteProfile } from "./AthleteProfile";
import { coachWorkoutRequest } from "./product/product-demo";
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
  const [profileRequest, setProfileRequest] = useState(() =>
    typeof window !== "undefined" && window.location.hash === "#profile" ? 1 : 0
  );
  const [workoutRequest, setWorkoutRequest] = useState({ text: "", id: 0 });

  const openWorkout = (text: string) => {
    setWorkoutRequest(previous => ({ text, id: previous.id + 1 }));
  };

  useEffect(() => {
    document.title = "Soccer testing and workouts for players | PoseTek";
    injectClarity();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    const updateMotion = () => { root.style.scrollBehavior = media.matches ? "auto" : "smooth"; };
    updateMotion();
    media.addEventListener("change", updateMotion);
    const followTechniqueLink = () => {
      if (window.location.hash === "#technique") {
        setSelectedDrill("shooting");
        setRequestedDrill({ key: "shooting" });
      }
    };
    followTechniqueLink();
    window.addEventListener("hashchange", followTechniqueLink);
    const hash = window.location.hash.slice(1);
    if (hash && hash !== "profile") document.getElementById(hash)?.scrollIntoView();
    return () => {
      window.removeEventListener("hashchange", followTechniqueLink);
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
            <p className="eyebrow hero-enter"><span className="status-dot" />For soccer players and families</p>
            <p className="hero-question">What am I doing well?</p>
            <h1 id="hero-title" className="editorial-title"><span><span>What do I</span></span>{" "}<span><span>train next?</span></span></h1>
            </div>
            <div className="hero-summary">
            <p className="hero-description hero-enter" style={{ "--enter-delay": "160ms" } as CSSProperties}>Your soccer tests show where you stand today. See how you compare with your team and which drill to take to your next practice.</p>
            <div className="hero-actions hero-enter" style={{ "--enter-delay": "240ms" } as CSSProperties}>
              <a className="hero-explore" href="#profile" onClick={event => openDemoFromLink(event, () => setProfileRequest(previous => previous + 1))}><span className="hero-explore-label"><ScrambleText>Explore a player profile</ScrambleText><span className="hero-explore-track" aria-hidden="true" /></span><span className="hero-explore-orbit" aria-hidden="true"><Arrow down /></span></a>
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
            <ShowcaseChapter id="tests" titleId="tests-title" number="01" label="Test & review" title={<>Six soccer tests, <em>rep by rep.</em></>} description="Choose one of six soccer tests and replay a recorded rep frame by frame. See how your steps change in a sprint, how you land a jump, or how close you keep the ball through a turn." artwork="players-testing" kind="movement" caption="Each recording pairs the movement with the measurements available for that rep." demoAnchors={["how-it-works", "technique"]} footer={<a href="#profile">Put it in perspective ↓</a>}>
              <div className="assessment-workspace">
                <div className="assessment-replay"><LazyHomepageDemo load={loadMovement} demoProps={{ requestedDrill, onDrillChange: setSelectedDrill, hideChoices: true }} forceLoad kind="movement" label="Recorded movement analysis" /></div>
                <TestCards selectedDrill={selectedDrill} onWatch={key => { setSelectedDrill(key); setRequestedDrill({ key }); }} />
              </div>
            </ShowcaseChapter>
            <ShowcaseChapter id="profile" titleId="profile-title" number="02" label="Player profile" title={<>Where am I on the <em>development pathway?</em></>} description="Alex is a fictional U17 midfielder. Each dot marks one of his own testing days. See how his result compares with the average and spread for each tested age group at his club." artwork="players-profile" kind="profile" caption="Club age comparisons appear when enough players have taken the same test." requestToken={profileRequest} footer={<a href="#training">Explore soccer workouts ↓</a>}>
              <div className="profile-showcase"><AthleteProfile onOpenWorkout={() => openWorkout(coachWorkoutRequest)} /></div>
            </ShowcaseChapter>
          </ShowcasePair>
          <ShowcasePair>
            <ShowcaseChapter id="training" titleId="training-title" number="03" label="Workout planner" title={<>What can I practice <em>this week?</em></>} description="Alex is working on close control. Try the Figure-8 dribble to practice keeping the ball within reach as you turn around two cones." artwork="players-training" kind="workout" caption="In your own Stats, start a workout or build a six-week plan around your results and schedule." requestToken={workoutRequest.id} footer={<a href="#retest">Close the loop ↓</a>}>
              <LazyHomepageDemo load={loadWorkout} demoProps={{ initialRequest: workoutRequest.text, requestId: workoutRequest.id }} forceLoad kind="workout" label="Interactive workout planner" />
            </ShowcaseChapter>
            <ShowcaseChapter id="ai-coach" aliases={["retest"]} titleId="retest-title" number="04" label="Retest with AI Coach" title={<>Train. Retest. <em>See what changes.</em></>} description="Alex ran the same dribbling course in 6.62 seconds on the first test and 6.18 on the latest. Ask the sample AI Coach what changed across all four tests." artwork="players-coach" kind="coach" caption="Sample athlete · Previous and latest results · Your next training focus" footer={<a href="#mobile-app">Explore the mobile app ↓</a>}>
              <LazyHomepageDemo load={loadCoach} demoProps={{ onOpenWorkout: openWorkout }} forceLoad kind="coach" label="AI Coach sample conversation" />
            </ShowcaseChapter>
          </ShowcasePair>
          <ShowcasePair>
            <ShowcaseChapter id="mobile-app" titleId="closing-title" number="05" label="The PoseTek mobile app" title={<>Your next session. <em>In your pocket.</em></>} description="Sign in to see your own Stats. If you’ve already tested, your linked results are waiting. If your first assessment is coming up, your results will appear afterward." artwork="players-mobile" kind="mobile" caption="Interactive preview · No workout is recorded" footer={<a href="/bookPerformanceTest.html">Establish your baseline ↗</a>}>
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
