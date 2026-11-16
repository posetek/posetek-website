// Pure counting for the admin Journey tab (docs/features/STATS_JOURNEY.md). The server
// returns one row per visit to the Stats page; every number on the tab comes from here.
import { ONE_PAGER_TIME_ZONE } from "./onePagerTrend";

export type JourneyButton = "coach" | "plan" | "workout";
export type JourneyPlace = "home" | "coach" | "workouts" | "plan" | "other";
export type JourneyStop = JourneyPlace | "left";
export type StatsJourneyVisit = {
  playerId: string; teamId: string | null; staff: boolean; platform: string; from: string;
  landedAt: number; viewSeconds: number; reachedAt: number | null;
  button: JourneyButton | null; clickedAt: number | null;
  to: JourneyPlace | null; via: "button" | "tabs" | "other" | null; leftAt: number | null;
  coachAt: number | null; planAt: number | null; workoutAt: number | null;
};
export type StatsJourneyData = {
  startAt: number; endAt: number;
  /** False when the newest 5,000 visits were kept and older ones cut off. */
  complete: boolean;
  visits: StatsJourneyVisit[];
  players: Record<string, { name: string }>;
};
export type JourneyDays = 7 | 30 | 90;

export const JOURNEY_PERIODS: readonly [JourneyDays, string][] = [[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"]];
/** The Stats page's own button titles, and what following each one through means. */
export const JOURNEY_BUTTONS = [
  { key: "coach", title: "Ask the AI Coach", outcome: "coachAt", followed: "Messaged the coach" },
  { key: "plan", title: "Build my 6-week plan", outcome: "planAt", followed: "Asked for a plan" },
  { key: "workout", title: "Start a workout now", outcome: "workoutAt", followed: "Started a workout" },
] as const satisfies readonly { key: JourneyButton; title: string; outcome: keyof StatsJourneyVisit; followed: string }[];
export const JOURNEY_STOPS: readonly [JourneyStop, string][] = [
  ["coach", "Coach"], ["workouts", "Workouts"], ["home", "Home"], ["plan", "Plan"], ["other", "Other page"], ["left", "Last observed on Stats"],
];
/** A visit with no next stop that began this recently may still be open; older, the visitor left the site. */
export const STILL_OPEN_MS = 30 * 60 * 1000;
export const JOURNEY_VISIT_LIMIT = 5000;

export const formatPacific = new Intl.DateTimeFormat("en-US", { timeZone: ONE_PAGER_TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
const button = (key: JourneyButton) => JOURNEY_BUTTONS.find(entry => entry.key === key)!;
const playersWhere = (visits: StatsJourneyVisit[], test: (visit: StatsJourneyVisit) => boolean) => new Set(visits.filter(test).map(visit => visit.playerId)).size;

/** All teams, one team, or the players on no current team. */
export type JourneyTeamScope = { teamId?: string; unassigned?: boolean; teamIds: string[] };
export function inTeamScope(teamId: string | null | undefined, scope: JourneyTeamScope): boolean {
  if (scope.teamId) return teamId === scope.teamId;
  if (scope.unassigned) return !teamId || !scope.teamIds.includes(teamId);
  return true;
}
/** The visits the tab counts: the selected team, and staff only when asked for. */
export function journeyVisits(data: StatsJourneyData, { includeStaff, team }: { includeStaff: boolean; team: JourneyTeamScope }): StatsJourneyVisit[] {
  return data.visits.filter(visit => (includeStaff || !visit.staff) && inTeamScope(visit.teamId, team));
}

/** The button of a visit that was clicked and then followed through (its outcome at or after the click). */
export function followedThrough(visit: StatsJourneyVisit): JourneyButton | null {
  if (!visit.button || visit.clickedAt === null) return null;
  const at = visit[button(visit.button).outcome];
  return typeof at === "number" && at >= visit.clickedAt ? visit.button : null;
}

/** Players at each step; a player counts once per step, under every button they used. */
export function journeyFunnel(visits: StatsJourneyVisit[]) {
  const by = (test: (visit: StatsJourneyVisit, key: JourneyButton) => boolean) =>
    Object.fromEntries(JOURNEY_BUTTONS.map(({ key }) => [key, playersWhere(visits, visit => test(visit, key))])) as Record<JourneyButton, number>;
  return {
    landed: playersWhere(visits, () => true),
    reached: playersWhere(visits, visit => visit.reachedAt !== null),
    clicked: playersWhere(visits, visit => visit.clickedAt !== null && visit.button !== null),
    clickedBy: by((visit, key) => visit.clickedAt !== null && visit.button === key),
    followed: playersWhere(visits, visit => followedThrough(visit) !== null),
    followedBy: by((visit, key) => followedThrough(visit) === key),
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
/** The median visible time per visit (a few long visits would distort a mean), overall and by whether a button was clicked. */
export function journeyTime(visits: StatsJourneyVisit[]) {
  const group = (rows: StatsJourneyVisit[]) => ({ visits: rows.length, median: median(rows.map(visit => visit.viewSeconds)) });
  return { all: group(visits), clicked: group(visits.filter(visit => visit.clickedAt !== null)), other: group(visits.filter(visit => visit.clickedAt === null)) };
}

/** Where a visit went next; `null` while it may still be open. */
export function nextStop(visit: StatsJourneyVisit, endAt: number): JourneyStop | null {
  if (visit.to) return visit.to;
  return endAt - visit.landedAt > STILL_OPEN_MS ? "left" : null;
}
export function journeyNextStops(visits: StatsJourneyVisit[], endAt: number) {
  const finished = visits.map(visit => ({ visit, stop: nextStop(visit, endAt) })).filter(row => row.stop !== null);
  return {
    finished: finished.length, open: visits.length - finished.length,
    rows: JOURNEY_STOPS.map(([key, label]) => {
      const rows = finished.filter(row => row.stop === key);
      return { key, label, visits: rows.length, byButton: rows.filter(row => row.visit.via === "button").length, byTabs: rows.filter(row => row.visit.via === "tabs").length };
    }),
  };
}

export type JourneyPlayerRow = {
  playerId: string; teamId: string | null; visits: number; staffVisits: number; firstAt: number; lastAt: number;
  viewSeconds: number; reached: boolean; clicked: JourneyButton[]; next: JourneyStop | null; followed: JourneyButton[];
};
/** One row per player, most recent visit first. The team and next stop are those of their latest visits. */
export function journeyPlayers(visits: StatsJourneyVisit[], endAt: number): JourneyPlayerRow[] {
  const groups = new Map<string, StatsJourneyVisit[]>();
  for (const visit of visits) groups.set(visit.playerId, [...(groups.get(visit.playerId) || []), visit]);
  return [...groups].map(([playerId, rows]) => {
    const latest = [...rows].sort((a, b) => b.landedAt - a.landedAt);
    return {
      playerId, teamId: latest[0].teamId, visits: rows.length, staffVisits: rows.filter(visit => visit.staff).length,
      firstAt: latest[latest.length - 1].landedAt, lastAt: latest[0].landedAt,
      viewSeconds: rows.reduce((sum, visit) => sum + visit.viewSeconds, 0),
      reached: rows.some(visit => visit.reachedAt !== null),
      clicked: JOURNEY_BUTTONS.filter(({ key }) => rows.some(visit => visit.clickedAt !== null && visit.button === key)).map(({ key }) => key),
      next: latest.map(visit => nextStop(visit, endAt)).find(stop => stop !== null) ?? null,
      followed: JOURNEY_BUTTONS.filter(({ key }) => rows.some(visit => followedThrough(visit) === key)).map(({ key }) => key),
    };
  }).sort((a, b) => b.lastAt - a.lastAt || a.playerId.localeCompare(b.playerId));
}

export type OnePagerReportRow = { id: string; openedAt: number | null };
/**
 * One-pager reports followed onto the Stats page, as nested steps: each step is part of the one
 * before it. A report counts as landed only when the athlete's own visit (never staff) began at or
 * after the report was first opened, and as clicked only when such a visit had a button click.
 * The visits are those of the selected period; the reports are every cohort's.
 */
export function onePagerJourney(reports: OnePagerReportRow[], visits: StatsJourneyVisit[]) {
  const athlete = visits.filter(visit => !visit.staff);
  const followed = reports.map(report => report.openedAt === null ? []
    : athlete.filter(visit => visit.playerId === report.id && visit.landedAt >= report.openedAt!));
  return {
    sent: reports.length,
    opened: reports.filter(report => report.openedAt !== null).length,
    landed: followed.filter(rows => rows.length > 0).length,
    clicked: followed.filter(rows => rows.some(visit => visit.clickedAt !== null)).length,
  };
}

export function shareOf(count: number, total: number): string {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : "—";
}
export const buttonTitle = (key: JourneyButton) => button(key).title;
export const followedLabel = (key: JourneyButton) => button(key).followed;
export const stopLabel = (key: JourneyStop) => JOURNEY_STOPS.find(([stop]) => stop === key)![1];
