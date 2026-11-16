# Player participation and journeys release

Published November 16, 2026 at 20:28:04 UTC as `6afb675237bfe4f2da0726ba`, from the
exact artifact verified on draft `6afb626912150583fcb04179`. Backend readback
confirmed collection activation at 20:27:30 UTC.

[Release receipt](receipts/PLAYER_USAGE_STORY_PRODUCTION.json) ·
[Feature contract](../features/PLAYER_USAGE_STORY.md) ·
[Website PR #165](https://github.com/posetek/posetek-website/pull/165) ·
[Website PR #170](https://github.com/posetek/posetek-website/pull/170) ·
[Backend PR #173](https://github.com/posetek/posetek-backend/pull/173) ·
[iOS PR #148](https://github.com/posetek/posetek-mobile-app/pull/148)

## Reporting and collection

Usage shows weekly participation and player follow-up by desktop browser, mobile
browser or native iOS. Journey includes Pages, Paths, Players and the existing
Stats funnel. Both views distinguish unknown coverage from recorded inactivity.
Account-level journey events capture displayed pages, selected controls and
observed outcomes for the player's own account. An unobserved ending is labeled
**Last observed here**. The application privacy notice describes the collection
and the 90-day expiry for named journey records.

Exact native build coverage still requires recorded device acceptance and a
verified released build. Browser participation can distinguish desktop and mobile
from the start of browser classification. Earlier verified own-player iOS usage
can contribute to participation, while native journey coverage depends on an
instrumented build.

## Website artifact

Website main `529d3022ad94964e37ddafab1b03ec558ca79e1e` integrates the reporting and
collection source. The application artifact uses runtime `c3ae5fe` on the serving
Admin phone editor runtime `20574aa`. The isolated sign-in artifact uses runtime
`12b756d` on the serving Stats CTA runtime `c657e98`. The application preserves
the accepted workout store, privacy sections outside the usage notice and
existing AI transport. The isolated sign-in preserves ordinary signup and each
existing report's exact-player entry.

The artifact has 2,971 served files and matches 2,972 provider records including
routing metadata. It preserves 2,899 prior served files, including all 114
encrypted reports and their reader. Only `/application.html` and
`/player-signin.html` are replaced. The 70 added hashed assets include one
stylesheet captured from the same Vite build before Astro removed it. That
stylesheet restores the application's Privacy-to-Home transition. Both entry
documents and the other hashed build outputs match the frozen build. All 13
header rules, 12 redirects and Netlify Function bindings were preserved.

The artifact manifest SHA-256 is
`2c3730066a59ef2406c6d3d21bd62e95013c9995a8e7385b88fce3de3ad78272`.

## Verification and CI

Local runtime checks passed both builds and 102 focused unit tests. Chromium
and WebKit verified Usage and Journey, the Stats funnel, web collection, plan
outcome measurement, isolated sign-in and the usage notice. Hosted draft
and production verification each matched 2,971 files, read back 193 targeted
HTTP files and checked 10 routes. Chromium and WebKit exercised both exact built
entries with synthetic data. Those hosted browser checks generated zero
external writes.

Signed-in verification covered Vacaville United Soccer Club → All teams. The
existing Usage cards remained available, and desktop Weekly participation
compared November 16 week to date with November 9–15 in Pacific time. Journey
followed One-pager tracking, retained the Stats funnel and preserved Mobile
Paths on refresh and browser Back. Both views showed the native coverage gaps
and the empty supported-build lists. Two successful live Usage requests took
37.6 and 37.3 seconds. The browser reported zero console errors.

The final source CI run failed because the WebKit test could read the previous
journey request before the newly selected filters started their request. The
owner authorized deployment without waiting for hosted CI on November 16. The
receipt branch's test-only commit `903dfd4` waits for the fresh request with the
selected filters. Three consecutive runs passed in Chromium and WebKit and an
independent review of that revision found no actionable issues.

## Backend and native coverage

The scoped backend release uses canonical merge `cd1f830`. It updated
`getClubInsightsV2` to version 16, `recordInsightUsage` to version 12 and both
deletion workers to version 9. `recordPlayerJourney` and `getAdminPlayerJourneys`
are active at version 1. Scoped source and configuration were verified against
the serving endpoints. Backend billing blocked the hosted jobs and the owner
authorized deployment after review and local qualification.

Both journey collections have active `expiresAt` TTL policies. An ordinary
synthetic account deletion request was accepted and reached tracker processing.
Its first sweep remained pending during observation. In a separate resumed-job
probe, the deployed worker removed the synthetic profile, journey session and
actor marker before fixture cleanup and advanced to verification with its first
sweep complete. The synthetic fixtures were cleaned up.

Final readback confirmed enabled player journeys and own-account usage with
legacy usage still enabled. Both supported iOS build lists are empty. iOS source
`8b05810` accompanies the release. Full-app and physical-device acceptance and
verified native build distribution remain open. The first explicit sign-in is
the first one observed since the current 90-day marker was initialized.

## Preservation and recovery

The reconciled baseline protects 2,969 files and carries all 37 existing local
recovery mappings. The ordinary preservation build verified every protected
file, and all 30 preservation and isolated-entry tests passed. The predecessor
is `6af8d52f2fac61a1bf491cc8`. Disable new collection
through the scoped backend settings and use the current serving inventory and
recorded predecessor when recovering the website. Keep `[skip netlify]` on
source and receipt merges.
