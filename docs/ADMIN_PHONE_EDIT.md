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
