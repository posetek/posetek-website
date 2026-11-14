# Stats page journey

The signed-in Stats page (the page a player lands on) records what visitors do there, and
the admin **Journey** tab reads it. Numbers only: no session recording, no page addresses,
no typed text and no third-party analytics. Records live in our own backend.

## What is recorded

One record per **visit**: one continuous showing of the Stats main page for a real athlete
workspace. Anything else shown ends the visit (another tab, the plan screen under Stats, a
test's attempts page, account settings, leaving the workspace). Coming back starts a new
visit. The browser sends these events to the `recordStatsJourney` callable, and the server
stamps every time:

| Event | Sent when |
| --- | --- |
| `landed` | The visit starts, with where the visitor came from: `open` when Stats is the first workspace page shown in this page session (a sign-in, a link, a reload), otherwise `home`, `coach`, `workouts`, `plan` or `other` |
| `viewing` | Every 15 s of counted time. The whole seconds counted since the last beat (1 s or more) also go at once when the page is hidden or closed (`pagehide`), when counting stops on an idle page, and just before `left`; a second is never sent twice, and a fraction waits for the next beat. Time counts only while the document is visible, the Stats main page is shown and the visitor touched the page (pointer, key, scroll, touch) in the last 2 minutes |
| `reached` | Once per visit, when at least half of the three next-step buttons' section is in the viewport |
| `clicked` | A next-step button is pressed (`coach`, `plan`, `workout`), before navigating |
| `left` | Where the visit went (`home`, `coach`, `workouts`, `plan`, `other`) and how: `button` (a next-step button), `tabs` (the tab bar) or `other` (any other link, Back, account settings). A test's attempts page counts as `other`. A closed page sends nothing |
| `outcome` | Follow-through, once the request really went out: `coach` when the coach takes a Coach-tab message past its checks and starts answering (a send refused for AI sharing or the daily allowance does not count; the resend after sharing is turned on does), `plan` when a plan request has been created (a refused submit does not count), `workout` when a guided workout's screen opens. It is credited to the latest visit of the same athlete in this page session if that visit began less than 2 hours ago, each kind once per visit, whether or not a button led there |

Rules the browser follows:

- Nothing is recorded in the sample preview, on share links, on "view as" links, or without
  a player. Staff opening an athlete's workspace ("Player view") are recorded; the server
  marks those visits as staff.
- One sequential queue sends the events, so a visit's `landed` is answered before its other
  events. Sending is best effort: errors are ignored, there are no retries and nothing is
  stored in the browser. Navigation and rendering never wait for it.
- A visit whose `landed` is not accepted, for any reason (including `no-organization`), or
  fails, is dead: nothing more is sent for it and no follow-through is credited to it. A
  `late` refusal ends a visit the same way.
- `accepted: false, reason: 'disabled'` on any event stops recording for the rest of the
  page session.
- 30 minutes without counted time (hidden, or visible but idle) ends a visit with nothing
  more sent (its last seconds already went when it was hidden or went idle); the report
  reads it as having left the site. The visitor's next activity on the
  page (an interaction, or the page becoming visible again) starts a new visit from `open`.
- A sign-out, or another account signing in, drops the open visit with nothing more sent
  (the server would refuse it); the report reads it as having left the site. The next
  account's first landing is `open`. No request is made while signed out.

Known limits of the numbers:

- The last seconds of a visit are best effort. They are sent when the page is hidden, but a
  page that is closing can cancel that request, and a sign-out sends nothing. Such a visit
  can read up to 14 seconds short.
- The server never credits a beat with more than its own clock allows since the visit began
  or since the last beat. When the landing request is slow (a cold start), the first beat is
  trimmed by that delay, so time on the page leans slightly low, never high.
- A browser tab counts its own visits: Stats open in two tabs is two visits.
- Every landing names the build `web-insights-v2`, the usage tracker's label; the server
  accepts only `^[a-z0-9.-]{1,32}$`.

Code: `app/src/pages/athlete-portal/player/stats/stats-journey.ts` (the tracker),
`use-stats-journey.ts` (the browser wiring). Follow-through hooks: `CoachChat` (the first
reply frame after `start` of a Coach-tab send; refusals arrive as errors and never reach it),
`ProgramIntake` (after the plan job is created) and `PlayerWorkout` (a guided workout begins).

## The admin Journey tab

People & organizations → an organization → **Journey**, last in the reporting tab row. It
appears for every selected organization (its teams level, All teams, one team or
unassigned) and never at the all-organizations level; `directoryPane=journey` deep-links it.
It reads `getStatsJourney` (PoseTek admins only) for the last 7, 30 (default) or 90 days.
Staff visits are left out unless **Include staff** is on; with one team selected, only that
team's visits count. Counting lives in `app/src/pages/admin/lib/statsJourney.ts`.

- **Funnel** (players): landed on Stats, reached the buttons, clicked a button (by button)
  and followed through: clicked a button and that button's outcome came at or after the
  click in the same visit. Each step after the first shows its share of the players who
  landed ("50% of landed").
- **Time on Stats** (visits): the median visible time per visit, overall and for visits with
  and without a button click. The median, because a few long visits would distort a mean.
- **Next stop** (visits): where each finished visit went, with how many came by a next-step
  button and by the tab bar. A visit with no `left` that began more than 30 minutes before
  the report is "Left the site"; younger ones are still open and left out (a note says how
  many).
- **Players**: one row per player, most recent visit first.
- **From the one-pager**, only for an organization with one-pager cohorts: reports sent,
  opened, with an account, whose player landed on Stats (an athlete visit, never staff) and
  clicked a button.

When more than 5,000 visits fall in the period, only the newest 5,000 are counted and the tab
says so.

## Retention and release

Visit records expire after 90 days. The backend functions (`recordStatsJourney`,
`getStatsJourney`) must be released before the website: an older backend leaves the page's
calls failing quietly and the tab showing its error state.
