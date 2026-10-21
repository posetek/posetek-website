# Player profile and team results

Candidate website changes make the player’s own profile the default destination
for sign-in and ordinary signup. Explicit result/workout links and staff access
retain their destinations. Player Community is removed from the tab bar; its
source and existing staff tools remain available for later work.

The player tabs read Profile, AI Coach, Results, Workouts and Leaderboards.
Profile leads with the existing spider chart, its measured/estimated distinction,
and a plain-language explanation of provisional reference scoring. Missing values
stay unscored. The chart is distinct from the team’s measured test rankings.
Profile details, age confirmation and body scan remain available below the chart.

## Team comparisons

Leaderboards show one measured test at a time, the player's place and result,
the selected team's average, and each teammate's best comparable qualified result.
Units and whether a lower or higher value is better are shown with the test.
Ties use the displayed precision and competition places (1, 1, 3). Unknown,
invalid and provisional results do not become zeroes or ranked performances.

Timed tests require the backend's additive `courseDistanceMeters` field. It is
derived from identity-matching saved processing context with confirmed calibration
geometry. It describes the recorded course input, not an independent measurement
of the physical setup. Tracked travel (`distance`/`totalDistance`) and raw marker
fields cannot substitute for this validation. Comparable recorded distances are
kept within a bounded 5% group; unknown courses show the player's saved time
without a team place or average. The newest known course is the default.

The companion Backend change adds this field to the existing effective-result
projection and the existing authorized team response; it introduces no new client
write or permission. Publish that narrowly scoped reader before the website.
Older clients can ignore the additive field. Without the backend change, the new
website safely withholds timed rankings until a recorded course can be verified.

## Design reference and decisions

The existing PoseTek player interface is the primary visual target: dark emerald
canvas, lime for selections/actions/results, existing Inter type, restrained
surfaces. Refero Design’s bundled typography, craft-details and copywriting
references guide hierarchy, number alignment, touch targets and explanatory copy.
Live Refero research tools are unavailable. No generated imagery is needed.

| Decision | Source and role | Purpose |
| --- | --- | --- |
| Profile and spider chart first | User request; existing PlayerProfile | Show the child’s results immediately |
| Five player tabs; Results and Workouts labels | User request; Refero copywriting | Use words parents recognize |
| Existing emerald/lime tokens | Existing player.css visual target | Preserve product identity and selection meaning |
| Raw results with units and direction | User request; Refero typography/copywriting | Explain what each ranking measures |
| Plain explanations and expandable scoring details | Refero copywriting/craft-details | Keep the first view understandable without hiding limitations |
| Missing results remain unscored | Existing qualification contract | Avoid treating missing or withheld evidence as poor performance |

No real player identifiers, contacts, evidence or workout inputs belong in this
public repository. Cohort planning and parent communication drafts are private
operator artifacts. Drafting a message does not send it.

## Release boundary

Source integration is separate from production release. Compose this patch onto
the currently approved runtime, preserving the live marketing, feedback and coach
enrollment artifacts and held policy/deletion/session candidates. Validate the
exact candidate at phone widths before promotion; keep `[skip netlify]` on source
integration. Native app changes are outside this website-first scope.
