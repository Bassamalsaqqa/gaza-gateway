# Phase 13C W1 — Network reference authority

Status: **Locally implemented / Focused verification passed / Bounded W1 complete** (2026-10-11). Baseline commit: `e769282c0c849978d046928f368218af8d20be2d`.

## Implemented boundary

Five canonical OpenAPI operations and derived route query are implemented:
- `getAirports` (`GET /network/airports`): public list of active network airports.
- `getNetworkRoutes` (`GET /network/routes`): public list of active derived bidirectional routes.
- `getAdminAirports` (`GET /admin/network/airports`): staff list of all network airports including inactive (`ops.view`).
- `postAdminAirport` (`POST /admin/network/airports`): staff addition of an airport to the network (`ops.edit`).
- `patchAdminAirport` (`PATCH /admin/network/airports/{code}`): staff modification of an existing airport (`ops.edit`).

Public reads show only active owner/staff-created records. The default frontend remains mock-backed until authorized cutover. Remote routes and exposure remain unactivated; routes are registered locally under `config('reference.enabled') === true`.

Airports enforce:
- Immutable identities: uppercase 3-letter IATA code, constrained strictly to the fixed base `GZA` and the seven accepted destination codes (`AMM`, `CAI`, `IST`, `DOH`, `DXB`, `JED`, `RUH`). Database triggers prevent modifying existing airport codes.
- Bilingual names: `airportName`, `city`, and `country` each require `{ en: string, ar: string }`, 1..160 characters, non-empty, and trimmed.
- Strict dual-layer IANA timezone validation: validated against PHP `DateTimeZone::listIdentifiers()` at coordinator level and enforced at the PostgreSQL layer via CHECK constraint calling `reference_valid_iana_timezone(tz TEXT)`.
- Turnaround and block duration: `blockMinutes` bounded strictly in 20..600 minutes. Note: base GZA `blockMinutes: 20` is a synthetic turnaround buffer required by schema integer constraints, not an authentic flight duration. The seven destination durations (`AMM: 55`, `CAI: 75`, `IST: 140`, `DOH: 180`, `DXB: 195`, `JED: 130`, `RUH: 155`) remain authentic flight durations derived from compiled network reference.
- Active/retirement state: boolean flag. Retired airports are omitted from public `/network/airports` listings while preserved in database authority, coordinator queries, and staff `GET /admin/network/airports`.
- Derived bidirectional routes: PostgreSQL VIEW `routes` derives `GZA -> destination` (`direction: 'out'`) and `destination -> GZA` (`direction: 'in'`) using the destination's configured `block_minutes`. The VIEW computes `(b.active AND d.active) AS active`. The public `/network/routes` endpoint returns active-only routes, automatically excluding routes connected to retired airports. Production starts empty; no live or prototype flights are fabricated.

Staff authorization and security boundaries:
- Reads on `/admin/network/airports` require authenticated staff session with `ops.view` permission.
- Writes reuse the persisted full-MFA staff session store and RBAC. Writing requires `ops.edit` permission.
- Unconditional HTTPS, exact allowed Origin header, and valid matching `X-CSRF-TOKEN` are enforced on mutations.
- Principal/session validation occurs both before and after acquiring the domain lock on `network_revision_control`, preventing stale/expired credentials from committing mutations.

Serialized domain revisions and immutable audit ledger:
- Separate bounded network ledger tables (`network_revision_control`, `network_revisions`, `network_audit_events`), completely decoupled from fleet tables.
- Updates are serialized via row-level locks on `network_revision_control` (no `expectedRevision` precondition in payload).
- Real no-op detection: empty or identity-preserving patches return existing state without incrementing revision or appending audit entries.
- PostgreSQL trigger `network_snapshot_digest()` enforces SHA-256 hash calculation over snapshot bytes.
- PostgreSQL trigger `network_history_immutable()` enforces append-only semantics on `network_revisions` and `network_audit_events`, rejecting `UPDATE`, `DELETE`, and `TRUNCATE`.

## Focused evidence

Command, with locked Composer vendor supplied via `REFERENCE_GATE_VENDOR`:

    node backend/scripts/run-reference-network-gate.mjs

Passing run: `gaza_network_gate_4f19c08440858384a0c34c87fff1dc0d`.

- PHP 8.4.26, PostgreSQL 17.11, PHPUnit 13.4.1.
- 16 network-only PHP/PostgreSQL feature tests, 256 assertions, zero failures and zero errors.
- Migration up, rollback of only the network migration (`--step=1`), reapply, and preserved identity principal.
- Source fixtures from `src/lib/data.ts` (base GZA) and `src/lib/destination-reference.ts` (7 destinations) create 8 airports and derive 14 bidirectional routes.
- Concurrent create race: two processes racing to create the same code yield exactly one 201 winner and one 409 conflict.
- Concurrent independent patches: disjoint patches to different fields of the same airport merge cleanly without lost updates.
- Session expiry while waiting for the domain lock returns 401 and prevents mutation.
- Direct SQL violations (mutating airport code, out-of-range blockMinutes, invalid timezones, deleting/truncating history) are blocked by database constraints and triggers.
- Injected audit failure rolls back airport modification, revision bump, and snapshot in a single atomic transaction.
- Actual kernel HTTP responses validate against intact OpenAPI 3.1 schemas and operation policies across all 5 network operations.
- 25 actual error contracts verified (400, 401, 403, 404, 409, 422, 429, 503) along with negative controls (undocumented status, wrong content-type, schema corruption).
- Contract verification: `node scripts/validate-backend-contracts.mjs` passed 100% across all 140 operations.
- Whitespace validation: `git diff --check` passed cleanly.

The run executed in disposable Docker containers (`postgres:17` with tmpfs and `php:8.4` testing container) on an isolated Docker network. All containers and network resources were cleanly destroyed (`resourcesCleaned: true`).

Local evidence is under `scratch/gaza_network_gate_4f19c08440858384a0c34c87fff1dc0d/`: `receipt.json`, source hashes, execution logs, `network.xml`, and `captures.json`.
