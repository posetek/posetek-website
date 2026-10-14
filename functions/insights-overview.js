"use strict";

const { millis } = require("./insights-v2-qualification");
const { overallD1, recentD1Change } = require("./insights-axis-scoring");
const { metrics } = require("./athlete-profile-spec.json");
const { EXERCISES } = require("./insights-v2-qualification");
const TEST_LABELS = { shooting: "Shooting", sprint: "Sprint", jump: "Vertical jump", broadJump: "Broad jump", changeOfDirection: "Agility", dribbling: "Dribbling" };
const DAY = 86400000;
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function activePlan(plans) {
  return plans.filter(plan => plan.data?.status === "active").sort((a, b) =>
    (millis(b.data.activatedAt ?? b.data.generatedAt) ?? 0) - (millis(a.data.activatedAt ?? a.data.generatedAt) ?? 0))[0] || null;
}
function planProgress(planRow, logs, now) {
  if (!planRow) return { sessionsDone: null, sessionsPlanned: null, activePlan: false, planAgeDays: null };
  const plan = planRow.data, context = plan.intake?.trainingContext || plan.trainingContext || {};
  let today = null;
  try {
    // Absence retains the legacy UTC default. An explicit unusable timezone
    // cannot supply calendar targets and must not take the whole roster down.
    const timezone = Object.hasOwn(plan, "timezone") ? plan.timezone : "UTC";
    if (typeof timezone === "string" && timezone.length) today = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  } catch { /* Calendar targets remain unavailable; absolute log times are usable. */ }
  const recentStart = today ? new Date(Date.parse(`${today}T12:00:00Z`) - 13 * DAY).toISOString().slice(0, 10) : null;
  const startDate = validDate(context.startDate) ? context.startDate : validDate(plan.startDate) ? plan.startDate : null;
  const intervalStart = startDate && startDate > recentStart ? startDate : recentStart;
  const activeDays = today && startDate && intervalStart <= today ? Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${intervalStart}T12:00:00Z`)) / DAY) + 1 : 0;
  let sessionsPlanned = null;
  const weekdays = Array.isArray(context.sessionDays) ? [...new Set(context.sessionDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))] : [];
  const perWeek = Number(plan.sessionsPerWeek ?? plan.intake?.sessionsPerWeek);
  if (today && context.scheduleConfirmed === true && weekdays.length && weekdays.length === perWeek && startDate) {
    sessionsPlanned = 0;
    for (let date = intervalStart; activeDays > 0 && date <= today; date = new Date(Date.parse(`${date}T12:00:00Z`) + DAY).toISOString().slice(0, 10)) {
      if (weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) sessionsPlanned++;
    }
  } else {
    if (Number.isFinite(perWeek) && perWeek > 0 && perWeek <= 7 && startDate && activeDays > 0) sessionsPlanned = Math.ceil(perWeek * activeDays / 7);
  }
  const planIds = new Set([planRow.id, plan.planId].filter(value => typeof value === "string" && value));
  const slots = new Set((Array.isArray(plan.weeks) ? plan.weeks : []).flatMap(week => Array.isArray(week?.workouts) ? week.workouts.map(workout => workout?.workoutId).filter(value => typeof value === "string" && value) : []));
  const done = new Set();
  for (const log of logs) {
    if (!planIds.has(log.planId) || log.source === "adhoc" || !log.workoutId || slots.size && !slots.has(log.workoutId)) continue;
    if (log.id && log.id !== `${log.planId}_${log.workoutId}`) continue;
    if (log.endReason === "completed" && millis(log.endedAt) !== null && millis(log.endedAt) >= now - 14 * DAY && millis(log.endedAt) <= now) done.add(log.workoutId);
  }
  const activatedAt = millis(plan.activatedAt ?? plan.generatedAt) ?? (today && startDate ? Date.parse(`${startDate}T00:00:00Z`) : null);
  return { sessionsDone: done.size, sessionsPlanned, activePlan: true,
    planAgeDays: activatedAt === null ? null : Math.max(0, Math.floor((now - activatedAt) / DAY)) };
}
/** Compare like-for-like qualified metrics on the latest two local dates for each
 * test. Different exercises or missing metrics cannot imply a decline. Values
 * that display identically at the existing metric precision are unchanged. */
function recentMeasuredTests(tests, timeZone) {
  return EXERCISES.map(drill => {
    const days = new Map();
    for (const event of tests) {
      if (event.drill !== drill || !event.qualified || event.duplicate || !Number.isFinite(event.at) || !event.profileMetrics) continue;
      const values = metrics.filter(metric => !metric.placeholder && metric.drills.includes(drill))
        .filter(metric => Number.isFinite(event.profileMetrics[metric.key]) && event.profileMetrics[metric.key] > 0);
      if (!values.length) continue;
      const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(event.at);
      const row = days.get(date) || {};
      for (const metric of values) {
        const value = event.profileMetrics[metric.key], previous = row[metric.key];
        row[metric.key] = previous === undefined ? value : metric.direction === "lower" ? Math.min(value, previous) : Math.max(value, previous);
      }
      days.set(date, row);
    }
    const dates = [...days.keys()].sort(), lastTestDate = dates.at(-1) || null, previousTestDate = dates.at(-2) || null;
    const current = days.get(lastTestDate) || {}, previous = days.get(previousTestDate) || {};
    const rows = metrics.filter(metric => !metric.placeholder && metric.drills.includes(drill) && current[metric.key] !== undefined).map(metric => {
      const before = previous[metric.key] ?? null, after = current[metric.key];
      const displayed = value => Number((value * (metric.divisor || 1)).toFixed(metric.key.toLowerCase().includes("time") ? 2 : 1));
      const delta = before === null ? null : (displayed(after) - displayed(before)) * (metric.direction === "lower" ? -1 : 1);
      return { key: metric.key, current: after, previous: before, direction: metric.direction,
        trend: delta === null ? "unavailable" : delta < 0 ? "down" : delta > 0 ? "up" : "same" };
    });
    const comparable = rows.filter(row => row.trend !== "unavailable"), down = comparable.some(row => row.trend === "down"), up = comparable.some(row => row.trend === "up");
    return { drill, lastTestDate, previousTestDate, metrics: rows,
      status: !lastTestDate ? "notTested" : !previousTestDate ? "noPriorTest" : !comparable.length ? "notComparable" : down && up ? "mixed" : down ? "down" : up ? "up" : "same" };
  });
}
function playerPerformance({ testing, training, workouts, now, endMillis, timeZone }) {
  const tests = testing.filter(event => Number.isFinite(event.at) && event.at < endMillis);
  const change = recentD1Change(tests, timeZone);
  const progress = planProgress(training?.plan || null, training?.logs || [], now);
  const reasons = [];
  const changePoints = change.change === null ? null : Math.round(change.change);
  const measuredTests = recentMeasuredTests(tests, timeZone);
  const completedInPeriod = Number.isSafeInteger(workouts?.completed) && workouts.completed >= 0 ? workouts.completed : null;
  if (completedInPeriod === 0) reasons.push("No completed workouts in this period");
  const declined = measuredTests.filter(test => test.metrics.some(metric => metric.trend === "down"));
  if (declined.length) reasons.push(`Recent testing down · ${declined.map(test => TEST_LABELS[test.drill]).join(", ")}`);
  return { d1: overallD1(tests), change: changePoints, lastTestDate: change.lastTestDate,
    previousTestDate: change.previousTestDate || null, ...progress, needsYouReasons: reasons,
    coachFocus: { version: 1, completedInPeriod, measuredTests } };
}
/** Complete reporting population, before roster name search or pagination.
 * These comparisons already use qualified projections, local dates and display
 * precision. Legacy scores and test-level statuses are not evidence of a gain. */
function coachTestingOverview(rows, asOfDate) {
  const result = { version: 1, asOfDate, comparablePlayers: 0, improvingPlayers: [], reviewPlayers: [] };
  for (const row of rows) {
    const focus = row.performance?.coachFocus;
    if (focus?.version !== 1) continue;
    const measuredTests = focus.measuredTests.filter(test => validDate(test.previousTestDate) && validDate(test.lastTestDate)
      && test.previousTestDate < test.lastTestDate && test.lastTestDate <= asOfDate)
      .map(test => ({ ...test, metrics: test.metrics.filter(metric => Number.isFinite(metric.previous) && metric.previous > 0
        && Number.isFinite(metric.current) && metric.current > 0 && ["up", "down", "same"].includes(metric.trend)) }))
      .filter(test => test.metrics.length);
    if (!measuredTests.length) continue;
    result.comparablePlayers++;
    const values = measuredTests.flatMap(test => test.metrics);
    const up = values.some(metric => metric.trend === "up"), down = values.some(metric => metric.trend === "down");
    const player = { id: row.id, name: `${row.firstName} ${row.lastName}`.trim() || "Player",
      status: down && up ? "mixed" : down ? "down" : "up", measuredTests };
    if (down) result.reviewPlayers.push(player);
    else if (up) result.improvingPlayers.push(player);
  }
  for (const group of [result.improvingPlayers, result.reviewPlayers]) group.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return result;
}
module.exports = { activePlan, planProgress, playerPerformance, recentMeasuredTests, coachTestingOverview };
