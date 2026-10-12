# Account deletion — local candidate

Status: in progress, disabled, not pushed or deployed. The owner explicitly requires a later go-ahead before any production push/deployment.

Approved behavior: admins can delete users/coaches; coaches remove only players from their current team while preserving accounts/media; users can permanently delete themselves. Permanent deletion includes personal recordings. Deleting a coach preserves the coached athletes.

## Source contract

- `functions/account-deletion.js`: recent-auth request, exact canonical ownership resolution (no email-only deletion), admin account directory, opaque status receipts, durable cleanup jobs and leases. The request persists locks before returning success. Processing disables Auth, removes scoped data/media and configured warehouse rows, deletes Auth, then repeats cleanup after a 24-hour grace period before reporting completion. Failed steps remain retryable; the hourly scheduler fans retries out through independent document triggers.
- `functions/account-deletion-barrier.js`: wraps callable builders, including runWith/factory callables, to reject locked actors and named athlete targets. Status and idempotent deletion requests use explicit unwrapped handlers. Deploying only the new endpoints would leave existing callables unprotected: coordinated deployment is required.
- `functions/account-deletion-warehouse.js`: allowlisted BigQuery destinations, parameterized athlete IDs, confirmed DML completion required.
- `functions/clubs.js`: `removeClubPlayerFromTeam` checks active coach membership and exact expected team, clears legacy pointers and updates roster projections atomically. Managers receive no new cross-user removal authority.
- Canonical rules/native UI are in the companion mobile branch `worktree-account-deletion`.
- Gateway and Standard-processor barriers are in the companion processor branch `worktree-account-deletion`. No processor weights or generated artifacts are included.

Jobs store UID/player/coach IDs and operational state, not names/emails/media. Tracker-erasure holds additionally retain exact opaque occurrence, provider and mail IDs required to suppress re-import and reconcile external copies. Receipt tokens are SHA-256 indexed server-side. Receipts expose only state/timestamps. Job metadata and locks expire 90 days after completion to cover the documented backup restoration window. Team and organization objects are retained; an organization with no manager remains administrable by PoseTek staff.

## Enablement is blocked pending verification

`config/accountDeletion` must remain absent/disabled. Do not write it during development. Event workers and requests require all of `enabled: true`, `verifiedManifestVersion: 1`, `warehouseReviewed: true` and a reviewed `bigQueryTables` array. An empty array is valid only after verifying no personal-data warehouse is active. Shared professional/catalog media are never erased.

Before enabling, reconcile actual collections/legacy aliases, all buckets/prefixes and versions, warehouse tables, issue-report derived/external copies, legally required financial records and provider retention against the source selectors. Review shared-event projections/station references and coach-authored private artifacts. Test large/failed jobs, delayed server work and restoration suppression. These are release gates, not claims of completed live coverage.

Native compile/device flow validation, service deployment/IAM/secret/config preservation checks and live synthetic acceptance are also outstanding. Publish the candidate privacy/support wording only with working native/backend deletion. Do not promise an App Store pass.

## Evidence

- 13 isolated canonical rules suites passed, including 60 deletion assertions.
- Full Functions regression: 995 passed, 3 pre-existing skips; the subsequent feedback/recovery/usage cleanup case plus focused role suites passed 37 tests.
- Privacy/support SSR checks: 12 passed with a focused configuration (ordinary Vite configuration is missing installed Svelte/Tailwind plugins).
- Processor/gateway focused checks: 168 passed. The full gateway run has no newly failing nodes versus baseline, but an existing SciPy shared-library loading failure leaves it non-green.
- Native parse/project checks and focused real-SwiftUI-SDK type checking passed; full app/device verification is outstanding.

All destructive tests use synthetic in-memory fixtures/emulators. No user account, recording, production configuration or live data has been deleted or modified.

## Independent backend follow-up (2026-10-12)

The shared testing-event cleanup now removes a deleted coach's owner/operator
attribution, device entries and invitations, releases only that coach's station
leases, and scrubs check-in/protocol-change attribution while retaining other
athletes and shared event evidence. Issue cleanup also removes deterministic
request-identity and daily actor records belonging to the deleted UID.

Testing-event rep/progress/finalization writes and Storage-driven event dirty
markers now read player tombstones in their write transactions. This includes
completion/failure markers after asynchronous finalization. Background issue
intake similarly checks reporter and athlete tombstones before persisting data.
Regression cases cover delayed rep creation/deletion, deletion during
finalization, delayed Storage notifications, background issue ingestion, shared
coach-event preservation, derived issue identities, and lease expiry recovery.
The full Functions suite passed **1,004 tests, with 3 existing skips**.

This is local synthetic evidence, not completed live erasure coverage. The
remaining release audit includes in-flight external sends, restoration suppression,
and all production bucket/warehouse/legacy ownership inventories. The subsequent
bounded source review below closes the identified projector and notification
write paths.
Large-account runtime/progress acceptance and native device flows remain release
gates. Configuration remains disabled; no push, deployment or production data
operation was performed by this review.

### Bounded producer and notification review

`functions/insights-v2-projection.js` now checks deletion locks when invalidating,
claiming a rebuild, staging each bounded group of daily pages, publishing a
summary, and releasing a lease. `functions/social.js` checks the lock within its
rebuild transaction. `functions/workout-notifications.js` checks observer,
activity, quiet-queue, dispatch and callback transactions; `functions/user-issues.js`
checks dispatch; `functions/microsoft-email.js` checks the external send-permission
claim, receipt and trace writes. Both email dispatchers recheck immediately
before calling the provider. A provider request already in flight cannot be
recalled by a Firestore lock; its downstream retention still needs acceptance.
`functions/player-invitations.js` guards delayed invitation creation and redemption.
The Auth `closeSocialAccount` deletion hook in `functions/index.js` already reads
the UID lock inside its write transaction. Scoped source preparation manifests
include the new shared `account-deletion-state.js` dependency.

**Earlier review checkpoint (superseded by the tracker-erasure follow-up below):** The source queue
observer in `functions/issue-tracker-bridge.js` now rejects locked reporters and
athletes, and ignores fully deleted sources. Existing `issueTrackerQueue`,
`issueTrackerBatches` (including `rows`/`indices` descendants),
`issueTrackerState/seed`, `issueTrackerRows`, `issueTrackerIndices` and
`issueTrackerIndexBases`, plus already published external Office workbook/mail
copies, need a reviewed erasure lifecycle. See `functions/issue-tracker-bridge.js`,
`functions/issue-tracker-bridge-seed.js`, `functions/issue-tracker-bridge-transport.js`
and `deployments/issue-tracker/prepare.cjs`. The account cleanup manifest does
**not** yet erase these existing copies or cancel an already frozen tracker
batch. No bridge disablement or external-copy deletion was attempted. Do not
approve manifest coverage or enable account deletion until that integration and
provider-retention verification are complete.

Final local validation for this follow-up: the full Functions suite plus the
issue-tracker packaging suite passed **1,017 tests, with 3 existing skips and no
failures** (1,020 total). All fixtures were synthetic and all work stayed local.

## Tracker erasure follow-up (local source only)

`functions/account-deletion-tracker.js` now runs before ordinary issue sources are
erased. It discovers ownership only from exact reporter/athlete fields, normalized
`Recorded actor UID` / `Target player ID` cells, and proven occurrence/provider/mail
joins. Discovery includes current and frozen rows and legacy inline seed rows.
Names, email addresses, free text and substring matches never authorize erasure.

The worker removes matching `issueTrackerQueue` and `issueTrackerRows` documents;
removes matching batch `rows`/`indices` descendants and owned payload cells; and
prunes exact joins from `issueTrackerState/seed`, `issueTrackerIndices` and
`issueTrackerIndexBases`. Mixed-user batches, shared action rows and unrelated
map entries/cells are retained. Proven mail/source/provider IDs are saved in the
deletion job for retry and exact re-import suppression. Ambiguous and unlinked
mail/evidence remain a coverage-review gate rather than being guessed from text.

This local erasure is intentionally **not a valid workbook synchronization**.
Before the first tracker mutation, a transaction records `trackerErasure.pending`
on the deletion job and `issueTrackerState/writer.privacyErasurePending`, with a
human-readable reason, and revokes the writer lease. Redacted frozen payloads are
marked `privacy-erased`; their old payload/transition seals and receipts are
removed. Affected content-addressed base maps are marked `privacyErased`; their old
key/checksum must not be treated as a valid snapshot. Original aggregate counts
are retained as reconciliation evidence, not recomputed or asserted correct.

The publication hold affects the shared workbook writer. Unrelated occurrence and
mail ingestion continues to queue; no external batch can be prepared, sent or
acknowledged under that hold. Prepare/transport-claim/acknowledgement transactions
also recheck exact source tombstones. A request already accepted by the external
service can still finish; its receipt cannot restore erased local seed data.
There is no automatic hold release. Account cleanup removes other scoped data,
but remains retrying and does not delete Auth or report completion while the
tracker hold requires external reconciliation.

### Concrete remaining operator work

The current contracts provide **no external erase operation**:
`functions/issue-tracker-bridge-model.js` and
`scripts/issue-tracker/office-script.ts` accept sealed upsert changes and verify
row counts/revisions; `functions/issue-tracker-bridge-transport.js` only submits
that contract. `functions/issue-tracker-graph-reader.js` and the fixed-mailbox
read/identity proxies retrieve or identify mail; they do not delete it.

Before release, an authorized workbook/mailbox owner must supply or approve:

1. An exact workbook/table and mailbox retention scope, including retained
   versions, copies, deleted-item retention, legal holds and tracker capture/
   evidence archives. Resolve ambiguous/unlinked records using verified source
   identity; never infer ownership from a name or the mailbox recipient.
2. A reviewed erasure operation for `IncidentInstances` occurrence keys,
   `EmailEvidence` proven immutable message keys and `DailyDeliveries` exact
   job references. Preserve unrelated records and shared `ActionTracker` human
   columns. The corresponding mailbox operation needs scoped delete permissions
   and a decision about retained/recoverable messages; existing read permissions
   are not sufficient evidence of that authority or capability.
3. Independent readback evidence binding the erased source IDs to the exact
   workbook/mailbox copies and retention result, including any request already
   in flight when the hold began. No such evidence has been created locally.
4. Reconciliation of the redacted workbook revision/counts, exact machine hashes,
   local seed/index base and pending mixed batches. Implement a reviewed recovery
   path that rebuilds valid seals without replaying erased cells, preserves other
   queued work, and records evidence before explicitly releasing the publication
   and deletion-job holds. The present worker deliberately has no release API.

Deletion configuration remains disabled. These are lifecycle and access decisions,
not a reason to broaden identity selectors or silently discard unrelated content.
No production configuration, workbook, mailbox, account or recording was accessed
or modified by this implementation.

Validation for this tracker-erasure follow-up: **1,025 passed, 3 existing skips,
zero failures** across the full Functions and tracker-packaging suites (1,028
checks total). Focused cases include mixed-user preservation, legacy seed-only
identity, missing batch payloads, retry idempotence, exact mail re-import
suppression, deletion during preparation/provider receipt, unrelated ingestion,
and refusal to complete an account job with unresolved external copies.
`firebase.json` packages the full `functions` source directory; the new erasure
module depends only on Node crypto and the already packaged athlete-path helper.
The isolated tracker package already includes its deletion-state dependency and
passed its packaging suite. No release artifact was deployed.

## Reserved identity hardening after independent review

Profile-derived Auth UIDs now pass the same reserved-root validation as self and
direct UID requests before a job or lock is written. Worker claims and direct
sweeps revalidate durable subject IDs before Auth or Storage operations, so an
unsafe job accepted by an older handler cannot erase a reserved root. Existing
player/coach document IDs already use that validator. Processing-attempt uploader
aliases remain confined beneath `processing_attempts/<uploader>/<attempt>/` and
cannot select a top-level shared root.

Player and coach alias regressions cover ten reserved names, both alias fields,
ordinary canonical aliases, and a pre-existing unsafe queued job. Full Functions
plus tracker-packaging regression: **1,029 passed, 3 existing skips, zero failures**
(1,032 total). This local selector fix does not resolve the external tracker
completion lifecycle or justify the native automatic/30-day completion wording.

Coach identity review confirms `userUID` is required by the existing admission,
club-mirror and native signup contracts. Deletion now rejects an
`authenticationUID`-only coach before acceptance; it also queries that legacy
field during self/direct-UID discovery so malformed or conflicting coach records
cannot be silently skipped. Canonical `userUID` and consistent dual-field coaches
retain their existing behavior. Regression cases verify no job, lock, Auth action
or media deletion occurs for the unsupported shape. Full Functions plus tracker
packaging: **1,031 passed, 3 existing skips, zero failures** (1,034 total).
External tracker completion and the native completion-time wording remain
unchanged release blockers.
