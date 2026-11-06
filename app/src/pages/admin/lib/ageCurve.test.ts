import { describe, expect, it } from "vitest";
import { ageAt, ageMedianCurve, bandForAge, benchmarkBands, cohortPoints, cohortRank, curveAt, genderOf, organizationPoints, percentileAmong } from "./ageCurve";
import type { ValidationQueueRow } from "./resultValidationData";

const at = Date.UTC(2026, 10, 3);
const row = (playerId: string, value: number | null, extra: Partial<ValidationQueueRow> = {}): ValidationQueueRow => ({
  key: `${playerId}/${value}`, playerId, playerName: playerId.toUpperCase(), rosterOrder: 0, repId: String(value), drillKey: "broadJump", drillLabel: "Broad Jump",
  sessionNumber: 1, repNumber: 1, createdAtMillis: at, value, flagged: false, status: { state: "open", byEmail: null, atMillis: null, note: null }, ...extra,
});

describe("age on the test date", () => {
  it("is exact from a birth date and mid-year from a whole-year age", () => {
    expect(ageAt({ birthDate: "2012-11-03" }, at)!.age).toBeCloseTo(14, 2);
    expect(ageAt({ dateOfBirth: { seconds: Date.UTC(2013, 4, 3) / 1000 } }, at)).toMatchObject({ exact: true });
    expect(ageAt({ age: 13 }, at)).toEqual({ age: 13.5, exact: false });
    expect(ageAt({}, at)).toBeNull();
    expect(ageAt({ birthDate: "2030-01-01" }, at)).toBeNull();
  });

  it("reads gender like the phone does", () => {
    expect(genderOf({ gender: "Male" })).toBe("male");
    expect(genderOf({ gender: "f" })).toBe("female");
    expect(genderOf({})).toBe("unspecified");
  });
});

describe("session cohort", () => {
  it("keeps each athlete's best (higher or lower by drill), skips rejected reps and counts missing ages", () => {
    const rows = [row("a", 1.6), row("a", 1.8), row("a", 2.4, { status: { state: "rejected", byEmail: null, atMillis: null, note: null } }), row("b", 1.7), row("c", 1.5), row("d", null)];
    const { points, missingAge } = cohortPoints(rows, { a: { birthDate: "2012-05-01" }, b: { age: 13 } }, "broadJump");
    expect(points.map(p => [p.playerId, p.value])).toEqual([["a", 1.8], ["b", 1.7]]);
    expect(missingAge).toBe(1);
    const times = cohortPoints([row("a", 5.4, { drillKey: "changeOfDirection" }), row("a", 5.1, { drillKey: "changeOfDirection" })], { a: { age: 14 } }, "changeOfDirection");
    expect(times.points[0].value).toBe(5.1);
  });

  it("ranks this rep among the other athletes", () => {
    const points = [{ playerId: "a", value: 1.8 }, { playerId: "b", value: 1.7 }, { playerId: "c", value: 1.5 }].map(p => ({ ...p, name: p.playerId, age: 14, exactAge: true, repKey: p.playerId }));
    expect(cohortRank(points, "c", 1.75, true)).toEqual({ rank: 2, of: 3 });
    expect(cohortRank(points, "c", 1.4, false)).toEqual({ rank: 1, of: 3 });
  });
});

describe("benchmark bands", () => {
  const dataset = { cells: {
    "u14|male": { broadJumpDistance: { derivation: "measured", athletes: 40, percentiles: { p25: 1.6, p50: 1.75, p75: 1.9 } } },
    "u14|unspecified": { broadJumpDistance: { derivation: "scaled", athletes: 1, percentiles: { p50: 1.7 } } },
    "u16|unspecified": { broadJumpDistance: { derivation: "scaled", athletes: 1, percentiles: { p50: 1.95 } } },
  } };

  it("uses the gender cell when present, else unspecified, and the phone's age bands", () => {
    const bands = benchmarkBands(dataset, "broadJump", "male");
    expect(bands.map(b => [b.key, b.p50, b.derivation])).toEqual([["u14", 1.75, "measured"], ["u16", 1.95, "scaled"]]);
    expect(bandForAge(bands, 14.9)?.key).toBe("u14");
    expect(bandForAge(bands, 15)?.key).toBe("u16");
    expect(benchmarkBands(null, "broadJump", "male")).toEqual([]);
    expect(benchmarkBands(dataset, "freeRecord", "male")).toEqual([]);
  });
});

describe("organization-wide curve", () => {
  const rep = (id: string, value: number | null, extra: Record<string, unknown> = {}) => ({ id, repType: "broadJump", createdAtMillis: at, broadJumpDistance: value, ...extra });
  const profile = { birthDate: "2012-11-03" };

  it("plots every rep at the athlete's age on that rep's date, leaving out rejected, invalid and result-less reps", () => {
    const { points, missingAge, excluded } = organizationPoints([
      { playerId: "a", playerName: "A", profile, rep: rep("1", 1.7) },
      { playerId: "a", playerName: "A", profile, rep: rep("2", 1.8, { createdAtMillis: Date.UTC(2027, 10, 3) }) },
      { playerId: "a", playerName: "A", profile, rep: rep("3", 2.6, { adminRevision: { revisionId: "r", note: "Rejected" } }) },
      { playerId: "b", playerName: "B", profile, rep: rep("4", 1.9, { resultsValid: false }) },
      { playerId: "b", playerName: "B", profile, rep: rep("5", 1.95, { resultsValid: false, adminRevision: { revisionId: "r", note: "Validated" } }) },
      { playerId: "c", playerName: "C", profile: {}, rep: rep("6", 1.5) },
      { playerId: "c", playerName: "C", profile, rep: rep("7", null) },
    ], "broadJump");
    expect(points.map(p => [p.repKey, p.value])).toEqual([["a/1", 1.7], ["a/2", 1.8], ["b/5", 1.95]]);
    expect(points[0].age).toBeCloseTo(14, 2);
    expect(points[1].age).toBeCloseTo(15, 2);
    expect(missingAge).toBe(1);
    expect(excluded).toBe(3);
  });

  it("bins by whole year for the median and middle half, and interpolates between bins", () => {
    const points = [1, 2, 3, 4, 5].flatMap(v => [
      { playerId: "x", name: "x", age: 12.2, exactAge: true, value: v, repKey: "a" + v },
      { playerId: "x", name: "x", age: 13.7, exactAge: true, value: v + 1, repKey: "b" + v },
    ]);
    const curve = ageMedianCurve([...points, { playerId: "y", name: "y", age: 16.1, exactAge: true, value: 9, repKey: "lone" }]);
    expect(curve.map(c => [c.age, c.median, c.p25, c.p75, c.n])).toEqual([[12.5, 3, 2, 4, 5], [13.5, 4, 3, 5, 5]]);
    expect(curveAt(curve, 13)).toBeCloseTo(3.5);
    expect(curveAt(curve, 20)).toBe(4);
    expect(curveAt([], 13)).toBeNull();
  });

  it("gives the share of other reps a value beats, counting ties as half and leaving out the rep itself", () => {
    const points = [1, 2, 3, 4].map(v => ({ playerId: "p", name: "p", age: 13 + v, exactAge: true, value: v, repKey: "k" + v }));
    expect(percentileAmong(points, 3, true, "k3")).toEqual({ percent: (2 / 3) * 100, n: 3 });
    expect(percentileAmong(points, 2, true, "none")).toEqual({ percent: 37.5, n: 4 });
    expect(percentileAmong(points, 2, false, "k2")!.percent).toBeCloseTo((2 / 3) * 100);
    expect(percentileAmong(points, 3, true, "k3", p => Math.abs(p.age - 16) <= 1)).toEqual({ percent: 50, n: 2 });
    expect(percentileAmong([], 3, true, "x")).toBeNull();
  });
});
