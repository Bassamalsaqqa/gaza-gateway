# Phase 6B2C2B Independent Review Correction 01

**Implemented / Awaiting Independent Review.** Local worker evidence does not constitute acceptance.

## Provenance

- Reviewed parent: `ff46f8e7ab606731be679eaedbada9e07d09e91a`.
- Feature: `phase6b2c2b/discovery-booking-cutover`.
- Protected main local/origin: `412fc2b4f79e01da0607b5bca44e01d76156a634`.
- Protected HostPapa local/origin: `2751e22be91ad74eacc9213489a57a21baf04807`.
- Production remains owner-deployed Phase 6B2A, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`.
- The final handback records the resulting commit without a circular self-reference.

## Findings resolved

1. `getBookingFlight(ref, leg)` resolves current service when available, otherwise that exact canonical PNR leg's snapshot. It rereads the Booking and FlightOverride after external resolution. Shared PNR hooks, Admin Booking Detail and account boarding passes use reference/leg cache keys. Broad public Flight lookup remains separate. Resolution performs no Booking migration/write. Pricing and layout remain the original Booking snapshots.
2. `getCheckInFlights(date)` supplies normal operational listings when healthy. On planning failure, it supplies confirmed station/date PNR compatibility plus an explicit localized planning warning. Its Booking/leg map supplies each row's own timing and seat-sheet Flight. It does not consult the old generator during failure. Public boards/search still fail closed; the canonical completeCheckIn command remains final authority.
3. `confirmedBookingFlightSnapshots` filters only board relevance. Historical snapshot extraction remains available for broad detail, while PNR-specific history uses its own leg. Cancelling the last confirmed PNR removes a retired compatibility-only board row. Valid explicit legacy override-only rows remain supported.

## Durable regressions

Focused Correction 01 tests create two actual PNRs on the same stable service ID before/after time, number and equipment changes. They prove own fallback, override composition, A320/A321 capacity snapshots, unchanged pricing/layouts, zero read writes, correct check-in eligibility and actual successful/rejected commands during retirement, Schedule corruption and Network corruption. Desk rows also use the correct PNR timing. If the independent Booking query refreshes before the desk map, a missing map entry uses that Booking leg rather than another PNR's selector snapshot; a regression proves this interim behavior. Confirmed/cancelled board relevance and cancelled own history are tested separately. Source guards supplement these behavioral tests.

Mounted EN/AR coverage exercises fresh desk loads against both corrupt stores, warning, enabled check-in, successful canonical commit, boarding-pass override and unchanged corrupt bytes, plus continued truthful new-sale failure. It also checks shared-ID PNR Manage/confirmation/boarding-pass/Admin detail compatibility and cancelled history.

## QA and attempt history

Local final gates: focused regressions **33/33** (including five Correction 01 tests); full unit suite **906/906 across 168 suites**; typecheck passed; lint **zero errors / 56 existing warnings**, with no new warnings. Application and HostPapa static builds passed (46 prerendered pages). HostPapa prepare/verify passed: **521 files, 46 HTML, 24,428,699 bytes, 193 references, zero missing**. Inventory also found zero source maps, PHP, local videos or prohibited development/source paths. The temporary QA package was removed; it was not a release candidate.

- Focused attempt 1: 29/33 passed; four new fixture setups omitted required passenger inputs. Corrected fixtures only. Attempt 2: 33/33 passed.
- Full unit attempt 1: 905/906 passed. The supplemental no-generic-check-in guard matched a query key named checkIn. Renamed that query key to desk; no generic writer was added and the guard was retained. Attempt 2: 906/906 passed.
- Full unit attempts 2, 3, 4 and 5: 906/906 passed across 168 suites. Focused attempts 3 and 4: 33/33 passed.
- Typecheck attempts 1, 2, 3 and 4 passed.
- Lint attempt 1: zero errors / 57 warnings, one new unstable empty-array memo dependency. Corrected to a stable empty collection. Attempts 2 and 3: zero errors / 56 existing warnings.
- Focused browser attempt 1: 0/4. Both PNR checks timed out waiting for arrival time on a boarding pass, which renders departure time. Both desk checks used an absent key from the wrong translation dictionary, yielding a non-specific button locator and strict-mode violation. Fixed these test-only assumptions without changing runtime or increasing timeouts. Attempt 2: **4/4**.
- The full smoke run includes all 128 prior checks plus four Correction 01 EN/AR checks. Full attempt 1 passed 132/132 against the first built runtime. During that run, final review added the missing-desk-map own-leg fallback and its unit assertion. Application/static builds and local package preparation/verification were repeated successfully; full attempt 2 is the final-runtime run. Full attempt 2 passed **132/132** on the final runtime. There were no failed full-smoke checks or raised timeouts in either full run. A subsequent test-only assertion waits for the empty-board message before checking absence, preventing an early loading-state pass.
- Twelve desk captures cover EN/AR, Schedule/Network corruption and widths 390/768/1440. Automated overflow assertions passed; representative captures at all three widths were visually inspected. Existing implementation matrix evidence remains historical.

## Exact correction file scope

- `docs/CANONICAL_REPOSITORIES.md`
- `docs/DATA_FLOW.md`
- `docs/DATED_SERVICE_MODEL.md`
- `docs/PHASE_6B2C2B_CORRECTION_01.md`
- `src/lib/dated-services/compatibility.ts`
- `src/lib/domain/desk.ts`
- `src/lib/i18n-services.ts`
- `src/lib/repositories/flight-repository.ts`
- `src/lib/repositories/keys.ts`
- `src/lib/repositories/queries.ts`
- `src/lib/repositories/types.ts`
- `src/routes/{-$locale}.account.boarding-passes.tsx`
- `src/routes/{-$locale}.admin.bookings.$ref.tsx`
- `src/routes/{-$locale}.admin.check-in.tsx`
- `tests/smoke/browser-smoke.mjs`
- `tests/smoke/phase6b2c2b-cutover.mjs`
- `tests/smoke/phase6b2c2b-correction-01.mjs`
- `tests/unit/dated-service-cutover.test.ts`
- `tests/unit/dated-service-cutover-correction-01.test.ts`

Scratch logs/screenshots and unrelated pre-existing untracked local files are excluded. BookingRepository command implementation, current resolver, new-sale discovery, identity codec, persistence schemas and historical worker handback were not changed. Both working and staged diff checks passed. GitHub status evidence is queried again after publication and recorded in the final handback; local execution is not CI.

The original implementation's full prior attempt ledger remains historical in [PHASE_6B2C2B_HANDOFF.md](PHASE_6B2C2B_HANDOFF.md); this correction supersedes its cancelled-PNR board relevance claim.

## Boundaries

No main/HostPapa movement, merge, release or deployment. No rebase, squash, amend, force push or history rewrite. No generated Flight store, current discovery fallback, new-sale legacy fallback, PNR/override/draft migration, pricing/layout migration, inventory decrement, equipment re-accommodation or Phase 6C/7/7B work. C2B remains awaiting independent review.
