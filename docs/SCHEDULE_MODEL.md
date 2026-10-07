# Schedule Model — Phase 6B1

> **Current Source Status**: **Phase 6B - Complete / Accepted Source / Accepted Release / Deployed by Owner.** Phase 6C - Admin Directory, Staff & Activity Convergence is **Complete / Accepted Source**. Phase 6 engineering implementation is complete; Phase 6 is Complete / Accepted Source, published to main at `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Production remains owner-deployed consolidated Phase 6B. The final Phase 6 static package is published; Phase 6C owner deployment is not confirmed. Phase 7 is Complete / Accepted Source at `6b0240f1692beecc3f030775c0a25a68758a279b`; Phase 7B is Implemented / Awaiting Independent Review. Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source.

Historical Phase 6B1 status: **Phase 6B1 Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Production checkpoint is owner-deployed Phase 6B2A (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B as a whole is Complete / Accepted Source.

## Planning authority

ScheduleRepository owns recurring browser-local definitions and explicit operational effects. The shared DatedServiceResolver projects these with canonical Network references and read-only merchandising prices into current `svc1-*` Flights. FlightRepository composes canonical `gza.repo.v1` overrides and keeps current-sale discovery separate from broad operational compatibility. Exceptions without an explicit effect remain planning annotations; validated cancelled/time/aircraft/extra effects drive current materialization. Existing Booking Flight IDs and snapshots are never migrated.

Admin Schedule Manager and destination-related panels share central repository queries. Admin Flights/Detail/Dashboard read effective FlightRepository records and canonical BookingRepository metrics. AdminProvider no longer holds a flight-override facade. Successful empty flight queries are authoritative; public UI never falls back to raw generated flights.

## Storage and transactions

Dedicated `gza.schedule.v1` envelope: `{ schemaVersion: 1, revision: number, schedules: Schedule[] }`. Missing key exposes deterministic compiled seeds without writing. Valid empty arrays are authoritative. An omitted revision normalizes to zero; negative, fractional or unsafe revisions are rejected. Every stored record and exception is validated; duplicate schedule/exception IDs and invalid calendar dates are rejected.

Malformed/unsupported or unreadable present storage yields an empty safe Admin history read and remains untouched. The strict `listForDiscovery()` read fails closed instead, so current discovery cannot treat corrupt storage as successful empty planning. Writes fail with ScheduleStorageWriteError until deliberately repaired/removed; no implicit reset is provided. Mutations queue per coordinator, acquire an origin-wide Web Lock in browsers and reread canonical storage inside the lock. Browser writes fail safely without Web Locks. Explicit in-memory/Studio repositories work without browser storage or locks.

Candidates are validated and persisted before adoption/notification/success. Failed commits preserve canonical data, revision, user input and subscriber state. Identical create replay with the same draft ID returns the existing record without writing; conflicting reuse rejects. Identical updates avoid writes/notifications. Destructive Schedule removal is no longer exposed; active=false retains identity. Previously persisted empty stores remain authoritative. IDs are created once per new draft; retries retain identity. Same-tab subscribers invalidate scheduleKeys through RepositoryProvider; storage events refresh other same-origin tabs, including clear/removal. No server/cross-device synchronization.

## Contract and validation

Async list/listForDiscovery/getById/create/update/subscribe. No destructive remove command. Reads return detached snapshots. Stable identities survive edits. Structural uppercase three-letter destination codes, unique weekdays, valid HH:mm times, from <= until, bounded aircraft/exception detail, boolean active, known exception kinds and unique IDs are domain rules. UI field errors are localized/associated/focused; storage errors are general alerts. ops.view reads and ops.edit mutates; no RBAC expansion.

## Network identity and command boundary

Schedule schema checks structural destination syntax without compiled destination imports. First-time creation uses the shared NetworkRepository to require an existing route; inactive routes are allowed for planning. Fleet remains the aircraft assignment authority. Exact committed create replay/conflict is resolved before external reads and repeated inside the Schedule transaction. Schedule id, destination and direction cannot change on update; create a new Schedule for a different route. Existing list and safe non-route edits do not require Network health.

## Remaining boundaries

Phase 6B1 extracted Schedules from mixed OpsState. In Phase 6B2A, fares, cabin pricing, baggage, meals and assistance have their separate CommercialCatalogRepository authority. In Phase 6B2B, aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`) with additive `aircraftId` linkage on schedules and flights. Network reference configuration uses NetworkRepository (`gza.network.v1`) in Phase 6B2C1; editorial/SEO and route pricing are excluded. No gza.ops.v1, backend, database, SMTP, payment or GDS. No booking migration or flight-ID change.

Phase 6B is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (deployed production release: `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source: `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6B consolidated Phase 6B1, Phase 6B2A, Phase 6B2B, Phase 6B2C1, and Phase 6B2C2 (6B2C2A & 6B2C2B). Historical production releases include Phase 6B2A (release `2751e22be91ad74eacc9213489a57a21baf04807`, source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, engineering `1c5e6b6259add7b59199725f6b23324e8d1c58eb`), Phase 6B1 (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`, engineering `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), Phase 6A (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`, source `2ae1a876018992649074cbed1ebf0560e4da03ff`, engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`), and Phase 5D (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`).

Phase 6C — Admin Directory Staff & Activity Convergence is **Complete / Accepted Source**; Phase 6 engineering implementation is complete; whole Phase 6 becomes Complete / Accepted Source once this finalization is independently reviewed and published to main. Phase 7 and Phase 7B remain Planned / Unstarted. Deployment was owner-confirmed (HTTP 200 confirmed live; no independent live bundle verification claimed).

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository owns recurring planning and structured effects; DatedServiceResolver now projects current service discovery from Schedule and Network authority.

Dashboard operational and commercial repository loading/errors remain unavailable states, not successful empty metrics; independently healthy content/flight/booking panels remain usable. Quick Edit shares gate/time validation and separates field errors from storage failures. Responsive gate editors associate their own visible field errors with unique variant/flight IDs.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner (historical checkpoint)**, accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`. Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`). Existing Flight IDs remain compatibility identities; current services use stable Schedule-derived IDs with canonical Network and Schedule facts, retaining additive `aircraftId` linkage. Phase 6B is Complete / Accepted Source / Accepted Release / Deployed by Owner. Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source). Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source).

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2A is **Complete / Accepted Source**; Phase 6B2C2B remains **Complete / Accepted Source**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Complete / Accepted Source.** Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; their release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [NETWORK_MODEL.md](NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.

## Phase 6B2C2A - Stable Dated-Service Materialization Foundation

**Complete / Accepted Source.** Establishes pure, deterministic projection of recurring schedules onto concrete calendar dates with structured operational effects (`cancelled`, `time`, `aircraft`, `extra`). Versioned URL-safe reversible codec `svc1-<base64url>-<date>` preserves exact Schedule identity without loss. Schedule lifecycle eliminates destructive `remove`; `active = false` is the sole retirement mechanism.

*Historical note (at time of Phase 6B2C2A)*: Prior production was Phase 6B2A (`2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`). Current production is the consolidated Phase 6B owner deployment (`8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, source `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B remain Planned / Unstarted. See [DATED_SERVICE_MODEL.md](DATED_SERVICE_MODEL.md).

## Phase 6B2C2A accepted-source checkpoint

**Phase 6B2C2A Complete / Accepted Source.** ChatGPT independently accepted engineering at `429ca82dfa3db0453feeab5b53bb45e9e14cf45a` (reviewed original implementation: `2e1a3e626c48836384cb22ed57a4d6c4a13e7be3`). Accepted C2A source is `412fc2b4f79e01da0607b5bca44e01d76156a634`; the source-finalization handback records its provenance. C2A has no Accepted Release and is not deployed.

Phase 6B2B and Phase 6B2C1 are Complete / Accepted Source; their release/deployment is intentionally pending. Production remains owner-deployed Phase 6B2A, Complete / Accepted Source / Accepted Release / Deployed by Owner: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2C2B remains Complete / Accepted Source; Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. The historical C2A finalization performed no public or Booking discovery cutover, stored identity migration, release or deployment. C2B current behavior is described below.

## Phase 6B2C2B - Canonical Dated-Service Discovery & Booking Cutover

**Complete / Accepted Source.** Baseline accepted source: `412fc2b4f79e01da0607b5bca44e01d76156a634`. Phase 6B2C2A remains Complete / Accepted Source (accepted engineering `429ca82dfa3db0453feeab5b53bb45e9e14cf45a`). Phase 6B as a whole is Complete / Accepted Source.

Current authority is NetworkRepository + ScheduleRepository + read-only compiled route merchandising price, projected by the shared DatedServiceResolver into `svc1-*` Flights, then composed with canonical FlightOverride. Current search, monthly sellability, Home/public boards, Admin search and new public/desk Booking creation use this chain. Valid empty Schedule storage produces zero current services; corrupt Schedule/Network authority fails truthfully without legacy discovery fallback.

New Booking commands resolve current service IDs only. Committed submission replay precedes every external authority read. Command-time Commercial/Fleet/Schedule/Network snapshots are composed with transaction-current FlightOverrides, and Flight/pricing/seat-layout snapshots plus total commit together in `gza.repo.v1`. This is browser command-time snapshot composition, not multi-store ACID.

Broad Flight lookup retains stored Booking Flight snapshots for history. Operational boards retain only confirmed-PNR snapshots and relevant override-only legacy Flights; cancelled PNRs cannot independently retain a retired board row. Current bases take precedence when available. Existing PNR mutations can fall back to their stored Flight plus current override during planning removal or authority corruption. Historical pricing and seat-layout snapshots remain authoritative. Planning deactivation is not retroactive cancellation: explicit structured cancellation or FlightOverride cancellation supplies operational truth.

The frozen legacy generator is compatibility-only. There is no generated Flight persistence store, hardcoded cutover date, PNR/draft/override identity migration, backend or cross-device claim. Browser-local `svc1-*` Flight Detail uses generic static metadata because prerender cannot read local Schedule/Network state. Booking route selectors use active Network routes; compiled destination information pages remain available.

Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1 and Phase 6B2C2A release/deployment remain intentionally pending. C2B engineering is accepted and source is finalized; C2B has no Accepted Release and is not deployed. Phase 6C / 7 / 7B remain Planned / Unstarted.


## Phase 6B2C2B accepted-source checkpoint

**Phase 6B2C2B Complete / Accepted Source. Phase 6B Complete / Accepted Source.** ChatGPT independently accepted engineering at `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4` (original implementation: `ff46f8e7ab606731be679eaedbada9e07d09e91a`; accepted C2A baseline: `412fc2b4f79e01da0607b5bca44e01d76156a634`). Acceptance is recorded in the owner-supplied 2026-10-06 master handoff. The accepted-source candidate is the docs/status-only finalization commit introducing this checkpoint; its exact SHA is recorded in the publication handback. Independent accepted-source verification precedes main fast-forward.

PNR-facing Flight reads use `(Booking reference, leg)`: current service when available, otherwise that exact leg's stored Flight, then current FlightOverride. Historical pricing and seat-layout snapshots remain unchanged. Admin Check-in can discover confirmed PNRs using their own snapshots during planning failure, with an explicit localized warning. Public/new-sale authority still fails truthfully. Cancelled PNRs preserve their own history without independently resurrecting retired operational board rows.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1, Phase 6B2C2A and Phase 6B2C2B release/deployment remain pending. Phase 6B has no consolidated Accepted Release and is not deployed as a consolidated milestone. No live production verification is claimed by this finalization.

**Next milestone:** independently verify accepted source, then construct/review the consolidated Phase 6B HostPapa release for owner deployment and production reconciliation. Phase 6C / 7 / 7B remain Planned / Unstarted. This finalization changes no runtime implementation. The immutable planning snapshot is [the 2026-10-06 master handoff](../GAZA_GATEWAY_MASTER_AI_AGENT_HANDOFF_ROADMAP_2026-10-06.md); its pre-finalization refs/status are historical snapshot facts, not moving current refs.

## Phase 6B consolidated release & Phase 6C status

Phase 6 engineering implementation is complete. Phase 6 and Phase 6C are **Complete / Accepted Source**, published to main at `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Accepted Phase 6C engineering and Correction 05: `d5dd2942fad517cc5f1be353ad206511cc0724cc`; original implementation: `3ac3c8a078f7ffa82b411744b656c3575a3955c4`.

The final Phase 6 static package is published on HostPapa at `421101d294674aaa503565cfc4df9fafb62527ba`, packaging source `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Owner deployment of that package has not been confirmed. Phase 6C is not deployed.

Confirmed production remains **Phase 6B - Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source `2749c26714258871c32bd2b14a75fc4e87a68b62`. Deployment is confirmed by the product owner. No independent live bundle verification claimed for this reconciliation.

**Phase 7 - CMS Admin Workflows: Complete / Accepted Source.** ChatGPT independently accepted `6b0240f1692beecc3f030775c0a25a68758a279b`, now published to main. There is no standalone Phase 7 release.

**Phase 7B - Media & Provenance Admin: Implemented / Awaiting Independent Review.** Archive/source catalogs and media variants are inspectable. Validated bilingual local proposals use `gza.archive.draft.v1`; HC-2/HC-3 rights, evidence, intake identity and publication-basis safeguards remain enforced. Saving proposals does not publish the public Gallery/Past/Home. Codex reviewed both AGY tasks and corrected editor refresh, conflict, error-focus and disclosure behavior.

**Next milestone:** independent ChatGPT review of the whole Phase 7B branch. Main remains accepted Phase 7; HostPapa remains `421101d294674aaa503565cfc4df9fafb62527ba`. Phase 8 is Planned / Unstarted. No Phase 7/7B release or deployment has occurred. See the archive administration model. Earlier milestone sections are historical and do not override this current block.
