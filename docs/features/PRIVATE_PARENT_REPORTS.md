# Private parent reports

A family opens a phone-friendly report with a private link. The report keeps the
approved three-band team chart, plain-language summary, two starter exercises,
one athlete-specific Workouts button, and an optional PDF download.

The private review sample is live in deployment `6aea5e0ceb047cc53ae49efc`;
see [release evidence](../releases/PRIVATE_PARENT_REPORTS.md). All parent and coach
report texts remain held after merge, deployment and review. Fresh explicit send
authorization is required. The October 26 parent-results chat owns recipient
history, message tone and future sending; wait until it finishes before coordination.
The Revamp release completed before this artifact was assembled and published.

## Access model

Legacy reports are read-only bearer links: anyone with the complete link can read
them. The optional signup-first payload described below additionally carries an
existing player signup invitation and can enable claiming that exact profile.
It does not verify a guardian or sign someone into PoseTek. A new random 256-bit
AES-GCM key and 96-bit nonce protect each snapshot; a random 192-bit opaque ID
selects the encrypted payload. The version and ID are authenticated as additional
data. The key lives in the fragment, which is not sent in HTTP requests. The
fragment intentionally remains so refreshing/reopening works. Treat browser
history, copied links and downloaded PDFs as private. No promise of automatic
expiry or recall is made; deleting today's file cannot revoke copies or historical
immutable deploys. Parent distribution requires review of this access model.

Only the generic reader is tracked. Plaintext report inputs, PDF bytes, keys,
complete links and recipient mappings stay in private local evidence. Production
artifacts may contain encrypted binaries only. The isolated reader has no Auth
SDK, tracking, third-party resources, local/session storage or service worker. It
fails closed when controlled by a service worker and uses no-store, no-referrer,
noindex, frame-denial and a restrictive CSP. Invalid/missing/tampered data shows a
generic message without revealing an athlete.

The original published browser-only workout button builds
`https://posetek.net/athlete?player=<id>&view=training`. This is a locator, not an
access grant. Existing account authorization continues to decide access. The
reader never claims an account, starts a workout, writes activity or transfers
credentials. Signed-out users use the existing sign-in flow. Legacy unclaimed accounts still need their separate private invitation. The
original signup flow opens Profile. The optional signup-first candidate below
adds a reviewed existing invitation and an exact-child Training continuation.

## Installed app boundary

The published review release uses the HTTPS browser destination. Mobile PR #69
merged on November 5 as `100c571d9ab22c2109459d3b007f8531d4d96c6a`; this establishes
source integration only. The new app-entry website candidate remains held until a
compatible signed TestFlight build and physical-phone acceptance are verified.
Source/browser tests do not establish native opening. No AASA or new hostname is
added by this candidate.

The mobile owner's versioned contract is
`posetek-workouts-v1://athlete?player=<player-document-id>&view=training`.
Workout locators accept 1–128 ASCII letters, digits, `_` or `-`. Previously valid
v1 reports with other IDs keep the chart and PDF but omit all workout links.
This is a destination locator, never authentication. It carries
no report key, invitation, name or session credentials. The existing `posetek://`
outdoor run/bike/walk routes remain separate and must not be reused.

For iOS presentation hints, the one primary report button, **Open in the PoseTek
app**, is a direct, user-tapped versioned-scheme anchor. Parents sign in with the
child's player login (Nolan, 2026-11-04), and the note under the button says so.
Tapping the scheme without the app shows a browser error first, so a parent
without the app must see install guidance before tapping (Nolan, 2026-11-04).

A visible **Don't have PoseTek yet?** box sits directly under the button. It
links **Install or update PoseTek** to `https://testflight.apple.com/join/3byuBWYW`,
without parameters, and tells the parent to come back to the report and tap the
button again. If the app does not open, a note offers installation/update and a
second tap without claiming the reason for failure. A missing/old app, declined
system prompt or blocked scheme can look similar. **Continue in browser instead**
retains the authenticated HTTPS route.

TestFlight does not transfer the child destination or sign in. Android retains the HTTPS button
with no TestFlight links. Unknown/missing hints keep HTTPS and offer a labeled
iPhone/iPad disclosure with explicit app/install choices. Hints select presentation
only and are not stored, tracked or treated as installation evidence.

No timer, iframe, visibility check, automatic launch or delayed redirect is used.
Absent/old apps, declined prompts and blocked schemes share the visible recovery
choices. Scheme registration is not exclusive ownership or access authorization.
The native implementation must validate the exact locator and authorize the signed-in
actor before selecting that child's Training view. Legacy payloads still need a
separate invitation; the optional signup-first branch below opens browser signup
before offering installed-app choices. It does not change the native contract.

The existing PDF button/QR keep HTTPS. The original app-entry change did not alter report plaintext, PDF bytes, encrypted
envelopes or complete private links. A later optional signup-first envelope carries
an explicitly authorized existing invitation; its PDF can remain byte-identical. PDF install
instructions await a separately reviewed revision. The five-file reader, cryptography,
no-tracking isolation, PDF download and chart behavior remain intact. The batch
append builder does not authorize arbitrary reader replacement; a reviewed pinned
transition and fresh exact-artifact acceptance are required for eventual delivery.

Focused checks: `node --test scripts/private-parent-workout-entry.test.mjs` and
`node scripts/private-parent-workout-entry.browser.mjs`. The latter uses synthetic
reports on loopback, blocks external requests, inspects/prevents link activation,
and never executes a custom scheme. It covers Chromium/WebKit iOS, iPad desktop
hints, Android, unknown/missing hints, 320/390/430px, PDF byte equality and clearing
report links. Actual device and account acceptance remain separate.

### November 5 preparation

The report flow is integrated with website main `6075626` in an isolated branch;
the earlier PR #121 remains untouched. The current serving predecessor is
`6aecbf94751cf215f811865f`, published November 5 at 19:06 UTC. Its 2,583 artifact
files were checked against the 2,584 provider records, including routing metadata.
The preservation baseline now protects 2,581 files and retains all 37 existing
recovery mappings. This records already-serving bytes, not a new publication.

The eventual local report candidate replaces only the three pinned reader files
and appends explicitly selected encrypted snapshots. It preserves the original
published snapshot, all application/marketing bytes, other reader files and
routing configuration. Report files with unresolved recipient/consent holds stay
in the private review package and are excluded from the publication selection.
Private links, PDFs, selections and per-recipient evidence remain outside Git.

The app-opening failure note now offers recovery without inferring installation
from an unsuccessful tap. The full local script lane passed 111 tests, and ten
Chromium/WebKit platform cases passed at narrow widths with exact PDF downloads,
no native dispatch and no external requests. Signed TestFlight distribution,
physical-device acceptance, production approval and exact-batch sending approval
remain separate gates. Keep `[skip netlify]` on source pushes and the PR title.

## Assembly and verification

Run `node --test scripts/private-parent-report.test.mjs` for cryptographic
round-trip, tampering and malformed-link coverage. Use synthetic content for
committed tests. Browser acceptance must cover actual decryption, no-key/wrong-key
states, switching links, narrow widths, PDF byte equality, DOM injection defense,
correct workout destination, and network/storage isolation. Hosted acceptance must
check effective headers and confirm the site is still serving the agreed release.

The additive builder first runs the unchanged ordinary preservation guard, restores
the exact freshly verified predecessor artifact, then adds only the reader and
explicit encrypted binaries. It must not publish source-main application candidates.
Every predecessor file stays identical (provider-generated routing metadata is
compared separately). A draft is reviewed before any production promotion; all
parent sends remain a separate held operation. No backend, rules, catalog, saved
plan or native release is part of this release.

Technical references: [Web Crypto decryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt),
[URI fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).

### Additional report batches

The default builder still refuses an existing `/report/` namespace. After a fresh
capture of the current accepted deployment, use the explicit append mode:

```sh
node scripts/build-private-parent-report.mjs <evidence-dir> --sealed-dir <binary-only-dir> --append
```

Append preserves every current file, including the report viewer and previously
published encrypted snapshots, and adds only new encrypted envelopes. All five
viewer files must match the committed source exactly. Existing or new report IDs
that collide under the provider's normalized, case-insensitive paths are rejected
before the preservation build. Empty batches, plaintext/key files and reader drift
are rejected. Do not reuse an obsolete predecessor inventory.

The preceding browser-only source (`6b2f4dd`, PR #120) supports a label-only
transition from the initial unsent-preview label to “Private player report” using
`--append --update-entry-label`. That command requires the matching, unchanged
browser renderer/CSS from that revision. The held app-entry source below uses a
different renderer and cannot perform that label-only migration. Do not apply
the two migrations in sequence; select the reviewed path matching the actual
published predecessor.

The separately held app-entry transition uses `--update-workout-entry` after
`--append`. It pins both the initial published and reviewed replacement bytes of
`index.html`, `render.mjs` and `report.css`; it cannot be combined with
`--update-entry-label` or applied to a different predecessor. The other two reader
files and every old encrypted snapshot remain exact. Its receipt records
`readerTransition: workouts-v1` and `requiresSeparateNativeAcceptance: true`.
An initial build installing this reader also records that native acceptance is
required. The builder does not verify or waive the compatible signed-build and physical-device
release checks. After that exact transition is accepted, later batches use plain
`--append` against their freshly captured predecessor.

Each child's measurements, cohort, missing-data handling, PDF and exact workout
target must be reviewed before sealing. Keep recipient identity and tone evidence
with a private batch ledger. Preparing or publishing private links does not send
texts; each proposed group of ten messages awaits the user's explicit go.


## Optional signup-first report entry — November 7 candidate

A selected encrypted v1 payload may include `playerSignupUrl`: the canonical
existing `https://posetek.net/signin#playerCode=…` returned by a freshly checked,
exact-player saved invitation. Do not construct a code from a report/player ID.
The renderer validates its origin, path, fragment and player locator and produces
`/signin?reportPlayer=<id>#playerCode=…` on the current host. The report key and
opaque report ID never enter that URL. Only the encrypted payload contains the
invitation; no plaintext invitation, name, account or report link is tracked.

Possession of this optional invitation-bearing report enables the canonical
signup/claim flow for that player. It is therefore a signup capability as well
as a readable report, not merely a locator. The code is checked and redeemed by
existing server endpoints; opening the report itself makes no Auth/backend
request. Existing ready-invitation evidence is separate from public validation,
account creation, sign-in, app use and workout availability. Stale or claimed
invitations show sign-in guidance and do not create duplicate Auth accounts.
Recipient holds and explicit sharing approval apply to this expanded capability.

Results, summaries and practice remain above the bottom action group. The primary
workout button opens signup first; the code is prefilled and removed from the
address bar before imports. It lives only in page memory, never query persistence,
referrers, analytics or local/session storage. Already-created player accounts can
sign in without the code. The fixed continuation accepts only the requested
canonical child and the server-returned redeemed child; arbitrary `returnTo`
values do not redirect report flows. Staff and another player's account are
blocked with explicit switch-account guidance, never silently signed out or
redirected into admin. The native/TestFlight choices remain in a secondary
already-set-up disclosure, with the same exact-child locator and return/tap steps.

The isolated sign-in document uses the existing canonical LandingPage, Auth,
invitation and account-access helpers. It does not package the application routes.
Successful continuation makes a full-document navigation to the preserved
application's exact-child Training page. A matching active plan, native installed
build and physical-device acceptance are separate evidence; fixture navigation
alone establishes none of them.

The current production source cannot be proven from the manual deploy receipt.
Accordingly this candidate appends only the sign-in dependency closure, replaces
the three pinned reader files and adds the explicitly selected ciphertext. It
preserves `application.html`, all marketing, all historical assets and old reports.
Canonical `netlify.toml` remains unchanged: the candidate-only reviewed config is
`deployment/private-player-signup.netlify.toml`. Its only differences are the
`/signin` rewrite to `/player-signin.html` and private security headers for those
two paths. Normal builds therefore retain their existing routing. This optional
assembly requires all three flags:

```sh
node scripts/build-private-parent-report.mjs <evidence-dir> --sealed-dir <binary-only-dir> --append --update-pathway-charts --with-player-signup
```

The builder pins the candidate config hash and rejects changed or colliding
predecessor assets. The installed CLI selects configuration from its working directory. Copy that
exact config to `netlify.toml` in a separate upload directory and use explicit
`--cwd <upload-directory>`, `--no-build`, the absolute reviewed artifact path and
an empty functions directory; never `--prod`. Verify the copied config hash
before upload. Do not replace the canonical source configuration. A source commit or
successful assembly does not authorize promotion, source release or outreach.
Review effective hosted routing/headers, ordinary sign-in behavior, isolated
bootstrap/full navigation, report/PDF equality and production identity separately.
Tests use synthetic invitations and mock account boundaries; never submit real
invitations or register a child as automated acceptance.
