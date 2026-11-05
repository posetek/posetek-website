# Admin directory and reporting loading review

Reviewed November 4, 2026. Source candidate only; no publication or database mutation.

## Requested directory behavior

People & organizations offers only numeric `schemaVersion: 2` organizations.
The directory requests that predicate in Firestore, before downloading documents,
and filters its selectable rows defensively. An old URL naming a legacy
organization shows the existing unavailable-organization message and does not
mount its roster or management view. The same query shape already exists in
Backend's `getClubContext`.

Other tools that deliberately support legacy organization workflows retain the
unfiltered `loadOrganizations()` default. No organization, player or membership
is deleted or migrated. The legacy directory reader remains available to older
embedded consumers. This is a small directory-read reduction; it does not fix
the reporting fan-out described below.

## Evidence boundary

Website base: `65c77315fe786cab968ea23b2e0dba4d4ad3b6a7`.
Backend checkout inspected: `bbe7cb4065c3d59c2bb91f210cd603a3ebbe77b7`.
The four reporting modules (`insights-v2.js`, `insights-v2-projection.js`,
`insight-usage.js`, `insights-admin-reporting.js`) have no Git differences from
released feature source `96a38e63550c2eb785a27a5bcc762ed96091dcc7`.
The [release handoff](../releases/ADMIN_LAST_OBSERVED_FEATURE.md) records the
exact v11 source/archive and approved website runtime `6d105a7`.

This review used source, existing release receipts and current GitHub PR metadata.
It did not query real athletes, reproduce live browser traffic, inspect current
billing, or measure a new production latency distribution. Static read estimates
are not billed-read measurements.

The [November 3 acceptance](../releases/ADMIN_ACTIVITY_REPORTING.md) already
recorded a 26-player synthetic report at 8.784 seconds initially, 6.807 seconds
warm median and 10.513 seconds warm maximum. A post-correction refresh/read took
14.636 seconds. Those historical fixtures do not establish current real-roster
performance. The November 4 Backend receipt records roughly 3.55–3.86 seconds for
its small scoped feature-evidence checks.

## Current request path

1. Directory choices download organization documents. This patch restricts that
   query to the current format.
2. Selecting an organization calls `getClubContext`, which reads its teams,
   players, staff and invitations. `loadClubAccountData` then separately downloads
   that organization's player profiles (bounded at 2,000) to build the directory.
   Thus the context and browser overlap on player reads; the report then loads
   its own roster. Team selection still begins with the organization roster.
3. `PlayerReporting` enables `useWorkspaceMetrics` in list mode as well as report
   mode. Organization Teams mode requests the detailed admin extension. A request
   uses `pageSize: 20`; visible player IDs select returned row metrics, not a
   reduced backend cohort.
4. `getClubInsightsV2` reads all organization choices, discards legacy choices in
   memory, and loads teams for all current choices, even for a scoped report.
   It loads the whole selected roster, then processes players four at a time.
5. Each included player loads reporting inclusion, projected testing/workout
   history, usage and training evidence. `loadInsightPlayer` fetches every
   `insightSummaryDays` page in the manifest, before period filtering.
6. Admin activity requests read all training plans, all assigned workout logs
   and all personal workout logs for every included player. The bounds (100
   plans, 10,000 combined logs) prevent unlimited work but do not make it cheap.
   Latest-workout and current-week evidence are computed from those histories.
7. Admin latest-activity lookup scans retained daily usage from up to 24 months
   before the cutoff, with a 734-document bound, even for a short reporting
   period. Its query has a lower bound and limit; the upper-date cutoff is
   applied after retrieval. The v11 short-lived feature detail is better scoped:
   only the displayed page's authorized players request it.
8. Account sign-in evidence reads canonical bindings and batched Firebase Auth
   metadata. A final read-only transaction repeats organization/team directory,
   roster, profile/inclusion/revision, training-history and identity-binding reads
   to reject transfers, exclusions, rebinding and concurrent changes.
9. Only after that work does the server apply cohort filters, name search, sort
   and `slice(offset, offset + pageSize)`. Every next-page/search/sort request
   starts the report again. Correct whole-cohort totals explain some of this
   work; the 20-row response is not database pagination.

Relevant source: website `app/src/pages/admin/lib/{accounts,adminDirectory,
workspaceMetrics,workspaceMetricsData}.ts`, `views/MonitorAccounts.tsx`; Backend
[`insights-v2.js`](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insights-v2.js),
[`insights-v2-projection.js`](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insights-v2-projection.js),
[`insight-usage.js`](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insight-usage.js),
[`insights-admin-reporting.js`](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insights-admin-reporting.js).

### Read amplification and writes

Ignoring directory, account bindings, empty-query minimums, index-entry reads,
feature detail, retries and rebuilds, a warm included-player path requests roughly
`10 + H + U + 2(P + W + L)` document reads: H projected history pages, U usage
pages, P plans, W assigned logs, L personal logs. The fixed term covers roster,
profile, inclusion and projection metadata reads in both passes. This is a
source-derived model, not a bill. For example, 100 included players with 100
workout logs each would request about 20,000 log documents alone per admin
report request, assuming both validation passes complete.

The browser transport deduplicates concurrent identical requests but retains no
cross-request report cache. Returning to a previous key can repeat the work.
Focus/visibility return can refresh after 60 seconds; this hook does not enable
continuous interval polling. Activity search is submitted explicitly, rather
than fetching on every typed character. Retryable report failures can make up
to five attempts; a failed page is therefore potentially more expensive.

The report's final transaction is read-only, but `loadInsightPlayer` can rebuild
missing, dirty, outdated-version, or older-than-24-hour projections. Rebuilding
reads source histories/evidence, writes summary pages/current revision and
lease state, and cleans obsolete pages. Up to 25 players may rebuild in a
request, with continuation through retries. Opening reporting can therefore
cause projection writes without changing any athlete's business records.
Background projection triggers also exist. Project-wide read/write totals can
include unrelated jobs and cannot be attributed to this screen from totals alone.

## Recommended changes, in order

1. **Measure each stage.** Add non-identifying timings/counters for directory,
   roster, projection hits/rebuilds, history documents, usage documents, Auth
   batches, validation, retries and response size. Compare cold/warm first load,
   next page, sort/search, tab return and roster sizes. Use
   [Firestore Query Explain](https://firebase.google.com/docs/firestore/query-explain)
   for costly query/index analysis; its analyze mode executes the query and
   exposes execution/billing statistics. No such live analysis ran here.
2. **Remove redundant directory work.** Separate the lightweight scope descriptor
   from roster/staff/invitation management payloads. Query the selected team
   directly and paginate its identity rows; preserve current canonical ownership.
   Constrain reporting directory queries to schema version 2 and the requested
   scope. Keep any required global selector on a separate bounded read.
3. **Serve compact reporting summaries.** Maintain latest workout, active-plan
   current-week state, latest retained activity window, and per-player/per-day
   totals as projections. Read selected date ranges plus the small cumulative
   testing evidence required by the existing comparison rules. Load full session
   detail only when expanded. Avoid scanning both complete log collections for
   every player and rereading them just to compare fingerprints. Simple stored
   counters may use Firestore count/sum/average; complex derived predicates need
   explicit projections or SQL. See [aggregation guidance](https://firebase.google.com/docs/firestore/solutions/aggregation).
4. **Separate totals from pages.** Build a versioned, short-lived report snapshot
   for the complete filtered cohort, then page/search/sort that snapshot or an
   indexed reporting table. Cache by actor, scope, period/timezone, filters,
   reporting version and data revision. Revalidate current access, inclusion,
   deletion and relevant revisions before serving. Never replace full-roster
   totals with totals from the first 20 people or use cached membership as access.
   Preserve observed-at/freshness labels and existing unknown-versus-zero states.
5. **Keep rebuild work off the interactive path.** Extend the existing background
   projection lifecycle to refresh bounded dirty units and reconcile gaps.
   Surface explicit building/stale/unavailable states when needed. This trades
   controlled update-time work for cheaper reads; measure total write amplification
   and handle idempotency, corrections, transfers, deletion and missed events.
6. **Make SQL reporting adoption a separate migration deliverable.** Preserve the
   callable response/authorization contract while moving cohort joins,
   aggregations and indexed pagination to verified SQL projections. Specify sync
   lag, deletion/revocation handling, parity fixtures and rollback before switching.
   Firebase Auth sign-in evidence is not supplied by copying Firestore alone.

Merely raising concurrency can shorten latency while keeping the same read bill
and increasing load. It should follow read-volume reduction and measurements.

## Pull request overlap

| PR | Observed status | Relevance |
| --- | --- | --- |
| [Backend #75](https://github.com/posetek/posetek-backend/pull/75) | Open, docs only; head `240090d` | Firestore → Cloud SQL replica design/tickets. Explicitly excludes existing web, Functions and gateway read/write-path changes. S-20 and N-20 prepare analytics/insight views, but do not connect this screen. Replica completion alone will not remove these Firestore reads. |
| [Backend #76](https://github.com/posetek/posetek-backend/pull/76) | Open; head `f7b41f6` | D-01 metadata inventory script, not a reporting optimization. PR says it has not run against a real project. |
| [Website #114](https://github.com/posetek/posetek-website/pull/114) + [Backend #79](https://github.com/posetek/posetek-backend/pull/79) | Merged; released November 3 | Current activity/workout/assignment reporting and complete-cohort evidence; introduced the admin history/account work described above. |
| [Website #122](https://github.com/posetek/posetek-website/pull/122) + [Backend #85](https://github.com/posetek/posetek-backend/pull/85) | Merged; released November 4 | Last-observed-feature display; limits new short-lived detail reads to displayed players, but retains the existing whole-roster base report. |
| [Backend #77](https://github.com/posetek/posetek-backend/pull/77) | Merged | Reduces repeated issue-tracker background reads/writes. Relevant to project-wide costs, not this reporting request path. Its PR is source evidence, not deployment proof. |
| [Website #113](https://github.com/posetek/posetek-website/pull/113) | Open draft | Firebase Hosting diagnostic preview, unrelated to database-query optimization. |

No open PR found in the inspected website/backend listings implements the
summary-backed pagination or report-path replacement recommended here.

## Validation and delivery

- Passed: changed TypeScript/TSX syntax (6 files), scoped lint (three existing
  Fast Refresh export warnings), policy tests (32), source-tooling tests (100),
  static transport checker fixtures (2), dependency audit (zero findings/blockers),
  and `git diff --check`.
- The initial source-tooling run passed 96/100; four loopback-server cases failed
  with sandbox `listen EPERM 127.0.0.1`. The same suite passed 100/100 with normal
  loopback execution permission. No application change was needed.
- Added regression coverage for current-format queries, sorting, read errors,
  legacy-compatible callers, directory query options, hidden legacy choices and
  stale legacy links. These frontend tests have not run in this source-only lane.
- Pending: frontend Vitest (focused then full), full lint, TypeScript/build,
  Svelte check, marketing build, compiled static-transport check, guest/browser
  checks and focused authenticated directory acceptance. Another session owns
  the primary checkout; its application build/test lane was not used.
- The compiled static-transport command was attempted and failed with
  `ERR_MODULE_NOT_FOUND: Cannot find package 'astro'` in the isolated worktree.
  It has no installed app dependencies or newly compiled artifact. No dependency
  installation was performed. Node was 22.19.0; hosted CI pins 22.23.3.
- No Backend source change, rules/index change, production query, database write,
  push, PR creation, merge or deployment is included. Source integration and
  publication remain separate. A future release must compose this scoped patch
  onto the then-approved runtime and preserve the protected baseline.
