# Dated-Service Authority Model — Phase 6B2C2A

> **Current Source Status**: Phase 6 Complete / Accepted Source; Phase 6C Complete / Accepted Source; Phase 7 and Phase 7B Complete / Accepted Source. Phase 8 — Visual System & Assets Finalization is Complete / Accepted Source. Phase 9 — Arabic, RTL, Accessibility & Responsive Certification is Complete / Accepted Source. Phase 10 is Complete / Accepted Source; Phase 11 is Complete / Accepted Source (Release Published). Phase 12 — Backend Readiness & API Contracts is Complete / Accepted Source at 7dab821d7d205b41ae925e013fe9c69a97a7e875 ([docs/backend/README.md](./backend/README.md)). Phase 13A local backend foundation is Local Engineering Accepted / Remote Staging Gates Deferred at 91a918caf0b22e565a43f52e46cf85ca4eb4825c (external staging/CI gates deferred and unmet; Phase 13B authorized / preparation underway; no runtime authentication implemented yet; Phase 13C–G remain Planned / Unstarted). Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source. See the current checkpoint below.

Status: **Phase 6B2C2B Complete / Accepted Source**. The pure C2A foundation is Complete / Accepted Source. Historical completed phases:

- **Phase 6B2C1 Complete / Accepted Source** (accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`, accepted source `f5506a2ae467b2eb5b8182d7d5b009f258115eb4`).
- **Phase 6B2B Complete / Accepted Source** (accepted engineering SHA: `7f8a2bef613fa0cd37af4f05684c98aebe94d23e`, accepted source `d0a411cb8a882298eb32a3222478fbc782ba5556`).
- **Phase 6B2A Complete / Accepted Source / Accepted Release / Deployed by Owner** (current production: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`).

Phase 6B as a whole is Complete / Accepted Source. Phase 6B2C2B — Network & Dated-Service Discovery Cutover is Complete / Accepted Source. Phase 6C, Phase 7 and Phase 7B are Planned / Unstarted.

---

## Architecture & Responsibilities

Phase 6B2C2A establishes the pure domain foundation for projecting recurring `Schedule` definitions onto concrete calendar dates (`Flight` instances), coupled with structured date-specific operational effects.

### Separation of Concerns

1. **Schedule (`ScheduleRepository`, `gza.schedule.v1`)**:
   - Owns recurring weekly flight templates (`days: number[]`, `from: string`, `until: string`, `departTime: string`, `arriveTime: string`, `destination: string`, `direction: "out" | "in"`, `number: string`, `aircraftId?: string`, `aircraft: string`, `active: boolean`).
   - Owns date-specific exceptions (`ScheduleException[]`) with optional structured operational effects.
   - Does NOT generate flights, store flight instances, or alter public discovery in Phase 6B2C2A.

2. **Network (`NetworkRepository`, `gza.network.v1`)**:
   - Reference authority for destination identity, IATA codes, cities, countries, timezones, block minutes, and active route status.
   - Explicit input to dated-service materialization: route duration is strictly `network.blockMinutes` (never wall-clock timezone subtraction).

3. **Dated-Service Identity (`src/lib/dated-services/identity.ts`)**:
   - Pure, deterministic, versioned, URL-safe, reversible codec: `svc1-<base64url UTF-8 exact Schedule ID>-YYYY-MM-DD`.
   - 100% reversible: `parseDatedServiceId(datedServiceId(scheduleId, date)) === { scheduleId, date }`.
   - Invariant across Node unit tests and browser execution.
   - Independent of mutable presentation facts (flight number, departure time, equipment, gate, status).

4. **Pure Materializer (`src/lib/dated-services/materializer.ts`)**:
   - Pure function: `materializeScheduleOnDate({ schedule, network, date, basePrice, now? }): Flight | null`.
   - Pure function: `materializeSchedulesOnDate({ schedules, networks, date, routePrices?, defaultBasePrice?, now? }): Flight[]`.
   - Zero side-effects: no React hooks, no QueryClient, no `localStorage`, no repository imports.
   - Operational existence: requires `schedule.active === true`, `network.active === true`, `date` within `[from, until]`, and either a matching recurring weekday or an explicit `extra` effect.
   - Operational cancellation preserves the dated flight record with `status: "Cancelled"` and identical identity.

5. **Operational Simulation (`src/lib/dated-services/simulation.ts`)**:
   - Deterministic presentation facts (status, gate, terminal, seatsLeft, price adjustment) derived from `hashString(serviceId)`.
   - Mutable presentation changes do not change simulation seeds.
   - Temporal presentation uses reference timezone `Asia/Gaza`.

6. **Runtime resolution and compatibility (C2B)**:
   - One shared `LocalDatedServiceResolver` composes canonical Schedule/Network with `routeBasePriceByCode`; it writes nothing.
   - `readSnapshot`, `project`, `listCurrentFlights`, `searchCurrentFlights` and `resolveCurrentFlightById` expose current-only projection. Missing route pricing or corrupt authority raises `CurrentFlightAuthorityError`.
   - `FlightRepository.searchFlights`, `getCurrentFlightById` and monthly maps never include compatibility-only services. Monthly commands read planning authorities once.
   - `getFlights` combines current services, confirmed canonical Booking Flight snapshots and actual legacy override relevance, deduplicated in that order before applying overrides. `getFlightById` prefers current `svc1` bases, then Booking snapshots; valid legacy IDs use explicit frozen compatibility when needed.
   - Schedule, Network and booking/override events invalidate Flight queries through one central Query layer; destroy unsubscribes repository listeners.
   - Existing PNR seat/check-in commands use current base when available, otherwise stored Flight, then transaction-current overlay. Check-in uses current planned departure, with the accepted revised-departure rule unchanged.

---

## Identity Codec Specification

### Format

```
svc1-<base64url UTF-8 exact Schedule ID>-YYYY-MM-DD
```

- **Prefix**: `svc1-` specifies version 1 of the dated-service identity format.
- **Schedule ID Component**: Base64url-encoded UTF-8 representation of the exact `Schedule.id`. Supports full Unicode, punctuation, whitespace, and identifiers up to 160 characters without loss or collision.
- **Date Component**: Strict ISO 8601 calendar date (`YYYY-MM-DD`) validated against real Gregorian rules (leap years, month bounds, days 1-31).

### Reversibility & Validation

- `datedServiceId(scheduleId: string, date: string): string` validates input and encodes deterministically.
- `parseDatedServiceId(id: string): { scheduleId: string, date: string } | null` verifies canonical base64url encoding, valid ISO calendar date, and recovers the exact scheduleId. Non-canonical encodings, invalid dates, or malformed strings return `null`.
- `isDatedServiceId(id: string): boolean` tests whether a string conforms to the codec specification.

---

## Structured Effects & Lifecycle

### Schedule Lifecycle

- **No Destructive Delete**: `ScheduleRepository.remove`, `deleteSchedule`, and `useDeleteScheduleMutation` are removed. Future product commands cannot delete Schedules. Existing previously emptied stores are preserved without resurrection.
- **Retirement Mechanism**: Setting `active: false` is the sole retirement mechanism. Inactive schedules preserve their identity, history, and exceptions while being excluded from operational projection from current discovery.
- **Empty Storage Authority**: Empty persisted arrays in `gza.schedule.v1` (`{ schemaVersion: 1, revision: N, schedules: [] }`) are fully authoritative and never resurrect compiled seeds.

### Exception Schema & Discriminator

`ScheduleException` is a discriminated union on `kind`:

1. **`cancelled`**:
   - `kind: "cancelled"`
   - `effect?: { cancelled: true }`
   - Preserves dated flight with `status: "Cancelled"`.

2. **`time`**:
   - `kind: "time"`
   - `effect?: { departTime: string, arriveTime: string }`
   - Overrides departure and arrival times for the specific date. Times must be valid `HH:mm`.

3. **`aircraft`**:
   - `kind: "aircraft"`
   - `effect?: { aircraftId: string, aircraft: string }`
   - Overrides equipment assignment with validated canonical Fleet equipment.

4. **`extra`**:
   - `kind: "extra"`
   - `effect?: { departTime?: string, arriveTime?: string, aircraftId?: string, aircraft?: string }`
   - Schedules an additional flight on a non-recurring weekday within `[from, until]`. Omitted fields default to the base Schedule.

5. **Planning Annotations**:
   - Records with `effect: undefined` are planning-only annotations.
   - Legacy stored records `{ id, date, kind, detail }` parse unchanged as annotations without operational power. Prose `detail` is never parsed for operational rules.

### Operational Effect Rules

- Effect `date` must fall within inclusive `[schedule.from, schedule.until]`.
- Exception `id` values must be unique within the Schedule.
- Only one operational effect of a given kind per date.
- `cancelled` and `extra` are mutually exclusive with each other and all other operational effects on the same date.
- One `time` and one `aircraft` effect may coexist on the same recurring operating date.
- `extra` is valid only on non-recurring weekdays (days not in `schedule.days`).
- Equipment assignments in `aircraft` or `extra` effects are validated against `FleetRepository` at mutation time: the aircraft must exist, be active, and possess a valid seat layout.

## Certified command and compatibility boundaries

Schedule command inputs are detached before awaiting dependencies or queued locks. New/changed structured equipment is validated through Fleet; unchanged historical equipment can survive inactive or corrupt Fleet. When a command replaces exceptions, the locked reread compares the entire canonical exception collection against its preflight baseline. Concurrent changes reject with `ScheduleIdentityConflictError`, preserving the newer collection without writing, incrementing revision or notifying subscribers; operator edits are not implicitly merged. Exact committed create replay bypasses both Fleet and Network and performs zero writes, revision increments or notifications.

Pure materialization resolves equipment identity in order: structured aircraft effect, structured extra equipment effect, explicit Schedule `aircraftId`, then the accepted exact known-name Fleet mapping (`Airbus A320neo` → `a320neo`, `Airbus A321neo` → `a321neo`, `Boeing 737-800` → `b737800`). Stored effect/Schedule display text is preserved. Unknown legacy names remain unresolved without an invented ID. This compatibility projection performs no Fleet repository read and no read-time Schedule migration or storage write.

The codec rejects unpaired UTF-16 surrogates and invalid/noncanonical UTF-8 tokens. Valid Unicode (including a leading BOM), punctuation and whitespace round-trip exactly in Node and browser execution. Gregorian years 0000 through 9999 use ISO parsing without Date.UTC's 0-99 year remapping.

Route merchandising price must be explicit: single projection requires basePrice; bulk projection requires a routePrices fixture/resolver or a caller-supplied defaultBasePrice. There is no invented default and no duration-derived price. Missing, negative or nonfinite prices fail with invalid_price. Duplicate Schedule identities in one bulk input fail with duplicate_schedule. Numeric now=0 is an explicit epoch clock; invalid clocks fail with invalid_clock. Gate A1-A8, terminal 1, seatsLeft 4-27 and price adjustment 0-60 (steps of 12) use an FNV-1a hash of service identity. Status also uses the reference date in Asia/Gaza. These are prototype simulation facts, not operational telemetry.

Extra time overrides are independently optional; omitted values resolve from the base Schedule at projection time. Enabling extra in Admin stores an empty effect, leaving those defaults unsnapshotted. Equipment overrides require a coherent Fleet ID/model pair. Legacy annotation dates outside the current effective range stay readable and are never automatically converted to effects. No arrival-after-departure constraint is invented for local wall times.

The frozen legacy generator produces multiple rotations that do not match recurring Schedule seeds. The seeds are not changed to simulate equivalence. C2B current service counts and times come from recurring Schedule truth and may legitimately differ from legacy rotations. Historical compatibility is identity-based, with no hardcoded calendar cutover date. No PNR, override or draft IDs are migrated in C2A.

LocalStorage Schedule definitions are runtime-only and cannot participate in HostPapa static prerender head generation. C2B uses generic static metadata for local dated-service IDs; specific legacy metadata uses the frozen compatibility wrapper. There is no generated flight-instance store, backend or cross-device synchronization.

## Phase 6B2C2A accepted-source checkpoint

**Phase 6B2C2A Complete / Accepted Source.** ChatGPT independently accepted engineering at `429ca82dfa3db0453feeab5b53bb45e9e14cf45a` (reviewed original implementation: `2e1a3e626c48836384cb22ed57a4d6c4a13e7be3`). Accepted C2A source is `412fc2b4f79e01da0607b5bca44e01d76156a634`; the source-finalization handback records its provenance. C2A has no Accepted Release and is not deployed.

Phase 6B2B and Phase 6B2C1 are Complete / Accepted Source; their release/deployment is intentionally pending. Production remains owner-deployed Phase 6B2A, Complete / Accepted Source / Accepted Release / Deployed by Owner: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2C2B remains Complete / Accepted Source; Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. The historical C2A finalization performed no public or Booking discovery cutover, stored identity migration, release or deployment. C2B current behavior is described below.

## Phase 6B2C2B - Canonical Dated-Service Discovery & Booking Cutover

**Complete / Accepted Source.** Baseline accepted source: `412fc2b4f79e01da0607b5bca44e01d76156a634`. Phase 6B2C2A remains Complete / Accepted Source (accepted engineering `429ca82dfa3db0453feeab5b53bb45e9e14cf45a`). Phase 6B as a whole is Complete / Accepted Source.

Current authority is NetworkRepository + ScheduleRepository + read-only compiled route merchandising price, projected by the shared DatedServiceResolver into `svc1-*` Flights, then composed with canonical FlightOverride. Current search, monthly sellability, Home/public boards, Admin search and new public/desk Booking creation use this chain. Valid empty Schedule storage produces zero current services; corrupt Schedule/Network authority fails truthfully without legacy discovery fallback.

Normal new Booking commands resolve current service IDs only. Appearance Studio explicitly injects a legacy fixture resolver into an isolated in-memory registry; its simulated bookings and overrides never enter persistent stores, and normal registries cannot accept that fixture resolver. Studio drafts retain their selected mock Flight facts rather than reconciling against production planning. Committed submission replay precedes every external authority read. Command-time Commercial/Fleet/Schedule/Network snapshots are composed with transaction-current FlightOverrides, and Flight/pricing/seat-layout snapshots plus total commit together in `gza.repo.v1`. This is browser command-time snapshot composition, not multi-store ACID.

Broad Flight lookup retains stored Booking Flight snapshots, including cancelled history. Operational boards retain only confirmed Booking Flight snapshots and relevant override-only legacy Flights. Current bases take precedence when available. Existing PNR mutations can fall back to their stored Flight plus current override during planning removal or authority corruption. Historical pricing and seat-layout snapshots remain authoritative. Planning deactivation is not retroactive cancellation: explicit structured cancellation or FlightOverride cancellation supplies operational truth.

The frozen legacy generator is compatibility-only. There is no generated Flight persistence store, hardcoded cutover date, PNR/draft/override identity migration, backend or cross-device claim. Browser-local `svc1-*` Flight Detail uses generic static metadata because prerender cannot read local Schedule/Network state. Booking route selectors use active Network routes; compiled destination information pages remain available.

Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1 and Phase 6B2C2A release/deployment remain intentionally pending. C2B engineering is accepted and source is finalized; C2B has no Accepted Release and is not deployed. Phase 6C / 7 / 7B remain Planned / Unstarted.

## Phase 6B2C2B Independent Review Correction 01

Status remains **Complete / Accepted Source**. Reviewed parent: `ff46f8e7ab606731be679eaedbada9e07d09e91a`.

PNR-facing operations use `FlightRepository.getBookingFlight(ref, leg)`: prefer a currently materializable service, otherwise use that exact canonical Booking leg's stored Flight, then compose the freshly read matching FlightOverride. Query cache identity includes Booking reference and leg. Multiple PNRs sharing a stable service ID may retain different historical times/equipment; broad public Flight detail is a separate compatibility contract. Read resolution does not migrate Bookings, prices or seat layouts.

`getCheckInFlights(date)` is a desk-only read. Healthy planning retains normal current/compatibility operational listings. Unavailable planning yields an explicit EN/AR warning and confirmed Gaza-departure PNR compatibility from their stored snapshots plus overrides. A Booking/leg map supplies each desk row's own operational timing and sheet Flight. Final check-in remains the canonical BookingRepository command. Public boards, sale search and new Booking creation still fail truthfully during current-authority corruption.

Board relevance uses current services, confirmed PNR snapshots and explicit legacy override-only compatibility. Cancelled PNRs retain history/detail snapshots but do not independently resurrect a retired service on Home/public/Admin boards. Cancelling the last confirmed PNR removes its compatibility-only board row; explicit valid legacy overrides remain operationally relevant.

Production remains owner-deployed Phase 6B2A. Protected main and HostPapa, current discovery authority, new-sale validation, historical pricing/layouts, Studio isolation and all identity/store boundaries remain unchanged.


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
