# Public-site first interaction and editorial pacing

This follow-up supersedes the independent-column presentation in
[the composition checkpoint](PUBLIC_SITE_COMPOSITION.md). Players and Coaches
use sequential chapters, compact demonstrations and inline detail expansion.
This is public marketing work; no production promotion, application release,
API, authentication or persisted-data change is included.

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
The subtree remains mounted when collapsed, preserving selectors, playback and
local progression. Starting a workout or accepting the AI handoff expands
Training before scrolling and focusing it. Sample/recorded/illustrative labels
remain visible in both states. No nested scrolling or fixed-height clipping is
used to force a panel into its target size.

Shared entrance timings are 320ms for headings/support, 640ms for media and
80ms internal staggering. The stepped pixel mask uses opaque cells, avoiding
48 overlapping backdrop-blur surfaces. Untouched media rearms only when wholly below the
viewport. Used or expanded demos do not replay an obscuring reveal; focus and
pointer interaction settle effects immediately. Only bounded artwork layers
respond to pointer/scroll motion. Controls, text and chapter geometry stay still.
Offscreen/hidden work pauses, and reduced motion removes decorative entrances.
Native anchors and browser history retain late-reflow protection.

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
