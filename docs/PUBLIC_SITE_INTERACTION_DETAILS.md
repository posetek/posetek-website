# Public-site interaction detail pass

This supplements [the revamp handoff](PUBLIC_SITE_REVAMP.md). The October 17,
2026 pass follows the user's request to examine hover, scroll entry/exit and
small interaction details of [Lain Works](https://lainagency.com/works).

## Reference evidence

REA captured the desktop page, DOM and listener source. Timed Playwright pointer
and scroll probes supplemented REA's scenario actions. A separate read-only
analysis inspected the exact public JavaScript and CSS as inert source. Reference
assets, scripts and fonts are retained only in ignored research artifacts; none
are copied into the product.

- JavaScript: `lain.min.js?v=bbaff34d`, 1,537,537 bytes, SHA-256
  `d5748bd85d6d1e94711f97d51e22bdb7afe45d39d6e25e79fbc16fc0d4d09e6e`.
- CSS: `lain-c5073a.webflow.css?v=8570ef69`, 28,162 bytes, SHA-256
  `b5fdd0befefe5b9b3442c8d1bee2c67dbdba445eae863ed46014b360c1f55439`.
- REA desktop scenario: `ev_0e85441ab8521a111e9dec85a03492339e433eeca03cf32b8c0c2e7fa38f7df8`.
- REA listener/source capture: `ev_2a238c1d86bd0a4c97aeff3c99b0a2eb4f33a090ee3b4f056af4c3ba7e817481`.
- REA static artifact analysis: `ev_9147166c557eb4cb2cb3ad275f1cdbb64362e24e3299aa66429585d932bb7e94`.

The source semantic graph reached its 20,000-node ceiling. Exact source searches
and function inspection resolved the mechanisms below; this is not a claim of
whole-application semantic coverage. Runtime screenshots corroborate text hover,
media hover and menu previews. Detailed footer timings and pixel/velocity logic
are source-defined findings, not measurements of every rendered frame.

## Evidence-to-implementation checklist

| Reference behavior | PoseTek implementation and deliberate adaptation |
| --- | --- |
| Large H1 and category labels stay still on hover | Display headings remain still; audience/chapter chips stay readable native links. |
| Selected links and project names scramble for less than 640ms | Secondary, booking and footer labels resolve over 520ms. Original text alone defines layout and accessibility; animated copy is hidden from assistive technology. Focus, press, leaving, hidden pages and reduced motion restore the label immediately. |
| Media tilts, zooms and briefly blurs, then settles | Eligible artwork layers receive bounded perspective/translation/zoom and a 680ms sharpening pulse. Controls, live text, tabs and ranges remain stationary. Press/focus cancels decoration before interaction. |
| Bracketed SEE DETAIL is centered over Works media | The Coaches club preview is a real chapter link with a centered bracket label. The closing audience link has a contextual pointer label. Ordinary controls retain ordinary cursors. |
| Media enters below the reading position; scrolling back above rearms it | Entry begins at 88% of viewport height. Tiled sharpening/masked heading entrances replay only after the entire frame passes below the viewport. Leaving above does not reset already-read content. Demos stay mounted and retain local state. |
| Long pixel/clip reveals and staggered metadata | Bounded stepped tiles and masked heading entrances finish within 780ms, or immediately on first input. This shortens the reference's approximately 1.5-second reveal for usable product demonstrations. |
| Right-column parallax and velocity bend | Alternating chapter composition and a small, settling artwork displacement convey depth. Large column displacement and shader deformation are reduced to keep live controls aligned. Velocity response is disabled below 768px. |
| Project counter follows the nearest media | Numbered chapter HUD follows the current story section with a brief resolving label. |
| Category filtering animates card removal/reflow | PoseTek's approved continuous story retains every chapter; chips navigate instead of removing content. Existing test selectors still select recordings. |
| Menu curtain and masked character entrances/exits | Ten green slices open in 450ms with a short stagger behind stable menu content. Lettering enters separately; dismissal stays bounded at 400ms. First input settles the entrance. Focus containment and inert background remain until dismissal finishes; following a native link closes immediately. |
| Menu hover dims siblings and shows a moving miniature | Fine-pointer desktop links show local PoseTek miniature compositions with 700ms tracking, bounded rotation, scale/fade and sharpening. Sibling opacity stays at 50% instead of the reference's 22%, keeping label contrast above 4.5:1 on deep green. No reference iframe, remote page or signed-in application is loaded. Giant menu labels do not scramble or roll on hover. |
| Footer grid scales in; characters turn/rise and reverse on upward exit | Scroll-responsive grid, growing rules, reversible character entrances and a damped dimensional P. Keyboard focus reveals the full invitation immediately. |
| Bottom pull enlarges the next-page preview and fills progress | Visual-only preview zoom/progress with a 900ms pause and 1,400ms return. Navigation always requires a click/tap. The reference's automatic navigation and delayed page takeover are intentionally excluded to preserve the approved native-navigation boundary. |
| Sound accompanies interactions | PoseTek retains its original, subtle opt-in interface sounds. Sound starts muted and the choice lasts only for the browsing session. |
| Reference has some initial reduced-motion gates | PoseTek also handles live preference changes, touch, hidden/offscreen cancellation, keyboard input, no JavaScript and unavailable WebGL. Static essential content remains usable. |

No evidence establishes center-distance dimming on Works: similarly named CSS is
mutated by the reference's Services controller, not its Works controller. PoseTek
therefore does not fade readable sections merely for being away from the center.

## Reproduce detail checks

After the guarded build, run alongside the existing 33-case regression suite:

```sh
MARKETING_OUTPUT=production-dist MARKETING_ALLOW_FONTS=1 node --test scripts/marketing-detail.browser.mjs
```

The separate detail harness samples real intermediate transforms and opacity;
its screenshots keep animations enabled. It checks both audiences' label/layout
stability, directional replay, partially visible edge behavior, control stability,
state preservation, live reduced motion, coarse pointers, hidden pages, menu
previews/dismissal, footer replay/pull and explicit navigation. WebGL draw counters
check settling and offscreen/hidden pauses without claiming physical-device GPU
performance.

Ignored `artifacts/marketing-detail/` holds `source-findings.md`, the exported REA
bundle, reference hover/scroll/menu captures, local/hosted detail reports, motion
captures, footer fit measurements and the updated performance comparison. The
current exact candidate identity and pass counts belong in the main handoff and
[release receipt](../deployment/PUBLIC_SITE_REVAMP_CANDIDATE.json).
