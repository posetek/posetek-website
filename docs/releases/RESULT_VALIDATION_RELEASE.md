# Admin result validation — November 6, 2026

Deployment `6aedefb93ea542305e9f49da` was published at `2026-11-06T15:22:23.567Z`, promoted without rebuilding from the verified draft. It adds **Review tools → Result validation** (`/admin/result-validation`) and ships the saved tracking playback from PR #128. [Production receipt](receipts/RESULT_VALIDATION_PRODUCTION.json) · [Feature](../features/RESULT_VALIDATION.md) · [Tracking playback](../features/ADMIN_REP_TRACKING_PLAYBACK.md).

## Scope

- Result validation ([PR #132](https://github.com/posetek/posetek-website/pull/132), merged as `9d94c4b`): pick a testing session and step through its reps. Validate, adjust or flag each rep with a reviewer note; undo any decision; export notes. Each rep shows per-drill evidence, focus mode and the organization age curve.
- Saved tracking playback ([PR #128](https://github.com/posetek/posetek-website/pull/128), merged as `6075626`), carried because the validation tool is built on it.
- A small fix found during runtime qualification: a rep with no video, pose or tracking no longer draws a measured-evidence readout on an empty stage. The tracking playback browser suite now switches the measured layer off before checking the raw overlay alone.

Writes go only through the existing `adminReviseRep` / `adminRestoreRepRevision` callables. No Functions, rules, indexes, schema, gateway, catalog or native change. Held policy, session and Ball Striking candidates and report outreach remain held.

## Runtime composition

Runtime branch `runtime/result-validation` starts from accepted runtime `bc6ed7c` (live `6aecbf94`):

1. `7e0aafc`: main's reconciled `6aecbf94` baseline, verified against the live provider inventory.
2. `546d27d`: PR #128. The runtime's jump review banner and panel are kept.
3. `5ea4527`: PR #132. Result validation files are byte-identical to the reviewed head; Ball Striking routes and navigation stay out, so the runtime admin menu has 10 links (main has 11).
4. `e4c6403`: the metadata-only fix. The artifact was built from this commit.
5. `51106ec`: the baseline reconciled to `6aedefb9`.

On the runtime, jump corrections go through the jump review panel (the generic Values card is hidden for jumps). Validate and Flag work for every drill.

## Exact artifact

Built with `node scripts/build-astro-release.mjs --preserve-marketing <manifest> --preserve-isolated-entries`. The runtime's fresh marketing build differs from the separately released live pages (and embedded a local `file://` reference), so the live provider originals were pinned and freshly re-verified against posetek.net.

All 2,603 artifact files match 2,604 provider records. Of the prior served files, 2,582 are byte-identical; only `/application.html` changed, and 20 hashed application assets were added. Marketing, feedback, coach enrollment and private reports are exact. Provider configuration differs only in `build.publish`; all 11 headers and 10 redirects are structurally identical. No local path appears in any changed or added file; the DEV-only synthetic preview is not bundled. Artifact manifest SHA-256: `bb5c5454b157a726faa374d530c0132502cdfced67dd2b5b84bc6f9bffca4159`.

The protected-file cache was seeded only from byte-verified files of the prior release cache; the build re-verified every file. Legacy `legacy/` recovery mappings do not resolve on the runtime branch, which never moved those pages.

## Verification

- Source: 12 local lanes and hosted `ci` passed on PR #132.
- Runtime at `5ea4527`: 2,247 frontend tests, 155 release-tooling tests, 40 policy tests, guest smoke 7/7, build, Svelte, transport and dependency audit. The marketing-link lane is absent on the runtime branch.
- After the fix: TypeScript, 886 admin tests and lint; tracking playback 112/112 in Chromium and WebKit; synthetic result-validation preview flows.
- Draft: exact inventory, config proof, 85/86 HTTP checks (`/robots.txt` is not a file and falls through to the new entry), and 14/14 signed-out route loads in Chromium and WebKit.
- Live: exact inventory and the same signed-out loads. HTTP checks differ from the `netlify.app` permalink only in HSTS and `x-robots-tag`, as before promotion.

Not claimed: signed-in acceptance of the hosted artifact (no synthetic admin was created), emulator journeys and device checks. The owner had exercised the same source on localhost against production with their own admin account.

## Baseline and recovery

The reconciled baseline protects 2,601 files with all 37 recovery mappings, and the ordinary preservation build passes against it. Keep `[skip netlify]` on source and receipt integration; Netlify Git builds on main are enabled.

Recovery: compare fresh serving state, then restore `6aecbf94751cf215f811865f` through the guarded exact-deploy workflow. A source revert alone does not republish. Revisions made with the tool are reversible per rep through `adminRestoreRepRevision`; hosting recovery does not change rep data.
