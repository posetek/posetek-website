// Which drills the admin workout editor's left pane lists.

import { fitFor } from "../../../lib/contracts/drillV2";
import type { AthleteContext, CatalogDrill } from "../../../lib/contracts/drillV2";
import { domainSortIndex } from "../../../lib/contracts/types";
import { DEFAULT_WORKOUT_CATEGORIES, workoutCategoryGroups, workoutCategoryOf } from "../../../lib/contracts/workoutCategory";
import type { WorkoutCategory, WorkoutCategoryGroup } from "../../../lib/contracts/workoutCategory";

/** A drill's home category: the stored `workoutCategory`, else the fallback. */
export const pickerCategoryOf = (drill: CatalogDrill) => workoutCategoryOf(drill.drillId, drill);

/** The categories that hold published drills, in registry order, for the pane's filter. */
export function pickerCategories(drills: CatalogDrill[], registry: readonly WorkoutCategory[] = DEFAULT_WORKOUT_CATEGORIES): WorkoutCategoryGroup[] {
  return workoutCategoryGroups(drills.filter(drill => drill.status === "published"), pickerCategoryOf, registry);
}

/**
 * Published drills only, filtered by home category and search, sorted by
 * category (registry order), then domain, then name. Deliberately uncapped.
 */
export function pickerRows(
  drills: CatalogDrill[],
  search: string,
  category: string,
  eligibleOnly: boolean,
  athlete: AthleteContext,
  registry: readonly WorkoutCategory[] = DEFAULT_WORKOUT_CATEGORIES,
): CatalogDrill[] {
  const term = search.trim().toLowerCase();
  const order = new Map(pickerCategories(drills, registry).map((group, index) => [group.id, index]));
  const rank = (drill: CatalogDrill) => order.get(pickerCategoryOf(drill) ?? "") ?? order.size;
  return drills
    .filter(drill => drill.status === "published")
    .filter(drill => category === "all" || pickerCategoryOf(drill) === category)
    .filter(drill => !term
      || drill.name.toLowerCase().includes(term)
      || drill.drillId.toLowerCase().includes(term))
    .filter(drill => {
      if (!eligibleOnly) return true;
      const fit = fitFor(drill, athlete);
      return fit.ageOk && fit.difficultyOk && fit.partnerOk && fit.positionOk;
    })
    // No row cap: the library holds several hundred published drills, and a cap
    // silently drops whichever category sorts last.
    .sort((a, b) => rank(a) - rank(b) || domainSortIndex(a.domain) - domainSortIndex(b.domain) || a.name.localeCompare(b.name));
}
