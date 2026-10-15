# Backend migration handoff

On these coordinated migration branches, **posetek-backend is the source owner**
for Firebase rules/indexes, server Functions, backend operations and shared backend
tests. This repository retains its client responsibilities and a pinned Backend
checkout helper. Historical release documentation describes the original location;
current ownership is defined here. Production resources and runtime behavior have
not changed, and held candidates are not released by this source migration.

## Checkout and development

`backend-source.json` pins the immutable reviewed Backend source commit. Backend
integrates first, preserving this commit as an ancestor of main; then client
removals merge after both independent reviews and required CI pass. Documentation
or merge commits do not require changing the source pin. Clone and check out that
exact pin for local tools. Final review results and coordinated PR/check links
are recorded in Backend's `migration/REVIEW.md`.

```sh
git clone git@github.com:posetek/posetek-backend.git ../posetek-backend
git -C ../posetek-backend checkout --detach <full-commit-from-backend-source.json>
npm --prefix ../posetek-backend/functions ci --ignore-scripts --no-audit --no-fund
npm --prefix ../posetek-backend/firebase ci --ignore-scripts --no-audit --no-fund
python3 scripts/backend.py verify
python3 scripts/backend.py rules
python3 scripts/backend.py emulators
# In another terminal:
python3 scripts/backend.py seed
python3 scripts/backend.py smoke
```

Use `POSETEK_BACKEND_REPO=/absolute/path` for a nonstandard directory. Node 22.23.3,
Python 3.12 and Java 21 match CI. The helper verifies the canonical remote, exact
commit and tracked source bytes, including hidden changes. It never fetches,
installs or deploys implicitly. For Backend edits, work in Backend directly.

The shared demo profile uses Auth/Firestore/Storage/Functions at loopback ports
19099/18089/19299/15001. Seven callables execute existing implementations; other
callables explicitly fail locally. Background workers, AI, email and Cloud Run
remain unavailable. The fixed synthetic fixture is documented in Backend
`dev/profile.json`; never load a production export or use real athletes here.

Web uses `PUBLIC_FIREBASE_EMULATOR_PORT_OFFSET=0 npm --prefix app run dev:astro --
--host 127.0.0.1 --mode posetek-emulator-e2e` (one command line). Ordinary Web CI/builds
consume only `app/src/contracts/backend/v1` data and need no private checkout.
Web's old rules command delegates to the pinned Backend suite. The authenticated
browser script also resolves Backend source; its browser contract remains Web-owned.

Mobile adds a separate Debug simulator probe with `-posetek-backend-emulators`.
It initializes a named demo Firebase app before normal app startup and does not
restore real user state, upload queues or diagnostics. It checks synthetic Auth,
Firestore and Storage. Syntax is checked; real compilation and simulator acceptance
remain unverified and must follow the owned-primary `scripts/validate.sh` workflow.
The normal native app is unchanged. This is not full-product offline emulation.

## Release and recovery

There is no client publisher for shared Firebase code on this branch. Backend's
`release/README.md` owns the guarded/scoped procedures. Rules publication is explicitly
held: deployed rules, Functions export sets and indexes differ from candidate source.
A migration must not accidentally activate those existing held product changes.
Website hosting stays Web; native build/release and native schemas stay Mobile.

Review Backend `migration/README.md`, `CHANGES.md`, `VERIFICATION_STAGE2.md`,
`source-manifest.json`, `client-removals.json` and the redacted live inventory.
They record every move, adaptation, result and unexecuted qualification.
Reverting this source migration restores the original code/pins through Git; no
cloud rollback is needed. The external Mobile-based rules drift monitor requires
an operator handover after publishing the coordinated branches, as documented in Backend.

## Review follow-up

The final migration is reconciled with current main; Backend records the exact
source revisions in `migration/source-manifest.json`. Use the committed
`backend-source.json` revision, not a floating Backend branch.

The independent review findings, repairs, inherited dependency exceptions and
validation limits are recorded in Backend's `migration/REVIEW.md`.
