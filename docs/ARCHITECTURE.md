# Gaza Gateway — System Architecture

This document defines the architectural structure, domain boundaries, data flows, canonical repository ownership, and technical contracts of the Gaza Gateway platform.

---

## 1. Technical Stack Overview

Gaza Gateway is a full-stack web application designed for high-fidelity bilingual (Arabic/English) historical and artistic presentation with persistent free reservations, dynamic ticket rendering, administrative controls, and documentary archive management.

```
+---------------------------------------------------------------------------------+
|                                 CLIENT TIER                                     |
|  React 19  *  TypeScript  *  Tailwind CSS 4  *  Radix UI  *  TanStack Router     |
+---------------------------------------------------------------------------------+
                                       |
                   HTTPS / JSON API    |   Bilingual Routes (EN: / , AR: /ar)
                   Cookie Session/CSRF |   Static Assets & Range 206 MP4
                                       v
+---------------------------------------------------------------------------------+
|                              PRODUCTION HOSTING                                 |
|                       HostPapa Shared cPanel (`gaza5045`)                       |
|                                                                                 |
|  +----------------------------+       +--------------------------------------+  |
|  |   Web Root (public_html)   |       |   Private Core (/home/gaza5045/...)  |  |
|  | - Prebuilt Vite Bundle     |       | - Laravel 13 / PHP 8.4+ Application  |  |
|  | - Media & Video Streams    |       | - Symlinked Release Pointer          |  |
|  | - Public Entrypoints       |       | - Private Backups & Upload Storage   |  |
|  +----------------------------+       +--------------------------------------+  |
|                                                          |                      |
|                               +--------------------------+                      |
|                               v                          v                      |
|                      +------------------+       +------------------+            |
|                      |   MySQL/InnoDB   |       |  HostPapa SMTP   |            |
|                      |  27 Migrations   |       |  Queued Outbox   |            |
|                      +------------------+       +------------------+            |
|                                                                                 |
|  cPanel Cron Dispatcher: Single */10 schedule running October 13 wrapper        |
+---------------------------------------------------------------------------------+
```

### Production vs. Development Authority
- **Production Authority:** The live website runs exclusively against the private Laravel 13 / MySQL backend with real database mutations and HostPapa SMTP dispatch. Production has **no mock fallback** or simulated endpoints.
- **Local Development Fixtures:** Browser-local storage keys (`gza.repo.v1`, `gza.booking.draft.v1`, `gza.passenger.v1`) exist solely as test harnesses and offline development fixtures. Frontend mock repositories remain default in dev unless explicit backend opt-in is configured.

---

## 2. Frontend Architecture & Routing

### 2.1 File-Based Flat Routing
Routing is implemented using TanStack Router with a flat file structure under `src/routes/`:
- **Root Layout:** `__root.tsx` establishes HTML `lang`/`dir`, head metadata, and global providers (`QueryClientProvider`).
- **Locale Wrapper:** `{-$locale}.tsx` parses the optional locale prefix serving English (`/`) and Arabic (`/ar`).
- **Admin Workspace:** `{-$locale}.admin.*.tsx` wraps administrative surfaces under `<AdminShell />`. Unauthenticated requests redirect to `{-$locale}.admin_.signin.tsx` (the trailing underscore bypasses the admin shell layout).
- **Auto-generated Tree:** `src/routeTree.gen.ts` is compiled automatically by `@tanstack/router-plugin`. Hand edits are strictly prohibited.

### 2.2 Directionality & LTR Technical Identifiers
All views render separate translated strings via `useI18n()` and `t()` keys. Never concatenate strings into combined labels (e.g. no "Flights / رحلات").

> [!IMPORTANT]
> **Technical Identifiers Invariant:** The following technical identifiers must remain strictly Left-to-Right (LTR) even when rendered in Arabic RTL pages:
> - Flight numbers: `PS 204`, `PS 201`
> - Booking references / PNRs: `GZA-7K8P`
> - IATA airport codes: `GZA`, `AMM`, `CAI`, `IST`, `DOH`, `DXB`, `JED`, `RUH`
> - ISO dates and times: `2026-10-25`, `14:30`
> - Telephone numbers and email addresses

---

## 3. Canonical Repository & Data Ownership

Every operational domain has a single canonical repository owning data persistence, mutations, and query invariants. No domain logic delegates to ad-hoc session state or untracked client singletons.

### 3.1 Flights & Recurring Schedules
- **Repositories:** `FlightRepository` and `ScheduleRepository`.
- **Authority Boundary:** `AdminProvider` manages staff session / RBAC simulation only; it does not own or proxy canonical flight overrides. It is not a flight writer or proxy. Operational flight mutations execute directly against `FlightRepository` and `ScheduleRepository`.
- **Persistence:** Operational flight overrides (`status`, `gate`, `estimatedDeparture`, `cancellationReason`) are persisted canonically. An empty gate is intentionally preserved (`—`); desk views do not invent default gates.
- **Schedules:** Timetables, recurring frequency patterns, and seasonal effective dates are owned by `ScheduleRepository`.

### 3.2 Commercial Catalog & Pricing Authority
- **Repository:** `CommercialCatalogRepository` (`gza.commercial.v1`).
- **Authority Boundary:** Canonical catalog defines fares, cabins (Economy, Premium, Business), baggage allowances, and amenity bundles. Fares and fees are USD minor units (cents) mapped consistently.
- **Zero Session Pricing:** Pricing rules are strictly catalog-driven. There is no session-only pricing or ephemeral commercial ops state.

### 3.3 Fleet Identity & Seat Geometry Authority
- **Repository:** `FleetRepository` (`gza.fleet.v1`).
- **Authority Boundary:** Aircraft profiles (Boeing 737-200, Fokker 50, Bombardier Dash 8) and cabin seat maps are immutable.
- **Seat Geometry:** Seat rows, letter assignments, cabin zones, and emergency exit legroom geometry are owned canonically. Runtime code contains zero references to session-only aircraft or seat-map operational state.

### 3.4 Network & Destinations Authority
- **Repository:** `NetworkRepository` (`gza.network.v1`).
- **Authority Boundary:** Destination records (`id`, `destination` and `direction` are immutable and never silently repaired or replaced).
- **Inactive Destinations:** Inactive destinations are permitted in the catalog without corrupting route lookups.
- **Persistence Invariant:** Changes must persist before adopting or notifying. No product-domain `OpsState` remains; no session-only destination ops state exists. Public Flight generation, Flight IDs, and Booking Flight resolution are unchanged.

### 3.5 Dated-Service Discovery & Booking Cutover
- **Boundary:** Dated-service generation links schedule patterns to discrete operational dates.
- **Cutover Rules:** Planning deactivation is not retroactive cancellation. Existing confirmed bookings for previously deactivated flight dates remain valid and serviceable. Valid empty results are handled gracefully without application errors.

### 3.6 Free Symbolic Bookings & Guest Ownership
- **Repository:** `BookingRepository` (`gza.booking.v1`).
- **Domain Invariant:** Free commemorative bookings with deterministic PNR generation (`GZA-XXXX`). Completed bookings bind passenger records, seat assignments, cabin class, and contact metadata.
- **Idempotency:** Booking creation enforces idempotency via unique `submissionId` headers to eliminate duplicate bookings on client retries.
- **Admin Check-in Desk:** Canonical repository-backed functionality (not simulation). Check-in status (`too_early`, `open`, `closed`, `unavailable`) enforces strict time-window rules based on scheduled flight departure epochs.

### 3.7 CMS Content & Draft Authority
- **Repository:** `ContentRepository` (`gza.content.draft.v1`).
- **Draft vs. Published Separation:** Public endpoints serve exclusively records matching `publishedRevision`. Saving a draft is not publishing; saving or discarding a draft does not alter public pages.
- **Concurrency & Conflicts:** CMS mutations submit `expectedRevision` matching current editorial revision. Concurrent conflicting writes are rejected with explicit conflict status (`draft_conflict`).

### 3.8 Archive & Media Draft Authority
- **Repository:** `LocalArchiveDraftRepository` (`gza.archive.draft.v1`).
- **Studio Isolation:** Archive draft authority is independent, registry-owned, and Studio-isolated. Saving or discarding a local draft does not change the public Gallery/Past/Home.
- **Public vs. Quarantine Intake:** Guest contributions from public upload forms land directly in private quarantine storage outside `public_html`. Items require staff moderation and rights verification before publication.

### 3.9 Settings & Appearance Authority
- **Repository:** `SettingsRepository` (`gza.settings.draft.v1.site.appearance`).
- **Design Tokens:** Warm Mediterranean limestone (`--sand`, `--sand-deep`), crisp Mediterranean sunlight (`--background`, `--card`), deep olive brand (`--brand`, `--primary`), baked terracotta clay (`--clay`), and dark ink archival framing (`--ink`).
- **Preview Isolation:** Appearance experiments operate via explicit query flags (`?skinPreview=1`) or within the Admin Appearance Lab, ensuring zero drift for standard visitors.

### 3.10 Staff Identity & RBAC Authority
- **Authority:** Backend `backend/config/identity.php` and operation policies enforce `dashboard.view`, `ops.view`, `ops.edit`, `content.view`, `content.edit`, `commercial.view`, `commercial.edit`, `engagement.view`, `engagement.edit` and `admin.manage`. Frontend legacy permission labels are not server authorization.
- **Concurrency Sentinel:** Sentinel table locking (`staff_directory_control`) protects staff profile mutations and directory updates against race conditions.

---

## 4. Analytics, Privacy & Scope Boundaries

- **Consent-First:** Telemetry is strictly opt-in, honoring browser `Do Not Track` (DNT) and `Global Privacy Control` (GPC).
- **Staff Exclusion:** Authenticated staff actions and admin sessions are excluded from public analytics figures.
- **Attribution Truth:** Confirmed booking and archive submission totals are computed from backend database records, never from client-claimed conversion pixels.
- **Art Project Scope:** Gaza Gateway provides commemorative art installations, symbolic free bookings, dynamic tickets, and historical archive dossiers. It conducts **no real flight operations, payments, commercial ticketing, live airline check-in, or GDS integrations**.

---

## 5. Machine Contracts & API Specifications

Authoritative machine contracts and schema definitions are maintained in `docs/backend/`:

| Contract File | Purpose & Scope |
|---|---|
| **[docs/backend/README.md](backend/README.md)** | Comprehensive backend contract guide: wire format, schemas, relational data model, RBAC permissions, and storage key classification |
| **[docs/backend/openapi.v1.json](backend/openapi.v1.json)** | Complete OpenAPI 3.1.0 specification (140 operations across 132 paths) |
| **[docs/backend/operation-policies.v1.json](backend/operation-policies.v1.json)** | Machine authorization rules and HTTP policies per operation |
| **[docs/backend/identity-lifecycle.v1.json](backend/identity-lifecycle.v1.json)** | Passenger and staff identity state machine definitions |
| **[docs/backend/inventory-payment.v1.json](backend/inventory-payment.v1.json)** | Free booking inventory reservation and ticket generation contract |
| **[docs/backend/publication-lifecycle.v1.json](backend/publication-lifecycle.v1.json)** | CMS revision, draft staging, and publication concurrency contract |
