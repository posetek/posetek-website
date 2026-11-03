# Local admin activity acceptance

Run Vite on loopback, then from the repository root:

```sh
POSETEK_ADMIN_PREVIEW_URL=http://127.0.0.1:4195 node app/scripts/admin-activity-acceptance.mjs
```

Optional environment variables:

- `ADMIN_ACTIVITY_ENGINE=chromium` or `webkit` selects one engine.
- `ADMIN_ACTIVITY_ONLY='retry|previous account'` selects named cases.
- `ADMIN_ACTIVITY_ARTIFACTS=artifacts/admin-activity/acceptance` chooses an ignored evidence directory.

The driver leaves existing admin browser suites unchanged. It covers six widths
(360, 390, 430, 768, 1440, 1920), three activity views, scope/history, complete-cohort
rankings, distinct follow-up groups, pagination/search, explicitly expanded
workout history, exact-session observation reads, failures/retry, missing additive
data, and delayed old-account/old-scope responses.

`install.mjs` substitutes only the Firebase browser module and the local fixture
document. The actual admin workspace, directory, report transport/validation,
read-only report hook, history adapter and observation presentation remain in use.
`runtime.ts` supplies invented records and logs every read. It rejects unmocked
or mutating data operations. External HTTP, WebSockets and same-origin network
writes are blocked. No Firebase Auth account or database fixture is created.

The fixture explicitly bypasses the production authentication guard. Its mutable
identity tests establish client-side invalidation only, not server authorization.
Backend semantic tests must separately validate the real endpoint; this independent
client fixture does not prove parity with deployed Functions. Other admin-tool
destinations are URL-only surrogates. Headless viewport/touch emulation is not
physical-device acceptance. External fonts are blocked, so exact hosted font
rendering is not established by these local screenshots.

For a normal interactive browser preview, keep the Vite process running and start
the loopback proxy in a second terminal:

```sh
npm --prefix app run dev -- --host 127.0.0.1 --port 4196 --strictPort
# In another terminal:
ADMIN_ACTIVITY_VITE=http://127.0.0.1:4196 ADMIN_ACTIVITY_PREVIEW_PORT=4197 node app/scripts/admin-activity-fixtures/preview.mjs
```

Open `http://127.0.0.1:4197`. The proxy serves the same fixture document and
canonical Firebase adapter; all other reads go only to the specified loopback
Vite server. It rejects writes, service endpoints, upstream redirects and sockets.
A content security policy blocks connections to external data services. This
preview is source-only, does not log in, and is never a production build input.
Stop both processes with Ctrl-C when finished.

Reports include the full request log, network blocks, screenshots, and original
failures. Do not silently rerun over a failed evidence directory. This local lane
never certifies a hosted or production candidate.
