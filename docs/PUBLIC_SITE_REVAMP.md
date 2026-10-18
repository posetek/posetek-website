# Public-site revamp — October 17 historical checkpoint

The Players (`/`) and Coaches (`/coaches`) pages adopt the layout and interaction
language of [Lain Works](https://lainagency.com/works), retaining PoseTek copy,
approved recordings, sample profiles, destinations and product behavior. This is
a review candidate, not a production-release receipt.

The [first-interaction and pacing follow-up](PUBLIC_SITE_FIRST_INTERACTION.md)
supersedes the independent columns and main-thread 3D described in this checkpoint.
The verified candidate section below remains historical. Current immutable
acceptance is recorded in [the candidate receipt](../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json);
this checkpoint does not verify the current source.

## Design and preserved behavior

The shared public shell uses a light `#f1f1f3` canvas, fine vertical grid, oversized
Inter headings, IBM Plex Mono labels, evergreen/lime accents and a media-first
gallery with independent staggered columns, compact captions and
container-responsive demos. Native scrolling and real fragment links connect
every chapter. Category chips navigate; only the existing movement selectors filter recordings.

Players retains testing → profile → training → AI Coach/retesting → technique →
mobile preview. Coaches retains club → player evidence → development → enquiry.
Sample and illustrative labels remain visible. No Lain code, media or branding is
shipped. REA desktop and 390px browser observations established the design. The
[detail pass](PUBLIC_SITE_INTERACTION_DETAILS.md) adds exact public JavaScript/CSS
evidence and timed hover/scroll observations. The [composition pass](PUBLIC_SITE_COMPOSITION.md)
adds fresh geometry, scroll-layout observations and the media-first adaptation.
Coverage limits are recorded in both ledgers.

Shared components provide a ten-slice fullscreen green menu, moving destination
miniatures, numbered chapter indicator, resolving link labels, masked lettering,
repeatable tiled reveals, visual hover tilt/sharpening, decorative pointer labels
and bracket feedback. Reveals stop on focus/pointer interaction; actual control
hit areas remain stationary. The closing invitation and
approved P extrusion respond to scrolling; the audience preview always needs an
explicit click. Optional original Web Audio cues default off, remember only the
browsing session and never initialize an audio context before opt-in interaction.

The existing demonstration logic still owns playback, test/skill/team/player
selection, workout progression and coach-to-workout handoff. Demos remain mounted
and pause offscreen/hidden. Imports fail independently. A failed demo offers one
local retry; if Chromium retains a rejected module in its document cache, an
explicit **Reload page** explains that all sample progress restarts. Nothing
reloads automatically. A stalled load reaches recovery after twenty seconds.

Astro prerendering uses explicit asset URL imports for the approved drill videos
and posters, avoiding server filesystem URLs in the initial HTML. Media bytes and
provenance are unchanged.

## Accessibility and resilience

- Visible keyboard focus, 44px public navigation targets, Escape-to-close, menu
  focus containment/restoration and inert background while the menu is open.
- Menu sibling dimming retains at least 4.5:1 main-label contrast. Pointer effects
  exclude controls and interactive SVG geometry; focused controls stop motion.
- Real links preserve direct hashes, browser history and document navigation.
- Essential headings, text and destinations render before JavaScript. Interactive
  demonstrations require JavaScript; static content and links remain usable.
- Reduced motion removes scrambling, tiled reveals, masked entrances, parallax
  and the dimensional enhancement. The approved static SVG remains available.
- Three and its logo helpers load on visibility. No idle render loop; hidden or
  offscreen rendering stops. WebGL or decorative import failure keeps the SVG.
- Public `.pt-revamp` styles do not apply to authenticated application screens.

## Reproduce acceptance

Use the current required CI commands in `.github/workflows/ci.yml`, then:

```sh
npm --prefix app run build:marketing
node --test scripts/marketing-revamp.browser.mjs
MARKETING_ALLOW_FONTS=1 node --test scripts/marketing-revamp.browser.mjs
node scripts/build-production.mjs
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 node --test scripts/marketing-revamp.browser.mjs
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 node --test scripts/marketing-detail.browser.mjs
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 node --test scripts/marketing-composition.browser.mjs
```

Browser acceptance uses disposable guest contexts. Only local GET/HEAD requests
are allowed by default; the optional visual run also permits Google font GETs.
For hosted acceptance, `MARKETING_ORIGIN` accepts only an immutable PoseTek draft
URL; `MARKETING_ARTIFACTS` selects its evidence folder. All writes, analytics,
external application traffic and WebSockets are blocked.
Initial revamp evidence is under ignored `artifacts/marketing-revamp/`; the latest
interaction pass is under `artifacts/marketing-detail/`. Current composition,
motion captures and exact-candidate evidence are under `artifacts/marketing-composition/`.
These checks do not claim authenticated production or physical-device acceptance.

The interaction checklist covers both audiences at 360, 390, 430, 768, 1440 and
1920px; all chapters and destinations; menu keyboard/focus/history; sound;
no-JavaScript, reduced-motion and unavailable WebGL; six recorded tests and
playback; sample skills; workout progression and AI handoff; technique; mobile
video retry/progression; and coach team/player/development selection.

## Release boundary and recovery

Source started on fresh remote `main` at
`23e2ebed988e1677f6028ea6d7b5589273291ea1` in an isolated worktree. Read-only Netlify
inspection on October 17 found production branch `main`, builds enabled, branch
allowlist `[main]`, and untrusted deploy review enabled. A merge into `main` can
publish automatically. Keep this PR unmerged until exact-candidate acceptance.

Current serving deploy `6ad02adfcc90dffdb496f811` was published from that `main`
revision on October 15. Its provider inventory has 1,988 records; all 1,982
previously protected records match exactly. The preservation baseline is refreshed
to this already-serving deploy and now protects 1,985 files, adding its three
retained application chunks. Live application HTML matched before and after
capture. Runtime behavior remains the earlier verified
`6acfa49a07f33b1d9fb64abf` release; this revamp does not activate held policy or
support wording. This refresh records existing production, not revamp promotion.

Assemble only with `node scripts/build-production.mjs`. Preserve application,
feedback, coach enrollment and all baseline assets byte-for-byte. Review the
candidate's complete manifest and hosted public acceptance before promotion.
No API, authentication, persisted data, catalog, rules, native or notification
change is part of this candidate.

Recovery uses the immutable previous production inventory and artifact above.
If a later approved publication regresses, prepare a forward recovery artifact
restoring the previous two marketing HTML entries and their assets while retaining
the then-current protected application. Verify hashes and hosted behavior before
publishing. Do not rewind application/rules data or silently weaken the guard.
After an approved promotion, verify its complete provider inventory and reconcile
the protected baseline through the repository's release workflow. No promotion
of the revamp is claimed by this candidate document.

## Verified candidate and interaction checklist

The exact guarded [Players preview](https://6ad4222d16fa2fd9dbccae9f--posetek.netlify.app/)
and [Coaches preview](https://6ad4222d16fa2fd9dbccae9f--posetek.netlify.app/coaches)
are ready for visual acceptance. [PR #85](https://github.com/posetek/posetek_website/pull/85)
contains the source; its checks and advisory review identify the latest reviewed head.
The [candidate receipt](../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json) identifies
runtime commit `8751f0528247db4d7606c4c52036ce83c7d58e09`, deploy
`6ad4222d16fa2fd9dbccae9f`, and manifest SHA-256
`8b37c6317bd7b1c3838af1387395523b3d9d5cf6b2c2f9c3baeb2cb89ca38b05`.

All 2,072 local files match the hosted provider inventory by hash and size.
Netlify normalizes inventory path case; there are no normalized path collisions.
Its additional record is deployment metadata. All 1,985 protected files are exact;
seven existing redirect rules and ten header rules processed without errors.
No functions or edge functions were deployed. Production remains unchanged.

| Acceptance | Result |
| --- | --- |
| Both audiences at 360/390/430/768/1440/1920px | Passed locally and on the exact hosted draft |
| Media-first cards, source chapter order, natural-height columns and readable demo controls | Passed |
| Four-percent desktop drift, bounded travel and hover/focus pause without catch-up | Passed; 300px scroll produces 12px relative travel |
| Native chapters, direct hashes, back/forward, reload and focus | Passed, including deliberately delayed preceding-demo loading |
| Menu curtain/lettering, moving previews, keyboard containment, Escape and focus restoration | Passed; dimmed main labels retain 4.84:1 contrast |
| Scramble layout stability, artwork hover and first-click controls | Passed |
| Directional scroll replay, partial bottom-edge behavior, state retention, live reduced motion and hidden-page cancellation | Passed |
| HTML touch targets, long labels, orientation and horizontal overflow | Passed; 200% desktop CSS-viewport equivalent also checked |
| Six recordings, playback, skills, workouts, AI handoff, technique and mobile media | Passed |
| Coach team/player selections and Plan → Train → Retest | Passed |
| Sound opt-in/session behavior | Passed |
| Footer reverse entrance, pointer-reactive P, visual bottom pull and explicit navigation | Passed; settled mobile closing captures included |
| No JavaScript, reduced motion, no WebGL, failed media and rejected imports | Passed; failures remain isolated and recovery is explicit |
| Exact local browser suites | 24 composition + 20 detail + 33 original regression checks pass; 105 suite screenshots plus 4 settled heroes |
| Exact hosted browser suites | The same 77 checks pass; 105 suite screenshots plus 4 settled heroes |
| Unexpected origin failures / browser exceptions / attempted writes | Zero in final runs; three deliberately injected media/import failures are expected |
| Runtime source CI | All six checks pass: 1,999 frontend tests across 173 files, 76 tooling/release tests, 32 policy tests, 7 guest smoke cases, builds/types/Svelte/lint/transport/dependency checks |

Optional technique SVG joint targets measure approximately 26.56px at 1440px.
Every joint action has an equivalent in the visible 44px measurement selector,
using the same selection/pause/frame handler. The 44px checks cover visible HTML
controls; SVG checks separately verify stable hit geometry and activation. No
physical-device or authenticated-production acceptance is claimed.

The final runtime fixes a cold mobile fragment regression found by hosted testing:
a delayed movement demo grew the preceding card by 266.25px and displaced the
profile landing. The gallery now retains document-space fragment geometry,
compensates late reflow and releases correction on deliberate user interaction.
Deferred correction preserves restored history offsets rather than resetting
them to the section margin.
A deterministic delayed-import test fails on the earlier artifact and passes on
this candidate; the added unit cases cover native/history positions and takeover.
The final build also restores menu focus to the chapter heading when media-first
layout places nested demo headings earlier in the document.

Browser checks retain their assertions. The technique geometry test now waits for
its setup hover's native smooth scroll to finish before measuring the unchanged
hit areas; prior diagnostics identified scroll travel, rather than moving joints.
A preliminary hosted menu probe also missed its finite intermediate window: all
curtain slices had already reached at least 0.953642 scale before the 0.15–0.85
probe started. The final harness records actual animation frames from before
the real click, preserving intermediate geometry, sequencing and all interaction
assertions without changing or pausing the animation. This choreography check
waits for the visible hero renderer to reach WebGL or its explicit static
fallback. A separate cold-start trace found a 419ms main-thread task during
renderer initialization that skipped intermediate sampled frames. The result
does not establish smooth menu animation during first-load initialization;
general menu usability is covered separately by the regression suite without
this renderer-readiness precondition. That suite does not deliberately time
input within the observed startup task.
Immediate hero captures show entrance motion. Use the separately named
`*-curated-hero-settled.png` files and the detail suite's settled footer captures
for the completed appearance.

Evidence lives in ignored `artifacts/marketing-composition/`: final reports are
`hosted-final-composition/composition-acceptance.json`,
`hosted-final-detail/detail-acceptance.json`, and
`hosted-final-regression/acceptance.json`, with matching `local-final-*` reports.
The folder includes `performance.json`, `artifact-manifest.json`,
`draft-verification.json`, the REA reference audit and cold-hash diagnostics.
The superseded artifact's reports and manifest remain under `pre-anchor-fix/`;
its deterministic failing test is under `pre-anchor-fix-regression/`.
The intermediate history-fix candidate is retained under `pre-history-fix/`;
its interrupted hosted run is explicitly marked and is not counted as acceptance.
The diagnosed early menu-probe report remains at `hosted-final-detail-first-attempt/`.
Recovery evidence remains at `artifacts/marketing-revamp/rollback/verification.json`.

Representative final captures are
`hosted-final-composition/players-1440-story-tests.png`,
`hosted-final-composition/players-390-curated-hero-settled.png`,
`hosted-final-composition/coaches-1440-story-club.png`, and
`hosted-final-detail/coaches-390-footer-preview-settled.png`.
Captures contain existing sample data only. A guarded local preview is available at
`http://127.0.0.1:4177` during this workstation session; both HTML documents match
the exact candidate.

Three cold-context samples show initial JS+CSS changes of
+1,037 bytes (Players) and
+2,042 bytes (Coaches), with
unchanged request counts and zero initial decorative logo-helper requests.
All 27 content/media/brand files (3,934,045 bytes) are identical. Median local
first paint was 44→64ms
and 44→56ms respectively.
The baseline is the existing October 14 compiled artifact. These uncompressed,
unthrottled local measurements exclude external fonts and do not establish CDN,
mobile or field speed, or attribute every dependency difference to this revamp.

Previous marketing HTML was recovered through the provider raw-file API and
verified against the serving inventory: `/index.html` SHA-1
`9e6e486665e3fdd1257c23fe8a69cf8e72e619e4`; `/coaches/index.html` SHA-1
`829a6277b98f9f62b39908d1a3a39c230ae0efe1`. The PR remains unmerged for human visual
acceptance. Production promotion and post-promotion baseline reconciliation are
separate remaining release steps.
