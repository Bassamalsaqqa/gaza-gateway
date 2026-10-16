# Gaza Gateway — Atomic Round-Trip Reservation Slice Specification

**Date:** 2026-10-16

**Audience:** Codex (Lead Engineer / Integration Coordinator), Frontend Worker, Guest Worker

**Repository Worktree:** `743741f`

**Hosting Target:** HostPapa shared cPanel (Laravel 13, PHP 8.4+, MySQL/InnoDB)

**Status:** Feature pack backend slice implemented, uncommitted, awaiting coordinator route merge and disposable gate verification.

---

## 1. Executive Summary & Architecture

This slice implements the **bounded backend atomic round-trip reservation** capability for Gaza Gateway (`gazaairport.com`), serving both authenticated passengers and upcoming guest sessions.

### Invariant & Architectural Principles:
1. **Thin Facade Over Canonical Authority**:
   - `ReservationTripCoordinator` acts as a pure atomic facade over the canonical `ReservationCoordinator`. It does not duplicate booking logic, seat claim management, departure boundary enforcement, or mail intent generation.
   - Invokes `$this->coordinator->createReservation(...)` for authenticated passengers and `$this->coordinator->createGuestReservation(...)` for guest sessions.
2. **Zero Schema Drift (No `trips` Table)**:
   - No migration, schema alter, or separate `trips` table is introduced.
   - Child submission IDs are derived deterministically via domain-separated RFC 4122 UUID v5 from the parent submission ID (`deriveChildSubmissionId`).
   - ACID atomicity is guaranteed through an outer `DB::transaction`. If leg 1 fails for any reason, all writes for leg 0 are completely rolled back.
3. **No Direct Lexical Calendar Comparisons**:
   - Calendar dates in service IDs belong to the origin airport's local timezone. Comparing service ID dates lexically is flawed because flights crossing midnight and timezones (e.g., AMM UTC+3 to GZA UTC+2) can depart on Jan 3 local time, arrive on Jan 2 local time, and have a valid return departing on Jan 2 local time.
   - Authoritative chronology is evaluated exclusively inside the atomic transaction against canonical frozen ticket flight snapshots (`arriveAt` and `departAt`), verified as strict RFC 3339 timestamps with explicit offsets.
4. **Isolated Integration Boundary**:
   - Existing classes (`ReservationCoordinator.php`, `ReservationCommand.php`, routes, providers, migrations, frontend) remain strictly unedited in this branch.
   - Exact 2 route integration lines are provided in `scratch/route-integration.txt` for the coordinator.

---

## 2. API Contract & Endpoints

### 2.1 Authenticated Round-Trip Endpoint
- **Route**: `POST /api/v1/reservation-trips`
- **Middleware**: `RequirePassengerReservationAuth`, `throttle:reservations_write`
- **Security Headers**:
  - `Cookie: gza_session=<passenger_cookie>`
  - `X-CSRF-TOKEN: <csrf_token>`
  - `Origin: https://<allowed_origin>`
  - `Content-Type: application/json`

### 2.2 Guest Round-Trip Endpoint
- **Route**: `POST /api/v1/guest-reservation-trips`
- **Middleware**: `RequireGuestReservationSession`, `throttle:reservations_write`
- **Security Headers**: Same CSRF and Origin protection under the verified guest session context.

---

### 2.3 Request Body Schema

The body shape is strictly bounded (max 64 KB, depth 32, closed shape with no unexpected root or nested keys):

```json
{
  "submissionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "contact": {
    "email": "traveler@example.com",
    "phone": "+970599000000"
  },
  "legs": [
    {
      "serviceId": "svc1-cHMxMDAtMjAyNi0xMi0yMA-2026-12-20",
      "passengers": [
        {
          "id": "p-1",
          "type": "adult",
          "firstName": "Tariq",
          "lastName": "Al-Khatib",
          "dob": "1990-05-14",
          "nationality": "PS",
          "document": "P12345678",
          "seatCode": "12A",
          "mealId": "meal-standard"
        }
      ]
    },
    {
      "serviceId": "svc1-cHMxMDEtMjAyNi0xMi0yMg-2026-12-22",
      "passengers": [
        {
          "id": "p-1",
          "type": "adult",
          "firstName": "Tariq",
          "lastName": "Al-Khatib",
          "dob": "1990-05-14",
          "nationality": "PS",
          "document": "P12345678",
          "seatCode": "14C",
          "mealId": "meal-standard"
        }
      ]
    }
  ]
}
```

#### Validation & Geometry Rules:
1. `submissionId`: Valid UUID (RFC 4122 format, normalized to lowercase).
2. `contact`: Valid RFC 5322 email (max 254 bytes), optional E.164-compatible phone (max 32 bytes).
3. `legs`: Exactly two elements.
4. `services`: Must be two distinct services (`legs[0].serviceId !== legs[1].serviceId`).
5. `passengers`: 1 to 9 passengers per leg, parsed through authoritative `ReservationCommand::parse`.
6. `passenger identity alignment`: Passenger count and identity fields (`id`, `type`, `firstName`, `lastName`, `dob`, `nationality`, `document`) must match exactly across both legs. `seatCode` and `mealId` may differ between outbound and return.
7. `opposite airports`: Outbound destination must match return origin, and outbound origin must match return destination (`origin0 === dest1 && dest0 === origin1 && origin0 !== dest0`).
8. `authoritative chronology`: Evaluated on canonical frozen ticket snapshots inside the transaction:
   - `arriveAt` and `departAt` must match `/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\z/` (fails closed on missing, non-string, or relative words).
   - Strict condition: `instDepart1 > instArrive0`. If equal or before, rejects with `422 validation_error`.

---

### 2.4 Response Contract

#### Success Response (`201 Created` if any leg is newly materialized; `200 OK` on full idempotent replay)
```json
{
  "success": true,
  "data": {
    "reservations": [
      {
        "reservation": {
          "id": "3b29ef5e-b248-4cb2-8d76-c561b3058869",
          "reference": "GZA-7K8P",
          "status": "confirmed",
          "serviceId": "svc1-...",
          "flightNumber": "PS100",
          "date": "2026-12-20",
          "originCode": "GZA",
          "destinationCode": "AMM",
          "departTime": "08:00",
          "arriveTime": "09:00",
          "contact": {
            "email": "traveler@example.com",
            "phone": "+970599000000"
          },
          "passengers": [ ... ],
          "createdAt": "2026-10-16T12:00:00Z"
        },
        "ticket": { ... }
      },
      {
        "reservation": {
          "id": "8e3c15d7-1335-4c07-8e01-d72ebf3a3a91",
          "reference": "GZA-9M2K",
          "status": "confirmed",
          "serviceId": "svc1-...",
          "flightNumber": "PS101",
          "date": "2026-12-22",
          "originCode": "AMM",
          "destinationCode": "GZA",
          "departTime": "14:00",
          "arriveTime": "15:00",
          "contact": {
            "email": "traveler@example.com",
            "phone": "+970599000000"
          },
          "passengers": [ ... ],
          "createdAt": "2026-10-16T12:00:00Z"
        },
        "ticket": { ... }
      }
    ]
  },
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

*Note: Internal `isNew` boolean is stripped from public output.*

---

## 3. Idempotency, Rollback & Tradeoff Analysis

### 3.1 Deterministic Child UUID Derivation
Child submission IDs are derived using domain-separated RFC 4122 UUID v5:
```php
$name = 'gza-reservation-trip:leg:' . $legIndex . ':' . strtolower($parentSubmissionId);
$hash = sha1(hex2bin('6ba7b8119dad11d180b400c04fd430c8') . $name);
```
- **Deterministic**: Network retries with the identical parent `submissionId` derive the identical child UUIDs.
- **RFC 4122 Compliant**: Version 5 (`0x50`) and Variant 1 (`0x80`) bit masks satisfy all database constraints.
- **Untrusted Proof Resistance**: Never incorporates user IDs or caller-supplied identifiers.

### 3.2 All-or-Nothing Atomic Rollback
- Process is wrapped in an outer `DB::transaction`.
- Leg 0 executes first; Leg 1 executes second.
- If Leg 1 fails for any reason (seat conflict, departure boundary, reference changed), the outer transaction rolls back immediately.
- All writes from Leg 0 (reservations, passenger rows, seat claims, claim history, submission records, mail intents, and audit records) are completely discarded.
- Database row counts remain strictly unchanged.

### 3.3 Replay Semantics
- **Identical Replay**: Submitting the identical command returns the original pair of reservations with HTTP `200 OK` without creating duplicate records or mail intents.
- **Changed Payload Conflict**: Submitting an identical `submissionId` with a modified payload (e.g., changed seat, passenger, or service) triggers `ReservationConflictException` (`409 Conflict`) without modifying existing data.
- **Post-Departure Replay**: Replaying an existing valid submission succeeds after departure because geometry is verified against frozen ticket flight snapshots rather than running pre-flight departure boundary checks.
- **Cancellation Replay**: If one leg has been cancelled, replaying the trip returns the original pair reflecting actual mixed statuses (`cancelled` and `confirmed`).

### 3.4 Tradeoffs of Avoiding a `trips` Table
- **Benefits**:
  - Zero database migrations on shared hosting.
  - Reuses existing single-leg reservation authority and ticketing invariants.
  - Exactly two logical mail intents generated in `mvp_reservation_mail_intents` (no sync SMTP).
  - No orphaned trip records if individual legs are cancelled independently.
- **Tradeoffs**:
  - No synthetic global "trip ID" entity.
  - Cancellation remains per-leg via existing routes (`POST /api/v1/reservations/{ref}/cancel` or `/guest-reservations/{ref}/cancel`).

---

## 4. Integration Instructions for Coordinator

The two route integration lines have been written to `scratch/route-integration.txt`:

```php
# Authenticated passenger route (under Route::middleware(RequirePassengerReservationAuth::class)->group(...))
Route::post('/reservation-trips', [\App\Mvp\Reservations\ReservationTripController::class, 'create'])->middleware('throttle:reservations_write')->name('postReservationTrip');

# Guest passenger route (under Route::middleware(RequireGuestReservationSession::class)->group(...))
Route::post('/guest-reservation-trips', [\App\Mvp\Reservations\ReservationTripController::class, 'createGuest'])->middleware('throttle:reservations_write')->name('postGuestReservationTrip');
```

---

## 5. Test Suite & Verification

The feature test suite is located at:
`backend/tests/Feature/MvpReservations/ReservationTripTest.php`

### Real Test Matrix (14 Atomic Trip Invariant Tests):
1. `test_authenticated_round_trip_happy_path_creates_both_legs_and_two_mail_intents`: Real account session, creates 2 reservations, 2 child submissions, 2 mail intents, seat claims.
2. `test_identical_replay_returns_original_pair_200_without_extra_writes`: Asserts row counts do not increment on identical replay.
3. `test_replay_with_changed_payload_rejects_409_without_writes`: Asserts 409 conflict and zero database changes when payload changes under same `submissionId`.
4. `test_cross_owner_proof_fail`: Proves User B cannot access or replay User A's reservations.
5. `test_timezone_crossing_round_trip_where_return_local_date_precedes_outbound_is_valid`: Tests outbound AMM Jan 3 00:00@+03 -> GZA Jan 2 23:55@+02 with return GZA Jan 2 23:59@+02 (using future winter dates: 2027-01-03 / 2027-01-02). Validates that parser does not reject on date lexical check, and coordinator accepts based on absolute UTC instants (21:59 UTC > 21:55 UTC).
6. `test_reversed_route_and_same_airport_fail_validation_422`: Asserts non-opposite airports fail with 422.
7. `test_return_depart_at_or_before_outbound_arrive_fails_validation_422`: Asserts equal/before instants fail with 422.
8. `test_second_leg_seat_collision_rolls_back_first_leg_completely`: Creates a real blocker reservation via canonical account API before the trip to claim return seat 2B; takes baseline counts; attempts trip with outbound 1A and return 2B (409 conflict); asserts complete atomic rollback of all Leg 0 writes while existing blocker remains untouched.
9. `test_payload_bounding_and_closed_shape_enforcement`: Tests 64 KB limit, unsupported media type (415), unexpected keys (422), passenger identity mismatch (422).
10. `test_guest_round_trip_happy_path_creates_null_owner_reservations_and_two_intents`: Full end-to-end guest flow (anonymous session -> challenge -> decrypt outbox OTP from `mvp_guest_mail_outbox` by `challenge_id` -> verify -> book), asserting `owner_user_id IS NULL`, 2 mail intents, replay idempotency.
11. `test_unverified_guest_fails_403`: Asserts unverified guest session is rejected with HTTP 403.
12. `test_cross_session_guest_cannot_replay_or_access_submission`: Proves guest submissions are scoped to `session_id`.
13. `test_guest_second_leg_collision_rolls_back_first_leg_completely`: Creates a real blocker reservation via canonical guest API before the trip; asserts atomic rollback for guest sessions with existing blocker untouched.
14. `test_guest_cancel_one_leg_and_replay_returns_mixed_status_pair`: Cancels one leg, replays trip, asserts original pair returned with accurate mixed statuses (`cancelled` and `confirmed`).

### Focused MySQL / PHP 8.4 Gate Execution:
```bash
# Focused gate execution against local disposable containers
env MYSQL_MVP_TEST_FILTER='ReservationTripTest|ReservationRoutesTest::test_post_reservation_(creation_and_idempotent_replay|replay_differing_fingerprint_returns_409|seat_occupied_returns_409)' node backend/scripts/run-mysql-mvp-gate.mjs
```
