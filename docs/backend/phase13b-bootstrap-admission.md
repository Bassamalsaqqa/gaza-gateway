# Anonymous identity bootstrap admission and retention

Status: **In Progress / Independent Verification**. Additive Phase 13B resource protection; no passenger/staff login implementation or production activation.

## Admission policy

Both `GET /api/v1/auth/csrf` and `GET /api/v1/staff/csrf` route new anonymous issuance through `AnonymousBootstrapAdmission`. Per realm: at most 10 new sessions per canonical transport peer per 300-second fixed window, 300 globally per window, and 10,000 retained null-principal anonymous rows. The retained cap includes expired and revoked rows awaiting maintenance. Server configuration may lower the admission/count limits; it cannot raise them beyond this policy. Test seams require both testing environment declarations and live PostgreSQL `current_database() = gaza_gateway_test`.

Source identity uses only valid canonical `REMOTE_ADDR`, including IPv6 and IPv4-mapped IPv6 normalization. Forwarded headers and framework trusted-proxy settings cannot supply a missing peer or alter the key. The current local proxy may share one peer for many clients; this conservatively shares the budget. Verified deployment-specific proxy attribution remains deferred. No broad proxy trust is introduced.

Existing host/Origin/HTTPS/cookie checks precede issuance. Valid same-realm cookie reuse creates no row, charges no admission budget and retains its absolute deadline. Invalid, expired or duplicated expected cookies do not silently mint replacements. Missing/invalid peer fails closed. Denial returns canonical 429 with positive `Retry-After`, no token and no cookie. Database/cleanup/transaction failures return sanitized 503 with no cookie.

## PostgreSQL transaction boundary

Admission rejects an existing outer transaction. It runs bounded opportunistic cleanup, then owns a transaction with local 2-second lock and 3-second statement deadlines. A fixed realm advisory lock serializes fresh retained-row counts. Global budget precedes source budget creation; global exhaustion cannot manufacture arbitrary per-source rows. Counter increments and anonymous session insertion commit together. Failure rolls back all admission writes. Fresh time after row contention detects window drift and retries the entire transaction at most three times. Low-level session stores remain available for trusted internal fixtures, not unmetered HTTP admission.

## Durable maintenance

`AnonymousSessionCleanup` locks candidates in stable ID order with `FOR UPDATE SKIP LOCKED`, using fresh transaction-time expiry and bounded database timeouts. It deletes only expired/revoked null-principal anonymous sessions. Authenticated sessions and live staff pending/MFA replacement references are preserved. Terminal/expired staff pending references can be pruned before removing their anonymous parent. Passenger sessions with booking/quote/hold/challenge/claim dependencies are conservatively retained; those dependent lifecycles require owning-package cleanup. The hard cap includes these blocked rows, so maintenance failure cannot authorize unlimited issuance.

Each service batch is 1-100 rows. `identity:clean-anonymous` permits at most 10 batches per realm and 10 stale-bucket batches, rejecting fractional/scientific/unbounded CLI values. Buckets must be at least 3600 seconds past window end before pruning; the accepted horizon is bounded to one year. Only bootstrap buckets are touched. The Laravel scheduler registers hourly execution without overlap; no external scheduler was provisioned.

Each new-admission attempt also runs one bounded session batch and one bounded stale-bucket batch. This matters because hourly-only bucket maintenance cannot keep up with maximum sustained admissions. Cleanup errors stop issuance. No indefinite loops or credential/IP/SQL error logging are added.

## Focused local verification

Reproducible gate from `backend/`, using PHP 8.4 with PostgreSQL 17 available at the configured test connection:

```sh
sh scripts/test-bootstrap-admission.sh
```

The script verifies the live disposable test database before non-destructive migration-up and runs only the admission, cleanup, concurrency and previously accepted CSRF bootstrap test classes. It does not run the full backend/frontend suites. Tests cover independent OS-process last-slot/cap races in both realms, observed PostgreSQL blocking across a window boundary, cleanup/read contention and a locked synthetic upgrade, actual BEFORE/AFTER INSERT transaction failures, connection refusal, existing cookie behavior and negative source/option controls. Synthetic upgrade evidence proves lock exclusion; it does not implement login.

Codex independently verified the PostgreSQL concurrency and failure cases on 2026-10-10. The focused 46-case run passed 45 cases and exposed an Origin fixture/security defect; the corrected Origin case then passed separately (1 test, 10 assertions). A new fixed-window configuration case passed separately (1 test, 16 assertions). These are cumulative focused results, not a claim that one final uninterrupted 47-case suite ran. Unchanged cases were not broadly repeated.

After the AGY account retry completed, Codex pinned the index roundtrip to this migration only and verified all three indexes disappear and return. The capture writer uses the guarded test database and private ignored `backend/storage/app/private/bootstrap-test-captures/` artifacts. Six real Laravel HTTP-kernel responses backed by PostgreSQL passed the raw-body/status/content-type/security-header/cookie gate, with 15 deliberately corrupted controls rejected. This is HTTP-kernel evidence, not a new end-to-end proxy certification.

To recreate capture evidence after configuring the disposable local test environment and application key, run `APP_ENV=testing DB_CONNECTION=pgsql_test php scripts/capture-bootstrap-responses.php` from `backend/`, then `node scripts/verify-bootstrap-openapi-contracts.mjs` from the repository root. Never commit capture bodies or cookies. The roundtrip command is `APP_ENV=testing DB_CONNECTION=pgsql_test php scripts/verify-index-roundtrip.php`; it verifies the live test database and restricts rollback/reapply to `2026_10_10_000004_create_bootstrap_cleanup_indexes.php`.

The initial AGY continuation exhausted quota; the account-switch retry produced a handback under run `run_43bde8b9cda5478880f7a72d577cdf41`, which Codex reviewed and narrowed. The proof/outbox package remains excluded, PR #2 remains draft and Phase 13B remains incomplete. See [review disposition](phase13b-review-disposition.md).
