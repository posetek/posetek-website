# Public-site showcase depth — unpublished candidate

This follow-up replaces the public pages' compact live-demo cards with original
4:3 preview artwork and explicitly opened, full-size inline demonstrations. It
is a source candidate, **not a production release**. The [October 18 public-site
release](PUBLIC_SITE_REVAMP_RELEASE.md) remains the production record. Candidate
identity, exact-artifact acceptance, hosted evidence and review are pending in
the table below; earlier release results do not verify this change.

The scope is Players and Coaches marketing only. Existing public copy, sample
data, recordings, booking/enquiry/sign-in destinations and chapter sequence are
retained. There are no API, authentication, persisted-data or signed-in-screen
changes.

## Browse first, open the demonstration

At widths of at least 1024px, two 4:3 previews form each staggered pair. The right
preview begins `clamp(96px, 16vw, 240px)` lower. Captions remain DOM text beneath
the artwork; their sample/recorded/illustrative qualifiers are always present.
Below that breakpoint, every chapter follows its ordinary single-column source
order. Static layout provides the stagger: scroll effects do not move control
hit areas or reorder the document.

| Audience | Chapter order | Full experience |
| --- | --- | --- |
| Players | Testing/review → athlete profile → training → AI Coach/retesting → technique → mobile | Six retained demo slots in three pairs |
| Coaches | Club overview → player evidence → development → team enquiry | Three retained demo slots and a native enquiry link in two pairs |

The preview and “Explore full demo” button open the same panel. Desktop panels
span both columns below their pair; mobile panels remain in normal page flow.
Only one panel is open at a time. Opening focuses its heading and scrolls it
below the header. Closing returns focus to the actual preview or caption opener and brings that
control into view when necessary. Programmatic opens use the caption action. No modal, internal scroll container, scaled
live UI or fixed-height clipping is used for the demonstrations.

Demo content first mounts when requested and stays mounted after closing.
Closed panels are hidden and inert. Their activity context pauses playback,
timers and rendering while preserving local selections, playheads and progress.
The workout request from AI Coach opens Training and focuses its destination;
club, player and development selections continue sharing the existing state.
The existing lazy-demo failure and explicit retry/reload recovery remain
independent of decorative rendering.

Chapter links continue to use native fragments. Ordinary chapter hashes land
on previews; the existing `#how-it-works` movement alias opens its real demo,
while `#retest` remains the AI Coach chapter alias. Panel-owned destinations
open their owner before positioning. The retained gallery controller compensates
late content growth, preserves relative history offsets and handles initial
reload restoration. Explicit user scrolling or control interaction relinquishes
that positioning ownership. Opening/closing a demo does not manufacture a new
route or replace browser history.

Without JavaScript, artwork, captions, qualifiers, chapter links and external
actions remain readable and usable. Inactive demo buttons do not pretend to
work; a short message explains that interactive demos require JavaScript.
The existing hydration-independent menu, partial-entrance dismissal, keyboard
focus handling, session-only opt-in sound and explicit-click closing navigation
remain the contracts described in the [first-interaction guide](PUBLIC_SITE_FIRST_INTERACTION.md)
and [interaction polish guide](PUBLIC_SITE_INTERACTION_POLISH.md).

## Original artwork and provenance

Ten editable SVG compositions produce 1200×900 and 600×450 WebP variants. They
are original editorial arrangements of approved public PoseTek sources, not
screenshots of live accounts or copied reference imagery. The visible qualifier
beside each preview remains authoritative: a fictional score or illustrative
improvement must not be described as a recorded athlete result.

| Artwork | Approved source material |
| --- | --- |
| Players testing | Exact public sprint landmark frames and existing pose edges |
| Players profile | Alex Johnson's existing illustrative five-skill scores |
| Players training | Public sample workout, existing Figure-8 geometry and approved drill poster |
| Players AI Coach | Existing sample-athlete dribbling history and comparison copy |
| Players technique | Saved recorded backswing/contact geometry and the existing contact knee measurement |
| Players mobile | Original phone composition with the existing workout route and brand mark |
| Coaches club | Existing Northfield sample teams and player numbers |
| Coaches evidence | Alex Rivera's existing illustrative profile and five scores |
| Coaches development | Existing illustrative Plan/Train/Retest values and Figure-8 coaching geometry |
| Coaches enquiry | Approved PoseTek P mark and existing team-enquiry message |

[The authoring notes](../app/src/pages/home/showcase-assets/README.md) describe
regeneration and font-environment limits. [The provenance manifest](../app/src/pages/home/showcase-assets/provenance.json)
records each source, transformation, source SHA-256 and output SHA-256. The
restyled Coaches page also pins the exact reused ClubPreview function and
enquiry copy excerpts so layout changes do not masquerade as content changes. The
[generator](../scripts/generate-showcase-artwork.mjs) reads local files only and
uses the existing Astro/Sharp dependency. No new dependency or remote asset
fetch is needed.

The [runtime manifest](../app/src/pages/home/showcase-artwork.ts) contains only
`src`, `srcSmall`, `alt`, `title`, `qualifier`, `width` and `height`. Explicit
`?url` imports emit hashed same-origin `/_astro` assets, which the guarded
marketing builder can merge. Editable SVGs and detailed provenance are not
imported into the public JavaScript bundle. Repeated image generation is
byte-stable in the same Node/Sharp/font environment; cross-platform font
rasterization is not assumed identical.

## Reference evidence and motion decisions

The existing read-only REA investigation of [Lain Works](https://lainagency.com/works)
provides both runtime samples and an exact shipped-source analysis. Its retained
ledger is `artifacts/marketing-detail/source-findings.md` in the prior
`public-site-revamp` worktree; the tracked [interaction ledger](PUBLIC_SITE_INTERACTION_DETAILS.md)
records its provenance and limitations.

- Exact reference JavaScript: `lain.min.js?v=bbaff34d`, SHA-256
  `d5748bd85d6d1e94711f97d51e22bdb7afe45d39d6e25e79fbc16fc0d4d09e6e`.
- Exact reference CSS: `lain-c5073a.webflow.css?v=8570ef69`, SHA-256
  `b5fdd0befefe5b9b3442c8d1bee2c67dbdba445eae863ed46014b360c1f55439`.
- REA source evidence: `ev_9147166c557eb4cb2cb3ad275f1cdbb64362e24e3299aa66429585d932bb7e94`;
  summary `ev_b410bc0e5b7a804edf337b91184497c396febc7c20a3f4da086163943cfeae90`.
- Later desktop and phone runtime scenarios:
  `ev_91d60b4e8f17145a33fd4d3de7d34757b0123802f55791fe89dc3cb3e931cbe0`
  and `ev_da3cebb102012f882e429148627f9a5b0db912e200e4ba6146bf7f881fccb577`.

The reference semantic graph reached its 20,000-node ceiling. Exact function
inspection establishes the formulas below; it does not prove every rendered
frame or complete application behavior. Later screenshots corroborate the
composition/menu experience, but the reference cookie banner obscures some
content and the later direct script fetch returned 403. No newly measured
reference digest or exhaustive physical-device result is claimed.

| Source-defined Lain behavior | Showcase candidate adaptation |
| --- | --- |
| Right column starts 16vw lower and scrubs from +6vw to −30vw | Static paired 16vw stagger, bounded at the layout extremes; native chapter geometry stays stable while an inline demo is open |
| Segmented WebGL surfaces bend with `min(abs(velocity)/45, 1) × .34`, rise rate 10 and decay rate 4 | A segmented gallery plane uses the same bounded strength and damping, with native scroll velocity normalized to a 60Hz frame; this deforms artwork in viewport space, not the live demo |
| Media pixel reveal lasts about 1500ms | Bounded 650ms texture reveal uses 64/32/16/8/4/2/1 pixel steps; first pointer/focus input restores sharp DOM artwork immediately |
| Hover zoom reaches 1.12, with ±6°/±8° tilt and a short blur pulse | Artwork zoom reaches 1.08, with ±4°/±6° tilt and a bounded 640ms sharpening pulse; original DOM hit areas remain stationary |
| SEE DETAIL label stays centered on hovered media | A centered bracketed Explore demo hint accompanies a real button; keyboard and touch retain visible text actions |
| Works cards are not proven to fade by distance from viewport center | Captions remain readable; no center-distance dimming is introduced |
| Category controls remove/reflow projects | PoseTek keeps every chapter available; native chapter navigation preserves the complete information flow |

The gallery uses **one worker-owned scene/context for its previews**, not a
worker or canvas per card. Existing hero and footer workers retain their own
ownership; “one gallery worker” does not mean one worker for the whole page.
The scene retains at most four nearby textures. Same-origin WebP images are
decoded to ImageBitmap inside the worker; no live DOM or demo controls are
captured. A segmented mesh supplies actual perspective curvature, while each
draw is clipped to its source frame.

The DOM image stays visible until current-revision telemetry confirms that its
texture was drawn. Scroll compensation keeps the last presented frame attached
to native layout between worker updates, and stale layout revisions cannot
replace current content. Layout reads are batched before writes. Closed/menu,
hidden-page, offscreen, keyboard-control-focus and expanded-demo states suspend
gallery enhancement; first input settles its own chapter reveal. Lightweight
reveal progress survives texture eviction: passed content remains sharp, and
only a full exit below the viewport rearms that chapter. Texture eviction disposes
GPU resources and closes bitmaps. Unsupported workers/WebGL, failed decorative
imports or failed textures retain the ordinary DOM artwork and actions.

Gallery depth is enabled only for fine-pointer desktop at 1024px and above with
no reduced-motion preference. Touch/smaller layouts and live reduced motion keep
static artwork. Idle motion settles rather than drawing continuously. Worker
ownership alone does not establish smoothness: real first-frame and cold-menu
performance acceptance is still required and remains pending for this candidate.

## Interaction checklist for acceptance

These are required checks, **not completed-result assertions**.

- [ ] Both audiences retain chapter/source order, aliases, metadata and destinations at 360/390/430/768/1440/1920px, landscape and zoom.
- [ ] Preview and text actions open the same full-size demo; only one panel is operable, Close restores focus, and all targets remain at least 44px where required.
- [ ] Movement selection/playback, profile buttons, workout progression, AI handoff, technique controls and Coaches team/player/Plan–Train–Retest survive switching panels.
- [ ] Native hashes, the movement alias, reload and back/forward remain stable during real delayed demo loading.
- [ ] Desktop scroll bend and hover sharpening draw actual worker frames, stay within source frames, settle at idle and never move controls.
- [ ] Menu opening, touch, keyboard focus, hidden-page lifecycle and live reduced motion restore static previews and pause work without destroying demo state.
- [ ] No JavaScript, unavailable WebGL/worker support, blocked decorative imports, failed textures and independent demo retry retain truthful usable content.
- [ ] Existing menu first-input, partial close, preview positioning, sound and footer explicit-navigation checks still pass.
- [ ] Cold input is observed before readiness; real supported-worker presentation is required. Input ≤100ms, median ≤50ms, feedback ≤200ms and no ≥100ms overlapping main-thread task retain their existing budgets.
- [ ] The exact guarded artifact preserves every protected application, feedback and coach-enrollment byte; hosted acceptance and latest-revision review name that same candidate.

The legacy `marketing-composition.browser.mjs` entry delegates to the showcase
suite; running both does not supply independent or additional coverage.

## Reproduce

Use the repository's configured Node/dependency environment. Run focused tests
first, then the standing CI commands in the [validation guide](engineering/DEVELOPMENT_AND_VALIDATION.md).
Artwork regeneration changes checked-in authoring outputs; it is not needed
merely to run the browser suites.

```sh
node scripts/generate-showcase-artwork.mjs
npm --prefix app test -- src/pages/home/showcase-gallery.test.tsx src/pages/home/marketing-showcase-motion.test.ts src/pages/home/marketing-renderer/gallery-scene.test.ts
npm --prefix app run check:svelte
npm --prefix app run build
node scripts/build-production.mjs
```

Run browser suites sequentially against the frozen guarded output. Keep each
report in a distinct directory; retain initial failures and their diagnosis.

```sh
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 MARKETING_ARTIFACTS=artifacts/marketing-showcase/local-showcase node --test scripts/marketing-showcase.browser.mjs
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 MARKETING_ARTIFACTS=artifacts/marketing-showcase/local-regression node --test scripts/marketing-revamp.browser.mjs
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 MARKETING_ARTIFACTS=artifacts/marketing-showcase/local-detail node --test scripts/marketing-detail.browser.mjs
```

Run the cold hardware lane only after all other browsers and CPU/GPU-heavy
checks stop. Do not add renderer-ready waits before its first input or disable
the renderer under test. Run WebKit support separately:

```sh
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 MARKETING_COLD_TRACE_ALL=1 MARKETING_ARTIFACTS=artifacts/marketing-showcase/local-cold node --test scripts/marketing-cold.browser.mjs
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 MARKETING_COLD_LANE=webkit MARKETING_ARTIFACTS=artifacts/marketing-showcase/local-webkit node --test scripts/marketing-cold.browser.mjs
```

For hosted candidate acceptance, set `MARKETING_ORIGIN` to the exact immutable
`https://<24-hex-deploy-id>--posetek.netlify.app` URL recorded below and use
separate hosted artifact directories. The harnesses permit only GET/HEAD on the
tested origin, optional Google font GET requests, and no WebSockets or writes.
Production origin support does not authorize promoting or testing a different
candidate. No build should run while evidence is being captured.

## Candidate receipt — pending

| Required record | Status |
| --- | --- |
| Reviewed source commit / PR | Pending |
| Guarded artifact manifest SHA-256 / file count | Pending |
| Protected-file comparison against the current production baseline | Pending |
| Local showcase, regression and detail reports | Pending |
| Local cold hardware / WebKit results and actual GPU identity | Pending |
| Immutable hosted candidate URL / deploy ID | Pending |
| Provider inventory and exact-artifact match | Pending |
| Hosted interaction, cold and fallback acceptance | Pending |
| Final responsive visual review and screenshot index | Pending |
| Loading/asset comparison and limitations | Pending |
| Standing CI and completed latest-revision review | Pending |
| Rollback evidence / production promotion / baseline reconciliation | Pending; no showcase promotion recorded |

Preliminary source-preview observations and artwork checks are retained under
ignored `artifacts/showcase-artwork/`, including the editable-source verification,
contact sheet, four desktop/mobile visual cases and 18 viewport captures. They
are not an exact-candidate receipt. The early visual pass found a radar label
crossing its dark backing; that owned artwork was corrected. Subsequent final
captures must reflect the final captions, renderer and hash behavior.

Desktop viewport emulation is not physical iOS/Android coverage. Hardware and
software-renderer measurements must be labelled separately. The existing host's
controlled visibility injection does not establish actual OS-tab backgrounding;
fresh browser caches also do not clear OS/driver shader caches. Preserve these
limits in final acceptance rather than converting pending evidence into a
general performance claim.
