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

The report is a read-only bearer link: anyone with the complete link can read it.
It does not verify a guardian or sign someone into PoseTek. A new random 256-bit
AES-GCM key and 96-bit nonce protect each snapshot; a random 192-bit opaque ID
selects the encrypted payload. The version and ID are authenticated as additional
data. The key lives in the fragment, which is not sent in HTTP requests. The
fragment intentionally remains so refreshing/reopening works. Treat browser
history, copied links and downloaded PDFs as private. No promise of automatic
expiry or recall is made; deleting today's file cannot revoke copies or historical
immutable deploys. Parent distribution requires review of this access model.

Only the generic reader source is checked into Git. Plaintext report inputs, PDF bytes, keys,
complete links and recipient mappings stay in private local evidence. Production
artifacts may contain encrypted binaries only. The isolated reader has no Auth
SDK, third-party resources, local/session storage or service worker. It
fails closed when controlled by a service worker and uses no-store, no-referrer,
noindex, frame-denial and a restrictive CSP. Invalid/missing/tampered data shows a
generic message without revealing an athlete.

The 33 sent November 4–5 links use first-party engagement tracking after activation.
**People & organizations → Vacaville United Soccer Club → All teams → One-pager
tracking** shows the first visible open, workout-button click and TestFlight click
per report. The event sends only the action and a separate write-only capability.
A forwarded link still counts for the original report. Records expire after 90 days.

The tab also shows **Reports sent**, an estimated **time on page** per report and a
chart of cumulative opens, workout clicks and TestFlight clicks against the number
sent. Time on page is the total across all visits to one report. It counts only
while the report is the visible tab, for up to two minutes after it is opened or
returned to and after each touch, scroll or key; opening the report counts as
activity because a short read often has no scroll. After the device sleeps, counting
waits for the next touch. The reader sends whole seconds every 15 seconds and when
the page is hidden or closed, and stores nothing in the browser. The server keeps
one running total per report, credits a first update as sent (up to 60 seconds) and
after that never more than the clock time since the previous update, so two people
reading one link at the same moment count once. It writes at most once a second per
report. Time before this version was published is not recovered, and the
last few seconds of a visit can be lost if the browser closes abruptly. The cards, chart
and table describe the selected cohort. The chart is drawn from each report's
first-event times. Its sent line steps up at each verified send time saved when a
send is recorded; the original November 4–5 cohort was registered together after
its sends, so its sent line is level. The reader's on-page
notice names every recorded action, including viewing time.
The reader stays open in its own tab while signup or TestFlight opens. Both
destinations continue to work if tracking is unavailable.

The workout button builds only
`https://posetek.net/athlete?player=<id>&view=training`. This is a locator, not an
access grant. Existing account authorization continues to decide access. The
reader never claims an account, starts a workout, writes activity or transfers
credentials. Signed-out users use the existing sign-in flow. Unclaimed accounts
still need their existing private invitation; first signup currently opens
Profile rather than preserving the Workouts destination. No recovery token or
invitation is embedded in the report.

## Installed app boundary

The audited native app has no athlete-workout URL handler or associated-domain
entitlement; the website AASA paths currently return HTML. The report therefore
uses the working HTTPS browser destination. Installed-app opening remains held
until a native authenticated route, valid association, signed build and physical
phone acceptance exist. Do not add a speculative custom scheme or app-install
probe. Existing outdoor run/bike/walk links must not be reused.

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

For the one-time transition from the initial unsent-preview label to the neutral
“Private player report” label, append `--update-entry-label` after `--append`.
This permits only the pinned original and replacement `/report/index.html` bytes;
it is not a general viewer overwrite. The receipt separately counts that changed
entry, unchanged predecessor files and new encrypted snapshots. The other reader
files, existing snapshots, application and marketing remain exact. After that
transition, subsequent batches use plain `--append`.

Each child's measurements, cohort, missing-data handling, PDF and exact workout
target must be reviewed before sealing. Keep recipient identity and tone evidence
with a private batch ledger. Preparing or publishing private links does not send
texts; each proposed group of ten messages awaits the user's explicit go.
