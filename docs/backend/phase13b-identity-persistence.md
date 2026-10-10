# Phase 13B Identity Persistence Specification & Catalog Evidence

This document records the design, schema catalog definitions, referential constraints, and verification evidence for the 13 inert persistence relations implemented under **Phase 13B Persistence02** (`phase13b_persistence02_20261010`).

---

## 1. Scope & Architectural Boundaries

Phase 13B Persistence02 delivers the durable relational prerequisites required to complete the accepted identity manifest without premature booking, payment, or flight operations functionality:

1. **Five Inert Domain Dependencies**:
   - `fare_products`: Commercial fare families with localized names, multipliers, cabin allowances, and terms.
   - `quotes`: 5-minute immutable price/fare quotes with composite checkout session integrity.
   - `capacity_holds`: 10-minute capacity reservations with composite hold/quote/session integrity.
   - `bookings`: Core booking persistence with immutable snapshots, PNR, security epoch, status, and contact fields.
   - `booking_passengers`: Authentic passenger records with same-booking infant linkage, request-local IDs, passenger index uniqueness, and deferred adult target validation.

2. **Five Remaining Identity Manifest Relations**:
   - `booking_guest_challenges`: Guest challenge/verification tokens with closed SQL UNKNOWN loophole for real challenges and decoy support.
   - `booking_guest_grants`: Time-bound guest access grants with strictly allowlisted operations and `scope_version = 1`.
   - `booking_receipt_grants`: Single-purpose confirmation/receipt retrieval grants.
   - `booking_claim_proofs`: Authenticated passenger booking claim proofs with strict state and timestamp equivalence.
   - `security_dispatch_outbox`: Transactional dispatch outbox with polymorphic single-target binding (`num_nonnulls = 1`) and payload scrubbing.

3. **Profiles**:
   - `passenger_profiles`: User-keyed personal profile with contact fields, meal/seat preferences, and optional registration title allowlist (`Mr`, `Mrs`, `Ms`, `Dr`).
   - `saved_travelers`: Companion travelers with opaque owner-scoped external IDs (`trv-...`), single-name support, and nullable calendar DOB.

4. **Append-Only Audit**:
   - `audit_events`: Immutable security and lifecycle audit log enforced by database triggers rejecting `UPDATE`, `DELETE`, and `TRUNCATE` under application SQL. Strictly allowlisted actions, exactly one actor choice, and metadata free of raw PII.

---

## 2. Relational Schema & Constraints Catalog

### 2.1 Domain Prerequisites (`2026_10_10_000001_create_identity_dependency_relations.php`)

#### `fare_products`
- **Primary Key**: `id VARCHAR(32)`
- **Columns**: `name_en VARCHAR(64)`, `name_ar VARCHAR(64)`, `multiplier NUMERIC(4,2)`, `checked_bags INTEGER`, `seat_selection_en VARCHAR(128)`, `seat_selection_ar VARCHAR(128)`, `changes_en VARCHAR(128)`, `changes_ar VARCHAR(128)`, `refund_en VARCHAR(128)`, `refund_ar VARCHAR(128)`, `flexibility_en VARCHAR(128)`, `flexibility_ar VARCHAR(128)`, `allowed_cabins TEXT[]`, `order_index INTEGER`, `is_active BOOLEAN`, `created_at TIMESTAMPTZ`
- **Constraints**:
  - `chk_fare_products_multiplier`: `CHECK (multiplier > 0)`
  - `chk_fare_products_checked_bags`: `CHECK (checked_bags >= 0)`
  - `chk_fare_products_order_index`: `CHECK (order_index >= 0)`
  - `chk_fare_products_allowed_cabins`: `CHECK (cardinality(allowed_cabins) > 0 AND allowed_cabins <@ ARRAY['economy', 'premium', 'business'])`

#### `quotes`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `checkout_session_id -> passenger_sessions(id) ON DELETE RESTRICT`
  - `fare_id -> fare_products(id) ON DELETE RESTRICT`
- **Unique**: `(id, checkout_session_id)`
- **Checks**:
  - `chk_quotes_cabin`: `CHECK (cabin IN ('economy', 'premium', 'business'))`
  - `chk_quotes_pax_count`: `CHECK (pax_count BETWEEN 1 AND 9)`
  - `chk_quotes_infant_count`: `CHECK (infant_count >= 0 AND infant_count <= pax_count)`
  - `chk_quotes_seat_count`: `CHECK (seat_count = pax_count - infant_count AND seat_count >= 1)`
  - `chk_quotes_service_ids`: `CHECK (cardinality(service_ids) > 0)`
  - `chk_quotes_base_minor`: `CHECK (base_minor BETWEEN 0 AND 9007199254740991)`
  - `chk_quotes_total_minor`: `CHECK (total_minor BETWEEN 0 AND 9007199254740991)`
  - `chk_quotes_currency`: `CHECK (currency = 'USD')`
  - `chk_quotes_expires_at`: `CHECK (expires_at > issued_at)`

#### `capacity_holds`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `(quote_id, checkout_session_id) -> quotes(id, checkout_session_id) ON DELETE RESTRICT`
  - `checkout_session_id -> passenger_sessions(id) ON DELETE RESTRICT`
- **Unique**: `(id, quote_id, checkout_session_id)`
- **Checks**:
  - `chk_capacity_holds_cabin`: `CHECK (cabin IN ('economy', 'premium', 'business'))`
  - `chk_capacity_holds_seat_count`: `CHECK (seat_count BETWEEN 1 AND 9)`
  - `chk_capacity_holds_state`: `CHECK (state IN ('active', 'attached', 'converted', 'released', 'expired'))`
  - `chk_capacity_holds_expires_at`: `CHECK (expires_at > issued_at)`

#### `bookings`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `(hold_id, quote_id, checkout_session_id) -> capacity_holds(id, quote_id, checkout_session_id) ON DELETE RESTRICT`
  - `quote_id -> quotes(id) ON DELETE RESTRICT`
  - `checkout_session_id -> passenger_sessions(id) ON DELETE RESTRICT`
  - `owner_user_id -> users(id) ON DELETE RESTRICT` (nullable)
  - `fare_id -> fare_products(id) ON DELETE RESTRICT`
- **Unique**:
  - `hold_id`
  - `pnr`
  - `(id, hold_id)`
  - `(id, total_minor, currency)`
- **Checks**:
  - `chk_bookings_security_epoch`: `CHECK (security_epoch >= 1)`
  - `chk_bookings_channel`: `CHECK (channel IN ('web', 'desk'))`
  - `chk_bookings_status`: `CHECK (status IN ('pending_payment', 'confirmed', 'compensation_pending', 'cancelled'))`
  - `chk_bookings_cabin`: `CHECK (cabin IN ('economy', 'premium', 'business'))`
  - `chk_bookings_total_minor`: `CHECK (total_minor BETWEEN 0 AND 9007199254740991)`
  - `chk_bookings_currency`: `CHECK (currency = 'USD')`

#### `booking_passengers`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `booking_id -> bookings(id) ON DELETE RESTRICT`
  - `(linked_adult_passenger_id, booking_id) -> booking_passengers(id, booking_id) ON DELETE RESTRICT`
- **Unique**:
  - `(id, booking_id)`
  - `(booking_id, request_local_id)`
  - `(booking_id, passenger_index)`
- **Partial Unique Index**:
  - `uq_booking_passengers_infant_adult`: `UNIQUE (booking_id, linked_adult_passenger_id) WHERE type = 'infant' AND linked_adult_passenger_id IS NOT NULL`
- **Checks & Triggers**:
  - `chk_booking_passengers_type`: `CHECK (type IN ('adult', 'child', 'infant'))`
  - `chk_booking_passengers_infant_link`: `CHECK ((type = 'infant') = (linked_adult_passenger_id IS NOT NULL))`
  - `chk_booking_passengers_no_self_link`: `CHECK (linked_adult_passenger_id IS NULL OR linked_adult_passenger_id != id)`
  - `trg_booking_passengers_adult_target`: Deferred constraint trigger validating that infants link to adult passengers in the same booking, and rejecting updates or deletions of adults that have infants linked.

---

### 2.2 Remaining Identity Relations (`2026_10_10_000002_create_identity_remaining_persistence.php`)

#### `booking_guest_challenges`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `booking_id -> bookings(id) ON DELETE RESTRICT` (nullable)
  - `session_id -> passenger_sessions(id) ON DELETE RESTRICT`
  - `user_id -> users(id) ON DELETE RESTRICT` (nullable)
- **Checks**:
  - `chk_booking_guest_challenges_state`: `CHECK (state IN ('issued', 'consumed', 'revoked', 'expired', 'exhausted'))`
  - `chk_booking_guest_challenges_expires`: `CHECK (expires_at > issued_at)`
  - `chk_booking_guest_challenges_consumed`: `CHECK ((state = 'consumed') = (consumed_at IS NOT NULL))`
  - `chk_booking_guest_challenges_purpose`: `CHECK (purpose IN ('manage_booking', 'claim_booking'))`
  - `chk_booking_guest_challenges_claim_user`: `CHECK (purpose != 'claim_booking' OR user_id IS NOT NULL)`
  - `chk_booking_guest_challenges_failed_attempts`: `CHECK (failed_attempts BETWEEN 0 AND 5)`
  - `chk_booking_guest_challenges_dispatch_status`: `CHECK (dispatch_status IN ('queued', 'accepted', 'failed', 'scrubbed'))`
  - `chk_booking_guest_challenges_epoch`: `CHECK (booking_id IS NULL OR security_epoch >= 1)`
  - `chk_booking_guest_challenges_real_epoch_not_null`: `CHECK (booking_id IS NULL OR security_epoch IS NOT NULL)` (Closes SQL UNKNOWN loophole)
  - `chk_booking_guest_challenges_code_digest`: `CHECK (code_digest ~ '^[0-9a-f]{64}$')`
  - `chk_booking_guest_challenges_pepper_version`: `CHECK (pepper_version >= 1)`

#### `booking_guest_grants`
- **Primary Key**: `id UUID`
- **Foreign Keys**: `booking_id -> bookings(id) ON DELETE RESTRICT`
- **Unique**: `token_digest`
- **Checks**:
  - `chk_booking_guest_grants_epoch`: `CHECK (security_epoch >= 1)`
  - `chk_booking_guest_grants_scope_version`: `CHECK (scope_version = 1)`
  - `chk_booking_guest_grants_expires`: `CHECK (expires_at > issued_at)`
  - `chk_booking_guest_grants_allowed_actions`: `CHECK (jsonb_typeof(allowed_actions) = 'array' AND jsonb_array_length(allowed_actions) > 0 AND allowed_actions <@ '["getBookingByRef","patchBookingContact","putBookingSeats","putBookingExtras","postCancelBooking","postCompleteCheckIn","postUndoCheckIn","getBoardingPasses"]'::jsonb)`
  - `chk_booking_guest_grants_token_digest`: `CHECK (token_digest ~ '^[0-9a-f]{64}$')`

#### `booking_receipt_grants`
- **Primary Key**: `id UUID`
- **Foreign Keys**: `booking_id -> bookings(id) ON DELETE RESTRICT`
- **Unique**: `token_digest`
- **Checks**:
  - `chk_booking_receipt_grants_epoch`: `CHECK (security_epoch >= 1)`
  - `chk_booking_receipt_grants_scope_version`: `CHECK (scope_version = 1)`
  - `chk_booking_receipt_grants_expires`: `CHECK (expires_at > issued_at)`
  - `chk_booking_receipt_grants_allowed_actions`: `CHECK (jsonb_typeof(allowed_actions) = 'array' AND jsonb_array_length(allowed_actions) > 0 AND allowed_actions <@ '["getBookingReceipt"]'::jsonb)`
  - `chk_booking_receipt_grants_token_digest`: `CHECK (token_digest ~ '^[0-9a-f]{64}$')`

#### `booking_claim_proofs`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `booking_id -> bookings(id) ON DELETE RESTRICT`
  - `user_id -> users(id) ON DELETE RESTRICT`
  - `session_id -> passenger_sessions(id) ON DELETE RESTRICT`
- **Unique**: `token_digest`
- **Checks**:
  - `chk_booking_claim_proofs_state`: `CHECK (state IN ('issued', 'consumed', 'revoked', 'expired', 'exhausted'))`
  - `chk_booking_claim_proofs_expires`: `CHECK (expires_at > issued_at)`
  - `chk_booking_claim_proofs_consumed`: `CHECK ((state = 'consumed') = (consumed_at IS NOT NULL))`
  - `chk_booking_claim_proofs_purpose`: `CHECK (purpose = 'booking_claim_proof')`
  - `chk_booking_claim_proofs_epoch`: `CHECK (security_epoch >= 1)`
  - `chk_booking_claim_proofs_token_digest`: `CHECK (token_digest ~ '^[0-9a-f]{64}$')`

#### `security_dispatch_outbox`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `user_verification_id -> user_email_verifications(id) ON DELETE RESTRICT`
  - `user_reset_id -> user_password_resets(id) ON DELETE RESTRICT`
  - `staff_invitation_id -> staff_invitations(id) ON DELETE RESTRICT`
  - `staff_reset_id -> staff_password_resets(id) ON DELETE RESTRICT`
  - `booking_challenge_id -> booking_guest_challenges(id) ON DELETE RESTRICT`
- **Checks**:
  - `chk_security_dispatch_outbox_num_nonnulls`: `CHECK (num_nonnulls(user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id, booking_challenge_id) = 1)`
  - `chk_security_dispatch_outbox_status`: `CHECK (status IN ('queued', 'accepted', 'failed', 'expired', 'scrubbed'))`
  - `chk_security_dispatch_outbox_accepted`: `CHECK (status != 'accepted' OR (provider_message_id IS NOT NULL AND accepted_at IS NOT NULL))`
  - `chk_security_dispatch_outbox_scrubbed_payload`: `CHECK (status NOT IN ('scrubbed', 'expired') OR encrypted_payload IS NULL)`
  - `chk_security_dispatch_outbox_attempts`: `CHECK (attempts >= 0)`

---

### 2.3 Profiles & Audit Persistence (`2026_10_10_000003_create_identity_profile_audit.php`)

#### `passenger_profiles`
- **Primary Key & Foreign Key**: `user_id UUID -> users(id) ON DELETE RESTRICT`
- **Columns**: `title TEXT`, `first_name TEXT`, `last_name TEXT`, `phone TEXT`, `seat_preference TEXT`, `meal_preference TEXT`, `newsletter BOOLEAN`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- **Checks**:
  - `chk_passenger_profiles_title`: `CHECK (title IS NULL OR title IN ('Mr', 'Mrs', 'Ms', 'Dr'))`
  - `chk_passenger_profiles_seat_pref`: `CHECK (seat_preference IS NULL OR seat_preference IN ('none', 'window', 'aisle'))`
  - Note: Non-empty name checks were intentionally excluded from `passenger_profiles` to match `UpdatePassengerProfileRequest` and `LocalPassengerRepository.updateAccount` contract fidelity where empty strings are permitted for optional name/phone fields on account profiles.

#### `saved_travelers`
- **Primary Key**: `id UUID`
- **Foreign Key**: `owner_user_id UUID -> users(id) ON DELETE RESTRICT`
- **Unique**: `(owner_user_id, external_id)`
- **Checks**:
  - `chk_saved_travelers_external_id`: `CHECK (length(trim(external_id)) > 0)`
  - `chk_saved_travelers_name`: `CHECK (length(trim(first_name)) > 0 OR length(trim(last_name)) > 0)` (Enforces at least one name for single-name passengers)

#### `audit_events`
- **Primary Key**: `id UUID`
- **Foreign Keys**:
  - `passenger_id -> users(id) ON DELETE RESTRICT` (nullable)
  - `staff_id -> staff_users(id) ON DELETE RESTRICT` (nullable)
- **Columns**: `realm TEXT`, `action TEXT`, `outcome TEXT`, `passenger_id UUID`, `staff_id UUID`, `is_system_actor BOOLEAN`, `request_id UUID`, `target_type TEXT`, `target_id TEXT`, `metadata JSONB`, `occurred_at TIMESTAMPTZ`
- **Checks**:
  - `chk_audit_events_realm`: `CHECK (realm IN ('passenger', 'staff', 'system'))`
  - `chk_audit_events_outcome`: `CHECK (outcome IN ('success', 'failure', 'denied'))`
  - `chk_audit_events_actor`: `CHECK ((realm = 'passenger' AND passenger_id IS NOT NULL AND staff_id IS NULL AND is_system_actor = FALSE) OR (realm = 'staff' AND passenger_id IS NULL AND staff_id IS NOT NULL AND is_system_actor = FALSE) OR (realm = 'system' AND passenger_id IS NULL AND staff_id IS NULL AND is_system_actor = TRUE))`
  - `chk_audit_events_action`: Allowlist of authentic OpenAPI identity operation IDs + documented bounded internal security events.
  - `chk_audit_events_target_type`: `CHECK (target_type IN ('user', 'staff_user', 'passenger_session', 'staff_session', 'booking', 'booking_challenge', 'booking_claim_proof', 'saved_traveler', 'security_dispatch', 'system'))`
  - `chk_audit_events_target_id`: Enforces `none` or NULL for system target, and UUID or NULL for non-system targets.
  - `chk_audit_events_metadata_object`: `CHECK (jsonb_typeof(metadata) = 'object')`
  - `chk_audit_events_metadata_no_pii`: `CHECK (NOT jsonb_exists_any(metadata, ARRAY['email', 'password', 'password_hash', 'token', 'token_digest', 'code_digest', 'digest', 'secret', 'otp', 'document', 'body', 'url', 'ip']))`
  - `chk_audit_events_metadata_keys`: `CHECK (metadata - ARRAY['attempt_count', 'failed_attempts', 'reason_code', 'revoked', 'consumed', 'is_new', 'version', 'count', 'status', 'epoch', 'success', 'code', 'error_code'] = '{}'::jsonb)`
  - `chk_audit_events_metadata_values`: Type-safe numeric guards (using `jsonb_typeof(metadata->'key') = 'number'` and `CASE` statements) verifying non-negative integers for count/epoch keys, boolean types for boolean keys, and bounded string lengths for reason/status/code keys.
- **Triggers (Immutability)**:
  - `trg_audit_events_prevent_mutation`: `BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION trg_audit_events_immutable()`
  - `trg_audit_events_prevent_truncate`: `BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION trg_audit_events_prevent_truncate()`

---

## 3. Verification & Evidence

- **Subprocess Worker Safety Boundaries**:
  - `ConcurrencyWorker.php`: Strictly guarded by process `APP_ENV === 'testing'`, configured `DB_TEST_DATABASE === 'gaza_gateway_test'` (strictly no fallback to dev DB), and live database verification (`SELECT current_database() === 'gaza_gateway_test'`) before announcing READY or accepting commands.
  - Safe Error Protocol: Emits only valid 5-character SQLSTATE codes and allowlisted constraint/trigger tags (`uq_booking_passengers_infant_adult`, `Cannot modify or delete adult passenger linked by an infant`, `Infant passenger must link to an adult passenger in the same booking`, etc.). Completely suppresses raw exception messages, SQL, bindings, DSNs, and credentials.
  - Subprocess Lifecycle & Escalation: `ConcurrencyWorkerProcess.php` invokes `[PHP_BINARY, $workerScript]` directly (no shell child), drains stderr safely without leaking, and uses a bounded graceful quit -> SIGTERM -> SIGKILL escalation before calling `proc_close`.
- **PHPUnit Suite**: `tests/Feature/IdentityPersistence/`
  - 31 tests, 284 assertions, 100% passing (`MigrationLifecycleTest`, `CatalogConstraintTest`, `DomainDependencyConstraintsTest`, `RemainingIdentityRelationsTest`, `ProfileAndAuditTest`, `ConcurrencyAndIntegrityTest`).
  - Covers migration lifecycle, catalog constraints, negative domain checks, negative identity manifest checks, profile/audit boundaries with safe numeric guards, genuine two-process concurrency barriers, and subprocess negative guard controls proving non-test environments and marker targets remain untouched.
- **Probe Script**: `php scripts/probe-identity-persistence.php`
  - Strict Preamble Guards: Requires process `APP_ENV === 'testing'`, configured `app.env === 'testing'`, connection `pgsql_test`, configured DB `gaza_gateway_test`, and live DB `gaza_gateway_test`.
  - 1/4: Catalog verification (13/13 relations, 58 manifest columns, 10 manifest constraints, 32 owned FKs / 56 total FKs).
  - 2/4: Fail-closed semantic probes (15 savepoint-isolated negative tests checking exact SQLSTATE and constraint tags without printing raw PII or exception details).
  - 3/4: Genuine two-process PostgreSQL concurrency barriers (3 tests: competing infant links, infant insertion blocking adult type mutation, adult type mutation blocking infant insertion with `pg_stat_activity` blocker PID assertions, safe allowlisted tag checks, and invalid final state checks).
  - 4/4: 3-Migration rollback and preservation verification (confirms all 15 core tables and 6 foundation tables preserved intact, all 13 persistence relations dropped, and cleanly re-applied targeting `pgsql_test`).
  - Fail-Closed Negative Verification: Running with `--simulate-missing-relation` proves a missing relation causes an immediate non-zero exit code (1) without false PASS.
- **Docker Isolation**: Project `gaza_gateway_phase13b_persistence02` on loopback `127.0.0.1:18091`. Internal PostgreSQL 17 with no exposed host DB ports and freshly generated local `APP_KEY`.

Codex independent bounded review (2026-10-10): full focused28 tests/278 assertions passed before tooling-only correction; after correction, focused9 concurrency/guard tests42 assertions passed on PHP8.4.26/PG17. Standalone probe passed13relations,58 manifest columns,10 manifest constraints,32 owned FKs,15 exact semantic negatives,3 true backend-lock races and owned3-migration rollback/reapply preserving15core+6foundation tables. Codex tightened nonblocking bounded worker input/output, observed-exit-only proc_close with bounded KILL wait, and exact check-constraint/trigger tags (prefix matching removed). Final standalone probe repeated after tag change and passed. No production routes, seeds, provider delivery or operational booking/inventory/payment implemented. Frozen core dependency excluded from commit. Prior worker results remain historical, not substituted for these checks.