# Schedule Model — Phase 6B1

Status: **Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`). Phase 6B1 is the current owner-confirmed production checkpoint: release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`. Git/source/release provenance was independently reviewed before deployment; no independent ChatGPT live-browser verification is claimed. Phase 6B as a whole remains incomplete.

## Planning authority

ScheduleRepository owns recurring browser-local planning entries. It does not generate dated flights, publish website schedules, alter booking search or change existing booking flight IDs. FlightRepository retains compiled departuresOn/arrivalsOn generation plus canonical overrides in `gza.repo.v1`. Exception kinds cancelled/time/aircraft/extra and their details are planning annotations only.

Admin Schedule Manager and destination-related panels share central repository queries. Admin Flights/Detail/Dashboard read effective FlightRepository records and canonical BookingRepository metrics. AdminProvider no longer holds a flight-override facade. Successful empty flight queries are authoritative; public UI never falls back to raw generated flights.

## Storage and transactions

Dedicated `gza.schedule.v1` envelope: `{ schemaVersion: 1, revision: number, schedules: Schedule[] }`. Missing key exposes deterministic compiled seeds without writing. Valid empty arrays are authoritative. An omitted revision normalizes to zero; negative, fractional or unsafe revisions are rejected. Every stored record and exception is validated; duplicate schedule/exception IDs and invalid calendar dates are rejected.

Malformed/unsupported or unreadable present storage yields an empty safe read and remains untouched. Writes fail with ScheduleStorageWriteError until deliberately repaired/removed; no implicit reset is provided. Mutations queue per coordinator, acquire an origin-wide Web Lock in browsers and reread canonical storage inside the lock. Browser writes fail safely without Web Locks. Explicit in-memory/Studio repositories work without browser storage or locks.

Candidates are validated and persisted before adoption/notification/success. Failed commits preserve canonical data, revision, user input and subscriber state. Identical create replay with the same draft ID returns the existing record without writing; conflicting reuse rejects. Identical updates and absent removals avoid writes/notifications. IDs are created once per new draft; retries retain identity. Same-tab subscribers invalidate scheduleKeys through RepositoryProvider; storage events refresh other same-origin tabs, including clear/removal. No server/cross-device synchronization.

## Contract and validation

Async list/getById/create/update/remove/subscribe. Reads return detached snapshots. Stable identities survive edits. Known compiled destination codes, unique weekdays, valid HH:mm times, from <= until, bounded aircraft/exception detail, boolean active, known exception kinds and unique IDs are domain rules. UI field errors are localized/associated/focused; storage errors are general alerts. ops.view reads and ops.edit mutates; no RBAC expansion.

## Remaining boundaries

Phase 6B1 extracted Schedules from mixed OpsState. On the Phase 6B2A feature branch, fares, cabin pricing, baggage, meals and assistance have their separate CommercialCatalogRepository authority. Aircraft/seat maps/destinations remain session-only; public seat geometry and destination data remain compiled reference authority. No gza.ops.v1, backend, database, SMTP, payment or GDS. No booking migration or flight-ID change.

Phase 6B2A is Implemented / Awaiting Independent Review. Phase 6B2B — Fleet & Seat Layout Authority and Phase 6B2C — Network & Dated-Service Materialization are Planned / Unstarted. Phase 6C/7/7B — Planned / Unstarted. Historical owner-deployed Phase 6A release was `b5cff4db4b6e087907a9733ffd841880439fbfdb`, runtime source `2ae1a876018992649074cbed1ebf0560e4da03ff`.

AdminProvider owns staff session / RBAC simulation and the remaining session-only mixed product/destination OpsState. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository is separate planning-only authority.

Dashboard operational and commercial repository loading/errors remain unavailable states, not successful empty metrics; independently healthy content/flight/booking panels remain usable. Quick Edit shares gate/time validation and separates field errors from storage failures. Responsive gate editors associate their own visible field errors with unique variant/flight IDs.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Implemented / Awaiting Independent Review** on `phase6b2a/commercial-catalog-authority`, based on `7586666fd4b65a6077ce9f1fa99581b61c6c532e`. Phase 6B1 remains Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). This feature is not accepted or deployed.

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff/RBAC simulation and session-only `OpsState` containing aircraft, seat maps and destinations. It does not own commercial catalog state or proxy flight overrides. Aircraft/seat maps remain session-only and do not control passenger seat geometry. FlightRepository IDs, capacity/geometry and ScheduleRepository planning-only semantics remain unchanged. Phase 6B is incomplete. Phase 6B2B — Fleet & Seat Layout Authority, Phase 6B2C — Network & Dated-Service Materialization, Phase 6C, Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, GDS or deployment.

Phase 6B2B — Fleet & Seat Layout Authority (Planned / Unstarted). Phase 6B2C — Network & Dated-Service Materialization (Planned / Unstarted).
