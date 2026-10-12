# H1A — MySQL Identity Persistence Foundation

## 1. Executive Summary

Milestone **H1A** establishes the MySQL 8.4 / InnoDB persistence foundation for the Gaza Gateway / Palestinian Airlines identity and authentication subsystem under the strict HostPapa shared-hosting architecture decision record ([ADR_HOSTPAPA_SHARED_HOSTING_ONLY.md](../architecture/ADR_HOSTPAPA_SHARED_HOSTING_ONLY.md)).

All 7 core identity migrations have been ported from PostgreSQL 17 to MySQL 8.4 InnoDB without weakening schema invariants, security properties, or integrity constraints. An isolated, disposable test gate utilizing real PHP 8.4 and MySQL 8.4 Community Server containers verified complete migration lifecycle (up, 7-step rollback, reapply), 26 PHPUnit schema, constraint, and configuration tests (163 assertions), and real independent-process row lock serialization and `READ COMMITTED` freshness.

**HostPapa Shared-Hosting Invariant**: Preserved strictly. No background daemons, Redis, Docker in production runtime, or external database hosts are introduced.

---

## 2. Invariants & MySQL 8.4 Schema Implementation

### 2.1 Identifier & Collation Strategy
- **UUIDs**: Stored as `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin` to ensure exact-match binary indexing, fixed-width performance, and full UUID canonical format compatibility.
- **Opaque Tokens & Digests**: Fixed-length SHA-256 digests (`token_digest`, `lookup_digest`) use `CHAR(64) CHARACTER SET ascii COLLATE ascii_bin`. High-entropy random challenge identifiers use `VARCHAR(...) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin`.
- **Timestamps**: All timestamps use high-precision UTC `DATETIME(6)` (`$table->dateTime('...', 6)`). `time_zone = '+00:00'` is enforced at connection configuration level.

### 2.2 Canonical Email Identity & `NO PAD` `utf8mb4_0900_bin` Collation
PostgreSQL CITEXT or generic MySQL case-insensitive collations (`utf8mb4_0900_ai_ci`) collapse accented characters, creating security vulnerabilities (e.g. `café@gazaairport.com` colliding with `cafe@gazaairport.com`). Furthermore, legacy `utf8mb4_bin` has `PAD SPACE` behavior where trailing spaces are silently collapsed in comparisons.

To guarantee exact case-insensitivity for ASCII email local-parts while preserving distinct Unicode characters and prohibiting silent trailing-space conflation, the schema implements:
```sql
normalized_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin
    AS (LOWER(email)) STORED NOT NULL UNIQUE
```
- **NO PAD Collation Attribute**: `utf8mb4_0900_bin` strictly does not pad strings (`PAD_ATTRIBUTE = 'NO PAD'`). Thus `'pilot@gazaairport.com'` and `'pilot@gazaairport.com '` are distinct and do not conflate.
- **Case Normalization Duplicate**: `PILOT@gazaairport.com` and `pilot@gazaairport.com` collide deterministically on `normalized_email` and are rejected as duplicates.
- **Accent Distinctness**: `café@gazaairport.com` and `cafe@gazaairport.com` remain distinct valid accounts without key collision.

### 2.3 Partial Unique Constraint Emulation via Stored Virtual Columns
MySQL 8.4 does not natively support partial unique indexes (`CREATE UNIQUE INDEX ... WHERE condition`). Rather than dropping uniqueness or making it unconditional (which would break multi-record flows), partial unique constraints are emulated using nullable stored virtual keys:
1. **Infant Passenger Uniqueness per Booking**:
   An infant requires an accompanying adult, and each adult can accompany at most one infant.
   ```sql
   infant_adult_unique_key VARCHAR(73) CHARACTER SET ascii COLLATE ascii_bin
       AS (CASE WHEN passenger_type = 'INFANT' AND linked_adult_passenger_id IS NOT NULL
                THEN CONCAT(booking_id, ':', linked_adult_passenger_id)
                ELSE NULL END) STORED UNIQUE
   ```
   Because MySQL treats `NULL` values as distinct in unique indexes, adult passengers evaluate to `NULL` (no collision), while infants with the same linked adult collide deterministically.

### 2.4 Outbox Dispatch Exactly-One Proof Foreign Key
The `security_dispatch_outbox` table dispatches security emails (verification, reset, staff invite, booking challenge). To prevent ambiguous dispatches without relying on weak polymorphic strings:
- 5 explicit nullable foreign keys point to the respective proof tables:
  - `user_verification_id` -> `user_email_verifications(id)`
  - `user_reset_id` -> `user_password_resets(id)`
  - `staff_invitation_id` -> `staff_invitations(id)`
  - `staff_reset_id` -> `staff_password_resets(id)`
  - `booking_challenge_id` -> `booking_guest_challenges(id)`
- A strict MySQL `CHECK` constraint guarantees that exactly one proof FK is non-null:
  ```sql
  CHECK (
      ((user_verification_id IS NOT NULL) +
       (user_reset_id IS NOT NULL) +
       (staff_invitation_id IS NOT NULL) +
       (staff_reset_id IS NOT NULL) +
       (booking_challenge_id IS NOT NULL)) = 1
  )
  ```

### 2.5 Circular Foreign Keys and Cascade Drops
In `staff_users`, `mfa_version` references `staff_mfa_credentials(staff_id, version)`, while `staff_mfa_credentials` references `staff_users(id)`.
- Handled cleanly in MySQL by creating tables with initial nullable columns, adding foreign keys after both tables exist, and dropping foreign keys explicitly before dropping tables during rollback.

### 2.6 Append-Only Immutability Triggers
In `audit_events`, events must be strictly immutable and append-only:
```sql
CREATE TRIGGER audit_events_immutable_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UPDATE is prohibited on audit_events; audit log is append-only.';
END;

CREATE TRIGGER audit_events_immutable_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DELETE is prohibited on audit_events; audit log is append-only.';
END;
```

> [!IMPORTANT]
> **MySQL Trigger Privileges & Binary Logging Notice**:
> In MySQL 8.4, creating triggers with binary logging enabled requires the `SUPER` or `SYSTEM_VARIABLES_ADMIN` privilege unless `log_bin_trust_function_creators=1`.
> In local test execution, the disposable test MySQL container ran with `--skip-log-bin`.
> Under HostPapa shared cPanel hosting, trigger creation privileges remain **UNVERIFIED** (H0 gate). The application architecture requires a separate runtime DML user (prohibiting `DROP`, `ALTER`, and `TRUNCATE`) to defend trigger integrity. `TRUNCATE` is DDL in MySQL and bypasses triggers; this is documented as an H0 privilege requirement.

---

## 3. Configuration & Runtime Preflight Guards

### 3.1 Database Configuration (`backend/config/database.php`)
- **Default Connection**: `mysql` (active deployment path).
- **Test Connection**: `mysql_test` (strictly separated, targeting `gaza_gateway_mysql_test`).
- **Engine**: InnoDB exclusively.
- **Charset & Collation**: `utf8mb4` / `utf8mb4_0900_ai_ci` with binary collations on sensitive columns.
- **Transaction Isolation**: `READ COMMITTED` explicitly set on connection (`isolation_level => 'READ COMMITTED'`).
- **Strict Mode**: `strict => true` (enforces strict SQL mode, strict type conversions, zero date rejections).
- **Raw Input Timeout Validation**: Connect timeout, statement timeout, and lock timeout are validated strictly before conversion. Loose string conversions (e.g. `'3oops'` -> `3`) are prohibited.
- **Active PDO Init Commands**: MySQL does not parse PostgreSQL's legacy `server_options` dictionary. Statement and lock timeouts are bound directly via `PDO::MYSQL_ATTR_INIT_COMMAND`:
  ```sql
  SET SESSION innodb_lock_wait_timeout = <seconds>; SET SESSION max_execution_time = <milliseconds>;
  ```
  - **`max_execution_time` Scope Note**: Per MySQL 8.4 engine specifications, `max_execution_time` applies exclusively to read `SELECT` statements. It does not apply to DML (`INSERT`, `UPDATE`, `DELETE`) or transaction lifetimes. Request/wall-clock limits are strictly maintained in PHP.

### 3.2 Preflight Validation (`backend/app/Support/ConfigurationValidator.php`)
- **HostPapa Shared-Only Rule**: In `production` and `staging`, `DB_HOST` must strictly be loopback `127.0.0.1`, `localhost`, or local unix domain socket. Remote database hosts and invalid IP aliases (`127.00.00.01`) are rejected with a runtime fatal exception.
- **Connection Rule**: Deployment requires `DB_CONNECTION === 'mysql'`. Non-MySQL drivers (e.g. `pgsql`, `sqlite`) or placeholder credentials are rejected.
- **Testing Rule**: Testing environment requires `DB_CONNECTION === 'mysql_test'` and live target database `gaza_gateway_mysql_test`.
- **Debug Guard**: `app.debug` must be `false` in deployment.
- **Timeout Validation**: Inspects actual `options[\PDO::ATTR_TIMEOUT]` and `options[\PDO::MYSQL_ATTR_INIT_COMMAND]` ensuring bounded limits (lock timeout 1–5s, statement timeout 100–5000ms) and detecting contradictory URL query parameter overrides.

### 3.3 Destructive Command Guard (`backend/app/Providers/AppServiceProvider.php`)
- Commands `migrate:fresh`, `migrate:reset`, `db:wipe` are intercepted via Laravel console `CommandStarting` events.
- Destructive commands are strictly prohibited in `production`, `staging`, or `local`.
- In `testing`, they are permitted ONLY when connected to database `gaza_gateway_mysql_test`. Aliases, options, or `--force` cannot bypass this guard.

---

## 4. Verification Evidence & Test Execution

Execution of the foundation gate (`backend/scripts/run-mysql-identity-foundation.mjs`) ran in a disposable environment consisting of:
- **Measured PHP**: `PHP 8.4.26 (cli) (built: Oct  6 2026 01:25:39) (NTS)` with `pdo_mysql`.
- **Measured MySQL**: `8.4.11` (MySQL Community Server 8.4.11 InnoDB).
- **Measured Live Timeouts**: `{ innodb_lock_wait_timeout: 3, max_execution_time: 3000 }`.

### 4.1 Gate Results
```
=== Starting H1A MySQL Identity Persistence Foundation Gate [mysql_h1a_369814a663cf] ===
[PASS] git-head (27ms)
[PASS] git-status (36ms)
[PASS] docker-build-test-runner (914ms)
[PASS] network-create (121ms)
[PASS] mysql-start (401ms)
[PASS] MySQL ready after 9 seconds.
[PASS] php-start (272ms)
[PASS] copy-backend (428ms)
[PASS] copy-vendor (4950ms)
[PASS] mkdir-identity-migrations (94ms)
[PASS] copy-migration-0001_01_01_000001_create_cache_table.php (93ms)
[PASS] copy-migration-0001_01_01_000002_create_jobs_table.php (86ms)
[PASS] copy-migration-2026_10_09_000001_create_identity_core_tables.php (89ms)
[PASS] copy-migration-2026_10_10_000001_create_identity_dependency_relations.php (86ms)
[PASS] copy-migration-2026_10_10_000002_create_identity_remaining_persistence.php (87ms)
[PASS] copy-migration-2026_10_10_000003_create_identity_profile_audit.php (88ms)
[PASS] copy-migration-2026_10_10_000004_create_bootstrap_cleanup_indexes.php (88ms)

--- Measuring engine telemetry ---
[PASS] measure-php-version (190ms)
[PASS] mysql-pdo-check (106ms)
[PASS] measure-mysql-version (91ms)
Measured PHP: PHP 8.4.26 (cli) (built: Oct  6 2026 01:25:39) (NTS)
Measured MySQL: 8.4.11

--- Executing Migration Lifecycle Gate ---
[PASS] migrate-up-initial (1214ms)
[PASS] migrate-rollback-initial (655ms)
[PASS] migrate-reapply-initial (1055ms)
[PASS] measure-live-pdo-timeouts (177ms)
Measured Live Timeouts: { innodb_lock_wait_timeout: 3, max_execution_time: 3000 }

--- Running PHPUnit MySqlIdentityFoundation Suite ---
[PASS] create-phpunit-config (93ms)
[PASS] phpunit-mysql-foundation (3009ms)
       (26 tests, 163 assertions, 0 errors, 0 failures)

--- Running Multi-Process Sentinel Contention Gate ---
[SYNC] Worker 1 acquired lock at 1791812374.53752. Launching Worker 2 immediately.
Worker 1 result: acquired at 1791812374.537, mutated to 2026-10-12 13:39:35.537884, committed at 1791812375.541
Worker 2 result: started at 1791812374.694, blocked for 847ms on InnoDB lock, acquired at 1791812375.541, observed mutated timestamp under READ COMMITTED
[PASS] Multi-process contention & serialization verified: Worker 2 blocked for 847ms and observed Worker 1 commit under READ COMMITTED.

--- Executing bounded cleanup and inspecting residual resources ---
Resource [php_mysql_h1a_369814a663cf]: CLEANED_AND_VERIFIED_ABSENT
Resource [mysql_mysql_h1a_369814a663cf]: CLEANED_AND_VERIFIED_ABSENT
Resource [net_mysql_h1a_369814a663cf]: CLEANED_AND_VERIFIED_ABSENT

Receipt generated: scratch/receipt-mysql-identity-foundation-1791812350935-mysql_h1a_369814a663cf.json
H1A GATE SUCCESS: MySQL identity persistence foundation verified.
HostPapa shared-only preserved: YES
```

### 4.2 Verified Test Coverage
1. **MigrationLifecycleTest**:
   - `testMigrationLifecycleUpRollbackAndReapply`: Verifies table creation (32 tables), drop in reverse-order on 7-step rollback, clean reapply, and sentinel re-seeding.
2. **SchemaIntegrityAndConstraintsTest**:
   - `testDirectInvalidAuthLevelFails`: Invalid `auth_level` check constraint.
   - `testNullableEpochsForFullSessionFails`: Full session requires valid epoch (`>= 1`); anonymous session allows null epoch.
   - `testRevokedProofStateTimestampEquivalence`: `consumed` state requires non-null `consumed_at`; `issued` state prohibits non-null `consumed_at`.
   - `testAllPurposeForeignKeysEnforced`: FK to non-existent user rejected.
   - `testCounterVersionAndCircularFk`: Staff MFA version circular FK enforcement and counter consumption FK.
   - `testUniquenessAndNormalizedEmailBehavior`:
     - Collation `PAD_ATTRIBUTE = 'NO PAD'` verified in MySQL metadata.
     - Direct query comparison confirms trailing space string is distinct under `utf8mb4_0900_bin`.
     - Uppercase case variation duplicate rejected by unique constraint.
     - Accent distinctness preserved (`café` vs `cafe` both coexist).
     - Trailing space non-conflation verified (`spaces@...` vs `spaces@... ` both coexist).
   - `testAuditEventsImmutabilityTriggers`: Triggers reject `UPDATE` and `DELETE` on `audit_events`.
   - `testResetProofReplayUniqueness`: Duplicate token digest rejected.
   - `testOutboxProofAmbiguityEnforced`: Rejects 0 or 2 proof FKs, accepts exactly 1.
   - `testFailedTransactionRollback`: Uncommitted transaction rollbacks cleanly on error.
3. **LastAdminSentinelContentionTest**:
   - `testStaffDirectoryControlSingletonSeededAndConstrained`: Single row `id=1` seeded; `id=2` rejected.
   - `testTwoConnectionSentinelLockContentionAndFreshness`: Cross-connection lock wait timeout and committed freshness.
4. **ConfigurationAndDestructiveGuardsTest**:
   - Rejection of `pgsql` connection in production.
   - Rejection of remote database host in shared-hosting production.
   - Rejection of test database name in production.
   - Rejection of placeholder credentials in production.
   - Rejection of `app.debug = true` in production.
   - Rejection of malformed connect timeout `'3oops'`.
   - Rejection of disallowed host alias `'127.00.00.01'`.
   - Rejection of missing init command timeouts in deployment.
   - Rejection of contradictory URL timeout override.
   - Live query test proving `@@innodb_lock_wait_timeout` and `@@max_execution_time` actively configured.
   - Destructive command guard rejection in non-testing environment and non-test database.
5. **Multi-Process Concurrency Gate (`probe-sentinel-process.php`)**:
   - Two concurrent OS processes synchronized deterministically via probe event emissions.
   - Process 2 verified blocked by InnoDB row lock for 847ms while Process 1 held the lock, and observed Process 1's committed mutation upon unblocking under `READ COMMITTED`.
   - Bounded child process lifecycle with wall deadline and output limits.
6. **Residual Resource Inspection**:
   - All owned containers and networks removed and verified absent via `docker inspect` and `docker network inspect`.

---

## 5. Artifact & File Checksums

| File | SHA-256 Checksum |
|---|---|
| `backend/config/database.php` | `0f74ee30bc680e9f7fb834e79e909e56daab5a3383906e799cef5a5a91605385` |
| `backend/app/Support/ConfigurationValidator.php` | `deeb072a81d4db46b48121b18ca60dd395bd3fa03a45ddb74b8ff7843af5c9de` |
| `backend/app/Providers/AppServiceProvider.php` | `d3a7f6df6bcd6f1627883469dca8b170c98029f96d31ead7ee166410fddeb84a` |
| `backend/database/migrations/0001_01_01_000001_create_cache_table.php` | `a2445baee31751f1bc7a8a6dfd26b828f61c1abe72433753a9e10dfe9e055301` |
| `backend/database/migrations/0001_01_01_000002_create_jobs_table.php` | `6bf7d78e42074600edafaf7d903b360e8bd0bca8b9f5eb758a622033d81d807f` |
| `backend/database/migrations/2026_10_09_000001_create_identity_core_tables.php` | `ef8564ae7797270dc8944ef70040790a33a2348934a20a41f464973a3ced7041` |
| `backend/database/migrations/2026_10_10_000001_create_identity_dependency_relations.php` | `10890b69c3e35404c1d7d2f67eaac1d717232fc628cce287287a011a7c9f5998` |
| `backend/database/migrations/2026_10_10_000002_create_identity_remaining_persistence.php` | `1fa1970f1960520078e06a43128f6b3e255fc2bf82722accf07dde991f2a1b1d` |
| `backend/database/migrations/2026_10_10_000003_create_identity_profile_audit.php` | `abbde2c70a6bb56c3195b931b06785b2ca9c5bdeaae38ab1ae3ab2340dbe281a` |
| `backend/database/migrations/2026_10_10_000004_create_bootstrap_cleanup_indexes.php` | `899b17753374138f75f9833511cd3cc4159bcb55d4c51f3a7166c7aa934f1334` |
| `backend/docker/mysql-test.Dockerfile` | `afebb1efff4423534d23aaccf51fce40fe654ad59a732a3b6cf28b7b52747e1b` |
| `backend/tests/MySqlIdentityFoundation/MySqlTestCase.php` | `9fe49b116daee7beb9e01c1b63d90173e75de6a97d0cbd9f33fd483e06a6b035` |
| `backend/tests/MySqlIdentityFoundation/MigrationLifecycleTest.php` | `7819e67a71eb48c86fe24ee86203941f14d394e32aa8c138a884d72048c645bf` |
| `backend/tests/MySqlIdentityFoundation/SchemaIntegrityAndConstraintsTest.php` | `ae3a6f9ae4f66979cb1fd52b5f83d683290d4c8c38298eaa1e687126dced9b63` |
| `backend/tests/MySqlIdentityFoundation/LastAdminSentinelContentionTest.php` | `853fb2792d3dcffc4d0924a409ee151afd7da34816ab6202fca4021433031660` |
| `backend/tests/MySqlIdentityFoundation/ConfigurationAndDestructiveGuardsTest.php` | `27ea0a2347c90fa5df81f55b5f2d2a0b2618e8d24cd36ee64272bb1c20410a43` |
| `backend/tests/MySqlIdentityFoundation/probe-sentinel-process.php` | `b430676576bcfb32629dd74332b61583f3875f7fe7ebf0e2edc8e344fc52aef3` |
| `backend/scripts/run-mysql-identity-foundation.mjs` | `9a93dd23163893ade5b2c2b33a408c7ab6057eed1e9656c86824d88aa76e4967` |
