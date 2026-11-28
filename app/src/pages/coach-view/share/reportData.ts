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
export type Assessment = { id: string; label: string; startDate: string; endDate: string };
export type HistoryEntry = { assessmentId: string; notes: string[]; metrics: Metric[] };
export type OrganizationSeries = {
  test: string; ageBasis: "team-band" | "recorded-age"; unit: "s" | "m/s" | "in" | "ft" | "mph" | "m" | "cm";
  description: string; groups: { age: number; count: number | null; mean: number | null; status: "published" | "unavailable" | "small-group" | "incompatible" }[];
  teamMean: number | null; teamCount: number | null;
};
export type SharedAthlete = Omit<RosterAthlete, "report"> & { report?: NonNullable<RosterAthlete["report"]> & { history?: HistoryEntry[] }; followUp: boolean; activity?: Milestones };
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
  pathway?: TeamAgeSeries[]; testingWindow?: TestingWindow; assessments?: Assessment[];
  organizationPathway?: { through: string; series: OrganizationSeries[] };
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

/** Use the assessment ID to keep unrelated testing on the same date separate. */
export function assessmentTeam(team: SharedTeam, assessment?: Assessment): SharedTeam {
  if (!assessment) return team;
  return { ...team, testingWindow: { ...assessment, pathway: [] }, athletes: team.athletes.map(athlete => {
    if (!athlete.report) return athlete;
    const { report } = athlete;
    const entry = report.history?.find(item => item.assessmentId === assessment.id);
    return { ...athlete, report: { ...report, date: "", comparisonLabel: "Team average",
      notes: entry?.notes ?? [], metrics: entry?.metrics ?? report.metrics.map(({ label }) => ({ label, result: null })) } };
  }) };
}
