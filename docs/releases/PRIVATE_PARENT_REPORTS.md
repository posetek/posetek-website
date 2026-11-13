# Private parent report review release

Published November 3, 2026 at 22:26:55 UTC. Exact accepted deployment
`6aea5e0ceb047cc53ae49efc` was promoted without rebuilding, after the Revamp
website chat completed its release and integrated its receipts.

[Production receipt](receipts/PRIVATE_PARENT_REPORTS_PRODUCTION.json) ·
[access model and assembly](../features/PRIVATE_PARENT_REPORTS.md) ·
[Source PR #116](https://github.com/posetek/posetek-website/pull/116).

## Behavior and delivery hold

A private phone-friendly report shows a simple within-team percentile chart,
strengths and practice areas, two starter exercises, a PDF download and one
athlete-specific Workouts button. The live sample retains its review banner.
Only one encrypted review snapshot is published; this is not a parent campaign.

All parent and coach report texts remain held after merge, deployment and review.
Dylan must explicitly authorize any future sending. The October 26 parent-results
chat owns tone, conversation history and recipient holds; wait for that chat to
finish before coordination. No sending automation was resumed by this release.
Private recipient inventories, links, keys, PDFs and plaintext stay outside Git.

## Access and remaining limits

The complete link grants read-only access to the report; it does not verify a
guardian or sign someone into PoseTek. The encrypted payload is public ciphertext,
and its key stays in the URL fragment. Anyone with the complete link can read it.
No automatic expiry, recall or revocation of copied links/PDFs is promised.

Workouts use the existing authenticated HTTPS athlete route. Guest browser checks
confirmed that sign-in preserves the selected athlete and training view. This
release did not perform new authenticated account acceptance or real account
changes. Unclaimed families need their original private invitation; first signup
currently opens Profile. No invitation or recovery token is embedded.

The installed app cannot yet receive athlete-workout links. Native navigation,
association/signing and physical-device acceptance remain separate work. This
release uses the browser and does not claim passwordless workout access or native
handoff. Browser viewport tests are not physical-phone acceptance.

## Exact artifact and acceptance

All 2,472 artifact files match 2,473 provider records. All 2,466 predecessor
served files are byte-identical. The only additions are five generic reader files
and one encrypted payload. Generated Netlify configuration is checked separately;
only two report rewrites and report privacy headers were added. Homepage, Coaches,
feedback, enrollment and the Revamp application remain unchanged.

The artifact digest over sorted paths, sizes and SHA-256 file hashes is
`a7477e5a307e6dd3043c9e0150fa9e7f67603c4f47c2c229b8dac8c433ee7d25`.
The report source is `efc385a9`, merged as `deee4104`. The preserved application
remains approved runtime `c33a9c8`; held policy, session and Ball Striking candidates
were not included. No backend, rules, index, gateway, catalog or native release
occurred. Keep `[skip netlify]` on source and receipt integration.

All six hosted CI checks passed, as did 43 focused local tests. Independent
source, artifact and release-operator reviews completed with no actionable
findings. Candidate and production Chromium/WebKit checks passed at 320, 390 and
430px: actual decryption, exact PDF bytes, workout href, refresh/reopen, missing
and wrong-key states, clearing prior child content, and no report tracking,
external requests, browser storage, cookies or page/console errors. Synthetic
local tests additionally cover tampering, injection and link switching.

Existing guest sign-in pages attempted external font resources; WebKit also
attempted an external Google script. The isolated guest redirect harness blocked
those requests, and both engines still preserved the athlete destination. That
observation does not apply to the isolated report, which made no external requests.

The initial CLI command stopped before upload on an unsupported context flag.
The first promotion preflight stopped before intent/POST on Netlify's lowercase
inventory paths. The reviewed correction normalizes only the local-to-provider
path comparison; content hashes, sizes, local paths and duplicate checks remain
strict. The unchanged candidate then passed and was promoted once. Original
attempt evidence remains private.

## Preservation and future work

The reconciled baseline protects 2,470 files, including the encrypted report, and
retains 37 historical local recovery records. All 39 preservation checks and the
ordinary guarded build passed. The ordinary preservation build is
a check only; its generated output is not the published artifact. The prior exact
artifact and configuration remain available as recovery evidence. Future fixes
must preserve unrelated accepted surfaces and follow the guarded release path;
restoring a website does not revoke report copies or reverse business data.

The initial additive builder deliberately rejects a predecessor that already has
`/report/`. Future report batches require a reviewed extension that preserves the
published report namespace; do not bypass the guard or recreate the old baseline.
Before eventual distribution, refresh tested-player eligibility and recipient
identity against the owner chat's current ledgers, resolve holds, and review the
final report wording. Coach delivery remains held.
