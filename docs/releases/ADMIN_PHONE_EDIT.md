# Administrator phone corrections

A player's Profile → Contact details now lets a verified PoseTek admin save a
parent/guardian phone number. Email stays read-only, and player previews have no
phone edit control. The editor accepts complete US numbers with optional +1,
prevents repeated saves while pending and reloads the profile after success.

The Backend-owned `updateAdminPlayerPhone` callable checks the current Auth
identity, deletion locks and the exact previous phone number before changing only
`phone_number` and `updatedAt`. Concurrent edits require a refresh. It does not
change a sign-in identity, membership, player ID or testing history. Blank/invalid
numbers are not saved. Unknown parent numbers remain pending.

Source integration and runtime publication are separate. Compose this frontend
patch onto the current approved runtime; preserve held policy/session candidates,
marketing, feedback and coach enrollment. The callable has a separate one-function
publisher in Backend; no rules or unrelated functions are released for this feature.
Private player correction evidence stays outside the repository.

## Published verification

Website `6ad90a23e4b4a4ece16b2729` and Backend callable version 1 are verified.
All 2,125 artifact files match the accepted draft; marketing, feedback and coach
enrollment bytes remain exact. Main, runtime and Backend CI passed. Runtime CI
initially found expired inherited audit records; the already approved current
Web/Backend exception records were carried over with byte-identical lockfiles.
No dependency or exception expiration was changed beyond that existing approval.
The approved exception records expire October 22 and require their ordinary
review before a later release. Private corrections preserve all other profile
fields and retain unresolved contacts as pending. See the production receipts.
