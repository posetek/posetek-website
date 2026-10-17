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
masked headings, short tiled reveals, decorative pointer labels and bracket
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
All writes, analytics, external application traffic and WebSockets are blocked.
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
