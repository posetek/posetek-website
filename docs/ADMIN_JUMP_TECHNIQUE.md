# Admin jump technique corrections

Rep tools now exposes coil, mid-extension, takeoff and peak frames with saved and
reviewed joint angles. Admins review the recording, enter a reason, and confirm
before saving. The backend derives the angles from that rep's archived filtered
joint positions; it does not accept arbitrary angle measurements from the browser.

Changing an early phase preserves jump height exactly. Changing the peak requires
an archived chest displacement. Motion charts are sliced only when the saved
samples cover the requested range; otherwise reprocessing is required. Missing or
invalid evidence is shown as unavailable. Failure flags are preserved.

The existing admin-only revision writer updates Firestore, metadata and the phone's
JSON artifacts together, retaining before-images and restore controls. A separate
admin-only callable supplies revision history because direct client reads of that
subcollection are denied. Backend must release all three revision endpoints before
the frontend. A source-only scoped publisher preserves existing function settings
and IAM. No rules or other product services are released.

Compose this UI patch onto the current approved website runtime. Preserve marketing,
feedback, coach enrollment and all held candidates. Private correction evidence,
video and athlete identifiers remain outside the repository.

## Published verification

Website `6ad917085d813c55f716152c` and the three scoped revision endpoints are live.
Feature, approved-runtime and Backend CI passed. The exact draft passed 13 browser
checks; all 2,144 artifact files and 50 served routes/asset URLs match production.
The ordinary preservation build passed for the reconciled 2,142-file baseline.

An authorized phase correction was saved through production Admin, reloaded and
independently read from Firestore and Storage. All five artifacts match the reviewed
proposal, height and other rep fields are preserved, and all before-images exist.
Original recording/pose generations are unchanged. This validates persistence and
canonical calculation, not independent physical measurement accuracy or a native
application release. Private evidence remains outside Git.
