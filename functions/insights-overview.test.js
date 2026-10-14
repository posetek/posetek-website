"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activePlan, planProgress, playerPerformance, recentMeasuredTests } = require("./insights-overview");
const { recentD1Change, overallD1 } = require("./insights-axis-scoring");
const DAY = 86400000, NOW = Date.UTC(2026, 9, 6, 12);
const plan = { id: "plan", data: { status: "active", activatedAt: NOW - 10 * DAY,
  startDate: "2026-09-27", sessionsPerWeek: 2, timezone: "UTC",
  weeks: [{ workouts: [{ workoutId: "one" }, { workoutId: "two" }] }] } };
const event = (at, time, extra = {}) => ({ at, qualified: true, drill: "sprint", profileMetrics: { sprintCompletionTime: time }, ...extra });
test("latest active plan excludes drafts and preserves missing-plan counts", () => {
  assert.equal(activePlan([plan, { id: "draft", data: { status: "draft", activatedAt: NOW } }]).id, "plan");
  assert.deepEqual(planProgress(null, [], NOW), { sessionsDone: null, sessionsPlanned: null, activePlan: false, planAgeDays: null });
});
test("plan progress counts unique current assigned slots and excludes foreign, adhoc and future endings", () => {
  const log = { id: "plan_one", planId: "plan", workoutId: "one", endedAt: NOW - DAY, endReason: "completed" };
  const result = planProgress(plan, [log, log, { ...log, planId: "other" }, { ...log, source: "adhoc" },
    { ...log, workoutId: "unknown" }, { ...log, id: "plan_two", workoutId: "two", endedAt: NOW + DAY }], NOW);
  assert.equal(result.sessionsDone, 1); assert.equal(result.sessionsPlanned, 3);
});
test("confirmed schedule counts actual weekdays rather than estimated frequency", () => {
  const scheduled = { ...plan, data: { ...plan.data, intake: { trainingContext: { startDate: "2026-09-27", scheduleConfirmed: true, sessionDays: [1, 4] } } } };
  assert.equal(planProgress(scheduled, [], NOW).sessionsPlanned, 3);
});
test("D1 change uses local test dates and ignores duplicates, failed and undated results", () => {
  const events = [event(Date.UTC(2026, 9, 5, 1), 2), event(Date.UTC(2026, 9, 6, 1), 4),
    event(NOW, 0.5, { duplicate: true }), event(NOW, 0.5, { qualified: false }), event(null, 0.5)];
  const result = recentD1Change(events, "America/Los_Angeles");
  assert.equal(result.previousTestDate, "2026-10-04"); assert.equal(result.lastTestDate, "2026-10-05");
  assert.ok(Math.abs(result.change + 46) < 1e-10);
  assert.equal(overallD1([]), null);
});
test("follow-up reports saved workout gaps and measured declines, excluding future tests", () => {
  const result = playerPerformance({ testing: [event(NOW - 2 * DAY, 2), event(NOW - DAY, 4), event(NOW + DAY, 0.5)],
    profile: {}, workouts: { completed: 0 }, training: { plan, logs: [] }, now: NOW, endMillis: NOW, timeZone: "UTC" });
  assert.deepEqual(result.needsYouReasons, ["No completed workouts in this period", "Recent testing down \u00b7 Sprint"]);
  assert.ok(Math.abs(result.d1 - 92) < 1e-10);
});
test("unusable explicit plan timezones retain absolute completions without inventing calendar targets", () => {
  const log = { id: "plan_one", planId: "plan", workoutId: "one", endedAt: NOW - DAY, endReason: "completed" };
  for (const timezone of ["not-a-timezone", "", null, 42]) {
    const invalid = { ...plan, data: { ...plan.data, timezone } };
    const progress = planProgress(invalid, [log], NOW);
    assert.equal(progress.sessionsDone, 1); assert.equal(progress.sessionsPlanned, null);
    assert.equal(progress.planAgeDays, 10); assert.equal(progress.activePlan, true);
    const performance = playerPerformance({ testing: [], profile: { lastLogin: NOW }, training: { plan: invalid, logs: [log] },
      now: NOW, endMillis: NOW + 1, timeZone: "UTC" });
    assert.deepEqual(performance.needsYouReasons, []);
  }
  const { timezone: _timezone, ...withoutTimezone } = plan.data;
  assert.equal(planProgress({ ...plan, data: withoutTimezone }, [], NOW).sessionsPlanned, 3);
  assert.equal(planProgress({ ...plan, data: { status: "active", startDate: "2026-09-27", sessionsPerWeek: 2, timezone: "invalid" } }, [], NOW).planAgeDays, null);
});
test("rolling training targets use the plan timezone, confirmed start, and exact absolute ending bounds", () => {
  const at = Date.UTC(2026, 9, 7, 1); // Still Tuesday in Los Angeles, Wednesday in UTC.
  const scheduled = timezone => ({ id: "plan", data: { ...plan.data, timezone,
    intake: { trainingContext: { startDate: "2026-09-30", scheduleConfirmed: true, sessionDays: [3, 6] } } } });
  const ending = (id, time) => ({ id: `plan_${id}`, planId: "plan", workoutId: id, endedAt: time, endReason: "completed" });
  const logs = [ending("one", at - 14 * DAY), ending("two", at), ending("unknown", at),
    { ...ending("one", at - 1), id: "mirror" }, ending("two", at + 1)];
  assert.equal(planProgress(scheduled("America/Los_Angeles"), logs, at).sessionsPlanned, 2);
  assert.equal(planProgress(scheduled("UTC"), logs, at).sessionsPlanned, 3);
  assert.equal(planProgress(scheduled("America/Los_Angeles"), logs, at).sessionsDone, 2);
  assert.equal(planProgress(scheduled("UTC"), [ending("one", at - 14 * DAY - 1)], at).sessionsDone, 0);
  const future = scheduled("UTC"); future.data.intake.trainingContext.startDate = "2026-10-08";
  assert.equal(planProgress(future, [], at).sessionsPlanned, 0);
});

test("completed personal workouts suppress the gap without any sign-in or active-plan prerequisite", () => {
  for (const training of [null, { plan, logs: [] }]) {
    const value = playerPerformance({ testing: [], profile: {}, training, workouts: { completed: 1 }, now: NOW, endMillis: NOW, timeZone: "UTC" });
    assert.deepEqual(value.needsYouReasons, []);
    assert.equal(value.coachFocus.completedInPeriod, 1);
  }
  assert.equal(playerPerformance({ testing: [], training: null, now: NOW, endMillis: NOW, timeZone: "UTC" }).coachFocus.completedInPeriod, null);
});
test("recent measured trends compare matching metrics and use local dates without D1", () => {
  const rows = recentMeasuredTests([event(NOW - 2 * DAY, 2), event(NOW - DAY, 2.5)], "UTC");
  const sprint = rows.find(row => row.drill === "sprint");
  assert.equal(sprint.status, "down"); assert.equal(sprint.metrics[0].previous, 2); assert.equal(sprint.metrics[0].current, 2.5);
  assert.equal(sprint.metrics[0].trend, "down"); assert.equal(rows.find(row => row.drill === "jump").status, "notTested");
  const local = recentMeasuredTests([event(Date.UTC(2026, 9, 5, 1), 2), event(Date.UTC(2026, 9, 5, 23), 2.5)], "America/Los_Angeles")[1];
  assert.equal(local.previousTestDate, "2026-10-04"); assert.equal(local.lastTestDate, "2026-10-05");
});
test("different tests, different metrics, one test date, invalid and display-identical observations cannot invent a decline", () => {
  const trend = list => recentMeasuredTests(list, "UTC").find(row => row.drill === "sprint");
  assert.equal(trend([event(NOW - DAY, 2), event(NOW, 3, { drill: "dribbling" })]).status, "noPriorTest");
  assert.equal(trend([event(NOW - DAY, 2), event(NOW, 3, { profileMetrics: { sprintMaxSpeed: 6 } })]).status, "notComparable");
  assert.equal(trend([event(NOW - 1000, 2), event(NOW, 3)]).status, "noPriorTest");
  assert.equal(trend([event(NOW - DAY, 2), event(NOW, 2.001), event(NOW, 10, { duplicate: true }), event(NOW, 10, { qualified: false }), event(null, 10)]).status, "same");
  assert.equal(trend([event(NOW - DAY, 2), event(NOW, 0)]).status, "noPriorTest");
});
test("mixed changes show which metric declined while higher speed and jumps improve", () => {
  const rows = recentMeasuredTests([
    event(NOW - DAY, 2, { profileMetrics: { sprintCompletionTime: 2, sprintMaxSpeed: 7 } }),
    event(NOW, 2.2, { profileMetrics: { sprintCompletionTime: 2.2, sprintMaxSpeed: 8 } }),
    event(NOW - DAY, 1, { drill: "jump", profileMetrics: { verticalJumpHeight: .3 } }),
    event(NOW, 1, { drill: "jump", profileMetrics: { verticalJumpHeight: .4 } }),
  ], "UTC");
  assert.equal(rows.find(row => row.drill === "sprint").status, "mixed");
  assert.equal(rows.find(row => row.drill === "jump").status, "up");
});

test("complete testing groups classify measured gains, declines, cross-test mixed and unchanged without legacy scores", () => {
  const { coachTestingOverview } = require('./insights-overview');
  const row = (id, testing) => ({ id, firstName: id, lastName: 'Player', performance: playerPerformance({ testing,
    workouts: { completed: 1 }, now: NOW, endMillis: NOW + 1, timeZone: 'UTC' }) });
  const pair = (before, after) => [event(NOW - 60 * DAY, before), event(NOW - 30 * DAY, after)];
  const mixed = [...pair(2.4, 2.2), event(NOW - 60 * DAY, 1, { drill: 'jump', profileMetrics: { verticalJumpHeight: .5 } }),
    event(NOW - 30 * DAY, 1, { drill: 'jump', profileMetrics: { verticalJumpHeight: .4 } })];
  const rows = [row('up', pair(2.4, 2.2)), row('down', pair(2.2, 2.4)), row('mixed', mixed), row('same', pair(2.4, 2.401)),
    row('first', [event(NOW, 1)]), row('none', []), row('invalid', [event(null, 2), event(NOW, 3, { qualified: false })]),
    row('different', [event(NOW - DAY, 2), event(NOW, 3, { profileMetrics: { sprintMaxSpeed: 8 } })])];
  for (const item of rows) { item.performance.change = 99; item.performance.coachFocus.measuredTests.forEach(test => test.status = 'up'); }
  const result = coachTestingOverview(rows, '2026-10-06');
  assert.equal(result.version, 1); assert.equal(result.asOfDate, '2026-10-06');
  assert.equal(result.comparablePlayers, 4);
  assert.deepEqual(result.improvingPlayers.map(row => row.id), ['up']);
  assert.deepEqual(result.reviewPlayers.map(row => [row.id, row.status]), [['down', 'down'], ['mixed', 'mixed']]);
  assert.deepEqual(result.reviewPlayers[1].measuredTests.flatMap(test => test.metrics.map(metric => metric.trend)), ['up', 'down']);
  assert.equal(result.improvingPlayers[0].measuredTests[0].lastTestDate, '2026-09-06');
  assert.equal(coachTestingOverview(rows, '2026-09-01').comparablePlayers, 0);
});

test("testing summary honors local date boundaries, displayed precision and qualified daily bests", () => {
  const { coachTestingOverview } = require('./insights-overview');
  const end = Date.UTC(2026, 9, 7, 7); // Midnight after October 6 in Los Angeles.
  const performance = playerPerformance({ now: end - 1, endMillis: end, timeZone: 'America/Los_Angeles', testing: [
    event(Date.UTC(2026, 9, 6, 6, 59), 2.4), event(Date.UTC(2026, 9, 6, 7), 2.2), event(end - 1, 2.3),
    event(end, 1), event(end + DAY, .5), event(end - 1, .5, { duplicate: true }), event(end - 1, .5, { qualified: false }),
    event(end - 1, 1, { profileMetrics: { sprintCompletionTime: NaN, shotAccuracy: 100 } }),
  ] });
  const result = coachTestingOverview([{ id: 'local', firstName: 'Local', lastName: 'Date', performance }], '2026-10-06');
  const test = result.improvingPlayers[0].measuredTests[0];
  assert.equal(test.previousTestDate, '2026-10-05'); assert.equal(test.lastTestDate, '2026-10-06');
  assert.equal(test.metrics[0].previous, 2.4); assert.equal(test.metrics[0].current, 2.2);
  assert.deepEqual(coachTestingOverview([], '2026-10-06'), { version: 1, asOfDate: '2026-10-06', comparablePlayers: 0, improvingPlayers: [], reviewPlayers: [] });
});
