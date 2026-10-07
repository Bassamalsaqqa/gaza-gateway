# Fleet identity and booking seat authority — Phase 6B2B

> **Current Source Status**: Phase 6 Complete / Accepted Source; Phase 6C Complete / Accepted Source; Phase 7 and Phase 7B Complete / Accepted Source. Phase 8 — Visual System & Assets Finalization is Implemented / Awaiting Independent Review. Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source. See the current checkpoint below.

Historical Phase 6B2B checkpoint: Complete / Accepted Source. Production then remained owner-deployed Phase 6B2A: release `2751e22be91ad74eacc9213489a57a21baf04807`, source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`.

`FleetRepository` owns physical airframes and layouts in `gza.fleet.v1`: `{ schemaVersion: 1, revision, aircraft, layouts }`. Aircraft IDs are immutable; registrations are normalized uppercase and unique. There is no deletion command. Inactive aircraft cannot receive new assignments but remain resolvable on existing flights and schedules.

Seeds: `a320neo` / Airbus A320neo / PS-GZA, 28 A–F rows and 168 usable seats; `a321neo` / Airbus A321neo / PS-GZB, 33 A–F rows, blocked 33B/33E and 196 usable seats; `b737800` / Boeing 737-800 / PS-GZC, 27 A–F rows and 162 seats, inactive and without Premium. Capacity and supported cabins are derived from layouts, never independently edited. New aircraft start inactive with a 28-row A–F Economy-only layout and no extra-legroom rows.

Fleet writes serialize with a same-instance queue and origin Web Lock named `gza.fleet.v1`, reread inside the lock, validate the complete prospective aggregate and persist before adoption/notification. Missing storage exposes deterministic seeds without writing. Present malformed/unsupported storage fails closed; no automatic repair. Returned values are detached. Storage events invalidate the central Fleet query; Studio uses isolated memory.

Flight IDs, numbers, dates and routes are unchanged. `aircraftId` is additive to Flight, FlightOverride and Schedule. Known old names map only to the corresponding seeded identity; unknown legacy overrides clear unrelated base IDs and preserve display text. Changed/new Flight and Schedule assignments validate current Fleet at command time. Unchanged operational/status/gate/note edits do not require Fleet health. During Phase 6B2B, Schedule planning did not materialize dated flights. Accepted C2B now supplies current dated discovery through DatedServiceResolver.

New bookings sample current Commercial and Fleet stores, re-resolve canonical effective flights inside the booking transaction, validate both legs' cabin/seat authority and seal `BookingSeatLayoutsV1` with per-leg geometry, aircraft metadata, Fleet revision and derived capacity. A committed submission replay still needs neither catalog. These separate stores offer snapshot-at-command-time semantics rather than multi-store server ACID; the committed booking snapshot and price are internally coherent.

Confirmed PNRs use their stored geometry. Snapshotless historical PNRs resolve frozen 28-row A–F, Business 1–4, Premium 5–10, Economy 11–28 geometry with legroom rows 5/11/12. Reads do not migrate; a real seat/check-in mutation seals the legacy layout. Drafts use current Fleet and reconcile changed equipment/layouts without cabin downgrade, retaining unrelated passenger/contact/Extras state and clearing only stale leg seats. No automatic equipment re-accommodation is implemented.

Fleet layout classifies a seat as standard or extra legroom by leg; the historical commercial pricing snapshot supplies its fee. Existing layout-less bookings retain the legacy row classification. Fleet/catalog edits cannot retroactively reprice an old PNR.

Physical flight identity, not booking leg role, defines seat occupancy. The public occupancy command permits only booking-reference exclusion, never outbound/inbound role filtering. Forward check-in uses `completeCheckIn()` exclusively; no generic check-in compatibility writer remains. Exact committed Schedule creation replay returns before consulting Fleet, without a write, revision bump or notification; first-time assignments still require current Fleet validation and an identity guard inside the Schedule transaction.

Occupancy has four distinct sources: nonexistent geometry, structural unavailable seats, deterministic flight-specific prototype occupancy and confirmed PNR seats derived from `gza.repo.v1`. Booking writers share the `gza.repo.v1` origin Web Lock and reread inside it; create/seat/check-in commands reject newly introduced cross-PNR collisions on either matching flight leg. Existing legacy collisions can retain their own seats; cancelled PNRs release derived occupancy. No seat inventory key, automatic `seatsLeft` decrement or server inventory exists.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B remains Complete / Accepted Source; Phase 6C/7/7B remain unstarted.

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2A is **Complete / Accepted Source**; Phase 6B2C2B remains **Complete / Accepted Source**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Complete / Accepted Source.** Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; its release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [NETWORK_MODEL.md](NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.

## Phase 6B2C2A - Stable Dated-Service Materialization Foundation

**Complete / Accepted Source.** Establishes pure, deterministic projection of recurring schedules onto concrete calendar dates with structured operational effects (`cancelled`, `time`, `aircraft`, `extra`). Versioned URL-safe reversible codec `svc1-<base64url>-<date>` preserves exact Schedule identity without loss. Schedule lifecycle eliminates destructive `remove`; `active = false` is the sole retirement mechanism.

Phase 6B2A is Complete / Accepted Source / Accepted Release / Deployed by Owner (current production release: `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`). Phase 6B2B is Complete / Accepted Source (release/deployment intentionally pending). Phase 6B2C1 is Complete / Accepted Source.

Phase 6B2C2B - Network & Dated-Service Discovery Cutover: **Complete / Accepted Source**. In Phase 6B2C2A, live consumer discovery (Public Flights, Home board, Flight Detail, Booking search, Admin global search) remains bound to the compiled legacy generator and canonical overrides. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [DATED_SERVICE_MODEL.md](DATED_SERVICE_MODEL.md).

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

## Phase 6B consolidated release & Phase 6C status (historical checkpoint)

Phase 6 engineering implementation is complete. Phase 6 and Phase 6C are **Complete / Accepted Source**, published to main at `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Accepted Phase 6C engineering and Correction 05: `d5dd2942fad517cc5f1be353ad206511cc0724cc`; original implementation: `3ac3c8a078f7ffa82b411744b656c3575a3955c4`.

The final Phase 6 static package is published on HostPapa at `421101d294674aaa503565cfc4df9fafb62527ba`, packaging source `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Owner deployment of that package has not been confirmed. Phase 6C is not deployed.

Confirmed production remains **Phase 6B - Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source `2749c26714258871c32bd2b14a75fc4e87a68b62`. Deployment is confirmed by the product owner. No independent live bundle verification claimed for this reconciliation.

## Current checkpoint — Phase 8

Phase 6, Phase 7 and Phase 7B are **Complete / Accepted Source**. Phase 7 was independently accepted at `6b0240f1692beecc3f030775c0a25a68758a279b`; Phase 7B was independently accepted and published to main at `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`.

The combined Phase 7 + 7B HostPapa release is `f68adcc60ec195f8099252b0d2d78da9a7c5ef4e`, packaging source `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`. Deployment is recorded on the product owner's instruction to consider it done; Codex performed no cPanel deployment or independent live verification. The release also includes accepted Phase 6C.

**Phase 8 — Visual System & Assets Finalization: Implemented / Awaiting Independent Review.** Work remains on its feature branch for independent review; no Phase 8 release is planned separately. Phase 9 remains Planned / Unstarted.

Editorial and archive proposals remain browser-local drafts, not public publication. HC-2/HC-3 rights, evidence, publication basis and documentary/future media separation remain unchanged. Earlier milestone sections are historical and do not override this checkpoint.
