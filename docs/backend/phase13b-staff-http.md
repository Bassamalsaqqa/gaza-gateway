# Phase 13B staff authentication HTTP checkpoint

> Initial staff enrollment policy is superseded by the [2026-10-13 optional MFA amendment](optional-staff-mfa.md). Historical acceptance results below do not validate this amendment.

Status: implemented locally, awaiting independent review. Phase 13B remains incomplete.

This package adds eight accepted operations: staff login, pending MFA challenge/verify,
logout, current staff, session list/revoke and step-up. It reuses the accepted staff
cookie, pending cookie, unconditional Origin/CSRF middleware, PostgreSQL identity
tables, native Argon2id profile, TOTP/recovery primitives and immutable audit writer.
It creates no staff credentials, enrollment or initial administrator in application startup.

Each action owns its transaction and revalidates current locked authority. Lock order
is principal, sessions ordered by UUID, credential, then pending/recovery/counters.
Password-only authority is restricted to a five-minute pending login bound to the
anonymous session, credential epoch and encrypted initial MFA version snapshot.
Failed factors commit their attempt increment before returning a generic denial;
five failures exhaust the challenge without extending its deadline. Every matching
TOTP counter is consumed, and any consumed matching counter denies reuse. Recovery
consumption, pending consumption, session rotation and success audit commit together.
Step-up updates only the authenticated current session after a fresh unconsumed factor.
Session revocation is owner scoped; stale middleware snapshots cannot authorize writes.

The accepted challenge request requires `staffSessionChallengeId`, while the accepted
login JSON response has only status and expiry. The additive `X-Staff-Challenge-Id`
response header supplies that non-authorizing UUID and is exposed through exact-origin
CORS. It does not substitute for either cookie, bound session, current credential or
CSRF. Full-session rotation requires a fresh CSRF bootstrap before the next write.
The accepted JSON DTOs are unchanged. Browser integration remains a subsequent package.

## Focused local evidence (2026-10-11)

The guarded runner mounts the proposed backend with the locked existing vendor tree,
uses PHP 8.4.26 and the retained internal PostgreSQL 17 network, and admits fixtures only
when process/application environment is testing and the actual default PostgreSQL
connection/database are `pgsql_test` / `gaza_gateway_test`. Synthetic viewer principals
and append-only audits are retained. Only owned session/pending authority is revoked.
No unrelated rate counters or principals are cleared.

- Initial new-package gate: 4 tests / 53 assertions passed. Includes eight genuine HTTP
  operations, five-attempt durability, current pending version/CSRF rechecks and two
  real PHP processes racing the same pending proof (one winner).
- Three additional security cases: 3 tests / 30 assertions passed. Distinct pending
  challenges racing the same TOTP produce one winner; an audit failure rolls back
  factor consumption and session issuance; foreign session IDs, changed CSRF and
  current epoch changes cause no unauthorized effect. The first run reported one
  PHPUnit mock-expectation notice; its expectation was made explicit afterward.
- The actual-response schema gate detected the session DELETE response used a message
  instead of the accepted `revoked` boolean. The implementation was corrected and only
  the affected HTTP capture case was rerun: 1 test / 23 assertions passed. The actual
  response gate then passed eight responses and rejected all 24 negative controls.
  Focused ESLint on the new checker and the whitespace check also passed.

Reproduction (inside the guarded PHP runner):

```sh
php vendor/bin/phpunit tests/Feature/IdentityStaff/StaffAuthenticationTest.php
node backend/scripts/verify-staff-auth-responses.mjs /path/to/owned/captures.json
```

These are cumulative package checks, not a final uninterrupted Phase 13B integrated
gate. Initial enrollment, invitations, recovery/password changes, directory lifecycle,
last-admin operation integration, guest ownership access and EN/AR UI remain pending.
Remote provider delivery, scheduler/proxy/cookie staging and administrator custody gates
remain deferred. No Actions, paid provisioning, DNS change, deployment or merge occurred.
