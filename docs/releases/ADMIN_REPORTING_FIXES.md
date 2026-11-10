# Admin reporting fixes and one-pager time on page — November 10, 2026

Deployment `6af39c12b5d6443ec57767ec` was published at `2026-11-10T22:40:04.431Z`, promoted without rebuilding from the verified draft. It ships four website PRs and their four backend PRs. [Production receipt](receipts/ADMIN_REPORTING_FIXES_PRODUCTION.json).

## Scope

- **"Last week" on the admin cards** (website [#142](https://github.com/posetek/posetek-website/pull/142), backend #133 and #140):
  - Weekly cards (Repeat users, Weekly users, Time on platform) compare the report week to date with the whole previous Monday–Sunday week. Before, they compared matching weekdays, so a Monday report described last week by its Monday alone.
  - Cumulative cards (Players tested, Accounts claimed, iOS downloads) compare with the total at the end of the previous week. Before, they compared with seven days earlier.
  - A part week shows "Week to date" and no change arrow. The Testing tab's wording names the whole previous week.
- **Workouts** (website [#146](https://github.com/posetek/posetek-website/pull/146), backend #139):
  - Sessions the iOS app keeps on the phone and syncs (repeats of a finished workout, yoga, runs, rides, walks) count as workouts, without a separate label.
  - A "Workouts by type" chart, and each player's latest and recent workouts include phone sessions.
  - The player page compares its saved logs with the report's saved-log totals, and the response check accepts a phone session as a latest workout.
- **One-pager tracking** (website [#141](https://github.com/posetek/posetek-website/pull/141), backend #132):
  - Reports sent, average time on page and accounts created through the Workouts button, as cards, table columns and lines on a new trend chart, per cohort.
  - The report page sends a time-on-page heartbeat. The notice on the page says so.
- **Web personal workouts** (website [#143](https://github.com/posetek/posetek-website/pull/143)): skipping a drill as "Too tired" or "No space or equipment" saves, and a session with a skipped drill can finish.

No rules, indexes, gateway, catalog data or native release. Held candidates on main remain held.

## Production state before this release

Live had moved three times since the cohort release `6af36239`, each a CLI production deploy from the report project (descriptions are from the deploy titles):

1. `6af36446`, 18:36Z: simplified reports for the 33 existing and 13 new recipients.
2. `6af3659f`, 18:42Z: the "Get PoseTek on iPhone" label in all 46 reports.
3. `6af3761aade8874285185c3a`, 19:53Z: the November 9 broad jump correction.

`6af3761a` is the immediate predecessor and the rollback target. Its `/report/render.mjs` and `/report/report.css` are newer than this repository's copies and equal draft PR #140's branch. Its `/report/loader.mjs`, `index.html` and `crypto.mjs` equalled the repository's files before PR #141. Its `/application.html` was still the cohort release's application.

**Shipping the repository's `render.mjs` would have reverted the report project's live changes.** This release took the live file and changed one sentence in it.

## Runtime composition

Main's `app/` differs from the live runtime in held work, so main was not shipped. `runtime/admin-reporting-fixes` starts from the accepted runtime `691db60` (`runtime/one-pager-cohorts`):

1. `c024b6a`: PR #141's `app/` changes (merge `22c57d6`).
2. `f3e9e89`: PR #143's `app/` changes (merge `645ece5`).
3. `ee0f137`: PR #146's `app/` changes (merge `cb87a1c`).
4. `f1c8038`: PR #142's `app/` changes (merge `c36e380`).
5. `e0cc95d`: the baseline reconciled to live `6af3761a`. The artifact was built from this commit.
6. `cb70512`: the baseline reconciled to `6af39c12`.

Of the 34 `app/` paths the PRs changed, 32 are byte-identical to main. The two that differ are test-only: `app/scripts/admin-lightning-fixture.mjs` keeps the runtime's version, and `app/src/pages/admin/lib/playerWorkoutConsistency.test.ts` was merged onto the runtime's differing copy. The PRs' `docs/` and root `scripts/` paths do not exist on the runtime.

## Exact artifact

Built with `node scripts/build-astro-release.mjs --preserve-marketing <manifest> --preserve-isolated-entries`. The builder treats the report reader as protected files, so `/report/loader.mjs` and `/report/render.mjs` were then overwritten in the output as described below. 51 legacy HTML pages are rewritten when served; their originals were fetched raw from the provider API and matched the provider's recorded hash and size.

- 2,776 artifact files match 2,777 provider records.
- 2,758 prior files are byte-identical. None was removed.
- Three files changed:
  - `/application.html` (`1d4d7766`), the rebuilt application.
  - `/report/loader.mjs` (`99341ffb`), equal to main.
  - `/report/render.mjs` (`139dedfb`), the predecessor's live file with the tracking notice sentence changed and nothing else.
- 15 hashed application assets were added under `/_astro/`. The new application references 45 assets and none is missing.
- `/report/report.css`, every report data file, the marketing pages, `/player-signin.html`, feedback and coach enrollment are exact.
- All 13 headers and 12 redirects are identical to the predecessor, in order. Stored configuration differs only in non-serving build metadata.
- No local path appears in any changed or added file.
- Artifact manifest SHA-256: `03908f8a8874317e6ae35f0a1fbcb7716c7905cb067b2730635210a3d6f197f5`.

## Backend

Published from `posetek/posetek-backend` main at `d96edbe`, each with its scoped package, a read-only capture of the live Functions first, and byte-for-byte verification afterwards.

| Package | When | Functions | Change against the live before-image |
|---|---|---|---|
| `functions:one-pager-tracking` | 22:28Z, before the website | `recordOnePagerEngagement` and `getOnePagerEngagement`, version 2 → 3 | `one-pager-tracking.js` only |
| `functions:expanded-insights` | 22:42Z, after the website | `getClubInsightsV2` 13 → 14, `getCoachPlayerComparison` 7 → 8, `recordInsightUsage` 9 → 10, six `projectInsight*` triggers 10 → 11 | `insights-v2.js`, `insights-admin-metrics.js`, `insights-admin-reporting.js`, and `testing-events.js` |

The `testing-events.js` change is backend PR #130's `athleteStart` flag inside `createTestingEvent`. This package does not export that function; it imports only `effectiveStations` and `STATIONS`.

The order mattered. The earlier website drew a change arrow for any available card and compared saved logs with the combined workout totals, so the reporting package had to follow the website. The one-pager package could go first because the earlier website ignored its new fields.

Hosted CI did not start on the backend repository (GitHub billing). The owner instructed on November 10 that all of this work be merged and deployed. Merging and publishing used the local lanes and a real-data validation; hosted backend CI is not recorded as passed.

## Verification

- **Source:** hosted `ci` passed on all four website PRs. Backend: Functions suite 1,482 passed with five dependency-bound files not run and four skipped; policy lane 125 OK; migration source and client contract checks pass.
- **Real data:** before release, the reporting code ran on a read-only in-memory copy of production through this website's own response checks. Every admin view (Overview, Testing, Workouts, Usage; one club and all organizations; every page) was accepted: 8 of 8.
- **Runtime at `e0cc95d`:** TypeScript, 2,303 frontend tests in 208 files, lint and the build.
- **Draft:**
  - exact inventory and configuration proof;
  - 23 of 23 HTTP checks against the predecessor's permalink with equal status and header sets;
  - 16 of 16 signed-out route loads in Chromium and WebKit;
  - with a synthetic tracked report served from the artifact's reader files, the report rendered with the live `render.mjs` and sent `opened` and then two 15-second `viewing` events in 31 seconds. The predecessor's reader sent `opened` only.
- **Live:**
  - the inventory equals the draft;
  - `/application.html` and the five reader files serve the new bytes;
  - `/`, `/signin`, `/player-signin.html`, `/feedback`, `/admin/accounts`, `/athlete` and `/report/` return 200;
  - 12 of 12 signed-out route loads in Chromium and WebKit;
  - the tracking endpoint answers 204 to an `opened` and to a `viewing` event carrying an unregistered token, and 400 to a malformed `viewing` event.
- **Functions:** both packages passed their verifier: deployed source bytes, definitions, IAM and every unrelated Function unchanged.

Not claimed:

- Signed-in acceptance of the hosted site or of the published Functions. No signed-in call had reached them when this record was written.
- Real-device behaviour of the report page.
- Independent review of the late changes: the cohort merge, send times, accounts from the Workouts button, workout types, per-player phone sessions and the cumulative cutoff.
- The Svelte check, root tooling tests and browser smoke on the runtime branch.

## Baseline and recovery

The reconciled baseline protects 2,774 files with all 37 recovery mappings. Keep `[skip netlify]` on every source and receipt merge: Netlify Git builds on main are enabled and publish to production.

Recovery, in this order:

1. Compare fresh serving state.
2. Restore the reporting Functions from their retained before-images, so the earlier website is not left reading the new report shape. The before-images, inventories and IAM captures are retained privately with the release operator, not in Git.
3. Restore `6af3761aade8874285185c3a` with `netlify api restoreSiteDeploy` and that deploy id. That restores the previous application and reader and keeps the report project's content.
4. The one-pager Functions can stay: the earlier website ignores their new fields.

A source revert alone does not republish.

## Follow-ups

1. **The report project can silently undo time on page.** It deploys the reader from its own source (draft PR #140). Its next production deploy overwrites `/report/loader.mjs` and `/report/render.mjs` unless that source merges main first. Time on page would then stop being collected with no error.
2. **Phone sessions need AI-sharing consent to reach the server.** Sessions from players without it are still not counted. Closing that needs an app change and a decision about uploading session records without that consent.
3. **Cumulative Time on platform** (backend PR #102, website PR #131) needs the adjustment described in backend PR #140 before it merges.
