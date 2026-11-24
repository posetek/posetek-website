// The workout-category fallback against the SHARED fixture
// (`__fixtures__/workout-category-fixture.json`, copied verbatim from the
// category-rework kit; the app and gateway test the same file). The fixture
// carries each row's expected home but not its domain, so the stored domains
// come from `workout-category-domains.json`, generated from the snapshot the
// fixture was built from.

import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/workout-category-fixture.json";
import domainFile from "./__fixtures__/workout-category-domains.json";
import {
  DEFAULT_WORKOUT_CATEGORIES,
  GYM_JUMPS_TO_SPEED_AGILITY,
  derivedWorkoutCategory,
  workoutCategoryGroups,
  workoutCategoryOf,
  workoutCategoryRegistry,
} from "./workoutCategory";

type FixtureRow = { workoutCategory: string; status: string | null };
const rows = Object.entries(fixture.rows as Record<string, FixtureRow>);
const domains = domainFile.domains as Record<string, string>;

describe("workout category fallback (shared fixture)", () => {
  it("has a stored domain for exactly the fixture's rows", () => {
    expect(Object.keys(domains).sort()).toEqual(rows.map(([id]) => id).sort());
    expect(rows).toHaveLength(637);
  });

  it.each(rows)("derives %s's home from its id and domain", (id, row) => {
    expect(derivedWorkoutCategory(id, domains[id])).toBe(row.workoutCategory);
    // Before the backfill: no stored field, so the fallback decides.
    expect(workoutCategoryOf(id, { domain: domains[id] })).toBe(row.workoutCategory);
    // After the backfill: the stored field decides.
    expect(workoutCategoryOf(id, { domain: domains[id], workoutCategory: row.workoutCategory })).toBe(row.workoutCategory);
  });

  it("reproduces the fixture's category counts", () => {
    const groups = workoutCategoryGroups(rows, ([id]) => workoutCategoryOf(id, { domain: domains[id] }));
    expect(Object.fromEntries(groups.map(g => [g.id, g.count]))).toEqual(fixture.categoryCounts);
    expect(groups.map(g => g.id)).toEqual(["soccer", "speedAgility", "core", "gym", "yoga", "hiit"]);
  });

  it("moves the seven gym jumps to Speed/agility", () => {
    expect([...GYM_JUMPS_TO_SPEED_AGILITY].sort()).toEqual(fixture.gymJumpsToSpeedAgility);
    for (const id of fixture.gymJumpsToSpeedAgility) expect(derivedWorkoutCategory(id, "strength")).toBe("speedAgility");
  });

  it("reads v1 domain names through the legacy mapping", () => {
    expect(derivedWorkoutCategory("VJP-008", "verticalPower")).toBe("speedAgility");
    expect(derivedWorkoutCategory("STR-001", "strengthResilience")).toBe("gym");
    expect(derivedWorkoutCategory("SPD-002", "linearSpeed")).toBe("speedAgility");
    expect(derivedWorkoutCategory("COD-001", "codAgility")).toBe("speedAgility");
    expect(derivedWorkoutCategory("PAS-001", "passingReceiving")).toBe("soccer");
    expect(derivedWorkoutCategory("SSG-001", "representativeGames")).toBe("soccer");
  });

  it("leaves a drill with no matching rule uncategorized", () => {
    expect(derivedWorkoutCategory("XYZ-001", "")).toBeNull();
    expect(derivedWorkoutCategory("XYZ-001", "unknownDomain")).toBeNull();
    expect(workoutCategoryOf("XYZ-001", { workoutCategory: "" })).toBeNull();
  });

  it("prefers a stored category over the derivation, including a new registry id", () => {
    expect(workoutCategoryOf("GYM-033", { domain: "strength", workoutCategory: "hiit" })).toBe("hiit");
    expect(workoutCategoryOf("DRB-001", { domain: "dribbling", workoutCategory: "futsal" })).toBe("futsal");
    expect(workoutCategoryOf("DRB-001", { domain: "dribbling", workoutCategory: "not an id" })).toBe("soccer");
    expect(workoutCategoryOf("DRB-001", { domain: "dribbling", workoutCategory: 3 })).toBe("soccer");
  });
});

describe("workout category registry", () => {
  const registry = (categories: unknown, schemaVersion: unknown = 1) => ({ workoutCategories: { schemaVersion, categories } });

  it("uses the compiled defaults, in decision D1's order, when config/llm has no registry", () => {
    for (const config of [undefined, null, {}, { workoutCategories: null }]) {
      expect(workoutCategoryRegistry(config)).toBe(DEFAULT_WORKOUT_CATEGORIES);
    }
    expect(DEFAULT_WORKOUT_CATEGORIES).toEqual([
      { id: "soccer", label: "Soccer" }, { id: "speedAgility", label: "Speed/agility" }, { id: "core", label: "Core" },
      { id: "gym", label: "Strength" }, { id: "yoga", label: "Mobility/recovery" }, { id: "hiit", label: "HIIT" },
    ]);
  });

  it("takes labels and order from a valid registry", () => {
    const parsed = workoutCategoryRegistry(registry([
      { id: "core", label: "Core", composer: "composed" },
      { id: "soccer", label: "Football", composer: "fieldBuilder", availability: { player: "on" } },
    ]));
    expect(parsed).toEqual([{ id: "core", label: "Core" }, { id: "soccer", label: "Football" }]);
  });

  it.each([
    ["another schema", registry([{ id: "soccer", label: "Soccer" }], 2)],
    ["no list", { workoutCategories: { schemaVersion: 1 } }],
    ["an empty list", registry([])],
    ["a duplicate id", registry([{ id: "soccer", label: "A" }, { id: "soccer", label: "B" }])],
    ["a missing label", registry([{ id: "soccer" }])],
    ["a blank label", registry([{ id: "soccer", label: "  " }])],
    ["a bad id", registry([{ id: "two words", label: "Soccer" }])],
    ["an unknown composer", registry([{ id: "soccer", label: "Soccer", composer: "teleport" }])],
  ])("treats a registry with %s as missing", (_, config) => {
    expect(workoutCategoryRegistry(config)).toBe(DEFAULT_WORKOUT_CATEGORIES);
  });
});

describe("workout category groups", () => {
  const drills = [
    { drillId: "DRB-001", domain: "dribbling" },
    { drillId: "COR-001", domain: "strength" },
    { drillId: "COR-002", domain: "strength" },
    { drillId: "GYM-031", domain: "strength" },
    { drillId: "SPD-001", domain: "speed" },
    { drillId: "XYZ-001", domain: "mystery" },
    { drillId: "PAS-009", domain: "passing", workoutCategory: "futsal" },
  ];
  const of = (drill: { drillId: string }) => workoutCategoryOf(drill.drillId, drill);

  it("lists only categories with drills, in the default order, unknown ids last", () => {
    expect(workoutCategoryGroups(drills, of)).toEqual([
      { id: "soccer", label: "Soccer", count: 1 },
      { id: "speedAgility", label: "Speed/agility", count: 2 },
      { id: "core", label: "Core", count: 2 },
      { id: "futsal", label: "futsal", count: 1 },
    ]);
  });

  it("follows the registry's order and labels, keeping unlisted categories after it", () => {
    const registry = workoutCategoryRegistry({ workoutCategories: { schemaVersion: 1, categories: [
      { id: "futsal", label: "Futsal" }, { id: "core", label: "Trunk" },
    ] } });
    expect(workoutCategoryGroups(drills, of, registry).map(g => `${g.label} ${g.count}`)).toEqual([
      "Futsal 1", "Trunk 2", "Soccer 1", "Speed/agility 2",
    ]);
  });
});
