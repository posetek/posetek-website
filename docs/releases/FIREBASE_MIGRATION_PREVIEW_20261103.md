# Firebase migration preview — November 3, 2026

Status: **deployed, serving failure reproduced; migration not accepted**.

The user authorized preparing the current site and deploying a Firebase test,
with Netlify and the custom domain unchanged. This is a Hosting compatibility
preview against existing production services, not an isolated staging environment.
No business-data writes or authenticated test-account operations were performed.

## Exact artifact

Current Netlify deployment: `6ae7cb8d2a05c4dbbbd9b7e5`.
The 2,436-file accepted runtime artifact was copied without rebuilding or changing
any bytes. Every file was verified by SHA-1/size against a fresh Netlify provider
inventory and SHA-256 against the accepted local artifact manifest. Artifact digest:
`b67f64126968a3d07c934f8c7ecc7fadbc4056f34c3a4066e6458910d2ad4de2`.
Source main includes held candidates; do not rebuild all of main for migration.

`firebase.preview.json` is a separate Hosting-only diagnostic configuration. It
selects `kickai-69dd0`, uses the verified `production-dist`, translates the six
public-entry aliases and application fallback, preserves enrollment/feedback
security headers and adds `X-Robots-Tag: noindex, nofollow`. It does not change
`firebase.json`, `netlify.toml`, Functions, rules, indexes or gateway source.
This diagnostic configuration is **not approved for live promotion**.

## Deployment and observed result

CLI 15.34.2 completed:

```sh
npx -y firebase-tools@latest hosting:channel:deploy migration-20261103   --project kickai-69dd0 --config firebase.preview.json --expires 7d   --non-interactive --debug
```

Preview: https://kickai-69dd0--migration-20261103-h22iipw9.web.app

Version: `37aecffcd8c597e2` (FINALIZED).
Release: `sites/kickai-69dd0/channels/migration-20261103/releases/1793734461073000`.
Expiration: November 10, 2026 at 11:33 a.m. PST.

The API lists every exact artifact path ACTIVE, plus two Firebase-generated files
(`/__/firebase/init.js` and `/__/firebase/init.json`): 2,438 ACTIVE records total.
The CLI added this exact preview hostname to Auth authorized domains. That is the
only identified Auth configuration addition; custom-domain/DNS settings did not change.

All nine HTTP probes returned the same platform 404 Site Not Found response:
`/`, `/index.html`, `/coaches`, `/signin`, `/admin`, `/coach-join`, `/feedback`,
`/api/ai-consent`, and an exact uploaded application JavaScript asset. A browser
confirmed the same page. Fresh query-string requests at 19:35:54 UTC still failed.
The 21,265-byte response SHA-256 is
`dd7c22b3f25d3c331abc00a714b9672396f01a14648bd3ed99f45ceeb64a2642`.
This reproduces the failure after Google's October 31 block-lift confirmation;
it does not establish that a security block is still active.

## Backend compatibility findings

- Live `receiveAppFeedback` and `aiCoachStreamProxy` OPTIONS requests allow
  `https://posetek.net` (204 with matching Allow-Origin), but reject this preview
  origin (403, no Allow-Origin). No allowlists were broadened.
- Netlify proxies `/api/ai-consent` to gateway `/v1/ai-consent`. Firebase's Cloud Run
  rewrite preserves the incoming path. The diagnostic config routes the request
  to the existing gateway, but its `/api/ai-consent` route returns 404 directly;
  `/v1/ai-consent` is a separate endpoint (GET returns 405). This mapping requires
  a reviewed compatibility change before acceptance. Do not substitute 301/302
  redirects for an authenticated POST or claim that the diagnostic rewrite works.
- Auth now recognizes the preview hostname. That configuration check does not
  prove sign-in, database access, uploads or authenticated user journeys.
- The site's failure to load blocks end-to-end frontend/backend acceptance.
  No account creation, model call, workout generation, feedback submission,
  billing operation or real athlete record change was performed.

## Preservation and next step

Fresh readback verified Netlify remains on `6ae7cb8d2a05c4dbbbd9b7e5`, with identical
custom domain and aliases; homepage and sign-in return 200 with unchanged hashes.
Firebase live remains version `3fcd5b23a59236fc`. No live promotion, DNS change,
Netlify setting change, backend deployment, rule or IAM change occurred.

Provide Firebase support with the fresh successful CLI deployment, exact preview
version/release, ACTIVE file inventory and matching 404 screenshot/probes, asking
Hosting engineering to reconcile serving state. After Hosting works, complete the
API-route and narrowly scoped preview-origin compatibility work, then run real
browser acceptance using approved synthetic fixtures. Preserve production origin
behavior throughout. No domain switch or Netlify removal is accepted by this test.

Local evidence is outside Git at
`/Users/dylankeller/Developer/PoseTek-Setup/firebase-preview-20261103`:
artifact/provider inventories, deployment log, config, preview and live API records,
HTTP probes, backend preflights, screenshot, and final preservation readback.
Raw debug logs are private and must be reviewed/redacted before external sharing.

## Minimal reproduction and support follow-up

On November 3 at 19:38:48 UTC, a second seven-day preview deployed successfully
using CLI 15.34.2 with one plain HTML file and no third-party code, rewrites,
Functions or Cloud Run. Reproducible files are in `deployment/firebase-diagnostic/`.
From that directory, the command was:

```sh
npx -y firebase-tools@latest hosting:channel:deploy diagnostic-20261103 \
  --project kickai-69dd0 --config firebase.json --expires 7d \
  --no-authorized-domains --non-interactive --debug
```

URL: https://kickai-69dd0--diagnostic-20261103-nktpcp4w.web.app
Version: `efecb9128e261d51` (FINALIZED).
The uploaded `/index.html` and two Firebase-generated init files are ACTIVE.
Both `/` and `/index.html` still return the same 21,265-byte platform 404.
Browser confirmation and screenshot agree. No Auth domains were added by this
minimal test. This isolates the serving failure from application code and routing.

A reply to Noel's October 31 unblock notice was submitted for case 10434780,
requesting Hosting engineering investigate, keep/reopen the case, and confirm an
investigation reference. The message includes a reviewed/redacted debug log,
minimal source/config, ACTIVE file manifest, HTTP reproduction and screenshot.
Gmail message `1a1a2ecece5bbc9d`, thread `1a187589a362f106`; Gmail accepted it as
SENT. Recipient delivery/engineering acceptance is not established by Sent status.
The prior monitoring automation remains off.
