import { useId } from "react";
import { getDribbleReport, resolveTeam, sampleTeams } from "./coach-samples";
import "./coaches-examples.css";

type ClubExplorerProps = {
  teamId: string;
  onTeamChange: (teamId: string) => void;
  onPlayerSelect: (playerId: string) => void;
};

export function ClubExplorer({ teamId, onTeamChange, onPlayerSelect }: ClubExplorerProps) {
  const team = resolveTeam(teamId);
  const report = getDribbleReport(team);
  const panelId = useId();
  return (
    <div className="cx-club" aria-label="Illustrative club workspace">
      <div className="cx-workspace-top"><span className="cx-club-crest" aria-hidden="true">N<span>FC</span></span><div><span className="cx-overline">Coach one-pager</span><h3>Northfield FC</h3></div><span className="cx-example-label">Illustrative example</span></div>
      <div className="cx-team-options" role="group" aria-label="Choose a sample team">
        {sampleTeams.map(item => <button type="button" key={item.id} aria-pressed={team.id === item.id} aria-controls={panelId} onClick={() => onTeamChange(item.id)}><span>{item.name}</span><span className="cx-team-option-detail">{item.coach}<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" /></svg></span></button>)}
      </div>
      <div id={panelId} className="cx-team-panel">
        <div className="cx-team-context" aria-live="polite">
          <span className="cx-overline">{team.name} testing session</span>
          <h4>Left-course dribble</h4>
          <p>Coach {team.coach} · {report.testedPlayers} tested players</p>
          <dl className="cx-report-stats">
            <div><dt>Team average</dt><dd>{report.averageSeconds.toFixed(2)} s</dd></div>
            <div><dt>Fastest time</dt><dd>{report.fastestSeconds.toFixed(2)} s</dd></div>
          </dl>
          <p className="cx-report-check"><strong>Coach check-in</strong> {report.checkInName} took the longest on this course. Open the profile to review a practice focus.</p>
        </div>
        <div className="cx-roster">
          <div className="cx-roster-heading"><span>Featured players · open a profile</span><span>Recorded time</span></div>
          {team.players.map(player => (
            <button className="cx-roster-row cx-profile-link" key={player.id} type="button" onClick={() => onPlayerSelect(player.id)} aria-label={`Open ${player.name}’s sample profile`}>
              <span className="cx-shirt-number" aria-hidden="true">{String(player.number).padStart(2, "0")}</span>
              <span className="cx-roster-player"><strong>{player.name}</strong><small>{player.position}</small></span>
              <span className="cx-focus-tag">{player.latestDribbleSeconds.toFixed(2)} s <span aria-hidden="true">↗</span></span>
            </button>
          ))}
        </div>
      </div>
      <div className="cx-workspace-foot"><span className="cx-small-dot" aria-hidden="true" /><p>Managers see the club. Coaches work with their assigned teams.</p></div>
    </div>
  );
}
