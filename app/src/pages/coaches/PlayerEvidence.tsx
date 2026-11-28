import { useId } from "react";
import { clubDribbleBenchmarks, getDribbleReport, profileAreas, resolvePlayer, resolveTeam, type SamplePlayer } from "./coach-samples";
import "./coaches-examples.css";

function ProfileRadar({ player }: { player: SamplePlayer }) {
  const titleId = useId();
  const descriptionId = useId();
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    return [170 + Math.cos(angle) * radius, 153 + Math.sin(angle) * radius];
  };
  const points = (radius: number) => profileAreas.map((_, index) => point(index, radius).join(",")).join(" ");
  return <figure className="cx-profile-radar"><figcaption><strong>Skill profile</strong><span>Illustrative scores / 100</span></figcaption><svg viewBox="0 0 340 304" role="img" aria-labelledby={`${titleId} ${descriptionId}`}><title id={titleId}>{`${player.name} — sample player profile`}</title><desc id={descriptionId}>{profileAreas.map((area, index) => `${area}: ${player.scores[index]} out of 100`).join(". ")}. Fictional scores for illustration.</desc>{[.25, .5, .75, 1].map(scale => <polygon key={scale} className="cx-radar-grid" points={points(90 * scale)} />)}{profileAreas.map((area, index) => { const [x, y] = point(index, 90); return <line className="cx-radar-axis" key={area} x1="170" y1="153" x2={x} y2={y} />; })}<polygon className="cx-radar-shape" points={player.scores.map((score, index) => point(index, score * .9).join(",")).join(" ")} />{profileAreas.map((area, index) => { const [x, y] = point(index, player.scores[index] * .9); const [labelX, labelY] = point(index, 126); return <g key={area}><circle className="cx-radar-point" cx={x} cy={y} r="3.5" /><text x={labelX} y={labelY - 1} textAnchor="middle" className="cx-radar-label">{area}<tspan x={labelX} dy="18" className="cx-radar-value">{player.scores[index]}</tspan></text></g>; })}</svg></figure>;
}

export function PlayerEvidence({ teamId, playerId, onPlayerChange }: { teamId: string; playerId: string; onPlayerChange: (playerId: string) => void }) {
  const team = resolveTeam(teamId);
  const player = resolvePlayer(teamId, playerId);
  const report = getDribbleReport(team);
  const panelId = useId();
  return <div className="cx-evidence" aria-label="Illustrative player evidence">
    <div className="cx-evidence-top"><span>{team.name} / Testing results</span><span className="cx-example-label">Illustrative example</span></div>
    <label className="cx-player-select">Choose a sample player<select value={playerId} onChange={event => onPlayerChange(event.target.value)}>{team.players.map(item => <option key={item.id} value={item.id}>{item.name} · {item.position}</option>)}</select></label>
    <div className="cx-evidence-layout">
      <div className="cx-player-options" role="group" aria-label={`Choose a sample player from ${team.name}`}><span className="cx-overline">Choose a player</span>{team.players.map(item => <button type="button" key={item.id} aria-pressed={item.id === player.id} aria-controls={panelId} onClick={() => onPlayerChange(item.id)}><span className="cx-shirt-number" aria-hidden="true">{String(item.number).padStart(2, "0")}</span><span><strong>{item.name}</strong><small>{item.position}</small></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg></button>)}</div>
      <div id={panelId} className="cx-player-detail">
        <div className="cx-player-heading"><div><span className="cx-overline">Player profile</span><h3>{player.name}</h3></div><span>{player.position} · {team.name}</span></div>
        <div className="cx-player-insight">
          <ProfileRadar player={player} />
          <div className="cx-priority">
            <div className="cx-assessment">
              <span className="cx-overline">Left-course dribble</span>
              <p><strong>{player.latestDribbleSeconds.toFixed(2)}</strong><span>sec</span></p>
              <span className="cx-assessment-note">{team.name} team average: {report.averageSeconds.toFixed(2)} sec across {report.testedPlayers} tested players. A shorter time is faster.</span>
            </div>
            <div className="cx-training-focus" aria-live="polite">
              <span className="cx-overline">Next training focus</span><h4>{player.focus}</h4>
              <p>Assigned drill · {player.drillId === "DRB-006" ? "Figure-8 dribble" : "Wall pass rhythm"}</p>
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
