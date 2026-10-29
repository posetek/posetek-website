# Public-site interaction polish

This exact candidate was subsequently published on October 18, 2026. See the
[current production handoff](PUBLIC_SITE_REVAMP_RELEASE.md). The acceptance
records below describe its pre-publication verification.

This October 18 follow-up refines the existing Players and Coaches candidate.
It preserves the continuous chapter order, demonstrations, public destinations
and worker-owned rendering described in [the first-interaction guide](PUBLIC_SITE_FIRST_INTERACTION.md).
Production promotion remains separate.

## Comparison and decisions

Fresh REA scenarios exercised [Lain Works](https://lainagency.com/works) at
1440×1000 and 390×844, including
forward/reverse PageDown/PageUp navigation and menu opening/closing. The reference
keeps passed content legible, uses a staged curtain and masked navigation labels,
and gives its media room between short introductions. These observations support
the existing sequential PoseTek story; the portfolio's independent columns and
automatic next-page navigation are not appropriate for the approved demo flow.

- Reference desktop: `ev_91d60b4e8f17145a33fd4d3de7d34757b0123802f55791fe89dc3cb3e931cbe0`
- Reference phone viewport: `ev_da3cebb102012f882e429148627f9a5b0db912e200e4ba6146bf7f881fccb577`
- PoseTek desktop menu before correction: `ev_c1a78fa441f639e4fffdd871bfea998b797250c4f0f52af149ffad21cccf8a41`
- PoseTek phone menu before correction: `ev_e0ecae8c6c7f3c310452c6702ab1fcbc4e3236e096d876bbaeb608f52401e247`

Complete REA evidence and screenshots are retained in the ignored
`artifacts/marketing-polish/rea-comparison-final.json`. REA performed the declared
keyboard/click scenarios. The installed scenario tool does not expose pointer
hover; the earlier shipped-source hover ledger remains separate from the new
PoseTek pointer inspection. Reference cookies obscure some lower-right content.
Screenshots are visual samples, not frame-time measurements. Two initial PoseTek
menu scenarios used an incorrect selector and are retained as incomplete; corrected
scenarios above completed. A direct reference-script fetch returned 403, so this
pass does not assert a newly verified script digest.

## Corrections

- Interrupting menu entrance closes from the current curtain, letter and content
  state. It no longer exposes a fully open menu for a frame before dismissing.
  Curtain snapshots use the same `scaleY` transform function as the exit
  keyframe, preserving continuous interpolation to zero. Focus containment,
  400ms close ownership and renderer suspension remain intact.
- Menu miniatures start at their intended position while hidden, follow coalesced
  pointer updates and return to a neutral angle when the pointer stops. Closed
  navigation cannot activate previews. Close, sound and branding remain visible
  from the first frame, while the navigation lettering follows the curtain.
- The centered Coaches preview hint stays attached while scrolling under a
  stationary pointer, then disappears when the preview leaves that pointer.
  Menu activation, touch, keyboard focus and reduced motion clear the hint.
- Chapter arrows move in their actual direction without an inline rotation
  overriding hover feedback. Movement's outer frame now shares the square edges
  of the other public demonstrations.
- Each closing-heading glyph moves for 640ms, with an 80ms lead and 24ms
  staggering; the full phrase finishes in about 1.18 seconds. Supporting
  content takes 320ms and the audience preview 480ms. The scroll grid, reverse
  entrance and explicit destination click remain. Phone preview destination and
  description text are 14px and 12px.
- The Players hero retains a space between sentences when phone layouts hide
  its desktop line break.

## Verification

The immutable candidate receipt records the exact source, guarded artifact and
acceptance results after these changes. The initial desktop/phone transition
probe reproduced curtain coverage jumping from below 7% to 100% after Escape
around 120ms into entrance. Before captures are retained under
`artifacts/marketing-polish/before/`. The after probe at both widths recorded
zero increase in coverage at dismissal, with immediately visible Close controls.
The after index contains 67 desktop/phone captures plus the focused regression
capture. Both 360px and 390px closing invitations and destinations fit without
overflow. A stationary-pointer wheel test kept the Coaches hint exactly centered.

The first local detail suite passed 22/23 while other browser suites were running:
one warm menu sample skipped 366ms of frames and missed the intermediate curtain
range, with no main-thread long task recorded. Its readiness condition also treated
the initial SVG as a settled fallback. The corrected warm check waits for a real
worker presentation or an explicit failed renderer. The original failure is
retained. The isolated local run passed 23/23 with unchanged geometry assertions.
A later hosted phone-footer capture stopped at a valid partial scroll position
after preceding lazy content changed the document geometry. Its .8894 opacity
matched its actual 318.5px footer position. The warm capture now traverses and
awaits those chapters before a single placement, retaining strict opacity and
bounds checks; that evidence is retained separately. Cold-input acceptance has no warm readiness gate and runs
separately with real worker startup and hardware traces.

Review also found a stale detail-test counter that watched main-thread WebGL
after rendering had moved into a worker. The check now requires positive real
worker frame telemetry before verifying idle, offscreen and controlled-hidden
pauses. The separate cold suite already used that telemetry.

The first cold run passed 26/29. Its traces exposed a real interrupted-exit
regression: a captured `matrix(...)` start and singular `scaleY(0)` end switched
curtain coverage discretely rather than interpolating. Three closing-feedback
measurements exceeded the unchanged 200ms budget (201.9–213.7ms). Normalizing
curtain snapshots to `scaleY(d)` retains their measured coverage and gives both
keyframes the same transform function. A new detail assertion requires observed
intermediate shrinking frames. The new assertion reproduced the defect on both
desktop and touch against the
prior frozen artifact; its other three focused checks passed. Original cold
traces and the reproducer are retained; final acceptance belongs to the
corrected artifact. The final local desktop/touch Escape and Close probes each
observed 16 distinct first-slice scales during dismissal, with focus and inert
state restored.

The first corrected hosted cold run passed 28/29. In the inert-worker footer
case, telemetry showed the mark becoming offscreen and paused after about 9.44
eligible seconds, before its intended 10-second startup timeout. The final
harness records its geometry and recenters only a wholly offscreen mark in that
one fault case, retaining one 18-second deadline and requiring the exact
`startup-timeout` reason. It does not force visibility or renderer activity.
Separate offscreen-pause checks remain. The original trace is retained; this
setup correction does not establish a stable cold footer landing.

Compared with the prior candidate, the complete artifact adds 4,565 uncompressed
bytes: 647 JavaScript, 1,181 CSS and 2,737 HTML. No media or dependencies were added.
This is an asset-size comparison; the earlier loading measurements remain tied to
their original candidate rather than being relabeled as this revision.

Use the ordinary `node scripts/build-production.mjs` builder. Every protected
application, feedback and coach-enrollment file must remain byte-identical.
Browser viewport/touch and WebKit checks do not establish physical-phone acceptance.
The current candidate stays on [PR #85](https://github.com/posetek/posetek_website/pull/85).

## Review walkthrough

1. Open either audience page and immediately open the menu. Close it with Escape
   or the visible Close button before the entrance finishes. The curtain must
   shrink from its current position, keep controls visible and return focus.
2. On a fine pointer, hover navigation text and previews. Labels resolve quickly;
   miniatures appear at the pointer, tilt gently and settle. Scroll while the
   pointer stays over the Coaches hero: its centered hint follows the preview
   and disappears when the pointer leaves the link.
3. Read down and back up. Introductions and media enter consistently; already
   used controls stay clear. Expand a demonstration, change a selection or play
   a recording, then collapse and reopen it. Local state remains intact.
4. Try touch and keyboard navigation, direct section links, reload, and browser
   back/forward. The section indicator follows the story without hiding chapters.
   Reduced motion settles decorative effects. Disabling JavaScript retains
   essential copy and native navigation.
5. Reach the closing panel and reverse scroll. Its heading, grid and audience
   preview remain readable; reaching or pulling past the bottom never navigates.
   Use the explicit audience link to change pages. Sound starts muted and changes
   only through its control for the browsing session.

## Exact review candidate

[Review the hosted candidate](https://6ad536a9103351c79863f77f--posetek.netlify.app),
built from runtime source `9fa587ac341c993023ee0174b7bfe1e96a44d247` with
`node scripts/build-production.mjs`. The complete artifact contains 2,003 files;
its manifest SHA-256 is
`205deec1f4de5920ba09a1c8a40ea67d0787808ec7b4ba4535280cec56c90662`.
All 1,985 protected files remain byte-identical. All artifact SHA-1/size rows
match the captured 2,004 provider records, with zero case collisions. The only
extra provider record is its generated Netlify metadata.

Production remains `6ad02adfcc90dffdb496f811`. Main automatically publishes, so
source commits retain `[skip netlify]`. Human acceptance and a separate release
instruction precede promotion of this exact artifact. Verify production and
reconcile the protected baseline only after that promotion. The previous
production's original public HTML and rollback verification remain recorded in
the candidate receipt; rebuilding another output is not exact-candidate release.

## Final acceptance

| Verification | Local exact artifact | Hosted exact artifact |
| --- | ---: | ---: |
| Public navigation and preservation | 33/33 | 33/33 |
| Hover, scroll, menu and footer details | 23/23 | 23/23 |
| Responsive composition and demo continuity | 26/26 | 26/26 |
| Cold input and renderer failure/lifecycle | 29/29 | 29/29 |
| WebKit support checks | 4/4 | 4/4 |
| Functional screenshots | 113 | 113 |

The strict hardware lane retained the original 100ms maximum input-delay,
50ms median input-delay, 200ms visible-feedback and 100ms overlapping main-task
limits. Maximum recorded menu-input delays were 33.7ms local
and 22.8ms hosted; visible feedback maxima were
131.0ms and 147.8ms. All
56 hardware traces remain available. These are measurements from this desktop
host, including its touch emulation, not guarantees for every device.

Runtime CI passed all six jobs: 2,023 frontend tests across 178 files, 78 tooling
checks, 32 policy tests, seven guest smoke cases, TypeScript, Svelte, lint and the
marketing build. Lint reports 229 warnings and zero errors; Svelte reports zero
errors and warnings. Runtime checks are pinned to
[9fa587a](https://github.com/posetek/posetek_website/actions/runs/39166901251).
Latest-source CI and the separate same-provider advisory review are recorded on
PR #85. No paid hosted reviewer is activated.

Evidence lives in `artifacts/marketing-polish/`: `acceptance-summary.json`,
`visual-review.md`, `local-detail-release/`, `hosted-detail-release/`, the matching
regression/composition directories, `local-cold-release/`,
`hosted-cold-verified/` and both WebKit directories. The source and artifact
identities are in `deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json`.
