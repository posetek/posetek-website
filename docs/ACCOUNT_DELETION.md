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

Jobs store only UID/player/coach IDs and operational state, not names/emails/media. Receipt tokens are SHA-256 indexed server-side. Receipts expose only state/timestamps. Job metadata and locks expire 90 days after completion to cover the documented backup restoration window. Team and organization objects are retained; an organization with no manager remains administrable by PoseTek staff.

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

**Unresolved release blocker: existing issue-tracker copies.** The source queue
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
