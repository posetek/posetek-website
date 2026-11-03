# Safari marketing link activation

Source candidate, November 3, 2026. This document does not record a production
release. The live baseline remains the accepted private-parent-report deployment
`6aea5e0ceb047cc53ae49efc` with application runtime `c33a9c8` preserved.

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
