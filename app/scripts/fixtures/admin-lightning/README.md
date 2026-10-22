# Admin browser acceptance

Companion to the admin workspace redesign. These harnesses require that product
change to be integrated before running them. They are not production entries.
Use invented records only; every external request is blocked and writes are
synthetic callbacks. A browser pass is not deployed backend or phone acceptance.

From the repository root, install the committed app dependencies and start Vite
on loopback port4194. Then run:

```sh
node scripts/admin-workspace.browser.mjs
node scripts/admin-directory.browser.mjs
node scripts/admin-directory.browser.mjs --reporting-retry-only
node app/scripts/verify-admin-lightning-surfaces.mjs
node app/scripts/verify-admin-lightning-surfaces.mjs --records-only
```

The specialist driver starts its own isolated Vite server. `--quick` limits its
width matrix to390/1440; `--origin=http://127.0.0.1:4195` reuses a local preview.
The shell and directory drivers accept `POSETEK_ADMIN_PREVIEW_URL`. Check each
script's default port. Never point these fixtures at production.

Recorded implementation acceptance:172 shell assertions;548 directory assertions;
52 reporting failure/retry assertions;432 specialist assertions;96 actual player
record assertions. Both Chromium and WebKit cover360/390/430/768/1440/1920 where
applicable. Record and retry lanes focus on390/1440. Viewport captures and JSON
receipts are retained in ignored `artifacts/` directories.

Tests exercise list/report scope, keyboard containment, touch activation, history,
loading/empty/error states, successful synthetic callbacks, draft retention and
explicit planner review/activation submission. They do not establish real service
generation, persisted saves, account recovery, media publication, server revision
restoration, physical-phone behavior or production authorization acceptance.
