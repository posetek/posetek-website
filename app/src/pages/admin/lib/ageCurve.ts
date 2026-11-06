// Age versus performance for result validation: every athlete measured in the
// testing session at their age on the test date, the rep under review, and the
// published benchmark distribution per age band (Firestore `benchmarks/{tier}`,
// the same dataset the phone scores against: BenchmarkDataset.swift). Pure.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { OrganizationRep, ValidationQueueRow } from "./resultValidationData";
import { primaryMetricValue, processingFlagged, validationStatus } from "./resultValidation";

/** Drill → benchmark metric key (athlete-profile-spec / BenchmarkMetric). */
export const BENCHMARK_METRIC: Record<string, { key: string; higherIsBetter: boolean }> = {
  shooting: { key: "ballSpeed", higherIsBetter: true },
  sprint: { key: "sprintMaxSpeed", higherIsBetter: true },
  jump: { key: "verticalJumpHeight", higherIsBetter: true },
  broadJump: { key: "broadJumpDistance", higherIsBetter: true },
  changeOfDirection: { key: "codTotalTime", higherIsBetter: false },
  dribbling: { key: "dribbleTotalTime", higherIsBetter: false },
};

/** AthleteStatsViewModel.ageBand(forAge:): U12 < 13, U14 13–14, U16 15–16, U18 17–18, college 19+. Ranges are [from, to) in years. */
export const AGE_BANDS = [
  { key: "u12", label: "U12", from: 8, to: 13 },
  { key: "u14", label: "U14", from: 13, to: 15 },
  { key: "u16", label: "U16", from: 15, to: 17 },
  { key: "u18", label: "U18", from: 17, to: 19 },
  { key: "senior", label: "College", from: 19, to: 23 },
] as const;

export interface PlayerProfile { birthDate?: any; dateOfBirth?: any; age?: any; gender?: any }

function dateOf(value: any): Date | null {
  try {
    const date = value?.toDate ? value.toDate() : typeof value?.seconds === "number" ? new Date(value.seconds * 1000)
      : typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
        : value instanceof Date ? value : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}

/** Age in years on the test date: exact from a birth date, else the profile's whole-year age (placed mid-year). */
export function ageAt(profile: PlayerProfile | null | undefined, atMillis: number): { age: number; exact: boolean } | null {
  const birth = dateOf(profile?.birthDate) ?? dateOf(profile?.dateOfBirth);
  if (birth && atMillis > birth.getTime()) {
    const age = (atMillis - birth.getTime()) / (365.2425 * 86_400_000);
    if (age >= 5 && age <= 80) return { age, exact: true };
  }
  const whole = typeof profile?.age === "number" && Number.isFinite(profile.age) ? Math.floor(profile.age) : null;
  return whole !== null && whole >= 5 && whole <= 80 ? { age: whole + 0.5, exact: false } : null;
}

export function genderOf(profile: PlayerProfile | null | undefined): "male" | "female" | "unspecified" {
  const raw = typeof profile?.gender === "string" ? profile.gender.toLowerCase() : "";
  return raw.startsWith("m") ? "male" : raw.startsWith("f") ? "female" : "unspecified";
}

export interface AgePoint { playerId: string; name: string; age: number; exactAge: boolean; value: number; repKey: string }

/** One point per athlete: their best result for the drill in this session (rejected reps excluded). */
export function cohortPoints(rows: ValidationQueueRow[], profiles: Record<string, PlayerProfile>, drillKey: string): { points: AgePoint[]; missingAge: number } {
  const spec = BENCHMARK_METRIC[drillKey];
  const best = new Map<string, ValidationQueueRow>();
  for (const row of rows) {
    if (row.drillKey !== drillKey || row.value === null || row.status.state === "rejected") continue;
    const current = best.get(row.playerId);
    if (!current || (spec?.higherIsBetter ?? true ? row.value > current.value! : row.value < current.value!)) best.set(row.playerId, row);
  }
  const points: AgePoint[] = [];
  let missingAge = 0;
  for (const row of best.values()) {
    const age = ageAt(profiles[row.playerId], row.createdAtMillis || Date.now());
    if (!age) { missingAge++; continue; }
    points.push({ playerId: row.playerId, name: row.playerName, age: age.age, exactAge: age.exact, value: row.value!, repKey: row.key });
  }
  return { points, missingAge };
}

export interface BenchmarkBand {
  key: string; label: string; from: number; to: number;
  p25: number | null; p50: number; p75: number | null;
  athletes: number; derivation: string;
}

/** The published distribution for the drill per age band, for the athlete's gender cell (else unspecified). */
export function benchmarkBands(dataset: any, drillKey: string, gender: "male" | "female" | "unspecified"): BenchmarkBand[] {
  const metric = BENCHMARK_METRIC[drillKey]?.key;
  if (!metric || !dataset?.cells || typeof dataset.cells !== "object") return [];
  const bands: BenchmarkBand[] = [];
  for (const band of AGE_BANDS) {
    const cell = dataset.cells[`${band.key}|${gender}`]?.[metric] ?? dataset.cells[`${band.key}|unspecified`]?.[metric];
    const p50 = typeof cell?.percentiles?.p50 === "number" ? cell.percentiles.p50 : null;
    if (p50 === null || !(p50 > 0)) continue;
    const pick = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    bands.push({ key: band.key, label: band.label, from: band.from, to: band.to, p25: pick(cell.percentiles.p25), p50, p75: pick(cell.percentiles.p75),
      athletes: Number.isFinite(cell.athletes) ? cell.athletes : 0, derivation: typeof cell.derivation === "string" ? cell.derivation : "unknown" });
  }
  return bands;
}

export function bandForAge(bands: BenchmarkBand[], age: number): BenchmarkBand | null {
  return bands.find(band => age >= band.from && age < band.to) ?? (age >= 19 ? bands.find(band => band.key === "senior") ?? null : null);
}

/** Rank among the session's athletes (1 = best), counting this rep's value in place of the athlete's best when better. */
export function cohortRank(points: AgePoint[], playerId: string, value: number, higherIsBetter: boolean): { rank: number; of: number } {
  const values = points.filter(point => point.playerId !== playerId).map(point => point.value);
  const better = values.filter(other => (higherIsBetter ? other > value : other < value)).length;
  return { rank: better + 1, of: values.length + 1 };
}

// MARK: - Organization-wide: every rep, the age curve through them, percentiles

/**
 * One point per rep across the organization, at the athlete's age on the rep's
 * date. Rejected reps are left out, and so are reps the phone flagged as
 * invalid unless an admin validated or adjusted them.
 */
export function organizationPoints(reps: OrganizationRep[], drillKey: string): { points: AgePoint[]; missingAge: number; excluded: number } {
  const points: AgePoint[] = [];
  let missingAge = 0, excluded = 0;
  for (const { playerId, playerName, profile, rep } of reps) {
    const value = primaryMetricValue(drillKey, rep);
    const state = validationStatus(rep).state;
    if (value === null || state === "rejected" || (processingFlagged(rep) && state !== "validated" && state !== "adjusted")) { excluded++; continue; }
    const age = ageAt(profile, rep.createdAtMillis || Date.now());
    if (!age) { missingAge++; continue; }
    points.push({ playerId, name: playerName, age: age.age, exactAge: age.exact, value, repKey: `${playerId}/${rep.id}` });
  }
  return { points, missingAge, excluded };
}

export interface CurvePoint { age: number; median: number; p25: number; p75: number; n: number }

const quantile = (sorted: number[], q: number) => {
  const position = (sorted.length - 1) * q, lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/** The organization's own curve: median and middle half per one-year age bin with at least `minimum` reps. */
export function ageMedianCurve(points: AgePoint[], minimum = 5): CurvePoint[] {
  const bins = new Map<number, number[]>();
  for (const point of points) {
    const bin = Math.floor(point.age);
    bins.set(bin, [...(bins.get(bin) ?? []), point.value]);
  }
  return [...bins.entries()].filter(([, values]) => values.length >= minimum).sort((a, b) => a[0] - b[0]).map(([bin, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { age: bin + 0.5, median: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), n: values.length };
  });
}

/** The curve's median at an age, interpolated between bin centers (clamped at the ends). */
export function curveAt(curve: CurvePoint[], age: number): number | null {
  if (!curve.length) return null;
  if (age <= curve[0].age) return curve[0].median;
  if (age >= curve[curve.length - 1].age) return curve[curve.length - 1].median;
  const i = curve.findIndex(point => point.age >= age);
  const a = curve[i - 1], b = curve[i];
  return a.median + ((age - a.age) / (b.age - a.age)) * (b.median - a.median);
}

/** Share of the other reps this value is better than (0–100), and how many it was compared with. */
export function percentileAmong(points: AgePoint[], value: number, higherIsBetter: boolean, excludeKey: string, filter: (point: AgePoint) => boolean = () => true): { percent: number; n: number } | null {
  const others = points.filter(point => point.repKey !== excludeKey && filter(point));
  if (!others.length) return null;
  const beaten = others.filter(point => (higherIsBetter ? point.value < value : point.value > value)).length;
  const tied = others.filter(point => point.value === value).length;
  return { percent: ((beaten + tied / 2) / others.length) * 100, n: others.length };
}
