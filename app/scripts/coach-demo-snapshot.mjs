// Entirely fictional fixtures for the public Coach View demo. Increment the
// version if team/player ordinals change: local sample notes use those positions.
export const coachDemoVersion = 1;

const startDate = "2026-04-13";
const endDate = "2026-04-14";
const comparisonMinimum = 5;
const squads = [
  { name: "Varsity", size: 24, ages: [16, 17, 15, 16, 17, 17, 18, 16] },
  { name: "JV", size: 18, ages: [14, 15, 14, 16, 15, 15] },
];

// Mock measurements are generated as integer display increments: hundredths
// of a second or tenths of an inch/foot. This gives equal results equal rank.
const tests = [
  { label: "Left dribble", unit: "s", digits: 2, base: 720, ageStep: -14, spread: 9 },
  { label: "Right dribble", unit: "s", digits: 2, base: 700, ageStep: -12, spread: 8 },
  { label: "Sprint", unit: "s", digits: 2, base: 338, ageStep: -8, spread: 4 },
  { label: "Change of direction", unit: "s", digits: 2, base: 575, ageStep: -9, spread: 6 },
  { label: "Vertical jump", unit: "in", digits: 1, base: 139, ageStep: 7, spread: 5 },
  { label: "Broad jump", unit: "ft", digits: 1, base: 54, ageStep: 3, spread: 2 },
];

function generatePlayer(number, age, lastOnRoster) {
  const scores = tests.map((test, index) => {
    if (lastOnRoster || (number + index * 3) % 13 === 0) return null;
    const variation = (number * 5 + index * 2) % 13 - 6;
    return test.base + (age - 14) * test.ageStep + variation * test.spread;
  });
  return { number, name: "Player " + String(number).padStart(2, "0"), age, scores };
}

function activityFor(number) {
  const state = number % 6;
  if (state === 0) {
    return { signedIn: null, firstWorkoutCompleted: null, timerMinutes: null, timerRecords: null };
  }
  if (state === 1 || state === 2) {
    return { signedIn: state === 2, firstWorkoutCompleted: false, timerMinutes: 0, timerRecords: 0 };
  }
  // A finished workout can have no timer. Timer minutes are accumulated
  // workout time and are always associated with an actual timer record.
  const timerRecords = state === 3 ? 0 : 1 + number % 3;
  return { signedIn: true, firstWorkoutCompleted: true, timerRecords, timerMinutes: timerRecords * (8 + number % 14) };
}

const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const format = (value, test) => (value / 10 ** test.digits).toFixed(test.digits) + " " + test.unit;

function metricFor(player, test, index, peers) {
  const value = player.scores[index];
  if (value === null) return { label: test.label, result: null };
  const metric = {
    label: test.label,
    result: format(value, test),
    estimated: (player.number * 5 + index) % 17 === 0,
    date: (player.number + index) % 4 === 0 ? startDate : endDate,
  };
  if (peers.length < comparisonMinimum) return metric;
  const worse = peers.filter(other => test.unit === "s" ? other > value : other < value).length;
  const ties = peers.filter(other => other === value).length;
  const rank = 100 * (worse + ties / 2) / peers.length;
  return {
    ...metric, average: format(mean(peers), test), count: peers.length,
    percentile: 5 * Math.round(rank / 5), band: rank < 25 ? "practice" : rank < 75 ? "middle" : "strong",
  };
}

function pathwayFor(test, index, program, peers) {
  const byAge = new Map();
  for (const player of program) {
    const value = player.scores[index];
    if (value === null) continue;
    if (!byAge.has(player.age)) byAge.set(player.age, []);
    byAge.get(player.age).push(value);
  }
  const chartMean = values => Number((mean(values) / 10 ** test.digits).toFixed(2));
  return {
    test: test.label, unit: test.unit,
    groups: [...byAge.entries()].sort(([a], [b]) => a - b)
      .filter(([, values]) => values.length >= comparisonMinimum)
      .map(([age, values]) => ({ age, count: values.length, mean: chartMean(values) })),
    teamCount: peers.length, teamMean: peers.length >= comparisonMinimum ? chartMean(peers) : null,
  };
}

export function createCoachDemoSnapshot() {
  let number = 0;
  const rosters = squads.map(({ size, ages }) => Array.from({ length: size }, (_, index) =>
    generatePlayer(++number, ages[index % ages.length], index === size - 1)));
  const program = rosters.flat();
  const teams = rosters.map((roster, teamIndex) => {
    const team = squads[teamIndex].name;
    const peers = tests.map((_, i) => roster.map(player => player.scores[i]).filter(score => score !== null));
    const athletes = roster.map(player => {
      const activity = activityFor(player.number);
      const metrics = tests.map((test, i) => metricFor(player, test, i, peers[i]));
      return {
        name: player.name,
        workouts: activity.firstWorkoutCompleted ? Math.max(activity.timerRecords, 1 + player.number % 4) : 0,
        testingAttempts: metrics.filter(metric => metric.result !== null).length,
        followUp: activity.firstWorkoutCompleted !== true,
        activity,
        report: { date: "Apr 13–14, 2026", comparisonLabel: "Team average", notes: [], metrics },
      };
    });
    return {
      team, shortName: team, club: "Demo program", asOf: "Apr 15, 2026", athletes,
      testingWindow: { startDate, endDate, pathway: tests.map((test, i) => pathwayFor(test, i, program, peers[i])) },
    };
  });
  return { layout: "roster-results", teams };
}

if (import.meta.main) process.stdout.write(JSON.stringify(createCoachDemoSnapshot()) + "\n");
