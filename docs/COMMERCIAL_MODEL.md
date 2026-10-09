# Commercial catalog and booking pricing — Phase 6B2A

**Complete / Accepted Source / Accepted Release / Deployed by Owner**, the historical Phase 6B2A production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

> **Current Source Status**: Phase 6 Complete / Accepted Source; Phase 6C Complete / Accepted Source; Phase 7 and Phase 7B Complete / Accepted Source. Phase 8 — Visual System & Assets Finalization is Complete / Accepted Source. Phase 9 — Arabic, RTL, Accessibility & Responsive Certification is Complete / Accepted Source. Phase 10 is Complete / Accepted Source; Phase 11 is Complete / Accepted Source (Release Published). Phase 12 — Backend Readiness & API Contracts is Complete / Accepted Source at 7dab821d7d205b41ae925e013fe9c69a97a7e875 ([docs/backend/README.md](./backend/README.md)). Phase 13A local backend foundation is Local Engineering Accepted / Remote Staging Gates Deferred at 91a918caf0b22e565a43f52e46cf85ca4eb4825c (external staging/CI gates deferred and unmet; Phase 13B authorized / preparation underway; no runtime authentication implemented yet; Phase 13C–G remain Planned / Unstarted). Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source. See the current checkpoint below.

## Authority and persistence

`gza.commercial.v1` contains `{schemaVersion:1, revision, catalog}`. Catalog contains `fares`, `cabins`, `baggage`, `meals`, `defaultMealId`, `assistance`. Missing storage exposes deterministic compiled seeds without writing. Valid storage is authoritative. A corrupt, unsupported or unavailable present store surfaces a typed query failure and blocks mutation; there is no healthy-looking seed fallback or automatic destructive repair. Deliberate browser-store repair/removal is required.

CommercialStorageCoordinator serializes each instance, obtains an origin-wide Web Lock when supported, rereads inside that lock, validates the entire prospective catalog, persists before adoption, and only then notifies subscribers. Failure leaves prior state/revision intact with no success event. Unsupported browser write coordination fails safely. Identical mutations avoid persistence. Reads are detached copies. Storage events invalidate mounted same-origin consumers; RepositoryProvider centrally invalidates commercial query keys. Studio uses an isolated in-memory catalog. This is same-browser/origin persistence, not organization-wide or cross-device synchronization.

## Contract and lifecycle

Async get, updateFare, updateCabinPricing, updateBaggage, createMeal, updateMeal, reorderMeals, setDefaultMeal, createAssistance, updateAssistance, reorderAssistance and subscribe. Zod validates the entire prospective catalog. Fixed fares: essential/classic/flex; fixed cabins: economy/premium/business. Essential and Economy multipliers are exactly 1. Classic/Flex and Premium/Business multipliers are 1–8. Active fare coverage is required for every structural cabin. IDs are immutable and not deleted. Orders are integers 0–1000. Bilingual copy is trimmed, required and bounded. Bag weights/prices are bounded.

Meals and assistance have immutable UUID-based identities, bilingual labels, active/retired status and display order. The single default meal must exist and be active; it cannot be retired before selecting another default. Retired or unknown historical IDs remain readable and may remain unchanged on their original passenger. Newly introducing an inactive/unknown ID is rejected, including moving it to another passenger. Active replacements are supported. Preferences retain stored retired IDs; new choices must be active.

## Snapshot and pure pricing

BookingPricingSnapshotV1 contains version, catalogRevision, basis (catalog/legacy), fareId/multiplier, cabinId/multiplier, checkedBags/checkedBagKg, cabinBagKg/cabinBagDims, extraBagPrice, taxRate and seatPricing. Seat pricing contains policy legacy-row-v1, standardSeatPrice 0, extraLegroomPrice 18 and extraLegroomRows [5,11,12]. Tax remains fixed at 14%; no tax editor. The snapshot contains relevant pricing facts rather than the whole catalog.

New creation samples the canonical catalog independently of UI previews, validates sellability, and commits the calculated total and snapshot together. Client total, revision and snapshot cannot override this. Because catalog and booking persistence are separate stores, catalog selection is snapshot-at-command-time rather than multi-store ACID. The resulting booking is internally consistent.

Existing updateSeats, updateExtras and completeCheckIn calculate using stored historical pricing. Extras sellability checks use the current catalog, while extra-bag charges and original airfare use the booking snapshot. Catalog changes never retroactively reprice a PNR. Snapshotless legacy bookings use literal frozen pre-6B2A values (fare 1/1.35/1.85; cabin 1/1.6/2.6; extra bag 35; original weights; tax .14; seat fees 0/18). Reads do not reprice, write or migrate. A real rewrite seals that legacy basis; a genuine Extras no-op avoids writing.

Names and service labels resolve through the current catalog including retired records; unknown historical IDs display the raw ID. Included baggage and price breakdowns use the historical snapshot. Public/Counter stale choices are preserved and directed back to Fare/Extras instead of silently substituted.

## Boundaries

Admin Products Fares/Baggage/Meals/Assistance and cabin pricing are commercial.edit mutations; commercial.view can inspect. Field validation is localized/associated; storage failure is a general alert and preserves editor input. In Phase 6B2B, aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`) with booking seat layout snapshots (`BookingSeatLayoutsV1`). Network reference configuration uses NetworkRepository (`gza.network.v1`) in Phase 6B2C1; editorial/SEO and route pricing are excluded. No gza.ops.v1, backend, network changes, schedule materialization or flight-ID changes; deployment is owner-confirmed. Phase 6B2B is Complete / Accepted Source; Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B and Phase 6C are Complete / Accepted Source; Phase 7/7B remain Planned / Unstarted.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source). Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source).

## Correction 01 command boundaries

Committed submission replay is checked against canonical booking state before any catalog dependency, and repeated inside the conditional transaction. Both replay paths avoid writes and notifications. First-time submissions still require a healthy current catalog.

Booking exposes typed product commands; the generic Partial<Booking> update, React Query hook and StoreProvider writer are removed. Account Trip cancellation uses cancel() while preserving account ownership checks. A successful legacy claim seals its frozen pricing basis; rejected/idempotent claims remain no-write.

Existing normalized passenger identity adoption preserves meal preference without requiring the commercial catalog. New account creation still requires its active default meal. Home/standard flight search catches draft-reset failures, preserves criteria and prior draft, shows localized catalog/storage retry feedback and navigates only after success. No compiled default is substituted.

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

## Current checkpoint — Phase 13A

Phase 6, Phase 7 and Phase 7B are **Complete / Accepted Source**. Phase 7 was independently accepted at `6b0240f1692beecc3f030775c0a25a68758a279b`; Phase 7B was independently accepted and published to main at `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`.

The combined Phase 7 + 7B HostPapa release is `f68adcc60ec195f8099252b0d2d78da9a7c5ef4e`, packaging source `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`. Deployment is recorded on the product owner's instruction to consider it done; Codex performed no cPanel deployment or independent live verification. The release also includes accepted Phase 6C.

**Phase 8 — Visual System & Assets Finalization: Complete / Accepted Source**, independently accepted and published to main at `55981908a75a38de31538c387d103e548c04f91d`. No separate Phase 8 release was constructed.

**Phase 9 — Arabic, RTL, Accessibility & Responsive Certification: Complete / Accepted Source**, independently accepted and published to main at `f3d7377720c951ea659c076d2e8128d10c1a827a`. See [Phase 9 implementation and evidence](PHASE9_ACCESSIBILITY_RTL.md). **Phase 10 — Durable Regression & CI Hardening: Complete / Accepted Source**, independently accepted and published to main at `277e07a29188ab5ca07df008c011f42ec964641b`. **Phase 11 — SEO, Performance & HostPapa Certification: Complete / Accepted Source** at `e1b4e3c62238357209990e80b00cc4635f621b76`. See [focused regression and CI policy](REGRESSION_AND_CI.md). **Phase 12 — Backend Readiness & API Contracts: Complete / Accepted Source**, independently accepted at `7dab821d7d205b41ae925e013fe9c69a97a7e875`. Deliverables remain design/contracts and development tooling, not deployed or functioning runtime. Consolidated Phase 8–11 release a47afded49e900b75c907e7230ca4dfef5b3f91e is published on origin/hostpapa-deploy from source e1b4e3c62238357209990e80b00cc4635f621b76; live cPanel deployment remains unverified and owner-managed.

**Phase 13A local backend foundation is Local Engineering Accepted / Remote Staging Gates Deferred**, independently accepted by owner-supplied ChatGPT review at `91a918caf0b22e565a43f52e46cf85ca4eb4825c` (not deployed; external staging and backend CI gates remain deferred and unmet). Implementation covers isolated Laravel 13 / PHP 8.4 / PostgreSQL 17 infrastructure migrations and system endpoints only. Frontend mock repositories remain default. Typed client operates only via explicit nonproduction opt-in without authentication. Phase 13B identity is authorized / preparation underway; no runtime authentication implemented yet; Phase 13C–G remain Planned / Unstarted; no authentication, domain inventory, booking persistence, payments or CMS publication have been implemented. Original Phase 13A reachable staging and backend CI definition-of-done gates remain deferred and unmet under owner prohibition on provisioning and automatic GitHub Actions. Local proof does not satisfy remote gates; no paid services, DNS, real credentials, or traffic cutover are authorized or provisioned. Reference final documentation at [docs/backend/phase13a-foundation.md](./backend/phase13a-foundation.md), [docs/backend/phase13a-runtime.md](./backend/phase13a-runtime.md), [docs/backend/phase13a-system-client.md](./backend/phase13a-system-client.md), and [docs/backend/phase13a-provider-seams.md](./backend/phase13a-provider-seams.md).

Editorial and archive proposals remain browser-local drafts, not public publication. HC-2/HC-3 rights, evidence, publication basis and documentary/future media separation remain unchanged. Earlier milestone sections are historical and do not override this checkpoint.
