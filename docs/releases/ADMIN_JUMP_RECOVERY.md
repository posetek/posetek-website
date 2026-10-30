# Admin jump recovery release

Status: published and byte-verified October 30, 2026 at 1:34:25 PM PDT. The exact
accepted draft was promoted without rebuilding; live admin playback and
estimate labels were verified without changing a real athlete result.

[Production receipt](receipts/ADMIN_JUMP_RECOVERY_PRODUCTION.json) ·
[review workflow and contract](../features/ADMIN_JUMP_REVIEW.md) ·
[source PR #109](https://github.com/posetek/posetek-website/pull/109).

Admin Rep Tools has a dedicated jump-review panel for an original recording.
The reviewer can select a visible marker's black border and measured size, or
bracket takeoff and landing when contact is clear. Source presentation
timestamps and decoded browser-frame evidence are required; nominal FPS and a
requested seek alone are insufficient. Missing evidence blocks recovery.

Both methods produce an **ESTIMATE** with a sensitivity range. The server
recalculates reviewed inputs and binds the request to the recording generation,
source fingerprint and current revision. Saved estimates remain outside
verified rankings. Their numeric height exists only in
`jumpRecovery.heightMetres`; root and metadata height aliases remain null so
older installed clients cannot display an unlabeled recovered measurement.
Admin shows the nested estimate explicitly. Original values and annotations
remain in restorable revision history, and save success requires fresh readback.

The published candidate is deployment `6ae4fc4e990d28e8d584e696`, assembled from
approved application runtime `bb3274c` plus jump review and a scoped transitive
re2js 2.8.7 security patch. Runtime commit
`63bae63653b86ea7b1725e90f0e7d516e5e35d7a` is separate from current source main.
Its 2,383 files match the production inventory; the provider adds one generated
configuration record. No prior file is removed. Only the application document
changes among prior served files; 56 assets are added. Current Players/Coaches,
feedback, coach enrollment and historical assets are preserved. Policy, session,
Ball Striking and shared AI chat transport candidates remain excluded. The
reconciled baseline protects 2,381 files, retains all 37 historical local-path
recovery records and passes the ordinary preservation build. That build was
verification only and was not published.

Backend runtime `f1fc955408f13b5c13f8d4ccee57a0b90e719eaa` publishes only the
coordinated jump-review functions: `adminGetJumpReview` v1,
`adminPreviewJumpRecovery` v1, `adminReviseRep` v6,
`adminRestoreRepRevision` v5 and `adminGetRepRevisions` v2. Unrelated functions,
rules, indexes, service-account IAM and existing-function IAM remain unchanged.
The two new readers use public callable transport with application-level admin
authorization required. Release ordering and synthetic
acceptance are recorded in the private Backend repository; do not publish
backend code from this website checkout.

Source verification passed 2,220 frontend tests, TypeScript/Astro production
build, 82 web-script checks, 32 policy checks, seven guest-browser checks and
the six-lane hosted CI run at feature head `7a5bd4b`. The scoped runtime passed
2,047 frontend tests and its guarded composition. Latest-head independent
advisory source review found no actionable issues.

Hosted authenticated acceptance verified manual-marker and flight-time previews,
method-change preview invalidation, exact frame seeking, estimate save with
fresh readback and exact restore. Backend acceptance additionally verified
idempotent retry, source-generation binding, stale-evidence rejection and
unauthenticated/non-admin denial. An archived original recording was read and
sought without changing its result. Synthetic records and temporary identities
were removed and cleanup was verified. Delayed stability checks found all 28
scoped documents and ten objects absent, the temporary auth identity removed,
and the real-record hash unchanged. Live production verified the new review
panel, ESTIMATE labels and exact archived-video frame seeking. No real athlete result or contact was
changed, no notification was sent, and automations remain unchanged.

The phone-side failed-recording capture implementation remains a separate
native rollout. This admin release does not recover recordings never uploaded,
prove physical measurement accuracy, qualify all browser codecs, or give
recovered results verified ranking credit. Nonzero source origins and uncertain
frame mappings stay blocked until their mapping is established.

Source PR #109 remains unmerged because the coordinated Backend hosted CI has a
billing hold; no billing change or merge override is authorized by this receipt.
Keep `[skip netlify]` on source/receipt integration and keep runtime branches
separate. Future production work must verify the current live inventory and
preserve the released application. Corrections use a reviewed fix-forward
candidate; website publication does not reverse stored repetition revisions.
