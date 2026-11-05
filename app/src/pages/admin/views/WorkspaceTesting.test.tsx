import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TestingAgeChart, TestingStationAnalytics } from "./WorkspaceTesting";

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
