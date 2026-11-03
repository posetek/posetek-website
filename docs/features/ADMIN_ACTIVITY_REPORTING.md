# Administrator activity and workout reporting

Source candidate, November 3, 2026. This extends the existing administrator
workspace; it is not a production release receipt. The canonical server work
belongs to `posetek/posetek-backend`, in `functions/insights-admin-reporting.js`
and `docs/ADMIN_ACTIVITY_REPORTING.md`.

## Experience

The selected organization and team remain above the tabs, with the reporting
period and roster count. Complete reporting counts take precedence over the
bounded identity directory. Until complete reporting arrives, a known count is
labeled **loaded players**. The virtual unassigned view keeps its loaded count
and qualifies the parent organization's reporting coverage.

| View | Records beneath the summaries |
| --- | --- |
| Overview | Separate recorded-timer and estimated-app-use rankings, four named follow-up groups, team comparisons and people. Summary actions focus the matching list after its new report arrives. |
| Teams | Reporting roster denominators, recorded sign-in, active players, collection coverage, starts/completions, recorded timer and elapsed estimates. Counts and percentages use the same complete filtered cohort. Teams without reporting members remain navigable. |
| Workouts | Searchable and server-sorted players, period starts/completions and durations, exact latest saved workout, outcome and current-week assignments. One expanded player loads five recent distinct sessions; an opened session loads its existing recorded observation. |
| Usage | Estimated engagement, active days, website/iOS collection, and latest retained activity window. Most recently observed activity sorts first. |
| Testing | Existing summaries, charts, qualifications and the detailed player table, with real player-record links and server pagination. |

Ordinary rows become labeled cards on phones. Dense testing evidence retains
horizontal scrolling and chart data tables. Scope, dates, cohort filters, search,
sort, follow-up, page and validated return URLs remain in browser navigation.
First page and Next reflect the existing cursor contract. A new selection clears
the old response; account changes invalidate pending reads. Refresh failure can
retain only an explicitly stale report for the same current context.

## Evidence definitions

- **Recorded sign-in** is current Firebase Auth evidence for a uniquely bound
  player account. It is not online presence, every sign-in in a historical period,
  or the old profile `lastLogin` field. Unclaimed accounts, verified absence of a
  sign-in, and unavailable/ambiguous account evidence remain separate.
- **No recorded sign-in** includes confirmed accounts without sign-in evidence
  and unlinked profiles. Unknown account evidence is excluded. Cross-organization
  staff bindings, duplicate player bindings and ambiguous provider records remain
  unknown.
- **No collected active use** requires known collection and zero active use in
  the selected period. Missing collection is separate. Positive use includes
  returning players; the new admin `active` selection does not change the older
  shared `usageStatus: active` category.
- **App use** is estimated engagement, with simultaneous platforms counted once.
  Its latest retained positive window has 15-minute precision through the report
  cutoff and can precede the selected start. Ingestion timestamps and quiet
  sessions never become a precise logout or stopping time.
- **Workout duration** separates measured timer time, elapsed estimates and
  unavailable evidence. A known zero remains zero. Only positive measured timers
  enter the workout-time ranking.
- **Unfinished assigned workouts** describes the current active plan week in the
  plan's timezone. Unstarted slots and slots with no valid ending remain. Any
  recorded ending retires a slot without implying completion; personal workouts
  do not fulfill assigned slots. Past skipped weeks are not overdue.
- **No completed workouts** concerns the selected reporting period, independently
  of current-week assignments. Early endings and abandoned sessions stay visible.
- **Stopping point** comes from the selected saved log's existing drill, sets and
  observation. Opening history never starts a workout, saves a plan or writes
  new telemetry.

Account, latest-workout and assignment facts are current at `asOfMillis`, even
for historical periods. Existing period/timezone/exclusion/testing rules remain
unchanged. Each view explains these limits under **How this is measured**.

## Compatible contract

Only administrator reporting views send:

```json
{"adminReporting":{"version":1,"followUp":"all","sort":"name"}}
```

The optional additive section includes whole-cohort rankings, team comparisons,
follow-up counts, current evidence time and per-player activity. The server
calculates totals before follow-up, name search and pagination. Ordinary coach,
manager, testing and older-client requests retain their original payloads. No
new endpoint, public tracking, native change, reminder or business-data schema
is introduced.

The client validates the extension's version, effective options, population,
current organization/team, evidence states and time windows. An older backend
may omit it: the interface explicitly reports unavailable detail while retaining
existing period reports. Missing extension data never becomes measured zero.
The existing read-only history and exact-session readers retain their independent
retry and authorization checks. Source main is not the accepted live runtime.

## Verification

`app/scripts/admin-activity-acceptance.mjs` runs the real workspace components and
reporting hooks with invented browser-local transport data. It blocks external
HTTP, sockets and writes. Its receipts distinguish populated, empty, loading,
retry, stale scope/account, keyboard, history, drilldown and responsive results.
Chromium and WebKit exercise 360, 390, 430, 768, 1440 and 1920px; browser emulation
is not physical-phone acceptance. Record destinations are checked as URLs;
separate record tools keep their existing tests.

Backend tests cover complete-roster aggregation, cursor binding, Auth ambiguity,
current assignment rules, duration/outcome sources, retained usage windows,
permissions and mid-read changes. Immutable scoped packaging tests inspect the
runtime dependency closure. Private historical fixture skips must remain
explicit; they are not passing tests.

See [release preparation](../releases/ADMIN_ACTIVITY_REPORTING.md) for the exact
candidate, CI and acceptance status. No fixture or screenshot contains real
player data; generated evidence stays outside Git.
