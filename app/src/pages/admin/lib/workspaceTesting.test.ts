import { describe, expect, it } from "vitest";
import { ageJitter, ageScatter, testingDisplay } from "./workspaceTesting";

describe("admin testing age scatter", () => {
  it("groups known ages by authoritative division and converts measurements once", () => {
    const chart = ageScatter({ drill: "sprint", unit: "m/s", lowerIsBetter: false, points: [
      { playerId: "b1", name: "One", age: 12, division: "boys", value: 4 },
      { playerId: "b2", name: "Two", age: 12, division: "boys", value: 6 },
      { playerId: "g1", name: "Three", age: 12, division: "girls", value: 8 },
      { playerId: "u1", name: "Four", age: 13, division: "unspecified", value: 3 },
      { playerId: "age-missing", name: "Five", age: null, division: "girls", value: 5 },
      { playerId: "invalid", name: "Six", age: 12, division: "girls", value: NaN },
    ] });
    expect(chart.points).toHaveLength(4);
    expect(chart.unknownAge).toBe(1);
    expect(chart.trends[0].points).toHaveLength(1);
    expect(chart.trends[0].points[0]).toMatchObject({ age: 12, count: 2 });
    expect(chart.trends[0].points[0].value).toBeCloseTo(5 * 2.23694);
    expect(chart.trends[1].points[0].value).toBe(8 * 2.23694);
    expect(chart.points.find(point => point.playerId === "u1")?.division).toBe("unknown");
  });
  it("jitter is stable, independent of point order, and stays inside the age cluster", () => {
    expect(ageJitter("player-7")).toBe(ageJitter("player-7"));
    for (let index = 0; index < 200; index++) expect(Math.abs(ageJitter(String(index)))).toBeLessThanOrEqual(.23);
  });
  it("keeps time values and uses the existing imperial jump units", () => {
    expect(testingDisplay({ drill: "changeOfDirection", unit: "s" })).toEqual({ unit: "s", factor: 1, digits: 2 });
    expect(testingDisplay({ drill: "jump", unit: "m" }).unit).toBe("in");
    expect(testingDisplay({ drill: "broadJump", unit: "m" }).unit).toBe("ft");
  });
});
