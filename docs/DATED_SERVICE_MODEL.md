# Dated-Service Model — Phase 6B2C2A

> **Current Source Status**: **Phase 6B2C2A Implemented / Awaiting Independent Review.** Production remains owner-deployed Phase 6B2A; Phase 6B2B release/deployment is intentionally pending. Phase 6B2C2B remains Planned / Unstarted.

Status: **Phase 6B2C2A Implemented / Awaiting Independent Review**. Historical completed phases:

- **Phase 6B2C1 Complete / Accepted Source** (accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`, accepted source `f5506a2ae467b2eb5b8182d7d5b009f258115eb4`).
- **Phase 6B2B Complete / Accepted Source** (accepted engineering SHA: `7f8a2bef613fa0cd37af4f05684c98aebe94d23e`, accepted source `d0a411cb8a882298eb32a3222478fbc782ba5556`).
- **Phase 6B2A Complete / Accepted Source / Accepted Release / Deployed by Owner** (current production: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`).

Phase 6B as a whole remains incomplete. Phase 6B2C2B — Network & Dated-Service Discovery Cutover is Planned / Unstarted. Phase 6C, Phase 7 and Phase 7B are Planned / Unstarted.

---

## Architecture & Responsibilities

Phase 6B2C2A establishes the pure domain foundation for projecting recurring `Schedule` definitions onto concrete calendar dates (`Flight` instances), coupled with structured date-specific operational effects.

### Separation of Concerns

1. **Schedule (`ScheduleRepository`, `gza.schedule.v1`)**:
   - Owns recurring weekly flight templates (`days: number[]`, `from: string`, `until: string`, `departTime: string`, `arriveTime: string`, `destination: string`, `direction: "out" | "in"`, `number: string`, `aircraftId?: string`, `aircraft: string`, `active: boolean`).
   - Owns date-specific exceptions (`ScheduleException[]`) with optional structured operational effects.
   - Does NOT generate flights, store flight instances, or alter public discovery in Phase 6B2C2A.

2. **Network (`NetworkRepository`, `gza.network.v1`)**:
   - Reference authority for destination identity, IATA codes, cities, countries, timezones, block minutes, and active route status.
   - Explicit input to dated-service materialization: route duration is strictly `network.blockMinutes` (never wall-clock timezone subtraction).

3. **Dated-Service Identity (`src/lib/dated-services/identity.ts`)**:
   - Pure, deterministic, versioned, URL-safe, reversible codec: `svc1-<base64url UTF-8 exact Schedule ID>-YYYY-MM-DD`.
   - 100% reversible: `parseDatedServiceId(datedServiceId(scheduleId, date)) === { scheduleId, date }`.
   - Invariant across Node unit tests and browser execution.
   - Independent of mutable presentation facts (flight number, departure time, equipment, gate, status).

4. **Pure Materializer (`src/lib/dated-services/materializer.ts`)**:
   - Pure function: `materializeScheduleOnDate({ schedule, network, date, basePrice, now? }): Flight | null`.
   - Pure function: `materializeSchedulesOnDate({ schedules, networks, date, routePrices?, defaultBasePrice?, now? }): Flight[]`.
   - Zero side-effects: no React hooks, no QueryClient, no `localStorage`, no repository imports.
   - Operational existence: requires `schedule.active === true`, `network.active === true`, `date` within `[from, until]`, and either a matching recurring weekday or an explicit `extra` effect.
   - Operational cancellation preserves the dated flight record with `status: "Cancelled"` and identical identity.

5. **Operational Simulation (`src/lib/dated-services/simulation.ts`)**:
   - Deterministic presentation facts (status, gate, terminal, seatsLeft, price adjustment) derived from `hashString(serviceId)`.
   - Mutable presentation changes do not change simulation seeds.
   - Temporal presentation uses reference timezone `Asia/Gaza`.

6. **Compatibility Boundary (C2A vs C2B)**:
   - In Phase 6B2C2A, live consumer discovery (Public Flights `/flights`, Home departures/arrivals, Flight Detail `/flight/$flightId`, Booking search `/book`, Admin global search) remains bound to the compiled legacy generator in `src/lib/data.ts` and canonical overrides in `gza.repo.v1`.
   - `FlightRepository` and `BookingRepository` remain frozen byte-identical to baseline.
   - Compatibility wrappers (`legacyDeparturesOn`, `legacyArrivalsOn`, `legacyFlightById`, `legacySearchFlights`) are exported from `src/lib/dated-services/legacy.ts` for future transition.
   - Phase 6B2C2B will perform the canonical cutover of public/booking discovery to the materializer.

---

## Identity Codec Specification

### Format

```
svc1-<base64url UTF-8 exact Schedule ID>-YYYY-MM-DD
```

- **Prefix**: `svc1-` specifies version 1 of the dated-service identity format.
- **Schedule ID Component**: Base64url-encoded UTF-8 representation of the exact `Schedule.id`. Supports full Unicode, punctuation, whitespace, and identifiers up to 160 characters without loss or collision.
- **Date Component**: Strict ISO 8601 calendar date (`YYYY-MM-DD`) validated against real Gregorian rules (leap years, month bounds, days 1-31).

### Reversibility & Validation

- `datedServiceId(scheduleId: string, date: string): string` validates input and encodes deterministically.
- `parseDatedServiceId(id: string): { scheduleId: string, date: string } | null` verifies canonical base64url encoding, valid ISO calendar date, and recovers the exact scheduleId. Non-canonical encodings, invalid dates, or malformed strings return `null`.
- `isDatedServiceId(id: string): boolean` tests whether a string conforms to the codec specification.

---

## Structured Effects & Lifecycle

### Schedule Lifecycle

- **No Destructive Delete**: `ScheduleRepository.remove`, `deleteSchedule`, and `useDeleteScheduleMutation` are removed. Future product commands cannot delete Schedules. Existing previously emptied stores are preserved without resurrection.
- **Retirement Mechanism**: Setting `active: false` is the sole retirement mechanism. Inactive schedules preserve their identity, history, and exceptions while being excluded from operational projection when C2B activates.
- **Empty Storage Authority**: Empty persisted arrays in `gza.schedule.v1` (`{ schemaVersion: 1, revision: N, schedules: [] }`) are fully authoritative and never resurrect compiled seeds.

### Exception Schema & Discriminator

`ScheduleException` is a discriminated union on `kind`:

1. **`cancelled`**:
   - `kind: "cancelled"`
   - `effect?: { cancelled: true }`
   - Preserves dated flight with `status: "Cancelled"`.

2. **`time`**:
   - `kind: "time"`
   - `effect?: { departTime: string, arriveTime: string }`
   - Overrides departure and arrival times for the specific date. Times must be valid `HH:mm`.

3. **`aircraft`**:
   - `kind: "aircraft"`
   - `effect?: { aircraftId: string, aircraft: string }`
   - Overrides equipment assignment with validated canonical Fleet equipment.

4. **`extra`**:
   - `kind: "extra"`
   - `effect?: { departTime?: string, arriveTime?: string, aircraftId?: string, aircraft?: string }`
   - Schedules an additional flight on a non-recurring weekday within `[from, until]`. Omitted fields default to the base Schedule.

5. **Planning Annotations**:
   - Records with `effect: undefined` are planning-only annotations.
   - Legacy stored records `{ id, date, kind, detail }` parse unchanged as annotations without operational power. Prose `detail` is never parsed for operational rules.

### Operational Effect Rules

- Effect `date` must fall within inclusive `[schedule.from, schedule.until]`.
- Exception `id` values must be unique within the Schedule.
- Only one operational effect of a given kind per date.
- `cancelled` and `extra` are mutually exclusive with each other and all other operational effects on the same date.
- One `time` and one `aircraft` effect may coexist on the same recurring operating date.
- `extra` is valid only on non-recurring weekdays (days not in `schedule.days`).
- Equipment assignments in `aircraft` or `extra` effects are validated against `FleetRepository` at mutation time: the aircraft must exist, be active, and possess a valid seat layout.

## Certified command and compatibility boundaries

Schedule command inputs are detached before awaiting dependencies or queued locks. New/changed structured equipment is validated through Fleet; unchanged historical equipment can survive inactive or corrupt Fleet. When a command replaces exceptions, the locked reread compares the entire canonical exception collection against its preflight baseline. Concurrent changes reject with `ScheduleIdentityConflictError`, preserving the newer collection without writing, incrementing revision or notifying subscribers; operator edits are not implicitly merged. Exact committed create replay bypasses both Fleet and Network and performs zero writes, revision increments or notifications.

Pure materialization resolves equipment identity in order: structured aircraft effect, structured extra equipment effect, explicit Schedule `aircraftId`, then the accepted exact known-name Fleet mapping (`Airbus A320neo` → `a320neo`, `Airbus A321neo` → `a321neo`, `Boeing 737-800` → `b737800`). Stored effect/Schedule display text is preserved. Unknown legacy names remain unresolved without an invented ID. This compatibility projection performs no Fleet repository read and no read-time Schedule migration or storage write.

The codec rejects unpaired UTF-16 surrogates and invalid/noncanonical UTF-8 tokens. Valid Unicode (including a leading BOM), punctuation and whitespace round-trip exactly in Node and browser execution. Gregorian years 0000 through 9999 use ISO parsing without Date.UTC's 0-99 year remapping.

Route merchandising price must be explicit: single projection requires basePrice; bulk projection requires a routePrices fixture/resolver or a caller-supplied defaultBasePrice. There is no invented default and no duration-derived price. Missing, negative or nonfinite prices fail with invalid_price. Duplicate Schedule identities in one bulk input fail with duplicate_schedule. Numeric now=0 is an explicit epoch clock; invalid clocks fail with invalid_clock. Gate A1-A8, terminal 1, seatsLeft 4-27 and price adjustment 0-60 (steps of 12) use an FNV-1a hash of service identity. Status also uses the reference date in Asia/Gaza. These are prototype simulation facts, not operational telemetry.

Extra time overrides are independently optional; omitted values resolve from the base Schedule at projection time. Enabling extra in Admin stores an empty effect, leaving those defaults unsnapshotted. Equipment overrides require a coherent Fleet ID/model pair. Legacy annotation dates outside the current effective range stay readable and are never automatically converted to effects. No arrival-after-departure constraint is invented for local wall times.

The frozen legacy generator produces multiple rotations that do not match recurring Schedule seeds. The seeds are not changed to simulate equivalence. C2B may legitimately change service counts and times when it activates Schedule discovery. Historical compatibility will be identity-based, with no hardcoded calendar cutover date. No PNR, override or draft IDs are migrated in C2A.

LocalStorage Schedule definitions are runtime-only and cannot participate in HostPapa static prerender head generation. C2A leaves Flight Detail heads unchanged; C2B may use generic static metadata for local dated-service IDs. There is no generated flight-instance store, backend or cross-device synchronization.
