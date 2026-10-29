# Public-site first interaction and editorial pacing

This follow-up supersedes the independent-column presentation in
[the composition checkpoint](PUBLIC_SITE_COMPOSITION.md). Players and Coaches
use sequential chapters, compact demonstrations and inline detail expansion.
This is public marketing work; no production promotion, application release,
API, authentication or persisted-data change is included.

The [interaction polish follow-up](PUBLIC_SITE_INTERACTION_POLISH.md) records
the newer comparison, partial-menu dismissal correction and closing timing.
The numerical acceptance below describes the preceding checkpoint. Use the
current machine-readable candidate receipt for the latest artifact and results.

## Evidence and chosen behavior

The October 18 REA pass revisited Lain Works at 1440×1000 and 390×844. Timed
entry/settled/forward/reverse captures confirmed that entering media resolves
from pixelation while previously read content stays clear when revisited. The
reference does not fade Works cards according to distance from viewport centre.
The cookie banner obscured part of the reference's lower-right region; these
captures do not establish exhaustive footer behavior. No reference assets or
scripts are shipped.

REA records:

- Desktop: `ev_02a7c55affed09431bbe5d754352cf13199b33487dab165a1b244cc9a8dbeb82`
- Phone viewport: `ev_23e0bd60db8677b9c7796eaa770192f6475eb212b55155194890a0162e35697b`

The ignored full bundle and captures are in `artifacts/marketing-motion-plan/`.
That folder also records the pre-change hardware diagnosis: Apple M5/Metal
context, extension and first-frame work delayed trusted menu input by about
235ms on desktop and 302ms at a 390px touch viewport. Holding the page import
also showed that the first pre-hydration Menu click was lost. SwiftShader traces
are retained separately and are not presented as hardware measurements.

The user selected a guided editorial rhythm and compact, expandable demos.
Players remains tests → profile → training → AI Coach/retesting → technique →
mobile. Coaches remains club → player → development → enquiry. Every chapter
introduces its heading and short explanation before evidence. Prominent and
supporting panels alternate in width and alignment, without visual reordering.

## Navigation and renderer ownership

Astro renders the header outside the React page island. A small inline controller
owns its state permanently. Native details/summary navigation works before
that controller and without JavaScript; enhancement adopts an already-open
state. The same controller serves the legacy entry. Optional pointer previews,
label scrambling and session-only sound cannot gate navigation.

The controller synchronously publishes opening/open/closing/closed phases.
Focus containment, Escape, inert background, scroll restoration and ordinary
fragment history belong to it, not the page island. Other effects observe its
current phase when they mount and suspend during menu activity.

The chapter indicator renders into a dedicated slot in that static header at
every viewport width. Its baseline stays inside the header, clear of navigation
targets and scrolling demo controls. It is hidden during every non-closed menu
phase; phone layouts omit the longer chapter label. The acceptance harness checks
both bounds and actual occlusion, including the landscape width between the
header and content breakpoints.

Hero and dimensional-logo rendering use module workers and directly transferred
OffscreenCanvas canvases. Context/extension queries, Three scene construction,
material preparation and drawing run in the worker. No pixels or ImageBitmaps
shuttle through the main thread. The approved P geometry is derived from the
approved logo, with its source identity retained. All hero material variants are
prepared before showing the canvas, including Shooting's ball.

The selected SVG remains visible until an actual first worker frame is complete.
Selections made during loading remain authoritative. Navigation/visibility
changes pause preparation and drawing without destroying live instances. Worker
messages carry generation ownership; stale results cannot replace a newer
instance. Unsupported rendering, startup failure or the bounded startup timeout
keeps truthful SVG instructions. There is no main-thread WebGL fallback.

Workers share the browser GPU/compositor. Moving work to a worker is not itself
performance acceptance: measured input and first-presentation behavior remain
required. Reduced motion keeps the static logo and removes automatic motion.

## Demonstrations and motion

One Explore full demo / Show less disclosure controls details in each demo.
The subtree remains mounted when collapsed, preserving selections, media playhead
positions and local progression. Collapse pauses demonstration videos and an
active workout timer; reopening retains that state, and Resume expands the
workout before continuing its existing progress. The collapse control remains
in view below the header even when a touch interaction did not focus it.
Starting a workout or accepting the AI handoff expands Training before scrolling
and focusing it. Sample/recorded/illustrative labels remain visible in both
states, including the skipped-ahead qualifier on a completed sample session.
No nested scrolling or fixed-height clipping is used to force a panel into its
target size.

Shared entrance timings are 320ms for headings/support, 640ms for media and
80ms internal staggering. The stepped pixel mask uses opaque cells, avoiding
48 overlapping backdrop-blur surfaces. Untouched media rearms only when wholly below the
viewport. Used or expanded demos do not replay an obscuring reveal; focus and
pointer interaction settle effects immediately. Only bounded artwork layers
respond to pointer/scroll motion. Controls, text and chapter geometry stay still.
Offscreen/hidden work pauses, and reduced motion removes decorative entrances.
Native anchors and browser history retain late-reflow protection.

The gallery keeps document-space fragment geometry and compensates later demo
reflow without resetting a restored history offset. A separate one-time repair
applies only to an initial document reload with an unchanged fragment: after
the browser restores its previous absolute scroll position, the fragment is
aligned to its scroll margin. This prevents a shorter, not-yet-loaded chapter
from leaving the requested heading above the viewport. Ordinary back/forward
and back-forward-cache restoration keep their native offsets. A changed hash or
deliberate scrolling/control interaction cancels the pending reload correction;
it cannot reacquire ownership after visitor takeover.

## Acceptance and release

Run the standing CI lanes and the regression, detail, composition and cold-start
browser harnesses against the exact compiled candidate. Cold checks arm before
navigation; they do not wait for hydration or renderer readiness before input.
Supported hardware cases require actual worker WebGL frames and zero main-thread
WebGL contexts. Static fallback is tested separately.

The cold budget is input processing ≤100ms per sample, median ≤50ms, visible
feedback ≤200ms, and no ≥100ms main-thread task overlapping menu interaction or
first presentation. Hardware and software-renderer results are labelled
separately. Touch viewport and WebKit coverage do not claim physical iOS/Android
acceptance.

Assemble with `node scripts/build-production.mjs` and verify every protected
application, feedback and coach-enrollment byte. The candidate receipt identifies
the immutable reviewed source, artifact, hosted acceptance and latest-revision
review. Main auto-publishes: keep PR #85 unmerged until exact-candidate acceptance
and a separate production-release instruction. Preserve previous immutable
marketing bytes and then-current application bytes for forward recovery.


## October 18 cold-start evidence

The guarded 13:05:20 local build passed 29 Chromium cold-start checks, four
WebKit support checks and two bounded 4× CPU diagnostics. The hardware lane
used Apple M5 / Metal, five fresh browser processes each at 1440px and a 390px
touch viewport. Median input delay was 0.2ms desktop and 8.2ms touch; maximum
input delay across the lane was 20.8ms and maximum visible feedback was 95.5ms.
No main-thread WebGL context was created. These measurements apply to this
workstation and compiled artifact, not every physical mobile device.

Earlier attempts remain in the ignored evidence directory. They include an
unattributed 269ms main-thread task and a separate 259.3ms touch delay associated
with a 267.98ms GPU raster flush in a static-fallback case. A three-pair mask
comparison did not establish causation; removing tile backdrop filters is not
presented as proof that it fixed that isolated flush. The complete final suite
passed without relaxing budgets. Harness serialization and visibility setup
failures are retained separately from product timing failures.

Native tab backgrounding and window minimization did not change document
visibility on this automation host. Hidden-page pause checks therefore use
explicit property/event injection while checking actual worker frame counts;
they do not claim real OS-tab integration. WebKit and touch coverage use desktop
emulation. Fresh browser HTTP caches and workers do not clear OS/driver caches.


## Loading comparison

Three local, uncompressed iterations compare the guarded artifact with the
pre-existing compiled baseline; its full source/dependency revision is not
inferred. Players requests 729,406 bytes of page JavaScript plus a 596,796-byte
hero worker (1,326,202 combined, down from 1,672,741). Coaches requests 267,611
bytes of JavaScript (down from 359,623). CSS increases by 104,222 and 104,374 bytes
respectively. Footer workers remain absent until their panel becomes visible.
All 27 original source media/content/brand files remain exact at 3,934,045 bytes;
the additional 1,510-byte P geometry matches the approved SVG contour.

These are local asset/loading observations, with external fonts excluded and a
headless software renderer. They are separate from the hardware cold-input lane
and do not establish hosted or physical-mobile speed. Full methodology and
baseline/candidate fingerprints are in the ignored `performance.json` report.


The first hosted detail run passed 19/20. Its footer-choreography setup jumped
past a still-loading movement panel, which then grew by 332px and moved the
footer below the asserted entrance position. The focused trace reproduced the
geometry change. That test now traverses the preceding chapters and waits for
their demos before placing the footer once; its entrance/progress, re-entry and
explicit-navigation assertions remain strict. The original report and diagnostic
are retained. Cold footer startup and first-input checks remain separate.


## Preceding candidate and interaction checklist

The preceding review draft is
[6ad528ef95dcde1f17049c13](https://6ad528ef95dcde1f17049c13--posetek.netlify.app),
assembled from runtime source `9f7787af19ad383de0f64effdb9e5e2c45e7962f`.
The 2,003-file artifact has manifest SHA-256
`994864c12e139439bd8ead527c29e43a671c9448a546c4a91d0fc52244a87e20`.
Provider inventory matches every file, and all 1,985 protected files remain
byte-identical. No production promotion occurred. See
[the machine-readable receipt](../../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json)
for complete local/hosted results, performance, review and recovery evidence.

The regression/detail/composition suites pass 79 checks locally and 79 hosted,
with 112 screenshots for each environment. The ignored visual index at
`artifacts/marketing-first-interaction/visual-review.md` links the final desktop,
phone and landscape captures, including the compact-demo preservation matrix.

- [x] Menu opens before hydration; focus remains contained through closing, Escape restores the opener, and native no-JavaScript links work.
- [x] Movement recordings, playback, scrubbers, test/skill/team/player choices and technique controls remain connected.
- [x] Workout Start/Resume, progression, sample qualifiers and AI handoff survive inline expand/collapse.
- [x] Six Players and four Coaches chapters retain source order, aliases and destinations.
- [x] Native fragment navigation, reload and browser back/forward remain aligned after lazy content loads.
- [x] Entrances settle before control interaction; revisiting used demos does not obscure them.
- [x] Pointer labels, link feedback, menu miniatures and closing re-entry behave consistently; scrolling never follows the next-audience link automatically.
- [x] Reduced motion retains static content; unavailable WebGL, failed media and failed lazy imports retain usable controls and recovery.
- [x] Sound defaults off and remembers opt-in only for the browsing session.
- [x] 360/390/430/768/1440/1920px, 730px landscape, long labels and 200% CSS-viewport zoom equivalent retain readable content without horizontal overflow.
- [x] Header chapter status remains actually visible and clear of controls at every tested width.

Local verification passed 2,014 frontend tests, 78 release/tooling tests and the
ordinary guarded build. Six CI jobs passed for the runtime source, including
TypeScript/Astro, Svelte, policy, dependency checks and guest smoke tests. The
latest documentation/harness head receives its own CI and advisory review on
[PR #85](https://github.com/posetek/posetek_website/pull/85). Review is same-provider
and includes disclosed component authorship; it is not production approval.


The exact hosted candidate also passed all 29 cold-start checks and four WebKit
support checks. Hosted median input delay was 0.2ms desktop and 8.2ms touch;
maximum input delay was 25.5ms and visible feedback 106.7ms. The same physical
device, visibility and cache limits apply. The unpublished candidate remains
separate from production deploy `6ad02adfcc90dffdb496f811`.
