# Homepage fluid motion and first-activation correction

Published October 22, 2026 in the [combined release](HOMEPAGE_ADMIN_POLISH_RELEASE.md).
The candidate checkpoints and original verification qualifications below remain historical evidence.

Status: implementation complete; corrected immutable candidate prepared, October 22, 2026.
The final candidate receipt below supersedes the earlier assembly and local-preview notes.
This is not a production
receipt. Work starts from remote-main `bd7ce5febbbdcaed16c6ef35f2e3987603f68c93`
in the isolated `codex/homepage-fluid-interactions` worktree. Source integration,
hosted acceptance and publication remain separate. The first guarded assembly
completed; hosted verification then identified the startup correction below.

## Behavior

Players uses smooth artwork entrances with two nonadjacent accent chapters per
visit. A random seed is chosen once when the gallery controller attaches; the
resulting chapter profiles remain stable through scrolling, directional re-entry,
responsive resizing and texture eviction. Each reveal finishes in 180–360ms.
The two accents have one short, differently positioned hold and blend between
pixel grids; the other four remain sharp throughout their small eased zoom.
There is no per-frame randomization, skipped frame, scroll interception or moving
caption/control. Curvature stays time-normalized and damped, with bounded
chapter-specific strength. The Coaches gallery retains its preceding reveal
policy.

The same directional lifecycle remains: content passed above stays readable;
only complete exit below rearms a preview. Interaction settles artwork
immediately. Touch/narrow layouts and reduced motion retain static previews.
The shared worker/context, four-texture limit, resolution bounds, offscreen/menu
activity gates, correctly aligned frame acknowledgement and HTML fallbacks remain.

Repeated image-load/resize notifications with unchanged geometry and sources no
longer hide the already acknowledged gallery frame. A source-only responsive
image change restores only that image's opaque HTML fallback; the other aligned
planes stay visible. Actual geometry changes still restore all HTML previews
until a matching worker frame is presented. The controller exposes the chosen
`data-showcase-reveal-style` for inspection, not as visible product copy.

Footer booking, sign-in, audience and bottom navigation links now have stationary
ancestors and remain visible during entrance/reversal. The heading, letterforms,
grid and inner preview artwork retain their decorative effects. Focus may finish
those effects without shifting a link between pointerdown and pointerup. This
correction applies to the shared Players/Coaches footer. Links retain their native
destinations and default browser behavior; no manual navigation or synthetic-click
workaround was added.

Demo hydration, state retention, focus restoration, sample labels, media,
chapter/deep-link history and AI Coach → workout handoff are unchanged. The
hydration-independent native menu remains available before the React gallery.
No backend, authentication, API, persisted-data or signed-in screen changes are
part of this candidate.

## Hosted startup correction

The first immutable candidate,
`https://6ada68722e3bc746b5f5827d--posetek.netlify.app`, was assembled from
`3da4939d20c4cd95fa76bafd611882af3acc7e89`. Its full showcase run passed 35/37:
one teardown observed an aborted responsive DOM image, and the stationary-pointer
case timed out. Both cases passed unchanged on a focused repeat. Three additional
orientation runs decoded every selected image with no tested-origin failures;
the original image cancellation's cause is not proven and its failed receipt is
retained. No generic cancellation exemption was added.

Controlled import gating did reproduce the pointer failure: the first mouse move
occurred before the decorative module attached. After native scrolling brought
the preview under the stationary pointer, DOM hit testing and its CSS cue were
correct but the worker received no hovered card. Moving the pointer by one pixel
recovered it. This is an inherited startup race exposed by hosted loading, rather
than a shader-speed issue.

The correction reads native `:hover` ownership while initial coordinates are
unavailable, preserving neutral tilt until an actual pointer event arrives. It
adds no listener or worker and retains all existing startup/activity gates. Touch,
window exit and blur disable that initial fallback so stale native hover cannot
reactivate decoration. Two browser regressions hold the real decorative import
until before or after scrolling, then require worker hover and an acknowledged
frame without a second pointer movement. Both fail against the first immutable
candidate and pass against corrected local source; the original pointer case also
passes. Public unit tests are now 240/240; TypeScript, the source marketing build
and 11 local footer activation checks pass.

The first corrected full local run passed 38/39. Its separate delayed-demo hash
test sampled five steady frames before the existing 180ms navigation quiet period
finished. A diagnostic kept the original failing assertion and recorded the
profile offset returning from 354.5625px to 100.5625px after 300ms, against the
initial 100.3125px landing. The test now waits for that same ±2px position invariant
before its unchanged stable-scroll/final assertions. Application hash behavior
was not changed. Both the original failure and the delayed observation remain in
`startup-showcase/` and `hash-diagnosis/`.

All 11 first-activation checks also pass on the first hosted candidate. Its
`/coaches` link redirects to `/coaches/`; the ignored hosted harness explicitly
checks that canonical destination and Coaches title. The initial exact-string
URL mismatch remains recorded separately and is not a product navigation defect.

Evidence is retained under `hosted-showcase/`, `hosted-focus-repeat/`,
`hosted-diagnosis/`, `hosted-startup-regression-before/` and `startup-focused/` in
the ignored artifact directory, with activation logs alongside them. The old
`production-dist`, manifest and hosted candidate are unchanged. Release requires
a new reviewed head, guarded assembly and immutable candidate for this correction.

## REA findings and correction evidence

Controlled scenarios used a fresh, provider-owned headless Chromium
153.0.8010.12 process and profile. All owned processes were terminated. Public
production investigation used guest pages without form submission. Complete
records are retained locally under the ignored
`artifacts/homepage-fluid-interactions/rea-*.json` directory.

| Observation | Evidence ID |
| --- | --- |
| Production desktop sampled menu, fragment and demo actions completed | `ev_7c9eb7cd80c6c2f876d33e5590ace39d3962e806646a44489bebeddae86ae67f` |
| Production 390px run: footer Sign in first click did not navigate | `ev_bbd2d76226870daf258b205c1d9507a02ca2a157a316a166b40f7d2e5c4ef080` |
| Isolated 390px reproduction: unchanged URL after 1.8s; second click navigated | `ev_e4eeabf9f330021f77cf734415694866d24ae3a7adf2c082e0c0d6fc7e7a48a5` |
| 390px reduced-motion control: first click navigated | `ev_28249fa8d7ae0789d0c04a7ae9abc557316f08fb40013a9d3e44e8780f1a0b60` |
| 1440px normal-motion control: first click navigated | `ev_0190e4d288601b6e303d2236d4a7f9cb607f10f32bd4e32ffc75ecf8b48a00ac` |
| Local fixed candidate at 390px, normal motion: first click navigated | `ev_0692303127ce1da888cd967376dd6d6e58ba9f745c759fbb97f3ac694e1fe471` |

The isolated reproduction's scenario digest is
`3b6fc93f4bfafa6e3015c61c7d8a90285ed69d38ceee91ce6d98e757e57481a8`;
the local fixed scenario digest is
`9b6d8a64e76865d0ab43edb1bbda51c42afd9a275f51da2ea731bdd6f0218811`.
The production reproduction observed the `/signin` GET only at the second-click
step. Its network capture is explicitly incomplete because one subsequent
application script request was unfinished at the end; URL/action evidence remains
available. No page errors were captured in these bounded runs.

Source inspection found the complete invitation, including links, scaled by
scroll progress; focus immediately completed that scale and removed the contact
translation. This mechanism plus the normal/reduced-motion comparison supports
the moving-target diagnosis. The REA scenarios did not trace raw pointer targets,
establish artifact digest identity, test physical touch or inspect Safari.
REA locator clicks wait for actionability; elapsed action time is not input delay.

## Validation

Dependencies were installed from the unchanged application lockfile using
`npm ci --ignore-scripts --prefix app`. No dependency or manifest change was made.

| Check | Local result |
| --- | --- |
| Public Players/Coaches Vitest suites | 239 passed across 29 files |
| Complete application Vitest suite | 2,124 passed across 190 files |
| TypeScript project check | Passed |
| Svelte check | 0 errors, 0 warnings |
| Marketing build | Passed; existing dynamic-import warnings retained |
| Lint | Exit 0; repository warnings retained |
| Complete server/tooling suite | 78 passed, including navigation/preservation/preview checks |
| CI policy tests | 32 passed using an isolated Python 3.12/PyYAML environment |
| Current dependency audit | 4 known advisory paths, 0 blocking; no dependency changes |
| Static Firestore transport tests/scan | Passed |
| CI guest browser smoke | 7 passed |
| Existing showcase/revamp/detail browser suites | 37 / 33 / 21 passed |
| New browser activation regressions | 11 passed against the guarded candidate |
| Separate WebKit support lane | 4 passed; no-JavaScript/reduced-motion, touch emulation |
| Worker-rendered gallery observation | Ready frame, no page errors, stable two-accent assignment after resize |

New unit coverage checks exactly two nonadjacent accents, bounded durations,
seed reproducibility, continuous/monotonic clearing, retained profiles,
unchanged-geometry frame retention, source-only fallback, stale-frame rejection
and independent legacy policy. Existing public suites continue covering demo,
navigation and renderer contracts.

Run the browser regressions after the marketing build:

```sh
MARKETING_OUTPUT=production-dist node --test scripts/homepage-fluid-interactions.browser.mjs
```

They serve the compiled checkout locally, block all external HTTP/WebSocket
traffic, and verify a single mouse click at 360/390/430/768/1440/1920px;
touch-emulated first activation of booking, sign-in and the audience preview;
stationary link geometry during entering/reversed focus; and menu → section →
demo → close/focus restoration. Navigation assertions establish the destination,
not acceptance of the protected booking/application content. Physical-phone
acceptance is not claimed.

The bounded renderer check used Chromium's SwiftShader Vulkan software renderer,
not hardware timing evidence. Both visible cards reached acknowledged worker
frames, and the six chapter assignments remained unchanged after resizing from
1440px to 390px. `render-observation.json` and viewport captures are retained in
the same ignored artifact directory. The original 390px footer capture records its
heading entrance in progress; action labels and hit areas are already available.
The subsequent detail suite includes settled footer captures. External fonts were
blocked for these local regression/capture runs.

The existing suites generated 176 responsive captures, including all six widths
at 360/390/430/768/1440/1920px. Desktop gallery, mobile gallery, menu, Coaches
contact and settled mobile/desktop footer captures were inspected. Useful files
under the ignored artifact directory include:

- `showcase/players-1440-profile-preview.png`
- `showcase/players-390-tests-preview.png`
- `showcase/coaches-390-contact-preview.png`
- `revamp/players-390-menu.png`
- `detail/players-390-footer-invitation-settled.png`
- `detail/players-390-footer-preview-settled.png`
- `detail/players-footer-bottom-pull.png`

## Interaction checklist

- [x] Single footer sign-in activation at all six widths.
- [x] First touch-emulated booking, sign-in and audience-preview activation.
- [x] Stationary footer hit areas during entering/reversed focus transitions.
- [x] Menu keyboard containment, Escape, focus return and section navigation.
- [x] Direct hashes, legacy aliases, reload, browser history and stable chapter anchors.
- [x] Retained demo selections/playback/workout progress and exactly-once AI handoff.
- [x] Hover/re-entry, stationary-pointer scrolling, texture eviction and bounded rendering lifecycle.
- [x] Reduced motion, no JavaScript, orientation/zoom and failed media/lazy-import fallback.
- [x] Desktop WebKit support checks, with explicit touch emulation.
- [ ] Exact hosted-candidate acceptance and independent latest-revision review.
- [ ] Coordinated hardware cold-start timing and physical-device acceptance.

## Earlier guarded artifact and loading evidence — superseded

A fresh read of Netlify site `b1ccf990-286c-4367-bb67-ca0d9ea2a020` confirmed ready
production deploy `6ad92e7fec1a407bec937389`. The builder independently checked the
live application entry before assembly. `node scripts/build-production.mjs`
completed successfully and a separate inventory verified SHA-1 and size for all
**2,154 protected files**. Application, feedback and coach-enrollment entries are
unchanged. The candidate contains **2,240 files / 170,418,350 bytes**.

The exact SHA-256 of the serialized, sorted `artifact-manifest.json` is:

```text
618ab69025d7d54d442645b4ec07f70d0a1d657a002cd3538609de6c63cda6e4
```

The guarded Players document SHA-256 is
`9628f6dc7e833029364b7a6aff5b6dc2a6d342dcd23128e7bcdbd15f55ae7c8d`;
Coaches is `258bb2811192d29d88ea7fb2fc9c44002a1f178bf0d9cda92510fc378ee537dd`.
`guarded-artifact.json` records protected document hashes, the baseline and
freshly checked public-document provenance. The earlier approved original public
HTML receipt still matches the currently published immutable deployment's served
documents; all baseline runtime assets came from the verified current cache.

Three alternating local samples per route/build recorded these uncompressed
initial body-byte changes against that published marketing baseline:

| Route | Page JavaScript | Worker script | CSS | Initial images |
| --- | ---: | ---: | ---: | ---: |
| Players | +1,236 B | +897 B | −567 B | unchanged |
| Coaches | +1,227 B | unchanged | −567 B | unchanged |

Request counts are unchanged. Both footer workers remain dormant at initial
load. Essential no-JavaScript navigation, deferred footer startup and rejected
footer-worker recovery passed for both routes. The local uncompressed loading
samples do not establish CDN, network, input-latency or GPU performance.

`performance.json` retains its failed status: sampling and seven runtime/inventory
checks finished, then its final source-content phase failed because its default
paths assume an `app/astro-dist` directory. An earlier diagnostic also records
the Netlify inventory's lowercase worker-key mismatch; only the isolated baseline
comparison copy's filename casing was restored to the compiled worker URL, with
the exact digest unchanged. `asset-comparison.json` separately validates the
completed samples and proves all **59 existing content/media/brand/sample files
(4,838,763 bytes)** match the untouched remote-main source. No failed report is
represented as a passing full performance run.

## Delivery boundary

The historical previews and candidate digests above are superseded by the final
immutable candidate below. Port 4192 now serves that corrected guarded assembly.
The current baseline protects
2,154 files from the October 21 parent/player release; older public-site counts
are historical. The hosted follow-up records the initial source integration and
candidate; no production promotion occurred during this implementation pass.

Before publication, the release owner must freshly verify the production
baseline and exact artifact manifest again, complete current-revision review and
required remote CI, and accept the exact hosted artifact. Hardware cold-start
timing, hosted acceptance and physical Safari/device review are not established
by this local pass. Keep `[skip netlify]` on source integration and use the
existing exact-candidate promotion/rollback workflow.


## Final immutable candidate and acceptance record

The corrected candidate is
[6ada6e5a385faad3f4cd88ed](https://6ada6e5a385faad3f4cd88ed--posetek.netlify.app).
Its application source is `b66a7306d6ece6358bd22e45aa9f0371ff86aede`; later edits
to this delivery document do not change any compiled input. The final sorted
artifact-manifest SHA-256 is
`7083cee51af616e6a6d837f05c1e0fde2ec15e7e8f57b0060741781dfac14a74`.
It contains 2,240 files / 170,418,415 bytes, and all 2,154 protected files match
the fresh production baseline byte-for-byte. Provider inventory agrees and no
files were removed. Only Players, Coaches and generated hosting configuration
changed among existing provider records; no functions or edge functions changed.

The exact hosted candidate passes 39 showcase checks, 11 first-activation checks
and four WebKit support checks. The hosted receipts retain 107 responsive captures.
Direct hashes, Back/Forward, retained demo state, AI handoff, reverse scrolling,
stationary-pointer startup, menu interruption, failed rendering/imports/media,
reduced motion and no-JavaScript navigation are included in those lanes.
These browser results do not establish physical-phone acceptance.

The first full hardware run passed 41/43 assertions. Its retained trace identifies
GPU/system scheduling stalls rather than slow input handlers; the cause is not
proven. A default-tracing repeat reported 43/43, but its event audit detected
additional trusted scrolling in four late gallery cases, so that repeat is not
clean timing acceptance. Both reports remain retained. The final timing outcome,
raw-input audit and unchanged 100/50/200/100ms limits are recorded in the
exact-artifact delivery receipt on [PR #97](https://github.com/posetek/posetek_website/pull/97).
Only an audited full run can establish that timing lane; passing assertions alone
are insufficient. No failed report is relabeled as a pass.

Final receipts and responsive captures are retained under the worktree's ignored
`artifacts/homepage-fluid-interactions/` directory. The local port 4192 preview
serves this exact guarded artifact. Production remains separate from source
integration, and the primary checkout is unchanged. All source commits use
`[skip netlify]`; current CI and independent latest-revision review are linked on
PR #97. Review is advisory, not user acceptance or production approval.

This candidate and the application candidate in PR #98 preserve the same
predecessor `6ad92e7fec1a407bec937389`. After either is released, recompose and
reverify the other against the newly approved baseline before acceptance, so a
later promotion cannot restore the earlier public or application entry. Preserve
the verified predecessor inventory for rollback and reconcile the baseline after
promotion through the guarded workflow.

### Cold-input presentation precondition

The release timing investigation preserves four full-run receipts: the original
41/43 failure, two assertion-green runs invalidated by additional trusted wheel
input, and a native-audited 42/43 failure. The latter had no unsolicited wheel
input, but its first raw CDP click arrived at page time 350ms before the initial
page presentation at 556ms. DOMContentLoaded and a layout box had permitted input
before the visitor could see the opener. The 273.3ms curtain-feedback failure
remains a failure in its original receipt. The earlier trace-all 579.7ms failure
occurred after first presentation and remains separately qualified; this
precondition does not explain or retroactively pass that GPU-stall observation.

The cold harness now requires a compositor PNG containing the actual closed Menu
label and both glyph bars, with a foreground, onscreen, visible, unobstructed
44px opener. It stops the capture before dispatching the first input and records
the frame timestamp, precondition completion, SSR state and worker state. It
applies to every fresh Chromium visit. It does not wait for hydration, worker
readiness, fonts, network idle or finite animations. The held-SSR and first-input
before-first-worker-frame assertions remain, as do the existing curtain/content
feedback measurement and the 100/50/200/100ms budgets. Pixel inspection happens in
the Node harness; it does not alter the page or create a main-thread renderer.

This precondition adds compositor capture/readback overhead before the measured
input window; retained PNGs and timestamps make that boundary reviewable. It is
not a physical-device or operating-system display-latency measurement. Focused
checks and the next complete native-audited hardware run must establish the new
harness revision; this document does not claim a future passing result. The
candidate's product inputs and immutable hosted bytes remain unchanged.
