# Phase 13B Identity Lifecycle Primitives Specification & Verification Evidence

This document records the architectural design, security boundaries, relational schema bindings, and verification evidence for the shared durable proof, transactional encrypted outbox, guest OTP digest, and append-only audit writer primitives implemented under **Phase 13B Lifecycle Primitives 04** (`phase13b_lifecycle04_20261010`).

---

## 1. Architectural Scope & Invariants

Phase 13B Lifecycle Primitives 04 delivers the shared security seams required for subsequent passenger, staff, and guest authentication flows without adding public HTTP routes, login flows, or domain mutations:

1. **Four Closed Proof Tables**:
   - `user_email_verifications`: passenger registration and email verification (TTL: 86,400s / 24h).
   - `user_password_resets`: passenger recovery (TTL: 1,800s / 30m).
   - `staff_invitations`: staff onboarding and enrollment (TTL: 86,400s / 24h).
   - `staff_password_resets`: staff recovery (TTL: 1,800s / 30m).
   - Closed mapping from `ProofPurpose` to target tables and principal keys; no caller-supplied generic tables.
   - 32-byte cryptographically random tokens (43 base64url characters). SHA-256 digest stored; zero raw secrets in database tables.
   - Strict lock hierarchy: Principal row `FOR UPDATE` -> Proof rows ascending ID `FOR UPDATE`.
   - Fresh validity & `clock_timestamp()` evaluation strictly after acquiring locks; exact equality expiry denial (`now >= expires_at`).
   - Automatic revocation on credential epoch or email snapshot alteration.
   - Exactly one success under two-process concurrent consumption replay.

2. **Transactional Encrypted Outbox (`security_dispatch_outbox`)**:
   - Exactly one of five concrete foreign keys per outbox record (`num_nonnulls = 1`):
     - `user_verification_id -> user_email_verifications(id)`
     - `user_reset_id -> user_password_resets(id)`
     - `staff_invitation_id -> staff_invitations(id)`
     - `staff_reset_id -> staff_password_resets(id)`
     - `booking_challenge_id -> booking_guest_challenges(id)`
   - Plaintext recipient, subject, body, and token strictly confined to bounded encrypted payload ciphertext.
   - Zero plaintext recipient/body columns in database schema, logs, or debug dumps.
   - Bound to original proof or challenge expiry deadline.
   - Local file mail sink returns `captured_locally`; outbox record strictly maintains `status = 'queued'`, leaving `provider_message_id = NULL` and `accepted_at = NULL`. Local capture is never reported as external delivery or provider acceptance.
   - Unconfigured remote provider fails closed with dedicated error code.
   - Deadline expiration erases ciphertext payload (`encrypted_payload = NULL`).
   - Owned local capture retention manager enforces bounded cleanup for files matching `^cap_[0-9a-f]{32}\.json$`.

3. **Guest OTP Helper & Versioned Pepper Ring**:
   - CSPRNG generation of exactly 6 decimal digits.
   - Versioned pepper ring enforcing >= 256 bits (32 bytes) per pepper secret. Rejects fallback to `APP_KEY` or default keys.
   - Strict domain separation message binding:
     `gza-guest-otp:v1:challenge_id={id}:purpose={purpose}:booking_id={bookingId}:session_id={sessionId}:epoch={epoch}:code={code}`
   - Constant-time verification using `hash_equals`.
   - Raw OTP codes and pepper secrets redacted from all debug, JSON, and string outputs.
   - Rejection of foreign recipient email overrides: delivery strictly to persisted booking contact email.
   - Guest OTP validation against versioned HMAC pepper ring required before outbox enqueue.

4. **Append-Only Audit Writer (`audit_events`)**:
   - Enforces closed allowed action allowlist (47 actions) and outcome enum (`success`, `failure`, `denied`).
   - Exactly one actor choice matching check constraints: `passenger`, `staff`, or `system`.
   - Unknown login subjects use system actor with zero identifier or IP disclosure (`target_id = 'none'`).
   - Pre-flight metadata validation strictly denies forbidden PII/secret keys (`email`, `password`, `token`, `otp`, `ip`, `url`, `body`, etc.) and unknown keys.
   - Numeric metadata keys constrained to integers within `[0, 2147483647]`. Closed string value allowlists.
   - Database triggers strictly reject `UPDATE` and `DELETE`.

5. **Correction & Hardening Refinements (L03.1 – L03.5)**:
   - **L03.1 Expiry Normalization**: In `ProofService::issue` and `reissue`, `$now` is normalized to authoritative whole-second precision via `CarbonImmutable::parse(...)->startOfSecond()`. Both database TIMESTAMPTZ persistence and returned `ProofIssuedReceipt` share identical second precision, eliminating false "Receipt expiry extension detected" rejections while retaining strict rejection of genuine forged extensions.
   - **L03.2 Canonical Lock Hierarchy & Guest Validation**: `OutboxDispatcher` enforces a preliminary non-authoritative candidate lookup followed by canonical lock order: Principal / Claim User `FOR UPDATE` -> Booking `FOR UPDATE` -> Bound Session `FOR UPDATE` -> Proof / Challenge `FOR UPDATE` -> Outbox `FOR UPDATE`. Live time is derived via `clock_timestamp()` strictly after acquiring locks. Stale/expired records are scrubbed (`status = 'scrubbed'`, `encrypted_payload = NULL`). `OutboxService::enqueueGuestChallenge` strictly validates session existence, expiry, purpose binding, epoch matching, and requires a configured >= 256-bit pepper ring.
   - **L03.3 Local Capture Retention Ledger Integration**: `OwnedCaptureRetentionLedger` integrates at the stable outbox dispatch boundary in `OutboxDispatcher`. Deduplicates dispatches prior to submission, records captures in private metadata ledger (0700 dir, 0600 files), erases obsolete prior capture files upon replacement, reconciles live DB status (revoked, consumed, scrubbed, expired) during cleanup, enforces 512 KiB / 500 entry bounds, and fails closed on malformed ledger data.
   - **L03.4 Privacy & Secret Hygiene Across All Channels**: `ProofConsumptionResult` emits finite outcome-derived failure messages, strictly redacting/rejecting arbitrary caller strings across all diagnostic, serialization, and reflection channels. `OutboxPayload` encapsulates subject in a private closure holder, redacting diagnostic channels while preserving genuine encrypted payload transport.
   - **L03.5 Bounded Processes, Fixture Guards & Concurrency Probes**: `ConcurrencyWorkerProcess` enforces 64 KiB I/O limits on command input and worker output. `LifecycleTestFactory` enforces strict `APP_ENV === 'testing'` and live `gaza_gateway_test` database guards before every synthetic write. Real two-process enqueue-vs-dispatch and consumption races verify zero `40P01` deadlocks and post-wait expiry rejection.

---

## 2. Docker Isolation & Verification Environment

Verification reuses the retained `gaza_gateway_phase13b_protocol02` PostgreSQL 17 service. Run short-lived `docker run --rm` PHP containers on `gaza_gateway_phase13b_protocol02_identity-protocol-internal`, mounting this workspace's `backend/` at `/var/www/html` and using `gaza-gateway-backend:phase13a`. Tests require `APP_ENV=testing`, `DB_CONNECTION=pgsql_test`, and the live database `gaza_gateway_test`. Run database-mutating checks serially.

The separate lifecycle Compose recipe is a worker artifact, excluded from integration. No additional persistent stack is required. The retained web/app/PostgreSQL stack does not run this excluded proof package.

---

## 3. Test Suites & Execution Evidence

1. **Unit Test Suite** (`backend/tests/Unit/IdentityLifecycle/`):
   - `OpaqueProofTokenTest`: Verifies canonical 32-byte opaque tokens, SHA-256 digests, and strict redaction across debug/serialization.
   - `GuestOtpHelperTest`: Verifies 6-digit CSPRNG, >= 256-bit pepper ring enforcement, domain separation, and constant-time verification.
   - `AuditWriterValidationTest`: Verifies pre-insert metadata validation, forbidden PII denial, numeric ranges, boolean types, and actor rules.

2. **Feature Test Suite** (`backend/tests/Feature/IdentityLifecycle/`):
   - `ProofLifecycleTest`: Verifies issue across 4 tables, reissue under principal lock, exact-equality expiry denial, credential epoch mismatch revocation, email mismatch revocation, purpose mismatch denial, raw vs digest denial, single-use replay prevention, and rollback preservation.
   - `ProofConcurrencyTest`: Genuine two-process PostgreSQL race with `ConcurrencyWorkerProcess` asserting backend row lock wait, 64 KiB input/output bounds, zero 40P01 deadlocks, and post-wait deadline expiry rejection.
   - `OutboxDispatchTest`: Verifies `num_nonnulls = 1` check constraint, encrypted payload privacy across 6 diagnostic channels, bound original expiry, local capture no-acceptance invariant, deadline ciphertext erasing, fail-closed unconfigured remote adapter, retention ledger cleanup at original deadline, guest challenge pepper ring verification, and outbox reconciliation/scrubbing.
   - `AuditEventsTest`: Verifies passenger, staff, and system audit logging, unknown login subject anonymization, database trigger immutability (`UPDATE` and `DELETE` rejection), and pre-flight PII rejection.

3. **Standalone Probe Script** (`backend/scripts/probe-identity-lifecycle.php`):
   - Comprehensive test runner executing all 5 lifecycle sections directly against test PostgreSQL with strict environment and current DB preambles.
   - Includes `--simulate-missing-proof` flag verifying fail-closed exit code 1 when catalog tables are missing.

---

## 4. Runtime Invocation Seams & Cleanup Frequencies

The lifecycle primitives define clear runtime execution seams for production queue workers and scheduled maintenance tasks:

1. **Outbox Batch Dispatch Seam (`OutboxDispatcher::dispatchBatch`)**:
   - **Invocation Target**: Background queue worker or scheduled dispatcher job.
   - **Recommended Frequency**: Every 10 to 30 seconds (or event-triggered on dispatch enqueue).
   - **Operation**: Extracts queued records in batches (up to 100), acquires canonical locks, validates current proof/challenge state, and dispatches via configured mail gateway. Deduplicates active captures against the retention ledger.

2. **Outbox Deadline Expiry Seam (`OutboxDispatcher::expireAndErase`)**:
   - **Invocation Target**: Scheduled maintenance task (cron).
   - **Recommended Frequency**: Every 60 seconds.
   - **Operation**: Queries records where `clock_timestamp() >= expires_at` and `status = 'queued'`, sets `status = 'expired'`, and permanently erases `encrypted_payload = NULL` to prevent retaining secrets past deadline.

3. **Owned Capture Retention Ledger Cleanup (`OwnedCaptureRetentionLedger::cleanupExpired`)**:
   - **Invocation Target**: Scheduled file cleanup job or post-dispatch maintenance hook.
   - **Recommended Frequency**: Every 60 to 120 seconds.
   - **Deadlines Reconciled**:
     - Guest OTP challenges: 10 minutes (600 seconds).
     - Password resets (passenger/staff): 30 minutes (1,800 seconds).
     - Email verifications and staff invitations: 24 hours (86,400 seconds).
     - State-based early revocation: Immediately purges capture files when the corresponding outbox record is marked `scrubbed` or `expired`, or when the underlying proof/challenge is `consumed` or `revoked`.
   - **Failure Handling**: If file unlinking fails, metadata entry is retained for retry to prevent orphaned files.


---

## 5. Correction 04 Hardening & Refinements (L04.1 – L04.5)

1. **L04.1 Mandatory Secret-Free Pre-Write Reservations & Dedicated Coordinator (`LocalProofCaptureCoordinator`)**:
   - Local proof capture cannot write raw secrets or tempfiles to disk before a durable reservation is recorded in `OwnedCaptureRetentionLedger`.
   - `LocalProofCaptureCoordinator` coordinates the bounded capture boundary under an exclusive file lock: deduplication check -> durable `reserveCapture()` -> write tempfile with `0600`, fflush, and fsync -> atomic rename -> `commitCapture()`.
   - If file writing fails at any point, `abortReservation()` safely removes the reservation or accounts for remnants if unlinking fails.
   - Eliminates nullable ledger bypass: `OutboxDispatcher` disallows public setter bypass (`setCaptureLedger` removed) and requires an owned retention ledger whenever local capture is performed.

2. **L04.2 Double-Deletion Remnant Tracking & Multi-File Accounting**:
   - When replacing an existing capture for an outbox item, if erasing the obsolete prior file fails AND erasing the new capture file also fails, BOTH raw files remain durably accounted for in the retention ledger under their original absolute deadline.
   - Relaxed `outbox_id` uniqueness in `loadLedger()` ensures multiple cleanup remnants per outbox record can be tracked simultaneously, while preserving strict uniqueness on `capture_id`.
   - Deadline extension is strictly rejected: all remnants expire at the original deadline.

3. **L04.3 Server-Created Capability Marker & Linux Case Preservation**:
   - Disposable test roots require explicit server-side capability marker `.gza_owned_test_root_marker` created via `OwnedCaptureRetentionLedger::createDisposableTestRoot()`, in addition to `APP_ENV === 'testing'` and live `current_database() === 'gaza_gateway_test'`.
   - A foreign directory sharing the test naming prefix without the capability marker is rejected immediately with `DispatchException` before `mkdir` or `chmod`, leaving foreign permissions unchanged.
   - Exact OS case semantics are preserved on Linux (`DIRECTORY_SEPARATOR === '/'`) without premature lowercase normalization.

4. **L04.4 Re-Entrant Ledger File Locking**:
   - `OwnedCaptureRetentionLedger::withLedgerLock()` tracks lock depth for re-entrant execution within the same instance, allowing `OutboxDispatcher` to hold the file lock across authority checks and DB transactions while nested coordinator operations safely execute without self-deadlock.

5. **L04.5 Total Lock Ordering & Two-Process Revocation Contention Proof**:
   - Total lock hierarchy for local capture: `Ledger File Lock -> PostgreSQL Row Locks (Principal -> Booking -> Session -> Proof -> Outbox)`.
   - Read-only cleanup avoids row locks, preventing deadlock or lock inversion hazards.
   - Verified via `ProofConcurrencyTest::test_real_two_process_reissue_revocation_vs_dispatch_blocks_and_scrubs`: Worker 1 reissues proof and holds principal row lock; Worker 2's `dispatchBatch` blocks on principal lock (verified via `pg_blocking_pids`); upon Worker 1 commit, Worker 2 unblocks, derives live time strictly after locks, observes revocation, scrubs outbox record, and writes zero mail captures.

## 6. Independent review status and durability limits

Codex independently reviewed the lifecycle correction and its focused runtime evidence. This package supplies **shared primitives only**; it does not establish Phase 13B completion or provide passenger/staff/guest HTTP flows. Subsequent Codex review corrected provider initialization order, bounded subprocess stdin/output handling, reservation-bound capture accounting, and inherited retention locking. The provider remains unregistered until the downstream HTTP package wires it deliberately.

Raw capture I/O runs in a direct PHP child with a monotonic deadline, bounded nonblocking stdin, bounded output, and TERM/KILL escalation. The child retains the parent's locked descriptor; if termination cannot be confirmed, accounting and the lock remain retained. Uninterruptible kernel I/O is outside a strict wall-clock guarantee. Checked file `fflush`/`fsync`, atomic rename, and pre-write reservations provide process-crash accounting; directory sync and power-loss durability have not been established. Remote delivery and provider acceptance remain deferred.

Independent results on the correction checkpoint are cumulative, not one uninterrupted final phase gate: original crash probes passed (3 tests, 5 assertions); the subsequent focused review passed 9 of 10 cases (27 assertions) with one fixture deadline-precision error; correcting that fixture and rerunning only the affected cleanup case passed (1 test, 3 assertions). After final child root/lock validation, the remaining focused gate passed (5 tests, 29 assertions), covering successful capture, sync failure, double-erasure retention, dispatch deduplication, and two-process PostgreSQL revocation contention. The final integrated Phase 13B gate and remote infrastructure evidence remain pending.

---

## 7. Review 07 Repairs: Fail-Closed Remote Dispatch & Authoritative Local Dedupe (O07.1 & O07.2)

Independent PR2 review 5480384367 and inline comments 4238809754/4238809755 identified two defects resolved under review repair task `phase13b_outbox_review07_20261010`:

1. **O07.1 Remote Path Fails Closed Before Submit I/O**:
   - `MailReceipt` models `captured_locally` exclusively; `STATUS_DELIVERED` does not exist and delivery semantics are not invented.
   - The incomplete remote-send branch in `OutboxDispatcher` has been removed. All unsupported non-local dispatch fails closed before `submit()`, payload decryption, or external network/disk I/O.
   - Local-mode selection strictly requires an accepted `LocalFileMailGateway` instance in addition to a non-null `OwnedCaptureRetentionLedger`. Providing an unsupported gateway with an explicitly supplied retention ledger fails closed without local capture masquerade, payload decryption, raw capture writes, or ledger file cleanup.
   - Unconfigured and unsupported gateways safely record bounded `ERR_UNCONFIGURED_PROVIDER` and leave outbox records marked `status = 'failed'` without claiming external delivery (`provider_message_id = NULL`, `accepted_at = NULL`).
   - Mock and spy gateways passed to `OutboxDispatcher` are never invoked (`submit()` calls remain exactly 0).
   - **Deferred Remote Gate**: Remote provider activation remains an explicit deferred architecture gate. Original immutable send identity, provider-side idempotency, durable acceptance receipt, ambiguous timeout/reconciliation protocol, and failure-after-acceptance tests are required before any future adapter activation. Local capture never sets `accepted`, `provider_message_id`, or `accepted_at`.

2. **O07.2 Authoritative Locked Local Dedupe & Durable Reconciliation**:
   - Ledger-only `hasActiveCapture()` fast return at the beginning of dispatch is removed, eliminating PostgreSQL authority bypass.
   - Local capture deduplication is placed strictly behind canonical row locks (Principal -> Booking -> Session -> Proof/Challenge -> Outbox) and authority revalidation using fresh database time (`clock_timestamp()`).
   - Stale, consumed, revoked, or expired proofs/outbox records cannot return a valid captured outcome; ciphertext is scrubbed (`encrypted_payload = NULL`) and raw capture files are erased through the durable ledger via `reconcileOutboxRevocation()`.
   - `reconcileOutboxRevocation()` enforces a bounded attempt budget (clamped to at most 100 entries) with round-robin fair ordering (`last_attempted_at ASC, expires_at ASC`). Failed erasures do NOT increment cleaned counts and remain durably accounted in the ledger marked `state = 'failed_cleanup'` and `revoked = true` under their original absolute deadline, preserving all unprocessed and failed entries for retry.
   - Bounded reconciliation of omitted or previously scrubbed/consumed/revoked entries runs during `dispatchBatch()` via `cleanupExpired()`, preventing orphaned raw captures without requiring a separate scheduler invocation for the dispatch run.
   - Total lock hierarchy (`Ledger File Lock -> PostgreSQL Row Locks`) is strictly preserved without lock inversion; dispatcher rejects caller transactions before any I/O.
   - Verified via focused test suite `OutboxAuthorityReviewTest` (`backend/tests/Feature/IdentityLifecycle/OutboxAuthorityReviewTest.php`), using isolated fixture tracking with reverse FK teardown (`security_dispatch_outbox` -> proof tables -> `users`) and disposable root cleanup including owned hidden files. `TestCase` base class was supplied by Codex and locally committed at `7022d81`.

Codex independently ran only this new nine-case suite on PHP 8.4.26 and the live guarded PostgreSQL 17 test database: six cases passed and three errored (60 assertions total). The errors exposed an omitted closure capture of the batch limit and a test using a nonexistent public proof-token property. Codex corrected those two defects, then reran only the three affected cases: **3 tests / 29 assertions passed**. Thus all nine cases have successful focused results across these runs; this is cumulative evidence, not one uninterrupted final phase gate. The reused read-only vendor tree's Composer lock SHA-256 matched the candidate exactly (`3ae3d6d401471c1abd293ca05d026869fb6c5c9c347b55461fddd2017326d0c5`). Test teardown left no outbox fixtures. Codex also hardened disposable root cleanup to reject unexpected leaves, report deletion failure, and retain its ownership marker until all capture/ledger leaves are removed. The passenger assignment was explicitly barred from shared database writes during these checks.

Reproduction after the local bootstrap: `APP_ENV=testing APP_DEBUG=false APP_URL=https://127.0.0.1:18090 DB_CONNECTION=pgsql_test ./vendor/bin/phpunit tests/Feature/IdentityLifecycle/OutboxAuthorityReviewTest.php`. Use the documented disposable PostgreSQL connection and locked dependencies. Production mail remains disabled; no remote provider acceptance, Phase 13B completion, or integrated final-head certification is claimed.
