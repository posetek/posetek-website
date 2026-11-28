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
import { coachSessionDate, getTeamCheckIn, getTeamTestReport, sampleTeams, resolveTeam, resolvePlayer } from "./coach-samples";
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
  const team = sampleTeams[0];
  const report = getTeamTestReport(team, "dribbleLeft");
  return <figure className="coach-hero-workspace">
    <figcaption className="coach-report-masthead"><span className="coach-mini-logo" aria-hidden="true">P</span> Coach one-pager <small>Fictional report</small></figcaption>
    <div className="coach-report-body">
      <div className="coach-report-heading">
        <span>Northfield FC · {team.name}</span>
        <strong>Team standings</strong>
        <p>Left dribble <span>·</span> {coachSessionDate}</p>
      </div>
      <dl className="coach-report-summary">
        <div><dt>Team average</dt><dd>{report.average.toFixed(2)} <small>s</small></dd></div>
        <div><dt>Players tested</dt><dd>{report.testedPlayers}</dd></div>
      </dl>
      <table className="coach-report-standings">
        <thead><tr><th>Player</th><th>Team percentile</th><th>Time</th></tr></thead>
        <tbody>{report.results.map(result => <tr key={result.name}>
          <th scope="row">{result.name}</th>
          <td><span className="coach-percentile"><i aria-hidden="true"><i style={{ width: `${result.percentile}%` }} /></i><span>{result.percentile}</span></span></td>
          <td>{result.value.toFixed(2)} s</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="coach-report-open">Explore this team report <span aria-hidden="true">↗</span></div>
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
            <p className="coach-hero-description hero-enter">We test your squad on the field and bring the results into one coach report. See how your team compares across club age groups, choose soccer drills for individual players, and follow the work they log between tests.</p>
            <a className="hero-explore hero-enter" href={teamEnquiryHref}>
              <span className="hero-explore-label"><ScrambleText>Plan a team testing day</ScrambleText><span className="hero-explore-track" aria-hidden="true"/></span>
              <span className="hero-explore-orbit"><CoachArrow/></span>
            </a>
          </div>
        </div>
        <RevealFrame className="coach-hero-frame">
          <a className="marketing-visual-link" href="#club" data-preview-link="" data-cursor="Open team report" aria-label="Explore the sample team report"
            onClick={event => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) setReportRequest(previous => previous + 1);
            }}>
            <TeamReportPreview />
          </a>
        </RevealFrame>
        <div className="coach-service-strip"><span><strong>On the field</strong> Six soccer tests</span><span><strong>In the report</strong> Team and club comparisons</span><span><strong>Between tests</strong> Player workouts and follow-up</span></div>
      </section>
      <MarketingJourney audience="coaches" />
      <ShowcaseGallery>
        <ShowcasePair>
          <ShowcaseChapter id="club" titleId="club-title" number="01" label="The coach one-pager" title={<>Where does our <em>team stand?</em></>} description="Select a test to see the standings for the squad that tested together. Your practice notes give the numbers context. The development pathway shows how your team’s average compares across tested age groups at the club." artwork="coaches-club" kind="club" caption="Left and right dribble, sprint, change of direction, broad jump and vertical jump." requestToken={reportRequest} demoAnchors={["team-report"]} footer={<a href="#players">Find a player’s practice focus ↓</a>}>
            <ClubExplorer teamId={teamId} onTeamChange={selectTeam} onPlayerSelect={openPlayerProfile} />
          </ShowcaseChapter>
          <ShowcaseChapter id="players" titleId="players-title" number="02" label="The player check-in" title={<>Who needs a <em>closer look?</em></>} description="In the sample U13 squad, Sam takes longer than the team average on the left dribble. Compare his result with what you see in practice, then give him a ball-control drill for his next session." artwork="coaches-evidence" kind="evidence" caption="Explore how a coach turns one player’s result into a soccer-specific workout." requestToken={profileRequest} footer={<a href="#development">Follow the workout ↓</a>}>
            <PlayerEvidence teamId={teamId} playerId={playerId} onPlayerChange={setPlayerId} onOpenPlan={() => setPlanRequest(previous => previous + 1)} />
          </ShowcaseChapter>
        </ShowcasePair>
        <ShowcasePair>
          <ShowcaseChapter id="development" titleId="development-title" number="03" label="Training and follow-up" title={<>What happened <em>between tests?</em></>} description="Give the player a drill and a cue to take onto the field. See who signed in and how much workout time was recorded. Repeat the same test to decide whether to keep the focus or change it." artwork="coaches-development" kind="development" requestToken={planRequest} caption="Follow a sample player through the assigned drill and the next testing day.">
            <DevelopmentJourney key={player.id} player={player} teamName={team.name} />
          </ShowcaseChapter>
          <ShowcaseChapter id="contact" titleId="contact-title" number="04" label="Club testing" title={<>Bring testing <em>to your club.</em></>} description="Tell us which squads you coach, when they train, and what you want to learn about them. We’ll plan a testing day and talk through how your staff can use the results at practice." artwork="coaches-contact" caption="Start with a conversation about your teams." action={{ href: teamEnquiryHref, label: "Plan a team testing day" }} footer={<a href="/signin">Coach sign in ↗</a>} />
        </ShowcasePair>
      </ShowcaseGallery>
    </main>
    <MarketingFooter audience="coaches" />
    <MarketingCursor />
  </div></MotionConfig>;
}
