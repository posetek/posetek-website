# Drill rest update and corrupted demonstration withdrawal

Catalog **1.0.96** was committed October 12, 2026 at 12:01:50 PM PDT and
independently verified at 12:03:08 PM PDT. It contains 208 records: **74
website-library published**, including **71 with approved primary demonstrations**,
and 134 drafts. Three published records retain absent legacy status; these counts
do not establish executable prescriptions or athlete eligibility. See
[the production receipt](../deployment/DRILL_REST_UPDATE_20261012.json).

## Confirmed changes

The user chose existing authored lower rest bounds while preserving each training
goal and allowing additional recovery when quality requires it. The following
18 drills now use that lower bound as both minimum and maximum. Rest text and
catalog duration ranges were synchronized; repetition counts, sets, scope,
per-side work, goals, instructions and access maps are unchanged.

| Drill | Name | Previous rest range (seconds) | New default (seconds) | Maximum estimated minutes, before → after |
|---|---|---:|---:|---:|
| COD-002 | Deceleration gate | 60–90 | 60 | 7 → 5 |
| COD-003 | 45-degree cut progression | 60–120 | 60 | 16 → 10 |
| COD-004 | 90-degree cut progression | 90–120 | 90 | 10 → 8 |
| HJP-002 | Standing broad jump reps | 90–120 | 90 | 10 → 8 |
| HJP-003 | Triple broad jump | 120–180 | 120 | 13 → 9 |
| HJP-004 | Single-leg hop to stick | 60–90 | 60 | 13 → 10 |
| SPD-002 | Falling start | 60–120 | 60 | 8 → 5 |
| SPD-003 | Wall switch to sprint | 60–90 | 60 | 5 → 4 |
| SPD-004 | Push-up start | 90–120 | 90 | 6 → 5 |
| SPD-009 | Sprint-cut-sprint | 90–150 | 90 | 18 → 12 |
| STR-001 | Squat-to-box competency | 60–90 | 60 | 10 → 9 |
| STR-007 | Assisted Nordic progression | 90–120 | 90 | 7 → 6 |
| VJP-002 | Snap-down to vertical jump | 60–90 | 60 | 7 → 5 |
| VJP-004 | Pogo series | 45–90 | 45 | 8 → 5 |
| VJP-005 | Low hurdle hops | 90–120 | 90 | 7 → 6 |
| VJP-006 | Single-leg jump and stick | 45–75 | 45 | 9 → 7 |
| VJP-007 | Lateral bound to vertical jump | 60–90 | 60 | 9 → 7 |
| VJP-008 | Drop landing to jump | 90–150 | 90 | 10 → 7 |

The shared website `expectedMinutes` formula determines duration, including
rest scope and per-side work. HJP-003 remains effective per-repetition recovery;
the other edited drills retain effective between-set recovery. Missing raw scope
is preserved rather than silently authored. STR-001, STR-007 and VJP-008 retain
schema 1 and absent status. Saved plans and logs store their own prescriptions
and were not rewritten. Countdown expiry does not force a new effort; the
existing player supports additional waiting and Pause/Resume.

**DRB-010 — Speed dribble with stop zone** was returned from published to draft
because the user reported its video is corrupted. Its primary demo status is
pending, so player and ordinary library playback exclude it. The exact Storage
object, generation, byte count and other metadata remain intact for repair.
Its dose and duration are unchanged. Existing workout records remain intact;
fresh catalog snapshots remove the pending demo from an open player. This is a
catalog playback withdrawal, not revocation of previously copied download URLs.
Repair or replace the video, verify decoding and browser/device playback, and
review it before a separate republication. The earlier
[October 11 audit](DRILL_VIDEO_PUBLICATION_AUDIT.md) verified object metadata,
not playback; its historical publication has now been reversed.

## Retained recovery and evidence limits

SPD-006 retains 150–240 seconds for build-and-fly maximum-speed quality. VJP-003
retains 15–20 seconds between repetitions and 120 seconds between sets. COD-005,
COD-010, HJP-005 and HJP-006 retain their fixed recovery. Eight edited drills
still exceed 60 seconds at their authored lower bound; together with these six,
14 published drills retain a rest field above 60 seconds.

COD-010's 4 × 6 repetitions per side with 90-second per-repetition recovery imply
69 minutes of rest and about 76 minutes including work at the maximum dose,
versus its stored 4–9-minute estimate. It remains unchanged: scope or volume must
be clarified by the content owner before shortening its fixed recovery.

Research informs the choice but does not validate every exact PoseTek protocol:

- [Ramírez-Campillo et al., 2014](https://jssm.org/volume13/iss2/cap/jssm-13-287.pdf)
  compared 30, 60 and 120-second interset recovery in a seven-week youth soccer
  plyometric program and found similar measured improvements. This is not proof
  of equivalence, exact-drill quality or safety for every athlete.
- [Maturity-specific research, 2019](https://pubmed.ncbi.nlm.nih.gov/31159655/)
  found different responses to 30 versus 120-second recovery in pre- and
  post-PHV boys. Chronological age must not be treated as biological maturity.
- [Iaia et al., 2017](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0171462)
  compared 15 and 30-second repeated-sprint recovery in teenage players. Longer
  recovery better maintained sprint performance; shorter recovery favored some
  conditioning adaptations. This does not justify relabeling maximum-speed work.
- [Drury et al., 2021](https://repository.essex.ac.uk/31587/1/i1062-6050-56-9-952.pdf)
  compared 60 and 180-second Nordic recovery in ten trained adult men. It is not
  a pediatric assisted-Nordic trial; the current authored 90-second minimum stays.
- [ACSM youth resistance guidance](https://www.acsm.org/wp-content/uploads/2025/02/NYSHSI-Youth-Resistance-Training-PDF.pdf)
  allows roughly one-minute recovery with longer rests as demands increase.
  [NSCA speed guidance](https://www.nsca.com/education/articles/kinetic-select/designing-speed-training-sessions/)
  emphasizes recovery sufficient to maintain sprint quality.

Before moving below existing authored bounds, source a matched protocol or
qualified content review covering exercise, volume, effort intensity, population,
maturity and repetition-versus-set recovery, plus measured quality across efforts.
Do not treat nonsignificant differences as equivalence or conditioning results as
maximum-speed evidence. No athlete trial, readiness clearance or new safety
acceptance was created by this update.

## Operation, verification and recovery

The source-bound [manifest](../content/training-rest/adjustments.json) and
`scripts/training-rest-catalog.cjs` limit the operation to 18 rest updates, one
withdrawal and current catalog metadata. A full transactional reread checks the
208-record catalog, private authoring, metadata and configuration. Each of the
20 writes has an exact update-time precondition. Nested leaf masks preserve
unknown fields and Firestore value types. New managed/reviewed targets abort
instead of bypassing their review workflow. The catalog version advances once.

An exclusive private attempt journal preceded commit. The commit was acknowledged
once. The initial post-commit verifier incorrectly equated REQUEST_TIME with the
later document commit timestamp; only the verifier was corrected. A regression
test covers their different precision/timing. No transaction was replayed.
Independent readback matched all 20 write results and 21 audit transforms to the
acknowledgment and verified all narrow changes, the 189 unrelated records, all
private authoring/configuration and the unchanged Storage object.

The eight operator tests cover calculations, typed preservation, review boundaries,
concurrency, lost acknowledgment and journal failure. Six relevant frontend suites
passed 134 tests, including removal of an already displayed pending demo, library
playback refusal, shared duration fixtures and saved workout/runtime behavior.
No website artifact, functions, gateway, rules, indexes or native build was
published. All 80 whole-body drafts and `mobileVerified: false` remain exact.

Operator commands require Node 22.18+ and the existing Firebase CLI login:

```sh
node scripts/training-rest-catalog.cjs --plan .netlify/training-rest/new-plan.json
node scripts/training-rest-catalog.cjs --plan .netlify/training-rest/new-plan.json --apply --expected-plan-sha REVIEWED_DIGEST
node scripts/training-rest-catalog.cjs --plan .netlify/training-rest/new-plan.json --verify
```

This dated manifest now expects the historical before-state and is not a routine
repeat job. Apply refuses to replay an existing attempt; after any uncertain
outcome, independently verify first. Private plans contain full snapshots and
must stay in ignored `.netlify/`; never commit them or Storage download tokens.

For rollback, reread current records and use new exact preconditions and a fresh
catalog version to restore only the affected rest/duration leaves. Do not restore
whole stale documents or rewrite saved workouts. Keep DRB-010 draft/pending
until repaired playback is verified; reversing the rest change does not authorize
republication of its corrupted demo.
