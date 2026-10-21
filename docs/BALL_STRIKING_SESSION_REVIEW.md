# Ball striking session review

Status: source implementation, 2026-10-17. Not published. Real gateway,
App Check/CORS and authenticated browser acceptance remain release prerequisites.
The shared Backend owns the session service, authorization and audit projection;
Web owns this read-only viewer. [Backend ownership](BACKEND_MIGRATION.md) and
[the engineering workflow](engineering/WORKFLOW.md) still apply.

## Admin experience

**Coaching hub → Ball striking sessions** opens
`/admin/ball-striking-sessions`. Sessions appear newest first with the saved
player name when available, selected reference, goal, status and rep count.
Missing names say Athlete; a document ID is not presented as a person's name.

Opening a session shows its pinned reference, goal and latest bounded session
memory, followed by chronological rep, follow-up and end turns. Each turn leads
with the generated **Coach reply** and brief grounded **Decision summary**.
**Context & evidence** reveals the goal/reference/memory revision supplied at that
turn, any follow-up question, evidence/tool actions, numeric comparisons and
quality notes. Failed and uncertain turns show explicit errors and response time;
missing measurements remain Unavailable. End-before-start records have no saved
reference and are identified as closed before start.

Per-turn context also includes the compact prior reps and user/coach exchanges
actually supplied to that turn: at most six of each. These snapshots stay inside
the existing Context & evidence disclosure, distinct from the latest session
memory above. Older traces without snapshots say they were not recorded; absence
is not presented as proof that no earlier context existed.

Coach replies are generated text. They do not establish audible delivery or
acknowledgement. The viewer makes that distinction once beside session memory.
It does not expose system prompts, hidden reasoning, provider blocks, arbitrary
tool arguments, raw pose arrays or debug JSON. All visible text uses ordinary
escaped React text nodes. Unknown fields are discarded by the typed projection
adapter; malformed known fields fail the read instead of becoming a debug dump.

List and history requests use 25-record pages (server maximum 50) and opaque
server cursors. The browser retains cursor history, not previous pages of athlete
records. Refresh returns to page one. Failed pagination preserves the visible
page with an error. Navigation changes abort pending reads; epoch and Firebase
account checks discard stale responses. Account changes return to the tool root.
No private records are persisted in browser storage by this feature.

## Browser configuration and authorization

The existing verified PoseTek-admin shell guards navigation. The actual security
boundary is Backend `POST /v1/technique/admin`, which independently verifies the
Firebase identity, deletion state and App Check token. Web does not read session
collections or private runs directly. Audit reads remain separate from disabled
execution/generation flags; this viewer cannot start, retry or close a session,
publish a reference, invoke coaching or enable a product flag.

Set both public build-time values for the intended environment:

```sh
VITE_TECHNIQUE_GATEWAY_URL=https://agent-gateway-keycy7dkua-uw.a.run.app
VITE_TECHNIQUE_APPCHECK_SITE_KEY=<registered-public-recaptcha-v3-site-key>
```

The site key must be the legitimate reCAPTCHA v3 provider registered for this
Firebase Web app and approved hosting origins. No key is supplied or invented by
this source change. Configure it through the existing approved release process.
Both values are public browser configuration. Astro exposes only their explicit
prefixes in addition to its existing PUBLIC_ values; no broad VITE_ environment
exposure is added to Astro.

The gateway URL is restricted to the canonical HTTPS origin above, without a
path, credentials, query or fragment. Missing/invalid configuration fails before
tokens or network requests, with a readable unavailable state. The App Check SDK
and real provider initialize lazily when this tool first reads data, using the
existing Firebase SDK. Other pages do not load reCAPTCHA through this feature.
The request sends both Firebase and App Check tokens, a fresh request ID, client
version and an abort signal. It omits browser credentials, bypasses HTTP caches,
times out after 30 seconds (including token acquisition), rejects redirects and
caps response decoding at 16 MiB, covering bounded 25-turn evidence pages. Errors never
echo arbitrary provider/SDK details. There is no debug-token or attestation bypass.

## Compatibility and release order

This is additive source and does not change ordinary workout, player, coach or
technique-review routes. The Backend pin remains the reviewed migration pin;
new coordinated Backend code is still a separate unreleased branch. No shared
backend source is copied back into Web.

Before a website release:

1. Integrate and release-qualify the compatible Backend projection and its
   authorization, redaction, pagination, deletion and lifecycle tests. Existing
   rules/gateway/native holds remain binding.
2. Register and configure the legitimate Web App Check provider. Verify the exact
   intended hosting origins are present in the gateway's explicit ALLOWED_ORIGINS
   and provider configuration. Verify CORS preflight for Authorization,
   X-Firebase-AppCheck, Content-Type, X-PoseTek-Request-Id and X-PoseTek-Client.
3. Verify accepted Admin reads, nonadmin and missing/invalid attestation denials,
   account changes, refresh/paging, failed/uncertain turns and empty/tombstone
   records against the exact gateway candidate. Use authorized synthetic fixtures;
   no production athlete records are needed. Local DTO tests are not this proof.
4. Build and verify the intended immutable website artifact, preserving approved
   marketing, feedback and held-source boundaries. Follow the existing draft,
   promotion and baseline-reconciliation workflow. Source merging is not release.

## Local validation

Local tooling uses existing dependencies without installing or changing them.
Node 22.19.0 meets package engines; hosted standing CI pins 22.23.3. Python checks
use the existing Python 3.12 virtualenv with bytecode writes disabled.

Passed on this source candidate:

- Frontend Vitest: 1,990 tests, 175 files; focused projection/transport/rendering
  and navigation checks include missing App Check, account races, bad identities,
  bounded payloads, unknown private fields, escaped text and missing evidence.
- TypeScript, Svelte (zero errors/warnings), full lint (existing warnings only),
  scoped new-file lint with warnings denied, policy tests (32), release/tooling
  Node tests (76) and production dependency audit (four advisory paths covered by
  existing accepted policy; zero blocking).
- Local isolated Chromium preview at 1440, 390 and 320 pixels: session-list/detail
  navigation, collapsed context, expanded evidence, uncertain turn and no outer
  overflow or page errors. External requests were blocked; no real account,
  athlete record, App Check token or model call was used.

The Browser skill was read first. Its runtime bootstrap failed with
`Importing module "node:process" is not allowed in node_repl` before a browser
could be selected. The authorized fallback used the repository's already
installed Playwright/Chromium with an isolated synthetic context. Initial
sandbox localhost/Mach denials were preserved, then the same commands passed
normal execution approval. This does not verify live authentication/App Check,
production typography, network/CORS or physical-iPhone speech delivery.

TypeScript/Astro build, the separate marketing build, static Firestore transport
tests/check and seven isolated guest Chromium smoke checks passed. Four temporary
checks consumed the exact generated Backend active/ended list/detail responses;
the standing suite retains those synthetic fixtures. This caught and corrected
UTC offset/microsecond ordering compatibility before integration.

No live authenticated gateway/App Check/CORS acceptance, production artifact
assembly/baseline reconciliation, hosted CI or physical-device delivery acceptance
was run. No source deployment, Git push, real provider call or production write
is part of this work.

The additive per-turn prior-context follow-up passed 26 focused parser, transport
and rendering tests, scoped lint and TypeScript. The full standing results above
are from the initial feature candidate; they were not rerun for this bounded
follow-up. Refreshed actual Backend active/ended/tombstone details and both list
DTOs passed the client parser; prior-rep/chat arrays match their supplied snapshots
exactly. The new context fixture preserves this integration regression coverage.
