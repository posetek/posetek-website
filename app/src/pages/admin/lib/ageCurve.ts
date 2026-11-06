// Age versus performance for result validation: every athlete measured in the
// testing session at their age on the test date, the rep under review, and the
// published benchmark distribution per age band (Firestore `benchmarks/{tier}`,
// the same dataset the phone scores against: BenchmarkDataset.swift). Pure.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ValidationQueueRow } from "./resultValidationData";

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
