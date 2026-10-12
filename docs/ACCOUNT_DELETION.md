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
