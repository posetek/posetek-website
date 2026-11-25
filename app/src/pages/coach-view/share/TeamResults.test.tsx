import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamResults, type SharedTeam } from "./TeamResults";

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

describe("combined coach team results", () => {
  it.each([0, 1])("renders both rosters with active team %i", active => {
    const html = render(active);
    for (const team of teams) {
      expect(html).toContain(`aria-label="Jump to ${team.shortName} roster"`);
      for (const athlete of team.athletes) {
        expect(html).toContain(`aria-label="Open ${athlete.name} profile"`);
      }
    }
  });

  it("keeps the date and estimate attached to each score and the failed test unavailable", () => {
    const metrics = Array.from(render().matchAll(/<li class="cr-profile-metric">([\s\S]*?)<\/li>/g), match => textContent(match[1]));
    expect(metrics).toEqual(["Sprint 4.81 s Nov 23, 2026", "Vertical jump 18 in Estimate Nov 24, 2026", "Right dribble Unavailable"]);
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

  it("separates sign-in from first workout and keeps missing milestones unconfirmed", () => {
    const html = render();
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g), match => textContent(match[1]));
    expect(rows).toContain("Player Signed in First workout completed");
    expect(rows).toContain("Example Runner Yes Not yet");
    expect(rows).toContain("Example Legacy Unconfirmed Unconfirmed");
    expect(rows).toContain("Example Finisher Unconfirmed Yes");
    expect(html).toContain("No reviewed results available.");
  });
});
