# Reviewed results in the athlete profile

Source candidate, October 30, 2026. Production publication and data migration
require separate coordinated verification; this document is not a release receipt.

The signed-in athlete's Profile shows an **Estimates and retests** section before
the skill map. Reviewed values have an ESTIMATE badge and approximate units.
Tests without a usable measurement say **Retest needed**, never zero. Results
lists and the linked review detail show the same value and status even when
the original failed attempt is excluded from ordinary result lists or no
playable media exists. A valid left-side result does not hide a right-side review.

## Display-only contract

The authorized `getAthleteEffectiveResults` response may add `reviewedResult`
to each repetition. Schema version 1 contains status (`estimate` or
`retest_required`), metric, value, unit, label, revision ID, reviewed timestamp,
protocol side, and `excludeFromVerifiedRankings: true`. The server verifies the
current canonical revision and provenance before exposing this projection.
The row's `resultStatus` remains unqualified and not duplicated, and its revision
ID must match the projection. Retests have a null value; estimates have a positive
finite number. Only jump height, broad-jump distance and shuttle/dribbling time
are supported. The browser copies an explicit display-field allowlist; reviewer
notes, private identities and artifact paths never enter the review UI.

Reviewed values remain separate from ordinary numeric fields. They do not
enter skill scores, personal bests, measured charts, team rankings or training
intake. Existing legacy provisional estimates retain their distinct behavior.
The general failed-attempt filter is unchanged: the new display projection is
collected before that filter, rather than reclassifying failed measurements.
Shared bearer-link portals do not receive this new profile section.

## Freshness and account isolation

A repetition snapshot clears the previous review display before fetching the
current effective results. An error or malformed response leaves it empty.
Only the latest request for the current authenticated owner may update state;
late responses after an account switch, logout, subscription error or unmount
are ignored. The initial portal loader applies the same owner/request check.
Review writes and restorations must update the repetition document so this
subscription invalidates earlier projections. The backend remains responsible
for permission and current-revision verification on every request.

## Synthetic acceptance and checks

Development-only `/athlete?preview=1&reviewed=1` uses the actual Profile and
Results components with six invented estimates, four retests, and one qualified
left dribble. The sample athlete is Jordan Example. It contains no real athlete,
parent contact or recording and performs no account writes. The reviewed
fixture branch is excluded from production by `import.meta.env.DEV`.

Focused tests cover all ten cases, strict projection validation, matching
Profile/list/detail values, absent media, failed-row visibility, qualified
left/reviewed-right coexistence, metric/scoring exclusion, latest-request
ordering, account changes, logout, refresh/subscription failures and cleanup.
TypeScript, frontend tests, lint and build validate the source candidate.
Browser acceptance and authenticated backend checks are coordinated separately.

Production must compose this approved patch onto runtime `63bae636`, preserving
the live application and public pages. Do not publish all current source main:
unrelated held candidates remain excluded. Keep source integration separate
from exact-artifact publication and use `[skip netlify]` on source commits.
