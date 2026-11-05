# Admin directory and reporting loading review

Reviewed November 4, 2026; client persistence published November 5.
Deployment `6aec430f45bc0d0841566ba7` was published at
`2026-11-05T09:00:17.782Z` with runtime `6ea75c7`. Source
[PR #124](https://github.com/posetek/posetek-website/pull/124) and
[PR #125](https://github.com/posetek/posetek-website/pull/125) are merged.
[Release handoff](../releases/ADMIN_TAB_PERSISTENCE.md) ·
[Production receipt](../releases/receipts/ADMIN_TAB_PERSISTENCE_PRODUCTION.json)

Only `application.html` changed among prior served files; 17 hashed assets were
added. The reconciled baseline protects 2,568 files with all 37 recovery mappings
and passes the ordinary preservation build. Marketing, feedback, coach enrollment
and the six private-report files remain exact. Hosted qualification uses owned
synthetic fixtures; cleanup status belongs to the release handoff and receipt.
The [broader backend plan](../engineering/ADMIN_REPORT_EFFICIENCY_PLAN.md) remains
proposed; this publication does not implement its backend or SQL phases.

## Requested directory behavior

People & organizations offers only numeric `schemaVersion: 2` organizations.
The directory requests an inclusive numeric point range in Firestore
(`schemaVersion >= 2` and `schemaVersion <= 2`), then checks the raw returned
value is exactly numeric `2` before mapping it or offering a choice. An old URL naming a legacy
organization shows the existing unavailable-organization message and does not
mount its roster or management view.

During hosted qualification, the equality query returned HTTP 500 `INTERNAL`
for the synthetic administrator's client token while the operator query succeeded.
The point range passed repeated server-only reads through the actual Chromium
and WebKit SDKs, returning the same six numeric-version-2 organizations and
excluding the owned legacy fixture. This records a verified client-query
compatibility workaround; the backend cause is not established. Failed reads
still surface the existing error and retry state, without an unfiltered fallback.

Other tools that deliberately support legacy organization workflows retain the
unfiltered `loadOrganizations()` default. No organization, player or membership
is deleted or migrated. The legacy directory reader remains available to older
embedded consumers. This is a small directory-read reduction; it does not fix
the reporting fan-out described below.

<a id="client-tab-persistence--november-5-source-candidate"></a>

## Published client tab persistence — November 5

The current admin workspace can reuse successful directory/context/roster reads
and exact report observations for up to 60 seconds within its bounded memory cache. Returning between
Players, Staff, Manage teams and Organization settings reuses the selected
organization's shared context; returning to a previously loaded reporting request
reuses its validated observation without showing a new loading state. The first
load retains its existing loading state and visible Teams comparisons/summaries.
Nothing is saved to localStorage, IndexedDB or a server cache.
Unclaimed-player `SignupStatus` still reads `getPlayerSignupInvitation` on
remount because its response can contain private signup codes. Those invitation
reads, one-time codes and issuing forms are intentionally outside this shared
context/roster/report cache; not every possible tab request is eliminated.

Directory retention is limited to one actor, source adapter and selected
organization, with a 4 MiB bound per retained result. The roster inherits the
context's earlier expiry. Report retention is bounded to five exact payloads and
2 MiB total. A view change can still make a genuinely different request: default
sorts, visible player IDs, filters, pages and Usage feature detail are part of the
key. Such a request loads once, then can be reused within its remaining lifetime.
A report's original checked/observation timestamps are preserved on reuse.

Explicit Refresh, known club mutations, auth changes and organization/team scope
boundaries invalidate the affected reads. Report Refresh also evicts the other
completed report variants in that scope so their shared totals are fetched again. Report variants are cleared on scope
changes even while Players reporting is unmounted on Staff or Settings. Directory
context/roster is retained only for the selected organization. Leaving the
workspace clears its observations. Generation fences prevent a response started
before invalidation from refilling the cache. Permission/schema failures cannot
use cached data as a fallback; existing same-selection transient-refresh behavior
remains qualified by its stale state. Fresh cached observations represent the
prior authorized read for their bounded lifetime, not a new server authorization
check on every tab click.

This is client reuse of existing responses. It does not reduce the backend work
for a genuinely new report, create whole-cohort backend report sessions, add
projections, change canonical authorization, or implement the planned SQL reader.
The remaining read amplification below describes a network report request.

## Client persistence validation — November 5

The source candidate is based on `94ed38367e090fd7562d074fda3cad95994af775`
on `fix/admin-current-organizations`, plus the client-persistence patch validated below. All application source bytes remained unchanged throughout the final
local CI and subsequent strengthened browser checks. Node **22.23.3** and Python
**3.12.11** ran in the isolated website worktree with verified external storage,
separate mutable dependencies, preview optimizer cache, generated output and
loopback port. The unchanged committed lockfile's existing isolated installation
and existing Chromium/WebKit installations were reused; no dependency install or
browser download was needed for this follow-up.

| Check | Result |
| --- | --- |
| Full frontend Vitest (`--maxWorkers=2`) | 2,272 passed across 202 files |
| Full lint | Passed; 242 existing warnings |
| Python policy suite | 32 passed |
| Current scripts/tooling Node suite | 100 passed |
| Svelte check | 0 errors, 0 warnings |
| TypeScript + Astro build / marketing build | Both passed; 5 static pages each |
| Compiled Firestore transport guard / fixtures | Passed across 123 HTML/JS files / 2 passed |
| Guest Chromium smoke / marketing link activation | 7 passed / 18 passed in Chromium and WebKit |
| New actual-hook persistence browser matrix | 36 passed in Chromium/WebKit at 390 and 1,440 CSS pixels |
| Existing snapshot-fixture reporting retry smoke | 8 passed in Chromium/WebKit at 390 and 1,440 CSS pixels |
| Final browser-fixture scoped lint / diff check | Passed |
| Production dependency audit | 0 findings, 0 blockers |

The new [reusable browser harness](../../app/scripts/admin-persistence-fixtures/README.md)
uses actual `MonitorAccounts`, `DirectoryManagement`, `useAccountLoad`,
`useWorkspaceMetrics`, validation and retention code. Only auth/source/callable
boundaries supply invented data; the hooks are not mocked. A fresh shared
organization roundtrip reads organizations once, context once and roster once.
The reporting roundtrip fetches three distinct default payloads once each in the
organization Teams fixture, then returns between Overview, Testing, Workouts and
Usage without further reads. Testing shares Overview's payload in that fixture;
other layouts can have different visible-row/detail payloads.

DOM mutation assertions reject loading/refreshing flashes on fresh reuse. Tests
also verify original observation labels, first-load pending behavior, dependency
expiry, Refresh of related variants, global scope, auth and organization/team
changes, shared access-denial latching and explicit recovery. Both invalidated
report and context responses carry distinguishable old/new observations; releasing
the original delayed response cannot replace or refill the newer cached result.
The former snapshot fixture still mocks reporting and is compatibility evidence
only, not proof of persistence.

Earlier driver attempts are preserved separately. They exposed readiness and
mobile collapsed-Browse assertion mistakes in the new harness; those were fixed
before the completed matrix. The existing snapshot fixture's first run stopped
at a generic WebKit page-error assertion after Chromium passed. That earlier
driver did not record the error text; an identical focused WebKit replay returned
no page errors, and the full eight-case retry rerun passed. Its diagnostic now
includes actual page errors if it recurs. No application fix or invented cause
is attributed to that unreproduced failure.

Those source-only checks did not establish real authenticated Firebase/server
authorization, production-data, physical-device, live-latency or billing acceptance.
At that checkpoint, no hosted PR CI, remote push, production preservation assembly
or website deployment had run. The subsequent hosted qualification and publication
are recorded in the [release handoff](../releases/ADMIN_TAB_PERSISTENCE.md) and
[production receipt](../releases/receipts/ADMIN_TAB_PERSISTENCE_PRODUCTION.json).
No Functions or rules release is included. Local logs, source fingerprints, failed
attempts and screenshots remain outside Git; generated output and credentials are
not committed.

## Original investigation boundary

Website base: `65c77315fe786cab968ea23b2e0dba4d4ad3b6a7`.
Backend checkout inspected: `bbe7cb4065c3d59c2bb91f210cd603a3ebbe77b7`.
The four reporting modules (`insights-v2.js`, `insights-v2-projection.js`,
`insight-usage.js`, `insights-admin-reporting.js`) have no Git differences from
released feature source `96a38e63550c2eb785a27a5bcc762ed96091dcc7`.
The [release handoff](../releases/ADMIN_LAST_OBSERVED_FEATURE.md) records the
exact v11 source/archive and approved website runtime `6d105a7`.

The original investigation used source, existing release receipts and then-current
GitHub PR metadata.
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

1. Directory choices download current-format organization documents through the
   qualified inclusive numeric point range, then enforce raw numeric version `2`
   before mapping. Default legacy-aware callers retain the existing unfiltered read.
2. Selecting an organization calls `getClubContext`, which reads its teams,
   players, staff and invitations. `loadDirectoryRoster` then separately downloads
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

The browser transport deduplicates concurrent identical requests. The November 5
source candidate also reuses a bounded, fresh exact observation across tab
remounts as described above. A new/expired/invalidated key still repeats the
backend work. Focus/visibility return can refresh after 60 seconds; this hook does not enable
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

## Historical directory validation — November 4

The following checks cover the earlier directory-only source candidate `e6647ba` in the isolated website worktree.
The user-approved website worktree lane used its own mutable dependencies,
optimizer caches, generated output and localhost ports on verified external
storage. The primary checkout and its live owner's files were not used for
validation. Official Node **22.23.3** was downloaded to task-local scratch and
verified against Node's published SHA-256; Python policy checks use **3.12.11**.
The initial syntax and scoped lint checks used Node 22.19.0; the final standing
Node CI lanes below used 22.23.3.
`npm --prefix app ci --ignore-scripts --no-audit --no-fund` installed 423 packages
from the unchanged committed lockfile. Existing browser installations were reused.

| Check | Result |
| --- | --- |
| Changed TypeScript/TSX syntax | 6 files passed |
| Focused admin-directory Vitest | 35 tests across 3 files passed |
| Full frontend Vitest (`--maxWorkers=2`) | 2,245 tests across 200 files passed |
| Scoped / full lint | Passed; 3 scoped existing Fast Refresh warnings / 242 full-source warnings |
| Python policy suite | 32 passed |
| Current scripts/tooling Node suite | 100 passed |
| Static-transport checker fixtures | 2 passed |
| Svelte check | 0 errors, 0 warnings |
| TypeScript and Astro build | Passed; 5 static pages |
| Marketing build | Passed; 5 static pages |
| Compiled Firestore transport guard | Passed across 123 HTML/JS files |
| Guest Chromium smoke | 7 passed |
| Marketing link activation, Chromium/WebKit | 18 passed |
| Focused synthetic directory browser acceptance | 48 scenarios passed |
| Current app production-dependency audit | 0 findings, 0 blockers |
| `git diff --check` | Passed |

The focused browser matrix exercised the actual directory component in Chromium
and WebKit at 390 and 1,440 CSS pixels. It covered current organization choices
and roster navigation; legacy deep links in Players, Staff, Manage teams and
Organization settings; missing, string and future schema versions; loading,
empty and query-error states; and retry. Injected legacy choices remained hidden,
and rejected deep links mounted no roster or management reader. All scenarios
had no page errors or horizontal page overflow. Browser adapters supplied only
synthetic local data, rejected unmocked database access, and blocked external
HTTP/WebSocket traffic and writes. This is not real authenticated Firebase,
production-data, physical-device or live-latency acceptance.

The initial source-tooling run passed 96/100; four loopback-server cases failed
with sandbox `listen EPERM 127.0.0.1`. Normal loopback execution permission resolved
that environment restriction and the suite passed 100/100. The initial compiled
transport attempt lacked `astro`; isolated dependency setup and the completed
build resolved it. The first scratch browser-preview attempt encountered Vite
`504 Outdated Optimize Dep` while builds and the preview shared a task cache.
Giving the preview its own optimizer cache resolved that harness issue; all 48
scenarios then passed. No application change was required for these failures.
Existing build diagnostics about default Svelte configuration and ineffective
dynamic imports remain warnings.

Current CI has no website Functions or legacy dependency-audit lane and no
`verify-mobile-contract-artifact` command: shared runtime source has moved to
Backend. Those retired commands are not pending checks; the engineering workflow
now reflects the current CI and canonical Backend ownership. No new browser
installation was needed. These are local results, not a hosted PR `ci` receipt.

Logs, the scratch browser driver, 48 screenshots and structured browser results
are retained under external task scratch `admin-report-efficiency/` (including
`directory-browser/results.json`). Generated files and dependencies stay outside
Git. The synthetic localhost preview is review-only and does not change the live
site. No production preservation/release build was run; the pinned deployed
reference capture is absent from this worktree, and an exact production artifact
must be prepared and verified separately before publication.

No Backend source change, rules/index change, production query, database write,
push, PR creation, merge or deployment is included. A future release must compose
this scoped patch onto the then-approved runtime and preserve the protected
baseline. Local source integration and publication remain separate.
