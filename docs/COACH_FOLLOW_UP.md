# Coach follow-up

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
