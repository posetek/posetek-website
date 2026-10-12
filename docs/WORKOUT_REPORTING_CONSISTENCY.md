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

## Confirmed release

The exact candidate `6acbde38a912d2909dd0501a` was promoted to Posetek.net on
October 11, 2026 at 12:15:40 PM PDT, with runtime source `a4e8da1e00cabb17b21ef60924d77e98f0038731`.
[Production evidence](../deployment/WORKOUT_REPORTING_CONSISTENCY_PRODUCTION.json)
records 17 candidate and 17 production checks, seven captures per environment,
1,938 passing frontend tests, green hosted source CI, and the ordinary
1,946-file preservation build. All 1,948 artifact files match
1,949 provider records; 1,928 predecessor records remain exact.

Acceptance covered exact notification-log links, timing precision, duplicate
selection, incomplete prescribed sets, current-plan separation, a newly saved
completion, five-attempt outage recovery with stale evidence, keyboard retry,
refresh/history recovery, account/player changes and coach/athlete denials.
Responsive review covered 360/390/430px and desktop. Headless Edge does not
background pages when opening another tab: visibility acceptance explicitly
dispatched synthetic hidden/visible document events and is not a physical phone
backgrounding test. Pure refresh-clock tests additionally cover hidden/busy
states and coalescing.

A hosted check reproduced a new raw saved log arriving before its asynchronously
rebuilt summary. Selected admin Workouts now verifies qualified completion and
duration totals against the report before calling it current, preserving
authoritative server metrics and bounded retry behavior. No source evidence was
rewritten.

All 130 function versions and configurations remained unchanged. The first
operator hash comparison used raw JSON object order, which varied across API
reads. The corrected read-only check uses immutable versions, pre-run update
timestamps and recursively key-sorted configuration readbacks; notification
settings additionally use their pinned Firestore update timestamp. No IAM or
provider control was changed.

All three owned Auth accounts, three profiles, two teams, one organization, the
synthetic plan/logs, derived and scoped records, and the admin profile were
removed. A delayed separate operator read verified zero residue and no temporary
credentials; no email outboxes or storage objects were created. Real athlete
records and previously sent email payloads/delivery evidence were preserved.

PR [#48](https://github.com/posetek/posetek_website/pull/48) carries source and
confirmed records, preserving main `995f78e2148e4e9d5fc62c579db89be40dfefc94`. Advisory review
was local Codex review by the implementing assistant, not independent hosted
review. Paid reviewer activation and existing native/content/backend gates
remain separate; the final records revision must pass CI before merge.
