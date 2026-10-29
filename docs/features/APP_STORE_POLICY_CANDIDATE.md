# App Store privacy and support copy candidate

Status: local candidate, not published. Updated 2026-10-12.

Branch `worktree-app-store-policy` starts at account-deletion backend `db86590`. Changes are limited to public React privacy/support wording and focused SSR coverage. Existing public anchor IDs and approved retention periods are preserved. The policy date was already October 12, 2026 in the parent candidate.

The native AI section names Google Vertex AI, Anthropic and TypeSafe (Jev), the account-settings route, data categories, separate OS permissions, per-account/device grant, withdrawal behavior and offline revocation limits. Support gains matching AI and diagnostic-media answers. Diagnostic copy distinguishes queued uploads from already-started transfers, states that logs still send, and describes own-athlete/device scope. Team removal and coach-account deletion remain distinct from deleting player accounts.

Source basis: combined mobile `LLM/LLMChatClient.swift` (`AISharingConsent`, `AISharingConsentView`), `Auth/AccountDeletionView.swift`, `DrillSettingsView.swift`, `Diagnostics/DiagnosticRedaction.swift` and `Diagnostics/DiagnosticUploadOutbox.swift`. No new provider contract or retention promise was introduced. Existing provider-contract statements remain subject to owner verification.

## Checks

`npm --prefix app test -- --config vitest.policy.config.mjs --configLoader native`: 15 SSR tests passed. This focused config uses the installed React/Vitest dependencies and a temporary cache. The ordinary Vite config cannot load in the current environment because installed Svelte/Tailwind plugins are absent; full build and browser layout checks remain unrun. `git diff --check` passed.

## Publication gates

- Publish only with the corresponding native/backend/gateway controls available and verified. Current local implementation does not establish live functionality.
- Preserve the approved 30-day deletion policy. Operational verification must prove the worker, external copies/holds, warehouse, backups and provider-retention handling meet it. See [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md); unresolved external erasure cannot be treated as completion.
- The existing 90-day backup/receipt and other retention statements were preserved, not reverified. Likewise, the existing provider no-training/contract language was preserved, not newly substantiated.
- Verify the exact website artifact serves these React routes; ordinary preservation builds may retain previous hosted assets. Legacy `privacy.html` was not rewritten or released.
- Owner review of wording, public no-login route checks and responsive browser inspection remain required before publication. No policy/legal approval, deploy, push or real-account operation is implied.
