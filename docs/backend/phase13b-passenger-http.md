# Phase13B passenger authentication HTTP package

Status: locally reviewed bounded package; Phase13B incomplete. Worker baseline ce731eeec941c275a15c18a0f19b13f1ab51b602; integration parent 5dab54f66e1a31a3cbb6a24e4cd5bcf649172c87. Public/admin frontend repository authority is unchanged. No staging or production service is activated.

## Implemented operations

All paths have the /api/v1 prefix. Exact request/response schemas remain in openapi.v1.json; command validation uses the accepted generated identity-command-contracts.v1.json.

| Method | Path | Operation | Success |
|---|---|---|---|
| POST | /auth/register | postPassengerRegister | 202 |
| POST | /auth/login | postPassengerLogin | 200 |
| POST | /auth/logout | postPassengerLogout | 200 |
| POST | /auth/password/forgot | postPassengerPasswordForgot | 202 |
| POST | /auth/password/reset | postPassengerPasswordReset | 200 |
| POST | /auth/email/verify | postPassengerEmailVerify | 200 |
| POST | /auth/email/resend | postPassengerEmailResend | 202 |
| GET | /auth/passenger/sessions | getPassengerSessions | 200 |
| DELETE | /auth/passenger/sessions/{id} | deletePassengerSession | 200 |
| PUT | /auth/passenger/password | putPassengerPassword | 200 |

Cookie-authorized writes retain unconditional allowlisted Origin and raw X-CSRF-TOKEN checks. Secure HttpOnly host-only gza_session cookie uses Path=/api/v1 and the accepted SameSite policy; tokens remain hashed and payloads encrypted in PostgreSQL. Staff/pending cookies confer no passenger authority.

Password hashing uses native Argon2id 64MiB/t4/p1 with the accepted passenger 15..128 code-point policy. Login rotates the admitted anonymous/own session atomically. Under owned action transactions, principal and exact owner-scoped sessions are locked, current database time and full context/credential epoch/stored hash/deadline/revocation/CSRF state are rechecked. Foreign sessions are owner-filtered before lock acquisition. Multi-session writers lock ascending session IDs. Reset locks the actual proof owner before validating submitted email, consumes once, advances epoch and revokes sessions/proofs atomically. Password change also revokes prior authority. Finite statement/lock timeouts bound action waits.

Successful state changes and their safe audit event commit together. Typed authentication/proof failures roll back the action, then record a separate fixed-vocabulary system denial event; no credential, contact data, raw input or exception appears in audit metadata. Rate budgets remain independent of action rollback. Capability-bearing login results conceal secret/PII fields in ordinary inspection/serialization channels. Source-only helper admission requires the testing environment and the same actual default pgsql_test connection resolving to gaza_gateway_test before fixtures or child processes.

Registration, resend and forgot return the accepted generic acknowledgement. The literal verification_dispatched is the accepted contract value; text accurately says queued for dispatch. No acknowledgement proves delivery. IdentityLifecycleServiceProvider is now registered to supply reviewed proof/outbox services. Remote providers remain unsupported/fail-closed; local capture/maintenance is explicit and no scheduler is installed.

## Independent focused evidence — 2026-10-11

Codex reviewed AGY source and repaired action lock/authority checks, durable denial handling, subprocess safety, audit vocabulary and test fixture defects. AGY run_e5d4f4f683aa475b8d2eb38f4b39c266 authored new capture support; Codex tightened ownership, exclusive persistence, missing-capture failure and actual reference-sibling negative controls. Worker self-reports are not runtime evidence.

- First package gate: 25 tests/127 assertions, 12 passing and 13 failures. All four real OS-process/PostgreSQL contention tests passed in that gate. Their observed overlap is distinct from sequential replay. Later current-context hardening requires final integrated concurrency recertification; it has not been rerun here.
- Only the original 13 failed HTTP cases were rerun: 8 passed, 5 remained failing. Only those five were then rerun after HTTPS/header/bodyless/request-fixture fixes: 5 tests/109 assertions passed. This is cumulative coverage, not an invented uninterrupted full-suite pass.
- New independent current-authority tests: 2 tests/26 assertions passed. They cover revoked login authority, epoch/CSRF invalidation and durable denial audit after rollback.
- New ten-operation HTTP response lifecycle: 1 test/59 assertions passed after correcting same-second proof selection to the currently issued proof. The initial failed capture gate is retained in review evidence.
- Actual captured response checker: all ten operation/status/application/json schemas passed; 14 pure negative controls rejected. Schema nodes remain intact, including reference siblings. Captures contain only operationId/status/contentType/rawResponseBody, in exclusively created private marked directories with restrictive permissions. Raw cookies, proofs, CSRF, passwords and request bodies are excluded. Capture PII is synthetic.

Reproduction uses the retained local PostgreSQL17 stack, PHP8.4.26 image, APP_ENV=testing, DB_CONNECTION=pgsql_test and the exact disposable database. Run vendor/bin/phpunit tests/Feature/IdentityPassenger/PassengerAuthContractCaptureTest.php with PASSENGER_AUTH_CAPTURES_DIR naming a NEW immediate private child passenger-auth-captures-<id>, then node backend/scripts/verify-passenger-auth-responses.mjs --captures-dir <that-directory>. The checker fails on missing/unowned captures; --pure is explicitly pure-only. Existing gates should not be repeated after small documentation edits.

Owned fixture cleanup preserves append-only security audit rows and audited synthetic principals. Shared expiring admission/rate counters are not deleted to manufacture passing results. Private captures are retained as review artifacts; never blanket-delete another fixture root or test audit history.

## Remaining phase work

Profile/travelers are still isolated and unaccepted. Staff MFA/step-up/directory/invitations/recovery, guest challenge/ownership/receipt access, opt-in bilingual UI and the single final integrated HTTP/PostgreSQL/browser certification remain unfinished. PR2 stays draft, four review threads remain open pending their stated evidence, and remote staging/provisioning requirements remain deferred. No Actions, merge, deployment, production credentials, DNS change or Phase13C is authorized by this package.
