import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { ShowcaseGallery, ShowcasePair, ShowcaseChapter } from "../home/ShowcaseGallery";
import { ScrambleText } from "../home/MarketingEffects";
import { useThemeColor } from "../../lib/use-theme-color";
import { useBodyBackground } from "../../lib/use-body-background";
import { MarketingJourney, MarketingCursor, RevealFrame } from "../home/MarketingJourney";
import { MarketingFooter } from "../home/MarketingFooter";
import { TEAM_ENQUIRY_HREF } from "../home/marketing-links";
import { injectClarity } from "../home/clarity";
import { ClubExplorer } from "./ClubExplorer";
import { PlayerEvidence } from "./PlayerEvidence";
import { DevelopmentJourney } from "./DevelopmentJourney";
import { sampleTeams, resolveTeam, resolvePlayer } from "./coach-samples";
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

function ClubPreview() {
  const team = sampleTeams[0], player = team.players[0];
  return <figure className="coach-hero-workspace" aria-label="Illustrative club workspace: Northfield FC, three teams and an individual player focus">
    <div className="coach-preview-bar"><span className="coach-mini-logo">P</span><span>Club workspace</span><span>Illustrative example</span></div>
    <div className="coach-preview-club"><span className="coach-club-crest" aria-hidden="true">N<span>FC</span></span><div><span className="coach-micro">CLUB TESTING DAY</span><strong>Northfield FC</strong><span>Team results and player workouts</span></div><span className="coach-preview-live" aria-hidden="true" /></div>
    <div className="coach-preview-teams">{sampleTeams.map(item => <div key={item.id} data-selected={item.id === team.id}><span>{item.name}</span><small>{item.players.length} sample players</small><span aria-hidden="true">↗</span></div>)}</div>
    <div className="coach-preview-main">
      <div className="coach-preview-pitch" aria-hidden="true"><svg viewBox="0 0 280 270"><rect x="20" y="18" width="240" height="232" rx="4"/><path d="M20 134H260M95 18V62H185V18M95 250V206H185V250"/><circle cx="140" cy="134" r="36"/><path className="coach-pitch-pass" d="M67 185L140 132L214 185M140 132V62"/>{[[140,62],[67,185],[214,185]].map(([x,y],i)=><g key={i}><circle className="coach-pitch-player" cx={x} cy={y} r="17"/><text x={x} y={y+4}>{[9,6,10][i]}</text></g>)}<circle className="coach-pitch-selected" cx="140" cy="132" r="23"/><text className="coach-pitch-number" x="140" y="137">{player.number}</text></svg><span>{team.name} · Selected player</span></div>
      <div className="coach-preview-focus"><span className="coach-micro">INDIVIDUAL NEXT STEP</span><span className="coach-preview-avatar" aria-hidden="true">{player.name.split(" ").map(part=>part[0]).join("")}</span><strong>{player.name}</strong><span>{player.position} · {team.name}</span><div><small>Training focus</small><b>{player.focus}</b></div><p>{player.completedSessions} of {player.plannedSessions} sessions completed</p></div>
    </div>
    <figcaption><span className="status-dot"/>Team test <span>→</span> Player plan <span>→</span> Retest</figcaption>
  </figure>;
}

export default function CoachesPage() {
  useThemeColor("#f1f1f3");
  useBodyBackground("#f1f1f3");
  const [teamId, setTeamId] = useState(sampleTeams[0].id);
  const [playerId, setPlayerId] = useState(sampleTeams[0].players[0].id);
  const [profileRequest, setProfileRequest] = useState(0);
  const team = resolveTeam(teamId), player = resolvePlayer(teamId, playerId);
  const openPlayerProfile = (id: string) => {
    setPlayerId(id);
    setProfileRequest(request => request + 1);
  };
  const selectTeam = (id: string) => { const next = resolveTeam(id); setTeamId(next.id); setPlayerId(next.players[0].id); };
  useEffect(() => {
    injectClarity();
    const root = document.documentElement, previous = root.style.scrollBehavior;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { root.style.scrollBehavior = media.matches ? "auto" : "smooth"; };
    update(); media.addEventListener("change", update);
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
    return () => { root.style.scrollBehavior = previous; media.removeEventListener("change", update); };
  }, []);
  return <MotionConfig reducedMotion="user"><div className="pt-home pt-coaches pt-revamp">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content">
      <section className="coach-hero shell" id="top" aria-labelledby="coach-hero-title">
        <div className="coach-hero-copy">
          <div className="hero-title-block">
            <p className="eyebrow hero-enter"><span className="status-dot"/>For coaches and club leaders</p>
            <h1 id="coach-hero-title" className="editorial-title"><span><span>Team</span></span>{" "}<span><span>testing.</span></span></h1>
          </div>
          <div className="hero-summary">
            <p className="coach-hero-description hero-enter">We test your players and give you a one-page team report. See who could use a check-in, prescribe soccer workouts for each player, and follow their progress between testing days.</p>
            <a className="hero-explore hero-enter" href={teamEnquiryHref}>
              <span className="hero-explore-label"><ScrambleText>Talk about testing your team</ScrambleText><span className="hero-explore-track" aria-hidden="true"/></span>
              <span className="hero-explore-orbit"><CoachArrow/></span>
            </a>
          </div>
        </div>
        <RevealFrame className="coach-hero-frame"><a className="marketing-visual-link" href="#club" data-preview-link="" data-cursor="Explore your club" aria-label="Explore the club workspace"><ClubPreview/></a></RevealFrame>
        <div className="coach-service-strip"><span><strong>Testing day</strong> team report</span><span><strong>Player workouts</strong> soccer drills</span><span><strong>Follow-up</strong> recorded sessions and retests</span></div>
      </section>
      <MarketingJourney audience="coaches" />
      <ShowcaseGallery>
        <ShowcasePair>
          <ShowcaseChapter id="club" titleId="club-title" number="01" label="The coach one-pager" title={<>Read your <em>team report.</em></>} description="See team averages and the best recorded result for each test. The coach check-in highlights players who may need a closer look. Choose a team to explore its sample report." artwork="coaches-club" kind="club" caption="Left and right dribbling · Sprint · Change of direction · Broad jump · Vertical jump" footer={<a href="#players">Explore a player profile ↓</a>}>
            <ClubExplorer teamId={teamId} onTeamChange={selectTeam} onPlayerSelect={openPlayerProfile} />
          </ShowcaseChapter>
          <ShowcaseChapter id="players" titleId="players-title" number="02" label="The player profile" title={<>Choose a <em>practice focus.</em></>} description="Start with a player’s result on one test. Compare it with teammates from that session and with tested age groups across the club when enough comparable results are available." artwork="coaches-evidence" kind="evidence" caption="Select a player to see a dribbling result and an individual soccer drill." requestToken={profileRequest} footer={<a href="/#tests">Explore the tests ↗</a>}>
            <PlayerEvidence teamId={teamId} playerId={playerId} onPlayerChange={setPlayerId} />
          </ShowcaseChapter>
        </ShowcasePair>
        <ShowcasePair>
          <ShowcaseChapter id="development" titleId="development-title" number="03" label="Workouts and follow-up" title={<>Follow the work. <em>Retest the skill.</em></>} description="Assign soccer drills around the player’s focus and review the sessions they log. At the next test, compare their own results to decide what to work on next." artwork="coaches-development" kind="development" caption="Follow the selected player’s plan, workout and retest.">
            <DevelopmentJourney key={player.id} player={player} teamName={team.name} />
          </ShowcaseChapter>
          <ShowcaseChapter id="contact" titleId="contact-title" number="04" label="Bring PoseTek to your club" title={<>Plan a <em>testing day.</em></>} description="Tell us which teams you coach and what you want to learn about your players. We’ll discuss testing and ongoing workout support with you." artwork="coaches-contact" caption="Testing and follow-up are tailored to your teams." action={{ href: teamEnquiryHref, label: "Talk about testing your team" }} footer={<a href="/signin">Coach sign in ↗</a>} />
        </ShowcasePair>
      </ShowcaseGallery>
    </main>
    <MarketingFooter audience="coaches" />
    <MarketingCursor />
  </div></MotionConfig>;
}
