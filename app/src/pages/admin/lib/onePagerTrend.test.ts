import { describe, expect, it } from "vitest";
import { formatViewTime, onePagerTicks, onePagerTrend, pacificDayStart, viewTimeSummary } from "./onePagerTrend";
import type { OnePagerReport } from "./onePagerTrend";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 10, 10, 2, 16); // Nov 9, 6:16 PM Pacific
const report = (id: string, values: Partial<OnePagerReport> = {}): OnePagerReport =>
  ({ id, name: `Synthetic ${id}`, openedAt: null, workoutsAt: null, accountAt: null, testflightAt: null, ...values });

describe("onePagerTrend", () => {
  it("accumulates first events on one shared timeline and keeps sent level", () => {
    const points = onePagerTrend([
      report("a", { openedAt: START + HOUR, workoutsAt: START + 2 * HOUR }),
      report("b", { openedAt: START + 2 * HOUR, testflightAt: START + 3 * HOUR }),
      report("c"),
    ], 33, START, START + 5 * HOUR);
    expect(points).toEqual([
      { at: START, sent: 33, openedAt: 0, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
      { at: START + HOUR, sent: 33, openedAt: 1, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
      { at: START + 2 * HOUR, sent: 33, openedAt: 2, workoutsAt: 1, accountAt: 0, testflightAt: 0 },
      { at: START + 3 * HOUR, sent: 33, openedAt: 2, workoutsAt: 1, accountAt: 0, testflightAt: 1 },
      { at: START + 5 * HOUR, sent: 33, openedAt: 2, workoutsAt: 1, accountAt: 0, testflightAt: 1 },
    ]);
  });

  it("counts an account created from the report on the same timeline as the clicks", () => {
    const points = onePagerTrend([report("a", { openedAt: START + HOUR, workoutsAt: START + 2 * HOUR, accountAt: START + 3 * HOUR }), report("b", { accountAt: START + 4 * HOUR })], 2, START, START + 5 * HOUR);
    expect(points.map(point => [point.at - START, point.accountAt])).toEqual([[0, 0], [HOUR, 0], [2 * HOUR, 0], [3 * HOUR, 1], [4 * HOUR, 2], [5 * HOUR, 2]]);
  });

  it("steps the sent line where a report joined the cohort after tracking started", () => {
    const points = onePagerTrend([
      report("a", { sentAt: START - HOUR, openedAt: START + 3 * HOUR }),
      report("b", { sentAt: START + 2 * HOUR }),
      report("c", { sentAt: START + 2 * HOUR }),
      report("d", { sentAt: null }),
      report("e", { sentAt: START + 9 * HOUR }),
    ], 5, START, START + 5 * HOUR);
    expect(points).toEqual([
      { at: START, sent: 2, openedAt: 0, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
      { at: START + 2 * HOUR, sent: 4, openedAt: 0, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
      { at: START + 3 * HOUR, sent: 4, openedAt: 1, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
      // A send time past the viewer's clock still reaches the total at the right edge.
      { at: START + 5 * HOUR, sent: 5, openedAt: 1, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
    ]);
  });

  it("starts and ends flat with no activity and never runs past the two ends", () => {
    expect(onePagerTrend([report("a")], 33, START, START + HOUR)).toEqual([
      { at: START, sent: 33, openedAt: 0, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
      { at: START + HOUR, sent: 33, openedAt: 0, workoutsAt: 0, accountAt: 0, testflightAt: 0 },
    ]);
    // A viewer clock behind the server still shows the event, at the right edge.
    const skewed = onePagerTrend([report("a", { openedAt: START + 2 * HOUR })], 33, START, START + HOUR);
    expect(skewed.at(-1)).toEqual({ at: START + HOUR, sent: 33, openedAt: 1, workoutsAt: 0, accountAt: 0, testflightAt: 0 });
    expect(onePagerTrend([], 33, START, START - HOUR).map(point => point.at)).toEqual([START, START + 1]);
  });
});

describe("onePagerTicks", () => {
  it("uses Pacific hours for a short span and names the day at midnight", () => {
    const { values, label } = onePagerTicks(START, START + 10 * HOUR);
    expect(values.map(label)).toEqual(["8 PM", "10 PM", "Nov 10", "2 AM", "4 AM"]);
    expect(values.every(at => at >= START && at <= START + 10 * HOUR)).toBe(true);
  });

  it("uses Pacific days for a long span, across the March clock change", () => {
    const { values, label } = onePagerTicks(START, START + 5 * 24 * HOUR);
    expect(values.map(label)).toEqual(["Nov 10", "Nov 11", "Nov 12", "Nov 13", "Nov 14"]);
    const spring = onePagerTicks(Date.UTC(2027, 2, 12, 20), Date.UTC(2027, 2, 17, 20));
    expect(spring.values.map(spring.label)).toEqual(["Mar 13", "Mar 14", "Mar 15", "Mar 16", "Mar 17"]);
    expect(spring.values[2] - spring.values[1]).toBe(23 * HOUR);
    expect(onePagerTicks(START, START + 90 * 24 * HOUR).values.length).toBeLessThanOrEqual(7);
  });

  it("finds local midnight on both clock-change days", () => {
    expect(pacificDayStart(Date.UTC(2026, 10, 1, 18))).toBe(Date.UTC(2026, 10, 1, 7)); // 25-hour day
    expect(pacificDayStart(Date.UTC(2027, 2, 14, 17))).toBe(Date.UTC(2027, 2, 14, 8)); // 23-hour day
  });
});

describe("time on page", () => {
  it("formats seconds for reading", () => {
    expect([0, 45, 60, 252, 3600, 3900].map(formatViewTime)).toEqual(["0 sec", "45 sec", "1 min", "4 min 12 sec", "1 hr", "1 hr 5 min"]);
  });

  it("averages only reports with recorded time and reports an older service as unavailable", () => {
    expect(viewTimeSummary([report("a"), report("b")])).toBeNull();
    expect(viewTimeSummary([report("a", { viewSeconds: 0 }), report("b", { viewSeconds: 0 })])).toEqual({ reports: 0, totalSeconds: 0, averageSeconds: 0 });
    expect(viewTimeSummary([report("a", { viewSeconds: 30 }), report("b", { viewSeconds: 90 }), report("c", { viewSeconds: 0 })]))
      .toEqual({ reports: 2, totalSeconds: 120, averageSeconds: 60 });
  });
});
