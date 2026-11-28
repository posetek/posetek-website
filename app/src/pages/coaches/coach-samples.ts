/** Fictional marketing examples. Never connected to athlete records or saved plans. */
export const profileAreas = ["Speed", "Shooting", "Power", "Control", "Agility"] as const;

export const coachSessionDate = "Oct 14";
export const coachActivityWindow = "Oct 1–14";
export const reportTests = [
  { id: "dribbleLeft", label: "Left dribble", unit: "s", digits: 2, higherIsBetter: false },
  { id: "dribbleRight", label: "Right dribble", unit: "s", digits: 2, higherIsBetter: false },
  { id: "sprint", label: "Sprint", unit: "s", digits: 2, higherIsBetter: false },
  { id: "changeOfDirection", label: "Change of direction", unit: "s", digits: 2, higherIsBetter: false },
  { id: "broadJump", label: "Broad jump", unit: "ft", digits: 1, higherIsBetter: true },
  { id: "jump", label: "Vertical jump", unit: "in", digits: 1, higherIsBetter: true },
] as const;
export type ReportTest = typeof reportTests[number];
export type ReportTestId = ReportTest["id"];
type SessionRecord = {
  results: Record<Exclude<ReportTestId, "dribbleLeft">, number | null>;
  signedIn: boolean;
  workoutMinutes: number;
};

export type SamplePlayer = SessionRecord & {
  id: string;
  name: string;
  position: string;
  number: number;
  scores: [number, number, number, number, number];
  focus: string;
  priorDribbleSeconds: number;
  latestDribbleSeconds: number;
  drillId: "DRB-006" | "PAS-001";
  plannedSessions: number;
  completedSessions: number;
  cue: string;
};

export type SampleTeam = {
  id: string;
  name: string;
  coach: string;
  otherDribbleResults: (SessionRecord & { name: string; seconds: number })[];
  practiceNote: string;
  players: SamplePlayer[];
};

// Fictional club peers on the same left dribbling course, distinct from the sample team rosters.
export const clubDribbleBenchmarks = [
  { ageGroup: "U13", testedPlayers: 12, meanSeconds: 7.05 },
  { ageGroup: "U15", testedPlayers: 10, meanSeconds: 6.66 },
  { ageGroup: "U17", testedPlayers: 14, meanSeconds: 6.41 },
] as const;

const pathwayMeans: Record<ReportTestId, readonly number[]> = {
  dribbleLeft: clubDribbleBenchmarks.map(group => group.meanSeconds),
  dribbleRight: [6.96, 6.60, 6.39],
  sprint: [2.95, 2.77, 2.63],
  changeOfDirection: [5.75, 5.59, 5.40],
  broadJump: [5.3, 5.8, 6.2],
  jump: [14.6, 16.5, 18.1],
};

export function getClubTestPathway(id: ReportTestId) {
  return clubDribbleBenchmarks.map((group, index) => ({
    ageGroup: group.ageGroup,
    testedPlayers: group.testedPlayers,
    mean: pathwayMeans[id][index],
  }));
}

/** A dated fictional testing day. Missing attempts are excluded from that test only. */
export function getTeamTestReport(team: SampleTeam, id: ReportTestId) {
  const test = reportTests.find(item => item.id === id)!;
  const entries = [
    ...team.players.map(player => ({ name: player.name, value: id === "dribbleLeft" ? player.latestDribbleSeconds : player.results[id] })),
    ...team.otherDribbleResults.map(peer => ({ name: peer.name, value: id === "dribbleLeft" ? peer.seconds : peer.results[id] })),
  ].filter((entry): entry is { name: string; value: number } => entry.value !== null);
  entries.sort((a, b) => test.higherIsBetter ? b.value - a.value : a.value - b.value);
  // The fraction of other measured players below this result; ties receive the same percentile.
  const results = entries.map(entry => {
    const behind = entries.filter(other => test.higherIsBetter ? other.value < entry.value : other.value > entry.value).length;
    return { ...entry, percentile: entries.length > 1 ? Math.round(100 * behind / (entries.length - 1)) : 0 };
  });
  return {
    testedPlayers: results.length,
    average: results.reduce((sum, result) => sum + result.value, 0) / results.length,
    best: results[0].value,
    results,
  };
}

/** The coach can open every featured player’s profile from the sample check-in. */
export function getTeamCheckIn(team: SampleTeam) {
  return team.players.reduce((previous, player) => player.latestDribbleSeconds > previous.latestDribbleSeconds ? player : previous);
}

export function getTeamActivity(team: SampleTeam) {
  const players = [...team.players, ...team.otherDribbleResults];
  return {
    signedIn: players.filter(player => player.signedIn).length,
    rosterSize: players.length,
    workoutMinutes: players.reduce((sum, player) => sum + player.workoutMinutes, 0),
  };
}

export function getDribbleReport(team: SampleTeam) {
  const report = getTeamTestReport(team, "dribbleLeft");
  return {
    testedPlayers: report.testedPlayers,
    averageSeconds: report.average,
    fastestSeconds: report.best,
    checkInName: report.results[report.results.length - 1].name,
  };
}

export const sampleTeams: SampleTeam[] = [
  {
    id: "u13", name: "U13", coach: "Jamie Morgan",
    practiceNote: "On tight turns, the ball gets away from us on the first touch. Watch that touch at the next cone station.",
    otherDribbleResults: [{ name: "Quinn Hall", results: { dribbleRight: 6.85, sprint: 2.75, changeOfDirection: 5.7, broadJump: 5.7, jump: 15.0 }, signedIn: true, workoutMinutes: 0, seconds: 6.87 }, { name: "Ari Hayes", results: { dribbleRight: 7.05, sprint: null, changeOfDirection: 5.92, broadJump: null, jump: 14.1 }, signedIn: false, workoutMinutes: 0, seconds: 7.15 }],
    players: [
      { id: "u13-alex", name: "Alex Rivera", results: { dribbleRight: 6.75, sprint: 2.87, changeOfDirection: 5.61, broadJump: 5.5, jump: 15.0 }, signedIn: true, workoutMinutes: 24, position: "Midfielder", number: 8, scores: [72, 63, 68, 58, 70], focus: "Keep the ball close through each turn.", priorDribbleSeconds: 7.12, latestDribbleSeconds: 6.94, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Use small touches around both cones." },
      { id: "u13-sam", name: "Sam Bennett", results: { dribbleRight: 6.9, sprint: 2.95, changeOfDirection: 5.87, broadJump: 5.4, jump: 14.6 }, signedIn: true, workoutMinutes: 12, position: "Defender", number: 4, scores: [66, 56, 74, 62, 65], focus: "Keep the first touch within reach after the turn.", priorDribbleSeconds: 7.46, latestDribbleSeconds: 7.31, drillId: "DRB-006", plannedSessions: 3, completedSessions: 1, cue: "Take one short touch as you leave each cone." },
      { id: "u13-robin", name: "Robin Ellis", results: { dribbleRight: 6.8, sprint: 2.71, changeOfDirection: 5.55, broadJump: 5.9, jump: 16.3 }, signedIn: true, workoutMinutes: 38, position: "Forward", number: 11, scores: [77, 74, 63, 61, 69], focus: "Carry control into the change of direction.", priorDribbleSeconds: 6.88, latestDribbleSeconds: 6.72, drillId: "DRB-006", plannedSessions: 3, completedSessions: 3, cue: "Stay balanced as you move between the cones." },
    ],
  },
  {
    id: "u15", name: "U15", coach: "Taylor Brooks",
    practiceNote: "When the pace picks up, the next touch often carries past the cone. Watch the exit from the turn.",
    otherDribbleResults: [{ name: "Lane Brooks", results: { dribbleRight: 6.52, sprint: 2.77, changeOfDirection: 5.42, broadJump: 5.6, jump: null }, signedIn: true, workoutMinutes: 0, seconds: 6.49 }, { name: "Parker Stone", results: { dribbleRight: 6.7, sprint: 2.84, changeOfDirection: 5.78, broadJump: 5.5, jump: 15.8 }, signedIn: false, workoutMinutes: 0, seconds: 6.79 }],
    players: [
      { id: "u15-jordan", name: "Jordan Lee", results: { dribbleRight: 6.5, sprint: 2.78, changeOfDirection: 5.58, broadJump: 5.8, jump: 16.6 }, signedIn: true, workoutMinutes: 22, position: "Midfielder", number: 6, scores: [76, 69, 72, 63, 78], focus: "Build a repeatable first touch and passing rhythm.", priorDribbleSeconds: 6.76, latestDribbleSeconds: 6.60, drillId: "PAS-001", plannedSessions: 3, completedSessions: 2, cue: "Keep your body centered behind the pass." },
      { id: "u15-riley", name: "Riley Chen", results: { dribbleRight: 6.41, sprint: 2.65, changeOfDirection: 5.31, broadJump: 5.9, jump: 16.0 }, signedIn: true, workoutMinutes: 34, position: "Winger", number: 7, scores: [83, 70, 68, 65, 77], focus: "Keep close control as the pace changes.", priorDribbleSeconds: 6.42, latestDribbleSeconds: 6.28, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Guide the ball around each cone with short touches." },
      { id: "u15-casey", name: "Casey Walker", results: { dribbleRight: 6.58, sprint: 2.83, changeOfDirection: 5.61, broadJump: 6.1, jump: 17.2 }, signedIn: true, workoutMinutes: 14, position: "Defender", number: 5, scores: [73, 61, 81, 66, 72], focus: "Keep the ball close while changing pace.", priorDribbleSeconds: 6.95, latestDribbleSeconds: 6.84, drillId: "DRB-006", plannedSessions: 3, completedSessions: 1, cue: "Use short touches to guide the ball out of the turn." },
    ],
  },
  {
    id: "u17", name: "U17", coach: "Charlie Reid",
    practiceNote: "We lose close control when we change direction under pressure. Give players room to repeat the turn.",
    otherDribbleResults: [{ name: "Jules Clark", results: { dribbleRight: 6.27, sprint: 2.58, changeOfDirection: 5.34, broadJump: 6.1, jump: 17.9 }, signedIn: true, workoutMinutes: 16, seconds: 6.31 }, { name: "Sage Adams", results: { dribbleRight: 6.4, sprint: 2.68, changeOfDirection: 5.49, broadJump: 6.0, jump: null }, signedIn: true, workoutMinutes: 0, seconds: 6.46 }],
    players: [
      { id: "u17-morgan", name: "Morgan Adams", results: { dribbleRight: 6.16, sprint: 2.57, changeOfDirection: 5.3, broadJump: 6.5, jump: 18.8 }, signedIn: true, workoutMinutes: 27, position: "Forward", number: 9, scores: [84, 82, 78, 69, 81], focus: "Stay in control through tighter turns.", priorDribbleSeconds: 6.31, latestDribbleSeconds: 6.18, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Keep the ball within reach around each cone." },
      { id: "u17-drew", name: "Drew Patel", results: { dribbleRight: 6.36, sprint: 2.63, changeOfDirection: 5.51, broadJump: 6.2, jump: 17.6 }, signedIn: true, workoutMinutes: 39, position: "Midfielder", number: 10, scores: [78, 73, 77, 71, 79], focus: "Make the first touch part of the next pass.", priorDribbleSeconds: 6.54, latestDribbleSeconds: 6.39, drillId: "PAS-001", plannedSessions: 3, completedSessions: 3, cue: "Find one steady receive-and-pass rhythm." },
      { id: "u17-avery", name: "Avery Shaw", results: { dribbleRight: 6.37, sprint: 2.69, changeOfDirection: 5.44, broadJump: 6.4, jump: 18.4 }, signedIn: true, workoutMinutes: 31, position: "Fullback", number: 3, scores: [82, 65, 80, 68, 83], focus: "Control the ball while changing direction.", priorDribbleSeconds: 6.63, latestDribbleSeconds: 6.49, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Look up between turns and keep your touches close." },
    ],
  },
];

export function resolveTeam(teamId: string): SampleTeam {
  return sampleTeams.find(team => team.id === teamId) ?? sampleTeams[0];
}

/** A player from another team is never carried into the selected team's view. */
export function resolvePlayer(teamId: string, playerId: string): SamplePlayer {
  const team = resolveTeam(teamId);
  return team.players.find(player => player.id === playerId) ?? team.players[0];
}
