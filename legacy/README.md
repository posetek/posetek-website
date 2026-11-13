# legacy/

Not-yet-ported static pages and their scripts/styles (`sprintPage.html`, `athlete-portal.js`, `kickai-theme.css`, ...).
They were previously at the repository root. Served URLs are unchanged:

- `app/scripts/copy-legacy.mjs` flattens this directory into `dist/` (pages already ported to React are skipped).
- `deployment/homepage-baseline.json` `localPath` entries point here; production bytes are still pinned by SHA.
- `scripts/private-data-compatibility.test.cjs` reads these files as source.

Keep file names as-is: they are live URLs. `index.html` and `404.html` stay at the root.
