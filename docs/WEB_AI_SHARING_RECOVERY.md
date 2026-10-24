# Web AI-sharing recovery

Status: source candidate; production publication is separate.

The gateway rejects AI coaching and workout generation when the signed-in
account has no valid AI-sharing receipt. The website previously displayed that
failure without providing a way to review and save the required choice. A
regression test reproduced the missing recovery control. This establishes a
specific blocker; it does not establish the cause of every reported loading
failure. Private support messages, account identifiers and logs remain outside Git.

Players can now review AI sharing from Coach, personal Workouts and their own
Profile. The disclosure identifies the data categories and AI providers, links
the privacy policy, and offers explicit allow/decline actions. Merely opening
the control does not save a choice. A successful allowance preserves the request
for the player to resend; it never automatically starts a model call. Preview
choices are local demonstrations and do not change an account preference.

The fixed `/api/ai-consent` rewrite reaches the existing authenticated gateway
endpoint. Only `{version: 1, allowed: boolean}` is submitted with the current
Firebase token. The gateway determines the actor; the browser cannot choose an
account ID. A valid exact receipt is required before showing success. No rule,
backend, native client, provider setting or real player receipt is changed by
this source patch.

Withdrawal immediately blocks new AI requests locally, including when the
account-wide save fails. The UI distinguishes that uncertainty and allows a
retry. A per-account queue and revision check prevent stale choices in another
control from overriding a later withdrawal. The in-memory denial survives
unavailable or full browser storage. Already accepted requests may finish.
Code-only assessment, save, start and execution remain available. Existing
accepted jobs can be recovered without duplicate writes.

Validation covers missing-consent recovery, preserved drafts, exact requests,
malformed/error replies, failed withdrawal, token-refresh timeout, account
switching, stale responses, storage failure, competing choices, and the
code-only exemption boundary. All fixtures are synthetic. Desktop/mobile browser
preview checks establish layout and preview interactions, not authenticated
provider generation or physical-phone acceptance.

Release preparation must use the approved runtime `499dc815` plus this patch,
with the fresh `6ada849fa3505ca75b08ec3b` preservation inventory and guarded
application builder. Main also contains held policy/session/Ball Striking source;
it must not be published as a whole. Keep `[skip netlify]` on source integration,
retain exact draft acceptance, and record production promotion separately.
