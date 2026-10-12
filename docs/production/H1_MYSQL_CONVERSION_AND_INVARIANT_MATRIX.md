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

| Order / actual migration | Actual tables or views created | Persistence guarantees |
|---|---|---|
| 01 `0001_01_01_000001_create_cache_table.php` | `cache`, `cache_locks` | Database cache and owner-aware atomic locks; explicit InnoDB. |
| 02 `0001_01_01_000002_create_jobs_table.php` | `jobs`, `job_batches`, `failed_jobs` | Framework queue infrastructure only; production execution uses bounded cron. |
| 03 `2026_10_09_000001_create_identity_core_tables.php` | `users`, `staff_users`, `staff_mfa_credentials`, `passenger_sessions`, `staff_sessions`, `staff_pending_auth`, `user_email_verifications`, `user_password_resets`, `staff_invitations`, `staff_password_resets`, `staff_mfa_replacements`, `staff_mfa_counter_consumptions`, `staff_mfa_recovery_codes`, `staff_directory_control`, `security_rate_limits` | Independent passenger/staff identity, purpose-bound proof/MFA/session tables, directory sentinel and durable rate limits. |
| 04 `2026_10_10_000001_create_identity_dependency_relations.php` | `fare_products`, `quotes`, `capacity_holds`, `bookings`, `booking_passengers` | Historical identity booking/proof dependencies retained for accepted contract compatibility; these are not payment or live-airline activation. |
| 05 `2026_10_10_000002_create_identity_remaining_persistence.php` | `booking_guest_challenges`, `booking_guest_grants`, `booking_receipt_grants`, `booking_claim_proofs`, `security_dispatch_outbox` | Purpose-bound guest access/ownership/receipt grants and durable proof dispatch outbox. |
| 06 `2026_10_10_000003_create_identity_profile_audit.php` | `passenger_profiles`, `saved_travelers`, `audit_events` | Passenger profiles, saved travelers and append-only audit; exact accepted operation allowlist. |
| 07 `2026_10_10_000004_create_bootstrap_cleanup_indexes.php` | None; alters existing constraints/indexes | Indexes only for bounded anonymous-session cleanup; no new tables. |
| 08 `2026_10_11_000001_create_reference_aircraft_tables.php` | `reference_revision_control`, `aircraft`, `reference_revisions`, `reference_audit_events`, `seat_layouts` (view) | Atomic mandatory physical layout columns and generated capacity on aircraft; seat_layouts is a read compatibility view; immutable fleet revisions/audit. |
| 09 `2026_10_11_000002_enforce_route_safe_aircraft_ids.php` | None; alters existing constraints/indexes | Constraint only: aircraft.id is VARCHAR(64), case-preserving ASCII [A-Za-z0-9_-]{1,64}; identifiers are never renamed. |
| 10 `2026_10_11_000003_create_network_reference_tables.php` | `network_revision_control`, `reference_iana_timezones`, `airports`, `network_revisions`, `network_audit_events`, `routes` (view) | Immutable authentic IANA lookup; exact airport identities; routes derived through a view; revision/audit history. |
| 11 `2026_10_11_000004_create_meal_reference_tables.php` | `meal_revision_control`, `meal_options`, `meal_revisions`, `meal_audit_events` | Meal definitions, ordering/default control and immutable revision/audit history. |
| 12 `2026_10_11_000005_create_schedule_reference_tables.php` | `schedule_revision_control`, `schedules`, `schedule_revisions`, `schedule_audit_events` | Exact schedule IDs bounded by UTF-16 code units; days and structured exceptions in validated JSON columns; immutable revision/audit history. |
| 13 `2026_10_11_000006_create_editorial_publication_tables.php` | `editorial_documents`, `editorial_revisions`, `editorial_published_revisions`, `editorial_audit_events` | Slug/revision composite keys; immutable canonical JSON bytes and SHA-256; immediate-FK-safe publication pointers. |
| 14 `2026_10_11_000007_create_mvp_reservation_tables.php` | `mvp_services`, `mvp_reservations`, `mvp_reservation_submissions`, `mvp_reservation_passengers`, `mvp_reservation_seat_claims`, `mvp_reservation_seat_claim_history`, `mvp_reservation_mail_intents`, `mvp_reservation_audits` | Free confirmed/cancelled commemorative reservations; unique service/seat claims, immutable snapshots, owner/submission idempotency and release-on-cancel history. No ten-minute seat-hold workflow is introduced here. |
| 15 `2026_10_11_000008_create_mvp_mail_tables.php` | `mvp_mail_sentinel`, `mvp_mail_settings`, `mvp_mail_messages`, `mvp_mail_attempts`, `mvp_mail_resends` | Encrypted operator SMTP settings, durable messages/attempts/resend records and singleton control; truthful delivery states. |
| 16 `2026_10_11_000009_create_mvp_site_tables.php` | `contact_messages`, `contact_notes`, `contact_audits`, `mvp_site_documents`, `mvp_site_revisions` | Contact inbox/notes/audit and draft/published site settings with immutable revisions. |
| 17 `2026_10_11_000010_create_mvp_gallery_tables.php` | `gallery_documents`, `gallery_revisions`, `gallery_published_revisions`, `gallery_audit_events` | Gallery configuration documents and immutable published revisions/audit; preserves archive provenance rather than inventing media evidence. |
| 18 `2026_10_11_000011_create_security_smtp_attempts_table.php` | `security_smtp_attempts` | Unique per-outbox attempt marker with bounded retry count; separates committed send admission from external SMTP. |

---

## 3. Concurrency, Locking & Time Mechanics

1. **Transactional Sentinel Locking**:
   - Staff directory mutations use the seeded sentinel `staff_directory_control`; reference domains use their revision-control rows and editorial/gallery use document rows, all under `SELECT ... FOR UPDATE`.
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

The migration inventory above is reconciled directly to all 18 actual source files. Earlier worker prose named nonexistent tables and a nonexistent consolidation migration; this corrected record supersedes that prose. It does not alter any database implementation or historical test evidence.
