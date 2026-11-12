# Isolated RepTools playback acceptance

The real RepTools component runs with invented in-memory athlete/artifact data.
The local server replaces only the accounts and rep-tools data boundaries and
denies access through a fallback Firebase adapter. Browser interception blocks
all external requests, WebSockets, and non-GET/HEAD requests. No authentication,
cloud data, writes, real capture, or private fixture is used.

Prepare an isolated absolute cache/output directory under machine-local storage
policy. Generate the tiny synthetic video outside Git (on macOS):

```sh
swift app/scripts/admin-rep-playback-fixtures/make-video.swift /absolute/output/synthetic.mp4
ADMIN_REP_PLAYBACK_CACHE=/absolute/output/vite-cache ADMIN_REP_PLAYBACK_VIDEO=/absolute/output/synthetic.mp4 node app/scripts/admin-rep-playback-fixtures/preview.mjs
ADMIN_REP_PLAYBACK_ARTIFACTS=/absolute/output/browser node scripts/admin-rep-playback.browser.mjs
```

The preview defaults to port 4284; override `ADMIN_REP_PLAYBACK_PORT` and pass the
matching loopback URL as `POSETEK_ADMIN_PREVIEW_URL` to the browser harness.
Playwright Chromium and WebKit must already be installed. Linux can use an
equivalent synthetic H.264 MP4 from its supported local media generator.

This validates browser rendering and playback controls against the real component,
not production artifact discovery, Firebase authorization, codecs on physical
devices, metric accuracy, or persisted revisions. The fixture loaders deliberately
throw on mutation attempts. A tracking-request failure fixture remains separate
from a successful metadata-only response.
