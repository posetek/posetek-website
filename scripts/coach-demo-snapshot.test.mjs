import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createCoachDemoSnapshot } from "../app/scripts/coach-demo-snapshot.mjs";

const script = fileURLToPath(new URL("../app/scripts/coach-demo-snapshot.mjs", import.meta.url));

test("the standalone demo CLI and import return the same fictional rosters", () => {
  const sample = createCoachDemoSnapshot();
  assert.deepEqual(JSON.parse(execFileSync(process.execPath, [script], { encoding: "utf8" })), sample);
  assert.deepEqual(sample.teams.map(t => [t.club, t.team, t.athletes.length]), [
    ["Demo program", "Varsity", 24], ["Demo program", "JV", 18],
  ]);
  const athletes = sample.teams.flatMap(t => t.athletes);
  assert.deepEqual(athletes.map(a => a.name), Array.from({ length: 42 }, (_, i) =>
    "Player " + String(i + 1).padStart(2, "0")));
  assert(athletes.some(a => a.testingAttempts === 0));
  assert(athletes.some(a => a.testingAttempts > 0 && a.testingAttempts < 6));
  assert(athletes.some(a => a.report.metrics.some(m => m.estimated)));
  assert(athletes.some(a => new Set(a.report.metrics.filter(m => m.result).map(m => m.date)).size === 2));
  assert(athletes.some(a => a.activity.signedIn === null && a.activity.timerRecords === null));
  assert(athletes.some(a => a.activity.signedIn && !a.activity.firstWorkoutCompleted));
  assert(athletes.some(a => a.activity.firstWorkoutCompleted && a.activity.timerMinutes === 0));
  assert(athletes.some(a => a.activity.timerRecords > 0 && a.activity.timerMinutes > 0));
  for (const athlete of athletes) {
    assert.equal(athlete.testingAttempts, athlete.report.metrics.filter(m => m.result !== null).length);
    assert.equal(athlete.workouts > 0, athlete.activity.firstWorkoutCompleted === true);
  }
  athletes[0].name = "Edited";
  assert.equal(createCoachDemoSnapshot().teams[0].athletes[0].name, "Player 01");
});

test("each team comparison uses its displayed scores, including ties and the direction of the test", () => {
  const { teams } = createCoachDemoSnapshot();
  for (const team of teams) {
    const paths = team.testingWindow.pathway;
    assert.equal(new Set(paths.map(s => s.test)).size, 6);
    assert(paths.every(s => s.groups.length > 0));
    for (const [i, path] of paths.entries()) {
      const metrics = team.athletes.map(a => a.report.metrics[i]);
      const scores = metrics.filter(m => m.result !== null);
      const data = scores.map(m => Number.parseFloat(m.result));
      assert.equal(scores.length, path.teamCount);
      const digits = path.unit === "s" ? 2 : 1;
      const scale = 10 ** digits;
      const mean = data.reduce((sum, n) => sum + Math.round(scale * n), 0) / data.length / scale;
      assert.equal(path.teamMean, Number(mean.toFixed(2)));
      for (const metric of scores) {
        assert.equal(metric.label, path.test);
        assert(metric.result.endsWith(" " + path.unit));
        assert([team.testingWindow.startDate, team.testingWindow.endDate].includes(metric.date));
        assert.equal(metric.average, mean.toFixed(digits) + " " + path.unit);
        assert.equal(metric.count, scores.length);
        const own = Number.parseFloat(metric.result);
        const rank = 100 * data.reduce((sum, value) => {
          if (value === own) return sum + 0.5;
          const better = path.unit === "s" ? own < value : own > value;
          return sum + Number(better);
        }, 0) / data.length;
        assert.equal(metric.percentile, 5 * Math.round(rank / 5));
        assert.equal(metric.band, rank < 25 ? "practice" : rank < 75 ? "middle" : "strong");
      }
      for (const missing of metrics.filter(m => m.result === null)) assert.equal(missing.percentile, undefined);
    }
  }
});

test("age pathways pool each player once across teams and suppress small groups", () => {
  const { teams } = createCoachDemoSnapshot();
  const ageCycles = [[16, 17, 15, 16, 17, 17, 18, 16], [14, 15, 14, 16, 15, 15]];
  const athletes = teams.flatMap((t, teamIndex) => t.athletes.map((athlete, i) => ({
    athlete, age: ageCycles[teamIndex][i % ageCycles[teamIndex].length],
  })));
  for (const [i, series] of teams[0].testingWindow.pathway.entries()) {
    assert.deepEqual(series.groups, teams[1].testingWindow.pathway[i].groups);
    const expected = [];
    for (const age of [14, 15, 16, 17, 18]) {
      const scores = athletes.filter(p => p.age === age).map(p => p.athlete.report.metrics[i].result)
        .filter(value => value !== null).map(Number.parseFloat);
      if (scores.length < 5) continue;
      const scale = series.unit === "s" ? 100 : 10;
      const mean = scores.reduce((sum, n) => sum + Math.round(n * scale), 0) / scores.length / scale;
      expected.push({ age, count: scores.length, mean: Number(mean.toFixed(2)) });
    }
    assert.deepEqual(series.groups, expected);
  }
});
