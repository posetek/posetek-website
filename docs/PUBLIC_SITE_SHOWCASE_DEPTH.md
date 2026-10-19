# Public-site showcase depth — implementation and candidate evidence

This implementation replaces compact live-demo cards with original 4:3 preview
artwork and explicitly opened, full-size inline demonstrations. The accepted
candidate was promoted unchanged on October 18, 2026 at 20:37:19 PDT. Read the
[current production release](PUBLIC_SITE_SHOWCASE_RELEASE.md) and
[production receipt](../deployment/PUBLIC_SITE_SHOWCASE_PRODUCTION.json).

The details and candidate checklist below retain the pre-publication evidence,
including its timing qualifications. Their pending production items describe that
historical checkpoint; the production receipt establishes subsequent publication,
live checks and baseline reconciliation. The [immutable accepted artifact](https://6ad58598033b1b6ba8b4d6c2--posetek.netlify.app)
remains available. Earlier release results do not verify this change.

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
open their owner synchronously before native positioning. Their alias nodes
remain inside the stable panel slots. The retained gallery controller compensates
late content growth and handles initial reload restoration. Browser traversal
owns its scroll position; no extra panel-top scroll runs on Back/Forward.
In the tested Chromium environment, Back canonicalizes the earlier fragment
while Forward restores a nonzero reading offset. A plain HTML control with no
PoseTek code reproduces this behavior; nonzero Back restoration is not claimed. Explicit user scrolling or control interaction relinquishes
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

The follow-up REA desktop/phone reference captures are
`ev_bdd15238780acba78c4c1cc187545acb1a28e010a2ac2f565edd44a84bf0cbb0`
and `ev_3fb04348e444840840637acad4e786d550ae5b6b9d4f737e86e0858a2ef9250c`.
A final 390×844 capture against the frozen guarded local artifact is
`ev_07a2ac8b9f7c21c4e46b8725f7a93194f465160b4a04c8b18f564ecbdd823034`.
It shows settled 4:3 previews, compact action rows and native scroll progression.
REA did not supply a browser-target artifact digest; the separate frozen manifest
and provider verification below establish artifact identity. Screenshots are
visual evidence, not input-latency or physical-device measurements.

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
performance is measured separately in the hardware results and retained diagnostics below.

## Interaction checklist for acceptance

Checked items below passed the frozen local and hosted candidate suites. Cold
timing and its diagnostic qualifications are separately identified in the receipt.

- [x] Both audiences retain chapter/source order, aliases, metadata and destinations at 360/390/430/768/1440/1920px, landscape and zoom.
- [x] Preview and text actions open the same full-size demo; only one panel is operable, Close restores focus, and all targets remain at least 44px where required.
- [x] Movement selection/playback, profile buttons, workout progression, AI handoff, technique controls and Coaches team/player/Plan–Train–Retest survive switching panels.
- [x] Native hashes, the movement alias, reload and back/forward remain stable during real delayed demo loading.
- [x] Desktop scroll bend and hover sharpening draw actual worker frames, stay within source frames, settle at idle and never move controls.
- [x] Menu opening, touch, keyboard focus, hidden-page lifecycle and live reduced motion restore static previews and pause work without destroying demo state.
- [x] No JavaScript, unavailable WebGL/worker support, blocked decorative imports, failed textures and independent demo retry retain truthful usable content.
- [x] Existing menu first-input, partial close, preview positioning, sound and footer explicit-navigation checks still pass.
- [x] Cold input is observed before readiness; real supported-worker presentation is required. Input ≤100ms, median ≤50ms, feedback ≤200ms and no ≥100ms overlapping main-thread task retain their existing budgets.
- [x] The exact guarded artifact preserves all 2,001 protected application, feedback and coach-enrollment files; hosted acceptance names that immutable candidate.
- [x] Source checks and advisory review are linked to their specific revisions; final-head completion is recorded on PR #86 before delivery.
- [ ] Owner production acceptance, guarded promotion, live verification and baseline reconciliation remain separate release steps.

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
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 MARKETING_COLD_LANE=webkit MARKETING_COLD_HEADLESS=1 MARKETING_ARTIFACTS=artifacts/marketing-showcase/local-webkit node --test scripts/marketing-cold.browser.mjs
```

For hosted candidate acceptance, set `MARKETING_ORIGIN` to the exact immutable
`https://<24-hex-deploy-id>--posetek.netlify.app` URL recorded below and use
separate hosted artifact directories. The harnesses permit only GET/HEAD on the
tested origin, optional Google font GET requests, and no WebSockets or writes.
Production origin support does not authorize promoting or testing a different
candidate. No build should run while evidence is being captured.

## Historical candidate receipt — before promotion

| Required record | Status |
| --- | --- |
| Runtime source commit / PR | `785da39a9e65927016066254a611906b0bf0b4fb`; [PR #86](https://github.com/posetek/posetek_website/pull/86); later harness/receipt changes do not rebuild this artifact |
| Guarded artifact manifest SHA-256 / file count | `380d9f34411a1aba31b375c6b19969bbc2b85b33c81935b2c4624de32b7c3df2`; 2,108 files |
| Protected-file comparison against the current production baseline | All 2,001 protected files match; zero mismatches or removals |
| Local showcase, regression and detail reports | 37 + 33 + 21 = 91 passed; 128 captures; zero unexpected origin failures, writes or uncaught errors. `artifacts/showcase-depth/final-local/{showcase-final,revamp,detail}/` |
| Local cold hardware / WebKit results and actual GPU identity | 43/43 checks passed; exclude the first SSR case from clean-input evidence because passive recording found 13 extra wheel events. Remaining timing passes; maximum input 16.4ms, feedback 140.6ms. Apple M5 / ANGLE Metal, Chromium 153.0.8010.12. Headless WebKit 4/4 support checks passed |
| Immutable hosted candidate URL / deploy ID | [Preview](https://6ad58598033b1b6ba8b4d6c2--posetek.netlify.app); `6ad58598033b1b6ba8b4d6c2`; ready, unpublished |
| Provider inventory and exact-artifact match | 2,109 provider records; all 2,108 artifact files match; extra `/netlify.toml` is provider metadata |
| Hosted interaction, cold and fallback acceptance | Functional 37 + 33 + 21 = 91 passed; 176 captures. Headless WebKit 4/4 passed. Headful cold run 42/43: all timing/idle checks passed, maximum input 11ms and feedback 140.6ms; the sole autoplay-label test race is diagnosed below. Corrected five-fault recovery suite passed 5/5 headless; it is functional support evidence. `artifacts/showcase-depth/final-hosted/` |
| Final responsive visual review and screenshot index | 43 settled hero/demo/menu/footer captures inspected; all six widths and full panels at 390/1440px; no new layout defect found. Artwork-author self-review, not independent visual acceptance. Local capture index: `artifacts/showcase-depth/REVIEW.md`; two element-only captures remove fixed site chrome for clarity, with original captures and unmodified viewport evidence retained |
| Loading/asset comparison and limitations | Three cold-cache desktop samples per audience/artifact; all content/provenance and lazy/failure checks pass. `artifacts/showcase-release/performance.json`; details below |
| Standing CI and completed latest-revision review | Runtime head passed all six required lanes. [PR #86 checks](https://github.com/posetek/posetek_website/pull/86/checks) and its commit-pinned advisory review record the final harness/documentation head; they must name the current head before integration. Content-only OpenAI reviewer, no patch authorship; same provider, no hosted or GPU attestation |
| Rollback evidence / production promotion / baseline reconciliation | Production remains `6ad536a9103351c79863f77f`; its immutable deployment and verified local accepted artifact are retained for recovery. No showcase promotion or baseline reconciliation performed |

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

## Initial loading comparison

The comparison uses the previous release's exact accepted artifact and this
frozen candidate, three fresh Chromium contexts per page, a 1440×1000 viewport,
local uncompressed HTTP and a 2.5-second post-load window with no interaction.
Google Fonts GETs were allowed. These are local smoke measurements, not CDN,
mobile-network or field-performance claims. Page JavaScript and independently
observed worker-entry responses are counted separately, then added once.

| Median initial body bytes / paint | Players: previous → candidate | Coaches: previous → candidate |
| --- | --- | --- |
| Page JavaScript | 730,036 → 300,220 | 268,237 → 284,174 |
| Observed worker scripts | 596,796 → 602,694 | 0 → 0 |
| Initial preview/brand images | 838 → 331,514 | 838 → 153,068 |
| CSS | 208,817 → 219,381 | 186,084 → 196,648 |
| First contentful paint | 164 → 172ms | 160 → 156ms |
| Largest contentful paint | 208 → 204ms | 312 → 276ms |

Players defers full working-demo code until opening; its initially observed
JavaScript including the hero worker falls by 423,918 bytes. Coaches adds 15,937
JavaScript bytes and both pages add compressed preview imagery. This is an
explicit artwork/loading tradeoff, not an across-the-board transfer reduction.
The browser may preload nearby lazy images; the image rows include actual
requests in the measured window. Neither page allocates the footer worker
before it enters view, and full demo modules remain absent until requested.
All 28 retained content/media/brand source files and all 30 new authored artwork
outputs pass their hash/provenance checks. Both artifact fingerprints remain
unchanged throughout sampling.

## Retained diagnostics

The initial final-local cold run passed 42/43 checks. Its first Players desktop
menu opening, while page hydration was deliberately held, recorded 312ms of
visible-feedback latency against the unchanged 200ms budget. Pointer delay was
1.1ms, click delay 0ms and no long main-thread task was recorded. The trace shows
a 256.41ms GPU raster-worker flush overlapping the input and a 250ms RAF gap.
The gallery module was not requested until after hydration was released and no
gallery worker existed during the failure. Font responses and preview-image
loading overlapped startup; the trace does not establish which resource or
driver behavior caused the GPU stall. The failed report and trace remain under
`artifacts/showcase-depth/final-local/cold/`. Five fresh candidate reproductions and three alternating previous-release
reproductions passed the same immediate-input test and unchanged budgets.
Candidate maximum feedback was 132.3ms; baseline maximum was 130.3ms. Candidate
GPU task maxima were 4.26–6.20ms, baseline 6.87–7.31ms, with zero long main-thread
tasks. The report is `artifacts/showcase-depth/final-local/ssr-reproductions/summary.json`.
The original causal limit remains: this observation is not erased by a later pass.

Earlier functional harness diagnostics are also retained. The reverse-reveal
check initially expected an evicted texture's reveal record to disappear, even
though lifecycle records intentionally survive texture residency. The corrected
check verifies an acknowledged worker view excluding the card and a second real
texture fetch on return, while requiring completed reveal metadata to survive.
The independent source reviewer confirmed the correction. Unexpected image
failures remain failures: an expected decorative cancellation requires the exact
preview URL, a decoded DOM original, `ERR_ABORTED` and matching worker cancellation
telemetry. Footer-placement and settled-capture corrections wait for the actual
Close/open native scrolling to finish; they do not change runtime geometry or
relax an interaction assertion.

A second full cold run passed 42/43 but its gallery-idle check was contaminated
by native input. The instrumented diagnostic recorded the one requested wheel
at `(10,140)`, followed by 54 additional trusted wheel events at `(655,604)`,
including horizontal deltas. The document moved with those events; no additional
application scroll API call occurred after initial fragment positioning. This
run remains in `final-local/cold-final/`, and the instrumented diagnostic is in
`final-local/gallery-scroll-diagnostic/`. It is not accepted as a clean idle
measurement. The user supplied an idle mouse/trackpad window for final timing.


The final local run (`final-local/cold-uncontended/`, a directory name rather
than a claim of input purity) passed 43/43. Passive recording nevertheless
found 13 extra trusted wheel events during its first SSR-held case, overlapping
first input. That case is excluded from clean-input timing evidence; all other
local cases contain only the intended input. The hosted run (`final-hosted/cold/`)
contains no extra wheel events, passes every timing and idle-rendering check,
and records maximum input delay 11ms, maximum visible feedback 140.6ms and no
100ms or longer overlapping main-thread task. The local maxima are 16.4ms and
140.6ms. Both use 41 retained traces, unchanged budgets, real worker presentation
and the Apple M5 / ANGLE Metal hardware renderer. Desktop touch emulation does
not establish physical-phone performance.

The hosted cold report remains **42/43**, not a rewritten clean pass. Its sole
failure waited for an exact “Play pose playback” label after a simulated gallery
shader error. A retained DOM diagnostic proves the full demo was ready and
intentionally autoplaying with “Pause pose playback,” `aria-pressed=true` and
slider value zero. The corrected assertion accepts either initial playback
state, scrubs to ten, then requires value ten and paused state. All five gallery
fault cases passed that stronger recovery assertion in a separate headless run
(`final-hosted/recovery-corrected/`, 5/5). This establishes functional recovery;
it does not replace or relabel headful hardware measurements. No runtime code,
readiness gate, latency budget or retry behavior changed for the correction.
