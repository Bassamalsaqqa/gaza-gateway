# Phase 6B2C2B implementation handoff

Status: **Implemented / Awaiting Independent Review**. Worker verification is evidence, not acceptance.

## Provenance and publication boundary

- Baseline and protected main: `412fc2b4f79e01da0607b5bca44e01d76156a634`.
- Feature: `phase6b2c2b/discovery-booking-cutover`; the publication handback supplies the resulting commit SHA. This document does not attempt to reference its own commit.
- Protected HostPapa: `2751e22be91ad74eacc9213489a57a21baf04807`.
- Production remains owner-deployed Phase 6B2A, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`.
- Phase 6B2B, C1 and C2A source remains accepted and intentionally unreleased. C2B and Phase 6B as a whole are not accepted as complete.

## Resolver

`LocalDatedServiceResolver` is one shared read model over the registry's ScheduleRepository and NetworkRepository. It writes nothing. `routeBasePriceByCode` reads the existing compiled merchandising fixture; Network, Schedule and Fleet do not acquire pricing fields.

Contract:

| Method | Meaning |
| --- | --- |
| `readSnapshot()` | Detached canonical Schedule/Network command-time input |
| `project(snapshot, date, { now }?)` | Accepted C2A pure projection with explicit route prices |
| `listCurrentFlights(date, direction?, { now }?)` | Current services only; direction uses Flight route fields |
| `searchCurrentFlights(origin, destination, date, { now }?)` | Current route candidate pool only |
| `resolveCurrentFlightById(id, { now }?)` | Parse exact `svc1` identity and project its Schedule/date; no compatibility fallback |
| `subscribe(listener)` | Schedule and Network change notifications with combined cleanup |

Missing Schedule storage uses its accepted seeds without writing. A valid empty collection produces no current services. Strict `listForDiscovery` distinguishes corrupt Schedule storage from the existing safe Admin history read. Corrupt Schedule/Network or missing merchandising price surfaces `CurrentFlightAuthorityError`; no legacy discovery fallback repairs or conceals the failure.

## FlightRepository

- Current search and `getCurrentFlightById` compose current materialization with canonical FlightOverride, never Booking-only or legacy Flights. Search is a candidate pool; booking consumers still enforce operational, party, Commercial and Fleet cabin rules.
- Monthly projection samples Schedule/Network and Repo state once per command, then computes bookability, party requirements and lowest effective fare per date.
- Operational boards combine current services, canonical Booking Flight snapshots (including cancelled PNRs), then actual override-relevant legacy Flights. Deduplication prefers those bases in that order, followed by the current override.
- Broad `getFlightById` prefers a current `svc1` base, otherwise an exact stored Booking snapshot. Legacy identity uses a Booking snapshot before the explicit frozen resolver. Other identities require a genuinely stored snapshot. A current-authority failure without a stored fallback remains an error.
- Planning deactivation/removal is not retroactive cancellation. A still-planned structured cancellation supplies a Cancelled base with the same ID; otherwise a booked snapshot preserves compatibility. FlightOverride remains the final operational overlay.
- Repo, Schedule and Network changes notify Flight subscribers; Query invalidation is centralized. `destroy()` removes subscriptions. There is no new polling layer.
- New overrides require a broadly resolvable base; synthetic IDs remain blocked. Reads preserve orphan records and `clearOverride` can remove them. Aircraft reassignment remains Fleet-validated; unchanged equipment does not couple operational-only edits to Fleet health.

## BookingRepository and drafts

Committed submission replay precedes Commercial, Fleet, Schedule and Network reads. For a new command, detached caller input supplies requested IDs only. The repository samples Commercial/Fleet and resolves current outbound/inbound services; the Repo transaction repeats replay protection and composes its freshly reread overrides before route/date, operational, capacity, cabin and seat validation. Internally coherent Flight, pricing and seat-layout snapshots plus total commit together.

Legacy IDs cannot create a normal new sale. Appearance Studio alone injects `IsolatedStudioFlightResolver` into its explicitly isolated in-memory registry, allowing legacy fixture simulation without persistent authority reads or writes. Persistent registries reject this fixture injection; Studio drafts retain their selected mock geometry. Synthetic capacity bookings remain blocked. Current service disappearance, planning inactivity, Network inactivity and cancellation reject without a PNR. Number/time/equipment changes on the same ID replace stale caller facts with current sampled facts. This is command-time composition across independent stores, not cross-store ACID.

Existing seat/check-in commands attempt current service resolution and otherwise use their canonical stored Flight, then transaction-current override. They do not require healthy current planning. Historical pricing and layout snapshots remain authoritative; no repricing, geometry migration or equipment re-accommodation occurs. Check-in timing uses the current effective planned departure when available; the accepted revised-departure timing rule is preserved.

Draft reconciliation clears noncurrent or legacy selections rather than translating IDs. Same-ID number/time/duration/price/equipment changes refresh the draft; Fleet reconciliation removes only invalid affected leg seats. Unrelated passengers, contact, extras and the other leg survive.

## Runtime surfaces

- Home board: repository loading/error/empty/current-plus-compatibility information; no raw fallback.
- Public Flights: repository board with localized authority errors.
- Shared FlightSearchForm, including Home and destination content pages: active canonical Network routes and bilingual reference labels, truthful failure/inactive state.
- Public Booking: current search, draft reconciliation and localized final-command failures.
- Counter Booking: active Network routes, current search and final repository validation.
- Admin Global Search: canonical Flight query; Flight failure does not suppress other result groups.
- Public Flight Detail: broad repository detail; a separate current-only lookup plus Fleet cabin, Commercial and operational rules gates new booking. Compatibility detail has an explanation and navigation, not a sale CTA.
- Flight Detail static head: generic EN/AR metadata for browser-local services; explicit legacy wrapper for legacy-specific metadata.
- Desk URL parser: structural current/legacy ID parsing, with downstream repository existence resolution.
- Admin Flight Detail: long technical service ID wraps safely and remains LTR.
- Admin Flight/Check-in lists, account trips, boarding pass, Manage, passenger and desk check-in continue through shared repository contracts and inherit current/compatibility resolution.

Durable source guards quarantine raw generators to data definitions, explicit legacy compatibility and isolated Studio fixtures. The accepted C2A codec/materializer, raw generator, Fleet and Network runtime implementations are unchanged.

## Durable proof

`tests/unit/dated-service-cutover.test.ts` proves opening seed Fleet layouts, both directions, current round trips, stable IDs with changed facts, route/date/cancellation/party/cabin failures, unknown equipment rejection, empty/corrupt authorities, replay before all corrupt external stores, old/new booked compatibility, cancelled-PNR board relevance, orphan protection, transaction override race, one planning read per monthly command, subscription cleanup and draft leg isolation.

The existing 48-flight/three-date frozen legacy fixture remains exact. The sellable matrix and new-sale tests now use Schedule-derived identities; historical compatibility and Studio fixtures retain their explicit boundaries. Existing Fleet seat races, snapshot and Commercial pricing tests remain in the full gate.

Mounted EN/AR checks 121–126 prove Schedule time and Network duration updates reaching a peer draft, real public booking and Admin aggregation, peer FlightOverride propagation, retirement without loss of the PNR, inactive-route content with disabled sale, structured cancellation on the same ID with no selectable booking result, authoritative empty storage, corruption without PNR/boarding-pass/other-domain failure, and untouched corrupt bytes. Check 127 exercises maximum accepted Unicode Schedule IDs on public/Admin detail at all three widths, generic bilingual metadata and LTR technical IDs. Check 128 covers ordinary EN/AR Studio seat geometry and completed memory-only legacy booking simulation against corrupt persistent stores.

## Local QA

Baseline before runtime edits: **873 tests / 167 suites**, **120/120 smoke on attempt 1**, typecheck zero errors, lint zero errors / 56 warnings.

Final unit gate before the Studio correction: **900 tests / 168 suites**, twice passed. After that correction, **901 tests / 168 suites** passed. Typecheck also passed after the Studio correction. Final lint: zero errors / 56 baseline warnings. Application and static builds passed; 46 static pages prerendered. HostPapa prepare and verify passed locally: **521 site files, 46 HTML, 24,426,291 bytes, 193 asset references, zero missing**. Source maps, PHP, local videos and prohibited source/development paths: zero. The temporary QA package was removed. Its control manifest recorded baseline HEAD because it was built from the uncommitted tested worktree; it is not a release or accepted production package.

Final focused C2B smoke attempt 6 passed **8/8**, including the new Studio isolation scenario. Full smoke attempt 3 passed **128/128** with zero failures. No runtime or test source changed after that tested tree. Documentation status guard passed 3/3; both working and staged diff checks passed. All 56 runtime/test Git blobs in the intended commit were verified against the tested worktree, and the staged file list exactly matched the 71-file inventory. The publication handback supplies commit/remote parity and GitHub check/status evidence separately.

Visual matrix: **72 cells**, 12 surfaces × EN/AR × 390/768/1440, captured twice; zero page overflow. All initial contact sheets and refreshed affected detail images were inspected. The durable maximum-ID check adds 12 detail/viewport/locale combinations. The matrix was captured before the later Studio-only correction; ordinary surface behavior and geometry were unchanged by that correction, and its isolated behavior is covered by mounted check 128. Screenshots, logs and matrix descriptors remain local QA evidence under `scratch/`, not committed release assets.

### Failure and retry ledger

- Focused domain attempts 1–7: unsupported Node strip-only constructor syntax; 16/18 (fixture check-in clock); 18/18; 23/24 (current timing defect); 34/36 (invalid override-capacity fixture and non-operating B737 date); 35/36 (incorrect zone property); 36/36. Runtime fixes removed constructor parameter properties and made check-in use effective planned departure. Fixture corrections kept the domain assertions.
- Full development unit attempts 1–8: 826/891, 877/891, 889/891, 890/891, 896/897, 897/897, 897/898, 898/898. Initial failures were obsolete new-sale legacy fixtures and cutover guards, then missing fixture imports/undefined inbound data; the 897-test failure exposed current check-in timing. The 898-test failure was an overly specific supplemental static-head source regex. Two subsequent full runs passed 900/900. After the Studio correction, full unit attempt 3 passed 900/901; its sole failure was a supplemental source guard expecting the old exact memory-factory expression. The guard was updated to require the explicit isolated fixture resolver, retaining behavioral isolation coverage. Full unit attempt 4 passed 901/901.
- Documentation focused attempts: 2/3 then 3/3, correcting a regex that crossed phase-section boundaries. Final focused domain/status run: 30/30.
- Development typecheck attempt 2 failed because the new current query key was placed on the wrong key object; corrected. Other development/final typecheck runs passed. Initial development lint had 57 warnings, including one new unnecessary memo dependency; corrected to the baseline 56. All application/static build attempts passed.
- Focused C2B smoke attempt 1 was interrupted after a stale static preview lacked the new CTA; an accompanying debug process was also interrupted. Standard application build does not refresh this harness's `dist/client`, so the actual HostPapa static build was run.
- Focused smoke attempts 2–5: 0/6, 0/6, 4/6, 6/6. Corrections: canonical fare fixture, accessible confirmation label including total, hidden status selector, wrong Content URL, unsupported board date query, alert text including retry, and test clock mismatch against SSR causing React hydration #418. No timeout was increased. Runtime between attempts 3/4 changed technical-ID wrapping; between 4/5 the Flight Detail sale CTA gained Fleet cabin validation. A later manual Studio probe found cleared legacy selections and no seat grid in ordinary Studio scenarios. A bounded isolated fixture resolver and Studio draft reconciliation boundary were added before the final rebuild and smoke rerun; normal current-sale authority remains strict.
- Full smoke attempt 1: **119/127**. Failed checks 10/28/30/39/41/44/69/98: legacy-ID date/number parsing; route query loading; legacy draft/new-sale fixtures; obsolete missing-PNR-Flight expectation; unsupported board date query and fixture weekday; artificial change event on an already-selected native Fleet option. Corrections preserved assertions and changed tests only.
- Focused check 69 initially failed to load because an inserted test selector contained accidental escape characters; syntax was corrected, then 1/1 passed. Fresh-context check 28 passed, and explicit isolated canonical-draft check 28 also passed; isolated check 30 passed. Arabic gallery check 47 passed after waiting for actual focus restoration within the existing five-second boundary.
- Full smoke attempt 2: **122/127**, failures 28/30/47/123/124. Shared root journey state contaminated route-console checks; they now own isolated browser contexts and canonical draft fixtures. Gallery focus assertions now await actual Radix focus restoration within the existing five-second boundary. The new cancellation assertions incorrectly expected no rendered row; they now verify the visible Cancelled service radio is disabled. No timeout was raised and no product source changed between full attempts 1 and 2. The later Studio runtime correction is disclosed above. Final focused attempt 6 passed 8/8; full attempt 3 passed 128/128, without further runtime/test edits. Tests are local evidence, not GitHub CI.

## Scope boundaries

No PNR, FlightOverride-key or draft identity migration; no hardcoded date cutover; no generated Flight store; no inventory ledger or seatsLeft decrement; no route-price persistence; no automatic equipment re-accommodation; no new route/static route; no backend/cross-device claim; no HostPapa branch movement, release commit or deployment; no Phase 6C/7/7B; no force push or history rewrite. Main remains protected at the baseline. Stop after feature publication for independent engineering review.

## Intended commit file inventory

71 files: 15 documentation files, 32 runtime files and 24 test/helper files. Generated assets, packages, screenshots, logs and pre-existing local agent/reference artifacts are excluded.

```text
PRODUCT.md
README.md
docs/ARCHITECTURE.md
docs/CANONICAL_REPOSITORIES.md
docs/COMMERCIAL_MODEL.md
docs/CONTACT_MODEL.md
docs/CONTENT_MODEL.md
docs/DATA_FLOW.md
docs/DATED_SERVICE_MODEL.md
docs/FLEET_MODEL.md
docs/NETWORK_MODEL.md
docs/PHASE_6B2C2B_HANDOFF.md
docs/SCHEDULE_MODEL.md
docs/SETTINGS_MODEL.md
roadmap.md
src/components/admin/admin-search.tsx
src/components/flight-search-form.tsx
src/lib/booking-draft/reconciliation.ts
src/lib/dated-services/compatibility.ts
src/lib/dated-services/legacy.ts
src/lib/dated-services/resolver.ts
src/lib/destination-reference.ts
src/lib/domain/booking.ts
src/lib/domain/check-in.ts
src/lib/domain/commercial-errors.ts
src/lib/domain/desk.ts
src/lib/domain/flight.ts
src/lib/i18n-admin.ts
src/lib/i18n-network.ts
src/lib/i18n-services.ts
src/lib/i18n.tsx
src/lib/repositories/booking-repository.ts
src/lib/repositories/flight-repository.ts
src/lib/repositories/keys.ts
src/lib/repositories/queries.ts
src/lib/repositories/registry.ts
src/lib/repositories/types.ts
src/lib/schedules/repository.ts
src/lib/schedules/storage.ts
src/lib/schedules/types.ts
src/lib/studio-flight-fixtures.ts
src/routes/{-$locale}.admin.bookings.new.tsx
src/routes/{-$locale}.admin.flights.$flightId.tsx
src/routes/{-$locale}.book.tsx
src/routes/{-$locale}.flight.$flightId.tsx
src/routes/{-$locale}.flights.tsx
src/routes/{-$locale}.index.tsx
tests/helpers/current-service-fixture.ts
tests/smoke/browser-smoke.mjs
tests/smoke/phase6a-commercial.mjs
tests/smoke/phase6b1-operations.mjs
tests/smoke/phase6b2b-fleet.mjs
tests/smoke/phase6b2c1-network.mjs
tests/smoke/phase6b2c2a-foundation.mjs
tests/smoke/phase6b2c2b-cutover.mjs
tests/unit/booking-draft-repository.test.ts
tests/unit/commercial-catalog.test.ts
tests/unit/dated-service-cutover.test.ts
tests/unit/dated-service-foundation.test.ts
tests/unit/fleet-booking-snapshots.test.ts
tests/unit/fleet-correction-01.test.ts
tests/unit/fleet-occupancy-collision.test.ts
tests/unit/legacy-freeze-baseline.test.ts
tests/unit/network-status.test.ts
tests/unit/passenger-repository.test.ts
tests/unit/phase5c-manage-checkin-boarding-pass.test.ts
tests/unit/phase6a-admin-commercial-desk.test.ts
tests/unit/phase6a-correction.test.ts
tests/unit/phase6b1-schedules.test.ts
tests/unit/repositories.test.ts
tests/unit/sellable-service-matrix.test.ts
```
