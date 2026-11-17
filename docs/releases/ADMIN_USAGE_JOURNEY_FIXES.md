# Usage and Journey layout, coverage and delivery fixes

Published November 17, 2026 at 18:16:34 UTC as
`6afc9a00df67a95b26d453b0`, from the artifact verified on draft
`6afc9927ec11c4fd192919ce`. Inventory, browser, collector and authenticated admin readback checks passed.
Synthetic-fixture cleanup was verified complete at 18:24:41 UTC.

[Website PR #173](https://github.com/posetek/posetek-website/pull/173) ·
[Receipt](receipts/ADMIN_USAGE_JOURNEY_FIXES_PRODUCTION.json) ·
[Feature contract](../features/PLAYER_USAGE_STORY.md)

## Source and runtime

Source revision `af9f879219db0141ff49482918c5c483219a5af9` combines the report
layout and coverage-message changes with the browser focus guard. The candidate
runtime is `7e49414b45eaeba712787770419f61d87ae58953`, based on accepted runtime
`c3ae5fe11233eb4211a34b9623001ba2b0914b80`. Only four runtime files change:

- `app/src/pages/admin/views/usage-story.scss`
- `app/src/pages/admin/views/PlayerJourneys.tsx`
- `app/src/pages/admin/lib/usageStory.ts`
- `app/src/lib/insight-usage/browser.ts`

PR #173 merged as `108eda515a8ed5888b50f30ce09aba288eda3120` at
18:11:22 UTC on November 17, 2026, with `[skip netlify]`. The published artifact
manifest is
`7f6644b2b0c83b2a4dace4cf4309731944cc439353c08c3335bfea8ae37bd41b`. All earlier candidate artifacts are superseded and must not be promoted or
substituted for this runtime.

## Resulting behavior

Report controls have a 15rem preferred width and full-width phone rows, keeping
native dropdown behavior. Long participation buttons stay within their report.
The Pages table scrolls inside a named, keyboard-focusable region when its
columns exceed the available width. Existing phone layouts keep stacked rows.
The strict document-width checks remain intact.

Weekly participation states the known number of active players even when the
previous week lacks coverage. Missing coverage cannot establish returns or
absence. An empty native iOS Journey result without a supported build explains
that page collection is pending and links to Usage with the same club, team,
platform and reporting dates. Observed sessions remain visible; supported zero
activity and failed loads keep their distinct states.

The shared browser activity adapter now distinguishes window focus from focus
moving between controls. Previously, captured descendant focus/blur events
flushed redundant telemetry batches and could leave a delivery backlog during
keyboard navigation. The guard retains real window focus/blur, visibility and
keyboard/pointer activity behavior. It does not backfill unrecorded history or
change the server's calculations.

## Evidence before publication

The actual Pages component originally expanded a 768px document to 808px: its
554px table exceeded a 490px report column. The same browser suite now passes
in Chromium and WebKit at 1440, 768, 390 and 320px, with enlarged select text and
keyboard checks. Ten reporting unit tests, 37 clock/queue/recorder tests,
TypeScript and both complete collection browser scenarios pass. The foreground
boundary regression failed before the guard and passes afterward. Both
independent current-revision reviews reported no findings. All normal hosted
CI lanes passed on the final revision in
[run 44143867945](https://github.com/posetek/posetek-website/actions/runs/44143867945),
including both Linux browser suites. The aggregate check completed at 18:09:56
UTC. No CI override was used.

The earlier Linux WebKit failure was diagnosed with paired temporary styles:
native Timezone and Entry selects caused the 390px viewport to have a 429px
document despite correctly sized control bounds. Full-width phone rows reduced
it to 390px; restoring half-width rows reproduced 429px. Input clipping and
flex-column labels did not resolve it. The final control-width correction
retains native appearance and passes the original strict assertion plus the
entire width matrix. Temporary style experiments were removed.

A separate synthetic account exercised the existing live website and real
production collectors before this release. Desktop Chromium and mobile WebKit
browser emulation navigated Stats → Workouts → Stats. All observed
`recordPlayerJourney` and `recordInsightUsage` requests returned HTTP 200 with
`accepted: true`; both queues drained. Stored records contained the fixed Stats
and Workouts page identifiers and matched the own-player actor marker. The
live admin UI read back the synthetic player separately for desktop and mobile
browser, including the observed visits. No real player's actions were generated.

This pre-release probe establishes that fresh instrumented web clients can
collect and report data. It does not prove that older installed or cached
clients sent those events, or prove the focus fix in the new artifact. The
mobile-browser probe reported four generic Fetch errors without endpoint
attribution; the two observed collector endpoints accepted their requests.
Post-release desktop and mobile-browser probes both persisted the complete
Stats → Workouts → Stats sequence, with positive own-player usage and accepted
collector requests. Repeating the keyboard-navigation scenario reduced the
maximum queued batches from 22 to 2 and the final queue from 21 to zero. This is
one controlled synthetic comparison, not a production performance distribution.
Fresh Chromium read back the exact published application and entry bundle.
Mobile WebKit again reported four sign-in Fetch errors, now correlated to
`firestore.googleapis.com`; the exact read query and cause were not collected.
No observed analytics collector request failed.

After a full reload, the authenticated live admin view read back one synthetic
player with four desktop sessions (six Stats visits and three Workouts visits),
and one with three mobile-browser sessions (five Stats visits and three
Workouts visits). These separate totals matched the stored sessions. The real
club view also showed the iOS pending-build banner without a zero journey
summary, preserved scope through the Usage link, and displayed known positive
current-week activity while explaining unavailable previous-week coverage.
Synthetic-fixture cleanup was subsequently verified complete.

## Preservation, native coverage and cleanup

The captured predecessor is `6afb675237bfe4f2da0726ba`, with 2,971 served files
and 114 encrypted reports. The locally qualified candidate has 2,999 files:
2,970 predecessor files remain exact, only `/application.html` is replaced,
and 28 hashed assets are added. All 114 reports, reader bytes and the isolated
sign-in entry are preserved. Normal and proof builds matched 180 artifacts,
and the 159-file application closure passed hash checks. Local Chromium and
WebKit artifact checks passed with zero writes. Draft and production each
matched 3,000 provider records and all 2,999 files, with 151 critical HTTP byte
checks and 10 route checks. All 13 header rules, 12 redirects and Function
bindings remain exact. Hosted Chromium/WebKit checks passed at desktop and
phone widths with zero writes. No backend or native release is included.

Native iOS page journeys still require users to install a verified instrumented
app build. The observed supported-build list is empty. Older supported
own-player iOS usage can contribute to participation without supplying page
events; browser emulation is not native-device acceptance.

The synthetic account and scoped records were removed after the post-release
checks. Cleanup verified Auth absence, root and collector-row absence, nested
player read-cache and usage-row absence, and removal of the private identity
manifest. A profile-deletion projection trigger created a late owned
`insightSummaries` child; a second scoped pass removed it and rechecked nested
absence. No synthetic fixture remains. No real player activity was generated.

## Recovery and integration

The reconciled baseline protects 2,997 files, retaining all 37 local recovery
mappings and the exact `score-cards-v2` reader hashes. All 35 preservation and
isolated-entry tests pass. The ordinary guarded build verified every protected
file against the new production baseline.

Keep source integration separate from production publication and carry
`[skip netlify]` on both the source and receipt merge. Preserve the currently
served inventory before any later assembly. Roll back this application change
by restoring the verified predecessor artifact, retaining the existing backend
data and coverage settings. Production artifact verification, post-release
behavior and synthetic cleanup are recorded separately in the receipt.
