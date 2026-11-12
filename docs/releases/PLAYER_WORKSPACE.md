# Athlete workspace — November 12, 2026

Deployment `6af598a062c763422296510e` was published at `2026-11-12T10:56:25.482Z`, promoted without rebuilding from the verified draft. It ships the athlete workspace: the app's four tabs (Home, Coach, Workouts, Stats) on the web, with the redesigned Stats page. [Production receipt](receipts/PLAYER_WORKSPACE_PRODUCTION.json).

The founder instructed on November 12 that this work be merged and deployed, that held items stay out, and that reviewed results may be removed.

## Scope

- **Four tabs** (website [#148](https://github.com/posetek/posetek-website/pull/148)): Home, Coach, Workouts and Stats replace the earlier athlete pages. Staff open the same workspace for an athlete from the "Player view" link.
- **Stats** (#148, [#149](https://github.com/posetek/posetek-website/pull/149)):
  - skill radar, score cards, a pose player for the selected test, and "So what do I do with these results?" with three buttons: Ask the AI Coach, Build my 6-week plan, Start a workout now;
  - a club comparison chart read from one precomputed document, `benchmarks/club-<organizationId>`: sprint as speed at 5 m, shuttle and dribbling as course speed, jumps unchanged. It appears only for a club that has the document (Vacaville United today).
- **Workouts** (#149): a one-page hub. Build Workout is one card on the app's connections (`workout_chat`, then `apply_workout_draft`); plan setup is the app's one form (`generate_training_plan`). An athlete with no plan gets plan setup first, as in the app.
- **Replays** ([#150](https://github.com/posetek/posetek-website/pull/150)): the "This result changed…" message is never shown; the replay loads.
- **Plan setup** ([#151](https://github.com/posetek/posetek-website/pull/151)): a request refused because AI sharing is off shows "Turn on AI sharing to build your plan." with the AI sharing choice, instead of a raw permission error.
- **Home** ([#152](https://github.com/posetek/posetek-website/pull/152)): staff see "<name>’s week" with the athlete's name.
- **Coach memory:** opens again. The released line sent memory commands with a blank message, which the gateway answers with 400. This release takes main's fix (`2a51913`, October 28, and the memory-only context that followed).

**Removed, on the founder's decision:** the "Your reviewed tests — Estimates and retests" card and the per-rep estimate and retest entries in the athlete portal. The Stats report and Home still show an estimate or a retest where `getAthleteTestReport` returns one, for the report's test day only.

No rules, indexes, gateway, catalog data or native release.

## Not shipped

Held work on main stays out: the repository's report reader (`render.mjs`, `report.css`), privacy and support copy, Ball Striking admin, cumulative platform time (#131), Yoga library admin, the jump review admin routes (#109) and the shared AI chat transport. A scan of the 45 new or changed files finds no marker of any of them, apart from the coach memory wording named above.

The athlete portal equals main `c523d2b` except:

- `player/gateway.ts`, `player/ai-sharing.ts`, `views/AiCoachView.tsx` and their tests keep the released AI transport;
- one test expectation in `CoachChat.test.tsx` (the released transport sends no request id);
- `views/LeaderboardsView.tsx` keeps the released "Best recorded result" wording.

## Production state before this release

Live had moved four times since `6af39c12` (the November 10 release), each a CLI production deploy of one-pager reports: `6af4f63d`, `6af4fac3`, `6af4fe22` and `6af5027b28714c6f1147b4ec` (November 12, 00:05Z). They added 25 report data files and changed `/report/render.mjs` and `/report/report.css`; `/application.html` was unchanged. `6af5027b` is the immediate predecessor and the rollback target. This release carries every one of its files forward unchanged, including the live report reader.

## Runtime composition

`runtime/player-workspace` starts from the accepted runtime `cb70512` (`runtime/admin-reporting-fixes`):

1. `9e01d96`: reviewed results removed.
2. `2453964`: PR #148's `app/` changes (merge `737e729`).
3. `3d20634`: PR #149's `app/` changes (merge `8ef96dc`).
4. `82e4b0c`: the baseline reconciled to live `6af5027b`.
5. `8f82667`: PR #150's change (merge `97a0764`).
6. `f8a37d4`: PR #151's change (merge `1f93ad9`).
7. `c866ac7`: main's `CoachChat.tsx` (the coach memory envelope).
8. `c86fb8f`: PR #152's change (merge `c523d2b`). The artifact was built from this commit.
9. `0f23d6f`: the baseline reconciled to `6af598a0`.

Shared files outside the athlete portal that the release changes, none carrying held behaviour: `lib/insight-usage/clock.ts` (the new tabs map to the existing usage features), `pages/feed/FeedPage.jsx`, `pages/home/pose-demo.ts` and `use-pose-demo.ts` (optional inputs for the Stats pose player; the homepage demo is unchanged without them), `pages/admin/views/PersonalizedPrograms.tsx` (two optional props), `lib/result-values.ts`, `pages/drill-share/drill-data.ts`, and `lib/reviewed-results*` (deleted).

## Exact artifact

Built with `node scripts/build-astro-release.mjs --preserve-marketing <manifest> --preserve-isolated-entries`.

- 2,845 artifact files match 2,846 provider records.
- 2,800 prior files are byte-identical. None was removed.
- One file changed: `/application.html` (`ef790d03`), the rebuilt application.
- 44 hashed assets were added under `/_astro/`. The new application references 48 assets and none is missing. About 25 of the 44 are admin chunks that the bundler re-split; admin source is unchanged apart from `PersonalizedPrograms.tsx`.
- The marketing pages, `/player-signin.html`, feedback, coach enrollment, every report data file and the live report reader are exact.
- All 13 headers and 12 redirects are identical to the predecessor, in order. Stored configuration differs only in `build.publish`.
- No local path appears in any changed or added file.
- Artifact manifest SHA-256: `1d34b9c216de512868da483128ed0f2e7be7cf13ba470e53dd4fc38e5d0841f6`.

## Backend this release reads

| What | State |
|---|---|
| `getAthleteTestReport` | Version 2 since November 12, 09:14Z (the station sprint fix; backend [#159](https://github.com/posetek/posetek-backend/pull/159) records it). |
| `benchmarks/club-vacaville-united-soccer-club` and `clubTestResults/*` | Written November 12, 08:27Z and 08:43Z by the owner. Any signed-in account can read the statistics document; the per-athlete documents are not client-readable. |
| `getAthleteRepMedia` | Still version 2 (September 17). **Athletes get no sprint, shuttle or dribbling replay until main's version is deployed**; staff get one through a Storage fallback. The one-function release package is merged (backend [#160](https://github.com/posetek/posetek-backend/pull/160)) and not yet run. |
| `getAthleteTestComparison`, `getClubTestComparison` | Not deployed. The team median and split averages in the Stats pose player are staff-only. |

## Verification

- **Source:** hosted `ci` passed on #148 to #152. Runtime at `c86fb8f`: TypeScript, the frontend test suite, lint, the Svelte check, the static Firestore transport check and the release build.
- **Built artifact, served locally:**
  - admin walk, 64 of 64 checks: the three Stats buttons, plan page, plan setup, workout card, back and reload, at phone and desktop size, for three Vacaville athletes and the sample;
  - the same walk as the synthetic demo athlete signed in to their own workspace, 16 of 16;
  - Coach memory lists saved memories (gateway 200);
  - plan setup with AI sharing off shows the prompt and the choice, with no request created.
- **Draft `6af598a0`:**
  - exact inventory and configuration proof;
  - 134 of 134 HTTP checks against the predecessor's permalink, with equal status and header sets;
  - 28 of 28 signed-out route loads in Chromium and WebKit;
  - admin walk 64 of 64, demo athlete walk 16 of 16, 12 of 12 staff pages as admin.
- **Live:**
  - the published deploy is the draft; `/application.html` and all 44 added assets serve the artifact's bytes; the report reader and both served marketing pages are unchanged;
  - 28 of 28 signed-out route loads in Chromium and WebKit;
  - demo athlete: walk 16 of 16, all four tabs with no error, Coach memory opens;
  - admin: walk 64 of 64, 12 of 12 staff pages.
- **Rules:** a signed-in athlete account in another club reads `benchmarks/club-vacaville-united-soccer-club` (200) and is refused `clubTestResults` (403).

Every signed-in check was read-only. Nothing was typed, sent, saved, started or generated, and "Allow AI sharing" was not pressed.

Not claimed:

- A real athlete's session. The athlete checks used the synthetic demo athlete, whose club has no comparison document, so the club chart has been seen only by staff accounts.
- Sending a coach message, building a workout or a plan, or saving an AI sharing choice on the hosted site.
- A coach or manager account.
- Real-device behaviour.
- The npm dependency audit and the root tooling tests on the final runtime commit (the tooling tests passed at `82e4b0c`; the scripts did not change after it).

Observed and left as is:

- A built site files an automatic error report whenever a request is cut off by a reload or navigation (`functions/internal`, status 0). The earlier site did the same. The first artifact walk filed four such reports under the admin test account before the walk was changed to hold them back.
- The AI gateway refuses draft origins, so Coach chat and memory cannot be exercised on a draft address.
- Run in parallel, the admin walk drew three 403 responses from the draft host, each followed by a successful reload; run one lane at a time there were none.

## Baseline and recovery

The reconciled baseline protects 2,843 files with all 37 recovery mappings. Keep `[skip netlify]` on every source and receipt merge.

Recovery: compare fresh serving state, then restore `6af5027b28714c6f1147b4ec` with `netlify api restoreSiteDeploy` and that deploy id. That restores the previous application and keeps every report. A source revert alone does not republish.

## Follow-ups

1. **The next one-pager deploy can silently undo this release.** Those deploys upload a full copy of the site. Unless that copy starts from `6af598a0`, it puts the earlier `/application.html` back with no error. Whoever publishes the next batch must start from the new live deploy.
2. **Deploy `getAthleteRepMedia`** with the `deployments/testing-results-media` package (backend), so athletes get sprint, shuttle and dribbling replays.
3. **Automatic error reports for cut-off requests** should be dropped at the source (`lib/user-issues.ts`); the new report call takes 5 to 8 seconds, so more of them will be cut off.
4. **Club comparison data** exists for one club. The builder that wrote it is not in a repository, and `clubTestResults` has no client rule.
5. **Released and main AI transports still differ.** Releasing main's shared transport would remove the last athlete-portal differences listed above.
6. **Account button initials** read the record's `name` field, which player records do not carry, so the button shows the person icon.
