import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamResults } from "./TeamResults";
import type { SharedTeam } from "./reportData";

const teams: SharedTeam[] = [
  {
    team: "Varsity — Coach Example", shortName: "Varsity", club: "Example School", asOf: "2026-11-25",
    athletes: [{
      name: "Example Runner", workouts: 0, testingAttempts: 3, followUp: true,
      activity: { signedIn: true, firstWorkoutCompleted: false },
      report: {
        date: "2026-11-24", comparisonLabel: "Varsity average", notes: [],
        metrics: [
          { label: "Recorded sprint", result: "4.81 s", date: "2026-11-23" },
          { label: "Vertical jump", result: "18 in", date: "2026-11-24", estimated: true },
          { label: "Right-course dribble", result: null },
        ],
      },
    }],
  },
  {
    team: "JV — Coach Example", shortName: "JV", club: "Example School", asOf: "2026-11-25",
    athletes: [
      { name: "Example Legacy", workouts: 0, testingAttempts: 0, followUp: true },
      {
        name: "Example Finisher", workouts: 1, testingAttempts: 0, followUp: false,
        activity: { signedIn: null, firstWorkoutCompleted: true },
      },
    ],
  },
];

function render(active = 0) {
  return renderToStaticMarkup(<TeamResults teams={teams} active={active} onSelectTeam={() => {}} record={() => {}}/>);
}

function textContent(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("coach team results", () => {
  it.each([0, 1])("shows profiles and counts only for the selected team %i", active => {
    const html = render(active);
    expect(html.match(/class="cr-roster"/g)).toHaveLength(1);
    expect(html).toContain(`id="cr-team-results" data-results-team="${active}"`);
    expect(html).toContain(`<dl class="cr-count"><dt>Players</dt><dd>${teams[active].athletes.length}</dd></dl>`);
    for (const [i, team] of teams.entries()) {
      expect(html).toContain(`aria-label="Show ${team.shortName} roster" aria-pressed="${i === active}" aria-controls="cr-team-results"`);
      for (const athlete of team.athletes) expect(html.includes(`aria-label="Open ${athlete.name} profile"`)).toBe(i === active);
      expect(html).toContain(`id="cr-team-activity-${i}"${i === active ? "" : ' hidden=""'}>`);
    }
  });

  it("shows reviewed values and their dates without estimate badges and keeps failed tests unavailable", () => {
    const metrics = Array.from(render().matchAll(/<li class="cr-profile-metric">([\s\S]*?)<\/li>/g), match => textContent(match[1]));
    expect(metrics).toEqual(["Sprint 4.81 s Nov 23, 2026", "Vertical jump 18 in Nov 24, 2026", "Right dribble Unavailable"]);
  });

  it("excludes legacy missing scores from counts, dates, ranks and highlights while showing unranked measurements", () => {
    const legacy: SharedTeam = {
      ...teams[0],
      athletes: [{
        ...teams[0].athletes[0], report: {
          date: "2026-11-23", comparisonLabel: "Team average", notes: [], metrics: [
            { label: "Recorded sprint", result: "Unavailable", date: "2026-11-21", percentile: 95, estimated: true },
            { label: "Vertical jump", result: "15 in", percentile: null },
          ],
        },
      }],
    };
    const html = renderToStaticMarkup(<TeamResults teams={[legacy]} active={0} onSelectTeam={() => {}} record={() => {}}/>);
    const summary = html.match(/<summary class="cr-grid"[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    expect(textContent(summary)).toContain("1 of 2 tests");
    expect(textContent(summary)).toContain("Vertical jump 15 in");
    expect(html).not.toContain("2026-11-21");
    expect(html).not.toContain("95th percentile");
    expect(html).not.toContain("Compare session percentiles");
    expect(html).not.toContain("Estimate");
    expect(textContent(html)).toContain("Sprint Unavailable");
  });

  it("keeps distinct milestones in the expanded profile", () => {
    const html = render(0) + render(1);
    const profiles = [...html.matchAll(/<dl class="cr-profile-activity">([\s\S]*?)<\/dl>/g)].map(match => textContent(match[1]));
    expect(profiles).toContain("Signed in Yes First workout completed Not yet");
    expect(profiles).toContain("Signed in Unconfirmed First workout completed Yes");
    expect(html).toContain("No reviewed results available.");
  });
});
