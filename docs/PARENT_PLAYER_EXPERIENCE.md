# Player profile and team results

The published website makes the player’s own profile the default destination
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
write or permission. That narrowly scoped reader was published before the website.
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

Source integration is separate from production release. Future application
releases must compose onto the approved runtime, preserving live marketing,
feedback and coach enrollment artifacts and held policy/deletion/session
candidates. Validate the exact candidate at phone widths before promotion and
keep `[skip netlify]` on source integration. Native app changes are outside this
website-first scope.

## Verified production release

Website `6ad92e7fec1a407bec937389` was promoted from the exact accepted draft and
verified on October 21, 2026 at 22:15 UTC. Its 2,156 artifact files match all 2,157
provider records; 2,143 predecessor records remain exact and twelve runtime assets
were added. Marketing, isolated feedback, coach enrollment, icons and effective
headers/redirects are preserved. The reconciled baseline protects 2,154 files
and passed the ordinary preservation build at 22:16 UTC.

Source [PR #94](https://github.com/posetek/posetek_website/pull/94) merged as
`8e53f9b5483124810a9b09e4fb4b7182fe105e4f`. Production uses runtime
`4c1ba8ea213060fd54e572adaa1fc893c3d460c0`, composed onto approved application
`fd9db5be33e6eda3dac2ad37f17d65efa7bb7ecf`. The runtime branch must not merge into
main because the source tree retains unrelated held policy/deletion/session
candidates. The composition restored the exact captured feedback and coach entry
documents after their shared compiled chunk changed; no preservation guard was
weakened.

Candidate browser acceptance passed 21 checks, including sixteen synthetic preview
and anonymous checks, three ordinary administrator sign-in/scope checks, and two
authorized team-reader calls against the deployed backend. The team responses
passed scope, result-exclusion and recorded-course checks. Player layout coverage
includes 360/390/430px and desktop. No real player account was
impersonated or claimed; player sign-in routing is verified by source tests and
synthetic preview, not an end-to-end claimed-player login. An initial unscoped
roster HTTP 409 resolved after selecting the authorized organization/team. Physical
phone acceptance is not claimed. Production inventory, effective configuration,
and 36 primary-host route/asset checks passed. Four production browser checks also
passed: two synthetic player previews cover Profile/navigation and Leaderboards,
and two normal authenticated Admin reads confirm saved active plans and their
reviewed prescriptions. Admin read-only athlete preview retains the existing
staff view; it is not acceptance of a claimed-player session.

Backend [PR #35](https://github.com/posetek/posetek-backend/pull/35) published only
`getTeamLeaderboard` v3 using a source-only update from its exact reviewed overlay.
The deployed archive, protected configuration and IAM were verified; all 142
unrelated functions, rules release inventory and gateway remain unchanged.
No rules, indexes, gateway, catalog or native release is included.

Read [website evidence](../deployment/PARENT_PLAYER_PRODUCTION.json) and
[backend evidence](../deployment/PARENT_PLAYER_BACKEND_PRODUCTION.json).
Separately authorized athlete planning and account-claim evidence stays in private
operator records. It is not embedded in this public receipt.
