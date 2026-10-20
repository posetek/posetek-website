# Optional position in administrator player intake

Administrators can create a club player with **Position (optional) → Not recorded**.
The request omits `position` entirely when blank; it never invents a position or
writes an empty-string placeholder. The selection can be cleared after choosing a
position. Phone, names, team and the existing measurement validations stay intact.
Coach and organization-manager creation forms retain their current requirements.

The live `createClubPlayer` version 2 (September 13, 2026) was inspected before
this change. It supports omission and retains its existing canonical membership,
team, capacity and invitation transaction. This release requires no backend, rule,
index or data migration. Existing profiles can already store no position.

The unreleased Backend source currently has stricter position validation than the
live callable. Before that separate candidate is published, it must preserve this
administrator-only optional-position behavior; do not deploy it with this frontend
change. Its other held changes are outside this release.

Regression coverage checks optional input, omitted payload, required phone,
rejection of an unsupported nonblank position and unchanged staff defaults.
The production candidate must retain the current application runtime and change
only this intake behavior, preserving marketing, policy, feedback and coach entry.
Private signup/import evidence stays outside this public repository.
