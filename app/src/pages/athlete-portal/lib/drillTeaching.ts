// The "How to do it" lines the workout player shows for one raw `drillCatalog` document.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TeachingLineContent {
  icon: string;
  label: string;
  text: string;
}

/**
 * A v2 document carries `howTo.{setup,steps}`; only a v1 document has `setup`/
 * `execution`/`successCriteria`, so reading just those left every v2 card empty.
 */
export function teachingLinesFor(drill: any): TeachingLineContent[] {
  const lines: TeachingLineContent[] = [];
  const add = (icon: string, label: string, value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) lines.push({ icon, label, text });
  };
  const howTo = drill?.howTo && typeof drill.howTo === "object" ? drill.howTo : null;
  if (howTo) {
    add("grid_on", "Set up", howTo.setup);
    add("sprint", "Do it", Array.isArray(howTo.steps) ? howTo.steps.map(String).join(" ") : "");
  } else {
    add("grid_on", "Set up", drill?.setup);
    add("sprint", "Do it", drill?.execution);
  }
  add("target", "Done well", drill?.successCriteria);
  return lines;
}
