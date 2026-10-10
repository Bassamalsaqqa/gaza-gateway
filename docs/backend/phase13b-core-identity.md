# Phase 13B Package 01 — Core Identity Persistence & Security Primitives

## Overview & Scope Boundary

Phase 13B Package 01 implements the foundational relational persistence and core security service primitives for authentication, sessions, and RBAC in Gaza Gateway (Palestinian Airlines / Yasser Arafat International Airport).

This package is strictly internal and foundational:
- **No HTTP endpoints, controllers, routes, or cookies** are exposed or altered in this package.
- **No frontend modifications** are made; client-side authentication continues using existing mock repositories.
- **No booking stubs or outbox tables** are created in this package. As specified in the bounded brief, the five booking-dependent or outbox tables (`booking_guest_challenges`, `booking_guest_grants`, `booking_receipt_grants`, `booking_claim_proofs`, and `security_dispatch_outbox`) are reserved for subsequent integration packages.
- **Accepted Phase 13A contracts and foundations are fully preserved.**

---

## The 15 Core PostgreSQL Relations

The migration `2026_10_09_000001_create_identity_core_tables.php` creates exactly 15 relations matching the normative manifest `docs/backend/identity-lifecycle.v1.json`:

1. `users`: Passenger account records with UUID PK, case-insensitive unique lower(email), status checks (`unverified`, `active`, `suspended`), and `credential_epoch >= 1`.
2. `staff_users`: Staff directory accounts with UUID PK, unique username, case-insensitive unique lower(email), role allowlist (`admin`, `editor`, `viewer`), lifecycle status checks (`invited`, `pending_enrollment`, `active`, `suspended`, `deactivated`), and active requirements (`email_verified_at`, `password_hash`, `mfa_version` must be non-null when active).
3. `staff_mfa_credentials`: Composite PK `(staff_id, version)` tracking confirmed and revoked MFA secrets with `version >= 1`.
4. `passenger_sessions`: Passenger sessions with UUID PK, unique 64-char `lookup_digest`, `auth_level` (`anonymous` | `full`), encrypted payload, absolute and idle expiration timestamps, and explicit full-session epoch constraints.
5. `staff_sessions`: Staff sessions with UUID PK, unique 64-char `lookup_digest`, `auth_level` (`anonymous` | `full`), composite FK to `staff_mfa_credentials`, and verified MFA timestamp checks for full sessions.
6. `staff_pending_auth`: Multi-attempt staged auth proofs (`login_mfa`, `enroll_mfa`) bound to staff anonymous sessions.
7. `user_email_verifications`: Single-use 32-byte opaque proofs for passenger email verification.
8. `user_password_resets`: Single-use 32-byte opaque proofs for passenger password recovery.
9. `staff_invitations`: Single-use 32-byte opaque proofs for staff onboarding.
10. `staff_password_resets`: Single-use 32-byte opaque proofs for staff password recovery.
11. `staff_mfa_replacements`: Staged candidate MFA credentials with step-up proofs and candidate version monotonicity (`candidate_version > prior_version`).
12. `staff_mfa_counter_consumptions`: Composite PK `(staff_id, mfa_version, counter_step)` preventing TOTP replay.
13. `staff_mfa_recovery_codes`: Single-use emergency recovery code digests bound to `(staff_id, mfa_version)`.
14. `staff_directory_control`: Singleton control table (`CHECK (id = 1)`) initialized with row `id = 1` and `mutated_by_staff_id = NULL` for serializing last-admin mutations.
15. `security_rate_limits`: Composite PK `(realm, operation_id, budget_id, key_digest, window_start)` with non-negative counts and valid windows.

### Circular Foreign Key & Rollback Dependency Order

- The circular foreign key constraint `fk_staff_users_mfa_version` (`staff_users(id, mfa_version) -> staff_mfa_credentials(staff_id, version)`) is applied after table creation.
- In migration rollback (`down()`), `fk_staff_users_mfa_version` is dropped first, and then tables are dropped in explicit reverse dependency order without `CASCADE` to avoid dropping unrelated future tables or constraints.

### Full-Session Credential Epoch Check Rationale

Under PostgreSQL standard three-valued logic (3VL), a check expression such as `auth_level != 'full' OR credential_epoch >= 1` evaluates to `UNKNOWN` when `auth_level = 'full'` and `credential_epoch IS NULL` (because `FALSE OR NULL` yields `NULL`/`UNKNOWN`). PostgreSQL CHECK constraints accept both `TRUE` and `UNKNOWN` (rejecting only `FALSE`).

To strictly enforce that full sessions must have a non-null `credential_epoch`, an explicit, non-contradictory constraint `chk_passenger_sessions_full_epoch_not_null` (`CHECK (auth_level != 'full' OR credential_epoch IS NOT NULL)`) is added alongside the accepted manifest check in both `passenger_sessions` and `staff_sessions`. Real database inserts verify that full sessions with NULL `credential_epoch` are strictly rejected.

---

## Security Primitives

### 1. Password Policy & Hasher
- **Unicode Codepoints**: Passenger passwords require 15..128 code points; staff passwords require 12..128 code points (measured via `mb_strlen($pwd, 'UTF-8')`).
- **Raw Byte Preservation**: Passwords are never trimmed, truncated, or normalized.
- **Encoding & Size Guards**: Rejects non-UTF-8 encodings and payloads exceeding 4096 bytes before hashing.
- **Local Denylist Floor**: Evaluates against a local common-password denylist. Production breached-password services remain gated and unconfigured.
- **Argon2id Hasher**: Configured with memory 65536 KiB (64 MiB), time cost 4, threads 1. Provides `hash()`, `verify()`, `needsRehash()`, and runtime `benchmark()` metrics.

### 2. Opaque Token Primitive (`OpaqueToken`)
- Generates 32 cryptographically random bytes via `random_bytes(32)`.
- Encoded using canonical unpadded Base64URL (RFC 4648 §5, yielding 43 characters).
- Computes SHA-256 digest (64 hex characters) which is the only value stored in PostgreSQL.
- Raw token secrets are redacted in all debug and string representations (`__debugInfo()`, `__toString()`).

### 3. Session Stores (`PassengerSessionStore` & `StaffSessionStore`)
- Bounded TTLs: Passenger full sessions (7 days absolute / 24 hours idle); staff full sessions (8 hours absolute / 60 minutes idle); anonymous sessions (30 minutes absolute / 30 minutes idle).
- Encrypted payloads: Uses Laravel `Encrypter` for CSRF tokens and session metadata.
- Read validation: Strictly verifies row locks, active account status, verified email, matching credential epoch, confirmed and unrevoked MFA status.
- Atomic rotation: Atomically locks the existing row (`FOR UPDATE`), verifies validity, marks `revoked_at = NOW()`, and mints an active successor row with a fresh token and CSRF token. Guarantees at most one active successor under concurrent rotation.

### 4. RBAC Policy (`RbacPolicy`)
- Canonical roles: `admin`, `editor`, `viewer`.
- Canonical permissions strictly allowlisted; unknown roles and permissions deny closed.
- Step-up verification: Validates that `mfa_verified_at` is non-null, not in the future, and within 300 seconds of current time.

### 5. Durable Rate Limiter (`DurableRateLimiter`)
- Uses `security_rate_limits` table with composite PK.
- Key material (subject, IP, session ID) is hashed using SHA-256 before storage.
- Atomic multi-budget charges: charges all matching budgets in a single transaction with stable lexicographical lock ordering; if any budget is exceeded, no budget commits an increment.
- Returns bounded, truthful `Retry-After` seconds.

## Independent review integration boundary

This is a bounded internal Phase 13B package; it does not establish complete authentication or production readiness. Native stored hashes require canonical 16-byte salt and 32-byte digest encodings. Rate-clock injection requires both runtime configuration and process environment to be testing. Recent step-up compares the exact persisted MFA instant, with age 300 seconds already expired. Lock-wait probes identify the exact child PostgreSQL backend and the parent blocker; output is bounded and exception messages are omitted. Owned children receive termination then kill if needed, and proc_close is called only after observing exit. No HTTP authentication, directory lifecycle, proof dispatch or remote operational gates are accepted by these primitive tests.
