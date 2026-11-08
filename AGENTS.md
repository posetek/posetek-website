# PoseTek website context

## Website checkout and local validation policy

Start sessions in the primary checkout read-only; opening a session or checking
status must not acquire or reserve the primary. Preserve existing live claims.
An authorized primary mutation requires atomic acquisition when free and exact
current-session live ownership before the action.

Use an isolated feature worktree for website development. Worktree-local
dependency setup, tests, lint, typechecks, builds, localhost servers and isolated
browser tests are allowed without the primary claim. Keep mutable dependencies,
caches and outputs isolated from other checkouts, use verified development
storage under machine-local policy, and choose nonconflicting ports. Localhost
access does not authorize production writes. Native build/simulator restrictions,
PR requirements and release/deployment holds remain unchanged. Runtime tool
approval is separate from this policy; report exact tool rejections and never
switch wrappers to bypass them. See [the local lane](docs/engineering/WORKFLOW.md#website-worktree-local-lane).

## Database-first catalog compatibility release — November 7, 2026

Deployment `6aeffb31ae4da62a62fc6356` was published at
`2026-11-08T04:34:35.550Z` from runtime `dbb380f` on
`runtime/catalog-db-first-compat`. That runtime is accepted runtime `51106ec`
plus PR #134's six commits. The admin drill editor follows the catalog validation
gate and refuses stale saves. The workout picker is uncapped. Coaches see published
drills only, and the athlete workout player shows the v2 how-to.

It preserves the prior live deploy `6aeff48b` byte for byte. That deploy is Dylan
Keller's November cohort reports, including `/player-signin.html` and its `/signin`
rewrite and headers. All 2,697 artifact files match 2,698 provider records; only
`/application.html` changed, with 20 hashed assets added. The reconciled baseline
protects 2,695 files with all 37 recovery mappings. Signed-in hosted acceptance is
not claimed.
[Release handoff](docs/releases/CATALOG_DB_FIRST_COMPAT_RELEASE.md) ·
[Production receipt](docs/releases/receipts/CATALOG_DB_FIRST_COMPAT_PRODUCTION.json)

The #134 merge lacked `[skip netlify]` and auto-published Git build `6aefe7d5`.
That build rebuilt the marketing pages, with only the astro-island uid changing.
**Every merge to main must carry `[skip netlify]`.** No backend, rules, indexes,
gateway, catalog data or native release. Held candidates and report outreach remain held.

## Admin result validation release — November 6, 2026

Deployment `6aedefb93ea542305e9f49da` was published at
`2026-11-06T15:22:23.567Z` from runtime `e4c6403` on `runtime/result-validation`.
It adds **Review tools → Result validation**: validate, adjust or flag each rep in a
testing session, with reviewer notes, undo, per-drill evidence, focus mode and the
organization age curve. Saved tracking playback (PR #128) ships with it.

All 2,603 artifact files match 2,604 provider records; only `/application.html`
changed, with 20 hashed assets added. Marketing, feedback, coach enrollment and
private reports remain exact. The reconciled baseline protects 2,601 files with all
37 recovery mappings. Signed-in hosted acceptance is not claimed.
[Release handoff](docs/releases/RESULT_VALIDATION_RELEASE.md) ·
[Production receipt](docs/releases/receipts/RESULT_VALIDATION_PRODUCTION.json)

Website PR #132 is merged. No backend, rules, indexes, gateway, catalog or native
release. Keep `[skip netlify]` on source/receipt integration; held candidates and
report outreach remain held.

## Admin reporting refresh release — November 5, 2026

Deployment `6aecbf94751cf215f811865f` was published at
`2026-11-05T19:06:24.045Z` with runtime `bc6ed7c` and
`getClubInsightsV2` version 12. Organization reports now show six comparison
cards, age-by-drill Testing, station analytics and daily usage lines. Shared
summaries persist across tab transitions; player tables finish Workouts and Usage.

Candidate and live signed-in Chromium/WebKit checks passed, as did all 27 deployed
API assertions. All 2,583 artifact files match 2,584 provider records. The
reconciled baseline protects 2,581 files and retains all 37 recovery mappings.
[Release handoff](docs/releases/ADMIN_REPORTING_REFRESH.md) ·
[Production receipt](docs/releases/receipts/ADMIN_REPORTING_REFRESH_PRODUCTION.json)

Website PR #127 and Backend PR #94 are merged. Backend hosted CI remained blocked
by billing; the owner authorized a one-release exception backed by seven passing
local lanes. Website hosted CI passed. New workout funnel wiring/UI remains a
[separate follow-up](docs/features/WORKOUT_REPORTING_FUNNEL_HANDOFF.md). Keep
`[skip netlify]` on source/receipt integration; held candidates and outreach remain held.

## Admin tab persistence release — November 5, 2026

Deployment `6aec430f45bc0d0841566ba7` was published at
`2026-11-05T09:00:17.782Z` with runtime `6ea75c7`. People & organizations
offers only current numeric-version-2 organizations and reuses fresh scoped
context, roster and exact report responses across tab roundtrips for up to
60 seconds. Refresh, expiry and Auth/scope boundaries invalidate reuse.
The reconciled baseline protects 2,568 files with all 37 recovery mappings.
[Release handoff](docs/releases/ADMIN_TAB_PERSISTENCE.md) ·
[Production receipt](docs/releases/receipts/ADMIN_TAB_PERSISTENCE_PRODUCTION.json)

Source [PR #124](https://github.com/posetek/posetek-website/pull/124) and
[PR #125](https://github.com/posetek/posetek-website/pull/125) are merged. Only
`application.html` changed among prior served files; 17 hashed assets were added.
Marketing, feedback, coach enrollment and all six private-report files remain exact.

The [broader backend plan](docs/engineering/ADMIN_REPORT_EFFICIENCY_PLAN.md)
remains proposed. Held policy, session and Ball Striking candidates and report
outreach remain held. Keep `[skip netlify]` on source/receipt integration.

Earlier entries are historical release records.

## Admin Usage release — November 4, 2026

Deployment `6aeb76624e362b0c48f30421` is live with runtime `6d105a7` and `getClubInsightsV2` version 11. Admin Usage shows each displayed player's last observed feature and its 15-minute activity window. The baseline protects 2,551 files and retains 37 recovery mappings. [Release handoff](docs/releases/ADMIN_LAST_OBSERVED_FEATURE.md) · [Production receipt](docs/releases/receipts/ADMIN_LAST_OBSERVED_FEATURE_PRODUCTION.json)

Earlier entries are historical release records.

## Safari marketing link activation release — November 3, 2026

Exact deployment `6aea6ecaca4a6743660ac238` is live. Animated public labels now
leave pointer activation to their enclosing controls, restoring first-click Sign in
navigation in WebKit while preserving native destinations and keyboard behavior.
PR #118 is merged as `f9cf233`; source integration used `[skip netlify]`.

All 2,544 artifact files match 2,545 provider records. Every prior protected file
remains exact; the reconciled baseline protects 2,542 files and retains all 37
local recovery mappings. Application runtime `c33a9c8`, feedback, coach enrollment
and private reports remain unchanged. Held application candidates and report
outreach remain held. Keep `[skip netlify]` on source/receipt integration.

Read [the release handoff](docs/releases/HOMEPAGE_LINK_ACTIVATION.md) and
[production receipt](docs/releases/receipts/HOMEPAGE_LINK_ACTIVATION_PRODUCTION.json) for exact-artifact, browser and recovery evidence.
Earlier release sections are historical.

## Private parent report review release — November 3, 2026

Exact deployment `6aea5e0ceb047cc53ae49efc` is live for private review. One encrypted
phone report adds a team chart, sample practice, PDF download and an exact-athlete
HTTPS Workouts button. The prior Revamp application and all 2,466 served files
remain exact; only six report files and dedicated routing/privacy headers were added.
The reconciled baseline protects 2,470 files.

All parent/coach report texts stay held after merge, deployment and review; fresh
explicit send authorization is required. Native app opening remains pending.
Keep `[skip netlify]` on source/receipt integration and preserve approved runtime
`c33a9c8`; held main candidates remain excluded. Read [the release handoff](docs/releases/PRIVATE_PARENT_REPORTS.md)
and [production receipt](docs/releases/receipts/PRIVATE_PARENT_REPORTS_PRODUCTION.json)
for access limits and verification. Earlier release sections are historical.


## Admin activity reporting release — November 3, 2026

Exact deployment `6aea3d1459da561c7113e606` is live. Admin organization/team
reporting now keeps the selected scope visible and provides distinct Overview,
Teams, Workouts, Usage and Testing evidence. Only Backend `getClubInsightsV2`
was updated (version 10); existing admin/manager/coach reporting remains compatible.

All 2,466 artifact files match 2,467 provider records. The reconciled baseline
protects 2,464 files. Players, Coaches, feedback, coach enrollment and prior assets
remain exact. Runtime `c33a9c8` extends approved `f4ce1a8`; it is separate from
source main. Held policy, session and Ball Striking candidates remain excluded.
Keep `[skip netlify]` on source and receipt integration.

Read [the release handoff](docs/releases/ADMIN_ACTIVITY_REPORTING.md) and [the production receipt](docs/releases/receipts/ADMIN_ACTIVITY_REPORTING_PRODUCTION.json) for exact artifacts, verification,
measurement limits and cleanup. Earlier release sections are historical.

## Current planner preview context guard release — November 1, 2026

Exact deployment `6ae7cb8d2a05c4dbbbd9b7e5` is live. **Preview priorities** now
requires the same completed training context as generation, with visible guidance
when schedule or equipment confirmation is missing. Candidate and production
signed-in synthetic assessments completed; no real player profile or plan changed.

All 2,436 artifact files match 2,437 provider records. The reconciled baseline
protects 2,434 files and passes the ordinary preservation build. Only the existing
application entry changed; seven runtime assets were added. Marketing, feedback,
coach enrollment and prior accepted results remain preserved. Read [the release
handoff](docs/releases/PLANNER_PREVIEW_CONTEXT_GUARD.md) and [production receipt](docs/releases/receipts/PLANNER_PREVIEW_CONTEXT_GUARD_PRODUCTION.json) for exact scope and limits.

Runtime `f4ce1a8` extends approved `757cf1b`; it is separate from source main.
Held policy, session and Ball Striking candidates remain excluded. Keep
`[skip netlify]` on source/receipt integration. No backend, rules, indexes,
gateway, catalog or native release is included. Earlier sections are historical.

## Preserved web AI-sharing recovery release — October 24, 2026

Exact reviewed deployment `6adc6d7bf370755a2aabc65b` was published October 24.
Its preserved behavior lets players review
AI sharing from Coach, personal Workouts and their own Profile, explicitly allow
or decline, and retry a blocked AI request after allowing sharing. Opening the
control never saves consent or starts generation. No real account choice was
changed during release verification.

All 2,292 artifact files match the provider inventory (2,293 records including
routing metadata). The reconciled baseline protects 2,290 files. Marketing,
feedback, coach enrollment and historical assets remain exact. Runtime `bb3274c` contains approved `499dc815` plus this fix; held
policy, session and Ball Striking candidates remain excluded. Keep runtime
branches separate and retain `[skip netlify]` on source and receipt integration.

For consent behavior, release verification or the next application release, read
[the handoff](docs/releases/WEB_AI_SHARING_RECOVERY.md) and
[the production receipt](docs/releases/receipts/WEB_AI_SHARING_PRODUCTION.json).
No backend, rules, indexes, gateway, catalog or native release is included.
Earlier sections remain historical checkpoints of preserved behavior.

Earlier release-by-release notes (October 3–22, 2026 and before) live in
[docs/releases/HISTORY.md](docs/releases/HISTORY.md); receipts are in `docs/releases/receipts/`
and handoffs in `docs/releases/`. Use the latest applicable handoff, and treat
older checkpoints as records of their releases.

## Current backend ownership — migration branch

Shared Firebase/runtime source moved to `posetek/posetek-backend`. Read
[docs/features/BACKEND_MIGRATION.md](docs/features/BACKEND_MIGRATION.md) and use the exact
`backend-source.json` pin. This current ownership note supersedes historical
Mobile rules/Web Functions paths below. Production behavior is unchanged;
Backend publication remains held until release qualification. Client application,
site/native delivery and historical production evidence stay in this repository.



For the staged engineering pipeline, start at
`docs/engineering/README.md`, then read `WORKFLOW.md` and the approved plan in
that directory. The pipeline remains separate from the current production
release below until staged integration and hosted verification. Current policy
allows authors to merge their own PRs after passing CI and a completed
latest-revision advisory AI review; private protection and paid reviewer
activation remain pending. Preserve the published release records and use
isolated worktrees.


Read `POSETEK_PROJECT_CONTEXT.md` before working on this website. It records the
source version, project background, key files, release workflow, and review results.

`README.md` contains fresh-clone setup, preview, validation, and collaboration steps.

The shared website repository is `https://github.com/dk242/posetek_website.git`.
The user requires website changes to be committed here and the repository updated
for collaborators. Preserve teammates' commits, include required source and assets,
and update the handoff docs with confirmed project decisions. Keep generated output,
local reference captures, dependencies, and credentials out of Git.

## Agent gateway

**The agent-gateway lives only in `python-video-processor/Services/agent-gateway`.**
This repository's `services/agent-gateway/` copy was retired and deleted; do not
re-add it, and do not edit or deploy a gateway from here. Gateway changes go to
that repository.

**The gateway is released only through
`python-video-processor/Services/agent-gateway/scripts/release.sh`, from a pushed
commit on its `main`.** No `gcloud run deploy --source`, no `git archive` of a
website directory, no branch or dirty-tree deploys. `scripts/release-training-expansion.cjs`,
which deployed `git archive HEAD:services/agent-gateway` to Cloud Run, was deleted
with the copy; a website script or doc that deploys the gateway is a defect.

The website's half of the contract — the capabilities it calls, the server-written
public projection, and the delivery/recovery guarantees — is in
`docs/features/PERSONALIZED_PLANNER_WEB_CONTRACT.md`. Gateway revision names in the release
notes below and in `deployment/*.json` are historical records of what was serving
at the time, not instructions or a current source pointer.

## Firebase rules

**Firestore and Storage rules live only in `PoseTek-mobile-app/firebase/`**
(`firestore.rules`, `storage.rules`). They are published only by
`python firebase/operations.py publish` in that repo, and never from here.
This repository has no rules files, and `firebase.json` carries Firestore
*indexes* only, so no form of `firebase deploy` from this checkout can publish
rules. Do not re-add a `rules` key to `firebase.json` or to any other config here,
and do not add a rules file. A rules change is a change to the mobile repo.

The suites in `app/rules-tests/` test the canonical files. Run them with
`node scripts/run-rules-tests.mjs` (see `app/rules-tests/README.md`). They
default to a sibling `../PoseTek-mobile-app` checkout, and `RULES_PATH` /
`STORAGE_RULES_PATH` override that. Rules, receipts and releases in
`deployment/*.json`, including the composed `whole-body-firestore.rules`
(deleted), are historical records of past publishes, not instructions.

## Build, preview and release

The feed feature stack is available in `app/src/pages/feed/` and `functions/`.
Read `docs/releases/FEED_SOURCE_HANDOFF.md` for setup, API contracts and provenance. The
frontend is recovered editable JSX; the backend is original deployed source.
Feed development uses the Vite app at `/feed?preview=1` and requires no reference
capture. Source recovery did not deploy or change the application baseline.

At the initial September 15 review, GitHub main was older than the live homepage.
The user chose the deployed site as the reference. Recovered modules have provenance
beside their code; the other computer's original authored source remains unavailable.
The unchanged deployment `6aa9b6f0d8faf6177db8fd97` remains the tabbed comparison
reference. The current application release and protected files are recorded in
`deployment/homepage-baseline.json`. On a fresh clone, run
`node scripts/capture-deployed-reference.mjs` before using either preview server.
The ignored capture lives in `.netlify/deployed-reference/6aa9b6f0d8faf6177db8fd97/`.

Run `npm --prefix app run build:marketing` and
`node scripts/serve-homepage-preview.mjs` to review current source at port 4174.
Run `node scripts/serve-deployed-reference.mjs` for the unchanged reference at
port 4173. The ordinary production build preserves every application/public file
recorded in `deployment/homepage-baseline.json` byte-for-byte,
including `/application.html` and its navigation bridge. Keep the live-application
guard enforced and verify the baseline again before another release.

Deliberate full-site application releases use `node scripts/build-astro-release.mjs`.
`--preserve-marketing <manifest-path>` retains freshly verified Players/Coaches
documents while updating the application and isolated feedback entries; their
runtime assets must already be in the protected baseline.
`build-application-release.mjs` delegates to that build by default; its historical
`--marketing-snapshot` mode retains verified marketing bytes for compatible older
releases. Follow the web handoff
for preparation, preview, verification and baseline reconciliation; keep local
snapshots and generated output outside Git.

Not-yet-ported legacy pages and their scripts live in `legacy/` (see its README); served URLs are unchanged.

Homepage work primarily belongs in `app/src/pages/home/`; Coaches source is in
`app/src/pages/coaches/`. Astro document entries live in `app/astro/pages/` with
shared metadata in `app/astro/layouts/Document.astro`. Root `index.html` and
`coaches/index.html` remain Vite compatibility entries. Both public audiences
share `MarketingHeader.tsx`.
Use the latest applicable release notes,
preserve existing routes and data contracts, and treat mobile source as reference-only.

Update the context guide as the source discrepancy is resolved and new project
decisions are confirmed. Do not infer current offers or production behavior from
older experiment pages or historical test receipts. Preserve historical receipts
as records of their releases.
