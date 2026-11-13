# Workout reporting funnel — separate follow-up PRs

Status: approved follow-up scope, November 5, 2026. Nolan asked for a clear **Drafts created → Saved → Started → Finished** breakdown. This document is the handoff to the next implementation agent. Do not add its backend wiring or UI changes to the current admin-reporting refresh release.

## Outcome and boundaries

Add trustworthy workout lifecycle reporting under Admin → People and organizations → organization Workouts. Preserve the current compact design, filters, summary persistence across tabs, and charts above the player table. Deliver through separate Backend and Website feature branches/PRs after the current refresh is integrated. Read both repositories’ AGENTS.md and release handoffs; use isolated worktrees and coordinate with the architecture owner. This handoff is not authorization to deploy the follow-up automatically or change gateway, rules, native clients, or production records.

The current report counts execution logs. Generation evidence exists but is not ingested. Do not treat missing generation ingestion as lack of source evidence, and do not relabel starts as generation.

## Measurement contract

Show four compact lifecycle cards and a clear breakdown: **Drafts created → Saved → Started → Finished**. Provide period totals and comparable prior-period values using the report timezone. Define the identity and timestamp behind each number. Keep source categories available so programs cannot inflate the individual-workout count.

- **Drafts created:** successful, validated AI workout proposals. Count stable proposal identities once; distinguish an initial draft from refinement revisions. Show revisions separately if useful. Exclude failed requests, retries, cached replays and manually created workouts. Include personalized plan drafts as a distinct program category, not as single workouts.
- **Saved:** distinct published/saved workout identities. Preserve AI/manual origin. A revision is not a new saved workout. Programs and the individual sessions they generate are separate totals; a multiweek program is neither one individual workout nor an arbitrary count of current edited slots.
- **Started:** distinct execution identities with valid recorded start timestamps. Reconcile the existing linked-log deduplication with legitimate repeated executions. Never infer a start from time viewing a training page or video.
- **Finished:** executions ended as completed, using their recorded end timestamp. Keep ended early/abandoned/open outcomes available. Retain “completed as logged” where historical writer contracts do not certify all prescribed sets. Personal-workout completion currently validates blocks, whereas generic historical plan logs do not uniformly enforce that contract.

Separate **activity during a period** from a **linked cohort conversion funnel**. A workout saved before the period may start or finish inside it. Period counts need not decrease at each stage and must not imply a conversion rate. If conversion percentages are shown, explicitly select an originating draft/saved cohort, follow stable identities forward, define the observation window and disclose unlinked histories. Never manufacture missing draft links. A saved manual workout or generated program may legitimately bypass the personal AI-draft stage.

## Existing sources to inspect

Paths below are relative to the owning repository. Line numbers are starting references from the November 5 audit; follow the symbols if they move.

| Evidence | Durable source | Relevant Backend writer |
| --- | --- | --- |
| AI personal drafts | players/{playerId}/personalWorkoutProposals/{proposalId}; createdAt, proposalId, conversation/revision | Services/agent-gateway/gateway/personal_workouts.py:762–798; personal_conversations.py |
| AI/manual saved personal workouts | personalWorkouts/{workoutId}; preserved createdAt and createdVia, updatedAt, revision | gateway/personal_workouts.py:398–484 |
| Publication links | conversation publishedWorkoutId, publishedProposalId, publishedAt | gateway/personal_workouts.py:481–487 |
| Generated programs | trainingPlans/{planId}; planId, jobId, generatedAt; superseded plans retained | gateway/workout_persistence.py:334–409; gateway/pipeline.py:844–876 |
| Original generated program sessions | trainingPlanContexts/{planId}.originalWorkouts, possibly immutable artifact fallback | gateway/workout_persistence.py:277–299 |
| Generated/saved ad-hoc workouts | plannedWorkouts/{id}; workoutId, jobId, generatedAt, source/createdVia where present | gateway/pipeline.py:880–916; gateway/workout_persistence.py:1100–1126 |
| Personalized plan draft/activation link | draft identity and activated sourceDraftId | gateway/personalized_plans.py:95–135,223–233 |
| Execution | workoutLogs and personalWorkoutLogs; startedAt, endedAt, endReason, activeSeconds, snapshot/blocks | gateway/personal_workouts.py:803 onward; Website workout-repository.ts and use-player-workouts.ts |
| Request outcomes | llmJobs capability, complete/completedAt, result/resultRef | Services/agent-gateway/api/jobs.py:191–215 |

llmJobs completion alone is not a generated-workout count: jobs include edits, retries and other capabilities. Use output identity and authoritative saved evidence. Proposal expiresAt is a validity deadline; it does not prove TTL deletion.

Website flow references: app/src/pages/athlete-portal/player/use-personal-workouts.ts (generation, publication, start/resume and completion); PlayerTraining.tsx (draft application); workout-repository.ts and use-player-workouts.ts (plan/ad-hoc execution).

Current reporting gap: Backend functions/insights-v2.js:128–149 loads trainingPlans but retains only the active plan for summaries; functions/insights-v2-projection.js:113–130 projects workoutLogs/personalWorkoutLogs. It does not ingest proposals, personalWorkouts or plannedWorkouts. Inspect insights-entrypoints.js before adding projection triggers/invalidation. Website presentation lives in app/src/pages/admin/views/WorkspaceWorkouts.tsx and the shared report contract in app/src/pages/insights/lib/expanded.ts.

## Implementation sequence

1. Verify deployed writer revisions and read-only representative production record coverage, including the original Marco Victoria concern. Trace the same athlete/window across training-category activity, platform activity, execution timers, saved workouts and completed logs. Report aggregate evidence without copying private workout contents into Git. Source-only synthetic checks do not verify that example.
2. Check retention/TTL and historical schemas before claiming complete historical generation. Inventory timestamp formats, original-program context availability, manual/source ambiguity, missing links, superseded plans, deleted records and replay semantics. Record unknown coverage explicitly; avoid silently returning zero or partial totals.
3. Write the lifecycle identity/timestamp contract and synthetic fixtures first. Prefer existing authoritative records. If durable history requires new events, design idempotent server-owned records with a stated coverage start date; do not invent past data or mutate real records during verification.
4. Add a backward-compatible, admin-authorized Backend report extension using the complete filtered roster and existing transaction/auth rechecks. Bound reads and fail clearly when complete results cannot be established. Preserve manager/coach and installed-client behavior. Avoid returning private proposal contents, prompts, plan contexts or identity data.
5. Add the compact funnel cards and charts in a separate Website PR, with honest period/cohort labels and a useful source breakdown. Preserve the player table at the bottom, query filters, daily/weekly boundaries, and summary continuity across report tabs. Keep implementation terminology out of ordinary UI unless necessary to interpret a number.
6. Run the owning repositories’ local CI lanes plus focused behavior tests and authenticated synthetic browser evidence. Obtain independent review of the latest changes. Land companion PRs with explicit release order; qualify/deploy separately from the current refresh.

## Required acceptance cases

- One draft, refinement, save, start and completion map to the intended identities without retry inflation.
- Drafts never saved, saved workouts never started, manual workouts, saved-before-period starts, cross-midnight finishes and timezone/DST boundaries remain intelligible.
- Multiple programs, superseded programs, original session identities, later manual additions and ad-hoc workouts do not inflate generated counts.
- Duplicate linked logs are excluded while legitimate repeat sessions are preserved or explicitly marked unmeasured if the underlying schema overwrites them.
- Missing/deleted history, ambiguous source and absent original context are distinguishable from a genuine zero. No conversion rate is computed across unrelated period cohorts.
- Organization/team transfers, exclusions, search/filter scope and permission changes preserve reporting authorization and full-roster totals. New collections never leak data outside the authorized selection.
- Mixed historical completion writers remain honest about end status versus all prescribed sets. Activity time remains distinct from workout timer time.
- Loading, tab switching, errors and stale summaries preserve the current persistence behavior; player details are never shown for the wrong selection.
- Review a read-only production reconciliation for Marco’s original timer/activity discrepancy and document the explanation, without claiming source tests prove production accuracy.

## Deliverables

Separate Backend and Website PRs; a concise metric dictionary and coverage statement; scoped test/browser and production-read evidence; updated request audit; explicit companion release order and receipt. Link this handoff from both PR descriptions. Current admin-refresh release proceeds independently with its existing execution-log reporting.
