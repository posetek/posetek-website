import { useId, useState } from "react";
import {
  coachActivityWindow, coachSessionDate, getClubTestPathway, getTeamActivity, getTeamCheckIn,
  getTeamTestReport, reportTests, resolveTeam, sampleTeams, type ReportTest, type SamplePlayer, type SampleTeam,
} from "./coach-samples";
import "./coaches-examples.css";

type ClubExplorerProps = {
  teamId: string;
  onTeamChange: (teamId: string) => void;
  onPlayerSelect: (playerId: string) => void;
};

export function CoachPathway({ team, test, player }: { team: SampleTeam; test: ReportTest; player?: SamplePlayer }) {
  const title = useId();
  const groups = getClubTestPathway(test.id);
  const teamAverage = getTeamTestReport(team, test.id).average;
  const ownResult = player && (test.id === "dribbleLeft" ? player.latestDribbleSeconds : player.results[test.id]);
  const max = Math.ceil(Math.max(teamAverage, ownResult || 0, ...groups.map(group => group.mean)));
  const baseline = 175;
  const y = (value: number) => baseline - value / max * 125;
  const x = (index: number) => 96 + 110 * index;
  const ownX = x(groups.findIndex(group => group.ageGroup === team.name));
  return <figure className="cx-pathway-plot">
    <figcaption><strong>Development pathway</strong><span>{test.label} · {coachSessionDate} · {test.unit}</span></figcaption>
    <svg viewBox="0 0 411 217" role="img" aria-labelledby={title}>
      <title id={title}>{`Club development pathway for ${test.label}. ${groups.map(group => `${group.ageGroup}: ${group.mean.toFixed(test.digits)} ${test.unit}`).join(". ")}. ${team.name} team average ${teamAverage.toFixed(test.digits)} ${test.unit}.${ownResult ? ` ${player?.name}: ${ownResult.toFixed(test.digits)} ${test.unit}.` : ""}`}</title>
      {[0, max / 2, max].map(tick => <g key={tick} className="cx-pathway-axis"><line x1="39" x2="395" y1={y(tick)} y2={y(tick)} /><text x="31" y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
      {groups.map((group, index) => <g key={group.ageGroup}>
        <rect className="cx-pathway-bar" x={x(index) - 27} y={y(group.mean)} width="54" height={baseline - y(group.mean)} rx="2" />
        <text className="cx-pathway-value" x={x(index)} y={baseline - 13} textAnchor="middle">{group.mean.toFixed(test.digits)}</text>
        <text className="cx-pathway-age" x={x(index)} y="196" textAnchor="middle">{group.ageGroup}</text>
        <text className="cx-pathway-count" x={x(index)} y="211" textAnchor="middle">{group.testedPlayers} tested</text>
      </g>)}
      <line className="cx-pathway-line" x1="39" x2="395" y1={y(teamAverage)} y2={y(teamAverage)} />
      {typeof ownResult === "number" && <circle className="cx-pathway-player" cx={ownX} cy={y(ownResult)} r="6.5" />}
    </svg>
    <div className="cx-plot-legend"><span><i />Club age-group average</span><span><i />{team.name} team · {teamAverage.toFixed(test.digits)} {test.unit}</span>{typeof ownResult === "number" && <span><i />{player?.name} · {ownResult.toFixed(test.digits)} {test.unit}</span>}</div>
  </figure>;
}

export function ClubExplorer({ teamId, onTeamChange, onPlayerSelect }: ClubExplorerProps) {
  const team = resolveTeam(teamId);
  const [test, setTest] = useState<ReportTest>(reportTests[0]);
  const [view, setView] = useState<"standings" | "pathway">("standings");
  const report = getTeamTestReport(team, test.id);
  const checkIn = getTeamCheckIn(team);
  const activity = getTeamActivity(team);
  const panelId = useId();
  return (
    <div className="cx-club" aria-label="Illustrative club team report">
      <div className="cx-workspace-top"><span className="cx-club-crest" aria-hidden="true">N<span>FC</span></span><div><span className="cx-overline">Coach one-pager</span><h3>Northfield FC</h3></div><span className="cx-example-label">Illustrative example</span></div>
      <div className="cx-team-options" role="group" aria-label="Choose a sample team">
        {sampleTeams.map(item => <button type="button" key={item.id} aria-pressed={team.id === item.id} aria-controls={panelId} onClick={() => onTeamChange(item.id)}><span>{item.name}</span><span className="cx-team-option-detail">Coach {item.coach}<span aria-hidden="true">↗</span></span></button>)}
      </div>
      <div id={panelId} className="cx-report-body">
        <div className="cx-team-context"><span className="cx-overline">Testing session · {coachSessionDate}</span><h4>{team.name} team results</h4></div>
        <div className="cx-test-picker" role="group" aria-label="Choose a team test">
          {reportTests.map(metric => {
            const sample = getTeamTestReport(team, metric.id);
            return <button key={metric.id} type="button" data-coach-report-test={metric.id} aria-pressed={metric.id === test.id} onClick={() => setTest(metric)}>
              <strong>{metric.label}</strong><span>Average <b>{sample.average.toFixed(metric.digits)} {metric.unit}</b></span><span>Best <b>{sample.best.toFixed(metric.digits)} {metric.unit}</b></span>
            </button>;
          })}
        </div>
        <div className="cx-report-columns">
          <section className="cx-report-comparison" aria-label="Selected test comparison">
            <div className="cx-report-switch" role="group" aria-label="Team comparison view">
              <button type="button" data-coach-report-view="standings" aria-pressed={view === "standings"} onClick={() => setView("standings")}>Team standings</button>
              <button type="button" data-coach-report-view="pathway" aria-pressed={view === "pathway"} onClick={() => setView("pathway")}>Development pathway</button>
            </div>
            {view === "standings" ? <div className="cx-standings">
              <h4>{test.label}</h4>
              <p>{report.testedPlayers} measured players · {test.higherIsBetter ? "Higher is better" : "Faster times rank higher"}</p>
              <table><thead><tr><th>Player</th><th>Percentile</th><th>Result</th></tr></thead><tbody>
                {report.results.map(result => <tr key={result.name}><th scope="row">{result.name}</th><td><div className="cx-percentile"><i style={{width: `${result.percentile}%`}} /><span>{result.percentile}</span></div></td><td>{result.value.toFixed(test.digits)} {test.unit}</td></tr>)}
              </tbody></table>
            </div> : <CoachPathway team={team} test={test} />}
          </section>
          <aside className="cx-coach-notes">
            <div data-coach-input=""><span className="cx-overline">Coaches Input · practice note</span><p>“{team.practiceNote}”</p><small>Coach {team.coach}</small></div>
            <div className="cx-action-note"><span className="cx-overline">Coach check-in · left dribble</span><h4>{checkIn.name}</h4><p>{checkIn.latestDribbleSeconds.toFixed(2)} s on the left course. Watch the first touch out of the turn together.</p>
              <button className="cx-check-in-link" type="button" onClick={() => onPlayerSelect(checkIn.id)}>See {checkIn.name.split(" ")[0]}’s practice focus <span aria-hidden="true">↗</span></button>
            </div>
          </aside>
        </div>
        <div className="cx-roster-heading"><span>Featured player profiles</span><span>Left dribble</span></div>
        {team.players.map(player => <button className="cx-roster-row cx-profile-link" key={player.id} type="button" onClick={() => onPlayerSelect(player.id)} aria-label={`Open ${player.name}’s sample profile`}>
          <span className="cx-shirt-number" aria-hidden="true">{String(player.number).padStart(2, "0")}</span>
          <span className="cx-roster-player"><strong>{player.name}</strong><small>{player.position}</small></span>
          <span className="cx-focus-tag">{player.latestDribbleSeconds.toFixed(2)} s <span aria-hidden="true">↗</span></span>
        </button>)}
        <section className="cx-activity"><h4>Athlete follow-up</h4><dl><div><dt>Signed in by {coachSessionDate}</dt><dd>{activity.signedIn} of {activity.rosterSize} players</dd></div><div><dt>Logged workout time · {coachActivityWindow}</dt><dd>{activity.workoutMinutes} min</dd></div></dl></section>
      </div>
      <div className="cx-workspace-foot"><span className="cx-small-dot" aria-hidden="true" /><p>Managers see the club. Coaches work with their assigned teams.</p></div>
    </div>
  );
}
