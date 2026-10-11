# Phase 13B proof admission and enumeration correction

The independent PR #2 review of `061a55a5e1009164603cbcc08d18a2070e43f728`
identified rotating subjects evading proof admission and asymmetric registration
hashing. Both are valid findings. They remain subject to fresh independent review;
no public-exposure or whole-phase acceptance is claimed.

## Architectural correction justified by the demonstrated blocker

The original ten-attempt subject/IP budget remains unchanged. An additional independent
60-attempt IP ceiling per 600 seconds is now pinned in the identity manifest, independent
expectations and policy constant, and enforced by the PostgreSQL limiter. This is a
stricter admission boundary, not a new identity convention. Verification and reset
share the passenger proof source budget despite different submitted tokens/emails.
Staff proofs use their separate realm. Canonical lock order acquires the IP row before
subject rows. The limiter checks each locked budget and current window before allocating
later rows, so an exhausted source cannot keep creating subject counters. Denial charges
no counters and does not enter the proof/audit action. Window drift still aborts/retries.

`pruneExpired(1..1000)` owns a bounded transaction and deletes only windows older than
one hour using an ordered `FOR UPDATE SKIP LOCKED` batch. The already guarded manual
`identity:maintain-local --limit=N` path invokes it and reports aggregate deleted count
in JSON. It does not delete audit records or active admission windows. No scheduler or
remote cleanup activation is claimed; remote edge admission, trusted peer/proxy mapping
and scheduled retention remain exposure gates. Source limits cannot stop distributed
IP attacks, and append-only security audit retention requires separate governance.

Registration now computes the same configured native Argon2id hash before checking
whether an email exists, after durable source admission and before principal locks.
Existing accounts discard the hash and return the identical generic receipt. Forgot
password performs the same native Argon2id verification work on both account classes
before its database lookup. Local captures/queued outbox records remain distinct from
remote email-provider acceptance or delivery. Recovery still has small database/outbox
work differences; common expensive work is a mitigation, not a constant-time claim.

## Focused real evidence (2026-10-11)

PHP 8.4.26 / PostgreSQL 17, actual guarded `pgsql_test` / `gaza_gateway_test`:
`php vendor/bin/phpunit tests/Feature/IdentityPassenger/PassengerAbuseReviewTest.php`
passed **3 tests / 123 assertions** in 9.015 seconds. No prior passing suite was repeated.

- One valid anonymous session submits 80 alternating verification-token/reset-email
  attempts with fresh subjects. The first 60 receive truthful invalid-proof 422s;
  the remaining 20 receive 429 with positive Retry-After. Exactly 60 owned subject
  counters exist, the source counter stays at 60, and audit count does not grow after
  source exhaustion. No counter reset was used to obtain this result.
- Four alternating-order samples per class returned identical registration/recovery
  receipts. Median local times (ms): registration existing 154.65 / new 156.77;
  recovery known 158.71 / unknown 154.05. Both classes performed native work, and paired
  medians met the bounded local ratio check. This is small local timing evidence,
  not remote statistical indistinguishability or an observed attack demonstration.
- A one-row cleanup batch removed exactly one of three owned old counters and retained
  the active counter unchanged. Other durable residue follows normal expiration;
  immutable principals/audits were retained.

The initial manifest gate correctly failed while the new ceiling lacked its independent
policy pin. The pin was then updated, and only the failed manifest check was rerun,
including a negative control deleting the source ceiling. Relevant security exposure
and final integrated phase gates remain open. No Actions, provisioning or deployment.
