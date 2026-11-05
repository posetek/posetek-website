/** Additive admin-only report data; absent fields are unavailable, never zero. */
export interface TestingAgePoint { playerId: string; name: string; age: number | null; division: string; value: number }
export interface TestingAgeSeries { drill: string; unit: string; lowerIsBetter: boolean; points: TestingAgePoint[] }
export interface TestingStationSummary {
  id: string; label: string; order: number; completedPlayers: number; eligiblePlayers: number;
  syncedReps: number; plannedReps: number; failed: number; partial: number;
  elapsedMeanMs: number | null; timingSamples: number;
}
export interface AdminTesting {
  version: 1;
  performance: TestingAgeSeries[];
  weekly: {
    weekStart: string; weekEnd: string; previousWeekStart: string; previousWeekEnd: string;
    playersTested: number; previousPlayersTested: number;
    rotation: { meanMs: number | null; samples: number };
    previousRotation: { meanMs: number | null; samples: number };
  };
  /** Null means no complete station summary is available for this response. */
  stations: TestingStationSummary[] | null;
}
export const TESTING_DIVISIONS = [
  { key: "boys", label: "Boys", color: "#3478aa" },
  { key: "girls", label: "Girls", color: "#b25991" },
  { key: "unknown", label: "Unknown division", color: "#687b72" },
] as const;
export const testingDivision = (division: string) => division === "boys" || division === "girls" ? division : "unknown";
export function testingDisplay(series: Pick<TestingAgeSeries, "drill" | "unit">) {
  if (series.unit === "m/s") return { unit: "mph", factor: 2.23694, digits: 1 };
  if (series.unit === "m" && series.drill === "jump") return { unit: "in", factor: 39.37007874015748, digits: 1 };
  if (series.unit === "m" && series.drill === "broadJump") return { unit: "ft", factor: 3.28084, digits: 1 };
  return { unit: series.unit, factor: 1, digits: 2 };
}
/** Jitter is stable per player and deliberately stays within the player's age band. */
export function ageJitter(playerId: string) {
  let hash = 2166136261;
  for (const character of playerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1001 / 1000 - .5) * .46;
}
export function ageScatter(series: TestingAgeSeries) {
  const display = testingDisplay(series);
  const valid = series.points.filter(point => Number.isFinite(point.value) && point.value > 0);
  const points = valid.filter((point): point is TestingAgePoint & { age: number } => point.age !== null && Number.isFinite(point.age) && point.age >= 0 && point.age <= 100)
    .map(point => ({ ...point, division: testingDivision(point.division), plottedAge: point.age + ageJitter(point.playerId), value: point.value * display.factor }));
  const trends = TESTING_DIVISIONS.map(division => {
    const ages = new Map<number, number[]>();
    for (const point of points.filter(point => point.division === division.key)) ages.set(point.age, [...(ages.get(point.age) || []), point.value]);
    return { ...division, points: [...ages.entries()].sort(([a], [b]) => a - b).map(([age, values]) => ({ age, value: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length })) };
  });
  return { points, trends, display, unknownAge: valid.length - points.length };
}
