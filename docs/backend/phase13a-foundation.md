# Phase 13A Foundation 01 — Implementation & Verification Report

Status: local-development checkpoint under Codex review. Phase 13A remains in progress; this report does not establish staging deployment or production readiness. The current artisan serve image is development-only.

Codex review clarification: the sixteen HTTP captures were generated in Correction03 under `run_ad4c28132ef74e9d83afc0ace29d8f40`. Correction04 reused them to verify stronger tooling; it did not recapture them. Their original run identity has been restored. The worker's original Correction04 log records its relabelled manifest and is retained only as historical worker evidence. Reproduce current validation with the original capture run ID. Hashes and metadata check internal consistency, not cryptographic proof of network execution.

Additional real fault probe: stopped-worker readiness503/recovery200; database-down liveness200/readiness503/recovery200; missing tables and unapplied migrations each503 then200 on the test database. The database-down version request exceeded an eight-second deadline, so that additional script exited1. Prompt503 for version is not proven. Bounded database/request deadlines are required in the next production-runtime assignment.

## 1. Overview & Architectural Boundaries

In accordance with the bounded Phase 13A foundation mandate (`AGY_TASK.md`), Correction 01 requirements (`CODEX_PHASE13A_FOUNDATION01_REVIEW.md`), Correction 02 requirements (`CODEX_PHASE13A_FOUNDATION01_CORRECTION01_REVIEW.md`), Correction 03 requirements (`CODEX_PHASE13A_FOUNDATION01_CORRECTION02_REVIEW.md`), and Correction 04 requirements (`AGY_PHASE13A_FOUNDATION01_CORRECTION04.md`), the core backend skeleton has been established inside the monorepo at `backend/` using modular Laravel 13, PHP 8.4, and PostgreSQL 17.

### Pinned Platform & Container Specifications
- **PHP Runtime**: PHP 8.4.26 CLI (`php:8.4.26-cli@sha256:1d2cf2b7d715b5b3aa959f0150ccbcc7b71e0181b637e443abf40a7fb56bf79a`)
  - Extensions installed: `pdo_pgsql`, `pgsql`, `intl`, `bcmath`, `zip`, `opcache`.
- **Database Engine**: PostgreSQL 17 (`postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`)
- **Package Manager**: Composer 2 (`composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac`)
- **Framework**: `laravel/framework:v13.35.0`
- **Testing Framework**: `phpunit/phpunit:13.4.1`
- **Lockfile**: Fully reproducible `backend/composer.lock` within `backend/`. Zero security vulnerabilities (`composer audit`).

### Network & Security Isolation Invariants
- **Compose Project**: Bounded project name `gaza_gateway_phase13a_foundation`.
- **PostgreSQL Ingress**: Strictly internal to the Docker bridge network `backend-internal`. No published host port (`5432` is not mapped to the host).
- **HTTP Endpoint**: Strictly bound to loopback `127.0.0.1:18084:8000`. No public LAN interface binding.
- **Database Roles**: Application and testing runtime use bounded non-superuser role `gaza_app_user` with restricted privileges. PostgreSQL bootstrap superuser (`gza_admin`) is strictly isolated to container initialization (`docker/init-db.sql`).
- **Separate Databases**: Dedicated development database (`gaza_gateway_dev`), test database (`gaza_gateway_test`), and disposable regression marker database (`gaza_gateway_marker`).
- **Restart & Worker Policy**: Queue worker configured with `restart: unless-stopped`.

---

## 2. Historical Checkpoint Summaries

### Correction 01 Summary (Historical — Run `run_e4ffe405f0064001bb85d503801b7081`)
- **C01.1 — Fail-Closed Environments & Safeguards**: Bounded production and staging configurations; prohibited destructive console commands in non-testing environments.
- **C01.2 — Security Protocol & Response Finalization**: `SecurityHeaders` middleware at the outermost boundary; single CORS authority; sanitized HTTP error formatting.
- **C01.3 — Worker Health & Metadata**: Queue worker heartbeat probe in `HealthController`; dynamic schema version derivation from PostgreSQL migration records.
- **C01.4 — Contract Gate**: Reproducible `validate-http-captures.mjs` checking negative controls and genuine specimens against OpenAPI 3.1.0 specifications.
- **C01.5 — Bootstrap Recipe & Hygiene**: Disposable application keys and strict Composer validation.

### Correction 02 Summary (Historical — Run `run_7bd63737c80a4b5398b6f0f8047fa10c`)
- **C02.1 — Fail-Closed Configuration Gate**: Registered `ConfigurationValidator` in `AppServiceProvider::boot()`; enforced environment allowlist, valid `APP_KEY`, `debug=false` in deployment, strict host allowlist, exact CORS origins, PostgreSQL TLS, and database-backed drivers.
- **C02.2 — Rollback and Resolved-Target Mutation Protection**: Added `migrate:rollback` to protected commands; enforced testing environment and `gaza_gateway_test` target database; verified marker database survival and clean rollback/reapply cycle.
- **C02.3 — Safe JSON Request & Exception Observability**: Configured Monolog `JsonFormatter`; added sanitized reportable exception handler emitting bounded JSON events (`category: "exception"`) and returning `false`; reordered middleware so logging precedes guards.
- **C02.4 — Fail-Closed Capture Gate & Fresh Evidence**: Enforced bodyless 204 validation, `application/json` Content-Type, bounded error schema resolution; executed negative controls and subprocess exit fixtures.
- **C02.5 — Clean Bootstrap Recipe & Truthful State Verification**: Verified product recipe in isolated scratch tree (`gaza_gateway_scratch_test`); documented truthful outage behavior for `/health` vs `/version`; removed fixed test key; preserved baseline Git state.

### Correction 03 Summary (Historical — Run `run_ad4c28132ef74e9d83afc0ace29d8f40`)
- **C03.1 — Effective Configuration & API Topology Gate**: `ConfigurationValidator` parsed effective database connection configuration via `Illuminate\Support\ConfigurationUrlParser`; pinned production API host `api.gazaairport.com` (`APP_URL=https://api.gazaairport.com`) and CORS origins `https://www.gazaairport.com` and `https://gazaairport.com`; pinned staging API host `staging-api.gazaairport.com` (`APP_URL=https://staging-api.gazaairport.com`) and CORS origin `https://staging.gazaairport.com`; strict base64 `APP_KEY` decoding; bounded missing-key console exemption to `key:generate`.
- **C03.2 — Safe Log Correlation in Exception Reporting**: Introduced `RequestCorrelation.php` with canonical methods (`isValidUuid`, `resolve`, `fromRequest`); sanitized reportable exception logging avoiding sentinel and message leakage.
- **C03.3 — Capture Gate, Raw Bodies & Run-Specific CLI**: Preserved exact raw body bytes without trimming in `extractHeadersAndBody`; resolved OpenAPI container `$ref` schemas; added `--run-id` CLI verification; generated 16 captures.
- **Independent Codex Review Disposition**: Codex independently verified real PHP/PostgreSQL 39 tests / 145 assertions, configuration probes, log correlation probes, capture edge probes, 16 stored captures, and 13 subprocess cases. Runtime fixes were provisionally accepted and frozen.

---

## 3. Correction 04 Remediation Details (Run `run_0b1e5668a9b244e888de59f177367cf0`)

### C04.1 — Authoritative Complete Manifest Gate
- **Shared 16-Probe Matrix (`backend/scripts/capture-probes-matrix.mjs`)**:
  - Established an authoritative 16-probe matrix module shared directly between `generate-fresh-captures.mjs`, `validate-http-captures.mjs`, and `test-capture-gate-subprocesses.mjs`.
  - Pinned exact probe identities: unique names (`01_health_liveness_200` through `16_worker_recovered_readiness_200`), bounded safe filenames (`^[a-zA-Z0-9_-]+\.txt$`), HTTP methods (`GET`, `POST`, `OPTIONS`), wire paths (`/api/v1/health`, etc.), operation paths (`/health`, etc.), expected statuses (200, 204, 400, 403, 404, 405, 429, 503), and protocol classifications (`untrusted_host`, `cors_preflight`, `unmatched_route`, `method_not_allowed`, or `null`).
  - Guarantees zero field divergence between capture generation, validation, and test assertions.
- **Authoritative CLI Gate (`backend/scripts/validate-http-captures.mjs`)**:
  - **Mandatory Run Identity**: Enforces explicit `--run-id` argument on CLI; fails closed if `--run-id` is omitted or does not match `manifest.runId`.
  - **Structural Integrity**: Rejects null, undefined, or non-object manifest items with structured errors rather than throwing unhandled `TypeError` exceptions.
  - **Completeness & Uniqueness**: Validates that `manifest.captures` contains exactly 16 items matching the authoritative matrix. Rejects missing probes, unexpected probes, duplicate names, or duplicate filenames.
  - **Strict Per-Item Evidence**:
    - Mandatory SHA-256: Each item must provide a valid 64-hex `sha256` matching the raw disk bytes. Missing hashes fail closed.
    - Mandatory Freshness: Each item requires `fresh === true`.
    - Timestamp Validation: Requires canonical UTC timestamps, rejects future generation/captures, captures before generation and generation windows exceeding30minutes. Rejects unknown/incomplete CLI flags and malformed metadata before disk access.
    - Status Consistency: `actualStatus` must strictly equal `expectedStatus` and the status code parsed from the captured response file on disk.
    - Wire Path Consistency: Enforces that `requestPath` matches the pinned `/api/v1` prefix plus `operationPath`, preventing contradictory wire path declarations.
- **Reviewer Manifest Probes (`scratch/CODEX_CORRECTION03_MANIFEST_PROBES.mjs`)**:
  - Verified that all five reviewer probe cases return exact expected exit codes:
    1. `complete_positive`: **0**
    2. `missing_hash`: **1**
    3. `missing_required_probes`: **1**
    4. `contradictory_wire_path`: **1**
    5. `false_freshness_and_wrong_status`: **1**
  - Results recorded in `scratch/CODEX_CORRECTION03_MANIFEST_PROBES.json`.
- **Paired Subprocess Test Suite (`backend/scripts/test-capture-gate-subprocesses.mjs`)**:
  - Rewrote the test runner to construct complete 16-item base fixtures on disk and mutate only the specific property under test.
  - Verified 22 subprocess test cases (20 negative controls exiting code 1, 2 positive controls exiting code 0):
    - Negative controls verify exits on: whitespace-only 204, bodyful 204 (`{}`), unknown operation, undeclared 204, wrong media type (`application/jsonp`), missing payload meta, header/meta requestId mismatch, missing manifest file, missing disk capture file, corrupted SHA-256 hash, run ID mismatch, duplicate manifest item, null manifest item, false freshness (`fresh: false`), missing capture timestamp, missing SHA-256 property, mismatched actual status, contradictory wire path, wrong classification, and partial matrix.
    - Positive controls verify exits on: complete 16-item valid matrix, and valid reusable response container (`$ref` in OpenAPI components).

### C04.2 — Accurate Product Documentation and Reports
- **Accurate RequestCorrelation API Documentation**:
  - The canonical correlation helper `backend/app/Support/RequestCorrelation.php` defines three public static methods:
    1. `isValidUuid(?string $value): bool` — Validates standard RFC 4122 UUID formatting via regex.
    2. `resolve(?string $value): string` — Normalizes a valid UUID to lowercase, or generates a fresh `Str::uuid()` if invalid or null.
    3. `fromRequest(?Request $request): string` — Resolves correlation UUID from request attributes (trusted), request headers (`X-Request-Id` validated via `isValidUuid`), or generates a fresh UUID.
- **Accurate Feature Test Suite Inventory**:
  - Replaced earlier placeholder lists with the exact 39 test methods defined in `backend/tests/Feature/SystemEndpointsTest.php`.
- **Exact Execution & Log Paths**:
  - Documented exact commands, exit codes, and scratch output log paths for independent review.

---

## 4. Test Suite & Verification Results

### A. PHPUnit Feature Test Suite (`39 tests, 145 assertions`)
*(Provisionally verified by Codex during Correction 03 review; PHP runtime and tests frozen in Correction 04)*

Exact verified test methods in `SystemEndpointsTest.php`:
1. `test_liveness_endpoint_returns_ok_and_canonical_meta`
2. `test_readiness_endpoint_returns_healthy_dependencies_when_heartbeat_active`
3. `test_readiness_endpoint_fails_when_worker_heartbeat_is_missing`
4. `test_readiness_endpoint_fails_when_worker_heartbeat_is_stale`
5. `test_version_endpoint_returns_injected_metadata_and_derived_schema_version`
6. `test_request_id_validation_and_regeneration`
7. `test_strict_host_guard_rejects_untrusted_host_with_security_headers`
8. `test_strict_host_guard_rejects_forwarded_host`
9. `test_cors_guard_handles_allowed_origin_and_preflight`
10. `test_canonical_error_response_on_not_found`
11. `test_security_headers_present`
12. `test_database_cache_operations`
13. `test_secret_sentinels_not_reflected_in_logs_or_json`
14. `test_destructive_command_prohibited_on_non_test_database`
15. `test_destructive_command_prohibited_in_non_testing_environment`
16. `test_migrate_rollback_prohibited_on_non_test_database_even_with_force`
17. `test_migrate_rollback_prohibited_in_non_testing_environment`
18. `test_programmatic_rollback_and_fresh_reject_wrong_target_preserving_marker_data`
19. `test_configuration_validator_rejects_unsupported_environment`
20. `test_configuration_validator_rejects_empty_app_key_in_deployment`
21. `test_configuration_validator_rejects_invalid_base64_app_key`
22. `test_configuration_validator_rejects_debug_true_in_deployment`
23. `test_configuration_validator_rejects_unauthorized_production_host`
24. `test_configuration_validator_rejects_production_local_app_url`
25. `test_configuration_validator_rejects_unauthorized_production_origin`
26. `test_configuration_validator_rejects_empty_database_host`
27. `test_configuration_validator_rejects_disabled_database_tls_in_deployment`
28. `test_configuration_validator_rejects_insecure_database_url_query_override`
29. `test_configuration_validator_rejects_wrong_database_url_scheme`
30. `test_configuration_validator_rejects_malformed_database_url`
31. `test_configuration_validator_accepts_complete_url_positive_control`
32. `test_configuration_validator_rejects_database_named_cache_with_array_driver`
33. `test_configuration_validator_rejects_database_named_queue_with_sync_driver`
34. `test_configuration_validator_rejects_staging_wildcard_and_bad_urls`
35. `test_configuration_validator_rejects_unsupported_queue_driver`
36. `test_configuration_validator_accepts_valid_testing_and_synthetic_production_profiles`
37. `test_readiness_fails_when_queue_driver_is_unsupported_in_memory`
38. `test_exception_reporting_emits_bounded_json_and_never_leaks_sentinel`
39. `test_early_rejection_paths_emit_correlated_json_request_logs`

### B. Reviewer Manifest Probes (`5 probe cases`)
- **Command**: `node scratch/CODEX_CORRECTION03_MANIFEST_PROBES.mjs`
- **Exit Code**: `0`
- **Results**:
  - `complete_positive`: `exitCode: 0`
  - `missing_hash`: `exitCode: 1`
  - `missing_required_probes`: `exitCode: 1`
  - `contradictory_wire_path`: `exitCode: 1`
  - `false_freshness_and_wrong_status`: `exitCode: 1`
- **Output Record**: `scratch/CODEX_CORRECTION03_MANIFEST_PROBES.json`

### C. Live HTTP Captures & Contract Gate
- **Current command**: `node backend/scripts/validate-http-captures.mjs --run-id run_ad4c28132ef74e9d83afc0ace29d8f40`
- **Exit Code**: `0`
- **Log Path**: `scratch/CODEX_CORRECTION04_VALIDATE_CAPTURES.log`
- **Results**:
  - Negative Controls: **16 rejected correctly, 0 false passes**
  - Live Captures: **16 passed, 0 failed** against OpenAPI 3.1.0 and manifest SHA-256 hashes

### D. Subprocess Exit Test Suite
- **Command**: `node backend/scripts/test-capture-gate-subprocesses.mjs`
- **Exit Code**: `0`
- **Log Path**: `scratch/CODEX_CORRECTION04_SUBPROCESS_TESTS.log`
- **Worker result**: 22/22 cases passed before Codex's final bounded corrections. Codex then added malformed-type, missing-freshness, timestamp and unknown-option cases; current results are recorded in the independent review.

### E. Contract Verification Suite
- **Command**: `node scripts/validate-backend-contracts.mjs`
- **Exit Code**: `0`
- **Log Path**: `scratch/CODEX_CORRECTION04_BACKEND_CONTRACTS.log`
- **Results**: All 138 API operations and 14 phase tags PASSED

### F. Whitespace & Git Invariants
- `node scratch/check-whitespace.mjs`: All 48 product files passed (canonical LF, 0 trailing whitespace, clean EOF)
- `git diff --check` and `git diff --cached --check`: Clean (exit code 0)
- `git rev-parse HEAD`: `60415d171d278b55ac4bb78e0d0f21bc2a23321d` (strictly unchanged)
- `git status`: Detached HEAD, index completely empty, untracked working files only

---

## 5. Proposed Product File Inventory

The complete inventory of proposed product files for Phase 13A Foundation 01 comprises 47 backend product files plus this foundation report (total: 48 files):

1. `backend/.dockerignore`
2. `backend/.env.example`
3. `backend/.gitignore`
4. `backend/Dockerfile`
5. `backend/artisan`
6. `backend/composer.json`
7. `backend/composer.lock`
8. `backend/docker-compose.yml`
9. `backend/phpunit.xml`
10. `backend/app/Http/Controllers/Controller.php`
11. `backend/app/Http/Controllers/HealthController.php`
12. `backend/app/Http/Controllers/SystemController.php`
13. `backend/app/Http/Middleware/CustomCorsGuard.php`
14. `backend/app/Http/Middleware/EnsureRequestId.php`
15. `backend/app/Http/Middleware/SecurityHeaders.php`
16. `backend/app/Http/Middleware/StrictHostGuard.php`
17. `backend/app/Http/Middleware/StructuredRequestLogging.php`
18. `backend/app/Jobs/ProcessProbeJob.php`
19. `backend/app/Providers/AppServiceProvider.php`
20. `backend/app/Support/ConfigurationValidator.php`
21. `backend/app/Support/RequestCorrelation.php`
22. `backend/bootstrap/app.php`
23. `backend/bootstrap/cache/.gitkeep`
24. `backend/bootstrap/providers.php`
25. `backend/config/app.php`
26. `backend/config/cache.php`
27. `backend/config/cors.php`
28. `backend/config/database.php`
29. `backend/config/logging.php`
30. `backend/config/queue.php`
31. `backend/database/migrations/0001_01_01_000001_create_cache_table.php`
32. `backend/database/migrations/0001_01_01_000002_create_jobs_table.php`
33. `backend/docker/init-db.sql`
34. `backend/public/index.php`
35. `backend/routes/api.php`
36. `backend/routes/console.php`
37. `backend/scripts/capture-probes-matrix.mjs`
38. `backend/scripts/generate-fresh-captures.mjs`
39. `backend/scripts/test-capture-gate-subprocesses.mjs`
40. `backend/scripts/validate-http-captures.mjs`
41. `backend/storage/app/.gitkeep`
42. `backend/storage/framework/cache/data/.gitkeep`
43. `backend/storage/framework/sessions/.gitkeep`
44. `backend/storage/framework/views/.gitkeep`
45. `backend/storage/logs/.gitkeep`
46. `backend/tests/TestCase.php`
47. `backend/tests/Feature/SystemEndpointsTest.php`
48. `docs/backend/phase13a-foundation.md`

---

## 6. Deferred External Gates & Phase Status

1. **GitHub Actions**: Disabled; no remote CI runs triggered.
2. **Paid Cloud Infrastructure & DNS**: No Render web services, PostgreSQL databases, or DNS records provisioned.
3. **Phase 13A Status**: Foundation 01 implementation, Correction 01, Correction 02, Correction 03, and Correction 04 completed and verified. Awaiting Codex review. Full Phase 13A completion (including typed frontend clients, delivery-storage seams, and production containerization) remains bounded for subsequent assignments.

## 7. Fresh local bootstrap

Run from the repository root in PowerShell with Docker Desktop/Linux containers and Node24. Local Compose credentials are disposable; they are not approved deployment credentials. The nonsuperuser local role has schema creation privileges for migrations. Production runtime/migration roles must be separated later.

```powershell
Copy-Item backend/.env.example backend/.env
docker compose -f backend/docker-compose.yml build
docker compose -f backend/docker-compose.yml run --rm --no-deps app composer install --no-interaction --prefer-dist
docker compose -f backend/docker-compose.yml run --rm --no-deps app php artisan key:generate
docker compose -f backend/docker-compose.yml up -d --wait postgres
docker compose -f backend/docker-compose.yml run --rm --no-deps app php artisan migrate --force
docker compose -f backend/docker-compose.yml run --rm --no-deps app php artisan migrate --database=pgsql_test --force
docker compose -f backend/docker-compose.yml up -d app worker
docker compose -f backend/docker-compose.yml exec -e APP_ENV=testing -e DB_CONNECTION=pgsql_test app composer test
node scripts/validate-backend-contracts.mjs
node backend/scripts/test-capture-gate-subprocesses.mjs
```

Generate new live evidence with an explicit new run ID and unused output directory. The generator stops/restarts only this disposable task's PostgreSQL and worker:

```powershell
node backend/scripts/generate-fresh-captures.mjs --run-id local_review_001 --captures-dir scratch/http-captures-local-review-001
node backend/scripts/validate-http-captures.mjs --run-id local_review_001 --captures-dir scratch/http-captures-local-review-001
```

No GitHub Actions, Render provisioning, DNS, real provider credentials or deployment are authorized here. Separate staging networking/DB/keys, TLS/custom domains, measured proxy trust, backup/restore and staging reachability remain external owner gates. Local tests do not satisfy the original remote staging/CI definition of done. Preserve the Phase8–11 HostPapa release `a47afded49e900b75c907e7230ca4dfef5b3f91e` from source `e1b4e3c62238357209990e80b00cc4635f621b76`; live cPanel deployment remains unverified.
