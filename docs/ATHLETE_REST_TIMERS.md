# Athlete rest timer choices

Decision confirmed October 12, 2026: athletes may choose any whole-second timer
from **zero through the workout's current prescribed default**. Zero means no
timer. This changes the timer, not the catalog's recommended recovery or the
saved workout prescription. Catalog 1.0.96 and the DRB-010 draft/pending withdrawal
remain in force; see [the catalog handoff](DRILL_REST_UPDATE.md).

## Behavior

The workout player opens at the prescribed rest. **Choose rest time** exposes a
one-second slider, both range endpoints and the unchanged default. **Use default**
restores that value. Choosing zero prevents the next countdown and clears an
active countdown. Adjusting active recovery preserves time already rested;
extending a shortened countdown adds only the remaining recovery. An expired
timer never restarts just because the slider changes.

Rep-scoped drills expose separate between-rep and between-set controls using
their own prescription values. **Start rep rest** starts the optional manual
countdown; completing a set uses only the between-set choice. Choosing a shorter
rep timer does not shorten the set timer. Continuous timed/distance blocks retain
between-set semantics. Athlete choice is not represented as a researched zero
minimum or a change to the drill's training goal.

The main assigned/personal player stores choices in its existing local runtime,
scoped to Auth account, player, workout/log, plan and workout revision. Restore
accepts only current block IDs and valid bounded integer seconds, preserving an
explicit zero. Old runtimes without choices remain readable. Changing accounts,
workout/revision or completed-session state cannot carry a choice across that
boundary. Finishing removes runtime state through the existing lifecycle.
The older workout player supports the same controls within its mounted session.

While paused, the main player may change the frozen timer, but work and manual
rep-timer starts require Resume. Pain stops, saving, ended sessions, changed
accounts and a different owning tab retain their existing guards. Set progress,
workout snapshots, dose, duration estimates and server logs are not rewritten
by selecting a timer. Actual active duration still follows the existing clock.
Workout estimates continue to use prescribed rests. Athletes can take additional
recovery by waiting or pausing; the range endpoint is not a forced restart.

## Design and verification

The reference is the existing PoseTek player: workout cards provide placement,
the setup/age sliders provide interaction and lime value treatment, and the
current Pause/Resume controls provide state behavior. The Refero craft guidance
supplies visible keyboard focus and 44px touch targets. The range appears inside
the set card, with muted endpoint/default labels, separate scope legends and
`aria-valuetext` for zero. No new visual theme or generated media is introduced.

Six dedicated tests cover every selectable second, invalid inputs, independent
scopes, elapsed/frozen timer resizing, scoped runtime restore and accessible
rendered controls. All 1,946 frontend tests passed, alongside TypeScript, lint and
41 relevant release guards. Local compiled browser acceptance verifies default,
zero before/after a set, reset, active-countdown clearing, another drill's default,
an arbitrary 17-second choice and pause/resume. Responsive rendering is reviewed
against the existing player. Device lock-screen behavior remains unchanged.

## Release boundary

This source is prepared for the guarded website release. Use the exact committed
source, preserve current marketing/feedback/icons and every prior runtime asset,
verify a hosted draft, then promote that exact reviewed artifact. Production
publication and final hosted evidence belong in
`deployment/ATHLETE_REST_TIMERS_PRODUCTION.json` once verified. An ordinary Git
build or passing CI is not evidence that these controls are live.

No catalog, saved plans/logs, backend function, rules, gateway, indexes or native
schema/release changes are required. The optional local runtime fields are
browser-owned and are never written into Firebase or the shared mobile contract.
The whole-body content/device acceptance hold remains unchanged. Keep private
browser captures, inventory snapshots and verification credentials out of Git.
