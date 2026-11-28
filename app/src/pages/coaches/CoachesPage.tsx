import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { ShowcaseGallery, ShowcasePair, ShowcaseChapter } from "../home/ShowcaseGallery";
import { ScrambleText } from "../home/MarketingEffects";
import { useThemeColor } from "../../lib/use-theme-color";
import { useBodyBackground } from "../../lib/use-body-background";
import { MarketingJourney, MarketingCursor, RevealFrame } from "../home/MarketingJourney";
import { MarketingFooter } from "../home/MarketingFooter";
import { openDemoFromLink, TEAM_ENQUIRY_HREF } from "../home/marketing-links";
import { injectClarity } from "../home/clarity";
import { ClubExplorer } from "./ClubExplorer";
import { PlayerEvidence } from "./PlayerEvidence";
import { DevelopmentJourney } from "./DevelopmentJourney";
import { getTeamCheckIn, sampleTeams, resolveTeam, resolvePlayer } from "./coach-samples";
import recordedDribble from "./media/recorded-dribble.svg?url";
import "../home/magic.css";
import "../home/home.scss";
import "../home/scrolling-home.scss";
import "../home/mobile-app-preview.css";
import "./coaches.scss";
import "../home/revamp.scss";
import "../home/marketing-composition.scss";
import "../home/marketing-demo-cards.scss";

const teamEnquiryHref = TEAM_ENQUIRY_HREF;
export function CoachArrow({ down = false }: { down?: boolean }) {
  return <svg className="arrow" data-direction={down ? "down" : "right"} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={down ? "M12 4v15m-6-6 6 6 6-6" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.7" /></svg>;
}

function TeamReportPreview() {
  return <figure className="coach-hero-workspace">
    <img className="coach-field-image" src={recordedDribble} width="900" height="450" fetchPriority="high"
      alt="Three frames from PoseTek’s recorded dribble test. Outbound 2.91 seconds, turn 2.12 seconds, return 2.45 seconds." />
    <figcaption className="coach-field-caption">
      <div className="coach-field-result">
        <span className="coach-field-value">7.48<small> s</small></span>
        <span className="coach-field-label">Total rep time</span>
      </div>
      <span className="coach-field-open">Open report <span aria-hidden="true">↗</span></span>
    </figcaption>
  </figure>;
}

export default function CoachesPage() {
  useThemeColor("#f1f1f3");
  useBodyBackground("#f1f1f3");
  const [teamId, setTeamId] = useState(sampleTeams[0].id);
  const [playerId, setPlayerId] = useState(() => getTeamCheckIn(sampleTeams[0]).id);
  // A visitor can follow the report link while the server-rendered page is still loading.
  const [reportRequest, setReportRequest] = useState(() =>
    typeof window !== "undefined" && window.location.hash === "#club" ? 1 : 0
  );
  const [profileRequest, setProfileRequest] = useState(0);
  const [planRequest, setPlanRequest] = useState(0);
  const team = resolveTeam(teamId), player = resolvePlayer(teamId, playerId);
  const openPlayerProfile = (id: string) => {
    setPlayerId(id);
    setProfileRequest(request => request + 1);
  };
  const selectTeam = (id: string) => { const next = resolveTeam(id); setTeamId(next.id); setPlayerId(getTeamCheckIn(next).id); };
  useEffect(() => {
    injectClarity();
    const root = document.documentElement, previous = root.style.scrollBehavior;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { root.style.scrollBehavior = media.matches ? "auto" : "smooth"; };
    update(); media.addEventListener("change", update);
    const hash = window.location.hash.slice(1);
    if (hash && hash !== "club") document.getElementById(hash)?.scrollIntoView();
    return () => { root.style.scrollBehavior = previous; media.removeEventListener("change", update); };
  }, []);
  return <MotionConfig reducedMotion="user"><div className="pt-home pt-coaches pt-revamp">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content">
      <section className="coach-hero shell" id="top" aria-labelledby="coach-hero-title">
        <div className="coach-hero-copy">
          <div className="hero-title-block">
            <p className="eyebrow hero-enter"><span className="status-dot"/>For coaches and club leaders</p>
            <h1 id="coach-hero-title" className="editorial-title"><span><span>Team testing</span></span>{" "}<span><span>for the next</span></span>{" "}<span><span>practice.</span></span></h1>
          </div>
          <div className="hero-summary">
            <p className="coach-hero-description hero-enter">Six on-field tests show where your squad stands. Use your coach report to choose a drill for each player and follow their work between testing days.</p>
            <a className="hero-explore hero-enter" href={teamEnquiryHref}>
              <span className="hero-explore-label"><ScrambleText>Plan a team testing day</ScrambleText><span className="hero-explore-track" aria-hidden="true"/></span>
              <span className="hero-explore-orbit"><CoachArrow/></span>
            </a>
          </div>
        </div>
        <RevealFrame className="coach-hero-frame">
          <a className="marketing-visual-link" href="#club" data-preview-link="" data-cursor="Open team report" aria-label="Explore the sample team report"
            onClick={event => openDemoFromLink(event, () => setReportRequest(previous => previous + 1))}>
            <TeamReportPreview />
          </a>
        </RevealFrame>
      </section>
      <MarketingJourney audience="coaches" />
      <ShowcaseGallery>
        <ShowcasePair>
          <ShowcaseChapter id="club" titleId="club-title" number="01" label="The coach one-pager" title={<>Where does our <em>team stand?</em></>} description="Choose a test to see team standings. The pathway compares your squad’s average with players in each tested club age group." artwork="coaches-club" kind="club" requestToken={reportRequest} demoAnchors={["team-report"]} footer={<a href="#players">Find a player’s practice focus ↓</a>}>
            <ClubExplorer teamId={teamId} onTeamChange={selectTeam} onPlayerSelect={openPlayerProfile} />
          </ShowcaseChapter>
          <ShowcaseChapter id="players" titleId="players-title" number="02" label="The player check-in" title={<>Who needs a <em>closer look?</em></>} description="Sam’s left dribble takes longer than his team’s average. His coach pairs that result with a practice observation and assigns a Figure-8 dribble." artwork="coaches-evidence" kind="evidence" requestToken={profileRequest} footer={<a href="#development">Follow the workout ↓</a>}>
            <PlayerEvidence teamId={teamId} playerId={playerId} onPlayerChange={setPlayerId} onOpenPlan={() => setPlanRequest(previous => previous + 1)} />
          </ShowcaseChapter>
        </ShowcasePair>
        <ShowcasePair>
          <ShowcaseChapter id="development" titleId="development-title" number="03" label="Training and follow-up" title={<>What happened <em>between tests?</em></>} description="See how many workout minutes each player logged. Follow a player’s drill and compare their next test with the last one." artwork="coaches-development" kind="development" requestToken={planRequest} demoAnchors={["workout-time"]}>
            <DevelopmentJourney key={player.id} player={player} team={team} />
          </ShowcaseChapter>
          <ShowcaseChapter id="contact" titleId="contact-title" number="04" label="Club testing" title={<>Bring testing <em>to your club.</em></>} description="Tell us about your squads and their training schedule. We’ll plan a testing day around what your staff wants to learn." artwork="coaches-contact" action={{ href: teamEnquiryHref, label: "Plan a team testing day" }} footer={<a href="/signin">Coach sign in ↗</a>} />
        </ShowcasePair>
      </ShowcaseGallery>
    </main>
    <MarketingFooter audience="coaches" />
    <MarketingCursor />
  </div></MotionConfig>;
}
