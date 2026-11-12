# Admin reporting refresh — November 5, 2026

Deployment `6aecbf94751cf215f811865f` was published at `2026-11-05T19:06:24.045Z` with runtime `bc6ed7c` and `getClubInsightsV2` version 12. Candidate and live signed-in acceptance, exact-file verification and baseline reconciliation passed. Owned-fixture cleanup and the delayed absence check also passed. [Production receipt](receipts/ADMIN_REPORTING_REFRESH_PRODUCTION.json) · [Feature definitions](../features/ADMIN_REPORTING_REFRESH.md) · [Request audit](../features/ADMIN_REPORTING_REQUEST_AUDIT.md).

## Scope and measurement

The refresh simplifies the shared scope header, replaces Overview cards, adds dedicated Testing and Usage charts, and places report charts before player tables. Same-cohort summaries stay visible during first visits and expired tab reads; exact rows and actions wait for current data. Summary retention is bounded, remains separate from detail responses, and clears across authorization, scope and filter boundaries.

Testing uses recorded drill results and current-cohort station evidence. Usage offers daily lines across one week, two weeks, one month and two calendar months. Missing collection coverage remains unavailable or partial. “iOS downloads” measures observed iOS activity, not installs; repeat users means activity on at least two distinct local days. Platform time is observed activity-window time. Workouts use saved execution logs; completion does not prove every prescribed set was performed. The feature definitions record the remaining coverage and timing limits.

New workout generation/adoption funnel implementation is excluded and remains a [separate handoff](../features/WORKOUT_REPORTING_FUNNEL_HANDOFF.md). Held policy, session and Ball Striking candidates, report outreach, rules, indexes, gateway, catalog and native releases are excluded.

## Reviewed source and exact artifact

Website [PR #127](https://github.com/posetek/posetek-website/pull/127) merged as `c1b34a8`; Backend [PR #94](https://github.com/posetek/posetek-backend/pull/94) merged as `99cd460e`. Runtime `bc6ed7c` composes the scoped application changes onto approved reconciled baseline `6a27edf`, preserving the November 5 deployment `6aec430f45bc0d0841566ba7`. Latest-revision source and artifact reviews found no blocking findings.

All 2,583 artifact files match 2,584 candidate provider records. Among prior served files, 2,569 remain byte-identical; only `/application.html` changed, with 13 hashed assets added. Players, Coaches, feedback, coach enrollment and all private-report assets remain exact. Provider configuration differs only in `build.publish`; all 11 headers and 10 redirects remain structurally exact. Artifact manifest SHA-256: `f2215ed7b9e3925327b62806eecb2e3adfb8370d6d8ba574eed262e881456d9a`.

Runtime qualification passed 2,186 frontend tests, 155 release-tooling tests, 16 display scenarios and 60 persistence scenarios, plus build, lint, policy, dependency and guest checks. Candidate HTTP verification passed 27 exact-byte checks. Signed-in candidate and live checks each passed 10 checks in Chromium and 10 in phone-size WebKit. All 27 deployed API assertions passed. The first Chromium harness sampled before the intended Overview request began; the corrected readiness wait passed without an application change or weaker cache assertion. Original evidence is retained. WebKit emitted known access-control diagnostics; automatic diagnostic writes were blocked, and no unexpected exception was accepted. The deployed fixture contains failed drill recordings and no station sessions; populated age trends and station elapsed values remain local synthetic evidence. Proof hashes are in the receipt; private logs, credentials and captures remain outside Git.

## Backend gate and release completion

Only `getClubInsightsV2` is included in the Backend release. The reviewed live-source overlay preserves entrypoint, dependency lock and runtime configuration; 17 existing archive files remain exact, two change and four are added. Candidate archive SHA-256: `ae1a4f56b65ef13f199848d805e6a70c631db6d4c60c23c76e2b9da8d7f8a186`.

Backend hosted CI was blocked by GitHub billing and did not pass. The owner explicitly authorized this one-time exception; the canonical publisher binds it to the exact endpoint, candidate and source qualification. All seven required local lanes passed. No protection was disabled, and unrelated releases are not authorized by this exception. Website hosted CI passed separately.

Backend version 12 is active with the exact candidate archive, unchanged configuration/IAM and all 147 unrelated functions unchanged. The accepted website draft was promoted without rebuilding. Live verification passed all 2,583 artifact files against 2,584 provider records and 27 HTTP checks. The reconciled baseline protects 2,581 files with all 37 recovery mappings; the ordinary preservation build and 32 receipt-policy checks passed. Cleanup removed both owned Auth accounts and the journaled test records. The first delayed check found 11 projection markers and two Auth-deletion tombstones; conditional cleanup removed those exact records. The final read-only probe, 119.2 seconds after the last removal, found no remaining records, accounts or credentials across 42 roots and 24 scoped queries.

Keep `[skip netlify]` on source and receipt integration. The prior deployment and Backend archive remain recovery evidence. Recovery requires a fresh serving-state comparison and the guarded release workflow; a source revert alone does not publish an artifact or reverse business data.
