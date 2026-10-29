# Web AI-sharing recovery

Status: published and byte-verified October 24, 2026 at 5:27:30 AM PDT. The exact
reviewed candidate was promoted without rebuilding.

[Production receipt](../../deployment/WEB_AI_SHARING_PRODUCTION.json) · [historical candidate receipt](../../deployment/WEB_AI_SHARING_CANDIDATE.json) · [merged source PR #102](https://github.com/posetek/posetek_website/pull/102).

All 2,292 guarded artifact files match the provider inventory, which includes
2,293 records with generated routing metadata. Of the 2,268 protected files,
2,267 remain exact; only the application entry changes.
Provider routing metadata adds the exact consent proxy. No prior file is
removed. Players, Coaches, feedback and coach enrollment remain exact. Hosted
preview checks cover Coach, Profile and workout creation at 390/1280px; the
consent proxy rejects both absent and invalid tokens. Production is now
`6adc6d7bf370755a2aabc65b`; all 13 production route checks passed. The reconciled
baseline protects 2,290 files, including the 22 added runtime assets. All 37
historical `localPath` recovery records are retained. The prior deployment
`6ada849fa3505ca75b08ec3b` remains the recovery reference.

The ordinary guarded build passed against all 2,290 protected files after
reconciliation; its output was checked only and was not published. Independent
production verification matched the accepted artifact, checked six canonical
routes, and confirmed both missing and invalid tokens receive `401 unauthenticated`
from the consent proxy. Live browser verification passed five synthetic preview
checks at an 889px viewport, with no document overflow and visible consent
controls measuring 44/52/52px high. Two captures are hashed in the production
receipt. No authenticated consent save, provider generation, real athlete account
change or physical-phone acceptance is claimed.

The gateway rejects AI coaching and workout generation when the signed-in
account has no valid AI-sharing receipt. The website previously displayed that
failure without providing a way to review and save the required choice. A
regression test reproduced the missing recovery control. This establishes a
specific blocker; it does not establish the cause of every reported loading
failure. Private support messages, account identifiers and logs remain outside Git.

Players can now review AI sharing from Coach, personal Workouts and their own
Profile. The disclosure identifies the data categories and AI providers, links
the privacy policy, and offers explicit allow/decline actions. Merely opening
the control does not save a choice. A successful allowance preserves the request
for the player to resend; it never automatically starts a model call. Preview
choices are local demonstrations and do not change an account preference.

The fixed `/api/ai-consent` rewrite reaches the existing authenticated gateway
endpoint. Only `{version: 1, allowed: boolean}` is submitted with the current
Firebase token. The gateway determines the actor; the browser cannot choose an
account ID. A valid exact receipt is required before showing success. No rule,
backend, native client, provider setting or real player receipt is changed by
this source patch.

Withdrawal immediately blocks new AI requests locally, including when the
account-wide save fails. The UI distinguishes that uncertainty and allows a
retry. A per-account queue and revision check prevent stale choices in another
control from overriding a later withdrawal. The in-memory denial survives
unavailable or full browser storage. Already accepted requests may finish.
Code-only assessment, save, start and execution remain available. Existing
accepted jobs can be recovered without duplicate writes.

Validation covers missing-consent recovery, preserved drafts, exact requests,
malformed/error replies, failed withdrawal, token-refresh timeout, account
switching, stale responses, storage failure, competing choices, and the
code-only exemption boundary. All fixtures are synthetic. Desktop/mobile browser
preview checks establish layout and preview interactions, not authenticated
provider generation or physical-phone acceptance.

The published runtime `bb3274c` contains approved `499dc815` plus this patch.
Source PR #102 merged as `a9dc512` with passing source and merge CI and a
completed latest-revision advisory review. Main also contains held
policy/session/Ball Striking source; future application releases must compose
from the approved runtime and fresh serving inventory. Keep `[skip netlify]`
on source and receipt integration and preserve the exact-artifact workflow.
Recovery must preserve unrelated accepted surfaces and retained assets; no
rollback or data reversal was performed.

## CI dependency requalification — October 24, 2026

The source CI audit stopped because the two existing exact-path exceptions for
[GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
expired October 22. A fresh app audit retains those same two high-severity paths
through Firebase's Firestore and Firestore compatibility packages; it found no
new high or critical advisory path. The package manifest, lockfile and Astro
configuration are unchanged by this fix. The source and runtime candidates use
the same lockfile, SHA-256
`79b13d965e78c4ed2220d56d7231cb94e270db8fc647c4bcad50a4ece75e6f66`.

The primary advisory affects server certificate authorization through
`getAuthContext` when `requireClientCertificate` is false. The static transport
check passed across the approved-runtime candidate's 119 generated HTML/JS
files: Astro remains static with no server adapter, Firestore's browser export
differs from its Node export, and neither that browser export nor the inspected
output contains `grpc-js`. This supports renewing only the two existing exact
paths through October 31, with their owner and high severity retained. It does
not patch the installed Node package or qualify an SSR/server deployment.
Reassess on SDK, bundle, adapter, SSR or credential-path changes; the existing
expiry and new-path/severity checks remain enforced.

Current source CI audits only `app`; Functions and legacy source and their
exception files have been removed from website main. This requalification does
not renew the historical runtime branch's backend exceptions or authorize any
backend publication. No package upgrade, forced override or policy change is
included.
