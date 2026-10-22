# Homepage fluid motion and first-activation correction

Status: local guarded candidate, October 22, 2026. This is not a production
receipt. Work starts from remote-main `bd7ce5febbbdcaed16c6ef35f2e3987603f68c93`
in the isolated `codex/homepage-fluid-interactions` worktree. Source integration,
hosted acceptance and publication remain separate. Guarded assembly is complete.

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

## Guarded artifact and loading evidence

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

The guarded preview is `http://127.0.0.1:4192/`. The earlier preview on port 4191
uses compiled Astro output and must not be promoted. The current baseline protects
2,154 files from the October 21 parent/player release; older public-site counts
are historical. No commit, push, hosted upload or production promotion occurred
during this implementation pass.

Before publication, the release owner must freshly verify the production
baseline and exact artifact manifest again, complete current-revision review and
required remote CI, and accept the exact hosted artifact. Hardware cold-start
timing, hosted acceptance and physical Safari/device review are not established
by this local pass. Keep `[skip netlify]` on source integration and use the
existing exact-candidate promotion/rollback workflow.
