import { describe, expect, it } from "vitest";
import { followedThrough, inTeamScope, journeyFunnel, journeyNextStops, journeyPlayers, journeyTime, journeyVisits, median, nextStop, onePagerJourney, shareOf, STILL_OPEN_MS } from "./statsJourney";
import type { StatsJourneyData, StatsJourneyVisit } from "./statsJourney";

const END = Date.UTC(2026, 10, 13, 20), MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const visit = (playerId: string, landedAt: number, values: Partial<StatsJourneyVisit> = {}): StatsJourneyVisit => ({
  playerId, teamId: null, staff: false, platform: "web", from: "open", landedAt, viewSeconds: 0, reachedAt: null,
  button: null, clickedAt: null, to: null, via: null, leftAt: null, coachAt: null, planAt: null, workoutAt: null, ...values,
});
const clickedAt = (at: number) => at + MINUTE;
// The same synthetic visits the admin fixture serves (see app/scripts/admin-lightning-fixture.mjs).
const A1 = END - 3 * DAY, A2 = END - DAY, B1 = END - 2 * DAY, D1 = END - 20 * DAY, E1 = END - 6 * HOUR;
const visits: StatsJourneyVisit[] = [
  visit("c", END - 10 * MINUTE, { teamId: "summit", from: "coach", viewSeconds: 5 }),
  visit("e", E1, { from: "workouts", viewSeconds: 60, reachedAt: E1 + MINUTE, to: "other", via: "other", leftAt: E1 + 2 * MINUTE, coachAt: E1 + 3 * MINUTE }),
  visit("a", A2, { teamId: "harbor", from: "home", viewSeconds: 20, to: "home", via: "tabs", leftAt: A2 + MINUTE }),
  visit("b", B1 + HOUR, { teamId: "harbor", staff: true, viewSeconds: 300, reachedAt: B1 + HOUR, button: "plan", clickedAt: clickedAt(B1 + HOUR), to: "plan", via: "button", leftAt: clickedAt(B1 + HOUR), planAt: B1 + 2 * HOUR }),
  visit("b", B1, { teamId: "harbor", viewSeconds: 40, reachedAt: B1, button: "workout", clickedAt: clickedAt(B1), to: "workouts", via: "button", leftAt: clickedAt(B1) }),
  visit("a", A1, { teamId: "harbor", viewSeconds: 95, reachedAt: A1, button: "coach", clickedAt: clickedAt(A1), to: "coach", via: "button", leftAt: clickedAt(A1), coachAt: A1 + 2 * MINUTE }),
  visit("f", END - 4 * DAY, { teamId: "summit", staff: true, viewSeconds: 30, to: "coach", via: "tabs", leftAt: END - 4 * DAY + MINUTE }),
  visit("c", END - 5 * DAY, { teamId: "summit", viewSeconds: 10 }),
  visit("d", D1, { teamId: "summit", viewSeconds: 200, reachedAt: D1, button: "plan", clickedAt: clickedAt(D1), to: "plan", via: "button", leftAt: clickedAt(D1), planAt: D1 + 5 * MINUTE }),
];
const data: StatsJourneyData = { startAt: END - 30 * DAY, endAt: END, complete: true, visits, players: {} };
const all = { teamIds: ["harbor", "summit"] };
const athletes = journeyVisits(data, { includeStaff: false, team: all });
const everyone = journeyVisits(data, { includeStaff: true, team: all });

describe("Stats page journey report", () => {
  it("leaves staff visits out unless asked, and keeps to the selected team", () => {
    expect(athletes).toHaveLength(7);
    expect(everyone).toHaveLength(9);
    expect(journeyVisits(data, { includeStaff: false, team: { ...all, teamId: "harbor" } }).map(row => row.playerId)).toEqual(["a", "b", "a"]);
    expect(journeyVisits(data, { includeStaff: true, team: { ...all, unassigned: true } }).map(row => row.playerId)).toEqual(["e"]);
    expect(inTeamScope("retired-team", { ...all, unassigned: true })).toBe(true);
    expect(inTeamScope("harbor", { ...all, unassigned: true })).toBe(false);
  });

  it("counts players through the funnel, once per step and under each button they used", () => {
    expect(journeyFunnel(athletes)).toEqual({ landed: 5, reached: 4, clicked: 3, clickedBy: { coach: 1, plan: 1, workout: 1 }, followed: 2, followedBy: { coach: 1, plan: 1, workout: 0 } });
    expect(journeyFunnel(everyone)).toEqual({ landed: 6, reached: 4, clicked: 3, clickedBy: { coach: 1, plan: 2, workout: 1 }, followed: 3, followedBy: { coach: 1, plan: 2, workout: 0 } });
  });

  it("follows a click through only with that button's own outcome, at or after the click", () => {
    const at = END - DAY;
    expect(followedThrough(visit("x", at, { button: "coach", clickedAt: at, coachAt: at }))).toBe("coach");
    expect(followedThrough(visit("x", at, { button: "coach", clickedAt: at, coachAt: at - 1 }))).toBeNull();
    expect(followedThrough(visit("x", at, { button: "coach", clickedAt: at, planAt: at + 1 }))).toBeNull();
    // An outcome without a click is not a follow-through.
    expect(followedThrough(visit("x", at, { coachAt: at }))).toBeNull();
  });

  it("uses the median visible time per visit, split by whether a button was clicked", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(journeyTime(athletes)).toEqual({ all: { visits: 7, median: 40 }, clicked: { visits: 3, median: 95 }, other: { visits: 4, median: 15 } });
    expect(journeyTime(everyone).clicked).toEqual({ visits: 4, median: 147.5 });
  });

  it("finds each visit's next stop, and calls a quiet visit left only after 30 minutes", () => {
    expect(nextStop(visit("x", END - STILL_OPEN_MS), END)).toBeNull();
    expect(nextStop(visit("x", END - STILL_OPEN_MS - 1), END)).toBe("left");
    expect(nextStop(visit("x", END - MINUTE, { to: "home" }), END)).toBe("home");
    const stops = journeyNextStops(athletes, END);
    expect(stops.finished).toBe(6);
    expect(stops.open).toBe(1);
    expect(stops.rows.map(row => [row.label, row.visits, row.byButton, row.byTabs])).toEqual([
      ["Coach", 1, 1, 0], ["Workouts", 1, 1, 0], ["Home", 1, 0, 1], ["Plan", 1, 1, 0], ["Other page", 1, 0, 0], ["Left the site", 1, 0, 0],
    ]);
    expect(journeyNextStops(everyone, END).rows.map(row => row.visits)).toEqual([2, 1, 1, 2, 1, 1]);
  });

  it("lists each player once, most recent visit first", () => {
    const rows = journeyPlayers(everyone, END);
    expect(rows.map(row => row.playerId)).toEqual(["c", "e", "a", "b", "f", "d"]);
    expect(rows[0]).toEqual({ playerId: "c", teamId: "summit", visits: 2, staffVisits: 0, firstAt: END - 5 * DAY, lastAt: END - 10 * MINUTE,
      viewSeconds: 15, reached: false, clicked: [], next: "left", followed: [] });
    expect(rows[2]).toMatchObject({ playerId: "a", visits: 2, viewSeconds: 115, reached: true, clicked: ["coach"], next: "home", followed: ["coach"] });
    expect(rows[3]).toMatchObject({ playerId: "b", visits: 2, staffVisits: 1, clicked: ["plan", "workout"], next: "plan", followed: ["plan"] });
    // A coach message without a click is not a follow-through.
    expect(rows[1]).toMatchObject({ playerId: "e", teamId: null, clicked: [], next: "other", followed: [] });
  });

  it("follows one-pager reports onto the Stats page as nested steps, with the athlete's own visits after the report was opened", () => {
    const reports = [
      { id: "a", openedAt: END - 9 * DAY },
      { id: "b", openedAt: END - 9 * DAY },
      { id: "f", openedAt: END - 9 * DAY },   // opened, but only staff looked at f's page
      { id: "c", openedAt: null },            // c visited Stats without ever opening the report
      { id: "g", openedAt: null },
    ];
    expect(onePagerJourney(reports, everyone)).toEqual({ sent: 5, opened: 3, landed: 2, clicked: 2 });
    // Without b's own visit, a staff click on b's page does not count for b.
    expect(onePagerJourney(reports, everyone.filter(row => !(row.playerId === "b" && !row.staff)))).toEqual({ sent: 5, opened: 3, landed: 1, clicked: 1 });
    // A visit before the report was opened is not a landing from it: d visited 20 days ago and opened yesterday.
    expect(onePagerJourney([{ id: "d", openedAt: END - DAY }], everyone)).toEqual({ sent: 1, opened: 1, landed: 0, clicked: 0 });
    // a clicked three days ago and opened the report two days ago: the later visit lands, the earlier click does not count.
    expect(onePagerJourney([{ id: "a", openedAt: END - 2 * DAY }], everyone)).toEqual({ sent: 1, opened: 1, landed: 1, clicked: 0 });
    // A visit in the same instant as the open counts.
    expect(onePagerJourney([{ id: "a", openedAt: A1 }], everyone)).toEqual({ sent: 1, opened: 1, landed: 1, clicked: 1 });
  });

  it("shows a share of a total, and none of nothing", () => {
    expect(shareOf(1, 6)).toBe("17%");
    expect(shareOf(0, 5)).toBe("0%");
    expect(shareOf(0, 0)).toBe("—");
  });
});
