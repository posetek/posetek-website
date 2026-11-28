/** Fictional marketing examples. Never connected to athlete records or saved plans. */
export const profileAreas = ["Speed", "Shooting", "Power", "Control", "Agility"] as const;

export type SamplePlayer = {
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
  otherDribbleResults: { name: string; seconds: number }[];
  players: SamplePlayer[];
};

// Fictional club peers on the same left dribbling course, distinct from the sample team rosters.
export const clubDribbleBenchmarks = [
  { ageGroup: "U13", testedPlayers: 12, meanSeconds: 7.05 },
  { ageGroup: "U15", testedPlayers: 10, meanSeconds: 6.66 },
  { ageGroup: "U17", testedPlayers: 14, meanSeconds: 6.41 },
] as const;

export function getDribbleReport(team: SampleTeam) {
  const results = [
    ...team.players.map(player => ({ name: player.name, seconds: player.latestDribbleSeconds })),
    ...team.otherDribbleResults,
  ];
  const byTime = results.sort((a, b) => a.seconds - b.seconds);
  return {
    testedPlayers: byTime.length,
    averageSeconds: byTime.reduce((sum, result) => sum + result.seconds, 0) / byTime.length,
    fastestSeconds: byTime[0].seconds,
    checkInName: byTime[byTime.length - 1].name,
  };
}

export const sampleTeams: SampleTeam[] = [
  {
    id: "u13", name: "U13", coach: "Jamie Morgan",
    otherDribbleResults: [{ name: "Quinn Hall", seconds: 6.87 }, { name: "Ari Hayes", seconds: 7.15 }],
    players: [
      { id: "u13-alex", name: "Alex Rivera", position: "Midfielder", number: 8, scores: [72, 63, 68, 58, 70], focus: "Keep the ball close through each turn.", priorDribbleSeconds: 7.12, latestDribbleSeconds: 6.94, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Use small touches around both cones." },
      { id: "u13-sam", name: "Sam Bennett", position: "Defender", number: 4, scores: [66, 56, 74, 62, 65], focus: "Set up the next pass with a controlled first touch.", priorDribbleSeconds: 7.46, latestDribbleSeconds: 7.31, drillId: "PAS-001", plannedSessions: 3, completedSessions: 1, cue: "Receive in front of you. Pass straight back." },
      { id: "u13-robin", name: "Robin Ellis", position: "Forward", number: 11, scores: [77, 74, 63, 61, 69], focus: "Carry control into the change of direction.", priorDribbleSeconds: 6.88, latestDribbleSeconds: 6.72, drillId: "DRB-006", plannedSessions: 3, completedSessions: 3, cue: "Stay balanced as you move between the cones." },
    ],
  },
  {
    id: "u15", name: "U15", coach: "Taylor Brooks",
    otherDribbleResults: [{ name: "Lane Brooks", seconds: 6.49 }, { name: "Parker Stone", seconds: 6.79 }],
    players: [
      { id: "u15-jordan", name: "Jordan Lee", position: "Midfielder", number: 6, scores: [76, 69, 72, 63, 78], focus: "Build a repeatable first touch and passing rhythm.", priorDribbleSeconds: 6.76, latestDribbleSeconds: 6.60, drillId: "PAS-001", plannedSessions: 3, completedSessions: 2, cue: "Keep your body centered behind the pass." },
      { id: "u15-riley", name: "Riley Chen", position: "Winger", number: 7, scores: [83, 70, 68, 65, 77], focus: "Keep close control as the pace changes.", priorDribbleSeconds: 6.42, latestDribbleSeconds: 6.28, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Guide the ball around each cone with short touches." },
      { id: "u15-casey", name: "Casey Walker", position: "Defender", number: 5, scores: [73, 61, 81, 66, 72], focus: "Prepare the ball for a clean return pass.", priorDribbleSeconds: 6.95, latestDribbleSeconds: 6.84, drillId: "PAS-001", plannedSessions: 3, completedSessions: 1, cue: "Soften the first touch before you pass." },
    ],
  },
  {
    id: "u17", name: "U17", coach: "Charlie Reid",
    otherDribbleResults: [{ name: "Jules Clark", seconds: 6.31 }, { name: "Sage Adams", seconds: 6.46 }],
    players: [
      { id: "u17-morgan", name: "Morgan Adams", position: "Forward", number: 9, scores: [84, 82, 78, 69, 81], focus: "Stay in control through tighter turns.", priorDribbleSeconds: 6.31, latestDribbleSeconds: 6.18, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Keep the ball within reach around each cone." },
      { id: "u17-drew", name: "Drew Patel", position: "Midfielder", number: 10, scores: [78, 73, 77, 71, 79], focus: "Make the first touch part of the next pass.", priorDribbleSeconds: 6.54, latestDribbleSeconds: 6.39, drillId: "PAS-001", plannedSessions: 3, completedSessions: 3, cue: "Find one steady receive-and-pass rhythm." },
      { id: "u17-avery", name: "Avery Shaw", position: "Fullback", number: 3, scores: [82, 65, 80, 68, 83], focus: "Control the ball while changing direction.", priorDribbleSeconds: 6.63, latestDribbleSeconds: 6.49, drillId: "DRB-006", plannedSessions: 3, completedSessions: 2, cue: "Look up between turns and keep your touches close." },
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
