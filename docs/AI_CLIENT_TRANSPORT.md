# Shared web AI chat transport

Status: source candidate, not deployed. This change preserves the existing proxy,
capability IDs, feature payloads and separate player/staff coach interfaces.

`app/src/pages/athlete-portal/player/gateway.ts` owns `streamCoach`. Both the
player workspace's `CoachChat` and the staff athlete portal's `AiCoachView` use
that transport. The latter still sends its existing `pose_chat` request without
a workspace context; sharing transport does not opt it into workspace behavior.

The transport adds a fresh lowercase UUID in `X-PoseTek-Request-Id` and the JSON
body, plus `X-PoseTek-Client: web/athlete-portal`. These are correlation metadata,
not an idempotency key or permission to replay a request. Gateway error request
and incident IDs remain available on the thrown error. The gateway and proxy
retain server-side authorization.

A turn succeeds only on a non-error terminal `done` event. EOF, an error event,
or `done` with `finishReason: error` fails, even after partial text or a draft.
Replay/save-only responses may omit `start` and message IDs. UTF-8 and frame
boundaries can span chunks; heartbeat comments are ignored. Processing stops
at `done`, so trailing bytes cannot change the terminal result. Aborting cancels
the reader; responses/frames received after an account change are discarded.

The staff portal binds its saved transcript only after transport success. An
interrupted turn remains visibly failed; cancellation cannot rebind a new
conversation. No automatic retry is added. Durable background-job submission,
recovery and observation remain unchanged.

## Privacy commands after sharing withdrawal

The existing memory list, forget, forget-all and disable commands can pass the
browser's local AI-sharing gate after withdrawal. Only the exact deterministic
`pose_chat` memory context/action shapes qualify. Confirmation, enabling memory,
ordinary chat and malformed/combined requests still require sharing. Commands
carry a memory-only context without a conversation or personal-workout marker;
they do not change the sharing preference. Server athlete ownership, deletion
and revision checks remain authoritative. This uses the existing chat API,
not a new memory endpoint or direct database writer.

## Validation

Focused synthetic suites cover shared wire payloads, metadata, fragmented SSE,
EOF, terminal errors, HTTP errors, cancellation and account switches, plus the
staff portal's existing non-workspace payload/history/preview behavior. Privacy
coverage includes failed withdrawal, exact action shapes, server refusal and
isolated command payloads:

```sh
npm --prefix app test -- src/pages/athlete-portal/player/gateway.test.ts src/pages/athlete-portal/views/AiCoachView.test.tsx src/pages/athlete-portal/player/player.test.tsx src/pages/athlete-portal/player/ai-sharing.test.ts src/pages/athlete-portal/player/CoachChat.test.tsx
node app/node_modules/typescript/bin/tsc -b app
```

The candidate passed all 196 web test files (2,200 tests), the TypeScript build,
and scoped lint. Scoped lint retains pre-existing CoachChat render-purity/ref
warnings on unchanged code. The baseline targeted suites passed before edits.
Dependencies were installed from the unchanged lockfile outside Git.

This is source-level verification, not authenticated browser/provider acceptance.
Production release remains separate and must preserve the approved runtime and
held candidates described in `AGENTS.md`. No hosting, proxy, backend, rules,
provider configuration or native source changes are included.
