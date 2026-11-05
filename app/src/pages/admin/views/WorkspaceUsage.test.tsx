import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WorkspaceUsage from "./WorkspaceUsage";
import { expandedRequest } from "../../insights/lib/expandedQuery";
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
