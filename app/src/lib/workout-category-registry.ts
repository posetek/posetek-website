// Reads the drill pickers' category labels and order from `config/llm`.

import { db } from "./firebase";
import { DEFAULT_WORKOUT_CATEGORIES, workoutCategoryRegistry } from "./contracts/workoutCategory";
import type { WorkoutCategory } from "./contracts/workoutCategory";

let categoriesCache: readonly WorkoutCategory[] | null = null;

/**
 * `config/llm.workoutCategories` when it can be read and is valid, else the
 * compiled defaults. A failed read is not cached, so the next picker tries again.
 */
export async function loadWorkoutCategories(): Promise<readonly WorkoutCategory[]> {
  if (categoriesCache) return categoriesCache;
  try {
    const snapshot = await db.collection("config").doc("llm").get();
    categoriesCache = workoutCategoryRegistry(snapshot.data());
    return categoriesCache;
  } catch {
    return DEFAULT_WORKOUT_CATEGORIES;
  }
}
