# AI consent version 2 — source candidate

**Current status (November 21):** the owner approved a temporary represented-athlete
AI restriction for the release candidate. The account control now says permission
covers the caller's own canonical athlete profile; staff, coaches and linked parents
or guardians cannot authorize another athlete's AI. Backend/native enforcement is
prepared on matching `worktree-app-store-fixes` branches. Ordinary authorized records,
saved-workout actions and privacy controls retain their existing permissions.

Current web checks: 26 consent/privacy/support tests passed; TypeScript passed;
scoped lint has only the two existing effect-ref warnings. Public summary and
detailed policy sections both remove the earlier staff exception. These are local
source checks, not hosted acceptance. PostHog remains disabled in App Store and
TestFlight builds. The owner approved and pushed `d77ff3c`; no deployment,
App Store field change, upload or submission is authorized.

The following version-2 implementation notes and counts describe the earlier
November 19 source checkpoint; its staff/guardian deferral is superseded.
The owner approved pushing item 1 on 2026-11-19 to `worktree-app-store-fixes`
in each repository. Deployment remains held; later checklist items retain the
requested push-approval checkpoints. Keep `[skip netlify]` on source integration.

The shared account consent endpoint now requires version 2 for new grants.
The web control discloses TypeSafe (Jev) voice routing and OpenAI live speech in
the native app, including the text each processes, alongside Google Vertex AI
and Anthropic. It sends version 2 and requires a matching receipt. It never
caches a grant. Existing browser withdrawal keys remain effective; a stale
version-1 response cannot clear one. The gateway continues to accept old
clients' version-1 revocation, but refuses version-1 grants.

This is the web compatibility portion of App Store checklist item 1. Public
privacy-policy changes are tracked in item 2. The November 21 restriction closes
the represented-athlete source path; live enforcement, minor/unknown-age owners
and provider/secondary-use evidence remain separate release gates.

Validation: all 49 consent/control/gateway tests and the full TypeScript project
check passed. Scoped lint passed with two pre-existing effect-ref warnings in
`AISharingControl.tsx`. Hosted authentication, full site build and browser/device
acceptance remain unrun.

Release together with the matching native disclosure, canonical backend and
qualified Firestore rule predicate, and updated public policy. Older clients
cannot re-grant until updated; no receipt backfill is permitted. Existing
version-1 grants fail closed once enforcement changes. Compose web changes onto
the then-approved runtime and preserve the freshly inventoried served files;
the full main tree contains unrelated held candidates. This source note does
not approve publication or supersede earlier production receipts.
