import type { Metric } from "../CoachStandings";
import type { RosterAthlete } from "../CoachRoster";

export function hasScore(metric?: Metric): metric is Metric & { result: string } {
  const result = metric?.result?.trim();
  return Boolean(result && !/^(?:unavailable|unscored|not available|not recorded|n\/a|[-–—])$/i.test(result));
}

type Milestones = {
  signedIn: boolean | null;
  firstWorkoutCompleted: boolean | null;
  timerMinutes?: number | null;
  timerRecords?: number | null;
};
export type SharedAthlete = RosterAthlete & { followUp: boolean; activity?: Milestones };
export const pathwayUnits = {
  "Vertical jump": "in", "Broad jump": "ft",
  "Left dribble": "s", "Right dribble": "s", "Sprint": "s", "Change of direction": "s",
} as const;

export type TeamTestComparison = {
  test: keyof typeof pathwayUnits;
  unit: (typeof pathwayUnits)[keyof typeof pathwayUnits];
  groups: { age: number; count: number; mean: number }[];
  teamMean: number | null;
  teamCount: number;
};
export type TeamAgeSeries = TeamTestComparison & { date: string };
export type TestingWindow = { startDate: string; endDate: string; pathway: TeamTestComparison[] };
export type SharedTeam = {
  layout?: string; team: string; shortName?: string; club: string; asOf: string; athletes: SharedAthlete[];
  pathway?: TeamAgeSeries[]; testingWindow?: TestingWindow;
};

const windowDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatTestingWindow({ startDate, endDate }: TestingWindow) {
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  return windowDateFormat.formatRange(start, end).replace(/\s*–\s*/g, "–");
}

export function rosterName(team: SharedTeam) {
  return team.shortName || team.team.split(" — ")[0];
}
