# Separate player and parent contacts

Requested behavior: administrators can record and edit a player's own phone and
a parent/guardian phone separately. Unknown values stay blank. Existing contact
numbers are not automatically assigned to either owner. Email, identity,
membership, testing, sign-in and notification behavior are preserved.

The admin Profile contact card reads `player_phone_number` and
`parent_phone_number`, with an independent editor and save action for each.
`parent_guardian_name`, optional `additional_parent_contacts` and the per-owner
`*_phone_basis` explain imported relationships. The previous `phone_number`
remains visible separately and unchanged. Read-only previews cannot edit.

Backend's existing `updateAdminPlayerPhone` adds optional `contactType` (`player`
or `parent`), and permits null to clear these new fields. Requests without a
contact type retain the old legacy behavior. The server rechecks current verified
admin authority, deletion locks, exact prior value and response identity.
Only the selected phone, its basis and timestamp change. A response that cannot
be verified requires a profile refresh. No notification is sent by a save.

The owner-approved reconciliation treats signup form numbers as parent numbers.
A different testing-profile number is the player's number. Same numbers are
not copied into both fields. Explicit owner exceptions take precedence. Where
there is no form, saved contact ownership or a clearly labeled under-13 assumption
may be used. Invalid numbers remain blank. Duplicate profiles and unresolved
identities are held for review. Private contact evidence stays outside Git.

Release order: qualify and release only the Backend phone callable, then compose
this frontend patch on the approved runtime, verify a guarded draft and publish
that exact artifact. Do not publish all of main or activate held source. Keep
`[skip netlify]` on source integration. Data reconciliation is a separate guarded,
scope-limited operation with private before-images and readback.

Current status: source candidate. Local scoped tests and TypeScript checks pass.
Hosted CI, live callable checks, frontend draft acceptance and publication remain
separate until recorded. Existing iOS clients continue to use the unchanged
legacy field. No rules change is required or included.
