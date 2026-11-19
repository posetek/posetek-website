# App Store privacy policy — source candidate

**Status:** in progress, source push approved (2026-11-19), checklist item 2.
Branch: `worktree-app-store-fixes`. Item 1 was pushed as `406e30f`; the policy
changes described here were prepared afterward. The owner explicitly approved
pushing this candidate to the same branch before continuing account deletion.
No production publication is approved. Keep `[skip netlify]` on integration.

## Changes prepared

- Name OpenAI and the text-to-audio purpose in both provider lists and Support;
  distinguish live speech from bundled recordings.
- Describe TypeSafe's transcript and limited screen/drill/recording context,
  web consent controls and renewed permission for expanded disclosures.
- Replace the unverified blanket provider-training guarantee with the scope
  of the user's permission. Explain that withdrawing permission does not
  immediately erase provider copies retained for security or legal purposes.
- Replace the blanket no-location claim with on-device GPS routes, uploaded
  activity summaries and optional simplified route drawings.
- Disclose submitted body-scan photographs separately from saved drill videos.
- Name optional PostHog app usage sharing and its existing account-setting
  control, without conflating it with account-linked first-party usage records.
- Advance the policy's last-updated date to November 19, 2026; preserve section
  anchors, contact details and existing deletion instructions.

## Source evidence

This is source evidence, not a readback of the selected App Store build or
production configuration. Mobile and backend links refer to the shared fixes
branches; production can differ.

| Flow | Evidence and boundary |
|---|---|
| OpenAI live speech | [Gateway speech](https://github.com/posetek/posetek-backend/blob/worktree-app-store-fixes/Services/agent-gateway/gateway/speech.py): `/v1/realtime`, `input_text`, generated audio. Account retention/training settings remain unverified. |
| TypeSafe/Jev | [Voice route](https://github.com/posetek/posetek-backend/blob/worktree-app-store-fixes/Services/agent-gateway/gateway/voice_route.py), `jev_state`: transcript, screen, drill, recording state, rep-anchor flag and pending clarification. The policy does not claim that raw microphone audio goes to Jev. |
| Apple speech recognition | [Recognition provider](https://github.com/posetek/posetek-mobile-app/blob/worktree-app-store-fixes/KickAI/Voice/Audio/AppleSpeechRecognitionProvider.swift): on-device recognition or explicitly permitted network recognition. Separate from AI-provider permission. |
| Outdoor activities | [RunTracker](https://github.com/posetek/posetek-mobile-app/blob/worktree-app-store-fixes/KickAI/Running/RunTracker.swift) stores full account/athlete routes in a local archive. [OutdoorSharing](https://github.com/posetek/posetek-mobile-app/blob/worktree-app-store-fixes/KickAI/Running/OutdoorSharing.swift) sends summary metrics and an optional unitless drawing, excluding the first/last neighborhoods. A route shape is not a promise of anonymity. |
| Body scans | [BodyScanConfirm](https://github.com/posetek/posetek-mobile-app/blob/worktree-app-store-fixes/KickAI/RecordingStuff/Player%20Body%20Scan/BodyScanConfirm.swift) uploads a PNG to athlete-specific Firebase Storage. Publishing held team-scan rules is not authorized by this disclosure. |
| Optional analytics | [ProductAnalytics](https://github.com/posetek/posetek-mobile-app/blob/worktree-app-store-fixes/KickAI/Analytics/ProductAnalytics.swift) and its Core policy allowlist custom events and disable replay. The existing default-on/receipt-gate and SDK auxiliary-request concerns remain item 6; no claim of complete network verification. |
| Deletion and retention | [Account deletion](https://github.com/posetek/posetek-backend/blob/worktree-app-store-fixes/functions/account-deletion.js) contains guarded cleanup and parent/child distinctions. Existing policy deadlines, backup windows, external copies and actual completion still require item 3's live verification. |

## Provider evidence still needed before publication

Public documentation checked November 19 supports a distinction between
model training and retention, but does not prove PoseTek's settings or contracts:

- [Google's data-retention guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)
  limits training without customer permission and describes feature-dependent
  retention. Verify the actual Vertex project, enabled features and logs.
- [Anthropic's commercial training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
  excludes training by default, with opt-in/feedback exceptions.
  [Retention guidance](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
  describes retention and exceptions. Verify the deployed account/model terms.
- [TypeSafe's privacy policy](https://typesafe.ai/legal/privacy-policy) states
  that prompts and inputs are not used to train or fine-tune models. It does
  not establish a PoseTek-specific retention period or executed agreement.
- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
  distinguish training opt-in, abuse monitoring and endpoint storage. Verify
  the production project's controls; Realtime eligibility is not proof that
  zero retention is enabled.

Do not add an equal-protection assurance or publish a no-training guarantee
without checking the applicable agreements and actual account settings.
Confirm each provider's permitted purpose, access, retention, deletion,
subprocessors and processing locations. Keep unresolved transfers out of the
release until that evidence exists.

## Other release gates

The policy remains held for the staff/guardian authority mismatch (item 4),
analytics decision (item 6), precise retention/deletion evidence (item 3), and
the data-use inventory for model development and benchmarks. This change does
not establish a legal basis for secondary model/benchmark uses, or validate the
existing all-US processing claim. Reconcile those paragraphs with the final
enabled features before publication.

Local verification: 19 policy/support tests passed, including static rendering,
stable anchors and retained deletion/permission instructions. The full
TypeScript project check, scoped lint and whitespace check passed. No full-site
build or visual browser acceptance was run for this text-only change.

The published signed-out page, in-app link and production deployment have not
been changed or verified. Publish only through the preserved-artifact process,
using a fresh served-file inventory and the approved application runtime.
