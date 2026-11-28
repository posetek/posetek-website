import assert from "node:assert/strict";
import test from "node:test";
import history from "../app/scripts/coach-report-history.cjs";

const assessment = { id: "camp", label: "Team testing", startDate: "2025-03-02", endDate: "2025-03-03" };
test("projection strips context extras and rejects unknown sessions or out-of-period makeup results", () => {
  const context = history.selectReportContext({ assessments: [{ ...assessment, privateId: "private" }] });
  assert.deepEqual(context.assessments, [assessment]);
  const row = { assessmentId: "camp", notes: [], metrics: [{ label: "Sprint", result: "4 s", date: "2025-03-03" }] };
  assert.equal(history.selectHistoryReportFields({ history: [row] }, context.assessments, m => m).history[0].metrics[0].date, "2025-03-03");
  for (const r of [{ ...row, assessmentId: "elsewhere" }, { ...row, metrics: [{ ...row.metrics[0], date: "2025-03-04" }] }]) {
    assert.throws(() => history.selectHistoryReportFields({ history: [r] }, context.assessments, m => m));
  }
});
test("benchmark suppression supports missing ages and rejects invented zeroes and small published groups", () => {
  const point = { age: 7, mean: null, count: null, status: "unavailable" };
  function context(groups) {
    return history.selectReportContext({ organizationPathway: { through: "2025-01-06", series: [{
      test: "Sprint", ageBasis: "team-band", unit: "m/s", description: "Speed at 5 m", groups, teamMean: null, teamCount: null,
    }] } });
  }
  assert.deepEqual(context([point]).organizationPathway.series[0].groups, [point]);
  for (const group of [{ ...point, mean: 0 }, { ...point, status: "published", count: 4, mean: 4.3 }]) assert.throws(() => context([group]));
});
