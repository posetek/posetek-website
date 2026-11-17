# Player participation and journeys

Website and backend released November 16, 2026. This extends the Stats Journey
foundation in website PR #165. The release handoff records the exact artifacts,
activation, companion PRs and verification. Native full-app and physical-device
acceptance remain open. [Release handoff](../releases/PLAYER_USAGE_STORY.md)

## What administrators see

People & organizations → Organization → Usage adds **Weekly participation**.
It defaults to desktop website and compares the current local Monday through the
selected report end with the whole preceding Monday–Sunday week. Mobile website
includes phone and tablet browsers; native iOS is a separate selection. The
existing combined cards remain intact. Their historical player-profile totals
can include linked-parent activity; the new records count the player's own
account, not staff or separately linked parent accounts.

First recorded use, previously active, and unknown history percentages all use
weekly active players as their denominator. First use is across PoseTek, not
first use of a platform. Clickable groups show active in both weeks, added this
week, first use, returns after a gap, not yet returned, repeat in both weeks,
previous repeat users returning on one day, previous repeat users with no return,
and unknown comparison coverage. Each player row shows both weeks' active days,
latest 15-minute activity window, and a Journey link. Missing coverage cannot establish
absence. Current-week comparisons are provisional and offline arrivals can
revise them.

The single Journey tab follows One-pager tracking where available and uses
`directoryPane=journey`. Pages, Paths, Players, and the retained Stats funnel are
views within it. Pages show visits, distinct players, button presses, median
active seconds, next pages, and session-end rates with their denominators.
Paths preserve within-tab/scene order. Player histories show only enumerated
page/action/outcome events, associated times, and an observed or unknown ending.
Period, timezone, platform, history and entry filters, selected player, and view
round-trip through the URL; changing organization clears selected player/cursors.

A missing close is **Last observed here**. It does not establish abandonment,
logout, or the reason usage changed. Session-end rate is ended sessions whose
last page was a page divided by ended sessions visiting that page. Ongoing and
incomplete sessions are excluded. Rate values in the backend contract are
percentages from 0 through 100. Incomplete bounded reports display a warning.

## Contracts and coverage

The existing `getClubInsightsV2` opts in with `includeUsageCohorts` and a
`usageCohortFilter`. It returns `adminReporting.usageCohorts` over the complete
authorized selection, independent of player pagination, and per-player cohort
evidence. Missing extensions show unavailable, never zero. Platform and group
filters use the existing request/identity/cache lifecycle.

Backend owns `recordInsightUsage` schema 2, `recordPlayerJourney`, and
`getAdminPlayerJourneys`. `playerJourneyContract.ts` is the versioned client
contract, not a copy of backend implementation or database rules. Existing
schema-1 clients and Stats-specific endpoints remain compatible. Backend must
resolve canonical account ownership, current membership and reporting inclusion.
Application clients, including admins, cannot directly access the collections.

The desktop/mobile browser split is prospective. Unknown browser classifications
stay unknown; older `web` records cannot become a desktop/mobile split. Old iOS
installs cannot supply new journeys. Earlier verified own-player iOS usage may
contribute to participation. Both reports show the explicitly configured
`supportedIOSBuilds`; an empty list means no verified build has been recorded,
not that no players used iOS. Release qualification must set the actual verified
version/build in the respective usage and journey settings after acceptance.
First activity and explicit successful
sign-in are different evidence. Signup, restored sessions, Continue and report
or deep-link entries remain distinct; authentication restoration is not login.

The admin presentation keeps positive current-week activity visible even when
previous-week coverage is unavailable. It does not infer returns or absences from
that missing comparison. For native iOS, an empty Journey result with no verified
supported build shows a pending-build explanation and links to the same scope,
platform and period in Usage. It does not display zero journey totals in that
state. Existing recorded sessions remain visible even if the supported-build
list has not been configured. A supported empty result and a failed load retain
their distinct states. Older native usage intervals can support participation
without containing the page events required for Journeys.

Web collection belongs to the player's actual resolved and displayed workspace,
including its separate sign-in document. Visible, focused active time uses the
existing two-minute idle threshold and progressing workout/video signals. A
visit belongs to one tab or native scene and ends after 30 inactive minutes.
Ordered deduplicated retries last at most 72 hours and cannot replay under a
different account. Collection never delays navigation. Fixed page and action
identifiers exclude typed text, raw addresses, query strings and contact data.
Named journeys expire after 90 days and account deletion removes their records.
Combined counts union player identities and simultaneous intervals; platform
counts overlap and must not be summed.

## Validation and release

Focused unit tests cover unavailable/zero distinctions, composition denominators,
follow-up presentation, navigation persistence and opt-in request construction.
`scripts/admin-player-usage.browser.mjs` exercises real components with synthetic
transports in Chromium and WebKit, desktop and 390px. The Stats browser suite
retains the original funnel acceptance. Collector lifecycle tests and canonical
backend/emulator tests cover writes, retries, identity and access separately.
Synthetic browser fixtures do not prove production collection or native install
coverage. No real player actions should be generated to validate analytics.

Release the scoped compatible backend, then the reviewed website artifact and
native build through their existing workflows. Native ownership/device gates
remain applicable. The website artifact must preserve the actual published
inventory, including every encrypted report, and include both the application
and isolated sign-in entry when collection ships. Patch only the reviewed usage
notice into the accepted privacy runtime; unrelated held policy source is not
authorized by this feature. Keep `[skip netlify]` on source and receipt merges.
Record coverage activation, exact build revisions, TTL/deletion verification,
synthetic acceptance and rollback before enabling collection.

Rollback disables new collection at the backend setting and restores the
previous verified website/native delivery. Existing usage and Stats records
remain readable through their unchanged contracts. Do not publish the entire
source main application or replace live report-reader bytes during assembly.
