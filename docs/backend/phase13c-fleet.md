# Phase 13C C01 — Fleet reference foundation

Status: **Locally implemented / Focused verification passed / Phase 13C incomplete** (2026-10-11). Codex completed the bounded implementation directly at the owner's request. AGY's unfinished workspace was preserved; its partial handback is not recorded as accepted.

## Implemented boundary

Five existing contracts are implemented: public aircraft list and layout detail, plus staff aircraft create/patch and layout replacement. Public reads retain inactive historical references. The default frontend remains mock-backed. Routes are registered only in local/testing profiles; remote exposure is not activated.

Aircraft IDs are immutable, registration is normalized and case-insensitively unique, aircraft/layout creation is atomic, and physical capacity is database-derived. Layout validation covers complete cabin zoning, unique columns, aisle bounds, legroom rows and real unavailable-seat coordinates. Commands reject caller capacity and unknown fields. No real operating aircraft are seeded by migration; the three browser specimens are loaded only into the disposable test database.

Writes reuse the accepted staff session store and RBAC. Only a persisted full active/current-MFA staff session with ops.edit can write. HTTPS, exact allowed Origin and a raw matching X-CSRF-TOKEN are unconditional; Fetch Metadata does not waive them. Principal/session locks precede fleet control, aircraft and layout locks. Authority is rechecked after the domain-lock wait. Pending, anonymous, passenger, revoked, expired, epoch-stale and revoked-MFA authority cannot write.

Actual changes increment the locked fleet revision and append a complete snapshot and typed staff audit event in the same transaction. No-ops do neither. Snapshot bytes are preserved alongside JSONB; PostgreSQL derives SHA-256 over their UTF-8 bytes. Update/delete/truncate of revision and audit history are rejected. The existing identity audit vocabulary and applied migrations are unchanged. Future domains require expand-only migrations to widen the deliberately fleet-only control/audit constraints.

This is reference geometry, not inventory. Booked snapshots are not rewritten; commitment-aware equipment shrink belongs to Phase 13D and is not certified here. Database-owner/DDL privileges and remote admission/scheduler/provider obligations remain staging/exposure gates.

## Focused evidence

Command, with the existing locked Composer vendor supplied via REFERENCE_GATE_VENDOR:

    node backend/scripts/run-reference-fleet-gate.mjs

Passing run: gaza_fleet_gate_3f391140800288a32dd1ce230617df28.

- PHP 8.4.26, PostgreSQL 17.11, PHPUnit 13.4.1.
- 13 fleet-only PHP/PostgreSQL tests, 150 assertions, zero failures/errors.
- Migration up, rollback of only the new migration, reapply, and preserved identity principal.
- All three genuine source specimens and their 168/196/162 physical capacities; correct source default layout.
- Concurrent normalized-registration writes: exactly one 201 and one 409, without partial aircraft.
- Concurrent independent patches: both edits survive.
- A request demonstrably waiting on the fleet lock expires and returns 401 without mutation.
- Direct SQL geometry/identity/history violations are rejected; injected audit failure rolls back aircraft, layout and revision.
- Five actual kernel HTTP responses validate against intact accepted operation schemas; ten false-success/extra-field controls reject; operation policies match.
- Wrong realms/roles, missing Origin/CSRF, expired/revoked/stale authority and throttle/header controls pass.

The run uses a fresh randomly named PostgreSQL tmpfs instance with no published database port. Only run-owned PHP/PostgreSQL containers and network are removed. The retained Phase 13B stack is unchanged. Composer lock bytes match the accepted retained vendor workspace; no dependency changes were made.

Local evidence is under scratch/gaza_fleet_gate_3f391140800288a32dd1ce230617df28/: receipt.json, source hashes, logs, fleet.xml and captures.json. The receipt truthfully binds an uncommitted working-tree snapshot at baseline c7be134bfa87ef58dcfae142b770da639863e4b3, not a clean final SHA. Subsequent Git attestation must compare committed runtime/test/gate bytes with those hashes. Documentation is written after the run.

Earlier failed runs are retained, including trigger syntax/generated-expression failures, a JSONB key-order no-op defect, two invalid test fixtures and a stale PostgreSQL activity snapshot in the lock-wait probe. They are not passing evidence. No full identity, frontend or browser suite was rerun; no remote/provider/production certification is claimed.

## Remaining roadmap

C02 network/routes, C03 schedule/dated-service truth, C04 commercial authority, C05 opt-in frontend adapters and C06 final consolidated certification remain unfinished. The unknown operational fields in the accepted dated-service contract require a narrow architectural reconciliation before C03; fixture simulation must never fill them. Phase 13C requires independent acceptance before 13D. No merge, Actions, remote provisioning, HostPapa release change or deployment is authorized by this checkpoint.

## Committed-source attestation

Implementation checkpoint: 7dc51d8b7580f18e1c306b4436b818ee024f0a7f, direct child of c7be134bfa87ef58dcfae142b770da639863e4b3. Codex compared all 19 changed backend runtime/test/gate Git blobs with the passing receipt's SHA-256 source hashes; all match exactly. Subsequent checkpoint documentation changes do not alter those tested bytes. This is byte equivalence to the bounded local run, not a claim that the gate was executed from a clean committed checkout.

The existing Regression and Published static package workflows were checked and remain disabled_manually. Main remains c7be134bfa87ef58dcfae142b770da639863e4b3; the HostPapa branch remains a47afded49e900b75c907e7230ca4dfef5b3f91e. C01 is a feature-branch checkpoint for review, not a merge or completed Phase 13C handback.

## Independent review correction 01

Both findings from PR #3 review 5483755527 are addressed, pending reviewer confirmation; threads remain open. This correction does not claim C01 acceptance.

Aircraft IDs now use exact ASCII letters/digits/hyphen/underscore, 1..64 characters, consistently in PHP commands/lookup, an expand-only PostgreSQL CHECK, OpenAPI create/path/DTO schemas and frontend fleet validation. Existing a320neo/a321neo/b737800 and UUID/hex generated IDs are compatible. Unsafe supplied IDs are rejected, never trimmed/decoded/renamed. Existing unsafe PostgreSQL rows cause the new migration to fail; browser storage fails closed and preserves its original bytes, without seed overwrite.

The narrow five-operation contract amendment documents create/patch conflicts (409), invalid patches/path IDs (422), missing PUT targets (404), and canonical host/throttle/dependency/internal errors (400/429/503/500). Public GETs remain public: disallowed Origin receives no CORS permission, rather than a fabricated authorization failure. Unsafe staff writes still require exact Origin/CSRF. Unmatched methods/routes remain foundation 405/404 behavior outside the five registered operation contracts.

Passing fleet run: gaza_fleet_gate_416605a73086e01a92019bdd03f0cc05, with PHP 8.4.26/PostgreSQL 17.11: **15 tests / 258 assertions**. Captures now cover **5 successes + 30 actual operation/status error responses**, including duplicate create 409, invalid patch 422 and missing layout PUT 404. Every capture requires a declared exact status, JSON content type and its actual response schema; removing each captured error status, changing its content type or corrupting its envelope is rejected (90 error controls, plus ten success controls). IDs round-trip through actual create/GET/PATCH/PUT at mixed-case/underscore/64-character/numeric boundaries; separator/percent/query/fragment/control/whitespace/Unicode IDs fail HTTP and SQL. Migration rollback/reapply covers both new fleet migrations and preserves identity.

Additional focused checks: node --test --experimental-strip-types tests/unit/fleet-repository.test.ts — **39 passed**, including source compatibility and preservation of unsafe legacy storage bytes; node scripts/validate-backend-contracts.mjs — PASS (138 operations, exact policy parity); whitespace checks — PASS. No identity/full frontend/browser suites were run.

This gate binds proposed working-tree bytes against reviewed baseline 324d0c3136962b67978c7380356e59e9b0795ca0; it is not described as a clean-final-SHA execution. Its receipt, hashes, logs, JUnit and HTTP captures are preserved locally. Failed correction runs a2b05a77c0cab5bc1d8e95711e02dfa3, d01a0aaf72546de71b59cb4a649441db and 44ae58325ac5bd0bc96e12ea5ed147c7 are retained: host fixture, public-GET CORS expectation, and a pre-existing microsecond expiry-fixture race respectively. No middleware policy was weakened; expiry fixture timestamps now use a single PostgreSQL statement clock.

C02-C06 remain unfinished. Stop for C01 independent confirmation before C02. No Actions, merge, deployment, paid service, DNS or live authority cutover.
