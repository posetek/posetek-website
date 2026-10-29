# Coach links with recipient-entered details

Live October 13, 2026, website `6ace0ad29778ccacfb979dda`, with five additive
version-1 callables. See [confirmed production evidence](../../deployment/COACH_ENROLLMENT_PRODUCTION.json)
and [PR #57](https://github.com/posetek/posetek_website/pull/57). The previous main
application remains byte-identical. No real coach redemption is claimed.

The user does not know the coaches' full names or login emails beforehand. A
separate **coach enrollment** invitation therefore delegates one coach account to
the recipient of a private, single-use, seven-day link. It does not change the
email/UID bindings of existing staff activation, internal administrator activation
or assisted recovery. Link possession authorizes the invited coach scope; it does
not verify a person's identity or their email address.

The recipient sees the organization and exact teams, enters first name, last name,
email and their chosen password, or signs into an existing password account.
The server reads the current Auth identity; a body email never selects that
identity. New account creation uses ordinary Firebase Auth, then membership and
link consumption commit together in Firestore. If membership fails after signup,
the existing login is retained and can retry. The server changes no password,
verification or enabled state. No verification email is sent. See Firebase's
[password account flow](https://firebase.google.com/docs/auth/web/password-auth)
and [transaction guidance](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Scope and transport

Only current verified PoseTek administrators or active canonical organization
managers issue links. Issuance requires sign-in within five minutes. Every link
has fixed organization/team IDs and **coach** role; no manager/admin enrollment
exists. Teams and issuer authority are checked again at inspection and claim.
Claim requires recent, registered Auth sign-in. Existing athlete identities,
populated independent rosters, other organizations, aliases, pending bound staff
invitations and uncertain access writes retain their blockers. Reserved company
addresses cannot consume coach enrollment.

`coachEnrollmentLinks/{requestUUIDWithoutHyphens}` is server-only. A random 256-bit
secret is hashed; URLs use `/coach-join#coachInvite=COACH-…`. The code is removed
before hydration and retained only in page memory. Never put real links, codes,
passwords or private operator receipts in Git. Stable request identities reject
duplicate issuance. Lost secrets require reviewing/revoking the old pending link
before issuing a new one. Same-account claim retries return current membership;
another account cannot consume it, and retries cannot restore revoked/reassigned
access. Canonical membership, staff profile, coach/roster projections and link
consumption share one transaction. Existing player records are not rewritten.

Five code-only callables provide create, inspect, claim, bounded list and revoke.
Public inspection is rate limited and reveals team descriptors, never player
records or recipient identities. Listing and revocation require current manager
authority. Existing manual activation/recovery callables are not deployed by this
scope. Enrollment data includes no recipient name/email; canonical staff records
hold those details after claim. Audit events use the existing private audit path.
Deletion locks are checked within write transactions. The held account-deletion
worker's source selectors include enrollment issuer/claimant/revoker UIDs; this
change does not publish or enable that worker or its external/native gates.

## Website and design

`/coach-join`, `/coach-join/` and `/coach-join.html` are one isolated Astro document
with a React form and Auth-only integration. No main Firebase module, Firestore,
tracking, replay, analytics or email delivery client is loaded. The CSP allows
only the existing Auth and callable endpoints, prevents framing and native form
navigation, and strips referrers. Refresh loses the in-memory secret: reopen the
original invitation message. Opening another invitation in the same tab reloads
the isolated document, consumes its new fragment and resets the form. After activation, Team Insights opens with the
single team selected or both assigned teams available under the organization.

The design lock is the existing PoseTek signup/access card: green canvas and
surfaces, Inter/system typography, lime primary action, visible field labels,
native radio choices and 44px-or-larger controls. Refero's bundled form/focus craft
and Astra's product UI guidance support autocomplete, explicit error/success
states and narrow-screen reflow. No live Refero tools were available. The team
scope appears before the form and cannot be edited by the recipient.

This release adds the document and its compiled dependency closure to the exact
live predecessor. All old application, privacy/support, marketing, feedback,
icons and assets remain exact. The newer App Store policy/deletion candidate stays
held. Only the two new URL aliases and dedicated coach-entry security headers
are added; existing route/header behavior is verified independently.

## Confirmed private handoff

- Coach Rob: Vacaville United Soccer Club / Boys — Coach Rob.
- Coach Daniel: Vacaville United Soccer Club / Girls-Coach Daniel.
- Coach Niall: Vacaville United Soccer Club / Boys — Coach Niall and Girls — Coach Niall.

Three unused links were issued using Dylan's normal admin sign-in and emailed
separately to Dylan Keller at `dylank@posetek.net` for individual forwarding.
Mailbox readback confirmed all three; they expire October 20, 2026. Raw link delivery remains private and outside release
records. These assignments do not identify or alter the preexisting Robert Keller
account currently assigned to Niall's boys team. Coach accounts are created or
linked only when the intended recipients redeem their respective invitations.


## Acceptance and cleanup

Candidate/production browser acceptance passed 15/13 checks with five captures
each at 360/390/430/1440px and no page errors. A fresh production browser verified
ordinary password sign-in and both-team scope. Backend checks used real Firestore
transactions to verify competing claims yield exactly one coach. Actual published
canonical rule bytes passed 280 private-collection denials; no rules were published.
All nine synthetic accounts, two organizations, three teams, three players, eight
links, descendants and scoped projections/audits were removed. Independent delayed
readback made 441 reads and found no residue. Temporary credentials were removed.
Shared operational rate counters retain their ordinary TTL; no storage, workout
or model fixtures were created.

The full frontend suite passed 1,956 tests; 150 relevant backend/release checks,
two packaging tests, TypeScript, guarded builds and the reconciled 1,971-file
ordinary preservation build passed. All previous 1,968 artifacts and all 130
unrelated functions are preserved. The held deletion-worker cleanup selector is
source-only and has not been enabled or deployed.
