# Admin organization reporting refresh

Source integrated, November 5, 2026. Website PR #127 merged as `c1b34a8`;
Backend PR #94 merged as `99cd460`, following qualification of integrated head
`7a725b454ee947258a5280f49a42898edff034ac`. The exact application release
`6aecbf94751cf215f811865f` is published with Backend callable version 12;
production acceptance and cleanup are recorded separately below.

The [release handoff](../releases/ADMIN_REPORTING_REFRESH.md) and
[release receipt](../releases/receipts/ADMIN_REPORTING_REFRESH_PRODUCTION.json)
are the authoritative records for exact source, artifact, publication and
production verification. Preparation preserves the published November 5 admin
tab-persistence baseline (`6aec430f45bc0d0841566ba7`).

Website hosted CI passed. Backend hosted CI was blocked by GitHub billing before
jobs ran. The owner explicitly authorized a one-release exception; all seven
Backend lanes passed local qualification with their documented skips and scope
limits. This is local replacement evidence, not a passing hosted Backend check.
The earlier source-only and missing-SDK results below are historical checkpoints;
those SDK failures were subsequently resolved with isolated dependencies.

## Behavior

Overview and Usage share six compact cards: players with at least four different
recorded drills, claimed accounts, observed iOS users under the requested iOS
downloads label, repeat users active on at least two distinct days in the shown
week, weekly distinct users, and estimated platform time.
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

Usage retains its weekly chart and adds a daily chart with connected points and
lines: one line per category, or a single line in Total mode. Controls cover
1 week, 2 weeks, 1 month and 2 months. Calendar-month ranges end at the selected
report end date. A bounded two-calendar-month daily history supplies the complete
range independently of the report start; weekly charts and other period totals
keep their selected window. Older responses without that history disclose clipping. Training combines
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
- Repeat users: the user approved two or more distinct active local days on
  November 5. Each player counts once in each matching weekly window (Monday
  through selected report end, compared with the same weekdays last week).
  Positive website or iOS time qualifies a day; multiple visits or platforms on
  one day still count as one day. The card shows this definition. Missing
  collection and historical coverage retain unavailable/partial states.
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
`adminReporting.dailyUsage` adds only bounded two-month daily evidence and reuses
the existing usage read. Historical station evidence follows current authorized
team membership, including players transferred between teams in one organization.

The concurrent website efficiency work merged as PR #124 (`b876eb1`) and is
integrated into this feature branch. Its current-organization filtering, 60-second
bounded in-memory exact-response reuse, auth/scope invalidation and late-response
fences remain intact. This patch adds the Testing option to that existing
payload/key; it does not create another cache or report-session architecture.
Integration overlaps were MonitorAccounts, workspaceMetrics and
workspaceMetricsData. The audit follow-up adds a separate same-cohort summary
observation so first visits and expired detail reads retain the high-level
report. Exact player pages remain separate. Original observation times remain
visible while details or directory authority refresh; auth/scope/invalidation
and permission/schema failures clear retained evidence. Display snapshots share
the existing memory bounds and never enable directory management actions. The larger backend reader/SQL plan remains separate.

The canonical Backend reporting implementation is
`516229112ffdd925f9be7e76ac2a50eb882c73d9`. Subsequent release tooling and integration
were qualified at `7a725b454ee947258a5280f49a42898edff034ac`, then merged through
Backend PR #94 as `99cd460`. Its `docs/ADMIN_REPORTING_REFRESH.md` records the
additive contract and bounded reads. The release handoff identifies the exact
published callable source and application runtime separately from source main;
use that record for release and rollback provenance.

## Validation and release

The source-validation checkpoint used Node 22.23.3, Python 3.12 and isolated
worktree dependencies. That integrated source passed:

| Check | Result |
| --- | --- |
| Frontend Vitest | 2,321 tests in 209 files |
| Lint | Exit zero; existing warnings retained |
| Tooling / legacy guards | 100 tests |
| Python CI policy | 32 tests |
| Svelte | Zero errors and warnings |
| TypeScript / Astro and marketing builds | Both passed; five document routes |
| Static Firestore transport | Two fixture tests and 124 compiled HTML/JS files |
| Guest routes / marketing activation | 25 checks passed |
| App production dependency audit | Zero advisory-path findings; zero blocking |
| New reporting UI | 16 scenarios: four tabs, two engines, phone/desktop widths |
| Integrated tab persistence | 60 scenarios passed across both engines and widths, including 24 held-response continuity cases |

The display checks cover card counts, removed sections, chart/table order, drill
selection, daily range/mode changes, horizontal overflow, browser errors and
blocked network writes. Screenshots were reviewed at phone and desktop widths.
A final independent Astra integration review found no concrete regression in
report composition, request gating or the retained cache behavior. The persistence
harness now waits for the requested tab selection before checking
readiness and tests restored report content instead of the removed coverage
header. Earlier failed runs are retained separately; no application cache change
was made to satisfy those obsolete/racing assertions.

The initial Backend companion passed 105 affected reporting tests, 101 policy tests,
473 imported-file migration checks, client contract exports, 23 scoped package
tests, 3,977 gateway tests (two skips, ten subtests), and 19 authored replay
profiles. Independent Astra review issues were fixed and re-reviewed. At that initial checkpoint, the broader Functions/tooling suite had 1,454 passes
and five missing-SDK failures; three private-fixture skips and one SDK
package-discovery skip were recorded. The SDK-dependent checks were deferred
rather than marked passed. Later release qualification installed dependencies
in an isolated owned environment and resolved all five failures and the SDK
discovery skip; no shared checkout dependencies were borrowed.

After the November 5 repeat-user definition confirmation, frontend validation
again passed all 2,300 tests, lint, the TypeScript/Astro build and 16 display
scenarios. The browser assertions now verify a populated Repeat users card and
its explicit active-day definition in both Overview and Usage. The Backend
follow-up passed 109 affected reporting tests, including duplicate-day/platform
handling, matching weekly boundaries, missing collection, retention and an
actual synthetic writer-to-reader timezone case. Backend policy (101), migration
(473) and scoped packaging (23 passed, one unchanged SDK skip) also passed;
independent Astra review found no remaining issue. Earlier unaffected validation
results above remain evidence for the unchanged lanes.

Synthetic fixtures block external traffic and writes; all names and records are
invented. Browser evidence is local desktop Chromium and WebKit, not live
Firebase authorization, physical-device or production acceptance. At that source-validation checkpoint, rules/emulator integration, hosted CI and
the protected production preservation/release build had not run, and no
production records, account settings or messages had changed. Later release
qualification supersedes those pending-check statements: all seven Backend
local lanes passed, Website hosted CI passed, and the protected artifact was
prepared and verified. Hosted acceptance and publication status belong in the
release handoff and receipt; this feature document does not claim they are complete.

The release order is separately qualified canonical Backend publication first, then
an exact approved website application artifact and preserved baseline verification.
An older backend produces explicit unavailable additions, not invented zeros.
Source integration retains `[skip netlify]`; do not publish all of source main as
an application release. No rules, indexes, gateway or native release is included.
Rollback uses the then-verified prior application artifact and compatible prior
callable source, with a release receipt. A source merge is not a release.

## Original-request audit and corrections

The initial completion report was too broad. The [item-by-item audit](ADMIN_REPORTING_REQUEST_AUDIT.md)
records both the original implementation and corrections. The source-only
candidate had not been deployed when the discrepancy was raised.

Confirmed omissions corrected after audit:

- First-visit and expired tab requests removed high-level reports; the original
  browser checks warmed every exact request before testing continuity.
- Daily month/two-month controls clipped to the already loaded report period.
- Workouts/Usage tables had a measurement disclosure after them, so they were not
  the final visible sections.
- The workout ranking included planning but omitted it from its visible subtitle.
- Station event prefiltering could exclude an existing player's previous-team
  sessions within the same organization.
- Individual-station samples were labeled rotations instead of visits; historical
  unavailable rotation copy also incorrectly said this week.

No measured workout-generation count or individual production-player forensic
verification is claimed. Saved-log starts/completions and observed platform-use
categories retain their documented meanings. Exact visit counting is superseded
by the approved active-day definition.

Audit-fix validation passed 2,321 frontend tests, 16 display scenarios, and all
60 persistence/continuity scenarios in Chromium and WebKit at phone and desktop
widths. Lint, TypeScript/Astro, marketing, Svelte (zero diagnostics), 32 policy
checks and 100 tooling checks passed. The final Backend changes passed 116
focused tests and 221 broader reporting/usage/station tests (three existing
private-fixture skips), plus 101 policy checks, 473 migration imports, contract
exports and 23 package tests (one existing missing-SDK discovery skip).
Independent review found no blocking issue in the summary isolation or Backend
history/transfer changes. Previous failed test-driver attempts are retained;
the final readiness helper waits for directory/detail revalidation, while the
new continuity assertions inspect the still-pending intermediate state directly.

During the November 5 localhost review, the user requested removal of the
Recording audit and Failure reports sections from admin Testing. Both sections
and their local explanatory disclosures are removed; the underlying reporting
records and shared coach views are unchanged.

Daily usage review refinement: the daily chart uses connected points, one line per category and one point per collected day. Total mode uses a single line. Missing collection stays a gap; the range controls, daily values and accessible data table are unchanged.

The requested workout lifecycle breakdown is a separate follow-up: [Workout reporting funnel handoff](WORKOUT_REPORTING_FUNNEL_HANDOFF.md). Its new ingestion and UI are excluded from this refresh release.

SDK qualification checkpoint, November 5: Backend runtime source `5162291` was
checked with its own isolated Firebase SDK dependencies. The full
Functions/tooling run passed 1,472 tests with three existing private-fixture skips
and zero failures; all 24 packaging checks passed, including SDK discovery. This
resolved the earlier five dependency-related failures and one packaging skip.

Final local Backend qualification covered policy, gateway, processor syntax and
Bodyscan tests on Python 3.12/3.10, Firebase Functions, rules/emulators,
Firebase operations, and dependency audits. The gateway evidence combines the
full baseline suite with focused integration tests for incoming Coach changes
and an authored replay run; it does not claim a second full suite at the merged
revision. Exact revisions, counts, skips, unchanged-source proofs and macOS versus
hosted Ubuntu limits are retained in the release evidence. The explicit
one-release owner exception addresses the billing-blocked hosted Backend gate;
it does not represent a hosted CI pass or remove production verification.
