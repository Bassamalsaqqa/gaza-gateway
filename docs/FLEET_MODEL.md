# Fleet identity and booking seat authority — Phase 6B2B

Status: Complete / Accepted Source. Production remains owner-deployed Phase 6B2A: release `2751e22be91ad74eacc9213489a57a21baf04807`, source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`.

`FleetRepository` owns physical airframes and layouts in `gza.fleet.v1`: `{ schemaVersion: 1, revision, aircraft, layouts }`. Aircraft IDs are immutable; registrations are normalized uppercase and unique. There is no deletion command. Inactive aircraft cannot receive new assignments but remain resolvable on existing flights and schedules.

Seeds: `a320neo` / Airbus A320neo / PS-GZA, 28 A–F rows and 168 usable seats; `a321neo` / Airbus A321neo / PS-GZB, 33 A–F rows, blocked 33B/33E and 196 usable seats; `b737800` / Boeing 737-800 / PS-GZC, 27 A–F rows and 162 seats, inactive and without Premium. Capacity and supported cabins are derived from layouts, never independently edited. New aircraft start inactive with a 28-row A–F Economy-only layout and no extra-legroom rows.

Fleet writes serialize with a same-instance queue and origin Web Lock named `gza.fleet.v1`, reread inside the lock, validate the complete prospective aggregate and persist before adoption/notification. Missing storage exposes deterministic seeds without writing. Present malformed/unsupported storage fails closed; no automatic repair. Returned values are detached. Storage events invalidate the central Fleet query; Studio uses isolated memory.

Flight IDs, numbers, dates and routes are unchanged. `aircraftId` is additive to Flight, FlightOverride and Schedule. Known old names map only to the corresponding seeded identity; unknown legacy overrides clear unrelated base IDs and preserve display text. Changed/new Flight and Schedule assignments validate current Fleet at command time. Unchanged operational/status/gate/note edits do not require Fleet health. Schedule planning never materializes dated flights.

New bookings sample current Commercial and Fleet stores, re-resolve canonical effective flights inside the booking transaction, validate both legs' cabin/seat authority and seal `BookingSeatLayoutsV1` with per-leg geometry, aircraft metadata, Fleet revision and derived capacity. A committed submission replay still needs neither catalog. These separate stores offer snapshot-at-command-time semantics rather than multi-store server ACID; the committed booking snapshot and price are internally coherent.

Confirmed PNRs use their stored geometry. Snapshotless historical PNRs resolve frozen 28-row A–F, Business 1–4, Premium 5–10, Economy 11–28 geometry with legroom rows 5/11/12. Reads do not migrate; a real seat/check-in mutation seals the legacy layout. Drafts use current Fleet and reconcile changed equipment/layouts without cabin downgrade, retaining unrelated passenger/contact/Extras state and clearing only stale leg seats. No automatic equipment re-accommodation is implemented.

Fleet layout classifies a seat as standard or extra legroom by leg; the historical commercial pricing snapshot supplies its fee. Existing layout-less bookings retain the legacy row classification. Fleet/catalog edits cannot retroactively reprice an old PNR.

Physical flight identity, not booking leg role, defines seat occupancy. The public occupancy command permits only booking-reference exclusion, never outbound/inbound role filtering. Forward check-in uses `completeCheckIn()` exclusively; no generic check-in compatibility writer remains. Exact committed Schedule creation replay returns before consulting Fleet, without a write, revision bump or notification; first-time assignments still require current Fleet validation and an identity guard inside the Schedule transaction.

Occupancy has four distinct sources: nonexistent geometry, structural unavailable seats, deterministic flight-specific prototype occupancy and confirmed PNR seats derived from `gza.repo.v1`. Booking writers share the `gza.repo.v1` origin Web Lock and reread inside it; create/seat/check-in commands reject newly introduced cross-PNR collisions on either matching flight leg. Existing legacy collisions can retain their own seats; cancelled PNRs release derived occupancy. No seat inventory key, automatic `seatsLeft` decrement or server inventory exists.

AdminProvider retains only session-only destination configuration in OpsState. Phase 6B2C — Network & Dated-Service Materialization remains Planned / Unstarted; Phase 6C/7/7B remain unstarted.

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Source is the source-finalization commit containing this acceptance record. Its exact SHA is reported as `PHASE_6B2B_ACCEPTED_SOURCE` after commit and verified against main/feature local/origin parity; it is not embedded in its own commit.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C — Network & Dated-Service Materialization remains **Planned / Unstarted**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole remains incomplete.
