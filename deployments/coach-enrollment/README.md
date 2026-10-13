# Scoped coach enrollment publication

Read [the contract](../../docs/COACH_ENROLLMENT_LINKS.md). This directory exports
exactly five additive callables. Commit and push reviewed source with
`[skip netlify]` first. Use a fresh ignored run directory and existing authorized
operator session. Never deploy the central function entry, rules, gateway, held
account-deletion worker or unrelated functions.

```powershell
firebase projects:list --json --non-interactive
node deployments/account-recovery/owner-session.cjs .netlify/coach-enrollment-owner.json
python deployments/coach-enrollment/prepare.py --mode prepare --run-dir .netlify/coach-enrollment-backend --credential-file .netlify/coach-enrollment-owner.json
npm --prefix .netlify/coach-enrollment-backend/source ci --ignore-scripts --no-audit --no-fund
firebase deploy --only "functions:createCoachEnrollmentLink,functions:inspectCoachEnrollmentLink,functions:claimCoachEnrollmentLink,functions:listCoachEnrollmentLinks,functions:revokeCoachEnrollmentLink" --config .netlify/coach-enrollment-backend/firebase.json --project kickai-69dd0 --non-interactive
python deployments/coach-enrollment/prepare.py --mode verify --run-dir .netlify/coach-enrollment-backend --credential-file .netlify/coach-enrollment-owner.json
```

The publisher verifies immutable source archives, exact dependency closure,
Node 22, 256MB, five-instance caps, 30-second inspect/60-second authenticated
timeouts and public callable transport IAM. All predecessor functions must stay
unchanged. There are no rules, indexes or gateway changes. Test canonical private
client denials with `node scripts/run-rules-tests.mjs accountRecovery`.

Website publication preserves every predecessor byte and adds only the isolated
coach document and its dependency closure. Use the current baseline, fresh
provider inventory and exact approved marketing/feedback originals:

```powershell
node deployments/account-recovery/web-prepare.cjs .netlify/coach-enrollment-web
node scripts/build-coach-enrollment-release.mjs .netlify/coach-enrollment-web
```

Upload a draft of `production-dist` using the existing site configuration. The
new scoped web publisher permits exactly two coach URL aliases and dedicated
headers, rejects all other route/header changes, and requires the application
entry and every old asset to remain exact. It never promotes an older deployment.

```powershell
node deployments/coach-enrollment/web-release.cjs verify-draft --run-dir .netlify/coach-enrollment-web --deployment-id "NEW_REVIEWED_DRAFT_ID"
node deployments/coach-enrollment/web-release.cjs promote --run-dir .netlify/coach-enrollment-web --deployment-id "NEW_REVIEWED_DRAFT_ID" --browser-evidence .netlify/coach-enrollment-web/browser-evidence.json
node deployments/coach-enrollment/web-release.cjs verify-production --run-dir .netlify/coach-enrollment-web --deployment-id "NEW_REVIEWED_DRAFT_ID"
```

Review new/existing Auth accounts, supplied names, both-team scope, wrong/used/
expired/revoked links, races, retry, original-message reopening, normal sign-in
and team boundaries with synthetic owned records. Inspect 360/390/430px and
desktop. Remove all temporary accounts, descendant records, owned enrollment
links/audits and Auth-deletion projections; independently verify delayed readback.
Only then issue real links through the normal authenticated callable, verify their
fixed scope/status without consuming them, and email them to the authorized user.
Do not store real link secrets or forwarding email bodies in public receipts.

After confirmed publication, reconcile the baseline and pass the ordinary
preservation build. Merge source, handoff and sanitized release records into main.
