# Network reference authority — Phase 6B2C1

> **Current Source Status**: Phase 6 Complete / Accepted Source; Phase 6C Complete / Accepted Source; Phase 7 and Phase 7B Complete / Accepted Source. Phase 8 — Visual System & Assets Finalization is Implemented / Awaiting Independent Review. Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source. See the current checkpoint below.

Historical Phase 6B2C1 checkpoint — Status: **Phase 6B2C1 Complete / Accepted Source**. Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Production remains owner-deployed Phase 6B2A, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2B is Complete / Accepted Source, its release/deployment is intentionally pending. No independent live-browser production verification is claimed.

## Aggregate

`gza.network.v1` stores exactly `{ schemaVersion: 1, revision: number, destinations: NetworkDestination[] }`.

Each destination contains only:

```ts
{
  code: "AMM" | "CAI" | "IST" | "DOH" | "DXB" | "JED" | "RUH";
  airportName: { en: string; ar: string };
  city: { en: string; ar: string };
  country: { en: string; ar: string };
  timezone: string;
  blockMinutes: number;
  active: boolean;
}
```

The seven identities are fixed and immutable; no create/delete/code-change commands exist. Exactly one record per code is required. Seeds preserve accepted compiled airport/city/country names, timezone and flight duration, with every destination initially active. `compiledNetworkReference` selects only those operational facts; `legacyDestinationPresentationByCode` separately exposes read-only public copy, merchandising price and sharing metadata. The old mixed DestinationConfig is not persisted.

Strings are trimmed, required and bounded to 160 characters per language. Timezones are bounded to 80 characters and validated as IANA identifiers through Intl.DateTimeFormat. Block duration is an integer from 20 to 600 minutes. Active state is a boolean. Strict central Zod validation rejects unsupported fields and validates the entire prospective aggregate.

## Contract and persistence

Async `list()`, `getByCode(code)`, `update(code, patch)` and `subscribe(listener)` provide the sole writer. Patch fields exclude code. Unknown reads return null; unknown writes and attempted identity changes produce typed NetworkError failures. Returned records and mutation results are detached copies.

Missing storage exposes deterministic seeds without writing. A valid present envelope is authoritative. Corrupt, unsupported or unreadable storage produces a truthful unavailable state and blocks mutation; it is never silently repaired or replaced. Deliberate repair/removal is outside this API.

Writes serialize per coordinator, acquire the origin Web Lock named `gza.network.v1`, reread canonical storage inside the lock, validate the complete prospective aggregate, and persist before adopting or notifying. Failed persistence leaves state/revision/subscribers unchanged. Normalized no-ops avoid revision, write and notification. Browsers without safe lock coordination fail writes truthfully. Separate fixtures and explicit coordinator injection are independent of Booking/Fleet/Schedule inputs. Studio uses isolated memory and never reads/writes persistent browser Network data.

RepositoryProvider owns one subscription invalidation layer for `networkKeys.all`; mounted list/detail queries converge through same-tab subscriptions and browser storage events across tabs. This is browser/origin persistence, not cross-device or server synchronization.

## Admin ownership

AdminProvider retains staff/session simulation, RBAC and toast/UI helpers only. `ops`, `patchOps`, `seedOpsState` and product-domain OpsState are removed.

Admin Destinations list/search reads canonical Network fields in both languages. Active outbound Schedule day occurrences determine **planned weekly departures**, not operational telemetry. Failed Schedule reads show frequency unavailable, never compiled weekly-frequency fallback. Starting fares are read-only legacy merchandising fixtures.

Basics uses `ops.edit`, awaits repository commit, associates localized validation errors with fields and focuses the first invalid input. Storage errors are general alerts and preserve drafts for retry. Remote changes preserve dirty edits and require reloading current values before saving. Viewers cannot mutate by pointer or keyboard.

Route displays stored Schedule summaries and links to destination-filtered Schedule Manager. Public copy/good-to-know and SEO are read-only. Existing ContentRepository photograph/focal-point controls remain real, unpublished browser-local preview drafts with `content.edit`; Network failure does not disable them. Network contains no prices, weekdays, frequency, publication flags, content, SEO, aircraft or media.

## Schedule boundary

Schedule schema validates uppercase three-letter structural syntax without importing compiled destinations. First-time create independently checks the shared NetworkRepository for a known code; inactive destinations are permitted for planning. Fleet still validates new aircraft assignments. Exact committed identity/data replay returns before either external read, with no write/revision/notification. Conflicting identity fails; the duplicate/conflict guard remains inside the locked Schedule transaction.

Schedule `id`, `destination` and `direction` are immutable. Number, times, days, dates, active state and planning annotations remain editable. Existing Schedule history and safe non-route edits remain usable with corrupt Network; labels fall back to technical destination codes. New creation is blocked truthfully. Existing PNR display/Manage/check-in, Fleet/Commercial Admin, contact/content and staff sign-in remain independent.

## Phase 6B2C2 — Network & Dated-Service Materialization

Phase 6B2C2A is **Complete / Accepted Source**; Phase 6B2C2B is **Complete / Accepted Source**. C1 does not change Public Flight generation, Flight IDs/numbers, Booking Flight resolution, public search, or static routes. C2B now projects Schedule changes into current service discovery. Route pricing, full destination CMS/SEO publication and network expansion are excluded. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. No release or deployment is part of C1.

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
