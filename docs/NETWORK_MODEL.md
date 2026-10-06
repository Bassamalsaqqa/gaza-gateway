# Network reference authority — Phase 6B2C1

> **Current Source Status**: **Phase 6B2C2A Implemented / Awaiting Independent Review.** Network Phase 6B2C1 Complete / Accepted Source remains intact. Phase 6B2C2B is Planned / Unstarted. Production remains owner-deployed Phase 6B2A.

Status: **Phase 6B2C1 Complete / Accepted Source**. Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Production remains owner-deployed Phase 6B2A, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2B is Complete / Accepted Source, its release/deployment is intentionally pending. No independent live-browser production verification is claimed.

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

Phase 6B2C2A is **Implemented / Awaiting Independent Review**; Phase 6B2C2B is **Planned / Unstarted**. C1 does not change Public Flight generation, Flight IDs/numbers, Booking Flight resolution, public search, or static routes. Schedule changes remain planning-only. Route pricing, full destination CMS/SEO publication and network expansion are excluded. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole remains incomplete. No release or deployment is part of C1.

## Phase 6B2C2A - Stable Dated-Service Materialization Foundation

**Implemented / Awaiting Independent Review.** Establishes pure, deterministic projection of recurring schedules onto concrete calendar dates with structured operational effects (`cancelled`, `time`, `aircraft`, `extra`). Versioned URL-safe reversible codec `svc1-<base64url>-<date>` preserves exact Schedule identity without loss. Schedule lifecycle eliminates destructive `remove`; `active = false` is the sole retirement mechanism.

Phase 6B2A is Complete / Accepted Source / Accepted Release / Deployed by Owner (current production release: `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`). Phase 6B2B is Complete / Accepted Source (release/deployment intentionally pending). Phase 6B2C1 is Complete / Accepted Source.

Phase 6B2C2B - Network & Dated-Service Discovery Cutover: **Planned / Unstarted**. In Phase 6B2C2A, live consumer discovery (Public Flights, Home board, Flight Detail, Booking search, Admin global search) remains bound to the compiled legacy generator and canonical overrides. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole remains incomplete. See [DATED_SERVICE_MODEL.md](DATED_SERVICE_MODEL.md).
