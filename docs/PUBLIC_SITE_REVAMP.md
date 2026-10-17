# Public-site revamp candidate — October 17, 2026

The Players (`/`) and Coaches (`/coaches`) pages adopt the layout and interaction
language of [Lain Works](https://lainagency.com/works), retaining PoseTek copy,
approved recordings, sample profiles, destinations and product behavior. This is
a review candidate, not a production-release receipt.

## Design and preserved behavior

The shared public shell uses a light `#f1f1f3` canvas, fine vertical grid, oversized
Inter headings, IBM Plex Mono labels, evergreen/lime accents and staggered demo
panels. Native scrolling and real fragment links connect every chapter. Category
chips navigate; only the existing movement selectors filter recordings.

Players retains testing → profile → training → AI Coach/retesting → technique →
mobile preview. Coaches retains club → player evidence → development → enquiry.
Sample and illustrative labels remain visible. No Lain code, media or branding is
shipped. REA desktop and 390px browser observations established the design; the
reference capture did not recover every JavaScript/network response body.

Shared components provide a fullscreen green menu, numbered chapter indicator,
staggered masked menu lettering, masked headings, short tiled reveals, decorative pointer labels and bracket
feedback. Reveals stop on focus/pointer interaction. The closing invitation and
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
```

Browser acceptance uses disposable guest contexts. Only local GET/HEAD requests
are allowed by default; the optional visual run also permits Google font GETs.
For hosted acceptance, `MARKETING_ORIGIN` accepts only an immutable PoseTek draft
URL; `MARKETING_ARTIFACTS` selects its evidence folder. All writes, analytics,
external application traffic and WebSockets are blocked.
Screenshots and detailed receipts are under ignored `artifacts/marketing-revamp/`.
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

The exact guarded [Players preview](https://6ad405d1f124f04f96f5fe3a--posetek.netlify.app/)
and [Coaches preview](https://6ad405d1f124f04f96f5fe3a--posetek.netlify.app/coaches)
are ready for visual acceptance. [PR #85](https://github.com/posetek/posetek_website/pull/85)
contains the source; its checks and advisory comment record latest-revision review.
The [candidate receipt](../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json) identifies
runtime commit `40cd42a35f838c95c9d3d49b99f8e56f4c46a725`, deploy
`6ad405d1f124f04f96f5fe3a`, and manifest SHA-256
`686d75a4dfa750bec333cd2e1ae2ede4a82f90000403941a0a6d5cb86957f77e`.

All 2,072 local files match the hosted provider inventory by hash and size.
Netlify normalizes inventory path case; there are no normalized path collisions.
Its additional record is deployment metadata. All 1,985 protected files are exact;
seven existing redirect rules and ten header rules processed without errors.
No functions or edge functions were deployed. Production remains unchanged.

| Acceptance | Result |
| --- | --- |
| Both audiences at 360/390/430/768/1440/1920px | Passed locally and on the exact hosted draft |
| Native chapters, direct hashes, back/forward, reload and focus | Passed |
| Menu lettering, keyboard containment, Escape and focus restoration | Passed |
| Touch targets, long labels, orientation, horizontal overflow | Passed; 200% desktop CSS-viewport equivalent also checked |
| Six recordings, playback, skills, workouts, AI handoff, technique and mobile media | Passed |
| Coach team/player selections and Plan → Train → Retest | Passed |
| Sound opt-in/session behavior | Passed |
| No JavaScript, reduced motion, no WebGL, failed media and rejected imports | Passed; failures remain isolated and recovery is explicit |
| Local guarded browser suite / exact hosted suite | 33/33 each; 43 screenshots each |
| Unexpected origin failures / browser exceptions / attempted writes | Zero in both final runs |
| CI for runtime source | All lanes pass: 1,975 frontend tests, 76 tooling/release tests, 32 policy tests, 7 guest smoke cases, builds/types/Svelte/lint/transport/dependency checks |

The final hosted suite corrected a test readiness race: with JavaScript disabled,
DOMContentLoaded can precede remote stylesheet completion. That case now waits for
load before reading layout. Native history checks also wait for smooth scrolling
to settle. These changes preserve the assertions and require no runtime rebuild.

Evidence lives in ignored `artifacts/marketing-revamp/`: `acceptance.json`,
`hosted-final/acceptance.json`, `performance.json`, `artifact-manifest.json`,
`draft-verification.json` and `rollback/verification.json`. Representative captures
are `players-1440-hero.png`, `players-390-hero.png`, `players-390-menu.png`,
`coaches-1440-footer.png`, and matching hosted captures under `hosted-final/`.
These contain existing sample data only. A guarded local preview is available at
`http://127.0.0.1:4177` during this workstation session.

Three cold-context local samples show initial JS+CSS decreases of 73,503 bytes
(Players) and 72,534 bytes (Coaches), with unchanged request counts and zero initial
requests for decorative logo helpers. All 27 content/media/brand files (3,934,045
bytes) are identical. Median local first paint was 52→68ms and 60→72ms respectively.
The comparison uses the existing October 14 compiled artifact, uncompressed local
servers and blocked external fonts; it does not establish CDN, mobile or field
speed, or attribute every dependency difference to this revamp.

Previous marketing HTML was recovered through the provider raw-file API and
verified against the serving inventory: `/index.html` SHA-1
`9e6e486665e3fdd1257c23fe8a69cf8e72e619e4`; `/coaches/index.html` SHA-1
`829a6277b98f9f62b39908d1a3a39c230ae0efe1`. The PR remains unmerged for human visual
acceptance. Production promotion and post-promotion baseline reconciliation are
separate remaining release steps.
