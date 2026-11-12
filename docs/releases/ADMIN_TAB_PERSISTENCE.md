# Admin tab persistence and current organizations

Published `2026-11-05T09:00:17.782Z` to posetek.net. Exact accepted deployment `6aec430f45bc0d0841566ba7` was promoted without rebuilding. Runtime `6ea75c7` extends approved `6d105a7`. [Production receipt](receipts/ADMIN_TAB_PERSISTENCE_PRODUCTION.json) · [Source PR #124](https://github.com/posetek/posetek-website/pull/124) · [Query compatibility PR #125](https://github.com/posetek/posetek-website/pull/125).

## Behavior

People & organizations offers only current numeric `schemaVersion: 2` organizations. The client requests inclusive numeric bounds (`>= 2` and `<= 2`) and checks the raw value is exactly numeric `2` before mapping it. Legacy organization deep links show an unavailable organization; no existing organization was migrated or deleted.

Within the selected organization, tab roundtrips reuse the shared context and roster plus fresh responses for the exact reporting request for up to 60 seconds. The original report observation time stays visible. First loads, changed requests and expired observations retain their canonical reads. Explicit Refresh, known club mutations, organization/team scope changes and later Auth lifecycles invalidate reuse. Report Refresh also clears related completed report variants. Late pre-invalidation responses cannot refill the retained observations. Retention is bounded workspace memory; no report is saved to browser storage.

The [loading review](../features/ADMIN_REPORT_LOADING.md) records the source boundaries and historical validation ledger. Backend cohort sessions, compact projections and the proposed SQL reader remain deferred.

## Deployed acceptance

The unchanged hosted candidate passed 34 functional checkpoints: 17 each in desktop Chromium and phone-sized WebKit. These used real Firebase Auth, deployed callables and three owned synthetic players, with no mocked service responses. They cover current-only choices, exact scoped rows, shared context/roster/report roundtrips, report variant reuse, original observation labels, explicit report and shared-context Refresh, related variant invalidation, natural expiry, team/organization boundaries, legacy rejection and Auth changes. Real non-admin and unsigned requests to the deployed report callable returned `PERMISSION_DENIED` and `UNAUTHENTICATED` respectively.

The focused live run passed another 24 checkpoints, 12 per browser, against the exact promoted artifact. It repeats current scope/rows, current-only choices, fresh shared tab/report reuse, report Refresh, legacy rejection and real Auth boundaries. Natural expiry, shared-context Refresh, related variants and exhaustive team/organization roundtrips were qualified on the identical hosted candidate rather than repeated live.

Both browsers measured the same improvement for Staff → Manage teams → Organization settings → Players:

| Additional browser requests | Predecessor | Accepted candidate |
| --- | ---: | ---: |
| Context callable | 4 | 0 |
| Roster query | 1 | 0 |
| Exact report callable | 1 | 0 |

Revisiting the fresh Usage response after opening Overview added no Usage request on the candidate or live site. A genuinely new Overview request still loads normally. These are browser request counts, not billed Firestore reads or a new latency distribution. The small synthetic cohort does not establish maximum-roster performance. Phone emulation is separate from physical-device acceptance.

Chromium completed candidate and live checks without blocked requests, console diagnostics or page exceptions. WebKit returned all expected reports while logging the predecessor's Firestore Listen/Write access-control connection diagnostics: 14 on the accepted draft and 18 live. The guard blocked five automatic diagnostic-write attempts in each accepted WebKit run; all other requests were permitted. No unexpected application exceptions remained. This is not a zero-error or zero-blocked-traffic claim. Owned-only desktop and phone content panels were visually inspected.

Earlier failed harness attempts are retained privately. They exposed sign-in hydration, safe Firebase bootstrap allowlist omissions, a phone-hidden coverage selector and scope navigation that correctly opens People before Usage. Correcting those assumptions did not change application bytes. The real equality-query failure below was a separate client compatibility defect.

## Query compatibility qualification

The first draft, `6aec4034ede449aabfba4b0b`, was rejected before promotion. Its authenticated client equality query returned HTTP 500 `INTERNAL` before organization, roster or report loading. Operator OAuth ran the same query successfully; the root cause remains undetermined. Neither a rules nor an index change was made.

The inclusive numeric bounds passed three server-only reads in each hosted Chromium/WebKit Firebase SDK and three real-token REST repeats. Every returned raw value was numeric `2`; both owned current organizations were present, the owned legacy organization was absent and counts matched the operator result. The reviewed compatibility fix uses those bounds plus the raw-value check.

## Exact artifacts and source

All 2,570 artifact files match 2,571 provider records. Artifact manifest SHA-256: `a970596e53cb36134ea0eb169645b7516a57f4b3c45e3edc6ad9bc95c917d0d3`. Of the 2,553 predecessor artifact files, 2,552 remain byte-identical; only `/application.html` changed, and 17 hashed assets were added. Players, Coaches, feedback, coach enrollment and all six private-report files remain exact. Provider-generated configuration changed only `build.publish`; all 11 headers and 10 redirects remained structurally exact. The public receipt records hashes and sizes without machine paths.

The reconciled baseline protects 2,568 files and retains all 37 recovery mappings. An ordinary guarded production build passed against that baseline; its output was not uploaded. Source PR #124 merged as `b876eb1`, and compatibility PR #125 merged as `4cd3785`. Both hosted CI gates passed, and latest-revision advisory reviews found no actionable findings. The runtime branch remains separate from source main and excludes held policy, session and Ball Striking candidates.

## Owned fixture cleanup

Temporary identities, credentials, raw browser captures and operational journals remain private outside Git. No real player profile, workout, consent or account choice changed. No invitation issuance, email or notification callable was invoked. Normal owned-player background triggers generated three invitation records and three matching code indexes; the UI's read-only invitation lookup was permitted only for exact owned player IDs. Codes were not logged or included in public captures.

Cleanup completed after all browsers closed. It removed the eight seeded business documents, the owned admin profile, two Auth identities, generated invitation/code references and owned projection descendants. Early passes stopped safely on a concurrently removed projection child and Firebase's normalized email case. Fresh readback resolved the already-absent child; Auth deletion required exact UID, normalized email and the fixture creation-time window. Conditional document deletes retained update-time checks.

A first delayed probe, 130.1 seconds after initial cleanup, correctly found two owned Auth-deletion social-preference tombstones. Their exact deletion payloads were checked and they were conditionally removed. At `2026-11-05T09:09:34.690888Z`, 77.3 seconds after that removal, the read-only absence pass checked 24 owned roots, descendants, 21 bounded generated-reference/projection queries and both Auth identities. No owned checked documents, descendants, invitation/code references or Auth accounts remained; temporary password fields were absent. This records the completed delayed readback without claiming an additional peer audit.

## Release boundary and recovery

No Backend, rules, indexes, gateway, catalog or native release is included. Existing `getClubInsightsV2` version 11 remains the reporting backend. Parent/coach report outreach and unrelated held application candidates remain held. Keep `[skip netlify]` on source/receipt integration.

The predecessor `6aeb76624e362b0c48f30421` and its verified inventory remain recovery evidence. Before recovery, compare fresh serving state and preserve any subsequent accepted changes. Follow the guarded exact-artifact workflow; a source revert alone does not republish an artifact. Hosting recovery does not reverse business data.
