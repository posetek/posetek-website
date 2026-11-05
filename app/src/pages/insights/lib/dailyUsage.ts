import { shiftDate } from "./expandedQuery";

export const DAILY_USAGE_RANGES = [
  { key: "1w", label: "1 week" }, { key: "2w", label: "2 weeks" },
  { key: "1m", label: "1 month" }, { key: "2m", label: "2 months" },
] as const;
export type DailyUsageRange = typeof DAILY_USAGE_RANGES[number]["key"];
export type DailyUsageMode = "categories" | "total";
export const USAGE_CATEGORIES = [
  { key: "training", label: "Training", color: "#b7f34a" },
  { key: "results", label: "Results", color: "#79b8d1" },
  { key: "social", label: "Social", color: "#aa9bd1" },
  { key: "profile", label: "Profile & overview", color: "#e8b85f" },
  { key: "other", label: "Other", color: "#8ca19a" },
] as const;
export type UsageCategory = typeof USAGE_CATEGORIES[number]["key"];
export interface DailyUsageInput {
  date: string;
  activeMinutes: number | null;
  featureMinutes?: Record<string, number> | null;
}
export interface DailyUsageRow {
  date: string;
  total: number | null;
  categories: Record<UsageCategory, number> | null;
}
const categoryFor = (feature: string): UsageCategory => {
  if (["workout", "training", "video", "planner"].includes(feature)) return "training";
  if (feature === "results") return "results";
  if (feature === "feed") return "social";
  if (feature === "overview") return "profile";
  return "other";
};
const measured = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Group only exclusive feature allocations; never infer a day from period totals. */
export function dailyUsageCategories(day: DailyUsageInput): Record<UsageCategory, number> | null {
  if (!measured(day.activeMinutes) || !day.featureMinutes) return null;
  const categories: Record<UsageCategory, number> = { training: 0, results: 0, social: 0, profile: 0, other: 0 };
  for (const [feature, minutes] of Object.entries(day.featureMinutes)) {
    if (!measured(minutes)) return null;
    categories[categoryFor(feature)] += minutes;
  }
  const attributed = Object.values(categories).reduce((sum, minutes) => sum + minutes, 0);
  // A mismatched payload cannot safely be stacked as a breakdown of active use.
  if (Math.abs(attributed - day.activeMinutes) > Math.max(1, day.activeMinutes) * 1e-6) return null;
  return categories;
}

export function dailyUsageStart(endDate: string, range: DailyUsageRange): string {
  if (range === "1w" || range === "2w") return shiftDate(endDate, range === "1w" ? -6 : -13);
  const end = new Date(`${endDate}T12:00:00Z`), month = end.getUTCMonth() - (range === "1m" ? 1 : 2);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), month + 1, 0, 12)).getUTCDate();
  const previous = new Date(Date.UTC(end.getUTCFullYear(), month, Math.min(end.getUTCDate(), lastDay), 12)).toISOString().slice(0, 10);
  return shiftDate(previous, 1);
}

export function dailyUsageWindow(days: DailyUsageInput[], period: { startDate: string; endDate: string }, range: DailyUsageRange) {
  const requestedStart = dailyUsageStart(period.endDate, range);
  const startDate = requestedStart < period.startDate ? period.startDate : requestedStart;
  const byDate = new Map(days.map(day => [day.date, day]));
  const rows: DailyUsageRow[] = [];
  for (let date = startDate; date <= period.endDate; date = shiftDate(date, 1)) {
    const day = byDate.get(date);
    rows.push({ date, total: day && measured(day.activeMinutes) ? day.activeMinutes : null, categories: day ? dailyUsageCategories(day) : null });
  }
  return { rows, startDate, endDate: period.endDate, clipped: requestedStart < period.startDate,
    measuredDays: rows.filter(row => row.total !== null).length,
    categoryDays: rows.filter(row => row.categories !== null).length };
}
