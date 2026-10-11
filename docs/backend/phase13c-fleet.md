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
