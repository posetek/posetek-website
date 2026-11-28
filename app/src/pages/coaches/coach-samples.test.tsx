import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClubExplorer } from "./ClubExplorer";
import { CoachWorkoutTime } from "./CoachWorkoutTime";
import { PlayerEvidence } from "./PlayerEvidence";
import { clubDribbleBenchmarks, getClubTestPathway, getTeamActivity, getTeamCheckIn, getTeamTestReport, profileAreas, reportTests, resolvePlayer, resolveTeam, sampleTeams } from "./coach-samples";

describe("coaches illustrative data", () => {
  it("keeps nine unique players in three distinct team contexts with usable profile and session values", () => {
    expect(sampleTeams.map(team => team.name)).toEqual(["U13", "U15", "U17"]);
    const allPlayers = sampleTeams.flatMap(team => team.players);
    expect(new Set(allPlayers.map(player => player.id)).size).toBe(9);
    for (const team of sampleTeams) {
      expect(team.players).toHaveLength(3);
      for (const player of team.players) {
        expect(player.scores).toHaveLength(profileAreas.length);
        expect(player.scores.every(score => score >= 0 && score <= 100)).toBe(true);
        expect(player.latestDribbleSeconds).toBeGreaterThan(0);
        expect(player.priorDribbleSeconds).toBeGreaterThan(player.latestDribbleSeconds);
        expect(["DRB-006", "PAS-001"]).toContain(player.drillId);
        expect(player.completedSessions).toBeLessThanOrEqual(player.plannedSessions);
      }
    }
  });
  it.each(sampleTeams)("compares only recorded results in one team and one test", team => {
    for (const test of reportTests) {
      const report = getTeamTestReport(team, test.id);
      const ordered = report.results.map(result => result.value);
      expect(ordered).toEqual([...ordered].sort((a, b) => test.higherIsBetter ? b - a : a - b));
      expect(report.average).toBeCloseTo(ordered.reduce((sum, value) => sum + value, 0) / ordered.length);
      expect(report.testedPlayers).toBe(ordered.length);
      expect(ordered[0]).toBe(report.best);
      expect(getClubTestPathway(test.id).every(group => group.testedPlayers >= 5 && group.mean > 0)).toBe(true);
    }
    const checkIn = getTeamCheckIn(team);
    expect(checkIn.latestDribbleSeconds).toBe(Math.max(...team.players.map(player => player.latestDribbleSeconds)));
    expect(checkIn.drillId).toBe("DRB-006");
    expect(getTeamActivity(team).signedIn).toBeLessThanOrEqual(getTeamActivity(team).rosterSize);
  });
  it("excludes missing attempts and gives tied scores the same standing", () => {
    expect(getTeamTestReport(sampleTeams[0], "sprint").testedPlayers).toBe(4);
    const ties = getTeamTestReport(sampleTeams[0], "jump").results.filter(row => row.value === 15);
    expect(ties).toHaveLength(2);
    expect(ties[0].percentile).toBe(ties[1].percentile);
  });
  it("resolves stale player selection within the new team instead of showing another team's player", () => {
    expect(resolvePlayer("u17", "u13-alex")).toBe(sampleTeams[2].players[0]);
    expect(resolvePlayer("u15", "u15-casey")).toBe(sampleTeams[1].players[2]);
    expect(resolveTeam("unknown")).toBe(sampleTeams[0]);
    expect(resolvePlayer("unknown", "unknown")).toBe(sampleTeams[0].players[0]);
  });
});

describe("coaches sample views", () => {
  it.each(sampleTeams)("shows logged minutes for the full $name roster and highlights the selected player", team => {
    const roster = [...team.players, ...team.otherDribbleResults];
    for (const player of team.players) {
      const html = renderToStaticMarkup(<CoachWorkoutTime team={team} player={player} />);
      expect(html).toContain("Oct 1–14");
      expect(html).toContain(`<strong>${roster.reduce((sum, row) => sum + row.workoutMinutes, 0)}<span> min</span></strong>`);
      expect(html).toContain(`data-selected="true"><th scope="row">${player.name}</th>`);
      expect(html.match(/data-selected="true"/g)).toHaveLength(1);
      for (const row of roster) {
        expect(html).toContain(row.name);
        expect(html).toContain(`>${row.workoutMinutes} min</span>`);
      }
      for (const other of sampleTeams.filter(other => other !== team)) expect(html).not.toContain(other.players[0].name);
    }
  });
  it.each(sampleTeams)("shows only the selected $name roster and explains role boundaries", team => {
    const html = renderToStaticMarkup(<ClubExplorer teamId={team.id} onTeamChange={() => undefined} onPlayerSelect={() => undefined} />);
    expect(html).toContain("Northfield FC");
    expect(html).toContain("Illustrative example");
    expect(html).toContain(`data-coach-report-test="dribbleLeft" aria-pressed="true"`);
    expect(html).toContain('data-coach-report-view="standings" aria-pressed="true"');
    for (const test of reportTests) expect(html).toContain(test.label);
    for (const player of team.players) expect(html).toContain(player.name);
    for (const otherTeam of sampleTeams.filter(item => item.id !== team.id)) {
      for (const player of otherTeam.players) expect(html).not.toContain(player.name);
    }
    const times = [...team.players.map(player => player.latestDribbleSeconds), ...team.otherDribbleResults.map(result => result.seconds)];
    expect(times.length).toBeGreaterThanOrEqual(5);
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    expect(html).toContain(mean.toFixed(2));
    expect(html).toContain(Math.min(...times).toFixed(2));
    const checkIn = team.players.find(player => player.latestDribbleSeconds === Math.max(...times))!;
    expect(html).toContain(`See ${checkIn.name.split(" ")[0]}’s practice focus`);
    expect(html).toContain("Athlete follow-up");
    expect(html).toMatch(new RegExp(getTeamActivity(team).workoutMinutes + " min"));
    expect(html).toContain("Managers see the club. Coaches work with their assigned teams.");
  });
  it.each(sampleTeams.flatMap(team => team.players.map(player => ({ team, player }))))("keeps $player.name's evidence and next step aligned", ({ team, player }) => {
    const html = renderToStaticMarkup(<PlayerEvidence teamId={team.id} playerId={player.id} onPlayerChange={() => undefined} />);
    expect(html).toContain(player.latestDribbleSeconds.toFixed(2));
    expect(html).toContain(player.focus);
    expect(html).toContain("Club development pathway");
    for (const group of clubDribbleBenchmarks) {
      expect(html).toContain(group.meanSeconds.toFixed(2));
    }
    expect(html).toContain(player.drillId === "DRB-006" ? "Figure-8 dribble" : "Wall pass rhythm");
    expect(html).toContain('role="img"');
    expect(html).toContain("Illustrative example");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`${team.name} team average ${getTeamTestReport(team, "dribbleLeft").average.toFixed(2)} s`);
    for (const otherPlayer of team.players.filter(item => item.id !== player.id)) expect(html).not.toContain(otherPlayer.focus);
  });
});
