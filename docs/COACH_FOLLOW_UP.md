# Coach follow-up

The current published overview adds [measured progress and full comparison
evidence](COACH_MEASURED_PROGRESS.md), released October 14, 2026. The release
history below describes the preceding follow-up checkpoint.

This pass removes D1 standing and D1-normalized testing percentages from the
coach overview, roster, player summary and detailed Testing results panel.
Relative team/roster percentiles remain a separate, labeled comparison. Player
and administrator benchmark views retain their existing presentation.

## What Needs you means

- **No completed workouts in this period:** zero qualified saved completions in
  the selected local reporting dates. Includes personal, assigned and extra
  workouts. Starting or ending early is not completion. An active plan and
  testing results are not prerequisites. This does not claim the player never
  trained or never signed in.
- **Recent testing down:** at least one matching measured metric worsened on a
  test's latest two qualified local dates through the selected end. Each test
  has its own two dates. Best values within each date are compared in the
  correct direction. Display-identical values at existing metric precision do
  not flag a decline. Different exercises, absent metrics, failed/duplicate,
  undated, future and provisional observations cannot create a decline. Mixed
  changes show which metric decreased and which improved.

Snapshot groups show all currently authorized, reporting-included players in the
selected filters, independent of roster search and pagination. A player in both
groups counts once under Needs you. Roster and player reasons use the same
versioned server evidence. Missing additive summaries show unavailable states;
legacy D1/sign-in reasons are never used as a fallback. Saved history and the
selected player's completion projection must agree before a new summary is
shown; recognized transient failures receive five bounded attempts and retain
only the same account/scope's previous successful read with a stale warning.

The former sign-in warning read `players.lastLogin`; that incomplete timestamp
is not reliable proof of no use. It is no longer a follow-up criterion.
No authentication or historical athlete data is repaired or inferred here.

## Implementation and preservation

`performance.coachFocus` version 1 adds the selected-period completion count and
raw measured test comparisons. `overview.coachFocus` version 1 adds complete
named workout-gap and testing-decline groups. Existing D1 and `testScores`
response fields remain available for compatibility; canonical membership,
qualification, scope rechecks, training progress and percentile calculations are
unchanged. The nine-function Expanded Insights publisher owns this contract.
No new endpoint, persisted schema, rule, index, gateway, catalog or native
release is required.

Signup code/link copying, organization navigation, prescribing, coach notes,
confirmed session calendars, workout history, Community, contact details,
account recovery and training/content acceptance gates are preserved.

## Design reference lock

Direct build against the existing Team Insights design. Refero's bundled
copywriting and craft references guide clear evidence labels, visible keyboard
focus and 44px player links. No Refero MCP is installed. Preserve green canvas,
existing type and surfaces, lime selected tabs/primary actions, existing borders
and spacing. Warning color identifies review reasons only. Lead with three
summary facts and two named review groups; keep supporting evidence readable
and measured results in three desktop columns or one mobile column. No new
imagery or unrelated visual system is introduced.

## Release

Reconciled base: GitHub main `eb434849ab17b14e3c9f53d810907358aac83714`,
website `6acbde38a912d2909dd0501a`, 1,946 protected files. This document describes
source behavior; confirmed publication and synthetic verification will be
recorded after the exact hosted artifact passes production acceptance.


The preparation guard detected a concurrent athlete rest-timer release:
`6acd37e9e903ac054286f910`, runtime `4fc717eaecf7ae71de823900aed47134821cf186`,
published October 12 at 12:48:08 PM PDT. Its source is integrated into this
branch. All 1,947 predecessor provider records other than the application and
provider metadata were independently preserved; four runtime assets are added.
The reconciled baseline protects 1,950 files. The coach release must preserve
this live timer flow, the already-confirmed catalog 1.0.96 and DRB-010 release
records, and the unchanged held-drill/native gates. Final main integration and
confirmed timer release records remain required before coach promotion.


Confirmed release: website `6acd3e31cae1c1af33af3d3e`, runtime `139162a04a1aa2afefda78c62bf2715d9667acbc`,
published October 12, 2026 at 1:10:21 PM PDT. The exact candidate and production
each passed 14 signed-in checks with eight captures at 360/390/430px and desktop.
All 1,968 artifact files match 1,969 provider records; 1,951 predecessor records
are exact and 16 runtime assets are added. The 1,966-file preservation baseline
passed the ordinary build. Source CI passed all six checks and 1,947 frontend
tests. Backend source `b6363eed692b3abba4f456de21277025e39dc927` is verified through the prescribed
nine-function publisher; all 121 unrelated functions remain unchanged.

Three owned Auth accounts, all owned/scoped active documents, active/current/
noncurrent Storage objects and email outboxes are absent after delayed separate
independently implemented readback. Temporary credentials are removed. Four
deleted synthetic JSON generations remain recoverable until October 19 under
the unchanged seven-day soft-delete policy; no retained-generation physical
erasure is claimed. No real athlete records or notification controls changed.
Read [the production evidence](../deployment/COACH_FOLLOW_UP_PRODUCTION.json)
and [PR #55](https://github.com/posetek/posetek_website/pull/55).
