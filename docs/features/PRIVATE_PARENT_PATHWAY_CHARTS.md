# Optional age-group charts in private reports

The existing encrypted v1 envelope and exact-child workout actions remain unchanged.
Reports without the extension retain the original team-chart presentation. New reports
set `pathwayVersion: 1` and `pathwayCharts` to exactly three ordered charts:
`speedAt5m` (mph), `verticalJump` (in), and `broadJump` (ft), all `direction: higher`.

Optional `pathwayCoverage: {broaderComparisonsPending: boolean, note: string}` displays one source-coverage notice below the header.

Each chart includes a plain-text `label`; an `athlete` object with `ageGroup`
(integer 8–17 or null), `value` (display-unit number or null), `percentile` (0–100
or null), and `placementStatus`; `reference` with `sexReferenceGroup` (girls/boys/null),
`label`, `sourceDate`, and `selectionRule`; exactly ten ordered `groups` for ages
8–17; and up to six plain-text `notes`.

Group objects contain `ageGroup`, distinct-child `n`, `status` (available/sparse/missing),
`median`, and optional `density` (2–64 strictly increasing `{value, weight}` points,
weights 0–1). Available requires n>=5; sparse n=1–4 and missing n=0 require null
median and no density. Raw peer rows/IDs/names are not part of this contract.

Placement states are placed, age-unverified, sex-unverified, no-valid-result,
sparse-reference, and no-reference. A plotted own value requires verified age and
reference group. Only placed with an available matching group can carry a percentile.
Withheld values stay null. Sparse/absent ages remain gaps; median lines never bridge them.
The renderer does not calculate demographics, percentiles, density, or a projected trajectory.
Numeric provenance, compatible algorithm versions and cohort selection must be verified
before sealing; source/browser validation cannot certify the measurements.

The approved Leia report supplies the typography, surfaces, cyan own-result marker and
native/TestFlight/browser flow. Nolan’s age-column mockup supplies only the chart structure:
per-age aggregate density, median and explicit sample sizes. Its fictional values are never
used. Compact corrected results follow the three charts; older reports remain unchanged.
Shared chart methods appear once in the About these results disclosure; each chart retains its own value and placement. Empty summaries add no section.
Charts are accessible SVG with text descriptions and bounded horizontal scrolling on small
screens. Report strings use textContent only. No extra runtime resource, network request,
storage or native launch is introduced.

This source is local preparation only. A current exact predecessor capture, guarded narrow
artifact, independent review and hosted draft acceptance are required for an example URL.
No source merge, production publication, family send or native release is authorized here.

The explicit `--append --update-pathway-charts` build mode pins the unchanged initial report reader and exactly three replacement files, retains the native acceptance gate, and cannot be combined with other transitions. The November 7 baseline records already-serving deployment `6aedefb93ea542305e9f49da`: 2,603 artifact files, 2,601 protected files and all 37 recovery mappings. It does not publish source main.
