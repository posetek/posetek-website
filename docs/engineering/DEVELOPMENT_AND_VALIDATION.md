# Development and validation

Use this with the [handbook](README.md) and [website workflow](WORKFLOW.md).
Commands run from the website repository root unless noted. Use Node 22.23.3,
Python 3.12 for policy tests, committed npm lockfiles, and a separate worktree
per change. Record the exact SHA and test output for the changed revision. A
test count from an earlier revision is evidence about that revision only.

## Daily change path

1. State the observable behavior, affected client/writer/reader, and behavior
   that must survive. Reproduce bugs before changing them.
2. Make the smallest coherent source and regression-test batch. Keep existing
   tests meaningful; never exchange them for a count target. Commit that batch
   before moving to another rewrite.
3. Run focused checks first, then the matching standing CI lane. Record real
   skips and missing prerequisites rather than substituting a mock or disabling
   a failing gate.
4. Open a PR with affected components, partner SHAs, validation, known gaps,
   compatibility order, and recovery route. A PR passing local checks still
   needs hosted evidence. The current author-merge and review policy is in
   [security and review](SECURITY_AND_REVIEW.md).

## Website standing CI

The merged [CI workflow](../../.github/workflows/ci.yml) runs for PRs,
`main`, merge groups, and manual dispatch without path filters. Five lanes
must all succeed for aggregate `ci`; missing, skipped, failed, or cancelled
lanes fail the aggregate. [PR #42](https://github.com/posetek/posetek_website/pull/42)
passed all six hosted check conclusions, including aggregate `ci`; remote
branch-protection enforcement remains separate. Its current jobs are:

| Lane | What to run locally | What it protects |
| --- | --- | --- |
| Policy | `python -m pip install -r ci/requirements.txt`; `python -m unittest discover -s ci -p 'test_*.py'` | Workflow, review input/report, contract artifact/source, and dependency policy invariants; offline mocked tests, not remote controls. |
| Dependencies | `python3 ci/run_dependency_audit.py app --baseline ci/dependency-exceptions/app.json` (Functions and legacy audits now run in Backend) | Production high/critical advisory identity and dependency path, severity increases, exception expiry, malformed report, scanner errors. Registry access is required. |
| Unit | `npm --prefix app ci --ignore-scripts --no-audit --no-fund`; `npm --prefix app test`; `npm --prefix app run lint` | Frontend behavior and lint. Preexisting warnings remain visible; don't silently bulk fix. |
| Server (retained job name) | `node --test scripts/*.test.cjs scripts/*.test.mjs` | Web-owned scripts, Hosting/release guards and data contracts. Functions, legacy handler and native artifact verification now run in Backend CI. |
| Build and browser | `npm --prefix app run check:svelte`; `npm --prefix app run build`; `npm --prefix app run build:marketing`; `node --test ci/check-static-firestore-transport.test.mjs`; `node scripts/check-static-firestore-transport.mjs`; `node --test scripts/browser-smoke.mjs` | Type/Svelte/Astro output, static-browser gRPC assumption, and guest Chromium navigation on the generated `app/astro-dist`. Install local Playwright Chromium only if authorized and absent. |

`scripts/browser-smoke.mjs` uses a disposable loopback preview, distinct guest
contexts, and blocks external HTTP/WebSocket requests. It proves guest flows,
not authenticated journeys or production assembly. The static Firestore
transport guard is essential while the narrowly excepted gRPC advisory is
present; an SSR/adapter change requires renewed assessment.

For a fresh local browser setup, install the Chromium version matching the
committed Playwright dependency before running the smoke test:

```sh
node app/node_modules/playwright/cli.js install chromium
node --test scripts/browser-smoke.mjs
```

The hosted Ubuntu workflow uses `install --with-deps chromium` to install its
system libraries as well. Run the preceding app install/build commands first;
a browser binary from another Playwright version is not interchangeable.

## Explicit integration batches

These are outside ordinary public PR `ci` because they need a private source,
local emulators, or native hardware. Run them only with the stated inputs; do
not turn missing input into a green skip.

| Batch | Source and command | Protected behavior and current limit |
| --- | --- | --- |
| Canonical mobile contract parity | Set absolute `POSETEK_MOBILE_REPO` to the reviewed `posetek-mobile-app` checkout and record its HEAD. In Web run `node --test scripts/device-performance-parity.integration.cjs`; in the reviewed Backend checkout run `node --test functions/device-performance-parity.integration.cjs`. | Separate owner-repository assertions preserve frontend and server parity with Mobile schema/fixtures; missing source fails. Web retains the original data-only digest table. The [Backend artifact candidate](https://github.com/posetek/posetek-backend/blob/main/ci/mobile-contract-pr-job.yml) remains inactive and now checks Backend only. |
| Canonical rules | Use the exact Backend checkout from `backend-source.json`, set `POSETEK_BACKEND_REPO` when nonstandard, and run `python3 scripts/backend.py rules`. | Runs both canonical SDK and relocated Web authorization suites in Backend. Requires installed Backend dependencies and Java/Firebase emulators; no public rule artifact. |
| Authenticated browser journey | With cached Java 21, Firebase binaries, Chromium, installed local dependencies, explicit absolute `POSETEK_BACKEND_REPO` checked out at the committed `backend-source.json` pin, run `node scripts/authenticated-emulator-smoke.mjs`. | Synthetic signup and four local Auth/Firestore/Functions/Storage emulators; exact demo project and loopback ports; no cloud credentials or live service. The harness checks canonical Backend Git origin, exact pinned HEAD and private rule bytes against that commit, plus free local ports before launch. This is local trusted-code evidence, not a public PR gate. |
| Production assembly | Follow [release and operations](RELEASE_AND_OPERATIONS.md); use the current captured live baseline and production build scripts. | Preserves existing deployed files and proves intended additions/changes. A plain Astro build is insufficient and historic file counts must not be hard-coded. |

For local rules work, use the exact pinned private Backend checkout. The browser
harness requires an absolute path, canonical `posetek/posetek-backend` origin,
matching HEAD and unchanged source bytes. It also requires cached emulator binaries
under `/private/tmp/`, a Java 21 `JAVA_HOME` containing `jdk-21`, and cached
Playwright Chromium. These are explicit local prerequisites, not a hosted lane.
Never kill another runner's process to free ports. Native build requirements stay
in the [Mobile build guide](https://github.com/posetek/posetek-mobile-app/blob/main/docs/BUILD_AND_TESTING.md);
shared local setup is in [Backend dev/README](https://github.com/posetek/posetek-backend/blob/main/dev/README.md).

### Reproducing the local authenticated journey

This is the documented macOS validation setup, not a cloud deployment command.
Prepare Web app and pinned Backend Functions/Firebase dependencies from their
lockfiles, expose Backend's installed Firebase CLI on `PATH`, and provision Java 21 plus the Firebase
Firestore/Storage emulator cache. Replace the Backend path below with the checkout at the exact
`backend-source.json` commit. The cache paths match the recorded
local validation; their existence is a prerequisite, not guaranteed on a new
machine.

```sh
export JAVA_HOME='/private/tmp/posetek-mobile-java21/jdk-21.0.12.1+1/Contents/Home'
export FIREBASE_EMULATORS_PATH='/private/tmp/posetek-mobile-emulators'
export PLAYWRIGHT_BROWSERS_PATH='/private/tmp/posetek-website-playwright-browsers'
export POSETEK_BACKEND_REPO='/absolute/path/to/pinned/posetek-backend'
export PATH="$POSETEK_BACKEND_REPO/firebase/node_modules/.bin:$PATH"
python3 scripts/backend.py verify
command -v firebase
"$JAVA_HOME/bin/java" -version
node app/node_modules/playwright/cli.js install chromium
node scripts/authenticated-emulator-smoke.mjs
```

The current harness requires a `JAVA_HOME` containing `jdk-21`, an emulator
cache below `/private/tmp/`, and nonempty `PLAYWRIGHT_BROWSERS_PATH`. It checks
these fixed loopback ports before starting: Auth `19199`, Firestore `18189`,
Functions `15101`, Storage `19399`, emulator hub `14400`, logging `14500`,
WebSocket `14150`, and Astro `14321`. `RULES_PORT_OFFSET` affects the separate
rules runner, **not** this journey. If a port belongs to another task, wait or
coordinate ownership; do not kill that task's process. Port configurability
and a portable hosted authenticated lane remain future improvements.

The harness passes a restricted environment to its child processes rather than
local cloud credentials. It uses a demo project, blocks browser requests to live
services and removes its temporary Functions wrapper. Do not supply production
credentials or publish private rule bytes to reproduce this test.

## Diagnosing a red lane

For the relocated Web rules runner, use the reviewed Backend checkout directly
when selecting a named suite or port offset:

```sh
cd "$POSETEK_BACKEND_REPO"
export FIREBASE_BIN="$PWD/firebase/node_modules/.bin/firebase"
export RULES_PORT_OFFSET='1000'
node scripts/run-rules-tests.mjs
```

`1000` is an example offset to check for availability, not a reserved range.
The Backend runner resolves canonical local rules by default and checks hashes
before and after execution. The Web helper deliberately runs both complete suites;
its named-suite commands now belong in Backend. The separate canonical SDK runner
uses its own fixed configuration; do not assume this offset applies to it.

- First check the exact SHA, Node/Python version, lockfile and dependency
  installation. A stale `node_modules` tree can fail to load a package already
  committed in the lockfile; refresh from the lockfile, not with an upgrade.
- Browser smoke requires the current Astro output and local Chromium. Inspect
  the generated route and the blocked-network assertion before editing tests.
- For rules/emulator failures, check exact private rule paths, Java runtime,
  emulator cache, and port availability. A missing private source is a failed
  prerequisite, not authorization to copy rules into the public website.
- For dependency failures, read every reported advisory path and the matching
  exception file. Scanner error, new high/critical, increased severity, or
  expired exception is a red gate. Do not run `npm audit fix` blindly.
- For a hosted mismatch, inspect the check conclusion and uploaded logs. The
  [2026-10-07 handoff](VERIFICATION_HANDOFF_20261007.md) is local historical
  evidence; it cannot certify a newer hosted run.
