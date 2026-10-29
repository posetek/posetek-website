# Showcase depth production release

The accepted Players and Coaches showcase refinement is live at [posetek.net](https://posetek.net) and [Coaches](https://posetek.net/coaches). The exact candidate was promoted on October 18, 2026 at **20:37:19 PDT** (`2026-10-19T03:37:19.023Z`) following the user's explicit deployment and main-merge instruction.

## Artifact and integration

- Published deploy: `6ad58598033b1b6ba8b4d6c2`.
- Runtime source: `785da39a9e65927016066254a611906b0bf0b4fb`; accepted advisory-review head: `1e449a5eebd309e21d7e960bead365797d652901`.
- Manifest SHA-256: `380d9f34411a1aba31b375c6b19969bbc2b85b33c81935b2c4624de32b7c3df2`.
- All **2,108 artifact files** match the **2,109 provider records**; the sole additional provider record is generated `/netlify.toml` metadata.

This is the existing immutable candidate assembled with `node scripts/build-production.mjs`; promotion performed no rebuild or replacement upload. The original output is frozen at `artifacts/showcase-production/accepted-dist`. The later ordinary build verifies preservation after baseline reconciliation and is not another publication.

[PR #86](https://github.com/posetek/posetek_website/pull/86) carries implementation, candidate evidence, release receipt and the reconciled baseline. Its latest pushed head must pass all six required CI lanes and a completed commit-pinned advisory review before merging. The pushed head, PR title and merge message retain `[skip netlify]`. Existing Git publishing is otherwise unchanged: future unmarked pushes to main can replace this artifact through the configured automatic build. No hosting lock or setting was changed. The final merge and review are recorded directly on the PR to avoid a self-referential source hash in this document.

## Preservation and baseline

All **2,001 previously protected files** remain byte-identical; no predecessor file was removed. Only `/index.html`, `/coaches/index.html` and generated provider metadata changed among previous records, with **105 content-addressed assets added**. Public pages now use the approved original artwork, retained inline demo instances and shared gallery worker described in the [implementation guide](PUBLIC_SITE_SHOWCASE_DEPTH.md).

| Protected entry | Unchanged SHA-1 |
| --- | --- |
| Application | `b23f8e221c6cbd6d5f558836ff89c02d3a85ac2c` |
| Feedback | `039a6cb1c652002dcd7e556359e5fbd1974ce426` |
| Coach enrollment | `12f8e0dcefb18c3f960e52b8304480c3e8f5b9c8` |

Active application source remains `57e9e03e139a287accfad7889d96747b3ad6ecc3`; isolated coach enrollment remains `8eaf3ffd35848c3cf7ca753cc9fd4030cc4fb524`. Approved privacy/support source from `139162a04a1aa2afefda78c62bf2715d9667acbc` remains preserved, and held source on main is not activated. No backend, authentication, API, persisted-data, Functions, rules, indexes, gateway, catalog, notification or native release is included.

The reconciled baseline protects **2,106 files**, retaining all 2,001 previous rows and adding 105 assets. Reconciliation used the fully verified published inventory; independent provider identity checks establish publication because the helper's unchanged application-entry check alone cannot do so. Source provenance fields were restored after the helper's metadata reset. The ordinary guarded build and all 48 preservation/release tests passed; its check-only output matches all accepted files by normalized path, SHA-1 and size and was not published.

## Live verification

| Production lane | Passed | Evidence |
| --- | ---: | --- |
| Showcase layout, expansion, state, hashes and fallbacks | 37 | `artifacts/showcase-production/showcase/showcase-acceptance.json` |
| Public navigation and demo regression | 31/33 initially; 2/2 focused rerun | `artifacts/showcase-production/revamp/acceptance.json` |
| Hover, scrolling, menu and closing interactions | 20/21 initially; 1/1 focused rerun | `artifacts/showcase-production/detail/detail-acceptance.json` |
| Headless WebKit support | 4 | `artifacts/showcase-production/webkit/cold-acceptance.json` |

The 91 unique functional checks passed across the initial runs and the focused orientation and closing reruns; this is not a single uninterrupted clean run. The first regression report retains two teardown failures for native image `ERR_ABORTED` during orientation changes. A passive diagnostic reproduced the Coaches cancellations as 1200w requests replaced by decoded 600w `currentSrc` images, with all image responses 200 and all ten previews decoded. The Players technique image also decoded successfully. Both affected cases passed unchanged assertions in `artifacts/showcase-production/revamp-orientation-rerun/`. The detail suite separately retained two aborted decorative worker fetches during fast traversal through the Players closing panel; its behavioral assertions passed, and the unchanged focused closing case passed in `artifacts/showcase-production/detail-closing-rerun/`. The two original worker events remain unclassified: the final cross-page navigation removes the prior document needed for teardown cancellation/decode proof. A passing rerun does not retrospectively waive them. No runtime, harness threshold or failure exclusion changed.

The three functional lanes exercise both audiences at 360, 390, 430, 768, 1440 and 1920px, responsive demo placement, selection/playback, workout progression, AI handoff, retained state, keyboard focus, aliases and native history, menu interruptions, reduced motion, JavaScript-off and renderer/media/import failures. Guest network policy permits only tested-origin GET/HEAD and optional Google-font GET; no writes, authenticated journeys or account creation occurred.

A file-only visual review inspected 21 live captures. One initial absent action label appeared correctly after animations settled, with opacity/visibility and animation-state evidence retained. No unresolved visual finding remained in the reviewed scope. This is artwork-author self-review; static screenshots do not attest motion or physical-device behavior.

The production HTTP audit passed **294 anonymous GET requests**, **22 routes** and **80 assets**, with zero mismatches. Public served bodies match the accepted immutable deploy; protected entries and aliases match the predecessor. Assets match the frozen originals, and routing, caching and security headers match their references. Netlify Pretty URLs may transform served HTML; the full provider inventory separately verifies original uploaded bytes.

Cold hardware measurements belong to the exact candidate receipt and were not rerun during publication. That receipt retains the original 312ms GPU raster stall, controlled repetitions, the local input-contaminated case, and the hosted autoplay-label test race with its separate corrected recovery run. Live headless checks do not replace hardware timing evidence. Mobile sizes are desktop viewport/touch emulation, not physical-device acceptance; visibility tests inject lifecycle events.

## Observation and recovery

Codex operated the user-authorized release for Dylan Keller, observing serving identity, artifact/protected hashes, live HTTP behavior and guest interactions for at least five minutes and through final source integration. Stop conditions were an unexpected serving deploy, any protected/artifact mismatch or a critical navigation/demo/request failure. No production regression or recovery action was needed.

The predecessor `6ad536a9103351c79863f77f` and its verified local accepted artifact under `/Users/dylankeller/Developer/PoseTek-Worktrees/public-site-revamp/artifacts/marketing-production/accepted-dist` remain recovery evidence. If recovery becomes necessary, prepare a forward artifact restoring prior public HTML and retained assets while preserving the then-current protected application; verify it before publication. Do not rewind data, rules or unrelated later releases. No rollback was executed.

See the [production receipt](receipts/PUBLIC_SITE_SHOWCASE_PRODUCTION.json), [historical candidate receipt](receipts/PUBLIC_SITE_SHOWCASE_CANDIDATE.json), [candidate implementation and REA evidence](PUBLIC_SITE_SHOWCASE_DEPTH.md), and [preceding production release](PUBLIC_SITE_REVAMP_RELEASE.md).
