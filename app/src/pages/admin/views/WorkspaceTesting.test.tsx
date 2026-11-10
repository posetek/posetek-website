import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceTesting, { TestingAgeChart, TestingStationAnalytics } from "./WorkspaceTesting";
import { previewInsights } from "../../insights/lib/preview";
import { expandedRequest } from "../../insights/lib/expandedQuery";

const request = { ...expandedRequest("", new Date("2026-11-09T18:00:00Z")), view: "testing" as const };
const average = { meanMs: null, samples: 0 };
const testingTab = (previousWeekEnd: string) => renderToStaticMarkup(<WorkspaceTesting request={request} onChange={() => {}} data={{ ...previewInsights(request),
  adminTesting: { version: 1, performance: [], stations: null, weekly: { weekStart: "2026-11-09", weekEnd: "2026-11-09", previousWeekStart: "2026-11-02", previousWeekEnd,
    playersTested: 1, previousPlayersTested: 7, rotation: average, previousRotation: average } } } as never} />);

describe("Testing reporting components", () => {
  it("renders age clusters, separate division means and accessible point measurements", () => {
    const html = renderToStaticMarkup(<TestingAgeChart series={{ drill: "jump", unit: "m", lowerIsBetter: false, points: [
      { playerId: "a", name: "Alex", age: 12, division: "boys", value: .3 },
      { playerId: "b", name: "Blair", age: 13, division: "boys", value: .4 },
      { playerId: "c", name: "Casey", age: 12, division: "girls", value: .35 },
    ] }} />);
    expect(html).toContain("Current age (years)");
    expect(html).toContain("Alex, age 12, Boys: 11.8 in");
    expect(html).toContain("Boys: average result at each age");
    expect(html).not.toContain("Girls: average result at each age");
    expect(html).toContain("3 players shown");
  });
  it("describes the previous week as the reporting service defines it", () => {
    const whole = testingTab("2026-11-08");
    expect(whole).toContain("Previous week: 7");
    expect(whole).toContain("the comparison covers the whole previous Monday–Sunday week.");
    expect(whole).not.toContain("same weekdays");
    // A reporting service that still compares matching weekdays keeps the earlier wording.
    const matching = testingTab("2026-11-02");
    expect(matching).toContain("the comparison covers the same weekdays one week earlier.");
    expect(matching).not.toContain("whole previous");
  });
  it("distinguishes unsupported station timing from a genuine empty result", () => {
    expect(renderToStaticMarkup(<TestingStationAnalytics stations={null} />)).toContain("Station timing is unavailable");
    expect(renderToStaticMarkup(<TestingStationAnalytics stations={null} pending />)).toContain("Loading station timing…");
    expect(renderToStaticMarkup(<TestingStationAnalytics stations={[]} />)).toContain("No station sessions were recorded");
  });
  it("renders actual timing coverage without treating missing timing as zero", () => {
    const html = renderToStaticMarkup(<TestingStationAnalytics stations={[{ id: "one", label: "Speed", order: 1, completedPlayers: 3, eligiblePlayers: 4, syncedReps: 15, plannedReps: 20, failed: 2, partial: 1, elapsedMeanMs: null, timingSamples: 0 }]} />);
    expect(html).toContain("Unavailable");
    expect(html).toContain("0 timed visits");
    expect(html).not.toContain("0s</strong>");
    expect(html).toContain("Speed reps synced");
  });
});
