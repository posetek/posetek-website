import { describe, expect, it } from "vitest";
import { ageAt, bandForAge, benchmarkBands, cohortPoints, cohortRank, genderOf } from "./ageCurve";
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
