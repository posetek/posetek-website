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
export type TeamAgeSeries = {
  date: string;
  test: "Vertical jump" | "Broad jump";
  unit: "in" | "ft";
  groups: { age: number; count: number; mean: number }[];
  teamMean: number | null;
  teamCount: number;
};
export type SharedTeam = { layout?: string; team: string; shortName?: string; club: string; asOf: string; athletes: SharedAthlete[]; pathway?: TeamAgeSeries[] };

export function rosterName(team: SharedTeam) {
  return team.shortName || team.team.split(" — ")[0];
}
