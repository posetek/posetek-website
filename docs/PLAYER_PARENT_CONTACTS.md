# Separate player and parent contacts

Admin → Player → Profile shows the player's own phone and their parent or
guardian's phone from `player_phone_number` and `parent_phone_number`.
Administrators can change or clear either number. The existing `phone_number`
remains editable as the legacy primary contact and is never used as a fallback
for either owner. Email and additional imported contacts are read-only.
Existing per-owner attribution is displayed for saved numbers.

**Save phone numbers** validates every edited input before sending it.
The scoped `updateAdminPlayerPhone` callable checks each edited field's exact
prior value in one transaction. If any edited number conflicts, the whole save
is rejected and the administrator can refresh the profile. The client verifies
the player ID and every returned number before displaying success. A
primary-only edit uses the original single-phone request.

[Backend PR #62](https://github.com/posetek/posetek-backend/pull/62) carries the
additive callable contract and preserves existing administrator verification,
deletion guards and legacy clients. Contact edits affect only the selected
contact fields, their attribution and the update timestamp. Saves do not send
notifications or change sign-in. Private contact data and reconciliation
evidence stay outside Git.

For a separately authorized release, qualify the scoped callable first and
then assemble the paired frontend onto the approved runtime using the current
preservation workflow. Keep `[skip netlify]` on source integration.
