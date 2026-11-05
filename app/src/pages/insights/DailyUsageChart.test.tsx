import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DailyUsageChart from "./DailyUsageChart";
import { shiftDate } from "./lib/expandedQuery";
const period = { startDate: "2026-11-01", endDate: "2026-11-05", timeZone: "America/Los_Angeles" };
describe("daily usage chart", () => {
  it("exposes range and display controls plus an exact-day accessible table", () => {
    const html = renderToStaticMarkup(<DailyUsageChart period={period} days={[{ date: "2026-11-05", activeMinutes: 12, featureMinutes: { workout: 8, results: 4 } }]} />);
    for (const label of ["Daily usage range", "1 week", "2 weeks", "1 month", "2 months", "Daily usage display", "By category", "Total", "View daily chart data", "2026-11-05", "Training (minutes)"]) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Showing available dates");
    expect(html).toContain("Not collected");
  });
  it("keeps legacy daily totals visible while explaining missing category detail", () => {
    const html = renderToStaticMarkup(<DailyUsageChart period={period} days={[{ date: "2026-11-05", activeMinutes: 12 }]} />);
    expect(html).toContain("Daily category detail unavailable");
    expect(html).toContain("Select Total to see measured activity");
    expect(html).toContain("<td>12</td>");
    expect(html).toContain("<td>Unavailable</td>");
  });
  it("distinguishes collected zero activity from missing collection", () => {
    const html = renderToStaticMarkup(<DailyUsageChart period={period} days={[{ date: "2026-11-05", activeMinutes: 0, featureMinutes: {} }]} />);
    expect(html).not.toContain("This range has no measured daily usage");
    expect(html).toContain("<td>0</td>");
    expect(html).not.toContain("NaN");
  });
});


it("renders the full default calendar month from extended history without altering the report period", () => {
  const selectedPeriod = { ...period, startDate: "2026-08-04", endDate: "2026-08-31" };
  const days = Array.from({ length: 62 }, (_, index) => ({ date: shiftDate("2026-07-01", index), activeMinutes: index, featureMinutes: { workout: index } }));
  const html = renderToStaticMarkup(<DailyUsageChart period={selectedPeriod} days={days.slice(34)} history={{ ...selectedPeriod, startDate: "2026-07-01", days }} />);
  expect(html).toContain("Aug 1–Aug 31");
  expect(html).toContain('<th scope="row">2026-08-01</th><td>31</td>');
  expect(html).not.toContain("Showing available dates");
  expect(html).toContain("Weekly charts and period totals keep the selected report period");
});
