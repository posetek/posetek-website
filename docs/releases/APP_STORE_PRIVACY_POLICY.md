# App Store privacy policy — source candidate

**Status:** in progress, original source push approved (2026-11-19); November 20
copy follow-up push approved by the owner. Checklist item 2 remains open.
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
- Limit optional PostHog sharing and its account-setting control to explicitly
  enabled internal development tests; App Store and TestFlight builds keep it
  disabled. Preserve the separate account-linked first-party usage disclosure.
- Advance the policy's last-updated date to November 20, 2026; preserve section
  anchors and contact details, and correct the player account-settings route.

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
| Optional analytics | Mobile `54c79bf0` holds SDK initialization and the settings toggle off in every Release build. `ProductAnalyticsPolicy.isAvailable` permits only explicitly enabled Debug tests. The candidate policy follows that source; signed-binary/network verification remains item 6. |
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
analytics release verification (item 6), precise retention/deletion evidence (item 3), and
the data-use inventory for model development and benchmarks. This change does
not establish a legal basis for secondary model/benchmark uses, or validate the
existing all-US processing claim. Reconcile those paragraphs with the final
enabled features before publication.

Local verification: 19 policy/support tests passed, including static rendering,
stable anchors and retained deletion/permission instructions. The full
TypeScript project check, scoped lint and whitespace check passed. No full-site
build or visual browser acceptance was run for this text-only change.

The production deployment has not been changed. Publish only through the
preserved-artifact process, using a fresh served-file inventory and the approved
application runtime.

## November 20 — match the prepared native release

Corrected the player navigation in policy and Support to **Account menu (the
initials button) → Account settings**, matching `V4PlayerHeader` and the
`CoachPlayerView` sheet wiring at mobile `77b87ef1`. Coach/staff home-screen
account-icon instructions remain. This does not enable the held parent-deletion
guard or change the deferred staff/guardian AI policy.

The analytics paragraphs now match the approved Release hold instead of
advertising PostHog collection and a toggle in TestFlight. Internal development
tests remain disclosed, with the existing first-party usage, diagnostics and
website analytics disclosures preserved. The draft revision date is November 20.
Publish this wording only alongside a verified native release containing that
hold; it is not evidence about older installed builds.

Signed-out browser readback on November 20 confirms `/support` loads and shows
the published contact address, but still gives email-only deletion instructions.
Following its privacy link loads the policy dated **October 5, 2026**, which
also describes email deletion and names Google/Anthropic without the newer voice
providers. No form was submitted, mailbox tested or public content changed.

Local follow-up checks: all 19 existing policy/support render tests, full
TypeScript project check, scoped lint and whitespace checks pass. No new
dependency, full-site build, native build or device validation was needed or run
for these copy edits. Live page inspection verifies the mismatch, not the
unpublished candidate's browser layout or native release behavior.
