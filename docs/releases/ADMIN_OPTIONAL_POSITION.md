# Optional position in administrator player intake

Published October 20, 2026 as `6ad7f9e34d086d5f74247912`, promoted from the exact
accepted candidate. [Production receipt](../../deployment/ADMIN_OPTIONAL_POSITION_PRODUCTION.json).


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

## Release verification

The 2,117 artifact files match all 2,118 provider records. All 2,107 prior
records other than the application entry and generated metadata remain exact;
nine runtime assets were added. The reconciled baseline protects 2,115 files.
The live form and saved blank-position profiles were verified after reload.
Private intake records, contact details and screenshots are excluded from Git.

The isolated runtime branch `codex/admin-optional-position-runtime` preserves the
approved application and must not merge into main. Feature source is integrated
in PR #88. The unrelated session-continuation and policy candidates remain held.
