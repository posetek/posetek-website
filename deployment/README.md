# deployment/

Inputs the build reads. Release receipts live in `docs/releases/receipts/`.

- `homepage-baseline.json` — pinned production inventory; `scripts/build-production.mjs` preserves it byte-for-byte.
- `home-navigation.js`, `planner-entry.*`, `admin-routes.js`, `preserved-*` — preserved legacy runtime pieces.
- `pose-source-checksums.json` — checksums for the pose preparation scripts.

Release tooling lives in `ops/`.
