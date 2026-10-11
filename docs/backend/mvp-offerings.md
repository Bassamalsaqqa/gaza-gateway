# Gaza Gateway MVP — Curated Schedules and Dated Offerings Reference Architecture

## Scope and Invariants

This slice implements the **W1 backend curated recurring schedule reference authority** and **pure dated offering projection** for Palestinian Airlines.

### Core Architecture Boundaries

1. **Empty Starting Authority**:
   - Production and local database start with empty tables.
   - No mock flight data, simulated terminal/gate/status figures, or prototype bookings are auto-imported.
   - All fixtures are synthetic test-only records with no claim that the airport is operational.

2. **Source Schedule Authority (`schedules`)**:
   - Stores recurring schedules with exact UTF-8 ID (<= 160 UTF-16 code units, no trimming, no case transformation, rejecting NUL and unpaired surrogate code points).
   - Route parameters use explicit opaque `sch1-<canonical base64url exact UTF8 ID>` to eliminate raw URI identifier ambiguity.
   - Route identity (`id`, `destination`, `direction`) is strictly immutable once created.
   - Recurring operating days are unique integers `0` (Sunday) through `6` (Saturday).
   - Planned departure and arrival times are valid Gregorian `HH:mm`.
   - Up to 100 exceptions per schedule, supporting legacy annotations and structured operational effects (`cancelled`, `time`, `aircraft`, `extra`).
   - Exception effects enforce date range bounds (`[from, until]`), operating weekday semantics, and non-coexistence rules (at most one time and one aircraft adjustment per date, no coexistence with cancellation or extra flights).

3. **Pure Dated Offering Read Projection (`offerings`)**:
   - Dated offering IDs follow deterministic versioned codec `svc1-<canonical base64url exact ID>-YYYY-MM-DD`.
   - Returns pure `OfferingDto` containing:
     - `id`, `scheduleId`, `date`, `number`, `direction`
     - `originCode`, `destinationCode`, `departTime`, `arriveTime`, `durationMinutes`
     - `aircraftId`, `aircraft`
     - `layout` (source physical geometry snapshot from `seat_layouts`)
     - `revisions` (`fleet`, `network`, `schedules` revision markers)
     - `classification`: `'commemorative'`
     - `priceMinor`: `0`
   - Explicitly omits all simulated operational claims (`gate`, `terminal`, `status`, `seatsLeft`, `capacity`, payments, commercial booking claims).
   - Inactive schedules, cancelled exceptions, non-operating weekdays without extra exception, inactive destination/base airports, or inactive/mismatched aircraft suppress projection and return 404.
   - Exposes standalone callable `OfferingResolver::resolve(id)` independent of HTTP for consumption by W2 inventory materialization.

4. **Concurrency and Global Lock Acquisition Order**:
   - Staff writes require persisted full MFA sessions with fresh re-authorization AFTER locks are acquired.
   - Strictly ordered lock hierarchy:
     1. Principal / session validation
     2. Fleet revision control lock (`reference_revision_control` FOR UPDATE)
     3. Network revision control lock (`network_revision_control` FOR UPDATE)
     4. Schedule revision control lock (`schedule_revision_control` FOR UPDATE)
     5. Schedule row lock (by sorted IDs)
     6. Re-authorization with fresh clock/session state
   - Re-creation of identical ID returns HTTP 409 Conflict.
   - Disjoint patches lock the existing row and merge safely.
   - Immutable route mutation attempts return HTTP 422 Unprocessable Entity.
   - No-op updates perform zero revision increments and zero audit insertions.
   - Transaction failure triggers automatic rollback leaving state clean.

## API Operations

| Method | Path | Authority | Required Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/schedules` | Public | None | List active recurring source schedules |
| `GET` | `/api/v1/admin/schedules` | Staff | `ops.view` | List full recurring source schedules |
| `POST` | `/api/v1/admin/schedules` | Staff | `ops.edit` | Create recurring schedule (returns receipt) |
| `PATCH` | `/api/v1/admin/schedules/{key}` | Staff | `ops.edit` | Update schedule by `sch1-...` key (returns receipt) |
| `GET` | `/api/v1/offerings` | Public | None | List active dated offerings for date |
| `GET` | `/api/v1/offerings/{id}` | Public | None | Get exact dated offering detail (404 if unavailable) |
