import { describe, expect, it } from "vitest";
import { shiftDate } from "./expandedQuery";
import type { DailyUsageHistory } from "./dailyUsage";
import { dailyUsageCategories, dailyUsageStart, dailyUsageWindow } from "./dailyUsage";

describe("daily usage evidence", () => {
  it("uses true daily totals and preserves missing days instead of filling with zero", () => {
    const window = dailyUsageWindow([{ date: "2026-11-04", activeMinutes: 12, featureMinutes: { workout: 8, results: 4 } }, { date: "2026-11-05", activeMinutes: 0, featureMinutes: {} }], { startDate: "2026-11-01", endDate: "2026-11-05" }, "1w");
    expect(window.clipped).toBe(true);
    expect(window.rows.map(row => row.total)).toEqual([null, null, null, 12, 0]);
    expect(window.measuredDays).toBe(2);
    expect(window.categoryDays).toBe(2);
  });
  it("groups exclusive features without adding overlapping platforms", () => {
    const row = { date: "2026-11-05", activeMinutes: 20, webMinutes: 16, iosMinutes: 12, featureMinutes: { workout: 4, training: 2, video: 3, planner: 1, results: 3, feed: 2, overview: 4, other: 1 } };
    expect(dailyUsageCategories(row)).toEqual({ training: 10, results: 3, social: 2, profile: 4, other: 1 });
    expect(dailyUsageWindow([row], { startDate: row.date, endDate: row.date }, "1w").rows[0].total).toBe(20);
  });
  it("preserves new or unknown feature allocations as Other", () => {
    expect(dailyUsageCategories({ date: "2026-11-05", activeMinutes: 5, featureMinutes: { future: 3, other: 2 } })?.other).toBe(5);
  });
  it("does not reconstruct categories from legacy totals, invalid values, or mismatched allocations", () => {
    for (const featureMinutes of [undefined, null, { training: 20 }, { training: -10 }, { training: NaN }]) {
      expect(dailyUsageCategories({ date: "2026-11-05", activeMinutes: 10, featureMinutes })).toBeNull();
    }
    expect(dailyUsageCategories({ date: "2026-11-05", activeMinutes: null, featureMinutes: {} })).toBeNull();
  });
  it("uses inclusive weeks and clamped calendar months including leap years", () => {
    expect(dailyUsageStart("2026-11-05", "1w")).toBe("2026-10-30");
    expect(dailyUsageStart("2026-11-05", "2w")).toBe("2026-10-23");
    expect(dailyUsageStart("2026-11-05", "1m")).toBe("2026-10-06");
    expect(dailyUsageStart("2026-11-05", "2m")).toBe("2026-09-06");
    expect(dailyUsageStart("2024-03-31", "1m")).toBe("2024-03-01");
    expect(dailyUsageStart("2026-01-31", "2m")).toBe("2025-12-01");
  });
  it("clips to the report and excludes outside dates without using the wall clock", () => {
    const window = dailyUsageWindow([{ date: "2026-11-06", activeMinutes: 100 }, { date: "2026-10-01", activeMinutes: 100 }], { startDate: "2026-09-01", endDate: "2026-11-05" }, "1w");
    expect(window.rows).toHaveLength(7);
    expect(window.rows.every(row => row.total === null)).toBe(true);
    expect(window.clipped).toBe(false);
  });
});


describe("bounded admin daily history", () => {
  const period = { startDate: "2026-08-04", endDate: "2026-08-31", timeZone: "America/Los_Angeles" };
  const history: DailyUsageHistory = { startDate: "2026-07-01", endDate: period.endDate, timeZone: period.timeZone,
    days: Array.from({ length: 62 }, (_, index) => ({ date: shiftDate("2026-07-01", index), activeMinutes: index === 0 ? null : index,
      featureMinutes: index === 0 ? null : { workout: index * .75, overview: index * .25 } })) };
  const reportDays = history.days.filter(day => day.date >= period.startDate);
  it("shows all 62 actual days for 2m despite the selected report containing only 28 days", () => {
    expect(reportDays).toHaveLength(28);
    const result = dailyUsageWindow(reportDays, period, "2m", history);
    expect(result.rows).toHaveLength(62);
    expect(result.startDate).toBe("2026-07-01");
    expect(result.endDate).toBe("2026-08-31");
    expect(result.extendedHistory).toBe(true);
    expect(result.clipped).toBe(false);
    expect(result.rows[0]).toEqual({ date: "2026-07-01", total: null, categories: null });
    expect(result.rows[4]).toEqual({ date: "2026-07-05", total: 4, categories: { training: 3, profile: 1, results: 0, social: 0, other: 0 } });
    expect(period.startDate).toBe("2026-08-04");
  });
  it("selects exact weekly and calendar-month ranges from the same bounded history", () => {
    for (const [range, count, start] of [["1w", 7, "2026-08-25"], ["2w", 14, "2026-08-18"], ["1m", 31, "2026-08-01"]] as const) {
      const result = dailyUsageWindow(reportDays, period, range, history);
      expect(result.rows).toHaveLength(count);
      expect(result.startDate).toBe(start);
      expect(result.rows.at(-1)?.total).toBe(61);
      expect(result.clipped).toBe(false);
    }
  });
  it("rejects mismatched, incorrectly bounded, duplicated or incomplete history and keeps honest legacy clipping", () => {
    const invalid: (DailyUsageHistory | undefined)[] = [undefined,
      { ...history, endDate: "2026-08-30" }, { ...history, timeZone: "UTC" },
      { ...history, startDate: "2026-07-02" }, { ...history, startDate: "2026-06-30" },
      { ...history, days: history.days.slice(1) }, { ...history, days: [...history.days, history.days[0]] },
      { ...history, days: history.days.map((day, index) => index === 4 ? { ...day, activeMinutes: NaN } : day) },
    ];
    for (const candidate of invalid) {
      const result = dailyUsageWindow(reportDays, period, "2m", candidate);
      expect(result.extendedHistory).toBe(false);
      expect(result.clipped).toBe(true);
      expect(result.startDate).toBe(period.startDate);
      expect(result.rows).toHaveLength(28);
    }
  });
});
