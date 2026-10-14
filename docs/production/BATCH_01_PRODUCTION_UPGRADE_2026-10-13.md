# Batch 01: controlled production upgrade

> **Current operational authority — 2026-10-14:** recorded installed source is `b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87` with 21 migration identities; `main` is source authority. Follow the [operative full-stack upgrade guide](../HOSTPAPA_DEPLOYMENT.md) for the next release. Baseline-specific `7a8f0fa`/19→21 steps below remain historical preparation/evidence, not instructions to replay against the upgraded site. Reverify the actual installed baseline, preserve failures/backups and require explicit final owner GO. Never deploy the unrelated static branch.

## Owner directive and authority

The October 13 owner continuation supersedes the remote staging requirement in the Batch 01 checkpoint/master brief. No remote staging deployment is required. The release gate is exact-source local rehearsal, a non-destructive live preflight, verified private backups and an explicitly authorized, bounded production upgrade. The previous staging ZIP is not a production artifact.

The owner authorizes dependency-ordered source integration of PR #3, #4 and #5 into main, preserving all commits and review history. This does not invent independent GitHub approval, authorize a live deployment, or authorize database curation. Historical changes-requested reviews remain part of the record. Substantively corrected threads may be reconciled under this express owner instruction.

The owner retains responsibility for the account's one-minute cron policy and instructed Codex to leave it unchanged. Provider approval has **not** been independently established. HostPapa's [published resource limits](https://www.hostpapa.com/knowledgebase/de/detaillierte-uebersicht-nutzung-von-serverressourcen/) describe plan-dependent 10–30 minute minima. No second dispatcher, cadence change or unsupported compliance claim is permitted.

## Booking deadline correction

`ReservationCoordinator` no longer compares an origin-local service date with a UTC calendar date. The locked resolver supplies offset-bearing `departAt`; `ReservationDepartureBoundary` validates that timestamp and requires it to be strictly later than fresh database UTC time after all blocking domain/meal locks. Equality is closed. Missing/invalid instants fail closed. The existing IANA projection rejects nonexistent/ambiguous DST departure clocks. Client clocks and payload prices never become authority.

The owner-bound idempotency lookup precedes this new-booking deadline: a recorded reservation can still be retrieved by replay after departure or cancellation, without allocating another seat. Existing snapshots and reference-change conflict checks remain intact.

Focused coverage includes inbound New York evening departures after UTC midnight, already-departed Auckland tomorrow-local departures, spring/fall DST offsets, Kolkata's fractional offset, exact/microsecond boundaries, actual MySQL HTTP status and absence of new claims/submissions on rejection. Historical failed fixture runs are retained; they attempted immutable schedule changes or used unsynchronized synthetic session clocks, not weakened production safeguards.

## PR #3 substantive reconciliation

These are source corrections, not a claim that the reviewer independently executed the local evidence. The passing clean `bae5667` MySQL campaign and retained final-browser source hashes cover the unaffected implementation; the Batch 01 departure correction is separately tested. No broad identity/browser campaign is repeated merely to relabel evidence.

| Thread / initial comment | Current correction and evidence |
| --- | --- |
| 4242021786: aircraft ID round-trip | `FleetValidator`, additive DB grammar constraint, OpenAPI and frontend validation use exact 1..64 ASCII route-safe IDs. Original correction `5c0696a`; real HTTP/SQL negatives and create/read/patch/layout evidence retained. |
| 4242021789: fleet error contracts | Five fleet operations explicitly declare legitimate 409/422/404 and infrastructure errors; actual operation/status/content-type/schema negatives retained at `5c0696a`. |
| 4242324640: transitional paid/boarding routes | Active `mvp-reservations.openapi.json` and authenticated free routes replace legacy booking/hold/payment/check-in authority. Actual absence tests cover unregistered paths and global protocol denials; no payment route is enabled. |
| 4242519844: meal wrappers | `MealController` forwards the original flat object; closed validator rejects wrapped/contradictory/price commands. Correction `d6c40e3`, retained real HTTP evidence and MySQL campaign. |
| 4242519848: default/reorder aliases | Exact closed `{id}` / `{ids}` list commands; no `defaultMealId` or arbitrary keys. Same bounded correction/evidence. |
| 4242577730: CSRF error semantics | `mvp-client.ts` preserves trusted HTTP status/code, distinguishes abort/timeout and excludes upstream messages. Correction `34b4a0a`; 13 focused bootstrap negatives prove zero mutation dispatch. |
| 4242737342: recursive CMS closure | `EditorialValidator` validates nested document shapes for commands/public reads; corrupt stored publication fails closed. Correction `e3b20bf`, retained editorial tests and actual publication/browser evidence. |
| 4242737346: committed aircraft outcome | `FleetCreateCommittedError` preserves the committed immutable ID and enables refresh after failed layout GET, without retrying POST. Correction `e3b20bf`, client negatives retained. |
| 4243012109: real reservation budgets | Routes bind occupancy/read/write limiters after authenticated principal context. Real 429/shared-IP/principal tests and MySQL evidence retained. |
| 4243012111: cancelled replay headline | UI branches on persisted confirmed/cancelled state and omits confirmed printing for cancellation. Actual joined browser cancellation/replay evidence retained. |

## Issue #1: active free-MVP disposition

The Phase 12 models remain historical design evidence. They are not silently certified as implemented payment or release-registry services.

| Original finding | Free-booking MVP disposition |
| --- | --- |
| One active publication per environment | Runtime CMS uses an InnoDB primary-key document row with one published-revision pointer per slug, immutable revision rows, locks and expected-revision conflicts. Gallery/site settings have equivalent single-authority controls. The old environment-wide static-release activation API is unregistered. |
| Known inactive release leaks public content | Public CMS reads only the published pointer, never a requested draft revision. No `/publication-snapshots/{releaseId}` or legacy `/cms/publications/*` route is registered. A new real HTTP negative demonstrates that a known private draft revision cannot select public content. |
| Refund evidence not bound to refund | Payments/refunds/provider webhooks are excluded and unregistered. No charge, paid state or settlement is represented by the free reservation. The historical payment model is not repaired or shipped as a payment service. Reintroducing payments requires a separately approved scope and resolution of this historical finding first. |
| Lap infant/adult constraints | Lap infants are excluded. Active `ReservationCommand` accepts adults and children aged at least two, each with a physical seat, and rejects infant/linkage fields. Historical lap-infant DB design is not claimed as implemented; adding it requires a new approved scope. |
| Client boolean fabricates owner approval | Public API does not implement legacy deployment receipt/activation routes. CMS editorial publication is intentionally an RBAC `content.edit` action; infrastructure activation is a separate private, exact-source owner execution. A browser `ownerApproved: true` cannot authorize deployment and is rejected as an extra command field. |

These dispositions resolve active-MVP exposure; excluded historical designs must not be reused without their original findings. Keep the original issue body and review provenance, with an explicit disposition rather than deleting evidence.

## Permanent full-stack release workflow

`hostpapa-deploy` is unrelated legacy static artifact history. Never merge it into source or deploy its existing HEAD over the Laravel router. Main is source authority; generated ZIPs and private source/manifest pins are deployment authority.

1. Commit the reviewed source; build a **new** clean full-stack artifact with `https://www.gazaairport.com` production flags and locked no-dev Composer dependencies. Verify every manifested file/profile/source and archive integrity. Publish its immutable SHA-256 and source SHA separately from credentials.
2. Prepare a private cPanel upload kit. The upgrade runner reuses the installed shared configuration and existing private migration approval. No new database, password reset, SQL import or first-owner bootstrap is part of this upgrade.
3. Preflight is non-destructive: compare actual active `7a8f0fa` release pointer, original retained manifest and immutable installed bytes; verify production profile/database/runtime identity, current 19 migration identities, available tools/privileges, candidate hashes and backup capacity. An unexpected baseline stops the upgrade. Never substitute a guessed source or runtime account.
4. Only after final owner GO: hold upgrade/installer guards, exclude the existing cron through its real database-cache lease, enter canonical API maintenance, take private verified public/private and consistent database backups, then apply only migration UP (19→21) through the reviewed installer. Preserve all users, bookings, shared secrets, SMTP settings and editorial records. No schema reset or automatic live database restore.
5. Verify source/pointer, migration identities, preserved authority and readiness. Preserve sanitized receipts, backups and attempt markers. A failed marker is evidence, not an instruction to delete it and retry. The existing single pointer-following cron remains the dispatcher; no duplicate cron is installed.
6. After successful reviewed code activation and explicit authorization for curation: use the authenticated Admin **Schedules → Memorial timetable** preview. Inspect existing references/revisions, preserve owner edits, explicitly approve standby activation if necessary, publish the preview and verify 20 active destinations plus bookable core services in a fresh browser. No raw SQL import or copied staging records. Any partial failure requires a fresh preview before retry.

## Rollback and limits

Code/static rollback preserves shared configuration and database records. MySQL DDL autocommits; never automatically roll migrations down or import a backup into the live database. Before curation, rehearse rollback from 21-migration code to the retained previous release with the additive schema left intact.

After expanded reference data is published, the old seven-destination frontend/backend may be incompatible with the new data. A rollback must check compatibility and refuse that downgrade rather than delete owner content/bookings. In that state retain maintenance and use a reviewed forward repair or compatible release. Database disaster restore is a separate owner-authorized recovery, not a routine rollback.

The final handback must identify actual rehearsal results, immutable artifact checksums, remaining host-only facts and the exact cPanel upload/execution. This document alone is neither a passing receipt nor production authorization. No remote staging is requested.
