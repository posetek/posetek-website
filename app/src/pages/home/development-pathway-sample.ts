import type { ClubStats } from "../athlete-portal/player/stats/club-cloud";

/** Fictional results for Alex Johnson and the seven Parkside FC age groups, U11–U17. */
const ageGroupCounts = [18, 20, 21, 24, 20, 17, 22] as const;
const courseSpeed = (time: number) => 20 / time; // The sample course is 10 m out and 10 m back.
export const sampleDribbleTimes = [6.62, 6.43, 6.31, 6.18] as const;

interface SamplePathway {
  label: string;
  measure: string;
  unit: string;
  digits: number;
  testDayResult: string;
  testDayTeamAverage: string;
  ownResults: readonly number[];
  ageMeans: readonly number[];
  ageSpreads: readonly number[];
}

export const samplePathways = {
  dribbleLeft: {
    label: "Left dribble", measure: "Course speed", unit: "m/s", digits: 2,
    testDayResult: "6.18 s", testDayTeamAverage: "6.05 s",
    ownResults: sampleDribbleTimes.map(courseSpeed),
    ageMeans: [2.17, 2.31, 2.47, 2.61, 2.86, 3.13, 3.28],
    ageSpreads: [.24, .27, .30, .32, .31, .33, .30],
  },
  dribbleRight: {
    label: "Right dribble", measure: "Course speed", unit: "m/s", digits: 2,
    testDayResult: "6.05 s", testDayTeamAverage: "6.12 s",
    ownResults: [courseSpeed(6.05)],
    ageMeans: [2.20, 2.36, 2.54, 2.72, 2.94, 3.11, 3.23],
    ageSpreads: [.30, .26, .32, .30, .32, .34, .32],
  },
  sprint: {
    label: "Sprint", measure: "Speed at 5 m", unit: "mph", digits: 1,
    testDayResult: "2.41 s", testDayTeamAverage: "2.45 s",
    ownResults: [12.8],
    ageMeans: [9.1, 9.5, 10.3, 10.8, 11.5, 12.2, 12.6],
    ageSpreads: [.85, .9, .94, 1.02, 1.1, .98, 1.05],
  },
  changeOfDirection: {
    label: "Change of direction", measure: "Course speed", unit: "m/s", digits: 2,
    testDayResult: "5.12 s", testDayTeamAverage: "5.19 s",
    ownResults: [courseSpeed(5.12)],
    ageMeans: [2.74, 2.95, 3.08, 3.28, 3.55, 3.72, 3.84],
    ageSpreads: [.29, .30, .34, .35, .33, .39, .34],
  },
  jump: {
    label: "Vertical jump", measure: "Jump height", unit: "in", digits: 1,
    testDayResult: "18.9 in", testDayTeamAverage: "19.4 in",
    ownResults: [18.9],
    ageMeans: [10.7, 11.9, 13.6, 15.2, 16.8, 18.3, 19.5],
    ageSpreads: [1.5, 1.8, 2.1, 2.3, 2.0, 2.3, 2.4],
  },
  broadJump: {
    label: "Broad jump", measure: "Jump distance", unit: "ft", digits: 1,
    testDayResult: "7.2 ft", testDayTeamAverage: "6.9 ft",
    ownResults: [2.18 / .3048],
    ageMeans: [4.3, 4.6, 5.1, 5.5, 6.1, 6.6, 7.0],
    ageSpreads: [.48, .5, .54, .56, .57, .6, .59],
  },
} as const satisfies Record<string, SamplePathway>;

export type PathwayTestId = keyof typeof samplePathways;
export const DEFAULT_PATHWAY_ID: PathwayTestId = "dribbleLeft";
export const pathwayTestIds = Object.keys(samplePathways) as PathwayTestId[];

/** The same aggregate input the signed-in chart receives, expressed in the displayed units. */
export function samplePathwayStats(id: PathwayTestId): ClubStats {
  const test = samplePathways[id];
  const groups = ageGroupCounts.map((count, index) => ({
    ageGroup: 11 + index,
    count,
    mean: test.ageMeans[index],
    sd: test.ageSpreads[index],
  }));
  const count = groups.reduce((total, group) => total + group.count, 0);
  const mean = groups.reduce((total, group) => total + group.mean * group.count, 0) / count;
  const sumSquares = groups.reduce((total, group) =>
    total + (group.count - 1) * group.sd ** 2 + group.count * (group.mean - mean) ** 2, 0);
  return {
    groups,
    unit: test.unit,
    higherIsBetter: true,
    athletes: count,
    overall: { count, mean, sd: Math.sqrt(sumSquares / (count - 1)) },
    own: { ageGroup: 17, best: Math.max(...test.ownResults), results: [...test.ownResults] },
  };
}
