# Database-first catalog compatibility — November 7, 2026

Deployment `6aeffb31ae4da62a62fc6356` was published at `2026-11-08T04:34:35.550Z`, promoted without rebuilding from the verified draft. It ships PR #134, the admin and coach compatibility for the database-first catalog (catalog plan §4 step 4). The catalog draft import that depends on it is a separate step. [Production receipt](receipts/CATALOG_DB_FIRST_COMPAT_PRODUCTION.json).

## Scope

- Catalog compatibility ([PR #134](https://github.com/posetek/posetek-website/pull/134), merged as `78e572f`):
  - The admin drill editor reads the validation gate. `published` is unavailable while validation is required and has not passed ("Publishes automatically when validation passes"). An already published drill keeps it.
  - Stale saves are refused, and unknown sub-keys are kept. The page's own media writes never absorb an automatic publish.
  - The admin workout picker loses its 200-row cap.
  - The coach dashboard offers published drills only and keeps heavy fields out of state.
  - The athlete workout player card shows the v2 `howTo`.

No Functions, rules, indexes, schema, gateway, catalog data or native change. Held policy, session and Ball Striking candidates remain held.

## Production state before this release

Live had moved twice since the result validation release `6aedefb9`:

1. **`6aefe7d5d3b494177a620132`, published at 03:10:45Z, was an accidental Git build.** The #134 merge commit lacked `[skip netlify]`, so Netlify built main and published it.
   - The guarded production builder kept `/application.html` exact (`e1ddba3d`).
   - It rebuilt `/index.html` and `/coaches/index.html`; only the `astro-island` uid changed. Asset references are identical and there are no local paths.
   - It added 36 unreferenced application chunks.
2. **`6aeff48be31e6080ee877d2f`, published at 04:03:25Z, was a CLI production deploy from Dylan Keller's November cohort report project.** It has no source in this repository. It:
   - updated the `/report` reader and added 30 report data files;
   - added the isolated `/player-signin.html` ("Player account") with its four assets;
   - serves `/signin` from that page with its own security headers.

This release preserves all of `6aeff48b` byte for byte, including its `/signin` rewrite and headers. `6aeff48b` is the immediate predecessor and the rollback target.

## Runtime composition

Main's `app/` differs from the live runtime in 223 files beyond #134, so main was not shipped. Shipping it would have:
- published held Ball Striking and privacy/support source;
- published main-only AI chat transport changes;
- removed the runtime's jump review panel and athlete reviewed results.

Runtime branch `runtime/catalog-db-first-compat` starts from accepted runtime `51106ec`, whose `app/` is byte-identical to live runtime `e4c6403`:

1. `6272741`, `df32781`, `8b37d01`, `a1dde30`, `f924ad2`, `45e3a03`: #134's six commits, cherry-picked with `-x` and no conflicts. `app/` differs from the base in exactly #134's 14 files, byte-identical to main.
2. `d98bce2`: the baseline reconciled to live `6aeff48b`.
3. `dbb380f`: the live `/signin` rewrite and its two header rules, carried so provider configuration matches `6aeff48b` rule for rule. The artifact was built from this commit.
4. `99ff6fd`: the baseline reconciled to `6aeffb31`.

## Exact artifact

Built with `node scripts/build-astro-release.mjs --preserve-marketing <manifest> --preserve-isolated-entries`. The two marketing documents are `6aeff48b`'s provider originals, downloaded raw, SHA-verified and freshly checked against posetek.net.

- All 2,697 artifact files match 2,698 provider records.
- All 2,676 prior files are byte-identical. Only `/application.html` changed (`d4e89030`), and 20 hashed application assets were added.
- Marketing, feedback, coach enrollment, private reports and the player sign-in entry are exact.
- Provider configuration differs only in `build.publish`; all 13 headers and 11 redirects are identical.
- No local path appears in any changed or added file, and the DEV-only preview is not bundled.
- Artifact manifest SHA-256: `ac6cac0fd8f69180462d0ab1a72005cb1a27af672af7d6e7c75962a52cad049a`.

The protected-file cache was seeded only with hash-verified bytes from the prior release cache. Files absent from that cache were fetched raw from the provider files API. The build re-verified every file.

## Verification

- **Source:** hosted `ci` passed on PR #134 head `cf59924`.
- **Runtime at `45e3a03`:**
  - 2,283 frontend tests, 155 release-tooling tests, 40 policy tests and guest smoke 7/7;
  - lint, Svelte, build, marketing build, transport checks and dependency audit;
  - one frontend test timed out once while another job loaded the machine, then passed alone and in a full rerun;
  - the marketing-link lane is absent on runtime branches.
- **Draft:** exact inventory, config proof, 102/102 HTTP checks against the `6aeff48b` permalink (including `/signin`, `/player-signin.html`, `/report`, `/admin/drills` and `/admin/programs`), and 20/20 signed-out route loads in Chromium and WebKit.
- **Live:** the inventory equals the draft. `/application.html` serves `d4e89030`, the marketing pages are unchanged, and `/signin` is still the Player account page. HTTP checks differ from the permalink only in HSTS and `x-robots-tag`, as before. The same 20/20 route loads pass.

Not claimed: signed-in acceptance of the hosted artifact (no synthetic admin or coach was created), emulator journeys, and behavior against database-first catalog documents, which do not exist in production until the draft import.

## Baseline and recovery

The reconciled baseline protects 2,695 files with all 37 recovery mappings, and the ordinary preservation build passes against it. This record also brings main's `netlify.toml` to the live `/signin` configuration, so a later Git build of main cannot drop it. Keep `[skip netlify]` on every source and receipt merge: Netlify Git builds on main are enabled and publish to production.

Recovery: compare fresh serving state, then restore `6aeff48be31e6080ee877d2f` through the guarded exact-deploy workflow (`netlify api restoreSiteDeploy` with that deploy id). That restores the previous application entry and keeps the cohort reports and player sign-in page. A source revert alone does not republish.
