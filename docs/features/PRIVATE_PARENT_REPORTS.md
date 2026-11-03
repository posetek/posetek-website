# Private parent report review candidate

A family opens a phone-friendly report with a private link. The report keeps the
approved three-band team chart, plain-language summary, two starter exercises,
one athlete-specific Workouts button, and an optional PDF download.

This is an **unpublished source candidate**. No parent or coach outreach is
included. The October 26 parent-results chat owns recipient history, message tone
and future sending, after Dylan reviews the hosted report. Coach delivery is held.
The active website Revamp release takes precedence; capture its completed live
artifact before assembling or uploading this review candidate.

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

Only the generic reader is tracked. Plaintext report inputs, PDF bytes, keys,
complete links and recipient mappings stay in private local evidence. Production
artifacts may contain encrypted binaries only. The isolated reader has no Auth
SDK, tracking, third-party resources, local/session storage or service worker. It
fails closed when controlled by a service worker and uses no-store, no-referrer,
noindex, frame-denial and a restrictive CSP. Invalid/missing/tampered data shows a
generic message without revealing an athlete.

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
plan or native release is part of this candidate.

Technical references: [Web Crypto decryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt),
[URI fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).
