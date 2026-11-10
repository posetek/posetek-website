import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WorkspaceWorkouts from "./WorkspaceWorkouts";
import { expandedRequest } from "../../insights/lib/expandedQuery";
import { previewInsights } from "../../insights/lib/preview";
import type { ExpandedInsights } from "../../insights/lib/expanded";

const request = { ...expandedRequest("", new Date("2026-11-05T12:00:00Z")), view: "workouts" as const };
const render = (data: ExpandedInsights) => renderToStaticMarkup(<WorkspaceWorkouts data={data} request={request} onChange={() => {}} />);

describe("admin workout evidence", () => {
  it("keeps all outcome categories, separate player and log denominators, and no prescription card or roster", () => {
    const data = previewInsights(request);
    data.workouts = { ...data.workouts, completed: 2, endedEarly: 1, inProgress: 3, abandoned: 1, unknownEnding: 1, outcomeEvents: 8 };
    const html = render(data);
    expect(html).toContain("84 matching players");
    expect(html).toContain("8 distinct workouts");
    expect(html).toContain("Completed as logged");
    expect(html).toContain("Unknown ending");
    expect(html).toContain("A player may have several outcomes");
    expect(html).toContain("it does not confirm every prescribed set was done");
    expect(html).not.toContain("Work completed");
    expect(html).not.toContain("All prescribed sets recorded");
    expect(html).not.toContain("Done blocks");
    expect(html).not.toContain('id="insights-players-heading"');
    expect(html).not.toContain('aria-label="workouts summary"');
  });
  it("plots dated starts and completions without inferring generation or a completion rate", () => {
    const data = previewInsights(request);
    data.workouts.days = [{ date: "2026-11-02", started: 2, completed: 5, timerMinutes: 0, estimatedMinutes: 0 }];
    const html = render(data);
    expect(html).toContain('<th scope="row">Nov 2</th><td>2</td><td>5</td>');
    expect(html).toContain("Starts use the recorded start date; completions use the recorded end date");
    expect(html).toContain("Generated workouts are not measured in this report");
    expect(html).toContain("These series do not measure workout generation or a completion rate");
    expect(html.indexOf("Workout outcomes")).toBeLessThan(html.indexOf("Workout activity by week"));
  });
  it("distinguishes zero recorded duration from missing duration coverage", () => {
    const data = previewInsights(request);
    data.workouts = { ...data.workouts, outcomeEvents: 5, timerMinutes: 0, timerRecords: 1, estimatedMinutes: 12, estimatedRecords: undefined, unknownDuration: 3 };
    const html = render(data);
    expect(html).toContain("Timer duration: 0 min · 1/5 logs with timers");
    expect(html).toContain("Estimated duration: Coverage unavailable · estimates coverage unavailable");
    expect(html).toContain("3/5 logs have unknown duration");
    expect(html).not.toContain("Estimated duration: 12");
    data.workouts.timerRecords = 0;
    expect(render(data)).toContain("Timer duration: Not recorded · 0/5 logs with timers");
  });
  it("uses aggregate totals independently of the displayed player page and supports older outcome summaries", () => {
    const data = previewInsights(request);
    data.players = [];
    data.workouts = { ...data.workouts, completed: 2, endedEarly: 1, inProgress: 1, abandoned: 0, unknownEnding: 0, outcomeEvents: undefined, timerRecords: 2 };
    const html = render(data);
    expect(html).toContain("4 distinct workouts");
    expect(html).toContain("2/4 logs with timers");
    expect(html).toContain("84 matching players");
    expect(html).not.toContain("NaN");
  });
});
