import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompactFollowUp } from "./CompactFollowUp";
import type { SharedTeam } from "./reportData";

type Activity = SharedTeam["athletes"][number]["activity"];

function renderRoster(activities: Activity[], signedInReport = false) {
  const team: SharedTeam = {
    team: "Example JV — Example Coach", club: "Example School", asOf: "2026-11-25",
    athletes: activities.map((activity, i) => ({
      name: `Athlete ${i + 1}`, workouts: 8, testingAttempts: 6, followUp: true, activity,
    })),
  };
  return renderToStaticMarkup(<CompactFollowUp team={team} index={1} reminder={signedInReport ? <p>Remind parents</p> : undefined}/>);
}

const signedIn = { signedIn: true, firstWorkoutCompleted: true };

describe("compact athlete follow-up", () => {
  it("shows only sign-in and the actual workout timer beside each player", () => {
    const html = renderRoster([
      { ...signedIn, timerMinutes: 12.5, timerRecords: 2 },
      { ...signedIn, timerMinutes: 0, timerRecords: 1 },
      { signedIn: false, firstWorkoutCompleted: false, timerMinutes: 0, timerRecords: 0 },
      { ...signedIn, timerMinutes: 0.03, timerRecords: 1 },
      undefined,
      { ...signedIn, timerMinutes: 8 },
      { ...signedIn, timerRecords: 1, timerMinutes: null },
    ]);
    const rows = [...html.matchAll(/<tr class="cr-activity-row">([\s\S]*?)<\/tr>/g)]
      .map(match => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    expect(rows).toEqual([
      "Athlete 1 Yes 12.5 min",
      "Athlete 2 Yes 0 min",
      "Athlete 3 Not yet No timer recorded",
      "Athlete 4 Yes &lt;0.1 min",
      "Athlete 5 Unconfirmed Unconfirmed",
      "Athlete 6 Yes Unconfirmed",
      "Athlete 7 Yes Unconfirmed",
    ]);
    expect(html.match(/<th scope="col">[^<]+<\/th>/g)).toHaveLength(3);
    expect(html).toContain(">Workout timer</th>");
    expect(html).not.toContain("First workout");
  });

  it("shows verified completions separately from timer minutes in the signed-in report", () => {
    const html = renderRoster([{ ...signedIn, timerMinutes: 12, timerRecords: 2 }, undefined], true);
    expect(html).toContain(">Workouts completed</th>");
    expect(html).toContain("<td>8</td><td>12 min</td>");
    expect(html).toContain("<td>Unconfirmed</td><td>Unconfirmed</td>");
    expect(html).not.toContain("Try a team message");
  });

  it("labels the focusable roster by team and opens the simulated messaging disclosure by default", () => {
    const html = renderRoster([signedIn]);
    expect(html).toMatch(/<div class="cr-activity-scroll" role="region" aria-label="Example JV follow-up roster" tabindex="0">/i);
    expect(html).toContain("All time · As of 2026-11-25");
    expect(html).toContain('<details class="cr-message-demo" open=""><summary>Try a team message');
    expect(html).toContain("Demo messages stay in this tab.");
    expect(html).toContain('id="cv-followup-review-1"');
  });

  it("reports an empty roster without offering a message", () => {
    const html = renderRoster([]);
    expect(html).toContain("No players on this roster.");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<details");
  });
});
