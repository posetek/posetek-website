# Safari marketing link activation

Published November 3, 2026 at 23:37:02 UTC as exact deployment
`6aea6ecaca4a6743660ac238`, replacing `6aea5e0ceb047cc53ae49efc`.
[PR #118](https://github.com/posetek/posetek-website/pull/118) source
`64b25991d355361f3660d0081d55b8c78ba2127e` merged as
`f9cf233a33fafd1b377480db2c40d2caf4e61211` with `[skip netlify]`.
The accepted draft was promoted unchanged; application runtime `c33a9c8` remains
preserved. See [the sanitized production receipt](receipts/HOMEPAGE_LINK_ACTIVATION_PRODUCTION.json).

## Reproduction and cause

On desktop WebKit, clicking directly on the animated **Sign in** text in the
Players header or full-screen menu can leave the visitor on the homepage. The
failure also occurs on `/index.html`, after the page finishes loading, and with
the pointer held down for 70 ms. Keyboard activation and clicks outside the text
on the same anchor succeed. Chromium and the tested mobile taps also succeed.

The header's decorative scramble reset writes `textContent` during `pointerdown`
and focus. That replaces the underlying text node even when its visible value
has not changed. Recorded failing events contain pointer/mouse down and up over
the same visual span, but no `click` event. An isolated pointer-transparent label
probe restores native navigation without changing destinations or event handlers.

## Change and boundaries

The shared public `.interaction-text` decoration ignores pointer input, letting
the enclosing link or button own the hit target throughout animation. Hover still
reaches that enclosing control; scrambling, accessible names, native navigation,
keyboard focus and reduced-motion behavior remain intact. The rule covers the
Players and Coaches headers, menus and other instances of the same label.

No authentication, application, backend, persisted data, destination or release
configuration changes are required. Keep source integration marked
`[skip netlify]`. A marketing release must use `node scripts/build-production.mjs`,
the freshly verified protected baseline and the exact-candidate acceptance and
promotion workflow. This source change does not authorize publishing held main
application candidates.

## Verification

The focused browser regression uses real coordinate clicks at the visible text,
rather than the enclosing anchor's padding or a synthetic DOM click. It runs on
compiled local marketing pages with external requests blocked. Tests cover both
audiences, header/menu destinations, section navigation, keyboard activation and
mobile taps. WebKit browser emulation is not physical-iPhone acceptance.

```sh
npm --prefix app run build:marketing
node --test scripts/marketing-link-activation.browser.mjs
```

Ignored `.netlify/link-diagnosis/` artifacts retain the original live failures,
successful discriminator probes and local regression results. No credentials or
private account data are part of those fixtures.

The compiled baseline failed the focused WebKit Players-header test; the fixed
build passes all 18 Chromium/WebKit click, tap and keyboard checks. The same suite
is required in the CI build lane with both engines installed. Focused public-page
tests pass 240/240, navigation/preservation tooling passes 23/23, Svelte reports
zero errors/warnings, and TypeScript and the marketing build pass. The workflow
policy suite passes all 32 checks, including removal of the new regression step.

## Hosted and live acceptance

The exact hosted candidate passed 24 named Chromium/WebKit cases with 90
functional assertions at 1440×900 and 390×844. Coverage includes direct text
clicks/taps on both audience headers and menus, booking, section links, native
Back, closing links, keyboard, reduced motion and disabled JavaScript.

Production repeated all 90 functional assertions successfully. The strict initial
run recorded 23/24 passing cases because the WebKit phone closing-link case also
reported two Clarity CORS page errors from the harness blocking non-read requests.
A fresh isolated repeat intercepted the analytics tag before loading and passed
that case's four assertions, including first text tap and arrival at the guest
sign-in form, with zero page or console errors. The original diagnostic receipt
is retained. Eight settled production captures were checked with no page errors.
These checks used anonymous contexts and submitted no sign-in or other writes.

## Guarded artifact and release

The canonical `node scripts/build-production.mjs` artifact contains 2,544 files
(182,111,408 bytes), matching all 2,545 provider records including generated
configuration. Its SHA-256 is
`f48621479c02b8c29a99d40cffb508c334df32d9d9e954f0b501cb41d0d7a041`.
Every one of the predecessor's 2,470 protected files remains byte-identical,
including application, feedback, coach enrollment and the private report assets.
Only the two marketing documents changed among prior served files; 72 hashed
assets were added by the ordinary builder and no files were removed.

Independent comparison of the 50-asset active marketing dependency graph found
no added or removed logical assets. Two existing CSS bundles each gain one
`pointer-events: none` declaration; JavaScript changes are hashed dependency
references. The ordinary builder's additional application chunks are unreferenced
by the preserved application entry. They do not activate the held policy, session
or Ball Striking candidates. Provider configuration differs only in its generated
local publish-directory string; effective routing and security policy are retained.

The source and merge revisions each passed all six required CI checks. Source,
artifact and promotion-operator advisory reviews completed without actionable
findings. Promotion used a single intent and one publication request, with the
source, artifact, provider inventory, configuration and acceptance proofs pinned.
The final read-only production check verifies all artifact records and 14 HTTP
routes. Netlify adds `noindex` when the predecessor becomes a preview; the reviewed
read-only verifier normalizes duplicate indexing directives while requiring all
four report privacy directives. It retains the body, artifact and other header
checks. The original operator was unchanged and publication was not repeated.

The canonical baseline reconciliation protects 2,542 files and retains all 37
historical `localPath` mappings. The subsequent ordinary preservation build is a
check only, not another uploaded artifact. All 16 preservation guard tests passed.

## Recovery and limits

The prior deployment and configuration remain available as rollback evidence.
No rollback was performed. Before any recovery, freshly inspect the serving
inventory and use a reviewed exact artifact that preserves later accepted files;
a source revert alone does not change production. Private report outreach stays
held. This release changes no backend, rules, indexes, gateway, catalog, native
build, authentication or persisted business data.

Automated Chromium/WebKit evidence is distinct from installed Safari or physical
phone acceptance. No signed-in workflow or account/workout mutation was attempted.
Private report payloads and identifiers were not opened or copied into this record.
