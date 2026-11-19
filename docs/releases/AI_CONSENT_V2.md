# AI consent version 2 — source candidate

**Status:** code complete locally, verification outstanding (2026-11-19).
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
privacy-policy changes are item 2 and are not included. Staff/guardian authority
and data-use limitations remain separate release blockers.

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
