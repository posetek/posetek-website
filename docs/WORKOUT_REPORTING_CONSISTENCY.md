# Workout reporting consistency

Administrator reporting counts saved personal, assigned and extra workout
completions in the selected date range, using the existing Insights qualification
and duplicate selection. Current-plan progress is a separate assigned-plan
measure covering fourteen days. Logged completion does not mean every prescribed
set was completed. The selected ending date and timezone determine period counts;
organization/team reports follow current membership and their displayed filters.

Saved history reads both workout log collections from the server, independently
of the personal-workout creation switch. Canonical mobile rules already allow
authorized staff to read these historical records. Denied or incomplete reads
remain errors. This does not enable generation, unpublished drafts or new access.

Workout history and reporting show minutes with at most one decimal place,
matching the existing notification precision. Valid `activeSeconds`, including
zero, supply timer duration. Without a valid timer, valid start/end timestamps
supply a labeled elapsed estimate, which can include pauses. Missing duration is
not zero. Estimated app use remains separate, and estimates are not combined with
timer totals. Previously sent email payloads and delivery evidence stay immutable.

Refresh activity updates an administrator player's summary and history together.
The selected Workouts panel checks saved completion counts and timer/estimate
totals against the asynchronous report projection. A new log or timer update can
arrive before the projection trigger. Mismatched summaries remain visibly updating
and receive bounded rereads; a persistent mismatch retains the prior summary with
a synchronization warning. Saved history never replaces the authoritative report.
Open player workout views check at most once per minute while visible. Reports
also check on a visible return after a minute; organization reports do not poll.
Only recognized transient reads and projection-rebuild control signals receive
five bounded attempts. Last successful evidence can remain visible, explicitly
marked stale, after a transient refresh failure. Account/scope changes, denials,
missing profiles and incompatible responses clear retained evidence. Private
evidence never crosses a selection or permission boundary.

The reference target is the current PoseTek admin summary, workout-history cards,
and Insights reports, using the Refero direct-build workflow and bundled craft
guidance. Existing graphs, signup actions, prescribing, recovery, feedback and
training gates retain their contracts. No endpoint, persisted athlete schema or
rule change is introduced. The server notification format already has the target
precision; it needs no release for this correction.

The bounded preimplementation sample contained three completion notifications and
two quiet-session notifications. Each matched its saved log and stored workout
projection. Quiet-session messages have no recorded ending and must not count as
completed workouts. This sample does not prove every historical email or identify
the user's unspecified case. Case identities and raw records remain private.

Hosted and production synthetic acceptance, confirmed publication, baseline
reconciliation and cleanup must be recorded before marking this release complete.
