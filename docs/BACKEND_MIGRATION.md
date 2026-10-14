# Backend migration development handoff

Stage 1, October 14, 2026: Backend contains an isolated validation copy of shared
server/Firebase code and a central test entrypoint. Production publishing ownership
has not moved. Existing client rules/functions sources remain active until the
reviewed handover; do not delete or publish the Backend copy yet.

`backend-source.json` identifies the exact reviewed local Backend commit. It is
committed locally but not pushed by this task. Collaborators need that branch/commit
published before the following fresh-clone commands can resolve it.

```sh
git clone git@github.com:posetek/posetek-backend.git ../posetek-backend
# Check out the full commit from backend-source.json (after it is published):
git -C ../posetek-backend checkout --detach <commit>
npm --prefix ../posetek-backend/firebase ci
# Node 22.23.3 and Java 21 are the CI toolchain.
python3 scripts/backend.py verify
python3 scripts/backend.py rules
python3 scripts/backend.py emulators
```

For an existing nonstandard directory, set `POSETEK_BACKEND_REPO` to its absolute
path. The helper requires the canonical remote, exact commit and unchanged tracked
runtime/test bytes (including hidden edits). It never pulls, installs or deploys.
For backend edits, work directly in Backend and run its tests; the client helper
intentionally rejects an unreviewed dirty candidate.

The developer profile starts Auth/Firestore/Storage only, with a demo project and
no inherited cloud credentials. Web's existing `posetek-emulator-e2e` mode uses the
same base ports, but callable/gateway features still need their separate emulated
or stubbed services. Native Firebase startup is not wired to these emulators yet;
this handoff does not claim an offline native app. The next migration stage owns
that work and device acceptance.

Web's approved backend data contract is vendored under
`app/src/contracts/backend/v1`; its ordinary build and public CI need no private
checkout. Backend checks generated expectations against server code, while Web
checks its implementation against the same vectors. Only allowlisted JSON belongs
in the public bundle; keep private rules and runtime source in Backend.
