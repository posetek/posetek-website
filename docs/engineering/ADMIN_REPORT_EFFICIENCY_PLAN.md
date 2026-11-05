# Admin reporting efficiency implementation plan

Status: proposed backend implementation plan, November 4, 2026; client reuse
status updated November 5. The current source candidate implements bounded
60-second in-memory directory and exact-response report reuse across admin tabs,
with expiry, explicit refresh, auth/scope/mutation invalidation and late-response
fences. See the [loading review](../features/ADMIN_REPORT_LOADING.md#client-tab-persistence--november-5-source-candidate).
It does not implement the backend report-session architecture, new endpoint,
worker, compact projection, durable snapshot, SQL reader or performance targets
below. None is approved for production by this plan.

## Outcome and boundary

People & organizations should show scoped identities promptly while preserving
its accepted visible Teams comparisons and summaries. Identity-only navigation
should not compute a report; a visible reporting surface should progressively
load its complete metrics. An explicit report should calculate the complete
authorized, reporting-included cohort once, then reuse that observation for pagination, search, sorting and tab
navigation. Detailed workouts and short-lived feature evidence should load only
for displayed or expanded people. A large lifetime history must not make every
20-row page scan every workout twice.

Deliver this in two tracks: reduce avoidable work on the existing Firestore path
now; introduce a versioned report-session reader over compact projections after
parity and safety gates pass. Keep the new reader independent of its storage
adapter so the separately planned PostgreSQL replica can supply it later. Do not
start a second replication system or require SQL infrastructure for the first
improvements. Do not increase concurrency as the main cost fix.

P3 Firestore projections and durable Firestore snapshots are conditional investment,
not mandatory prerequisites to SQL adoption. After P0–P2 measurements, review the
existing replica program's actual readiness with its owner. If its qualified SQL
adapter can supply equivalent complete observations first, connect it directly to
P4/P5 and skip duplicative Firestore projection/session persistence work. If SQL is
not ready and repeated history reads remain costly, build only the measured P3
units needed for near-term relief. Shared contracts, semantic fixtures and canonical
safety/Auth checks apply to either adapter; readiness does not waive parity,
retention/deletion, authorization or lag gates. No delivery estimate decides this
branch: use demonstrated capabilities and measured request costs.

The following remain release invariants:

- Whole-cohort counts, rankings, team comparisons and follow-up groups retain
  current definitions. `pageSize: 20` controls returned detail, never the aggregate
  denominator. Bounds produce an explicit incomplete/unavailable result, never a
  plausible total from a truncated roster.
- Current canonical ownership, schema version, access, reporting exclusion,
  deletion and account-binding ambiguity take precedence over any cached value.
  Organization/team labels remain visible while data is loading.
- Recorded sign-in means uniquely bound Firebase Auth evidence. App use is an
  estimate; last observed activity has 15-minute precision; timer and estimated
  workout time, unknown and zero, and uncollected and inactive remain distinct.
- Selected-period data and current-at-observation account/latest-workout/active-plan
  facts remain distinct. Current-week assignments use the plan timezone; reporting
  day boundaries use the requested reporting timezone.
- Existing `getClubInsightsV2`, `getCoachPlayerComparison`, coach/manager responses,
  independent coach access and installed iOS clients retain their contracts.
  New behavior is administrator-only and opt-in until separately qualified.

## Source evidence and dependencies

The [loading review](../features/ADMIN_REPORT_LOADING.md) is the diagnosis and
current validation ledger. [Feature definitions](../features/ADMIN_ACTIVITY_REPORTING.md),
[November 3 release](../releases/ADMIN_ACTIVITY_REPORTING.md) and
[November 4 release](../releases/ADMIN_LAST_OBSERVED_FEATURE.md) define preserved
behavior. Use [WORKFLOW.md](WORKFLOW.md) for CI and source integration and
[BACKEND_MIGRATION.md](../features/BACKEND_MIGRATION.md) for canonical ownership.

The inspected website directory branch was `fix/admin-current-organizations` at
`e6647ba`; it adds the numeric `schemaVersion: 2` directory predicate and rejects
legacy deep links. The deployed website remains runtime `6d105a7`, deployment
`6aeb76624e362b0c48f30421`. Backend `getClubInsightsV2` version 11 uses feature
source `96a38e63550c2eb785a27a5bcc762ed96091dcc7`. The four reporting modules in
inspected Backend `bbe7cb4065c3d59c2bb91f210cd603a3ebbe77b7` match that source.
Recheck these identities when starting implementation; source main and the approved
runtime are separate. Do not use all of source main as the next runtime.

November 5 hosted qualification found that authenticated browser equality reads
on `organizations.schemaVersion` returned HTTP 500 `INTERNAL`, while operator
reads succeeded. The website compatibility fix uses the inclusive numeric point
range `>= 2` and `<= 2`, followed by a raw numeric-2 check. Repeated server-only
Chromium/WebKit SDK reads qualified that range against the same current/legacy
fixtures. This retains the bounded directory read; it does not qualify a new
backend reporting reader or establish the cause of the equality-query failure.

| Evidence | Consequence for the implementation |
| --- | --- |
| Web `app/src/pages/admin/lib/accounts.ts`: `loadClubAccountData`, `loadOrganizationPlayers`, `loadTeamPlayers`; Backend `functions/clubs.js`: `getClubContext` | Context reads players/staff/invitations, then browser reloads organization profiles; team identity loading starts from the organization roster. Split descriptors, management data and paged identities. |
| Web `views/MonitorAccounts.tsx`: `PlayerReporting`, `OrganizationPlayers`; `lib/workspaceMetrics.ts`: `useWorkspaceMetrics` | List mode can start metrics; Teams can request the admin history extension before an explicit report is needed. Gate by the visible task and request only its contract. |
| Backend `functions/insights-v2.js`: `directory`, `rosterFor`, `report`, `loadTrainingOverview`, `buildReport` | Scoped requests traverse global organization/team choices; roster/history work precedes follow-up, name search, sort and response slicing; training histories are fingerprinted twice. |
| Backend `functions/insights-v2-projection.js`: `loadInsightPlayer`, `rebuildInsightPlayer`, `invalidateInsightPlayer` | Every manifest day loads before period filtering; missing/dirty/old projections can rebuild and write during a report, up to 25 players/request. Existing background triggers also rebuild. |
| Backend `functions/insight-usage.js`: `readPlayerUsage`, `readLastFeatureEvidence` | Latest activity currently extends daily scanning to 24 months. Feature detail is already restricted to authorized displayed rows; preserve that useful boundary. |
| Backend `functions/insights-admin-reporting.js`: `loadAdminSignIns`, `readBindings`, `currentAssignments`, `latestWorkout`, `adminAggregate` | Account bindings include aliases outside the cohort, Auth is batched, and bindings are rechecked. Reuse semantic functions; preserve ambiguity and distinct evidence clocks. |
| Web `lib/workspaceMetricsData.ts`: `createWorkspaceMetricsTransport`; shared `app/src/lib/useReadOnlyReport.ts`, `foreground-report.ts`, Insights `lib/completeReport.ts` | Identical concurrent work is deduplicated. The November 5 client candidate retains up to five exact responses/2 MiB for 60 seconds within the active actor/scope, preserving original observation time. Focus/Refresh bypass reuse. This does not create a backend cohort snapshot; exact new requests still repeat the existing reader. Other report consumers retain their original behavior. |

Backend source links: [report orchestration](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insights-v2.js),
[history projections](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insights-v2-projection.js),
[usage](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insight-usage.js),
[admin semantics](https://github.com/posetek/posetek-backend/blob/96a38e63550c2eb785a27a5bcc762ed96091dcc7/functions/insights-admin-reporting.js).

Relevant integrated work: [Website #114](https://github.com/posetek/posetek-website/pull/114)
and [Backend #79](https://github.com/posetek/posetek-backend/pull/79) added activity
reporting; [Website #122](https://github.com/posetek/posetek-website/pull/122) and
[Backend #85](https://github.com/posetek/posetek-backend/pull/85) added page-bounded
feature detail. [Backend #77](https://github.com/posetek/posetek-backend/pull/77)
addresses unrelated issue-tracker jobs, not this request path.

[Backend #75](https://github.com/posetek/posetek-backend/pull/75), inspected head
`240090d417fa7c04f16840bad5509a29c793918d`, is the replica design and explicitly
excludes changing existing app/Functions/gateway reads and writes. Its
`docs/superpowers/specs/2026-11-01-firestore-to-cloudsql-replica-design.md` and
`docs/firestore-to-postgres/tickets/{S-20-analytics-base-views,N-20-insight-leaderboard-views}.md`
are dependencies, not completion evidence. [Backend #76](https://github.com/posetek/posetek-backend/pull/76),
head `f7b41f66e1b2b081a82ceaf2d2102c268c31c21f`, provides metadata inventory work.
Neither PR connects this screen to SQL. Reverify PR status before integration.

## Recommended contract decisions

Use these defaults for implementation and review. They are proposals, not an
instruction to change serving behavior or a previously approved contract.

| Decision | Recommended default | Gate |
| --- | --- | --- |
| Directory/report boundary | Load identity-only views without reporting work; progressively load accepted visible Teams comparisons/summaries through their scoped summary contract. Optional person badges request displayed-row facts. | Removing a visible metric or requiring a new user action is a product decision; do not ship it as an optimization. |
| Compatibility | Add `getAdminReportV1`; keep V2 unchanged. New endpoint returns an envelope and ready `ExpandedInsights`-compatible body, with additive session metadata. | Server capability is verified before browser opt-in; no changes required from installed native clients. |
| Observation reuse | Snapshot is an immutable report observation. Fresh for 60 seconds, hard-expiring after 5 minutes; explicit Refresh requests a new observation. Default 20-row pages, maximum 100. | Show original observation time, never reset it to cache-hit time. Validate current safety facts on every network response. |
| Cache persistence | Server-only Firestore session chunks initially; browser memory only, capped at 5 sessions and 2 MiB, cleared on identity/auth/context invalidation. No localStorage/IndexedDB or CDN caching of report data. | Collection access is server-only under qualified canonical rules; confirm effective denial before use. |
| Report rebuilding | Queue bounded background work and expose building/unavailable state. Do not let the new interactive reader rebuild player projections. | Legacy reader remains available independently; worker backlog and total reads/writes have budgets. |
| Auth freshness | Auth observations have their own `observedAtMillis`; refresh per new session, at most 60-second reuse within it. No inference from email/profile `lastLogin` or SQL replication. | Current binding uniqueness and eligibility are rechecked before every returned page and aggregate. |
| Storage adapter selection | After P0–P2, choose qualified SQL directly if the existing replica is ready; otherwise implement only the compact Firestore units justified by measurements. Shared P4/P5 contracts do not require both. | Replica/projection parity, deletion/lag gates, private service access and dedicated read-path review pass for the chosen adapter. |

The critical safety/cost tradeoff is deliberate: initial session page reads still
revalidate the *whole canonical scoped roster and reporting inclusion*. They do
not assume that an asynchronous trigger updated a scope revision. This costs
O(N) small identity/access reads, but avoids repeatedly loading O(lifetime logs)
histories. Replacing these checks with a constant-size revision read is a later
optimization, allowed only after every relevant writer atomically advances that
revision and race tests prove equivalent behavior.

## Work packages and parallel implementation boundaries

P0–P2 and P4 API/semantic fixtures can proceed independently of infrastructure
selection. P3A/P3B and durable Firestore storage are conditional on the post-P2
choice gate. P6 may feed P4/P5 directly when qualified; its number indicates a
separate workstream, not a requirement to finish all Firestore packages first.

Each package is a reviewable PR or linked pair of PRs. Separate source integration,
synthetic execution, production backfill and publication authorizations. Do not
run production measurements, seed real accounts, install dependencies, push, merge
or deploy merely because this plan describes those activities.

When implementation is authorized, use the requested GPT-6.1 Sol agents in
isolated claimed worktrees. Start independent packages in parallel only after a
coordinator freezes shared request/response fixtures. Assign each mutable file to
one agent; integrate through the coordinator. No agent may edit another session's
primary checkout or bypass a refused claim. These are future work assignments,
not a claim that agents already implemented the architecture.

### P0 — profiling, semantic oracle and API fixtures (Backend + Web)

Backend owner: existing `functions/insights-v2.js`,
`insights-v2-projection.js`, `insight-usage.js`, `insights-admin-reporting.js` plus
new `functions/admin-report-observability.js` and focused tests. Add an injected
request context to count each actual get/query/getAll/transaction attempt,
returned document, query page, source history page, projection rebuild/write,
Auth batch and response byte. Count empty queries, query count, request fan-out,
transaction attempts, peak payload/chunk size and validation-pass reads separately.
Keep SDK-requested/returned documents distinct from billed document and index-entry
reads; only provider execution evidence can establish the latter. Include index
work and empty-query minimum charges in any actual cost calculation. Avoid a
shared global counter across simultaneous invocations. Increment counters in the
read abstraction used by `completeQuery`, not just around a top-level function.

Log only a random trace ID, code/projection version, scope kind, coarse roster
size bucket, phase, hit/miss, retry reason, elapsed milliseconds and numeric
counts. No IDs, names, email, search text, dates tied to a person, raw document
paths or per-person timings. Keep low-cardinality dashboards. Count synthetic
harness operations exactly; sampling logs must not conceal real retry volume.

Capture deterministic old-reader business responses as an oracle using synthetic
fixtures; normalize only documented volatile timestamps/session tokens. Reuse
`functions/insights-{v2,admin-reporting,admin-roster,coach-workspace,overview}.test.js`,
`insights-v2-projection.test.js`, `insight-usage.test.js` and entrypoint tests.
Add call-count assertions for scopes, next page and retry. Record Auth API calls
separately from Firestore operations. Do not equate mock document counts with
billed reads or Cloud Monitoring project totals with this screen.

Web owner: freeze contracts and tests in `app/src/pages/admin/lib/` and existing
`workspaceMetricsData.test.ts`, `AdminDirectory.test.tsx`,
`WorkspaceReporting.test.tsx`, `AdminActivityReport.test.tsx`. Use the same
synthetic fixture IDs across server/client contract examples. P0 can run in
parallel with P1 after the coordinator agrees instrumentation touch points.

Done when the old path produces a reproducible stage-by-stage baseline and
non-sensitive summary artifact. Profiling must include operations currently
hidden in retries and final transaction revalidation.

### P1 — avoid unsolicited reports and duplicate identity reads (Web first)

**Implemented source subset (November 5):** the current admin workspace shares
its selected organization's context and roster across directory tabs and retains
fresh exact report responses across reporting tabs. It preserves existing first
load and Teams reporting behavior, with no Backend change. Directory reads remain
bounded to one selected organization and expire with their oldest dependency;
reports retain their original observation time and clear on auth/scope/mutation
boundaries. This subset is independent of the descriptor/page endpoints below.
The actual-hook browser regression is
`app/scripts/admin-persistence-acceptance.mjs`; its synthetic source boundary does
not certify real Firebase authorization or production performance.

The remaining P1 items below are proposals, not completed by client reuse.

Web owner: `views/MonitorAccounts.tsx`, `DirectoryNavigator.tsx`,
`lib/accounts.ts`, `adminDirectory.ts`, `workspaceMetrics.ts`,
`workspaceMetricsData.ts`, `app/src/lib/organization-data.ts` and their focused
behavior tests. Keep the current-format directory predicate and stale-link guard.

1. Gate `PlayerReporting` metrics by actual visible requirements. Identity-only
   navigation must not request full admin reports. Preserve accepted Teams
   comparisons/summary metrics: render identities/descriptors first and load their
   complete scoped summaries progressively, using a lightweight summary path when
   available. Do not remove these metrics or require an extra click without a
   specific product decision. Render loading/loaded-player counts without implying
   a complete report count. Existing person badges request bounded displayed-row
   facts; do not invoke the whole-cohort history reducer solely for those badges.
   Until a compatible cheap summary/badge contract exists, retain the visible
   behavior and report its remaining request cost.
2. Load staff/invitations only in management surfaces. Preserve invite/token
   privacy and manager/coach context behavior.
3. For reporting navigation, replace `loadClubAccountData`'s context-plus-profile
   fan-out with a lightweight descriptor and paged identity source. Do not
   repurpose `getClubContext`'s default response; old callers keep it.
4. Add an optional validated `view: "descriptor"` to `getClubContext` in Backend
   `functions/clubs.js` (or an isolated helper used by it) that returns selected
   organization, authorized teams and role without players, staff or invitations.
   Old servers may ignore the option; detect the descriptor capability and safely
   use the old path, without claiming a read saving before deployment. The
   descriptor response explicitly advertises `capabilities.descriptor: true`.
5. Add `getAdminDirectoryPageV1` for admin-only paged identities, accepting
   `{version:1, scope, pageSize, cursor?, namePrefix?}`; return allowlisted identity
   rows, `nextCursor`, `hasMore` and a qualified count state. Its default page is
   20 and maximum 100. Do not claim an exact total from a limited query. Bind cursor to scope,
   actor and order. Direct team query includes both organization and team
   predicates. Name/email substring lookup stays an explicit, separate task until
   an appropriate index or SQL search exists; do not approximate it with a capped
   roster download. Keep legacy `loadTeamPlayers` consumers compatible.

Test identity-only opening causes zero report calls, and visible Teams metrics
still load with the same cohort and labels; team selection does not download
other-team profiles; management operations still receive their required context;
old-server fallback works; returned stale legacy links never mount their roster.
P1 Web can precede Backend descriptor support with capability fallback. New paged
identity support is gated until its Backend companion ships.

### P2 — scope and range reductions on the existing reader (Backend)

Owner: `functions/insights-v2.js`, `insight-usage.js`,
`insights-v2-projection.js` and focused tests. P2 shares orchestration files with
P0: serialize integration or have one owner make both changes.

- Split the report's authorization resolver from global selector enumeration.
  For admin organization/team requests, read the exact current organization,
  selected team and required teams within that organization. Query version-2
  global selectors separately. Keep the old complete `choices` shape on legacy
  V2 unless a caller opts into a new scoped-choice contract. Do not narrow the
  legacy manager/coach resolver until its authorization parity is proven.
- Add explicit upper bounds to usage date queries. Separate selected-period totals
  from latest-positive-window discovery. An indexed reverse lookup must match the
  old cutoff/expiry/bin rules, including a historical cutoff and days whose most
  recent update is later than that cutoff. A cached latest pointer alone cannot
  answer arbitrary historical cutoffs; use indexed historical positive-window
  pages or retain the bounded old lookup until those exist.
- Extend projection manifest metadata with UTC min/max event bounds per page.
  Period reads fetch intersecting pages plus boundary pages and invariant totals.
  Keep cumulative testing's prior evidence, correction/duplicate qualification,
  date-unknown/future counts and weekly baselines intact. Initially leave
  cumulative mode on the old full-history loader if exact checkpoint parity is
  unavailable; do not declare range-read savings for it.
- Keep the current final transaction and training fingerprint checks. Do not
  replace them with a stale summary token. Missing metadata selects the old safe
  path, not an empty day or zero total.

Done when response parity and late-write/race tests pass and instrumentation shows
scoped reports no longer read unrelated organizations/teams on the opted-in path.
Range reads should scale with the requested interval where semantics permit it.
This package does not solve lifetime workout fingerprints by itself.

### P3A — conditional compact Firestore projections (Backend)

Owner: new `functions/admin-report-projection.js`, its tests and an explicit
projection schema fixture. Reuse existing qualification/reducer functions instead
of reimplementing workout definitions. P3A must first inventory writers/readers:
assigned/personal log creation, partial save, ending/correction/deletion,
training-plan activation/adjustment, usage ingestion, rep revision/artifact/failure,
profile/team transfer, reporting inclusion and account deletion. Include older
installed native writers and privileged scripts, not just the current Web app.

Proposed server-only storage:

| Record | Contents and rule |
| --- | --- |
| `players/{id}/adminReportState/current` | Schema/algorithm version, source/published generations, dirty/deleted state, observation timestamps and published manifest reference. Manifest records `revisionId`, `fingerprintVersion` and complete covered-domain `inputFingerprint` values under the parity invariant below. No cached access grant. |
| `players/{id}/adminReportDays/{utcDate_chunk}` | Versioned immutable qualified contributions with UTC bounds, record counts, duration evidence and source revision. Chunk below 256 KiB; manifest maps chunks to bounds. |
| `players/{id}/adminReportCurrent/current` | Exact latest-workout candidate/reference, active-plan inputs and bounded current-week slot evidence, latest retained activity candidate, collection/unknown flags. Keep its evidence times explicit. |
| `players/{id}/adminReportContributions/{sourceKey}` | Old/new normalized contribution and source generation/hash needed to subtract corrections and replay duplicate events. Store allowed derived fields, not full logs or notes. |
| Worker state/dirty queue | Bounded coalesced dirty units, lease, attempt count, continuation cursor and dead-letter reason. Avoid one scope document write for every telemetry event. |

Use idempotent contribution replacement keyed by source path and version, not
blind increments. For updates/deletes, remove the old contribution and add the new
one transactionally; out-of-order/duplicate delivery cannot double-count or
resurrect a tombstone. Editing the current latest candidate may require an
indexed reverse scan to find its predecessor. Plan changes recompute only affected
current-week evidence; week rollover schedules a refresh without a player write.

UTC 15-minute bins remain canonical for usage. Retain sufficient boundary evidence
to construct supported local days, daylight-saving transitions and non-hour offsets;
do not sum a Los Angeles daily projection for a different reporting timezone.
Never count web/iOS overlap twice. Last positive activity can predate the period
start but cannot exceed its cutoff. Expired detail cannot be made durable by
copying it into a new projection; preserve the existing aggregate/detail retention
rules, and check logical expiry before reads even if physical TTL deletion lags.

Start with small incremental workout and activity projections; retain existing
verified testing history until compact testing checkpoints reproduce cumulative
and period comparisons exactly. Measure added index writes, contribution reads,
backfill/reconcile reads and retries. Coalesce hot usage updates; do not write one
copy per organization/team or per open report. Bound worker concurrency and queue
age; use lease/continuation and existing `sourceEventHash`/deletion-lock patterns.

### P3B — conditional Firestore worker/backfill gate (Backend)

Owner: `functions/insights-entrypoints.js`, explicit new admin worker entrypoints,
`functions/index.js` export wiring, canonical Backend `firestore.indexes.json`
only if required, `functions/account-deletion.js` and
`functions/account-deletion-{state,barrier}.js` as required by P3A, and new
resumable scripts/tests.
Do not bulk publish existing exports or modify held rules as housekeeping.
P3A and P3B can develop in parallel against a frozen injected queue/projection
interface; only the P3B owner touches entrypoint/index/deletion wiring.

Extend the existing background lifecycle rather than adding duplicate listeners
for every collection. Current `RECORD_COLLECTIONS` omits training-plan changes;
add explicit qualified plan invalidation and current-week rollover. Profile
updates currently trigger history work only on existence changes; reporting
identity/access changes need their own correct invalidation mechanism.

Build an owned-synthetic backfill first. Production execution, if separately
approved, is resumable, rate-limited, dry-run by default, scoped by verified
allowlist, journaled with private before/after evidence and stopped on budget or
parity failure. Never force all 5,000 players to rebuild on first report.
Reconciliation detects missing events/generations and rebuilds affected units;
failed rebuilds preserve the last complete revision and visible dirty status.

**Consistency gate:** background delivery is eventual. Until every relevant writer
can atomically advance a source generation, the session builder must retain
canonical source revalidation (including existing full workout fingerprints where
needed) when publishing an observation. Generation checks may replace those reads
only for covered writers. Old installed clients must keep working; do not force a
new native write field or weaken its permissions. Full generation coverage may
require coordinated client/rules changes and an installed-client compatibility
policy; adding a trigger cannot satisfy that barrier. Keep this coordination out
of P0–P2 and preserve those feasible near-term improvements. If coverage is not
possible in the near term, accept a slower fresh build and optimize repeated page
reads; record this limit instead of claiming constant-cost freshness.

**Projection/source parity invariant:** retaining a live source fingerprint is
insufficient if it only proves that source stayed stable during a request. Every
published compact projection manifest must record `{fingerprintVersion,
inputFingerprint, revisionId}`. The input fingerprint is computed from the exact
complete, canonically ordered normalized source set used to derive that revision,
including active-plan inputs, assigned and personal workout collections, source
IDs/versions and deletions relevant to its metric domain. The worker publishes it
only after proving that source set remained unchanged while that revision was
built. A timestamp, async dirty flag or event generation alone is not this proof.

At session publication, read the canonical source fingerprint and manifest revision
again during final validation. Require
`liveFingerprint == manifest.inputFingerprint == builderExpectedFingerprint` and
an unchanged manifest revision/fingerprint version. A stable but lagging projection
must fail this equality. Use the same versioned normalization/hash helper in worker,
session validation and the oracle; do not hash different field sets or unstable
query order. For an uncovered domain, missing fingerprint, mismatch or incomplete
source enumeration, use the qualified old raw-source reducer or return building/
unavailable. Do not label the compact revision current. Only proven atomic
all-writer generation coverage may later substitute for this full source parity
check, and only for the domains it covers.

Backfill/worker write access needs explicit least-privilege service identity and
server-only collections. Verify canonical rule denial and deletion integration
before storing new derived person records. Rules belong to Backend under current
migration ownership, not this website. If new rule/index changes are necessary,
qualify and release them separately under their existing holds.

### P4 — whole-cohort report sessions and paged details (Backend)

Owner: new `functions/admin-report-session.js`, `admin-report-reader.js`,
`admin-report-contract.js`, tests, and coordinator-owned endpoint wiring.
Depend on P0 fixtures; can implement an injected legacy adapter while P3 is being
built. Production use of the Firestore summary adapter waits for P3 qualification;
a qualified SQL observation adapter may supply this contract directly after its
P6 parity/safety gates, without deploying P3 or Firestore session persistence.

Why persist sessions: process memory alone loses expensive cohort work on cold
instances, concurrent routing and retried requests. A short-lived immutable
manifest/chunk set lets those callers share one complete observation and stable
cursors. This adds session/job/chunk writes and deletion references, so instrument
the break-even point against memory-only reuse rather than assuming it is free.
Start the adapter and P0 harness with a memory implementation; enable durable
storage only when cross-instance/retry fixtures demonstrate reuse and privacy/
deletion gates pass. The default durable form uses the same Firestore already in
service, contains reduced rows only, and is disposable when SQL supplies sessions.
No new database or cache service is required for this phase.

Use an explicit endpoint envelope rather than adding keys to the strict existing
`adminReporting: {version: 1, followUp, sort}` object. Example proposed protocol:

```json
{
  "version": 1,
  "operation": "prepare",
  "request": {
    "scope": {"kind": "organization", "organizationId": "synthetic-org"},
    "startDate": "2026-10-01", "endDate": "2026-10-31",
    "timeZone": "America/Los_Angeles", "testingMode": "cumulative",
    "filters": {}, "adminReporting": {"version": 1, "followUp": "all", "sort": "name"},
    "pageSize": 20
  }
}
```

`prepare` authorizes before any roster or Auth work, canonicalizes the request and
creates/reuses one actor-bound job. It returns `{version:1, state:"building",
jobId, retryAfterMillis}` or the ready envelope. Cap active jobs per actor at two and retained sessions at five, coalesce identical
keys, and enforce global queue/backfill budgets. Proposed per-snapshot ceiling is
16 MiB across at most 64 chunks; proposed ready-page response ceiling is 256 KiB.
Exceeding either returns a typed unavailable result, never a truncated total.
Use the measured synthetic fixture to confirm these limits before activation. Do not store
client-supplied authorization or accept a caller-selectable Auth UID.

`read` accepts `{version:1, operation:"read", jobId?, snapshotId?, cursor?,
page:{nameSearch, followUp, sort, pageSize}, includeLastFeatureEvidence?}`. Status
checks use `jobId`; ready reads use `snapshotId`. Enforce exactly one identifier.
Return a discriminated `building | ready | expired | invalidated | unavailable`
envelope, with stable reason codes and bounded suggested retry delay. `ready`
contains `report` with the existing business response and `session` containing
opaque `snapshotId`, `asOfMillis`, `validatedAtMillis`, `freshUntilMillis`,
`expiresAtMillis`,
`algorithmVersion`, `sourceWatermark`, projection freshness and Auth observation
time. Only `ready` may claim `freshness.complete: true`. Permission failures remain
Firebase callable errors and never include data. The recommended initial policy
makes `freshUntilMillis = asOfMillis + 60 seconds`; a subsequent `read` beyond
that time returns `invalidated` with reason `refresh-required` and starts no raw
history work. The client explicitly prepares a new observation while retaining
only its already-mounted same-context report as visibly stale. The 5-minute
`expiresAtMillis` is the absolute session/storage boundary, never an extension of
freshness or a reason to refresh Auth evidence inside an otherwise immutable
aggregate. If product review instead allows stale snapshot paging, specify that
contract separately rather than quietly relaxing the 60-second default.

`refresh` accepts the same complete canonical request as prepare plus optional
prior snapshot ID, starts a new observation, and bypasses the session freshness
reuse. It does not mutate athlete business records or trigger a browser reload
loop. A physical worker status poll must not reread all raw athlete histories.

Snapshot building:

1. Resolve exact current authority/scope; enumerate the entire roster and reporting
   inclusion, recording a canonical membership fingerprint.
2. Read complete qualified compact inputs for all included members, with a fixed
   observation cutoff and version. Auth evidence and bindings are collected
   separately. If a member is missing/dirty/ambiguous, retain its explicit unknown
   state where existing semantics permit it or fail the whole required metric;
   never drop that player to make the response complete.
3. Revalidate proven source generations or apply P3B's explicit projection/source
   fingerprint equality and revision check. Merely observing stable source before
   and after reading a lagging projection does not qualify it. A mismatched domain
   uses the old raw-source reducer or blocks publication; it is never silently
   accepted or mixed with a different projection revision.
   Compute complete `rows` and all totals *before* follow-up/name/sort/page, matching
   existing `adminAggregate` and `buildReport`. Put big named follow-up lists on
   their own paged detail view; keep counts exact. Do not silently truncate legacy
   response arrays: the new envelope may expose cursors, while the V2 adapter
   preserves its full old arrays.
4. Publish an immutable manifest only after every chunk is written and a final
   canonical access/inclusion/deletion check succeeds. Use a state machine and
   conditional publish to prevent duplicate jobs from exposing mixed revisions.
   Store rows as <=256 KiB immutable chunks, never as one roster-sized document;
   enforce response and snapshot byte ceilings. Persist the minimal reduced rows,
   not full histories, raw Auth records, private intervals or workout observations.
5. Keep snapshot base key separate from presentation key. Base key includes actor,
   scope, resolved UTC period, timezone, testing mode, report filters, algorithm/
   projection versions and observation watermark. Follow-up, name search, sort,
   page and feature-detail flag select rows from that complete observation. A
   changed base filter creates another snapshot; switching presentation reuses it.

For the first Firestore adapter, loading compact snapshot chunks once per server
instance for repeated presentation is acceptable, with a bounded memory LRU and
server-only persistent chunks for cold instances. Do not promise indexed substring
search or O(pageSize) reads yet: cold alternate sorts may scan O(N) *compact rows*.
Default and already built ordering can use chunk manifests; next-page reads must
not scan raw histories or recompute cohort aggregates. SQL later supplies indexed
sort/filter/page operations. Cursor contains an authenticated opaque snapshot/
query fingerprint plus stable last sort key and player ID; reject tampering,
different actors, other scopes, altered page options and expired sessions.

### P5 — session UI and controlled refresh (Web)

Owner: new `app/src/pages/admin/lib/adminReportSession.ts` and tests;
`workspaceMetrics{,Data}.ts`, `views/MonitorAccounts.tsx`,
`AdminActivityReport.tsx`, `WorkspaceReporting.tsx`,
`app/src/pages/insights/lib/expanded.ts` only for additive compatible types.
One Web owner integrates shared files; P1 and P5 must not edit them concurrently.
Do not change shared coach/manager retry semantics through a generic hook.

Preserve URL scope/dates/filters/follow-up/search/sort/page and validated return
links. Bind URL cursors to the current session, treating an expired old URL as a
fresh first page with a clear message. Keep existing scope visible and clear rows
immediately on account/scope change. Show one preparation state, then complete
summaries and requested detail. An expanded workout row still uses the existing
five-distinct-session history and existing observation reader; no prefetch of every
player or video/media object. Feature evidence remains opt-in to Usage and
page-limited, read under current ownership and retention checks, not persisted
in the snapshot.

Memory reuse is actor/base-key-bound. Cache hits keep original observation/freshness;
never claim a network validation occurred. New navigation returns through server
validation before displaying a previously unmounted cached report. The currently
mounted same-context report may remain visible with its timestamp during refresh;
permission/unauthenticated/transfer/deletion/schema errors clear it immediately.
On tab focus, validate once when stale, with jitter and in-flight deduplication;
no continuous interval polling and no retry storm across tabs. Poll only building
jobs, use server retry delay with jitter, stop on hidden/unmounted/account change,
and cap one foreground session to eight status polls before a visible manual
Continue/Refresh control. Transport retries allow at most two transient network
attempts; status polling is a separate cheap operation, not five full report
rebuilds. Permission and invalidated-cursor failures never retry automatically.

### P6 — SQL-backed read adapter (parallel migration-dependent option)

Backend owner: new `admin-report-reader-sql.js` or the equivalent service module
within the approved replica architecture, dedicated query/view migrations/tests,
and explicit service/IAM configuration. No Web database connection. Depend on
Backend #75's approved schema/codec, typed identity/training/recording mappings,
event sync, deletion/tombstones, backfill, reconcile and monitoring tickets.
Coordinate with their owners; do not duplicate D-10/D-11/D-12/D-13 replication.

S-20/N-20 analytics views are pseudonymized and explicitly omit names/emails/free
text. They may supply safe aggregate inputs, but cannot alone power named admin
rows or canonical permission checks. Add a separately reviewed privileged server
reporting view/join over the relevant typed tables, with parameterized scope,
current-membership filters and minimal identity columns. Do not widen `analyst_ro`
grants or reverse the pseudonymization for non-developer analytics consumers.
Use an indexed folded-name search column only after its semantics match the Web
contract; identity lookup email remains separate from report name search.

Compute complete filtered aggregates in a consistent SQL transaction/snapshot;
keyset-page detail with deterministic unknown/zero ordering and player-ID tie
break. Push predicates and aggregates to SQL, not a browser download. Preserve
qualified duplicate/correction logic and UTC/local boundary handling through
shared fixtures. Expose per-domain watermarks and algorithm version, not a single
sync timestamp that hides a lagging training/deletion domain. Pin the query
schema and adapter version to the release.

Before every return, authorize against current canonical Firebase authority and
perform the same access/inclusion/deletion checks as the Firestore session reader.
A lagging SQL membership row never grants access. Default maximum permitted replica
lag for non-security evidence is 60 seconds; missing/error/older watermarks block
SQL selection. Security facts have no allowed lag: canonical live checks remain
until a separately proven revocation mechanism supersedes them. A stale deletion
or exclusion watermark blocks the entire cached aggregate, not just one row.
Firebase Auth still requires its own observed metadata and canonical binding
checks; Firestore replication provides neither Auth sign-in metadata nor a reason
to treat last app use as presence.

Shadow SQL responses on owned synthetic fixtures first. Only then allow an
explicitly approved, bounded canary with counts/metric diffs retained privately.
Do not double every production request indefinitely to compare readers. Rollout
uses server configuration by approved actor/scope; SQL errors select the complete
Firestore observation if within its own budget, otherwise a clear unavailable
state. No merge or replica completion automatically switches this screen.

## Cache, invalidation, revocation and deletion safety

Every successful response, including a reused page or aggregate, must satisfy a
final read-only canonical check as close to serialization as possible:

1. Verify current authenticated caller and admin policy using the same canonical
   authority as the released callable. Document whether the current provider
   verifies token revocation; do not invent a stronger guarantee from an in-memory
   UID check. For the new endpoint, require a server-verified current eligible
   account/admin state and reject disabled/deleted/revoked sessions; measure this
   extra Auth work separately. Do not rely solely on stale custom claims.
2. Verify organization is current-format, selected team belongs to it, current
   roster exactly matches the snapshot membership fingerprint, and each cohort
   member still exists, is included and has the expected canonical owner. Recheck
   relevant deletion locks, including deletion in progress. Any transfer/exclusion/
   deletion invalidates the *entire* snapshot so totals cannot disclose a removed
   member. New members also invalidate it; do not retain an old denominator as
   current. Current names/team labels must match the validated profile generation
   or trigger a new observation; prevent stale identity from leaking after transfer.
3. Recheck account binding inputs and cross-scope duplicates through existing
   `readBindings` logic. A changed binding invalidates the Auth-derived totals and
   rows. Unknown/unlinked/none distinctions survive refresh and failure.
4. Verify logical snapshot expiry, algorithm/projection version and feature-detail
   retention at use time. TTL cleanup is storage hygiene, never authorization.

A live change can occur immediately after a check, as with the existing callable;
define the response's final validation point, test mutations during the transaction,
and do not claim continuous real-time revocation of already rendered pixels.
Clear active browser data upon observed auth/context invalidation and on a failed
revalidation; do not render cached data in a newly selected context first.

Use 5-minute session logical expiry on manifest, chunks, inverse deletion
references and job results. Set the provider TTL field on each stored record and
run bounded orphan cleanup with a proposed <=24-hour physical purge objective;
provider TTL timing alone is insufficient. No browser entry survives its logical
expiry. Cancelled/failed partial builds have the same expiry and orphan sweep.
Canonical account deletion removes
all derived per-player contributions and invalidates/purges any session manifest
and chunks that reference the player, including owned server memory entries.
Maintain a server-only inverse deletion index, proposed
`adminReportSnapshotSubjects/{playerId}/sessions/{snapshotId}`, and erase referenced
sessions before `account-deletion.js` erases the player root. Include N inverse
reference writes per newly persisted N-member snapshot in the separate session
write budget; these are not hidden inside projection-write targets. Process
memory entries are unusable after the next canonical check even if remote
eviction delivery is delayed. Resume deletion cleanup before marking it complete.
If the inverse reference cost erases measured savings, keep memory-only sessions
or defer durable snapshots; do not drop deletion coverage. A delete lock/tombstone
wins over delayed worker events;
workers check it before every publish. Cleanup retries are idempotent. Removing
a team's roster must not accidentally delete the athlete's source records.

Cross-instance retained caches are hints. Fresh canonical checks cannot be skipped
because process memory has a hit. No bearer snapshot URL, global UID-independent
key, public object storage, service-worker persistence or shared CDN response may
serve report payloads. Enforce bounded per-actor storage/job quotas and chunk
schema validation to avoid turning arbitrary search/filter keys into unlimited
stored snapshots.

## Budgets and acceptance evidence

The historical 26-player November 3 fixture measured first report 8.784 seconds,
warm median 6.807 seconds, warm maximum 10.513 seconds, and a later corrected
refresh 14.636 seconds. November 4 small scoped checks were approximately
3.55–3.86 seconds. These are release observations, not a present-day service-level
objective or real-roster benchmark. Static diagnosis estimates roughly
`10 + H + U + 2(P + W + L)` requested documents per included player before
several directory/binding/query/retry costs; this is not a billing calculation.
No new production latency, billing or representative real-roster data was measured.

The following are **proposed release targets**, to calibrate after P0. Capture
actual baseline/candidate results and explain any target change before rollout.

| Scenario | Proposed target and release criterion |
| --- | --- |
| Open an identity-only list | Zero `getClubInsightsV2`/new report preparations; descriptor makes zero roster, history, Auth-directory, staff or invitation reads. Displayed identity pages return <=pageSize+1 identity records. Visible Teams summaries remain complete and load progressively through their explicit measured summary path. |
| Scoped organization/team request | Zero unrelated organization/team history reads. Selected-team identity query never fetches the parent roster merely to filter it. |
| Warm page/sort/search of a ready snapshot | Zero raw workout/plan history reads, zero projection rebuilds, zero cohort reaggregation, zero redundant browser roster reads; zero new player-projection writes. Canonical O(N) safety validation is explicitly counted. |
| Warm next page, N=100, 31-day report | Candidate p95 <=2 seconds callable and <=2.5 seconds visible page under controlled regional conditions; 20 returned rows. Target includes final safety checks, not a cache hit before authorization. |
| Fresh compact first report, N=100, 31 days | Candidate p95 <=4 seconds ready response after projections are clean; at least 80% fewer requested raw history documents than oracle. If all-writer coverage requires old fingerprints, record the unmet target and keep that gate closed. |
| Long-history sensitivity | Warm next-page raw-history reads remain zero as lifetime logs grow from 10 to 1,000/player; full-period total and final-page member match oracle. First-build cost is reported separately. |
| Warm page read budget | <=2N + 2I + 4P + 50 requested documents, where N=canonical roster, I=included members needing cross-binding verification and P=pageSize; Auth batches separate. If existing alias checks exceed this proposal, report the measured count and amend the budget openly before acceptance. Do not skip safety checks to fit it. |
| Snapshot reuse and storage | At most one preparation per identical actor/base-key freshness window; five-minute logical expiry enforced. No raw histories/private feature intervals in stored snapshots. Chunk <=256 KiB; browser memory <=2 MiB/5 sessions. |
| Projection writes | Proposed steady-state median <=8 derived document writes per changed workout/plan source record, excluding source business writes; usage projection adds <=2 writes per accepted coalesced update. Include retries, index/write billing where available, reconciliation and delete costs. Excess triggers redesign or an explicit revised budget. |
| Worker quality | Proposed p95 projection lag <=60 seconds, no silent dead letters; dirty/missing members produce visible building/unavailable states. No raw full-roster rebuild on page navigation. |
| Correctness and privacy | Exact business parity for all golden fixtures; zero leaked excluded/transferred/deleted people, zero cross-actor cache reuse and zero partial totals. Fail closed under races and retained expired records. |

Synthetic profiling protocol:

1. Use the fixed emulator/synthetic profile, with owned fixture sets of 0, 1, 20,
   26, 100, 500 and 2,000 players; exercise the supported 5,000-player boundary in
   the backend harness and verify explicit failure above it. Never export real
   athletes. Include multiple organizations/teams, unassigned players and empty
   teams to expose accidental global scans.
2. Independently vary report length (7/31/366 days), retained usage (24 months),
   plans (none/active/100) and assigned/personal logs (10/100/1,000 each), and test
   the combined history bound. Include old/future/undated records, concurrent
   platforms, expiry edges, duplicate logs/reps, reversed corrections, early
   endings, no ending, known-zero timers, ambiguous/unlinked Auth and DST changes.
3. Measure cold function/cold snapshot, warm projection/new snapshot, retained
   snapshot/cold process, warm next page, alternate sort/name search, back/forward,
   tab return, force refresh and expanded detail separately. Run at least 30
   controlled samples of each release-critical N=100 scenario; report sample size,
   median/p95/max, region/runtime, source SHA, bytes, reads/writes and Auth calls.
   Mock/emulator latency does not establish production latency. Query Explain
   analyze executes queries; use it only on explicitly authorized synthetic data
   or approved live diagnostics, not as a free read-only action.
4. Inject transfers, membership revoke, org schema change, inclusion change,
   profile deletion/delete lock, account rebinding/duplicate outside scope,
   Auth disable/revoke, log update, TTL expiry and algorithm upgrade immediately
   before and during final validation. Exercise duplicate/out-of-order worker
   events, canonical generation G2 stable before/after while a complete projection
   remains at G1 because its trigger is delayed, mismatched fingerprint
   normalization versions, partial chunk publish, lost leases, stale cursors,
   actor switch while a request is in flight, worker crash, missing watermark
   and SQL outage.
5. Run old/new reducers on the same immutable authored fixture; compare aggregate
   denominators, rankings, unknown-state counts, all pages and every metric, not
   only page one. Instrument a 21st/last-page extreme-value player so a hidden
   20-player aggregate shortcut cannot pass. Verify current scope/timezone labels
   and loading/stale states in Chromium and WebKit, plus mobile viewport cards.

## Validation, rollout and recovery sequence

The [loading review](../features/ADMIN_REPORT_LOADING.md#client-persistence-validation--november-5)
contains completed directory/client-persistence local checks and production-acceptance
boundaries. Its results must not be reused as tests of the proposed backend architecture. Record current checkout
policy/check results separately from later reporting-package results. Before each
PR, follow [WORKFLOW.md](WORKFLOW.md) and each owning repo's current `AGENTS.md`;
report every unrun lane with its exact reason. No production or authenticated
acceptance is implied by guest smoke or source-only syntax checks.

For the Web packages, run focused and full Vitest, full lint, TypeScript/Astro
build, Svelte check, marketing build, static transport test and compiled checker,
current scripts/tooling guards, guest smoke, Chromium/WebKit marketing-link
activation, policy tests and the app production-dependency audit specified in
the workflow. Website Functions and legacy audit scopes were retired after the
Backend migration; their owning-repository lanes must not be represented as
website checks. Add authenticated emulator browser acceptance for
canonical admin and denied manager/coach/player/guest paths. Browser + Functions
integration must use pinned Backend contracts and synthetic fixtures. Backend
packages run focused Node report/projection/entrypoint tests, full applicable
Functions tests, CI policy lanes and migration-source checks; SQL changes add
migration/grant/query-plan and replay parity tests. Canonical rule/index changes,
if actually needed, add their own SDK emulator/index qualification and scoped
release receipts. Existing dependency/network/ownership denials remain pending.

Release order:

1. Merge P0 and safe P1/P2 improvements through their normal reviewed PR lanes;
   no automatic report-session or SQL activation. Preserve `[skip netlify]` for
   website source/receipt integration. Directory code still needs a deliberately
   composed application runtime before publication.
2. Freeze contract fixtures, then qualify and separately publish only the intended
   Backend descriptor/identity helper and observation instrumentation endpoints.
   Preserve V2 config/IAM, unrelated exports and previous rollback archives.
3. Apply the post-P2 adapter choice: if Firestore P3 is justified, qualify its
   storage privacy/deletion lifecycle and workers, execute an approved bounded
   synthetic backfill, and shadow P4 against the old oracle. If qualified SQL can
   supply equivalent observations first, shadow that P4 adapter directly and omit
   duplicate Firestore projections/durable sessions. A production
   backfill/worker release requires its own current baseline, rate budget, owner
   authorization, receipt and stop/rollback procedure. Do not activate broad
   migration candidates or change gateway/rules releases.
4. Publish the qualified new session endpoint over the selected adapter, disabled
   for ordinary users; run owned
   synthetic auth/performance/race acceptance. Enable a server-controlled synthetic
   administrator canary, then approved scopes only after budgets/parity pass.
   Browser capability must reflect actual serving support, not source main.
5. Compose P5 onto the then-approved website runtime, keeping held policy/session/
   Ball Striking candidates excluded. Build the deliberate application release,
   byte-verify preservation of protected marketing/feedback/enrollment/recovery
   assets, run authenticated draft acceptance, then promote the exact approved
   artifact only under separate publication authorization. Reconcile the baseline
   and retain receipts. Neither a green ordinary build nor PR merge does this.
6. P6 SQL selection stays off until the existing replica program and independent
   read-path gates pass; it may be the initial P4/P5 adapter if those gates pass
   first, or replace the temporary Firestore adapter later. Record both reader versions, all source pins and schema/
   watermark identities. Canary reader selection separately from browser deploy.

Fallback rules are explicit. A deployment lacking the new callable/capability may
use V2 once for the same explicit report action. Auth/permission/deletion/schema
errors never fall back to a less strict reader or stale payload. An overloaded or
dirty new reader may use one complete V2 observation only if its estimated cost
fits a configured per-request/actor budget; otherwise show unavailable/retry.
Use a circuit breaker and deduplication so timeouts do not fan out to both readers.
An expired page returns the first-page refresh path, not a silently mixed snapshot.

Rollback first disables the new reader/SQL selector for all actors, cancels
unneeded jobs and returns explicit reporting actions to the prior qualified V2
endpoint and website artifact. Retain prior version/config/IAM and exact artifact
bytes; never roll back to weaker authorization or delete source histories. Stop
workers if their writes or lag exceed budgets; derived records may remain denied
and unused until a separately approved cleanup. Reconcile deletions before any
resumption. A scoped Backend rollback must not bulk redeploy unrelated functions.

## Approval checkpoints and remaining decisions

P0 instrumentation and safe P1 identity/read deduplication can proceed without
removing existing visible metrics or changing report freshness. Product approval
is required for any proposal to remove/defer a visible summary behind a new action;
progressive loading with unchanged metrics is the recommended default. Recommended
freshness/expiry, envelope, cache boundaries and phased adapters above are concrete
starting defaults. Before activating P3–P5, the owner must approve the new derived
person-data storage/retention and explicit observation-time UX, including whether
60 seconds of normal evidence staleness is acceptable. Current access/inclusion/
deletion checks are mandatory regardless of that decision.

The unresolved technical question is writer coverage: can every deployed workout,
plan and identity writer synchronously advance a trusted generation without
breaking installed clients? P3A's inventory and race fixtures answer it. Until
then retain the canonical validation path and make no freshness/read-budget claim
that assumes the answer. SQL infrastructure readiness and private named-row view
ownership are dependencies of P6, not reasons to delay P0–P2 or to widen analytics
permissions. All performance budgets are proposed and must be reconciled with
measured synthetic evidence before release.
