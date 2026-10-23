# Homepage and admin workspace release — October 22, 2026

The homepage motion and first-activation fixes, and the Salesforce-inspired admin
workspace, are live at [posetek.net](https://posetek.net). Source PRs
[#97](https://github.com/posetek/posetek_website/pull/97),
[#98](https://github.com/posetek/posetek_website/pull/98), and the acceptance companion
[#99](https://github.com/posetek/posetek_website/pull/99) are merged into main.
Read the [production receipt](../deployment/HOMEPAGE_ADMIN_POLISH_PRODUCTION.json)
for exact hashes, source revisions, verification and recovery evidence.

## Published behavior

Players retains native scrolling with fluid depth motion and two stable,
nonadjacent, brief pixel accents per visit. Footer links and other controls keep
stationary clickable geometry. The homepage and Coaches retain their working
demos, content, approved media, provenance labels and destinations.

Administrators now have a dedicated green workspace rail, list-first People &
organizations, complete reporting tabs, persistent player-record navigation and
consistent specialist forms. Existing URLs, scope, permissions, data contracts,
explicit save boundaries and player/coach/manager behavior remain intact. The
reference findings and implementation decisions remain in the
[homepage guide](HOMEPAGE_FLUID_INTERACTIONS.md) and
[admin REA guide](ADMIN_LIGHTNING_WORKSPACE.md).

## Exact artifact sequence

Homepage candidate `6ada6e5a385faad3f4cd88ed` was promoted unchanged at
21:45:46.899 UTC. All 2,240 files match provider inventory; all 2,154 prior
protected files remain exact. Existing changes are limited to Players, Coaches
and generated provider metadata, with 84 added assets.

The approved application runtime was then composed against that newly published
homepage through the unchanged guarded release tools. Combined candidate
`6ada849fa3505ca75b08ec3b` was promoted unchanged at 21:52:44.893 UTC. Its 2,270
artifact files match 2,271 provider records. All 2,239 other prior serving files remain exact; only
the intended application entry changes; 30 assets are added and none removed.
Feedback, coach enrollment and the accepted public pages remain byte-identical.
Generated Netlify metadata is audited separately from served files.

The application is compiled from `499dc815`, based on approved runtime `4c1ba8e`,
not from the newly integrated main tree. Held policy, session and Ball Striking
candidates remain excluded. Homepage product inputs remain `b66a730`; later
reviewed revisions changed only documentation and timing-harness code. Runtime
branches must not merge into main. No backend, rules, indexes, gateway, catalog,
native release or persisted business-data contract change is included.

## Verification and limits

All feature PR checks, the integrated main checks and the exact approved runtime
checks passed. One homepage CI attempt reached its ten-minute job limit after
slow package installation; its seven browser assertions passed, but that attempt
remains cancelled. The required retry completed successfully.

The final hardware timing run passed 43/43 with maximum input delay 25.3ms,
overall median 0.4ms and maximum existing visual feedback 123.6ms. No measured
post-input main task reached 100ms. No unsolicited wheel input reached the test
pages; system-wide native wheel activity did occur, so globally idle input and
continuous OS focus are not claimed. The actual presented-opener precondition
adds capture/readback overhead before measurement. Earlier failed and contaminated
runs remain documented; no numeric budget was relaxed.

Live homepage checks covered desktop Chromium and touch Chromium/WebKit: menu,
demo and first footer activation passed, with nine captures and exact public HTML
comparison. Admin acceptance retains the earlier full functional/permission and
synthetic save/review coverage. Following the user's request to stop broad testing,
the recomposed candidate received a brief 37-assertion smoke. One WebKit desktop
case initially awaited a transient signed-out gate; the existing application
correctly navigated to `/signin`. Only that test expectation was corrected and
the affected nine assertions rerun. Original evidence is retained. Transport
diagnostics were correlated with request failures; they are not reported as an
absence of all browser diagnostics.

Final live admin smoke passed 37 assertions with eight captures in Chromium and
WebKit at 390/1440px. All nine native transport diagnostics correlate with request
failures, with zero unexpected errors. Nine synthetic business documents were
unchanged and notification outboxes were empty. Four verification accounts and
temporary credentials were removed. Initial independent readback found two real
owned reporting markers; targeted conditional deletion removed them. The final
unchanged independent verifier found zero owned accounts, documents, descendants,
projections or storage objects. A separate version-inclusive storage read also
found zero objects. Initial failure and follow-up evidence remain in the receipt;
physical erasure of retained provider history is not claimed. Synthetic business saves were blocked in hosted smoke;
successful save/review callbacks are covered by the earlier local fixtures.
Browser touch emulation is not physical-phone acceptance. No real athlete records,
invitations, notifications, recovery links or model jobs were changed.

## Future releases and recovery

The reconciled baseline protects 2,268 files from the combined deployment. The
ordinary `node scripts/build-production.mjs` check passed against all of them;
that check-only rebuild was not published. `sourceCommit` remains null, with
separate marketing, approved runtime and integrated-source provenance.

Retain the verified predecessor `6ad92e7fec1a407bec937389` and the intermediate
homepage deployment as recovery references. The latter preserves the accepted
homepage if an application correction is needed. Prepare and verify any recovery
artifact against current production so unrelated accepted surfaces and historical
assets survive. No rollback or business-data reversal was performed.

Keep `[skip netlify]` on source and receipt integration. Automatic main publishing
remains configured; this release did not change provider settings. Future releases
must use fresh inventories, exact hosted candidate acceptance and guarded baseline
reconciliation rather than publishing an ordinary full-source application build.
