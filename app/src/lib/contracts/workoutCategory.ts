// Each catalog drill's one home category (WORKOUT_CATEGORY_REWORK_PLAN §3.1, §4.1)
// and the category list's labels and order (§5).
//
// A drill's home is its stored `workoutCategory`. Until the catalog backfill
// writes that field (and for any document created without it), the fallback
// derivation below decides. The same derivation exists once in the app and once
// in the gateway, and each repository tests it against the shared fixture in
// `__fixtures__/workout-category-fixture.json`.
//
// Labels and order come from `config/llm.workoutCategories` when it is readable
// and valid; otherwise from the compiled defaults. Availability, composers and
// minutes in that registry belong to workout creation and are not read here.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { domainFromLegacy, normalizeCatalogDrill } from "./drillV2";
import type { CatalogDrill } from "./drillV2";

export type WorkoutCategoryId = "soccer" | "speedAgility" | "core" | "gym" | "yoga" | "hiit";

export interface WorkoutCategory {
  /** The stable wire value, also the drill's stored `workoutCategory`. */
  id: string;
  label: string;
}

/** The compiled registry, in Nolan's order (decision D1). */
export const DEFAULT_WORKOUT_CATEGORIES: readonly WorkoutCategory[] = [
  { id: "soccer", label: "Soccer" },
  { id: "speedAgility", label: "Speed/agility" },
  { id: "core", label: "Core" },
  { id: "gym", label: "Strength" },
  { id: "yoga", label: "Mobility/recovery" },
  { id: "hiit", label: "HIIT" },
];

const SOCCER_DOMAINS = new Set(["ballMastery", "dribbling", "passing", "receiving", "shooting", "games"]);
const SPEED_AGILITY_DOMAINS = new Set(["speed", "agility", "plyometrics"]);
/** The gym jumps that live in Speed/agility (decision D8). */
export const GYM_JUMPS_TO_SPEED_AGILITY = new Set([
  "GYM-031", "GYM-036", "GYM-038", "GYM-054", "GYM-055", "GYM-056", "GYM-057",
]);
const COMPOSERS = new Set(["fieldBuilder", "composed", "yoga"]);
const CATEGORY_ID = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * The §4.1 fallback for a drill without a stored `workoutCategory`: library
 * prefixes first, then the domain as in §3.1. v1 domain names (for example
 * `verticalPower`, `strengthResilience`) are read through the legacy mapping.
 * Null when no rule applies; such a drill is listed under All only.
 */
export function derivedWorkoutCategory(drillId: string, domain: unknown): WorkoutCategoryId | null {
  const id = String(drillId || "");
  if (id.startsWith("HIT-")) return "hiit";
  if (id.startsWith("COR-")) return "core";
  if (GYM_JUMPS_TO_SPEED_AGILITY.has(id)) return "speedAgility";
  if (id.startsWith("GYM-")) return "gym";
  if (id.startsWith("MOB-")) return "yoga";
  const mapped = domainFromLegacy(String(domain ?? ""));
  if (SOCCER_DOMAINS.has(mapped)) return "soccer";
  if (SPEED_AGILITY_DOMAINS.has(mapped)) return "speedAgility";
  if (mapped === "strength") return "gym";
  return null;
}

/** A catalog document's home: its stored `workoutCategory`, else the fallback. */
export function workoutCategoryOf(drillId: string, raw: any): string | null {
  const stored = raw?.workoutCategory;
  if (typeof stored === "string" && CATEGORY_ID.test(stored)) return stored;
  return derivedWorkoutCategory(drillId, raw?.domain);
}

/** `normalizeCatalogDrill` plus the drill's home category, when one applies. Read-only: no write carries it. */
export function categorizedCatalogDrill(id: string, raw: any): CatalogDrill {
  const drill = normalizeCatalogDrill(id, raw), workoutCategory = workoutCategoryOf(id, raw);
  return workoutCategory ? { ...drill, workoutCategory } : drill;
}

/**
 * The category list from `config/llm` (its `workoutCategories` field), or the
 * compiled defaults when it is missing or rejected. A registry is rejected for
 * a schema other than 1, an empty list, a missing id or label, a duplicate id or
 * an unknown composer, the same checks the app and gateway apply.
 */
export function workoutCategoryRegistry(config: any): readonly WorkoutCategory[] {
  const registry = config?.workoutCategories;
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.categories)) return DEFAULT_WORKOUT_CATEGORIES;
  const seen = new Set<string>();
  const categories: WorkoutCategory[] = [];
  for (const entry of registry.categories) {
    const id = entry?.id, label = entry?.label;
    if (typeof id !== "string" || !CATEGORY_ID.test(id) || seen.has(id)) return DEFAULT_WORKOUT_CATEGORIES;
    if (typeof label !== "string" || !label.trim()) return DEFAULT_WORKOUT_CATEGORIES;
    if (entry.composer !== undefined && !COMPOSERS.has(entry.composer)) return DEFAULT_WORKOUT_CATEGORIES;
    seen.add(id);
    categories.push({ id, label: label.trim() });
  }
  return categories.length ? categories : DEFAULT_WORKOUT_CATEGORIES;
}

export interface WorkoutCategoryGroup extends WorkoutCategory {
  count: number;
}

/**
 * The categories that hold at least one of `drills`, in registry order, with
 * their counts. A category the registry does not list keeps its compiled label
 * and position after the registry's; an unknown id follows, labelled by its id.
 */
export function workoutCategoryGroups<T>(
  drills: readonly T[],
  categoryOf: (drill: T) => string | null,
  registry: readonly WorkoutCategory[] = DEFAULT_WORKOUT_CATEGORIES,
): WorkoutCategoryGroup[] {
  const counts = new Map<string, number>();
  for (const drill of drills) {
    const id = categoryOf(drill);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const ordered: WorkoutCategory[] = [...registry];
  for (const fallback of DEFAULT_WORKOUT_CATEGORIES) {
    if (!ordered.some(category => category.id === fallback.id)) ordered.push(fallback);
  }
  for (const id of [...counts.keys()].sort()) {
    if (!ordered.some(category => category.id === id)) ordered.push({ id, label: id });
  }
  return ordered
    .filter(category => counts.has(category.id))
    .map(category => ({ ...category, count: counts.get(category.id)! }));
}
