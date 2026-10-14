# Coach overview: measured progress

Published October 14, 2026 at 8:54:55 AM PDT as
`6acfa49a07f33b1d9fb64abf`, from the exact accepted hosted candidate.
[Production evidence](../deployment/COACH_MEASURED_PROGRESS_PRODUCTION.json)
records website and scoped backend verification. This extends the
[coach follow-up contract](COACH_FOLLOW_UP.md). Runtime source:
`57e9e03e139a287accfad7889d96747b3ad6ecc3` on `codex/coach-overview-runtime`.
Coach feature source `81e8959c81493a7e1d3f8516c8c113868e95aa7e` was merged
in [PR #58](https://github.com/posetek/posetek_website/pull/58). The runtime branch
preserves approved privacy/support source and must not be merged into main,
which retains the held policy candidate.

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

- Frontend: 1,960 passing feature-branch tests; final Insights rerun: 123 passing.
  The final runtime freeze passes all 1,957 tests with the approved policy tests.
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

Live release verification:

- Feature-source, merged-main and final runtime CI each passed all six checks. The scoped publisher
  passed 24 packaging tests; 94 relevant backend tests passed with three existing
  optional private-fixture skips. A stale package-count assertion was corrected
  for the already-included account-deletion dependency; the bundle has sixteen
  immutable source files plus `.firebaseignore`.
- All nine Expanded Insights functions are ACTIVE and verified against their
  prepared source, module closure, runtime/trigger definitions and IAM. All 126
  unrelated regional functions remain unchanged.
- Twenty-five deployed API checks reconcile owned measured source records with
  summary and individual-player responses, including mixed/unchanged/first/missing
  results, older comparisons, workout types, filters, search, pagination, refresh,
  admin/manager/assigned/independent access and stranger/revocation denials.
- Hosted candidate and production passed 17 and 16 browser checks, including normal staff sign-in,
  each with eight desktop/360/390/430px captures and no page exceptions. Displayed
  values, dates and changes match the authorized response. Missing-evidence UI
  was checked by withholding the additive field from an owned candidate response.
- The final 1,984-file artifact matches 1,985 provider records; 1,981
  immediate-predecessor records remain exact and two runtime assets are added.
  The reconciled baseline preserves 1,982 files and passes the ordinary build. Marketing,
  feedback, coach enrollment, icons, effective headers and redirects are preserved.

The initial deployment `6acfa10dafea94f1a0142d54` at 8:40:47 AM PDT also
activated held privacy/support policy source from main. The final source audit
caught this, and the corrected artifact above was published at 8:54:55 AM PDT.
Privacy/support source now matches approved runtime `139162a04a1aa2afefda78c62bf2715d9667acbc`
exactly, and candidate/production browser text matches the previously approved
`6ace0ad29778ccacfb979dda` pages. Held source stays intact on main. Historical
immutable chunks remain in the preservation inventory but are not used by the
current policy routes. Before any future application composition, check held
source against the intended runtime; a main merge does not authorize every
pending application feature.

Netlify Git publishing is enabled. Source and receipt commits use `[skip netlify]`;
ordinary builds preserve the released app and are not application releases. The
canonical guarded builder and composer were used. Original coach-enrollment and
feedback documents were supplied from the verified predecessor artifact during
composition, avoiding an unrelated entry regeneration.

The exact accepted candidate was promoted without rebuilding. The scoped backend
was published first. No rules, indexes, gateway, catalog, native release, stored
athlete-data migration or new endpoint is included. Native/content holds remain.
Across both verification runs, ten Auth accounts, twenty-eight players, two
organizations, four teams and 84 current/noncurrent JSON objects were removed.
Owned records are absent after delayed independent readback for each run;
see the production receipt for retained synthetic objects under the unchanged
bucket soft-delete policy. No real athlete data or notification control changed.
Future releases retain these canonical publishers and their scoped recovery
procedures. Older frontends remain compatible with the additive response.
