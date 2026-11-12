# Parent report renderer

`loader.mjs` owns link parsing, decryption and generic loading/error status. It
imports `renderReport(report)` and `clearReport()` from `render.mjs`.

The document starts with an empty, hidden `#report-root` and a visible
`#report-status`. Rendering validates the full object, constructs plain-text DOM,
and only then reveals it. `clearReport()` hides and empties the report and revokes
the current PDF blob URL. Call it before another link is loaded and on page hide.
The document title stays generic. No report is stored in browser storage.

The decrypted payload has these fields:

| Field | Type / meaning |
| --- | --- |
| `version` | Exactly `1` |
| `name`, `firstName` | Display name and short name; plain text |
| `team`, `coach`, `testDate` | Display-ready labels; `coach` is the name without the “Coach” prefix |
| `focusTitle`, `focusText` | Brief next-step heading and explanation |
| `playerId` | Existing athlete document ID, used only to construct workout links |
| `metrics` | Up to 16 `{label, result, percentile, band, average, count, note?}` objects |
| `summary` | Up to 6 `{label, text}` objects |
| `exercises` | Up to 6 `{title, tag, dose, instruction}` objects |
| `methodNotes` | Up to 16 plain-text method/limitation paragraphs |
| `pdfBase64` | Standard base64 encoding of the reviewed PDF, beginning with `%PDF-` after decoding |

Metric `percentile` is a finite number from 0–100 or `null`. Pass the approved
display percentile (for example a rounded value) consistently with its report
band. `band` is plain text used in the accessible chart label, such as `practice`,
`team middle`, or `strong`. It is not executable CSS. `average` is a display-ready
string or `null`; `count` is a nonnegative integer or `null`. Unknown comparisons
display as an em dash. A null percentile has no marker or inferred score:
`result` supplies the short status, such as “Retest”, or is `null` to use “Retest”; `note` explains why.

Practice is below the 25th percentile, team middle is 25th to below the 75th, and
strong is 75th and above. These are within-team session bands, not age standards.
The packager remains responsible for measurement validity, cohort selection,
rounding and accurate saved-plan versus optional-example labels. The renderer
does not calculate, fabricate or reinterpret measurements.

All strings are inserted with `textContent`; no report field is parsed as HTML.
The reader builds only fixed PoseTek HTTPS and versioned native Training locators
from IDs containing 1–128 ASCII letters, digits, `_` or `-`. A previously accepted
v1 ID outside that workout grammar still renders its report and PDF, with no
workout link. Installation recovery uses the fixed public TestFlight URL with no
report data. PDF downloads use a temporary local blob URL and a
generic filename. Keep real child data, account IDs, encrypted payloads and PDFs
outside the public source checkout. Synthetic browser verification belongs in
local test fixtures or the report delivery tests, not a shipped example report.

### Results-first presentation

`resultsFirst` is an optional boolean. When true, omit the introductory focus
card and begin the classic body with “Where [firstName] stands”. Legacy payloads
keep their focus card. The publisher supplies all three summary bands with the
actual test names and displayed results; never replace more than three results
with a count. Keep existing unrounded-percentile band assignments and exclude
unavailable or insufficient-comparison results. Empty bands must say so.
