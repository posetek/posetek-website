# Continue an existing website session

Status: tested source fix; not a production release. October 20, 2026.

The public website links to `/signin`. Previously, that page observed restored
Firebase authentication but still showed only the email/password form. A person
with a valid session could therefore appear signed out and have no direct way
back to their account. This is distinct from Firebase actually ending a session.

The fix offers an explicit **Continue** action for the restored account and an
option to use a different account. Continuation uses the existing current-account,
fresh-token and canonical role/profile checks. It preserves safe return destinations
and invitation/activation flows. Failed access checks remain retryable; they never
grant access or silently sign out the account. An account change or unmount must
invalidate an in-flight result.

This change does not reset credentials, revoke sessions, change Firebase
persistence, alter authorization rules or modify player records to repair access.
Account-specific support evidence stays outside the public repository. Missing
error records cannot prove that a reported browser failure did not occur, and this
reproduced defect does not establish the cause of a particular report.

## Validation

- 2,057 frontend tests pass; 119 focused landing/account-access checks pass.
- TypeScript/Astro builds all five entries. Svelte reports zero errors/warnings.
  Lint passes with existing warnings.
- 78 tooling tests, 32 Python 3.12 policy tests, seven compiled guest browser
  checks and two static transport tests pass. The app dependency gate passes
  with four inherited advisory paths and zero blocking findings.
- `node scripts/existing-session-browser.mjs` reproduces the updated React flow
  using real local Auth/Firestore emulators, a synthetic player and a stubbed
  `getClubContext` callable. Its temporary rules are a navigation fixture,
  not canonical authorization coverage. Every nonlocal browser request is blocked.
- The same harness with the pre-fix landing source and `--baseline` reproduces a
  restored authenticated UID with only the password form visible. The fix passes
  continuation, failed-read retry, safe/sanitized and rejected external returns,
  reload, switching during a delayed response, and ordinary password login.
  Continue submits zero password sign-in requests and leaves `lastLogin` absent.
- Synthetic desktop and 390px mobile captures were inspected, with no horizontal
  overflow or page exceptions. Physical-device and real-account acceptance are
  not claimed.

The harness requires an absolute `FIREBASE_BIN` path to the installed Firebase CLI,
Java 21 and cached Chromium. `POSETEK_APP_DIR` can select an isolated pre-fix app
copy for reproduction; `POSETEK_CAPTURE_DIR` selects an ignored output directory.
The initial system-Python policy run lacked PyYAML; the configured Python 3.12
environment then passed all 32 tests.

## Release

Source integration and website publication are separate. Follow the guarded
application release workflow and preserve current marketing, isolated feedback,
coach enrollment, and the approved privacy/support runtime. The held policy copy
on main must not be activated with this fix. No backend, rules, account recovery,
native or content release is required. Verify signed-in continuation and signed-out
login on the exact candidate before promotion; retain the prior application
artifact for recovery.
