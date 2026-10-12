# HostPapa Shared-Hosting Capability Matrix (H0 Gate)

**Document Version:** 1.1 — 12 October 2026
**Status:** **UNVERIFIED** (Offline safe capability package hardened; pending owner execution on live HostPapa cPanel)
**Architecture Guardrail Preserved:** **YES** (HostPapa shared cPanel hosting only; no external hosts, databases, or daemons)
**Controlling Architecture:** [ADR: Existing HostPapa shared cPanel only](../architecture/ADR_HOSTPAPA_SHARED_HOSTING_ONLY.md) & [Master Execution Plan](GAZA_GATEWAY_HOSTPAPA_SHARED_HOSTING_MASTER_EXECUTION_PLAN_2026-10-12.md)

---

## 1. Executive Summary & Observed Host Telemetry

To ensure that the commemorative Gaza Gateway website (prebuilt React/Vite frontend + Laravel 13 backend + MySQL 8.4/InnoDB + HostPapa SMTP + bounded cPanel cron) can be hosted reliably on the owner's existing shared cPanel account, milestone **H0** establishes the exact runtime capability requirements.

### Observed Live Account Telemetry (Owner cPanel UI Inspection)
- **Web Server:** Apache 2.4.69; Directory Privacy tool visible. Actual rewrite execution remains unverified.
- **PHP selector:** Account global version 8.5 current. Actual web/CLI versions and availability of a specific 8.4 executable remain unverified. Laravel requires PHP ^8.4.
- **Database Engine:** MySQL 8.4.11-cll-lve (CloudLinux LVE edition with native MySQL 8.4 InnoDB).
- **PHP Extensions:** `pdo_mysql`, `gmp`, `openssl`, `mbstring`, `intl`, `fileinfo`, `curl` active. `sodium` extension is currently unchecked in cPanel (Gaza Gateway app calls core PHP `password_hash` with Argon2id, so `sodium` extension is optional unless direct `sodium_*` functions are required).
- **PHP Resource Limits:** `max_execution_time = 30s`, `memory_limit = 128M` (higher supported limits have not been checked), timezone `UTC`.
- **Cron Interface:** Menus offer 1/5/10/15/30-minute schedules; UI menus are not a policy guarantee and will be validated in H2.
- **Statement & CPU Quotas:** Untested at host level (CloudLinux LVE CPU/I/O limits require owner benchmarking).

---

## 2. Comprehensive Capability Matrix

The following table catalogs every runtime requirement, the offline tool test status, and the current verification state on the live HostPapa shared account:

| Domain | Feature / Invariant | Required Specification | Offline Tool Status | Live Host Status | Shared Hosting Verification / Fallback |
|---|---|---|---|---|---|
| **PHP Runtime** | PHP Version | `>= 8.4.0` (Laravel 13 requirement) | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Selector shows 8.5; actual runtime must be probed. |
| **PHP Runtime** | PHP SAPI | `cli` for Cron, `fpm`/`cgi` for Web | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Cron UI example names `/usr/local/bin/php`; its actual version is untested. Do not assume an ea-php84 executable. |
| **PHP Extensions** | `pdo_mysql` | Required for MySQL 8.4 connectivity | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `openssl` | TLS encryption, CSRF tokens, cryptographic hashing | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `mbstring` | Multilingual Arabic (RTL) / English string handling | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `intl` | ICU collations, number/date formatting | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `fileinfo` | MIME detection for uploads and downloadable tickets | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `curl` | HTTP client operations | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `xml`, `ctype`, `tokenizer` | Blade templating and core Laravel operation | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Standard built-in extensions in PHP. |
| **PHP Extensions** | `json` | Native JSON API requests and responses | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Standard built-in extension in PHP. |
| **PHP Extensions** | `gmp` | GNU Multiple Precision arithmetic | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Observed active in cPanel UI. |
| **PHP Extensions** | `sodium` | Libsodium primitives | `READY` (Optional platform check) | **UNVERIFIED** | Unchecked in cPanel. App calls core `password_hash` with Argon2id. |
| **PHP Security** | Argon2id Hashing | `PASSWORD_ARGON2ID` for identity credentials | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Built into standard PHP 8.4/8.5 core implementations. |
| **Platform Config** | Memory Limit | `>= 256M` recommended (128M observed default) | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Configurable via cPanel MultiPHP INI Editor (`memory_limit = 256M` or `512M`). |
| **Platform Config** | Execution Timeout | `>= 30s` (web), `>= 60s` (cron) | `READY` (`RuntimeProber.php`) | **UNVERIFIED** | Configurable via cPanel MultiPHP INI Editor (`max_execution_time`). |
| **MySQL Database** | Server Version | MySQL 8.4.11-cll-lve | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Observed in cPanel UI. Direct probe required to verify DDL permissions. |
| **MySQL Database** | Default Storage Engine | `InnoDB` | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Standard default on MySQL 8.4. |
| **MySQL Database** | Collation & Encoding | `utf8mb4_unicode_ci` / `utf8mb4` | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Explicitly specified in DDL statements. |
| **MySQL Database** | DDL Privileges | `CREATE`, `ALTER`, `DROP` on owned tables | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | cPanel database user permissions grant full DDL within owned databases. |
| **MySQL Database** | `CHECK` Constraints | Enforced validation (e.g. status enum checks) | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Enforced natively in MySQL >= 8.0.16 and MySQL 8.4. |
| **MySQL Database** | Foreign Key Constraints | `ON DELETE CASCADE` and `RESTRICT` | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Enforced natively by InnoDB engine. |
| **MySQL Database** | JSON Columns & Ops | `JSON_EXTRACT`, `JSON_UNQUOTE`, `JSON_CONTAINS` | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Supported natively in MySQL 8.4. |
| **MySQL Database** | Fractional Timestamps | `DATETIME(6)` microsecond precision, UTC | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Supported natively in MySQL 8.4. |
| **MySQL Database** | Triggers | `BEFORE INSERT` / `AFTER INSERT` triggers | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Requires `TRIGGER` privilege in cPanel database grant. |
| **MySQL Concurrency**| Multi-Connection Row Lock | `SELECT ... FOR UPDATE` across 2 independent PDOs | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Tested via 2 concurrent PDO connections. |
| **MySQL Concurrency**| Concurrency Primitive | `SELECT ... FOR UPDATE SKIP LOCKED` across 2 PDOs | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Second connection skips row locked by first connection. |
| **MySQL Concurrency**| Lock Wait Timeout | `innodb_lock_wait_timeout = 1` timeout tested | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Connection 2 verifies lock wait timeout fires. |
| **MySQL Concurrency**| Transactional Rollback | Atomicity and rollback upon error | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Standard InnoDB ACID transaction guarantees. |
| **Database Safety** | Scoped Cleanup | Rolls back, drops `canary_h0_tmp_*` only; NEVER drops DB | `READY` (`DatabaseProber.php`) | **UNVERIFIED** | Failure of any table drop fails the canary receipt. |
| **Host Quotas** | Statement & CPU Limits | CloudLinux LVE execution and memory quotas | `UNTESTED` (Marked untested host-level) | **UNTESTED** | Quotas are not invented; requires live host benchmarking. |
| **SMTP Delivery** | HostPapa Mail Server | TLS handshake to port 587/465 | `READY` (`SmtpProber.php`) | **UNVERIFIED** | Tool can probe a TLS socket; no host execution or message delivery was performed. |
| **Cron System** | Cadence & Quota | Support for periodic execution (10–30 min) | `READY` (cPanel Cron Runbook) | **UNVERIFIED** | UI menus offer 1/5/10/15/30-minute schedules; actual policy guarantee to be evidenced. |
| **Web Routing** | Apache mod_rewrite | Route `/api/v1` before SPA fallback | `PREPARED_OFFLINE` (`web-api-canary/`) | **UNVERIFIED** | Operational HTTP proof requires live request over HTTPS. |
| **Web Security** | Directory Privacy | HTTP Basic Auth (`REMOTE_USER` + `AUTH_TYPE Basic`) | `PREPARED_OFFLINE` (`web-api-canary/`) | **UNVERIFIED** | Requires live Apache Directory Privacy authentication. |
| **Private Filesystem**| Stage Outside Webroot | Deployment code stored outside `public_html` | `READY` (`GitStageProber.php`) | **UNVERIFIED** | Fresh owned private-file copy is prepared; actual cPanel Git deployment remains unverified. |

---

## 3. Direct Tests vs. Baseline Assumptions

### What Has Been Directly Verified (Offline)
1. **Identifier Safety & Injection Prevention:** `ConfigValidator` enforces strict allowlisted regexes (`TABLE_PREFIX_REGEX = '/^canary_h0_tmp_[a-zA-Z0-9_]{0,18}$/'`) and non-coercive grammar checks on DSN parameters, rejecting malicious prefixes with backticks, semicolons, newlines, spaces, or quotes.
2. **Owner Consent Binding:** Execution on a database requires dual confirmation: `CANARY_DATABASE` and `CONFIRMED_DISPOSABLE_DATABASE_NAME` must match exactly.
3. **Accidental Deletion Prevention:** Any attempt to configure `CLEANUP_DROP_DATABASE` throws a blocking `DatabaseGuardException`. Cleanup attempts to drop each owned table individually; failure on even one table drop marks the receipt as `FAIL`.
4. **Secret Redaction:** `Sanitizer` automatically scrubs passwords, DSN credentials, authorization headers, email addresses, and filesystem user paths from all outputs.
5. **Private Output Directory:** `canary_runner.php` rejects path traversal (`..`), symlinks, and paths inside `public_html`, enforcing `0700` directory and `0600` file permissions.
6. **Multi-Connection Concurrency:** `DatabaseProber` verifies `SELECT ... FOR UPDATE`, finite lock timeouts, and `SKIP LOCKED` across two independent PDO connections.
7. **Strict HTTPS & Directory Privacy in Web Canary:** `web-api-canary/index.php` strictly requires HTTPS and Apache-authenticated `REMOTE_USER` + `AUTH_TYPE === 'Basic'`, rejecting unauthenticated headers and direct script calls.
8. **Syntax & Compatibility:** All PHP canary components pass `php -l` and execute cleanly under PHP 8.4 (`php:8.4-cli`).

### What Remains to Be Directly Evidenced (Live HostPapa Account)
1. Live execution of the canary on the disposable database `<cpaneluser>_canary_test`.
2. Actual verification of `TRIGGER` privileges in the user's cPanel MySQL grant.
3. Actual CloudLinux LVE statement and CPU quotas under concurrent load.
4. Actual cron execution schedule and policy guarantee (15 vs 30 minutes).
5. Operational HTTP proof of Apache Directory Privacy and mod_rewrite over live HTTPS.
6. Live outbound SMTP delivery to a designated external test mailbox (to be authorized by the owner in H2/H4).

---

## 4. Gate Conclusion: H0 Status

- **H0 Tooling & Safety Package:** **HARDENED & VERIFIED OFFLINE**
- **Live Account Capability Evidence:** **UNVERIFIED** (Awaiting owner execution of the safe canary on HostPapa)
- **Architecture Invariant:** **PRESERVED** (HostPapa shared cPanel hosting only; no external services, no deployment to production, no provider migration)
- **Next Authorized Action:** Proceed with local H1 MySQL source conversion in parallel while owner schedules canary execution on the disposable database.

## Codex independent corrections and evidence

The final offline canary requires CLI execution; HTTP admission ignores untrusted forwarded-proto and unverified PHP Basic credentials. Private copy allocates fresh owned files and preserves any caller-selected existing directory; reports use unique child directories and reject symlink ancestors. Its filesystem read/write proof is not a cPanel Git execution proof.

Codex ran nine focused safety tests successfully, then only the two affected directory/preservation tests after the private-copy correction. These use the local PHP executable, not HostPapa. Worker-reported PHP8.4 syntax checks are separate local container evidence. No Laravel HTTP/MySQL account/cron/SMTP host gate has passed. See [actual read-only observations](H0_CPANEL_READ_ONLY_OBSERVATIONS.md).
