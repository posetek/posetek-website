import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assessmentTeam, type SharedTeam } from "./reportData";
import { TeamAnalysis } from "./TeamAnalysis";
import { TeamResults } from "./TeamResults";

const assessments = [
  { id: "week", label: "Winter assessment", startDate: "2025-01-06", endDate: "2025-01-07" },
  { id: "separate", label: "Testing date · Jan 7", startDate: "2025-01-07", endDate: "2025-01-07" },
];
const prior = { label: "Sprint", result: "3.14 s", date: "2025-01-06", source: "Player Stats" };
const makeup = { label: "Broad jump", result: "4.2 ft", date: "2025-01-07" };
const missing = { label: "Sprint", result: null };
const team: SharedTeam = {
  team: "Example", club: "Example club", asOf: "2025-01-08", assessments,
  athletes: [{ name: "Player A", workouts: 0, testingAttempts: 4, followUp: true,
    report: { date: "Latest results", comparisonLabel: "Team average", notes: [], metrics: [prior, makeup],
      history: [{ assessmentId: "week", notes: [], metrics: [prior, makeup] },
        { assessmentId: "separate", notes: [], metrics: [missing, { ...makeup, result: null }] }] } }],
  organizationPathway: { through: "2025-01-07", series: [{
    test: "Sprint", ageBasis: "team-band", unit: "m/s", teamMean: null, teamCount: null, description: "Speed at 5 m.",
    groups: [{ age: 8, status: "unavailable", count: null, mean: null }, { age: 9, status: "small-group", count: 3, mean: null },
      { age: 10, status: "published", count: 5, mean: 4.2 }],
  }] },
};
describe("approved report history", () => {
  it("preserves an earlier valid sprint on latest and isolates same-day and makeup scores by assessment", () => {
    expect(assessmentTeam(team).athletes[0].report?.metrics).toEqual([prior, makeup]);
    expect(assessmentTeam(team, assessments[0]).athletes[0].report?.metrics).toEqual([prior, makeup]);
    expect(assessmentTeam(team, assessments[1]).athletes[0].report?.metrics.every(m => m.result === null)).toBe(true);
    expect(assessmentTeam(team).athletes[0].report?.metrics).toEqual([prior, makeup]);
  });
  it("shows a latest-results selector, the source of a score and the actual assessment for rankings", () => {
    const html = renderToStaticMarkup(<TeamResults teams={[team]} active={0} onSelectTeam={() => {}} record={() => {}}/>);
    for (const label of ["Latest results", "Winter assessment", "Testing date · Jan 7", "Player Stats", "Jan 6–7, 2025"]) expect(html).toContain(label);
  });
  it("uses the organization's complete axis with explicit gaps, sizes and a separate speed measure", () => {
    const html = renderToStaticMarkup(<TeamAnalysis team={team} mode="pathway" onModeChange={() => {}}/>);
    for (const label of ["U8", "U9", "U10", "No published mean", "Under 5 players", "4.2 m/s", "Team age band", "No comparable team reference"]) expect(html).toContain(label);
    expect(html.match(/class="cr-org-result"/g)).toHaveLength(1);
  });
});
