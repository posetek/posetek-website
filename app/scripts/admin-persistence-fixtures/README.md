# Admin tab persistence regression

Use Node 22.23.3 and the worktree's own committed-lock dependencies. Verify local
external development storage before starting. Set an isolated external Vite cache,
then start this loopback-only synthetic preview:

```sh
ADMIN_PERSISTENCE_CACHE=<verified-external-scratch>/vite-persistence node app/scripts/admin-persistence-fixtures/preview.mjs
# In another terminal:
ADMIN_PERSISTENCE_ARTIFACTS=<verified-external-scratch>/persistence-browser node app/scripts/admin-persistence-acceptance.mjs
```

`ADMIN_PERSISTENCE_PORT` and `POSETEK_ADMIN_PREVIEW_URL` select a nonconflicting
loopback port (default 4278). `ADMIN_PERSISTENCE_ENGINE=chromium|webkit` and
`ADMIN_PERSISTENCE_ONLY='<case-name regex>'` allow focused runs. Preserve failed
evidence separately when rerunning. Browser installations/caches and generated
artifacts belong on verified external development storage, outside Git.

The 36-case matrix uses Chromium and WebKit at 390 and 1,440 CSS pixels. It mounts
the actual directory and management components, account/report hooks, request
transport, validation and caches. It substitutes only the Firebase boundary and
invented source adapters from the existing activity fixture. No hook is mocked.
It counts organization/context/roster/report reads through first load, directory
and report tab roundtrips, distinct default payloads, explicit Refresh (including related variants), dependency expiry,
global invalidation, delayed invalidated responses, scope changes, auth changes, global scope and fail-closed permission errors.
A DOM mutation observer rejects loading/refreshing flashes during fresh reuse;
report labels preserve the original observation. Initial loads remain visibly
pending and a changed report request still fetches its exact variant once.

The fixture uses claimed synthetic players. Unclaimed-player signup invitation
reads and their private codes remain outside the shared context/roster/report
cache and are not claimed to disappear on remount.

The fixture rejects unmocked/mutating data operations; browser routing blocks
external HTTP, WebSockets and network writes. Mutable synthetic auth bypasses the
production auth guard: these tests establish client lifetime behavior, not real
Firebase authorization, backend parity, production latency/billing or deployment
acceptance. Viewport/touch emulation is not physical-device testing.
