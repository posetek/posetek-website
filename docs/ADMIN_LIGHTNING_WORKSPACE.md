# Admin workspace refinement

This change adapts Salesforce Lightning's navigation, list toolbar, filter drawer
and grouped form presentation to PoseTek's existing administration workflows.
The source branch starts at `bd7ce5febbbdcaed16c6ef35f2e3987603f68c93`.
The homepage refinement is a separate change and release candidate.

## Reference evidence

REA 6.5.0 inspected the user-authorized Salesforce Starter workspace in an
isolated Chrome for Testing session after the user signed in. Safari supplied
the initial visual context. Only ordinary navigation and an unsaved blank contact
form were observed; no Salesforce record was created or modified.

| Observed surface | REA evidence | PoseTek adaptation |
| --- | --- | --- |
| Home and module navigation | `ev_92f9741b68370c2bffb7d0ae496b56a07d74d75f19cc60b45cb5c8111c2ae99c` | Deep-green rail, compact global toolbar, contextual header and fixed Overview shortcuts above existing reports |
| Contacts list and filter control | `ev_3a531e6e122f471a76fd45df4c613648dfb28f21cb25cb0865f3f43f9e8590ba` | List-first directory, scoped search, reporting refresh and explicit row-action menus |
| Settled filter panel | `ev_767d7eb7dd6ee0abe41046fff7556997790bedde236799e800f5092ab1537469` | Right-side filter dialog on desktop, full-width sheet on phones, visible active filters |
| New-contact form | `ev_68238c4ff3f1300f2f8f52c3e932cd74cbb837f51d28951e7d0bf0383ae937bc` | Grouped fields, visible validation, anchored actions and explicit cancel/save boundaries |

The trial's Contacts list was empty. Populated Salesforce record behavior was
not observed, so PoseTek retains its established Results, Workouts, Profile and
AI incidents tabs and ordinary document navigation. The first form scenario
timed out behind Salesforce onboarding; the later passive capture establishes
the form observation. Reference captures were not verified at exact requested
viewport dimensions. Private reference screenshots and session state remain
outside Git; the implementation contains no Salesforce code, data or assets.

## Behavior and ownership

- `AdminWorkspace` wraps only administrator routes and the administrator Insights
  presentation. Coach and organization-manager shells remain unchanged. The
  toolbar searches a local directory of tools, never private player records.
- People & organizations preserves Organizations → Teams → People. Fresh scope
  selections show their list. Overview, Testing, Workouts and Usage retain the
  complete existing report components, charts, qualifications and evidence tables.
- Internal `directoryPane=list|report` state preserves the presentation through
  player/planner returns, reloads and history. Existing explicit report links
  still open their report; attention links open their corresponding player list.
  Search, reporting filters and account pagination retain separate meanings.
- The global player lookup remains bounded to its existing index and match
  limits. Current roster ownership and reporting exclusions remain authoritative.
- Player records retain contextual actions and a persistent identity/tab header.
  Selecting a record does not start editing it. Results and rep identities,
  validated return locations, planner requests and restoration remain unchanged.
- Native dialogs supply background inertness. Explicit Tab wrapping, Escape,
  connected-opener restoration and save-in-progress dismissal guards protect
  existing dose, rationale, rep, technique and incident workflows.
- All new visual styling is scoped to `.pt-admin.admin-workspace`. Local SVG
  navigation icons and the approved PoseTek P asset work before remote fonts load.
  No public API, authentication, schema or persisted business-data contract changes.

## Verification

The browser harnesses use synthetic fixtures, block nonlocal requests and do not
write live records. Chromium and WebKit acceptance is browser evidence, not
physical-phone acceptance. Reports and responsive captures are retained under
ignored `artifacts/admin-shell` and `artifacts/admin-lightning-surfaces`.

Final local checks: 2,131 frontend tests, 78 server/release checks, 32 policy
checks, TypeScript, Svelte, Astro, dependency audit and seven guest browser checks
pass. An initial unbounded unit run found an obsolete icon-markup assertion and
three CPU-contention timeouts; the corrected assertion and complete suite passed
with four workers without changing timeout budgets. Existing lint warnings remain.

Browser evidence includes 172 shell checks, 548 directory assertions, 432 specialist
assertions and 100 actual player-record checks. Chromium and WebKit cover all six
requested widths; populated records additionally cover 390/1440px. Synthetic success
and failure callbacks exercise form boundaries, retained drafts and one-shot planner
activation submission. They do not establish real backend execution. Phone input,
orientation and zoom-equivalent reflow are emulation, not physical-phone acceptance.

The approved-runtime composition passes 2,004 frontend tests and 89 focused checks.
The ordinary guard caught regenerated feedback/coach-enrollment bundle references;
the unchanged two-phase composition restores their verified approved documents in
Astro staging before composition. Only the application document may differ from
the protected baseline. Reproduction and exact inventories accompany the candidate.

## Release composition

Fresh provider verification on October 22 identifies approved deployment
`6ad92e7fec1a407bec937389`, runtime
`4c1ba8ea213060fd54e572adaa1fc893c3d460c0`, with 2,154 protected baseline files.
The source PR is based on remote main, but a fresh-main application build is not
a production candidate: main also contains held policy, session and Ball Striking
work. The deliberate runtime branch applies only this admin patch to the approved
runtime. Its module directory omits the held Ball Striking entry and preserves the
approved route set. That runtime branch must never be merged into main.

Use the deliberate application-release builder with freshly verified marketing
snapshots. Preserve current marketing, isolated feedback and coach enrollment
bytes and all historical assets. Source commits and PR titles include
`[skip netlify]`; main currently auto-publishes unmarked pushes. A hosted preview
is not production acceptance. Promotion requires acceptance of its exact immutable
artifact, verified rollback evidence and post-promotion baseline reconciliation.

## Reproducing the browser fixtures

The reusable runners and fixtures are delivered in companion [PR #99](https://github.com/posetek/posetek_website/pull/99). Integrate both the admin product PR and that companion before running these commands from a fresh checkout. This split keeps each independent review within the repository input limits.

These files load the actual admin components into a loopback Vite preview with
invented records and a replaced client transport. They are not imported by any
production entry point. External requests are blocked and writes are recorded
in browser memory. There are no credentials or real people in these fixtures.

From the repository root, after installing the app dependencies:

```sh
node app/scripts/verify-admin-lightning-surfaces.mjs
```

The driver starts a dedicated Vite cache and server on port 4197, then closes it.
Use `--origin=http://127.0.0.1:4195` to reuse an existing source preview, or
`--quick` to restrict the width matrix to 390 and 1440 pixels. The complete
matrix covers Chromium and WebKit at 360, 390, 430, 768, 1440 and 1920 pixels.
Widths below 768 use browser touch input. Other widths use mouse input. This
does not constitute physical-phone acceptance.

The specialist driver verifies:

- Device, team-session, feedback and account-access preview layouts and controls.
- Native dialog focus, Tab containment, Escape behavior, stable rerenders and
  connected-opener restoration.
- Real dose validation, local dose changes and cancellation.
- Real workout-rationale validation, save-in-progress dismissal protection,
  failure feedback and draft retention.
- Real jump correction review, cancellation, busy guards and revision failures.
- Real new-drill validation, save/cancel boundaries and failed-save draft retention.
- Real personalized planner scope, preserved intake while filtering, held
  generation and clearing the planner when the account signs out.

`admin-lightning-fixture.mjs` exports `installDirectoryFixture(page, { state })`
for the directory driver. Its `normal`, `empty`, `loading` and `error` states use
the actual directory and report components. Directory records include deliberate
long names and multiple scopes. The default record destination is a URL assertion surrogate. The records-only
lane uses the actual player loader and four record tabs with synthetic read adapters.

`admin-lightning-forms-fixture.mjs` exports `installFormsFixture(page, { state })`.
It exposes only synthetic read results and controlled pending/rejected saves.
The planner fixture deliberately holds generation. It does not establish
successful server generation, activation, authorization, Firestore policy,
media publication or revision-restore acceptance. Those workflows retain their
existing focused tests and require their normal release acceptance.

Reports and screenshots are written to the ignored directory
`artifacts/admin-lightning-surfaces/verified`. Dialog captures use the viewport;
ordinary pages use full-page captures. External font failures are deliberate so
essential local navigation and controls are checked without a font service.

Run `node scripts/admin-workspace.browser.mjs`, `node scripts/admin-directory.browser.mjs`,
and the specialist command above against the local preview. Add `--records-only`
to the specialist driver for populated, missing, loading and failed player records.


## Final hosted candidate — October 22, 2026

The immutable application candidate is
[6ada727995f9097db531de87](https://6ada727995f9097db531de87--posetek.netlify.app/admin/accounts).
It was composed from approved-runtime branch commit
`499dc81502a56d8b7b01c36e5ee780af55b87244`; its admin UI matches source revision
`a8dc41baf82d63ebdfce614dd4d1aa76ffbb639c`, apart from the explicitly excluded
held navigation/routes already described above. Later documentation edits do not
change that runtime. This runtime branch must never be merged into main.

The sorted candidate inventory has SHA-256
`238c3a6bce0a068fd828f0e4ade967d08db0f0582a1c810ac1f321583ed87e48`.
It contains 2,186 files / 167,870,147 bytes. Provider inventory and local hashes
agree. All 2,153 protected files outside the application entry remain exact;
marketing, feedback and coach enrollment are unchanged. The full build initially
regenerated feedback/coach island references and correctly failed their guard.
The final composition first verified and preserved those existing documents,
then used the unchanged deliberate application-release composer. No guard was
weakened. The original failure is retained with the receipt.

All 96 hosted guest-route checks passed in Chromium and WebKit at 360, 390, 430,
768, 1440 and 1920px: protected routes, disabled preview bypass, first-activation
sign-in, Back/reload, no overflow and no page exceptions. Thirteen HTTP/alias and
security-header checks also passed. These checks do not establish populated
hosted-admin or physical-phone acceptance; populated workflows use the local
synthetic fixtures documented above. Earlier superseded candidate receipts and
a transient hosted HTTP 500 are retained, not relabeled as passes.

Independent exact-revision source and runtime reviews found no remaining issues
after correcting reporting retry visibility and active results-tab contrast.
Computed active label/count contrast is 7.92:1 and 10.62:1. Review is advisory,
not acceptance or deployment approval. Current CI and review links are attached
to product PR #98 and browser companion PR #99.

Production remained `6ad92e7fec1a407bec937389` during verification. Final inventory,
HTTP checks, runtime exclusion proof, review and browser captures are retained
under the runtime worktree's ignored `.netlify/admin-lightning/` directory.
Only this exact accepted artifact may be promoted through the guarded workflow.
The homepage candidate in PR #97 shares the same predecessor: after either
candidate is released, recompose and reverify the other against that new baseline
before accepting it. Retain the predecessor inventory for rollback and reconcile
the release baseline after any promotion.
