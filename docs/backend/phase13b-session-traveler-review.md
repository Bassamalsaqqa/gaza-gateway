# Phase 13B — session lock scope and traveler idempotence review

Status: bounded local corrections to independent review `5482291449`, pinned to earlier source `77f8e80ceb75981a1fb0a4d01caa5efa3840313f`. Phase 13B and draft PR #2 remain incomplete and unaccepted.

## Staff session row locks (P2, inline 4240636812)

`StaffAuthCoordinator::pending()` locks only its exact anonymous binding after locking the staff principal. Full actions lock only the owner-scoped current session and, for explicit session revocation, its target; IDs remain ascending. Neither path locks all historical staff sessions. Principal/current credential locking and fresh action authority checks remain in place.

Session listing reads only live, full, current-epoch/current-MFA rows under the already locked principal, without locking historical rows. The current unpaginated response is bounded to 100 items; an overflow fails explicitly with canonical 503 instead of silently omitting sessions or loading unlimited history. A future paginated listing contract requires independent review. This bound does not reject otherwise valid current-session operations.

Focused real PHP 8.4.26/PostgreSQL 17 regression: two new tests / 20 assertions passed. One fixture creates 300 expired/historical sessions and holds every historical row lock on an independent PostgreSQL connection. Current-user, listing, pending challenge/verification, step-up and logout still complete. Two separate PHP processes concurrently execute current-user actions from different active sessions and both succeed while those history locks remain held. A separate 101-live-session fixture proves explicit listing overflow while current-user access remains available. Fixtures assert the exact test database and retain immutable provenance; no shared counters are reset.

## Repeated traveler document patch (P3, inline 4240636814)

`SavedTravelerCoordinator` now decrypts and validates the current document under its existing authorized transaction before comparing semantic plaintext. An identical submitted document preserves the existing randomized ciphertext and `updated_at`; only a changed document is encrypted again. The normal audit still records the request with unchanged-version metadata. Corrupt or non-string decrypted representations fail closed rather than overwriting the integrity failure.

One new real HTTP/PostgreSQL test / 14 assertions passed: two identical document PATCHes retain ciphertext/timestamp, both audits record version 1, and a corrupted ciphertext PATCH returns the canonical generic 500 without altering the stored corruption. No raw document is emitted as test evidence.

Only these three new cases were run; previously passing suites were not repeated. The final integrated exact-head certification remains pending. Both review threads remain open for independent confirmation. No merge, Actions, deployment, provisioning or production cutover occurred.
