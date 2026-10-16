# Search & Availability Implementation (Slice 2)

## 1. Overview
Slice 2 implements authentic commemorative flight search, round-trip selection, and calendar date alternatives across the homepage and `/flights` route. All availability computations execute against authentic backend schedule references without mock fallback, pretend dates, or ungrounded flight options.

---

## 2. API Contract & Wire Specification

### Endpoint
`GET /offerings/availability`

### Query Parameters
- `origin`: 3-letter uppercase IATA code (string).
- `destination`: 3-letter uppercase IATA code (string).
- `date`: ISO date `YYYY-MM-DD` (string).
- `days`: Integer between 1 and 60 (default: 28).

**Route & Query Invariants:**
- Exactly one of `origin` or `destination` must be `GZA`.
- `origin !== destination`.
- Invalid string types, non-numeric `days`, or query parameter arrays trigger a `422 Unprocessable Entity` response.

### Response Envelope
```json
{
  "origin": "GZA",
  "destination": "AMM",
  "date": "2026-10-16",
  "days": 28,
  "rangeStart": "2026-10-16",
  "rangeEnd": "2026-11-12",
  "availableDates": ["2026-10-16", "2026-10-19"],
  "offerings": [
    {
      "id": "offering_20261016_gza_amm_ps204",
      "scheduleId": "sch_ps204",
      "number": "PS 204",
      "aircraft": "Boeing 737-700",
      "capacity": 149,
      "originCode": "GZA",
      "destinationCode": "AMM",
      "date": "2026-10-16",
      "departTime": "14:30",
      "arriveTime": "15:45",
      "departAt": "2026-10-16T11:30:00Z",
      "arriveAt": "2026-10-16T12:45:00Z",
      "arrivalDate": "2026-10-16",
      "originTimezone": "Asia/Gaza",
      "destinationTimezone": "Asia/Amman",
      "flightDurationMinutes": 75
    }
  ]
}
```

### Strict Client Validation Invariants
The client schema (`offeringAvailabilityWireSchema` in `src/lib/offerings/schema.ts`) and query hook enforce:
1. **Route Coherence:** Envelope `origin` and `destination` must have length 3 and exactly one must be `GZA`.
2. **Range Integrity:** `rangeStart <= rangeEnd` and date span between 1 and 60 days.
3. **Offering Uniqueness:** All offering IDs in the array must be distinct.
4. **Endpoint & Range Match:** Every returned offering must match `offering.originCode === envelope.origin`, `offering.destinationCode === envelope.destination`, and `rangeStart <= offering.date <= rangeEnd`.
5. **Projected Timing:** Every offering must include projected ISO UTC timestamps (`departAt`, `arriveAt`), `arrivalDate`, and timezones.
6. **Available Dates Strictness:** `availableDates` must be sorted ascending, deduplicated, and match the exact set of dates in `offerings`.
7. **Cache Integrity:** If the returned envelope's `origin`, `destination`, `date`, or `days` do not match the query request, the query rejects with `new MvpApiError("protocol")`.

---

## 3. Frontend Architecture & Usability

### Search State & Round-Trip Selection
- **Trip Type Selector:** Accessible `<fieldset role="radiogroup">` with native radio buttons and `focus-within:ring-2`, providing keyboard navigation without orphan tab-panel warnings.
- **Enabled Query Guard:** Return availability hook `useOfferingAvailabilityQuery(..., { enabled: isRoundTrip })` ensures default one-way search never issues return queries to HostPapa shared hosting. Switching trip types cleanly aborts in-flight requests.
- **Fail-Closed Return Chronology (`isReturnChronologyValid`):**
  - Outbound and return legs must have different IDs (`outbound.id !== return.id`).
  - Route must be exactly reversed (`outbound.origin === return.destination && outbound.destination === return.origin`).
  - Missing or unparseable `departAt`/`arriveAt` fail closed (`false`).
  - `Date.parse(return.departAt) > Date.parse(outbound.arriveAt)` across airport timezones.
- **Round-Trip Navigation Contract:**
  - One-way: `/book?offering=<outboundId>`
  - Round-trip: `/book?offering=<outboundId>&returnOffering=<returnId>`
  - Round-trip booking button remains inactive until both valid legs are selected.

### Local Component Factoring & UX Refinement
- **`DateChipsStrip`:** Factored into a local component with `min-h-[44px] min-w-[44px]` tap targets meeting WCAG 2.2 AA mobile requirements, `focus-visible` outlines, and `<bdi dir="ltr">` date wrapping.
- **`OfferingCardRow`:** Replaces duplicated markup across exact and alternative cards for outbound and return legs, enforcing LTR `<bdi>` wrappers on all technical identifiers (flight numbers, IATA codes, dates, times, aircraft).
- **Copy Polish:** Replaced technical jargon ("server-published flight schedules") with customer-facing terminology ("available commemorative flight dates" / "مواعيد الرحلات التذكارية المتاحة"). Removed hardcoded "One passenger" metadata copy since checkout supports 1–9 passengers.

---

## 4. Verification & Test Inventory

### TypeScript Static Analysis
`npm run typecheck`
- **Result:** Exit code 0 (zero errors).

### Unit Test Execution
`node --test --experimental-strip-types tests/unit/offering-search.test.ts tests/unit/offering-local-time-contract.test.ts`
- **Suites:** 3
- **Tests:** 11 passed, 0 failed
- **Coverage:**
  1. `Offering local-date wire contract`: Validates rollover, untimed compatibility, and rejection of inconsistent date/duration.
  2. `Offering pure search logic`: Validates exact date filtering, calendar difference calculation, nearest ranked alternative dates, proximity ranking, cross-timezone return chronology enforcement, fail-closed handling on missing/identical/equal timing, and overnight rollover.
  3. `Offering availability wire schema`: Validates compliant payloads and rejects all invariant violations (mismatched endpoints, invalid ranges, unsorted dates, unprojected timings).

### Backend Feature Tests (Pending Coordinator Gate)
- **Test File:** `backend/tests/Feature/ReferenceSchedules/OfferingAvailabilityEndpointTest.php`
- **Guarded Setup:** Requires both `MVP_RESERVATIONS_GATE_OWNED=1` and `REFERENCE_GATE_OWNED=1` before `parent::setUp()` and database rollback.
- **Status:** **PENDING COORDINATOR RUN**. Not executed in this environment to avoid unauthorized database rollback.
- **Execution Command for Coordinator:**
  ```bash
  MVP_RESERVATIONS_GATE_OWNED=1 REFERENCE_GATE_OWNED=1 php artisan test --filter=OfferingAvailabilityEndpointTest
  ```

---

## 5. Bounded Known Limitations
1. **Backend Verification Status:** Database feature tests require coordinator gate execution with shared fixture ownership variables set.
2. **Two-Leg Booking Confirmation:** This slice passes both authenticated offering IDs (`offering` and `returnOffering`) to `/book`. The booking confirmation worker owns durable multi-leg persistence.
3. **Availability Range Bound:** Bounded to 1–60 days (default: 28 days) to conserve shared cPanel host resources while providing sufficient alternative date options.
