# Public-site production release

The exact accepted Players and Coaches candidate is live at [posetek.net](https://posetek.net)
and [Coaches](https://posetek.net/coaches). Publication occurred on October 18, 2026
at 14:42:52 PDT (`2026-10-18T21:42:52.576Z`) after the user's explicit release instruction.

## Artifact and source

- Netlify deploy: `6ad536a9103351c79863f77f`.
- Runtime source: `9fa587ac341c993023ee0174b7bfe1e96a44d247`.
- Accepted source/review head: `91561d3dcdd8be12c4f06554d6a11c0abba359dd`.
- Manifest SHA-256: `205deec1f4de5920ba09a1c8a40ea67d0787808ec7b4ba4535280cec56c90662`.
- 2,003 artifact files match all corresponding rows in 2,004 provider records;
  the only extra provider record is generated `/netlify.toml`.

The artifact assembled by `node scripts/build-production.mjs` was promoted through
Netlify's existing-deploy operation. No rebuild or upload substituted for the
accepted draft. The original accepted output is retained locally under
`artifacts/marketing-production/accepted-dist`; the candidate receipt remains a
historical pre-publication record. The later ordinary preservation build validates
the reconciled baseline and is not a second release.

[PR #85](https://github.com/posetek/posetek_website/pull/85) carries source and
release evidence. Required GitHub CI and a completed latest-revision advisory
review govern source integration. Its title, pushed head and merge message use
`[skip netlify]` so Git publishing cannot replace the accepted artifact during
integration. No production settings or deployment locks were changed. Future
unmarked pushes to main still use the existing automatic publishing configuration.

## Preserved application

Every one of the 1,985 previously protected files remains byte-identical to
`6ad02adfcc90dffdb496f811`; no existing file was removed. Only `/index.html`,
`/coaches/index.html` and generated provider metadata changed among existing files.
Sixteen content-addressed assets were added.

| Entry | Preserved SHA-1 |
| --- | --- |
| Application | `b23f8e221c6cbd6d5f558836ff89c02d3a85ac2c` |
| Feedback | `039a6cb1c652002dcd7e556359e5fbd1974ce426` |
| Coach enrollment | `12f8e0dcefb18c3f960e52b8304480c3e8f5b9c8` |

Application runtime remains `57e9e03e139a287accfad7889d96747b3ad6ecc3`, and isolated
coach enrollment remains `8eaf3ffd35848c3cf7ca753cc9fd4030cc4fb524`. Approved policy
and support bytes remain preserved; held source on main was not activated. No
backend API, authentication, persisted data, Functions, rules, indexes, gateway,
catalog, notification or native release was performed.

`scripts/reconcile-homepage-baseline.mjs` adopted the verified published inventory.
The baseline now protects 2,001 files: all 1,985 prior records plus 16 assets. The
application and coach-enrollment source provenance was restored after the helper's
metadata reset. The ordinary guarded build and 41 preservation/release tests passed after
reconciliation. Its output matches all 2,003 accepted files by normalized path,
SHA-1 and size; 16 newly pinned paths use provider-normalized lowercase spelling.
This check-only output was not published.

## Live verification

| Lane | Passed | Evidence |
| --- | ---: | --- |
| Responsive/public regression | 33 | `artifacts/marketing-production/regression/acceptance.json` |
| Hover, scroll and menu details | 23 | `artifacts/marketing-production/detail/detail-acceptance.json` |
| Composition and demo continuity | 26 | `artifacts/marketing-production/composition/composition-acceptance.json` |
| Cold-start hardware lane | 29 | `artifacts/marketing-production/cold/cold-acceptance.json` |
| Desktop WebKit support | 4 | `artifacts/marketing-production/webkit/cold-acceptance.json` |

The functional lanes captured 113 screenshots on the live domain. They cover
360, 390, 430, 768, 1440 and 1920px layouts, landscape changes, a 200% CSS viewport
equivalent, all public demonstrations, menu and chapter navigation, keyboard
focus/Escape, history/deep links, optional sound, reduced motion, JavaScript-off,
media/import failure and static rendering fallbacks. Cold tests exercise first
menu input while hydration/3D start, interrupted dismissal, worker failures,
offscreen/visibility lifecycle and resize. All guest-browser network traffic is
restricted to tested-origin GET/HEAD and optional Google-font GET; writes and
WebSockets are blocked.

The HTTP audit passed 22 page routes and 59 assets through 170
anonymous GETs. Public page bodies match the immutable accepted deploy's served
bytes; protected entries and aliases match their predecessor. Asset bodies also
match accepted original SHA-1 and size. Redirects, cache and security headers
match their respective reference. Netlify Pretty URLs transforms public HTML
when served; original uploaded-file parity is independently established by the
complete provider inventory.

The initial HTTP harness classified six new assets against the predecessor and
therefore received its application fallback. Live bodies already matched the
accepted originals. The corrected audit uses the immutable predecessor inventory
with an explicit deploy-ID check to select the reference; its initial output is
retained separately. No website change or assertion relaxation was needed.

Mobile coverage is desktop touch/viewport emulation, and WebKit runs on this Mac;
physical iOS/Android acceptance is not claimed. Visibility tests inject lifecycle
properties/events. Fresh browser caches do not clear driver/shader caches.
Application evidence establishes unchanged compiled bytes and public routing;
no authenticated user journey, user-data write or account creation was performed.

## Observation and recovery

Codex operated the authorized release for Dylan Keller. Observation began before
promotion and continued through production acceptance, baseline validation and
final serving-identity readback. Stop conditions were a different serving deploy,
any protected/artifact mismatch, or a critical navigation/demo/request failure.
No production regression or recovery action was needed.

Original previous public HTML is retained in
`artifacts/marketing-revamp/rollback/` and was verified again before promotion.
If recovery becomes necessary, compose a forward artifact restoring those public
entries and their retained assets while preserving the then-current protected
application. Verify its full inventory and hosted behavior before publication;
do not rewind application data, rules or unrelated later releases.

See [production receipt](../deployment/PUBLIC_SITE_REVAMP_PRODUCTION.json),
[accepted candidate](../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json), and
[interaction polish evidence](PUBLIC_SITE_INTERACTION_POLISH.md).
