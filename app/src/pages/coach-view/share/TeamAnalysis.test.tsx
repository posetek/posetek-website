import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamAnalysis, type TeamAnalysisMode } from "./TeamAnalysis";
import type { SharedTeam, TeamAgeSeries } from "./reportData";

const earlier = "2026-11-23", later = "2026-11-24";
function makePlayer(name: string, result: string, percentile: number | null, date?: string, test = "Vertical jump") {
  return {
    name, workouts: 0, testingAttempts: 1, followUp: false,
    report: { date: later, comparisonLabel: "Group average", notes: [], metrics: [{ label: test, result, percentile, date }] },
  };
}
const multi: TeamAgeSeries = {
  test: "Vertical jump", date: earlier, unit: "in",
  groups: [{ age: 14, mean: 12.15, count: 7 }, { age: 16, mean: 17.7, count: 8 }], teamMean: 15.55, teamCount: 10,
};
const single: TeamAgeSeries = {
  test: "Vertical jump", date: later, unit: "in", groups: [{ age: 15, mean: 16, count: 5 }], teamMean: null, teamCount: 2,
};
const team: SharedTeam = {
  team: "Varsity — Coach Example", shortName: "Varsity", club: "Example School", asOf: later,
  athletes: [
    makePlayer("Low scorer", "9 in", 0),
    makePlayer("Another test", "8 ft", 90, later, "Broad jump"),
    makePlayer("High scorer", "20 in", 100, later),
    makePlayer("Earlier day", "17 in", 80, earlier),
    makePlayer("Withheld", "Unavailable", 95, later),
    makePlayer("No rank", "16 in", null, later),
  ],
  pathway: [single, multi],
};
function render(mode: TeamAnalysisMode, snapshot = team) {
  return renderToStaticMarkup(<TeamAnalysis team={snapshot} mode={mode} onModeChange={() => {}}/>);
}

describe("coach roster graph selection", () => {
  it("sorts published percentiles from the same test and session, retaining zero and the actual result", () => {
    const html = render("standings");
    expect([...html.matchAll(/data-percentile="(\d+)"/g)].map(match => match[1])).toEqual(["100", "0"]);
    expect(html.indexOf("High scorer")).toBeLessThan(html.indexOf("Low scorer"));
    expect(html).toContain("20 in");
    expect(html).toContain("9 in");
    expect(html).toContain("100th");
    expect(html).toContain("0th");
    for (const other of ["Another test", "Earlier day", "Withheld", "No rank"]) expect(html).not.toContain(other);
    expect(html).toContain('aria-label="Varsity · Team standings · Vertical jump · Nov 24, 2026"');
  });

  it("starts with the newest multi-age comparison and preserves observed age gaps, counts and team average", () => {
    const html = render("pathway");
    expect(html).toContain('aria-label="Varsity · Development pathway · Vertical jump · Nov 23, 2026"');
    expect([...html.matchAll(/data-age="(\d+)"/g)].map(match => match[1])).toEqual(["14", "16"]);
    for (const label of ["Example School age averages", "Age 14", "7 players", "12.15 in", "Varsity average", "15.55 in", "10 players"]) {
      expect(html).toContain(label);
    }
  });

  it("shows a single published age and foot units when only a broad jump comparison is available", () => {
    const broad: TeamAgeSeries = { ...single, test: "Broad jump", unit: "ft", groups: [{ age: 15, count: 5, mean: 5.8 }] };
    const html = render("pathway", { ...team, pathway: [broad] });
    expect(html.match(/class="cr-age-column"/g)).toHaveLength(1);
    for (const label of ["Mean jump distance (feet)", "Age 15", "5.8 ft", "5 players", "Varsity average unavailable"]) expect(html).toContain(label);
    expect(html).not.toContain('class="cr-average-line"');
  });

  it("offers the mode switch for older snapshots while showing an honest empty state", () => {
    const snapshot: SharedTeam = { ...team, athletes: [], pathway: undefined };
    const standings = render("standings", snapshot), pathway = render("pathway", snapshot);
    expect(standings).toContain("No published percentiles");
    expect(standings).toContain("Development pathway");
    expect(pathway).toContain("No age-group jump averages");
    expect(pathway).not.toContain('class="cr-age-column"');
  });
});
