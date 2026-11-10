# Admin rep tracking playback

Source fix, November 5, 2026 (PR #128). Released November 6, 2026 in deployment
`6aedefb93ea542305e9f49da` with result validation; see
[the release handoff](../releases/RESULT_VALIDATION_RELEASE.md). On that runtime the
measured-evidence layer has its own switch; the browser suite turns it off before
checking the raw tracking overlay.

Rep Tools previously built its scrubber from metadata without loading
`tracking.json`. A recording without video or pose therefore showed numbered
frames above a blank viewer, even when saved detector observations existed.

The loader now reads tracking from the same exact rep/capture folder as the
other artifacts. Rep Tools uses the shared replay parser and drawing code to
show the recorded athlete box, center point and ball box. Sparse indices remain
in their original positions; absent observations stay blank. The overlay is
clipped to the recording's content rectangle and has a separate visibility
control. It does not replace the selected measurement track or annotations.

Recorded metadata and processing-context timing retain precedence. Tracking FPS
and frame count fill missing timing/count fields, including sprint recordings
that have no pose or metadata total-frame count. Timed pose/tracking can play,
pause, seek, change speed and restart after the last frame without a video.
Unknown timing permits manual frame inspection but not timed playback.
It also prevents timing-based revisions from using the legacy default FPS;
saved metrics remain unchanged and measurement corrections require a recorded
frame rate. Sprint frame dimensions retain the same letterboxed geometry as video.

The screen distinguishes original-video absence, saved tracking, saved pose,
metadata-only records, failed tracking loads and frames with no observation.
Metadata-only transport controls are disabled. Image-point annotations require
original video; event-frame and numeric editing retain the existing explicit
revision workflow. Opening, playing or scrubbing creates no revision or metric
change. This does not recover original camera images or qualify additional reps.

## Validation

- Focused Vitest coverage exercises exact-folder loading, missing/unreadable
  artifacts, existing video selection and timing precedence/fallbacks.
- `scripts/admin-rep-playback.browser.mjs` mounts the real Rep Tools component
  with invented data and blocks external traffic and mutations. It checks actual
  canvas output, sparse gaps, transport, pose/video compatibility, route reset,
  disabled annotation and unchanged result previews in Chromium and WebKit.
- Private recording compatibility checks remain outside the public repository.
  No athlete records, identifiers, credentials or original media are fixtures.

See the fixture README for repeatable local commands. Record completed commands
and any gaps in the PR; fixture acceptance is not hosted or production evidence.

Local acceptance passed 2,340 frontend tests, 105 tooling tests, TypeScript/Astro
build and 112 browser assertions (56 each in Chromium and WebKit). The browser
suite includes real synthetic H.264 playback, narrow sprint geometry and the
unknown-timing save guard. Lint completed with existing repository warnings.

## Release and recovery

No backend, rules, schema or native change is required. Integrate source with
`[skip netlify]`, preserving all held candidates. A website release must carry
only this approved change onto the current accepted runtime, use the guarded
artifact builder and pass exact-artifact acceptance before promotion. Reverting
the source does not republish a site. Recover through the prior verified website
artifact without changing athlete records.
