import { describe, expect, it } from "vitest";
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
