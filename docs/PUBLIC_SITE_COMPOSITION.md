# Public-site scrolling composition

This refinement follows the user's request to bring the scrolling layout closer
to [Lain Works](https://lainagency.com/works). It builds on the
[revamp](PUBLIC_SITE_REVAMP.md) and [interaction detail pass](PUBLIC_SITE_INTERACTION_DETAILS.md).
It changes public presentation only; production promotion remains separate.

## What the reference actually does

Fresh REA scenarios inspected 1440×1000, 1920×1080 and 390×844 viewports.
Supplementary read-only browser measurements sampled four settled scroll stops
per viewport, with matching screenshots. Exact previously captured public source
explains the observed right-column movement.

| Property | 1440px desktop | 390px phone |
| --- | --- | --- |
| Page gutter | 36px | 16px |
| Media | 666×499.5px; two columns | 358×268.5px; one column |
| Initial right-column offset | Approximately 305px | None |
| Gap between complete cards | 115.2px | 78px |
| Card title | 30.24px, beneath media | 24.96px, beneath media |

The reference's right column has a 16vw layout offset and a source-defined
`+6vw → −30vw` scroll transform. Across its 33 projects, the measured relative
speed is approximately four percent. Applying that entire travel to six PoseTek
chapters would exaggerate the motion. The reference does not dim Works content
according to distance from the viewport centre.

REA evidence IDs:

- 1440: `ev_8d45693d9e615ad33fa6293d58862d145497008ca32d9e583bbbb1f74a70bc7d`
- 1920: `ev_7c2f74dbbc8defc517141092ea66eca7d3fa6fa23af0fd83df3f96241d32e883`
- 390: `ev_56e5f8c9fd8cfed56efcdaa8d22b30ab8eddca0666c7194685a535bd13794f68`

Ignored `artifacts/marketing-composition/reference` contains the complete scenario
records, geometry, 33 screenshots and `COMPOSITION_AUDIT.md`. The separate baseline
audit contains 74 PoseTek captures. REA-owned browsers were closed after capture.
This is sampled composition evidence, not a claim that every reference project or
bottom interaction was exercised. No reference assets or code ship in PoseTek.

## PoseTek adaptation

Both audiences now use a continuous gallery. The demonstrations lead each card;
compact headings, explanations and next-step links follow. Desktop columns share
the page grid and start at different heights. Their independent natural heights
remove the blank bands caused by repeated full-width sections. The original
chapter DOM order, heading IDs and section aliases remain intact.

The hero retains PoseTek's interactive recorded-pose and club previews. On phones,
the preview follows the dominant headline, ahead of the supporting summary.
The hero and gallery retain PoseTek's green, lime, P mark and approved sample data.

The media are working interfaces, so they are not blindly scaled or clipped into
the reference's 4:3 photographs. The recorded-movement viewport uses 4:3; other
cards grow with their content. Container queries recompose profile breakdowns,
workout media, coach metrics, player choices and technique inspectors according
to card width. Existing playback, selections, local state, workout progression,
sample labels and recorded-versus-illustrative distinctions stay in place.

Wide layouts progressively enhance to measured CSS grid row spans. ResizeObserver
updates spans when demos load or change stage; cards remain mounted. With no
JavaScript, the ordinary grid and complete static text/links remain usable.
Below 1100px the gallery is one source-ordered column with no column drift.

Fine-pointer desktop scrolling adds a bounded relative drift at four percent of
scroll travel. Hover, focus, native fragment navigation and hidden/offscreen states
pause it without accumulated catch-up. Reduced motion and coarse pointers keep
the layout static. The chapter HUD selects the visible media centre nearest the
viewport centre, accounting for transformed bounds and changing demo height.

Existing repeatable tile reveals, stable-control artwork hover, resolving labels,
menu previews, optional sound and the explicit-click closing experience remain.
The gallery introduces no automatic audience navigation or scrolling takeover.

## Verification and release

`scripts/marketing-composition.browser.mjs` checks composition and interaction
boundaries in addition to the existing regression and detail harnesses. Use the
current [candidate receipt](../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json) for
the exact source, guarded artifact, hosted acceptance and completed check counts.
Historical pass counts do not establish acceptance of a newer runtime.

The production candidate is assembled only with `node scripts/build-production.mjs`.
The existing protected-file baseline, application, feedback and coach-enrollment
artifacts remain enforced. Main auto-publishes, so the PR remains a draft until
the exact candidate is accepted through the release workflow.
