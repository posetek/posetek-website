# Admin organization reporting refresh

Source candidate, November 5, 2026. No deployment, production-data change or
outreach is included. The published November 4 release remains the baseline.

## Behavior

Overview and Usage share six compact cards: players with at least four different
recorded drills, claimed accounts, observed iOS users under the requested iOS
downloads label, repeat users, weekly distinct users, and estimated platform time.
Prior values are shown beneath current values. Known increases/decreases use
color and directional text; partial coverage never produces a confident trend.
The repeated scope breadcrumb, Current selection label, date/coverage lines,
follow-up panels and Overview team-comparison table are removed. The scope title,
Browse navigation, reporting controls and Teams tab remain.

The workout ranking now groups measured workout, training, video and planner
activity. It is comparable to total estimated platform time. Saved workout timer
seconds stay separate in Workouts. Charts precede the player tables in Workouts
and Usage. Work completed/prescription-block evidence is removed from the admin
Workouts view; shared coach/manager reporting is unchanged.

Testing has one drill-selectable age scatter instead of the weekly performance
charts or player coverage table. Each point is one player's best qualified result
for that drill in the selected period. Boys/Girls use distinct colors; unknown
division remains visible and unknown age is excluded with a count. Trend lines
connect division means at each current roster age; they are not individual
longitudinal improvement. Six cards include weekly four-drill participants and
average complete station rotation time, with previous-week evidence. Compact
station analytics appears immediately before Testing activity by week.

Usage retains its weekly chart and adds a daily stacked/total chart with 1 week,
2 weeks, 1 month and 2 month controls. Calendar-month ranges end at the selected
report end date and visibly clip to available report dates. Training combines
workouts, training, videos and planning; other categories are Results, Social,
Profile & overview, and Other. Missing daily categories are unavailable, never
reconstructed from period totals. The exact-day data table preserves nulls.

## Metric definitions and limitations

- Tested players: four distinct supported drill keys from dated, deduplicated
  saved recordings, including failed/unqualified recordings. A standalone
  diagnostic failure report does not prove a saved drill. Cumulative counts use
  each cutoff; the Testing weekly card uses that week's recordings.
- Claimed accounts: current registered profiles and recorded claim timestamps.
  Missing legacy timestamps limit historical comparison. Sign-in time is not
  substituted for a claim date.
- iOS downloads: users with positive retained iOS activity, not App Store installs.
  Historical telemetry retention and collection coverage are explicit.
- Repeat users: the requested distinct-visit definition is not recoverable from
  retained daily summaries. The card stays unavailable rather than silently using
  the old two-active-days definition. A product decision on that substitute is
  pending; exact visits require a defined visit lifecycle and new telemetry.
- Weekly users and platform minutes: Monday through selected report end compared
  with the same weekdays one week earlier. The current day may still be
  accumulating; this is not an equal-elapsed-hours comparison. A player counts
  once per window; overlapping web/iOS time counts once.
- Completed workouts: distinct deduplicated saved logs ended as completed. This
  does not establish every prescribed set was done. Starts and completions use
  their respective dates. Current plans do not establish generation count;
  generated workouts remain unmeasured by this report.
- Rotation time: first capture through final result across every required station
  for a completed player-session rotation, including processing and time between
  stations. Bounds, incomplete timing and stale evidence yield unavailable timing.
  This does not claim stopwatch-only physical testing time.

No individual production player's records were queried in this task. The old
Marco/timer example motivated the distinction in measurements; source tests and
synthetic browser evidence do not verify that player's live records.

## Backend and architecture coordination

Canonical Backend owns all aggregation. The companion feature adds optional
`adminReporting.metricsV2`, admin-only daily `featureMinutes`, and opt-in
`adminTesting` through `includeTestingAnalytics: true`. Only the Testing view
requests the bounded station reader. No browser joins paginated rows into totals.
Old coach/manager and installed-native contracts are preserved.

The concurrent website efficiency work merged as PR #124 (`b876eb1`) and is
integrated into this feature branch. Its current-organization filtering, 60-second
bounded in-memory exact-response reuse, auth/scope invalidation and late-response
fences remain intact. This patch adds the Testing option to that existing
payload/key; it does not create another cache or report-session architecture.
Integration overlaps were MonitorAccounts, workspaceMetrics and
workspaceMetricsData. The larger backend reader/SQL plan remains separate.

The canonical Backend companion is branch `feat/admin-reporting-refresh`,
implementation `eb74046473503edd4366338f9d4940f8afe949a8`, with validation receipt
`5fc55bd25c606d5a8c9bb04c84c48e08a47feb3e`. Its
`docs/ADMIN_REPORTING_REFRESH.md` records the additive contract, bounded reads,
independent Astra review and pending SDK checks. The website Backend pin is not
changed by this candidate; any future integration pin must identify the reviewed
merged Backend source.

## Validation and release

Local website validation used Node 22.23.3, Python 3.12 and isolated worktree
dependencies. The integrated source passed:

| Check | Result |
| --- | --- |
| Frontend Vitest | 2,300 tests in 209 files |
| Lint | Exit zero; existing warnings retained |
| Tooling / legacy guards | 100 tests |
| Python CI policy | 32 tests |
| Svelte | Zero errors and warnings |
| TypeScript / Astro and marketing builds | Both passed; five document routes |
| Static Firestore transport | Two fixture tests and 124 compiled HTML/JS files |
| Guest routes / marketing activation | 25 checks passed |
| App production dependency audit | Zero advisory-path findings; zero blocking |
| New reporting UI | 16 scenarios: four tabs, two engines, phone/desktop widths |
| Integrated tab persistence | 36 scenarios passed across both engines and widths |

The display checks cover card counts, removed sections, chart/table order, drill
selection, daily range/mode changes, horizontal overflow, browser errors and
blocked network writes. Screenshots were reviewed at phone and desktop widths.
A final independent Astra integration review found no concrete regression in
report composition, request gating or the retained cache behavior. The persistence
harness now waits for the requested tab selection before checking
readiness and tests restored report content instead of the removed coverage
header. Earlier failed runs are retained separately; no application cache change
was made to satisfy those obsolete/racing assertions.

The Backend companion passed 105 affected reporting tests, 101 policy tests,
473 imported-file migration checks, client contract exports, 23 scoped package
tests, 3,977 gateway tests (two skips, ten subtests), and 19 authored replay
profiles. Independent Astra review issues were fixed and re-reviewed. Its broader
Functions/tooling suite had 1,454 passes and five missing-SDK failures; three
private-fixture skips and one SDK package-discovery skip remain. The exact
SDK-dependent checks are registered in the deferred-validation queue. Missing
`firebase-admin` / `firebase-functions` dependencies were not installed or borrowed
from another checkout. These checks remain pending, not passed.

Synthetic fixtures block external traffic and writes; all names and records are
invented. Browser evidence is local desktop Chromium and WebKit, not live
Firebase authorization, physical-device or production acceptance. Rules/emulator
integration, hosted CI and the protected production preservation/release build
were not run. No production records, account settings or messages were changed.

Release requires separately qualified canonical Backend publication first, then
an exact approved website application artifact and preserved baseline verification.
An older backend produces explicit unavailable additions, not invented zeros.
Source integration retains `[skip netlify]`; do not publish all of source main as
an application release. No rules, indexes, gateway or native release is included.
Rollback uses the then-verified prior application artifact and compatible prior
callable source, with a release receipt. A source merge is not a release.
