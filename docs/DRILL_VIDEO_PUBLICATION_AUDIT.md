# Historical drill publication and demonstration audit

Superseded October 12, 2026: DRB-010 was withdrawn after the user reported a
corrupted video. Current counts are 74 library-published and 71 approved primary
demos. See [the current handoff](DRILL_REST_UPDATE.md). The following records the
October 11 metadata audit and publication; it did not verify playback.

Verified October 11, 2026 against the live Firebase catalog and Storage objects.
See [the production receipt](../deployment/DRILL_VIDEO_PUBLICATION_20261011.json).

The website drill library now lists **75 published drills**, of **208 total
catalog records**. **72 distinct drills have an approved uploaded primary
demonstration**, and all 72 are now published in the website library. There are
133 remaining drafts.

| Measure | Before this change | After this change |
| --- | ---: | ---: |
| Total catalog records | 208 | 208 |
| Website library published | 74 | 75 |
| Explicit raw `status: published` | 25 | 26 |
| Legacy records with absent raw status | 49 | 49 |
| Drafts | 134 | 133 |
| Drills with approved primary demonstrations | 72 | 72 |
| Published drills with approved primary demonstrations | 71 | 72 |
| Unpublished drills with approved primary demonstrations | 1 | 0 |

## Published drill

The user's request authorized publishing drills with demonstrations that were
still unpublished. The only matching draft was **DRB-010, Speed dribble with
stop zone**. Its existing approved MP4 was verified against its exact current
Storage generation, size and content type. It is an ordinary schema-2 drill,
with no whole-body production batch, training policy or private review sidecar,
and passes the ordinary editor's content and dose checks.

A reviewed transaction changed only its status, catalog version and update
audit fields, and advanced `drillCatalogMeta/current` from `1.0.93` to `1.0.94`.
The transaction reread the complete catalog, authoring and configuration snapshot
and used exact update-time preconditions. An attempt receipt preceded commit;
an acknowledged commit and readback verified the result. All other 207 catalog
records, every media slot, all authored instructions/doses, private authoring,
review state and AI configuration were preserved.

Library publication is distinct from availability to automatic personal-workout
selection. DRB-010 still has no source-bound `accessRequirements` map, so the
access-aware personal flow remains unavailable for it. Its instructions specify
a 15–30 m lane plus a 3–5 m control zone, and its safety cue requires a long
run-off and separated lanes without defining the run-off distance. Clarify that
authored space requirement before enabling this flow; publication does not supply
a distance, readiness clearance or equipment confirmation. See
[the training-access contract](TRAINING_ACCESS_CATALOG.md).

## Video coverage and count definitions

The audit verified 165 stored video objects: 72 primary demonstrations, 47
teaching-detail clips and 46 error/correction clips. All are approved, nonempty
and match their catalog generation, byte count and content type. Five additional
bird's-eye PNG diagrams are valid images and are excluded from the video total.
This confirms stored video coverage, not a new device playback acceptance.

The three website-published records without primary demonstration uploads are
STR-001, Squat-to-box competency; STR-007, Assisted Nordic progression; and
VJP-008, Drop landing to jump. Their publication fields were preserved.

The website's `normalizeCatalogDrill` treats legacy records with absent status
as published. The website count therefore includes 49 such records and should
not be reported as 75 explicitly published, executable prescriptions. The
execution catalog's separate normalization remains authoritative for planning;
unsupported legacy records, access maps and athlete eligibility can further
restrict selection.

All 80 `whole-body-2026-09` drafts still have no uploaded media, have pending
content reviews and remain unpublished. Their 81 private external **Watch before
filming** links across 80 drills are filming references, not approved athlete
demonstrations. The false `wholeBodyTraining.mobileVerified` gate is preserved.
Their three-clip, qualified-review and mobile-acceptance publication requirements
remain in force under [the whole-body handoff](WHOLE_BODY_TRAINING.md).

## Release and recovery

This was a catalog data publication; no website artifact, backend function,
gateway, rules, index or native release was performed. Existing website readers
load the current catalog. Historical website release receipts and the protected
hosting baseline remain separate.

Private before/after snapshots, storage metadata, transaction plan and attempt/
commit evidence remain outside Git. The committed receipt contains only aggregate
facts, drill identifiers and sanitized publication evidence. No credential or
download-token URL is included.

If this publication needs reversal, reread DRB-010 and the current catalog metadata,
review any subsequent changes, and transactionally return only its status to
`draft` with a new catalog version and exact update-time preconditions. Preserve
the existing video and all authored content. Never replay the old transaction or
restore a stale full document.
