# Schedule Model — Phase 6B1

Status: **Phase 6B1 Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Production checkpoint is owner-deployed Phase 6B2A (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B as a whole remains incomplete.

## Planning authority

ScheduleRepository owns recurring browser-local planning entries. It does not generate dated flights, publish website schedules, alter booking search or change existing booking flight IDs. FlightRepository retains compiled departuresOn/arrivalsOn generation plus canonical overrides in `gza.repo.v1`. Exception kinds cancelled/time/aircraft/extra and their details are planning annotations only.

Admin Schedule Manager and destination-related panels share central repository queries. Admin Flights/Detail/Dashboard read effective FlightRepository records and canonical BookingRepository metrics. AdminProvider no longer holds a flight-override facade. Successful empty flight queries are authoritative; public UI never falls back to raw generated flights.

## Storage and transactions

Dedicated `gza.schedule.v1` envelope: `{ schemaVersion: 1, revision: number, schedules: Schedule[] }`. Missing key exposes deterministic compiled seeds without writing. Valid empty arrays are authoritative. An omitted revision normalizes to zero; negative, fractional or unsafe revisions are rejected. Every stored record and exception is validated; duplicate schedule/exception IDs and invalid calendar dates are rejected.

Malformed/unsupported or unreadable present storage yields an empty safe read and remains untouched. Writes fail with ScheduleStorageWriteError until deliberately repaired/removed; no implicit reset is provided. Mutations queue per coordinator, acquire an origin-wide Web Lock in browsers and reread canonical storage inside the lock. Browser writes fail safely without Web Locks. Explicit in-memory/Studio repositories work without browser storage or locks.

Candidates are validated and persisted before adoption/notification/success. Failed commits preserve canonical data, revision, user input and subscriber state. Identical create replay with the same draft ID returns the existing record without writing; conflicting reuse rejects. Identical updates and absent removals avoid writes/notifications. IDs are created once per new draft; retries retain identity. Same-tab subscribers invalidate scheduleKeys through RepositoryProvider; storage events refresh other same-origin tabs, including clear/removal. No server/cross-device synchronization.

## Contract and validation

Async list/getById/create/update/remove/subscribe. Reads return detached snapshots. Stable identities survive edits. Structural uppercase three-letter destination codes, unique weekdays, valid HH:mm times, from <= until, bounded aircraft/exception detail, boolean active, known exception kinds and unique IDs are domain rules. UI field errors are localized/associated/focused; storage errors are general alerts. ops.view reads and ops.edit mutates; no RBAC expansion.

## Network identity and command boundary

Schedule schema checks structural destination syntax without compiled destination imports. First-time creation uses the shared NetworkRepository to require an existing route; inactive routes are allowed for planning. Fleet remains the aircraft assignment authority. Exact committed create replay/conflict is resolved before external reads and repeated inside the Schedule transaction. Schedule id, destination and direction cannot change on update; create a new Schedule for a different route. Existing list and safe non-route edits do not require Network health.

## Remaining boundaries

Phase 6B1 extracted Schedules from mixed OpsState. In Phase 6B2A, fares, cabin pricing, baggage, meals and assistance have their separate CommercialCatalogRepository authority. In Phase 6B2B, aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`) with additive `aircraftId` linkage on schedules and flights. Network reference configuration uses NetworkRepository (`gza.network.v1`) in Phase 6B2C1; editorial/SEO and route pricing are excluded. No gza.ops.v1, backend, database, SMTP, payment or GDS. No booking migration or flight-ID change.

Phase 6B2A is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority is Complete / Accepted Source; Phase 6B2C2 — Network & Dated-Service Materialization is Planned / Unstarted. Phase 6C/7/7B — Planned / Unstarted. Historical owner-deployed Phase 6A release was `b5cff4db4b6e087907a9733ffd841880439fbfdb`, runtime source `2ae1a876018992649074cbed1ebf0560e4da03ff`.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository is separate planning-only authority.

Dashboard operational and commercial repository loading/errors remain unavailable states, not successful empty metrics; independently healthy content/flight/booking panels remain usable. Quick Edit shares gate/time validation and separates field errors from storage failures. Responsive gate editors associate their own visible field errors with unique variant/flight IDs.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner**, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`). FlightRepository IDs, numbers, dates, routes, and ScheduleRepository planning-only semantics remain unchanged, with additive `aircraftId` linkage. Phase 6B is incomplete. Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2 — Network & Dated-Service Materialization, Phase 6C, Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source). Phase 6B2C2 — Network & Dated-Service Materialization (Planned / Unstarted).

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2 — Network & Dated-Service Materialization remains **Planned / Unstarted**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole remains incomplete.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Implemented / Awaiting Independent Review.** Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; its release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: **Planned / Unstarted**. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole remains incomplete. See [NETWORK_MODEL.md](NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.
