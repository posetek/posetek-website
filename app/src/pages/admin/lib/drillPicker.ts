// Which drills the admin workout editor's left pane lists.

import { fitFor } from "../../../lib/contracts/drillV2";
import type { AthleteContext, CatalogDrill } from "../../../lib/contracts/drillV2";
import { domainSortIndex } from "../../../lib/contracts/types";

/** Published drills only, filtered and sorted by domain then name. Deliberately uncapped. */
export function pickerRows(
  drills: CatalogDrill[],
  search: string,
  domain: string,
  eligibleOnly: boolean,
  athlete: AthleteContext,
): CatalogDrill[] {
  const term = search.trim().toLowerCase();
  return drills
    .filter(drill => drill.status === "published")
    .filter(drill => domain === "all" || drill.domain === domain)
    .filter(drill => !term
      || drill.name.toLowerCase().includes(term)
      || drill.drillId.toLowerCase().includes(term))
    .filter(drill => {
      if (!eligibleOnly) return true;
      const fit = fitFor(drill, athlete);
      return fit.ageOk && fit.difficultyOk && fit.partnerOk && fit.positionOk;
    })
    // No row cap: the library holds several hundred published drills, and a cap
    // silently drops whichever domain sorts last (games, then unknown domains).
    .sort((a, b) => domainSortIndex(a.domain) - domainSortIndex(b.domain) || a.name.localeCompare(b.name));
}
