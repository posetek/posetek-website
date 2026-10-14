# Coach overview: measured progress

Source implementation, October 14, 2026. This extends the released
[coach follow-up contract](COACH_FOLLOW_UP.md); it does not record a production
publication. Base: `077dfc3d7a562bdbde899ec3370220e00c7ffe72`.

## Behavior

The coach Team snapshot has three selectors:

- **Players improving:** at least one measured gain and no measured decline
  across the player's comparable tests. The supporting count includes all
  players with comparable results, including unchanged results.
- **No completed workouts:** zero saved personal, assigned or extra workout
  completions in the selected reporting period.
- **Results to review:** at least one measured decline. Players with both gains
  and declines appear here as **Mixed results**, with both sides visible.

Testing uses each test's latest two qualified local dates through the selected
end date, regardless of the selected start date or testing-coverage toggle.
The heading says **Latest known results · through [date]**. Previous/current
values, dates, metric names, units and direction-specific changes remain visible.
Daily best values, existing metric direction/precision and duplicate exclusion
are preserved. First tests and missing/incomparable measurements do not imply
change. Failed, undated and future observations cannot contribute.

The initial selection is review when present, then improvement, then workout
gaps. Explicit selection and expanded player lists survive refresh. Changing
account/team resets the selection. Five players are shown initially; Show all
exposes the complete selected group. Player links retain the report context.
Calculation details live in a native, keyboard-accessible disclosure.

## Additive response

`getClubInsightsV2` adds optional `overview.coachTesting`:

```ts
{
  version: 1,
  asOfDate: string,             // selected local comparison cutoff, inclusive
  comparablePlayers: number,
  improvingPlayers: CoachTestingPlayer[],
  reviewPlayers: CoachTestingPlayer[]
}
// CoachTestingPlayer:
// { id, name, status: "up" | "down" | "mixed", measuredTests }
```

`measuredTests` reuses existing `performance.coachFocus` comparisons, retaining
all comparable metrics (including unchanged metrics). Groups are alphabetically
ordered, with player ID as tie-breaker. The server aggregates the complete
currently authorized, reporting-included, filtered roster before name search or
pagination. It reuses existing qualified projections without adding per-player
reads. Account/scope rechecks, projection refresh, retries and stale warnings
remain intact. All older response fields remain intact for installed clients.

A missing/unsupported new evidence version displays **Unavailable**. The client
does not substitute a roster page, an observed zero or legacy D1 scores. Workout
gaps continue to use the existing `overview.coachFocus` v1 contract. Synthetic
preview trends now come from actual sample measurements, independently of its
legacy D1 fixtures.

## Visual scope and preview

Uses the existing Team Insights design plus Refero typography/color/copy guidance
and Astra's redesign workflow. No live Refero connector was available. Inter,
dark green surfaces and restrained borders remain; lime marks selection/actions,
green marks gains, and amber marks review. Numbers are 36px desktop/32px mobile.
Coach controls and navigation receive consistent spacing and 44px targets.
Overview-only styles remove blanket amber roster backgrounds. Administrator and
manager styles and other tab layouts retain their existing scope.

From the isolated checkout:

```sh
npm --prefix app run dev:astro -- --host 127.0.0.1 --port 4320
# Open http://127.0.0.1:4320/insights?preview=1&orgId=northfield&teamId=harbor
POSETEK_PREVIEW_URL=http://127.0.0.1:4320 node --test scripts/coach-overview-browser.mjs
```

Preview states include unavailable testing, empty roster and long names.
This is a DEV-only synthetic preview. It makes no authenticated requests.
Set `POSETEK_CAPTURE_DIR` to a local directory to save desktop/phone screenshots;
keep these captures, generated builds and dependencies out of Git.

## Verification and release boundary

Local verification:

- Frontend: 1,960 passing tests; final Insights rerun: 123 passing.
- Functions/tooling: 1,255 passing, three existing private-fixture skips;
  the additional scope/exclusion/ownership regression passes with the final
  19-test coach-workspace suite.
- Additional legacy/mobile-artifact/static-transport tests: 20 passing.
- Policy: 40 passing. Dependency exception checks: zero blocking findings
  (existing advisory paths remain: app 4, functions 27, legacy 31).
- TypeScript/Astro and marketing builds pass. Svelte: zero errors/warnings.
  Oxlint passes with existing repository warnings.
- Compiled guest browser smoke: seven passing. Synthetic coach browser checks:
  seven passing, including 1440/360/390/430px, keyboard, long names, all-player
  expansion, refresh/search, missing evidence and role isolation.
- Browser-displayed synthetic values/dates/changes match the source fixture
  response. Mocked qualified-rep service responses are also checked against
  source measurements, filtered populations and ownership changes.

GitHub has an active Netlify push/PR webhook; treat Git publishing as enabled.
Only the isolated review branch is pushed. An automatic ordinary Netlify preview
preserves the released app and is not acceptance evidence for this new UI.

Release remains separate: use the scoped nine-function Expanded Insights
publisher and the reviewed website artifact workflow, then verify displayed
measurements against authorized deployed responses on the exact candidate.
No production acceptance, live-athlete validation, rules/index changes, stored
data migration, new endpoint or production publication is claimed here. Preserve
marketing, feedback, icons, native/content holds and unrelated functions. Older
frontends remain compatible with the additive backend; deploying the frontend
first shows Unavailable until the backend contract is available. Rollback uses
the prior reviewed website artifact and the publisher's scoped recovery process.
