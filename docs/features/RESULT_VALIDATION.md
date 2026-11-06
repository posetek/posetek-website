# Result validation (admin, Review tools)

Route: `/admin/result-validation`. Source: `app/src/pages/admin/views/ResultValidation.tsx`,
`app/src/pages/admin/lib/resultValidation.ts` (pure, tested) and
`app/src/pages/admin/lib/resultValidationData.ts`. The per-rep workbench is the
existing rep tools (`views/RepTools.tsx`) in validation mode.

## What it does

1. Pick a team testing session (`testingEvents`, newest 60).
2. The queue lists every processed rep linked to it
   (`players/{participant}/reps where testingEventId == event`), in roster →
   drill → session → rep order, filterable by drill and by review state.
3. Each rep opens in the rep tools: video when stored, otherwise the saved pose,
   tracking and the drill's artifacts. A decision panel offers
   **Validate as recorded**, **Save adjustment** (any edit made with the rep
   tools) and **Reject result**. Saving moves to the next unreviewed rep;
   `[` and `]` step through the queue.
4. Broad jump draws the ground line, foot and torso paths, and the start and
   landing foot. Either foot can be moved on the video or the pose. The
   distance is re-derived the way the phone measures it
   (`|end x − start x| × m_to_normalized_units`,
   `BroadJumpProcessingMath.jumpDistanceMeters`); the phone's own feet stay
   visible faintly once moved.

5. **Focus mode** (button or `F`; Esc leaves) fills the screen with the
   stage and the decision panel and stays on from rep to rep.
6. **Evidence for every drill**, drawn as the phone's replay draws it (sources:
   `lib/drillEvidence.ts`, `lib/repEvidence.ts`):
   - ArUco marker outlines with id, role and ground edge.
   - The ground line through the markers' lowest corners, else the saved ground line or ground y.
   - Gate points and verticals.
   - COM paths:
     - sprint `COM.json`
     - change of direction / dribbling `tracking.json`, coloured out / turn / back
     - jump `torso_midpoints.json`
     - broad jump `com_midpoints.json`
   - Starting, takeoff, peak and landing COM.
   - The kick's resting ball and flight.
   - Sprint start, motion onset and finish from `aruco_points.json`.
   - Per-frame charts synced to the cursor. The jump's velocity, acceleration and GRF are aligned from `max(0, maxCoil − 100)`.
   - Every JSON file in the rep folder and the session root, expandable.
7. **Two-marker drills** label the markers' measured separation (center distance ×
   each marker's own 5.875 in scale, planar) against the distance processing
   used and its source. The label turns amber beyond ±5%.
8. **Age vs. performance**: each athlete's best in the session at their age on
   the test date, the rep under review, its session rank, and the published
   benchmark median / middle half per age band (`benchmarks/d1`, the phone's
   bands U12 <13, U14 13–14, U16 15–16, U18 17–18, college 19+). Projected
   cells, or cells with fewer than 10 athletes, are flagged as provisional. The
   bundled `D1Benchmarks.json` is a single-athlete placeholder, so the page
   reads only the Firestore document.

Results display everywhere whether or not they are validated.

## What a decision writes

Every decision goes through the existing `adminReviseRep` callable. No backend,
rules or index change is needed.

| Decision | Rep fields | metadata.json flags | Effect in Insights |
| --- | --- | --- | --- |
| Validated | the recorded primary metric | `resultsValid: true`, `processingStatus: complete`, `failedSteps: []` | `acceptedRevision` (source of truth) |
| Adjusted | changed fields + the new primary metric | same as validated | `acceptedRevision` with the new value |
| Rejected | none | `resultsValid: false`, `processingStatus: partial`, `failedSteps: ["admin.rejected"]` | no longer qualifies (`evidenceNotComplete`) |

Primary metrics follow `insights-v2-qualification.js`: shooting `velocity`,
sprint `max_velocity`, jump `jumpHeight`, broad jump `broadJumpDistance`,
change of direction and dribbling `totalTime`. The revision note starts with
`Validated`, `Adjusted` or `Rejected`; the queue reads the state back from
`adminRevision.note` on the rep.

## What is kept (training data)

- The callable snapshots the previous rep document under
  `reps/{repId}/revisions/{revisionId}` and backs up `metadata.json` under
  `admin_revisions/{revisionId}/`. Any revision can be restored from the rep tools.
- `pose.json`, `foot_centers.json`, `foot_piecewise_fit.json` and the other
  model artifacts are never rewritten. Only shooting's ball artifacts are, as before.
- `admin_annotations.json` holds the decision (`validation`), the feet
  (`broadJump.startFoot` / `landingFoot`, plus the phone's), frames and tracks.
  Each save carries every earlier annotation file in `annotationHistory`, so
  earlier human labels are not lost when the file is replaced (oldest entries
  drop only past 2.5 MB).

## Preview and limits

- `?preview=1` on a DEV server uses synthetic, in-memory data (one session,
  three athletes, pose-only broad jumps) and never touches Firebase.
- On a localhost dev server without `?preview=1`, the page reads production
  data, and every decision is a real production write through the deployed callable.
- Follow-ups: back up `admin_annotations.json` server-side in `adminReviseRep`;
  allow-list a broad jump `foot_piecewise_fit.json` rewrite so the phone's
  session viewer draws the validated feet; queue reads are per participant
  (up to 30 queries per session).
