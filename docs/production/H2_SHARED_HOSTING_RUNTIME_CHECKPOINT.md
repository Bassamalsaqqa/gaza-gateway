# HostPapa runtime checkpoint — 2026-10-12

Status: **partial engineering checkpoint; not a deployable application release**.
Parent: `54a1a6d1b0d930f6202f4f1a1d5792f58766c541` on `hostpapa/shared-mysql-convergence`.
The HostPapa master execution plan remains controlling. Main and the static deployment branch are unchanged.

## Implemented in this checkpoint

- Production client activation requires `VITE_IDENTITY_UI_MODE=backend`, `VITE_IDENTITY_PRODUCTION_OPT_IN=true`, and an approved HTTPS API URL. The production authorities are `https://www.gazaairport.com/api/v1` and `https://gazaairport.com/api/v1`. Default builds remain mock; errors in live mode cannot fall back to mock authority.
- Backend profiles use the same account/site origin, retaining host allowlists, HTTPS, database validation, Origin/CSRF, MFA and RBAC. Features require `HOSTPAPA_SHARED_ENABLED=true` plus their existing explicit opt-in flags (`RESERVATIONS_ENABLED`, `EDITORIAL_ENABLED`, `GALLERY_ENABLED`, `MVP_SITE_ENABLED`, `MVP_MAIL_ENABLED`, `MVP_IDENTITY_SMTP_ENABLED`). This commit does not enable any deployed environment.
- Private disk storage is allowed for the shared-hosting profile. Absolute paths, public-root exclusion and existing symlink ancestors are checked before directory creation. Mail capture remains unavailable in deployment profiles.
- `shared-hosting:cron` provides owner-aware cache locking, finite batches, a CLI pcntl deadline covering lease acquisition through heartbeat persistence, signal-state restoration and nonzero failure reporting. Deployment requires database-backed locks. Readiness uses successful cron completion and the configured cadence, rather than inventing a continuous-worker heartbeat.
- Supported cadence values are 1, 5, 10, 15, 30 and 60 minutes. Default is 15; the owner's actual account policy must authorize the chosen cadence. Hourly scheduling uses a valid hourly cron expression. This is code, not a cron installation.

## Focused independent verification

- Final runtime gate: PHP 8.4.26, PHPUnit 13.4.1, **33 tests / 124 assertions**, no test failures. Command: `php vendor/bin/phpunit --no-configuration --do-not-cache-result --bootstrap vendor/autoload.php tests/SharedHostingRuntime`. One runner-option deprecation (`--do-not-cache-result`) is retained in the log; future commands should use `--do-not-record-test-run-history`.
- The final gate ran in a disposable local container with network disabled. Its cache/lease tests use Laravel's in-memory test store; they do **not** certify multi-process MySQL lease behavior or actual HostPapa cron/mail operation. Hard-timeout tests use real pcntl signals. Logs/JUnit: `scratch/h2-codex-accepted-profile.log`, `backend/storage/logs/h2-codex-accepted-profile.xml`.
- Production-client cases: **10/10 passed** (`node --test --experimental-strip-types tests/unit/shared-hosting-runtime-client.test.ts`).
- Existing identity/UI/MVP transport checks: initial run **110/111 passed**. The one failure was the superseded separate staging API hostname. After correcting that fixture to the same-origin hostname, the **two affected assertions passed** with `--test-name-pattern 'staging HTTPS|custom port on accepted staging'`. Other passing cases were not repeated. The initial failed log is retained at `scratch/h2-existing-client-check.log`.
- `npm run typecheck`, focused ESLint, test inventory and whitespace checks passed. No identity-wide, browser-wide or full frontend suite was run.

## Excluded work and next gate

AGY exhausted its quota during the wider H1/H2-mail/H3 corrections. All isolated changes and failed evidence are preserved; a worker's file changes are not acceptance.

Codex's fresh disposable MySQL migration probe independently exposed an unquoted reserved `rows` column, incompatible UUID foreign-key character sets, and an unsupported stored function in an airport CHECK constraint. The first two were repaired in the **isolated H1 worktree**, not integrated here. The last migration probe still fails. PostgreSQL clock compatibility functions also require replacement/review rather than certification as a complete SQL port. No MySQL application, booking concurrency or full migration-lifecycle pass is claimed.

Before packaging: finish the native MySQL application/migration conversion and constraint tests; accept post-commit SMTP admission and bounded retries; verify cron overlap against real MySQL; finish and test the release installer/rollback and first-owner invitation bootstrap. The production identity dispatcher still has a local/testing-only restriction in this checkpoint, so successful mailbox exchange is not application-email acceptance.

Then build one exact-source release and test the joined Admin → public content → registration/verification → booking/seat → ticket/email → cancellation workflow on the authorized isolated HostPapa path/database. No extra owner cPanel action is requested until that package is ready. Public cutover remains an owner-controlled gate.
