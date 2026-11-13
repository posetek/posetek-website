import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgeCurve from "./AgeCurve";
import type { AgeCurveData, AgeCurveView } from "./AgeCurve";
import { ageMedianCurve } from "../lib/ageCurve";

const points = ["Avery Stone", "Blake Hill", "Casey Moore", "Drew Lane", "Emery Fox", "Finley Park"].map((name, i) => ({
  playerId: `p${i}`, name, age: 11 + (i % 2) * 3, exactAge: true, value: 7 + i * 0.2, repKey: `p${i}`,
}));
const data: AgeCurveData = {
  scopeLabel: "Club boys", points, curve: ageMedianCurve(points), bands: [], missingAge: 0, excluded: 0, athletes: points.length, loading: false, error: null,
  gender: "male", benchmarkLabel: null, currentRepKey: "p0", athleteName: "Avery Stone", estimatedAge: null, athleteValues: [],
};

describe("age curve", () => {
  it("keeps the result-validation presentation without a view", () => {
    const html = renderToStaticMarkup(<AgeCurve drillKey="dribbling" data={data} playerId="p0" value={7} age={{ age: 11, exact: true }} />);
    expect(html).toContain('class="admin-card rv-age"');
    expect(html).toContain("THIS REP · Avery");
    expect(html).toContain("Blake Hill: 7.20 s at 14.0 y");
    expect(html).toContain("age (years) · s");
    expect(html).toContain('class="rv-age-facts"');
  });

  it("on another page names no other athlete and uses the view's words, units and axis", () => {
    const view: AgeCurveView = {
      className: "stats-club rv-age", title: "Club · Boys", note: "6 athletes", display: { unit: "s", scale: 1, digits: 2 }, higherIsBetter: false,
      colors: { others: "#c9d6cf", highlight: "#7cff18" }, callout: "YOU", xTick: age => `U${age}`, xLabel: "age group", xOffset: () => 0.1, readout: "Better than 80% of 5 boys",
    };
    const html = renderToStaticMarkup(<AgeCurve drillKey="dribbling" data={data} playerId="p0" value={7} age={{ age: 11, exact: true }} view={view} />);
    for (const name of ["Blake", "Casey", "Drew", "Emery", "Finley", "Avery", "THIS REP", "this rep"]) expect(html).not.toContain(name);
    expect(html).toContain('class="stats-club rv-age"');
    expect(html).toContain(">YOU<");
    expect(html).toContain("7.20 s · U14");
    expect(html).toContain(">U11<");
    expect(html).toContain("age group · s");
    expect(html).toContain("Better than 80% of 5 boys");
    expect(html).toContain('fill="#7cff18"');
    expect(html).not.toContain("rv-age-facts");
    expect(html).not.toContain("rv-age-input");
  });
});
