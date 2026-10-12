# Gaza Gateway H1: MySQL Persistence Conversion & Invariant Matrix

**Target Environment**: HostPapa shared cPanel hosting (PHP 8.4/8.5, MySQL 8.4.11 InnoDB).
**Baseline**: `45ef6ea97b19368cd53e60e459d67e13ff1f91aa` (Free commemorative MVP baseline).
**Execution Authority**: HostPapa Shared Hosting Master Execution Plan (`docs/production/GAZA_GATEWAY_HOSTPAPA_SHARED_HOSTING_MASTER_EXECUTION_PLAN_2026-10-12.md`).

---

## 1. Architectural Invariants & Topology

1. **HostPapa Shared cPanel Only**:
   - Zero external cloud services, external database hosts, or Docker/Node daemons in production.
   - Prebuilt React/Vite frontend + Laravel PHP backend + MySQL 8.4+ InnoDB + HostPapa SMTP + bounded cPanel cron.
   - Private application and credentials reside strictly outside `public_html`.

2. **Explicit InnoDB Engine**:
   - HostPapa shared servers default to `MyISAM` if unspecified. Every table migration enforces `ENGINE=InnoDB` explicitly (`$table->engine = 'InnoDB'`).
   - The migration repository and schema metadata operate strictly on InnoDB with ACID transactions and row-level locking.

3. **Collation & Exact String Semantics**:
   - Database default charset and collation: `utf8mb4` with `utf8mb4_0900_bin` (NO PAD, binary case-sensitive exact string comparisons).
   - Prevents uppercase enum mutations (e.g. `CONFIRMED` vs `confirmed`) and ensures case-exact slug/identifier fidelity.

4. **Canonical UUID Columns**:
   - MySQL 8.4 lacks a native `UUID` type. All UUID columns use `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`.
   - Enforced by direct CHECK constraints validating canonical lowercase 8-4-4-4-12 hex grammar:
     `CHECK (id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`.
   - Nullable foreign keys enforce null-or-canonical grammar:
     `CHECK (col IS NULL OR col REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`.

5. **Runtime Database Privilege Separation**:
   - Required production runtime application user must have DML-only privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
   - Structural operations (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`) are strictly isolated to deployment/migration execution under owner credentials.

---

## 2. All 18 Migrations Conversion Matrix

| Migration Order & Name | Tables / Views Created | Primary Key / Collation | Engine & Triggers | Invariant & Key Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **01** `0001_01_01_000001_create_cache_table.php` | `cache`, `cache_locks` | String `utf8mb4_0900_bin` | `InnoDB` | Standard Laravel atomic cache & locks under InnoDB |
| **02** `0001_01_01_000002_create_jobs_table.php` | `jobs`, `job_batches`, `failed_jobs` | BigInt / String `utf8mb4_0900_bin` | `InnoDB` | Bounded async queue & batch tracking |
| **03** `2026_10_09_000001_create_identity_core_tables.php` | `staff_directory_control`, `staff_users`, `staff_sessions`, `staff_mfa_credentials`, `staff_pending_auth`, `staff_invitations`, `staff_password_resets`, `security_dispatch_outbox` | `id` UUID `CHAR(36)` ASCII bin | `InnoDB` | Seeded sentinel row `id=1` on `staff_directory_control`. `staff_invitations.invited_by_staff_id` nullable FK. |
| **04** `2026_10_10_000001_create_identity_dependency_relations.php` | Foreign keys & cascading rules | UUID ASCII bin | `InnoDB` | Immediate referential integrity between identity core tables. |
| **05** `2026_10_10_000002_create_identity_remaining_persistence.php` | `passengers`, `passenger_sessions`, `passenger_password_resets`, `passenger_verification_tokens`, `durable_rate_limits` | UUID ASCII bin | `InnoDB` | Strict rate limit tracking and passenger identity persistence. |
| **06** `2026_10_10_000003_create_identity_profile_audit.php` | `passenger_audit_log`, `saved_travelers` | UUID ASCII bin | `InnoDB` | Audit append-only trail with SHA-256 state tracking. |
| **07** `2026_10_11_000001_create_reference_aircraft_tables.php` | `aircraft`, `seat_layouts` (VIEW) | `id` `VARCHAR(32)` ASCII bin | `InnoDB` | **Architect Decision**: Physical layout consolidated on `aircraft`. Generated `capacity`. `seat_layouts` read view. |
| **08** `2026_10_11_000002_enforce_route_safe_aircraft_ids.php` | CHECK constraint on `aircraft.id` | ASCII bin | `InnoDB` | Safe identifier regex `^[a-z0-9_-]+$`. |
| **09** `2026_10_11_000003_create_network_reference_tables.php` | `reference_iana_timezones`, `airports`, `network_routes` | Airport IATA 3-char, Route UUID | `InnoDB` + BEFORE INSERT / UPDATE / DELETE triggers on `reference_iana_timezones` | Immutable IANA timezone lookup table populated with authentic `DateTimeZone::listIdentifiers()` + `UTC`. |
| **10** `2026_10_11_000004_create_meal_reference_tables.php` | `meals` | Code 4-char ASCII bin | `InnoDB` | Dietary code validation and meal catalog persistence. |
| **11** `2026_10_11_000005_create_schedule_reference_tables.php` | `schedules`, `schedule_exceptions` | Schedule ID `VARCHAR(160)` | `InnoDB` | Strict UTF-16 byte length bound: `OCTET_LENGTH(CONVERT(id USING utf16))/2 <= 160`. |
| **12** `2026_10_11_000006_create_editorial_publication_tables.php` | `editorial_documents`, `editorial_revisions` | UUID ASCII bin | `InnoDB` + BEFORE UPDATE / DELETE triggers on `editorial_revisions` | Append-only revision immutability; raw `snapshot_bytes` UTF-8 SHA-256 digest validation. |
| **13** `2026_10_11_000007_create_mvp_reservation_tables.php` | `mvp_reservations`, `mvp_seats`, `mvp_seat_holds` | UUID ASCII bin | `InnoDB` | Free commemorative booking: seat isolation, 10-minute holds, idempotent replay. |
| **14** `2026_10_11_000008_create_mvp_mail_tables.php` | `mail_dispatch_records` | UUID ASCII bin | `InnoDB` | HostPapa SMTP dispatch logging and delivery receipts. |
| **15** `2026_10_11_000009_create_mvp_site_tables.php` | `site_metadata`, `system_flags` | String `utf8mb4_0900_bin` | `InnoDB` | Administrative configuration and site announcements. |
| **16** `2026_10_11_000010_create_mvp_gallery_tables.php` | `gallery_items`, `gallery_revisions` | UUID ASCII bin | `InnoDB` + BEFORE UPDATE / DELETE triggers on `gallery_revisions` | Historical archive and illustrative concept catalog immutability. |
| **17** `2026_10_11_000011_create_security_smtp_attempts_table.php` | `security_smtp_attempts` | UUID ASCII bin | `InnoDB` | Abuse prevention and failed authentication auditing. |
| **18** `2026_10_11_000012_consolidate_fleet_layout_columns.php` | Layout columns on `aircraft` | Consolidated | `InnoDB` | Atomic updates without multi-table deferred locking. |

---

## 3. Concurrency, Locking & Time Mechanics

1. **Transactional Sentinel Locking**:
   - Replaced all non-transactional PostgreSQL advisory locks (`pg_advisory_xact_lock`) with seeded sentinel table `staff_directory_control` using `SELECT id FROM staff_directory_control WHERE id = 1 FOR UPDATE`.
   - Guaranteed serialization within active MySQL transaction boundaries under `READ COMMITTED` isolation.
   - Prevents race conditions during administrative staff creation, role promotion, and last-admin demotions.

2. **Database Clock Evaluation (`DatabaseClock`)**:
   - Strictly forbids client-side PHP wall-clock substitution or deterministic statement timestamp caching.
   - `DatabaseClock::now($connection)` queries `SELECT UTC_TIMESTAMP(6) AS db_now` freshly on the active connection **after** lock acquisition.
   - Prevents stale token expiration or lock timeouts caused by queue delays.

3. **Transaction Retries & Deadlock Handling (`DatabaseFailure`)**:
   - Error code mapping:
     - Duplicate Key: MySQL Error `1062` / SQLSTATE `23000` (mapped to 409 Conflict).
     - Deadlock: MySQL Error `1213` / SQLSTATE `40001` (retried with exponential backoff).
     - Lock Wait Timeout: MySQL Error `1205` / SQLSTATE `HY000` (explicit rollback and bounded retry).
   - Retry attempts strictly clamped to range `1..3`.
   - Never retries caller-owned outer transactions; network mail I/O strictly excluded from retry loops.

---

## 4. Verification Evidence & Quality Assurance

- **18-Migration Lifecycle**: Up (all 18 applied) $\to$ Rollback (all 18 reverted) $\to$ Reapply (all 18 re-executed cleanly).
- **Engine Audit**: All 78 base tables audited via `information_schema.TABLES` as explicit `ENGINE=InnoDB`.
- **View Audit**: `seat_layouts` audited via `information_schema.VIEWS`.
- **Direct SQL Negative Controls**:
  - Invalid UUID syntax rejected by regex CHECK constraints.
  - Case variations rejected by `utf8mb4_0900_bin`.
  - Stored timezone mutations blocked by `reference_iana_timezones` immutability triggers.
  - Revision updates/deletions blocked by `editorial_revisions` and `gallery_revisions` immutability triggers.
  - Schedule ID length evaluated via UTF-16 code units.
- **Race Verification**: Multi-process concurrent same-seat reservation race and staff last-admin self-demotion race verified under isolated MySQL 8.4 containers.

The disposable gate account also has DDL privileges for migrations and fault-injection tests; this does not certify the actual HostPapa production runtime grants. Production trigger privileges and the actual cPanel installer remain owner-assisted gates. See [independent integration evidence](H1_H2_MYSQL_MAIL_INTEGRATION_EVIDENCE.md).
