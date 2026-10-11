# Phase 13B Local Identity Maintenance Execution Specification

This document records the architectural specification, security boundaries, operational contracts, and verification evidence for the bounded local identity maintenance command implemented under **Phase 13B Local Maintenance 01** (`phase13b_local_maintenance01_20261011`).

---

## 1. Context and Problem Statement

Phase 13B implemented core identity lifecycle primitives:
- Four closed proof tables (`user_email_verifications`, `user_password_resets`, `staff_invitations`, `staff_password_resets`).
- Transactional encrypted outbox (`security_dispatch_outbox`).
- Secret-free private capture retention ledger (`OwnedCaptureRetentionLedger`).
- Honest local file mail capture gateway (`LocalFileMailGateway`).

However, on the Phase 13B baseline:
1. No console command existed to execute bounded outbox expiration, durable ledger reconciliation, or local dispatch.
2. Remote email delivery remains unconfigured and explicitly unavailable; queued security outbox items represent local captures or pending jobs, never external delivery.
3. The service provider `IdentityLifecycleServiceProvider` remains intentionally unregistered on the baseline pending downstream HTTP and passenger acceptance.

This package introduces a bounded, single-cycle, manually invoked local maintenance CLI command (`identity:maintain-local`) along with focused test source and fixture helpers. It introduces no background daemons, cron jobs, container modifications, scheduler registrations, or production provider activation.

---

## 2. Command Specification: `identity:maintain-local`

### 2.1 Invocation Syntax

```bash
php artisan identity:maintain-local [--limit=50] [--dispatch] [--json]
```

### 2.2 Options and Arguments

| Option | Type | Default | Description / Bounds |
|---|---|---|---|
| `--limit` | string / integer | `50` | Maximum number of records processed per batch. Strictly bounded to canonical lexical digits `1..100`. |
| `--dispatch` | boolean flag | `false` | Explicit opt-in enabling bounded local capture of eligible queued items. When omitted, only expiration/erasure and ledger reconciliation execute. |
| `--json` | boolean flag | `false` | Emits machine-readable aggregate metrics and error categories as JSON. |

### 2.3 Exit Statuses

| Code | Status | Meaning |
|---|---|---|
| `0` | Success | Cycle completed normally with zero operational or retained cleanup failures. |
| `1` | Safe Operational / Partial Failure | Service resolution, execution, dispatch failures, or retained ledger `failed_cleanup` entries encountered. Safe sanitized error category emitted (`partial_failure` or `ERR_*`); no sensitive details leaked. |
| `2` | Invalid Options / Profile Refusal | Limit was out of bounds/non-canonical, environment guards failed, database/driver mismatched, outer transaction was active, or mail driver was not local. |

---

## 3. Security Boundaries & Fail-Closed Profile Guards

All environment and profile guards execute **strictly before** service resolution, database updates, or local file writes. Any violation halts execution with exit code `2` (`EXIT_INVALID_OPTIONS`).

### 3.1 Strict Environment Matching
- Process environment `getenv('APP_ENV')` and bootstrapped application environment `$app->environment()` must be identical.
- Environment must be either `'local'` or `'testing'`.
- Production and staging profiles immediately fail closed (`ERR_PROFILE_REFUSAL_ENV`), preventing accidental retention or execution in deployed environments.

### 3.2 Database Connection & Live Database Guards
- Default connection `config('database.default')` must be `'pgsql'` in `local`, or `'pgsql_test'` in `testing`.
- Connection driver must be strictly `'pgsql'`.
- Configured database name `config("database.connections.{$conn}.database")` must match `'gaza_gateway_dev'` in `local` or `'gaza_gateway_test'` in `testing`.
- After database connection resolution and before service resolution, the actual connection instance is verified:
  - `$db->getName()` must strictly match the expected environment target (`'pgsql'` or `'pgsql_test'`). Any mismatch aborts immediately with `ERR_PROFILE_REFUSAL_CONNECTION`.
  - `$db->getDriverName()` must strictly match `'pgsql'`. Any mismatch aborts immediately with `ERR_PROFILE_REFUSAL_DRIVER`.
- The live database target is verified via `SELECT current_database() AS db`. Any discrepancy aborts immediately (`ERR_PROFILE_REFUSAL_LIVE_DATABASE`).
- The command must never force an environment or silently switch connections to manufacture authorization.

### 3.3 Outer Transaction Rejection
- If `DB::transactionLevel() > 0`, execution fails closed immediately (`ERR_PROFILE_REFUSAL_TRANSACTION`).
- Maintenance and dispatch operations cannot be invoked from inside an uncommitted caller transaction to prevent lock inversion or dirty state leakage.

### 3.4 Foundation Mail Driver Guard
- `config('foundation-services.mail.driver')` must be strictly `'local'`.
- Remote or unsupported drivers fail closed before service resolution (`ERR_PROFILE_REFUSAL_MAIL_DRIVER`).

---

## 4. Maintenance Cycle Execution

A single invocation of `identity:maintain-local` executes exactly one bounded cycle:

```
[Start]
   │
   ├─► 1. Evaluate Profile & Option Guards (limit, APP_ENV, DB name/driver, mail driver, outer TX)
   │        └─ Fail? -> Exit 2 (ERR_PROFILE_REFUSAL / ERR_INVALID_OPTIONS)
   │
   ├─► 2. Resolve Services (OutboxDispatcher, OwnedCaptureRetentionLedger)
   │        └─ Fail? -> Exit 1 (ERR_SERVICE_INITIALIZATION / ERR_UNSUPPORTED_MAIL_GATEWAY)
   │
   ├─► 3. Expire Outbox & Erase Ciphertext
   │        └─ OutboxDispatcher::expireAndErase(limit)
   │           • Sets status = 'expired' where expires_at <= clock_timestamp()
   │           • Permanently erases encrypted_payload = NULL
   │
   ├─► 4. Authoritative Ledger Cleanup
   │        └─ OwnedCaptureRetentionLedger::cleanupExpired(null, limit, db)
   │           • Reconciles PostgreSQL proof and challenge revocation/consumption
   │           • Purges expired raw capture JSON files (cap_*.json)
   │           • Retains failed_cleanup metadata if unlinking fails
   │
   ├─► 5. Optional Local Capture (only if --dispatch is passed)
   │        └─ OutboxDispatcher::dispatchBatch(limit)
   │           • Enforces total lock hierarchy: File Lock -> Canonical DB Row Locks
   │           • Deduplicates active captures under lock
   │           • Writes 0600 JSON captures to private sink (0700)
   │           • Records attempt count in DB
   │           • Outbox row status strictly remains 'queued' (no delivery claims)
   │
   ├─► 6. Reconcile Retention Ledger Failures via loadLedger()
   │        └─ Checks retained ledger entries for state = 'failed_cleanup'
   │
   └─► 7. Emit Aggregate Metrics & Exit
            ├─ If failed_cleanup > 0 or dispatch failedCount > 0:
            │    └─ Exit 1 (Safe Partial Failure: category 'partial_failure')
            └─ Otherwise:
                 └─ Exit 0 (Success)
```

### 4.1 Pure Maintenance vs. Dispatch Mode
- **Without `--dispatch`** (default): Only Steps 3 and 4 execute. Queued outbox items remain in `queued` status and are neither read, decrypted, nor written to the filesystem.
- **With `--dispatch`**: Eligible queued outbox items before deadline are decrypted and captured locally into the private sink via `LocalProofCaptureCoordinator`.

### 4.2 Non-Retry of Unsupported Remote Providers
- The command explicitly **does not call** `OutboxDispatcher::retryFailed()` on each maintenance tick.
- Outbox entries that failed due to unconfigured remote providers (`ERR_UNCONFIGURED_PROVIDER`) must remain in `failed` status until an authorized provider is integrated. Blindly resetting failed records creates retry storms against unavailable remote endpoints.

### 4.3 Partial Failure Semantics (Exit Code 1)
- If `dispatchBatch` reports `failedCount > 0` or retained ledger entries have `failed_cleanup` after the bounded cycle, the command strictly does **not** exit 0 or report success.
- The command exits with code `1` (`EXIT_FAILURE`), category `'partial_failure'`, and outputs aggregate failure counts (`failed_cleanup_count` and `dispatch.failed_count`).
- Durable retry metadata and original deadlines are preserved in the ledger; no broad unlinks or service redesigns occur.

### 4.4 Output & Information Hygiene
- The command outputs only **fixed stage names and aggregate integer counts**.
- Zero exposure of:
  - User emails / recipient addresses
  - Plaintext tokens, passwords, or OTP codes
  - Outbox UUIDs or proof IDs
  - Raw filesystem paths or capture filenames
  - SQL queries, driver connection strings, or database credentials
  - Exception messages or internal stack traces
- In both terminal table format and `--json` mode, local capture metrics are explicitly labeled as **"Captured locally"** / `captured_locally_count`, never as "delivered" or "provider accepted".

---

## 5. Service Provider Status & Manual Resolution

`IdentityLifecycleServiceProvider` remains unregistered in `backend/bootstrap/providers.php` on this baseline.

To accommodate this intentional isolation without duplicating bindings:
1. `MaintainLocalIdentity` inspects whether `OutboxDispatcher::class` or `OwnedCaptureRetentionLedger::class` is bound in the application container.
2. If registered (e.g. following downstream integration or in specific test fixtures), it resolves them directly.
3. If unregistered, it resolves `MailSubmissionInterface` from `FoundationServicesProvider`, verifies that it is an honest `LocalFileMailGateway`, resolves `Encrypter`, and constructs `OwnedCaptureRetentionLedger` and `OutboxDispatcher` manually using the validated default database connection.

This design ensures the command is functional immediately while preserving the clean container boundary until Codex integrates the passenger package.

---

## 6. Test Suite Architecture

The command is accompanied by a dedicated test suite under `backend/tests/Feature/IdentityMaintenance/`:

- **Test Suite**: `MaintainLocalIdentityCommandTest`
- **Fixture Helper**: `MaintenanceTestFixture` (`backend/tests/Fixtures/IdentityMaintenance/`)

### 6.1 Fail-Closed Testing Guards
Tests enforce strict fail-closed assertions throwing `\RuntimeException` (never `markTestSkipped`):
- Process `getenv('APP_ENV') === 'testing'`.
- Bootstrapped application environment `app()->environment('testing')`.
- Default connection `config('database.default') === 'pgsql_test'`.
- Actual resolved database connection name `$db->getName() === 'pgsql_test'`.
- Actual resolved database driver `$db->getDriverName() === 'pgsql'`.
- Live database query `SELECT current_database()` equals `'gaza_gateway_test'`.
- The fixture helper inspects all guards via `assertReady()` before every fixture mutation.

### 6.2 Test Coverage Summary:

1. **Option Validation**:
   - `test_invalid_limit_option_refuses_with_exit_code_two_and_sanitized_output`: Validates lexical rejection of `'0'`, `'101'`, `'-1'`, `'abc'`, `'50.5'`, `'050'`, and whitespace-padded strings.
2. **Environment & Profile Guards**:
   - `test_profile_refusal_when_process_app_env_mismatches_or_is_production`: Validates refusal when `APP_ENV=production`.
   - `test_profile_refusal_when_database_driver_mismatches`: Validates refusal when configured driver is not `pgsql`.
   - `test_profile_refusal_when_default_database_connection_mismatches`: Validates refusal when default connection is not `pgsql_test`.
   - `test_profile_refusal_when_actual_connection_name_mismatches`: Validates refusal when resolved connection's `getName()` mismatches `pgsql_test`.
   - `test_profile_refusal_when_actual_connection_driver_mismatches`: Validates refusal when resolved connection's `getDriverName()` mismatches `pgsql`.
   - `test_profile_refusal_when_foundation_mail_driver_not_local`: Validates refusal when mail driver is not `local`.
3. **Transaction Safety**:
   - `test_caller_outer_transaction_rejected_before_maintenance`: Verifies immediate exit with code `2` when caller holds an uncommitted outer transaction.
4. **Maintenance Cycle**:
   - `test_pure_maintenance_without_dispatch_expires_outbox_and_reconciles_without_capturing`: Asserts expired outbox ciphertext is erased (`NULL`) while valid queued items remain uncaptured.
   - `test_eligible_local_capture_via_explicit_dispatch_opt_in`: Asserts valid items are captured locally, outbox remains `status = 'queued'`, and file permissions are `0600`.
   - `test_expired_and_revoked_cleanup_purges_capture_files_at_original_deadline`: Asserts scrubbed/revoked outbox entries trigger file deletion from disk.
   - `test_multiple_deletion_failures_preserve_metadata_in_ledger`: Asserts that when file unlinking fails, metadata is durably preserved in the ledger with `state = 'failed_cleanup'` under its original deadline and reports exit code 1 with `partial_failure`.
   - `test_partial_failure_exit_when_retained_ledger_has_failed_cleanup`: Asserts exit code 1 and `partial_failure` JSON output when retained ledger entries have `failed_cleanup`.
   - `test_partial_failure_exit_when_dispatch_batch_has_failed_count`: Asserts exit code 1 and `partial_failure` JSON output when `dispatchBatch` produces failures.
5. **Output Hygiene**:
   - `test_output_hygiene_and_json_mode`: Asserts well-formed JSON output containing only aggregate counts with zero leaked secrets.

### 6.3 Fixture Teardown Invariants:
- All test mutations are strictly tracked and cleaned up in reverse foreign key order:
  `security_dispatch_outbox -> proof tables -> users`.
- Disposable test roots created with `OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_maint_', DB::connection())` verify the capability marker `.gza_owned_test_root_marker` before removing leaves and deleting the directory.
- Never bypasses database triggers; never uses blanket `TRUNCATE` or `DELETE`.

## Codex independent review — 2026-10-11

This bounded support package passed independent source review and its first focused real PHP 8.4.26/PostgreSQL 17 gate: `./vendor/bin/phpunit tests/Feature/IdentityMaintenance` — exit 0, **14 tests / 115 assertions**. The disposable runner used the retained local network with `APP_ENV=testing`, `DB_CONNECTION=pgsql_test`, and live `gaza_gateway_test`; no additional persistent stack was created. Baseline: `bc49fefb88b671c3fb9524e4203963991246204a`.

AGY authored the command and fixtures and corrected resolved-connection guards, nonzero partial-failure reporting and strict fixture admission. Codex corrected facade cache isolation in the refusal tests and replaced conditional chmod checks with deterministic failure of two capture erasures. The test proves both raw captures and their original deadlines remain accounted for, and the command reports `partial_failure` with exit 1. No append-only audit rows were removed or modified. Private log: `scratch/phase13b-kickoff/local-maintenance01-codex-focused-gate.log` in the supervisor checkout; it is not a runtime dependency.

This accepts only a manually invoked local/testing maintenance cycle. Passenger HTTP integration, staff/guest lifecycles, UI and the final Phase 13B integrated gate remain unfinished. Production/staging dispatch scheduling, real provider delivery and remote deployment remain deferred and unauthorized. GitHub Actions remain disabled.
