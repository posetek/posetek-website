import { useId } from "react";
import { clubDribbleBenchmarks, coachSessionDate, getDribbleReport, reportTests, resolvePlayer, resolveTeam } from "./coach-samples";
import { CoachPathway } from "./ClubExplorer";
import { drillMedia } from "../home/product/drill-media";
import "./coaches-examples.css";

export function PlayerEvidence({ teamId, playerId, onPlayerChange, onOpenPlan }: { teamId: string; playerId: string; onPlayerChange: (playerId: string) => void; onOpenPlan?: () => void }) {
  const team = resolveTeam(teamId);
  const player = resolvePlayer(teamId, playerId);
  const report = getDribbleReport(team);
  const drill = drillMedia[player.drillId];
  const panelId = useId();
  return <div className="cx-evidence" aria-label="Illustrative player evidence">
    <div className="cx-evidence-top"><span>{team.name} · Testing session · {coachSessionDate}</span><span className="cx-example-label">Illustrative example</span></div>
    <label className="cx-player-select">Choose a sample player<select value={player.id} onChange={event => onPlayerChange(event.target.value)}>{team.players.map(item => <option key={item.id} value={item.id}>{item.name} · {item.position}</option>)}</select></label>
    <div className="cx-evidence-layout">
      <div className="cx-player-options" role="group" aria-label={`Choose a sample player from ${team.name}`}><span className="cx-overline">Choose a player</span>{team.players.map(item => <button type="button" key={item.id} aria-pressed={item.id === player.id} aria-controls={panelId} onClick={() => onPlayerChange(item.id)}><span className="cx-shirt-number" aria-hidden="true">{String(item.number).padStart(2, "0")}</span><span><strong>{item.name}</strong><small>{item.position}</small></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg></button>)}</div>
      <div id={panelId} className="cx-player-detail">
        <div className="cx-player-heading"><div><span className="cx-overline">Player profile</span><h3>{player.name}</h3></div><span>{player.position} · {team.name}</span></div>
        <div className="cx-player-insight">
          <CoachPathway team={team} test={reportTests[0]} player={player} />
          <div className="cx-priority">
            <div className="cx-assessment">
              <span className="cx-overline">Left-course dribble</span>
              <p><strong>{player.latestDribbleSeconds.toFixed(2)}</strong><span>sec</span></p>
              <span className="cx-assessment-note">{team.name} averaged {report.averageSeconds.toFixed(2)} s across {report.testedPlayers} players who took this test.</span>
            </div>
            <div className="cx-training-focus" aria-live="polite">
              <span className="cx-overline">Next training focus</span><h4>{player.focus}</h4>
              <p>Assigned drill · {drill.name}</p>
              <p>{player.cue}</p>
              {onOpenPlan && <button className="cx-check-in-link" type="button" onClick={onOpenPlan}>Open {player.name.split(" ")[0]}’s workout <span aria-hidden="true">↗</span></button>}
            </div>
          </div>
        </div>
        <details className="cx-pathway">
          <summary>Club development pathway</summary>
          <p>Compare this result with the average time for each tested age group on the same course in this club division. Each group represents different players.</p>
          <dl>{clubDribbleBenchmarks.map(group => (
            <div key={group.ageGroup} data-selected={team.name === group.ageGroup}>
              <dt>{group.ageGroup} <small>· {group.testedPlayers} tested</small></dt>
              <dd>{group.meanSeconds.toFixed(2)} sec</dd>
            </div>
          ))}</dl>
          <p>These illustrative benchmarks appear only where enough players have comparable results.</p>
        </details>
      </div>
    </div>
  </div>;
}
