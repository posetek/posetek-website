# Admin organization reporting: request audit

Audited November 5, 2026 against the original request and candidate `0b3c5ed`.
The audit is scoped to People & organizations reporting; shared coach reporting
and unrelated runtime candidates remain separate. At audit time this task had
not deployed. Source and synthetic proof do not establish a live athlete's data.

Current source status: Website PR #127 merged as `c1b34a8` and Backend PR #94
merged as `99cd460` after integrated-head qualification at `7a725b4`. Website
hosted CI passed. All seven Backend local lanes passed with documented scope
limits and skips; GitHub billing blocked hosted Backend jobs, and the owner
explicitly authorized a one-release exception. Deployment `6aecbf94751cf215f811865f` is now published with callable version 12.
Use the [release handoff](../releases/ADMIN_REPORTING_REFRESH.md) and
[release receipt](../releases/receipts/ADMIN_REPORTING_REFRESH_PRODUCTION.json)
for authoritative publication and production-verification status. The omissions
below describe the original implementation and remain part of the audit history.

## Full request comparison

| Original request | Result after audit corrections | Qualification |
| --- | --- | --- |
| Coordinate with concurrent website architecture work | Integrated PR #124 filtering/cache/auth fences; separate summary retention added | Larger Backend session/SQL proposal remains separate |
| Remove Compare teams from Overview; same removals in Usage | Removed from those views | Teams browsing retains its comparison |
| Players tested: at least four different recorded drills | Implemented, dated deduplicated saved drill keys, including failed/unqualified results | Standalone diagnostic failures are not saved drills; unknown dates qualify coverage |
| Accounts claimed | Implemented from registered profiles and claim timestamps | Legacy missing claim dates limit historical comparison |
| iOS downloads defined by any observed app time | Implemented as positive retained iOS usage | This is the requested observed-use proxy, not store installation data |
| Repeat users | Implemented with user-approved two distinct active local days | Matching weekly windows; multiple visits/platforms on one date count once |
| Weekly distinct users | Implemented | Monday through selected end; same weekdays last week |
| Estimated platform time | Implemented | Measured web/iOS time, overlap counted once; uncollected use unknown |
| Compact six cards, two rows, prior values and green/red changes | Implemented in Overview and Usage | Partial/unavailable evidence does not support a confident colored change |
| Remove People to follow up with and its explanatory paragraph | Removed from Overview, Usage and Workouts | Existing bookmarked filter URLs remain supported |
| Consolidate video/workout/training activity for ranking | Implemented, also includes planning | Corrected missing planning word in subtitle; saved timers remain separate |
| Resolve suspicious workout generation/completion figures | Source audit and explicit measurement labels implemented | Generation is not measured; completed-as-logged is not all prescribed sets |
| Verify Marco's example | Not independently verified against production records | No real player data was queried; do not claim that number is proven |
| Remove repeated Organizations/organization breadcrumb and CURRENT SELECTION above report tabs | Removed in candidate source | Scope name and count remain; filter dialog retains its own selection heading |
| Remove repeated date/timezone/included/excluded/collection header lines | Removed from report header | Report-observation timestamp and table/report-local dates remain |
| Replace six weekly qualified-performance charts with one drill-selectable chart | Implemented | Old system remains only in shared non-admin reports |
| Plot result versus age with Boys/Girls colors and clustered points | Implemented | Best qualified result per player; current known roster ages/divisions; unknowns explicit |
| Show trend with age | Implemented as connected per-age division means | Cross-sectional age trend, not personal longitudinal progress |
| Remove Testing Players coverage table and pagination | Removed | Testing view has no player table |
| Add average all-station elapsed time, with last week in red | Implemented | Complete timed player-session rotations; capture through final processing including transitions |
| Add weekly players with at least four recorded drills, six top cards total | Implemented | Uses selected-end week; historical windows are labeled rather than called current |
| Simplify station analytics above weekly Testing activity | Implemented | Fixed transferred-team historical omission and station visit wording; bounds can make timing unavailable |
| Remove Work completed section | Removed from admin Workouts | Shared coach/manager reporting remains unchanged |
| Player workouts at very bottom, plots above | Corrected after audit | Measurement disclosure now precedes player section |
| Player app usage at very bottom | Corrected after audit | Measurement disclosure now precedes player section |
| Keep weekly estimated usage chart | Preserved | Same selected-period web/iOS series and overlap explanation |
| Add daily usage chart immediately beneath weekly chart | Implemented with connected points and category lines | Total mode uses one line; daily rows preserve null collection and exclusive allocations |
| 1 week, 2 weeks, 1 month, 2 months | Corrected after audit: full requested window | Additive two-calendar-month history independent of report start; legacy fallback disclosed |
| Toggle consolidated categories versus total per day | Implemented | Training, Results, Social, Profile & overview, Other |
| Keep high-level data while switching tabs | Corrected after audit | Same-cohort summary stays visible during first/expired detail reads and directory refresh; wrong player pages never reused |

## What the initial checks missed

The initial persistence test warmed every tab before observing transitions. It
therefore checked exact-cache reuse, not first visits or returns after expiry.
Held-response reproduction recorded zero visible summary cards on first Usage,
first Testing and expired Usage. New browser cases hold these responses and
assert visible summaries before releasing them. Scope/date/filter/auth and
permission boundaries are checked separately.

The initial layout test asserted only that charts preceded tables. It did not
assert the player section was last. The daily chart test clicked all four range
controls without asserting the returned dates; its screenshot visibly clipped
two months to four weeks. The new assertions check final-section order and every
day in the full two-month interval.

The Backend follow-up adds transferred-team station coverage and actual
usage-reader history tests. Its reporting implementation is
`516229112ffdd925f9be7e76ac2a50eb882c73d9`; later release tooling and integration
were qualified at `7a725b4` before PR #94 merged. The initially missing SDK checks
were subsequently completed with isolated dependencies. See the
[feature handoff](ADMIN_REPORTING_REFRESH.md) for behavior and historical checks,
and the release handoff for current qualification, exact identities and
Backend-first publication order.

## Verification of the corrections

The completed local checks include 2,321 frontend tests, 16 display scenarios,
and 60 real-hook persistence/continuity scenarios across Chromium/WebKit and
390/1,440 CSS-pixel widths. The new cases hold requests to verify summaries are
visible while details remain pending. Layout checks require the player section
as the final visible section and verify all 61 days of the selected two-month
fixture despite its 28-day report period. TypeScript/Astro, marketing, lint,
Svelte, policy and tooling checks passed. These source checks use synthetic fixtures; they do not by themselves certify
production authorization, real athlete values or a deployed artifact. Later
hosted acceptance and exact-artifact verification are recorded separately in the
release handoff and receipt. Earlier incomplete SDK/CI descriptions are
superseded by the current qualification status above, while the original test
coverage gaps remain documented here.
