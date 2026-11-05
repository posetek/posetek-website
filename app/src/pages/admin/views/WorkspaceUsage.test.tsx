import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WorkspaceUsage from "./WorkspaceUsage";
import { expandedRequest, shiftDate } from "../../insights/lib/expandedQuery";
import { previewInsights } from "../../insights/lib/preview";
const request = { ...expandedRequest("", new Date("2026-11-05T12:00:00Z")), view: "usage" as const };
describe("admin usage evidence", () => {
  it("keeps the weekly chart, follows it with daily detail, and groups feature totals", () => {
    const data = previewInsights(request);
    data.usage.activeMinutes = 20;
    data.usage.featureMinutes = { workout: 4, training: 2, video: 3, planner: 1, results: 3, feed: 2, overview: 4, other: 1 };
    const html = renderToStaticMarkup(<WorkspaceUsage data={data} request={request} onChange={() => {}} />);
    expect(html.indexOf("Estimated active use by week")).toBeLessThan(html.indexOf("Estimated active use by day"));
    expect(html.indexOf("Estimated active use by day")).toBeLessThan(html.indexOf("Estimated active use by category"));
    expect(html).toContain("Total estimated active use counts simultaneous use once");
    const categoryHtml = html.slice(html.indexOf("Estimated active use by category"));
    expect(categoryHtml).toContain("Training");
    expect(categoryHtml).toContain("<td>10</td><td>50%</td>");
    expect(categoryHtml).toContain("Profile &amp; overview");
    expect(html).not.toContain("matching players ·");
    expect(html).not.toContain("usage summary");
  });
  it("preserves collection absence and does not manufacture daily or category minutes", () => {
    const data = previewInsights(request, 0, "uncollected");
    const html = renderToStaticMarkup(<WorkspaceUsage data={data} request={request} onChange={() => {}} />);
    expect(html).toContain("Website: Not collected · iOS app: Not collected");
    expect(html).toContain("This range has no measured daily usage");
    expect(html).not.toContain("Estimated active use by category");
  });
});


it("uses admin daily history only for the daily chart and leaves selected-period weekly/category totals intact", () => {
  const selected = { ...request, startDate: "2026-08-04", endDate: "2026-08-31" };
  const data = previewInsights(selected);
  const originalUsage = JSON.stringify(data.usage);
  const before = renderToStaticMarkup(<WorkspaceUsage data={data} request={selected} onChange={() => {}} />);
  data.adminReporting = { version: 1, followUp: "all", sort: "name", asOfMillis: data.generatedAtMillis, population: data.roster.filtered,
    summary: { noSignIn: 0, noActivity: 0, unfinishedAssigned: 0, noCompletion: 0, signInUnknown: 0, usageNotCollected: 0 }, topActivePlayers: [], topWorkoutPlayers: [], teams: [],
    dailyUsage: { startDate: "2026-07-01", endDate: selected.endDate, timeZone: selected.timezone,
      days: Array.from({ length: 62 }, (_, index) => ({ date: shiftDate("2026-07-01", index), activeMinutes: index, featureMinutes: { workout: index } })) } };
  const after = renderToStaticMarkup(<WorkspaceUsage data={data} request={selected} onChange={() => {}} />);
  expect(after).toContain('<th scope="row">2026-08-01</th><td>31</td>');
  expect(after).not.toContain("Showing available dates");
  const weekly = (html: string) => html.slice(html.indexOf("Estimated active use by week"), html.indexOf('class="insights-card daily-usage"'));
  expect(weekly(after)).toEqual(weekly(before));
  expect(after.slice(after.indexOf("Estimated active use by category"))).toEqual(before.slice(before.indexOf("Estimated active use by category")));
  expect(JSON.stringify(data.usage)).toBe(originalUsage);
});
