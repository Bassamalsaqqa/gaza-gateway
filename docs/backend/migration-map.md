# Client-to-Server Data Migration & Seed Mapping Matrix

Status: Phase 12 design complete / awaiting independent GitHub review
**Date**: 2026-10-09
**Scope**: Source-Backed Inventory of All 17 Browser-Local Storage Authorities, Seed Strategies & Cutover Invariants

---

## 1. Storage Authority Classification Overview

The browser-local prototype environment utilizes seventeen distinct localStorage keys throughout `src/`. To transition safely to a persistent production database during Phase 13G without corrupting live truth, violating user privacy, or ingesting synthetic test artifacts, every local authority is assigned an exact lifecycle disposition:

| Classification            | Meaning & Server Disposition                                                                                                                                                                                                 |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`seed`**                | Authoritative, compiled domain reference data compiled in source code; loaded directly into server tables during database initialization via `DatabaseSeeder`. Local browser edits are discarded or quarantined.             |
| **`migrate`**             | Real user data that may be uploaded to server tables strictly with explicit user consent, preview verification, and schema validation during authenticated cutover (`POST /api/v1/migration/passenger`).                     |
| **`discard`**             | Ephemeral, mock, synthetic, or obsolete keys that are permanently purged during cutover. Never promoted to production server truth.                                                                                          |
| **`legacy_backup`**       | Historical prototype snapshots preserved in a local browser archive export for owner record-keeping, but **never inserted into live production operational or booking tables**.                                              |
| **`client_preference`**   | Harmless browser UI state (locale) that permanently remains in browser storage and is never persisted on the server.                                                                                                         |
| **`ephemeral_draft_pii`** | Sensitive multi-step booking wizard draft containing personal data. Retained in browser localStorage with finite TTL (24h); purged immediately upon checkout completion or manual reset; never logged to server diagnostics. |

---

## 2. Auditable Source Storage Authority Directory (All 17 Keys)

The table below provides a 100% source-grounded inventory of all seventeen storage keys across `src/`:

| #   | Storage Key                 | Source File Path & Constant / Type Export                                                                             | Version & Envelope Shape                                                                                                                              | Trusted Compiled Seed Source                                                                       | Untrusted Local Disposition                                     | Target Table / Schema                                                      |
| :-- | :-------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------- |
| 1   | **`gza.repo.v1`**           | `src/lib/repositories/storage.ts` (`REPO_STORAGE_KEY` / `RepoStorageV1`)                                              | `schemaVersion: 1`, `bookings: Booking[]`, `flightOverrides: Record<string, FlightOverride>`                                                          | `INITIAL_BOOKING_SEEDS` (`src/lib/domain/booking-seeds.ts`)                                        | **`legacy_backup`** (Never promoted to live truth)              | `bookings`, `booking_passengers`, `flight_overrides`                       |
| 2   | **`gza.passenger.v1`**      | `src/lib/passenger/storage.ts`, `domain.ts` (`PASSENGER_STORAGE_KEY` / `PassengerStorageV1`)                          | `schemaVersion: 1`, `account: PassengerAccount \| null`, `travelers: Traveler[]`                                                                      | Empty by default (starts null/`[]`)                                                                | **`migrate`** (Consented preview/commit)                        | `passenger_profiles`, `saved_travelers`                                    |
| 3   | **`gza.contact.v1`**        | `src/lib/contact/storage.ts`, `types.ts` (`CONTACT_STORAGE_KEY` / `ContactEnvelope`)                                  | `schemaVersion: 1`, `revision: number`, `messages: ContactMessage[]`                                                                                  | `src/lib/contact/seed.ts` (`CANONICAL_CONTACT_SEEDS` / `getCanonicalSeeds()`)                      | **`legacy_backup`** (Live inbox starts clean)                   | `contact_messages`, `contact_notes`, `contact_replies`                     |
| 4   | **`gza.commercial.v1`**     | `src/lib/commercial/storage.ts`, `types.ts` (`COMMERCIAL_STORAGE_KEY` / `CommercialCatalogStorageV1`)                 | `schemaVersion: 1`, `revision: number`, `catalog: CommercialCatalog`                                                                                  | `src/lib/commercial/seed.ts` (`seedCommercialCatalog()`)                                           | **`seed`** (Local edits quarantined)                            | `fare_products`, `cabin_pricing`, `baggage_policies`, `commercial_options` |
| 5   | **`gza.fleet.v1`**          | `src/lib/fleet/storage.ts`, `types.ts` (`FLEET_STORAGE_KEY` / `FleetEnvelopeV1`)                                      | `schemaVersion: 1`, `revision: number`, `aircraft: Aircraft[]`, `layouts: Record<string, AircraftLayout>`                                             | `src/lib/fleet/seed.ts` (`seedFleetEnvelope()`)                                                    | **`seed`** (Local edits quarantined)                            | `aircraft`, `seat_layouts`                                                 |
| 6   | **`gza.network.v1`**        | `src/lib/network/storage.ts`, `types.ts` (`NETWORK_STORAGE_KEY` / `NetworkEnvelopeV1`)                                | `schemaVersion: 1`, `revision: number`, `destinations: NetworkDestination[]`                                                                          | `src/lib/network/seed.ts` (`seedNetworkEnvelope()`)                                                | **`seed`** (Local edits quarantined)                            | `airports`, `network_routes`                                               |
| 7   | **`gza.schedule.v1`**       | `src/lib/schedules/storage.ts`, `types.ts` (`SCHEDULE_STORAGE_KEY` / `Schedule[]`)                                    | `Schedule[]` (JSON array of recurring schedule entries)                                                                                               | `src/lib/schedules/seed.ts` (`seedSchedules()`)                                                    | **`seed`** (Local edits quarantined)                            | `schedules`, `dated_services`                                              |
| 8   | **`gza.staff.v1`**          | `src/lib/staff/storage.ts`, `types.ts` (`STAFF_STORAGE_KEY` / `StaffEnvelopeV1`)                                      | `schemaVersion: 1`, `revision: number`, `staff: StaffMember[]`                                                                                        | `src/lib/staff/seed.ts` (`seedStaffEnvelope()`)                                                    | **`discard`** (Zero mock credentials ingested)                  | `staff_users` (seeded via fresh invite tokens)                             |
| 9   | **`gza.activity.v1`**       | `src/lib/activity/storage.ts`, `types.ts` (`ACTIVITY_STORAGE_KEY` / `ActivityEnvelopeV1`)                             | `schemaVersion: 1`, `revision: number`, `events: ActivityEvent[]`                                                                                     | Empty by default (`[]`)                                                                            | **`legacy_backup`** (Production audit starts clean)             | `audit_events`                                                             |
| 10  | **`gza.content.draft.v1`**  | `src/content/repository.ts` (`CONTENT_DRAFT_KEY`)                                                                     | `ContentDraftState` (`schemaVersion: 1`, `drafts: Partial<ContentMap>`)                                                                               | `src/content/published/` (8 compiled documents)                                                    | **`seed`** (Published documents seeded; local drafts previewed) | `content_documents`, `content_revisions`                                   |
| 11  | **`gza.settings.draft.v1`** | `src/lib/settings/storage.ts`, `src/lib/skin.ts` (`SETTINGS_DRAFT_KEY` / `SETTINGS_DRAFT_STORAGE_KEY`)                | `SettingsDraftEnvelope` (`schemaVersion: 1`, `site: { contact, appearance }`)                                                                         | `src/lib/settings/defaults.ts` (`PUBLISHED_CONTACT_SETTINGS`, `PUBLISHED_APPEARANCE_SETTINGS`)     | **`seed`** (Approved settings only; drafts discarded)           | `site_settings`                                                            |
| 12  | **`gza.archive.draft.v1`**  | `src/lib/archive/drafts/repository.ts` (`ARCHIVE_DRAFT_KEY`)                                                          | `ArchiveDraftEnvelope` (`schemaVersion: 1`, `revision: number`, `records`, `sources`)                                                                 | `src/lib/archive/catalog.ts` (`ARCHIVE_CATALOG`), `src/lib/archive/sources.ts` (`SOURCE_REGISTRY`) | **`seed`** (Default: `'hold-provenance'`)                       | `archive_records`, `archive_sources`, `media_assets`                       |
| 13  | **`gza.booking.draft.v1`**  | `src/lib/booking-draft/types.ts` (`BOOKING_DRAFT_STORAGE_KEY` / `BookingDraftEnvelopeV1`)                             | `schemaVersion: 1`, `status: "active" \| "cleared"`, `revision`, `submissionId`, `draft: BookingDraftState \| null` (tombstone prevents resurrection) | Empty by default                                                                                   | **`ephemeral_draft_pii`** (24h local TTL; purged on checkout)   | None (client wizard state only)                                            |
| 14  | **`gza.skin.preview.v1`**   | `src/lib/skin.ts` (`SKIN_PREVIEW_STORAGE_KEY`)                                                                        | Legacy theme/skin preview string / object                                                                                                             | None (superseded by `gza.settings.draft.v1`)                                                       | **`discard`** (Superseded by CSS design tokens)                 | None                                                                       |
| 15  | **`gza.admin.v1`**          | `src/lib/staff/session.ts`, `src/lib/repositories/storage.ts` (`ADMIN_STORAGE_KEY` / `LEGACY_ADMIN_KEY`)              | Legacy mock admin session payload                                                                                                                     | None (legacy prototype key)                                                                        | **`discard`** (Synthetic prototype session discarded)           | None                                                                       |
| 16  | **`gza.store.v1`**          | `src/lib/booking-draft/types.ts`, `src/lib/repositories/storage.ts` (`LEGACY_STORE_STORAGE_KEY` / `LEGACY_STORE_KEY`) | Legacy Phase 3 store payload                                                                                                                          | None (legacy prototype key)                                                                        | **`discard`** (Superseded in Phase 4)                           | None                                                                       |
| 17  | **`gza.lang`**              | `src/lib/i18n.tsx` (`STORAGE_KEY = "gza.lang"`)                                                                       | String: `"en" \| "ar"`                                                                                                                                | Default: `"en"`                                                                                    | **`client_preference`** (Persists locally in browser only)      | None                                                                       |

---

## 3. Domain Entity Field Mappings & Schema Reconciliation

### 3.1 Network Reference Authority (`gza.network.v1`)

- **Source**: `src/lib/network/types.ts` (`NetworkDestination`, `NetworkEnvelopeV1`) & `src/lib/network/seed.ts` (`seedNetworkEnvelope()`).
- **Target Tables**: `airports`, `network_routes`.
- **Classification**: **`seed`**.
- **Accurate Domain Fields**:
  - `destinations[].code`: Network destination IATA code (`NetworkCode`: `"AMM"`, `"CAI"`, `"IST"`, `"DOH"`, `"DXB"`, `"JED"`, `"RUH"`). Note: Primary hub airport is `"GZA"` (Gaza International Airport / Yasser Arafat International Airport). Fabricated destination codes like `"LHR"` do NOT exist in the network authority.
  - `destinations[].airportName`: Bilingual object `{ en: string, ar: string }` -> `airports.name_en`, `airports.name_ar`.
  - `destinations[].city`: Bilingual object `{ en: string, ar: string }` -> `airports.city_en`, `airports.city_ar`.
  - `destinations[].country`: Bilingual object `{ en: string, ar: string }` -> `airports.country_en`, `airports.country_ar`.
  - `destinations[].timezone`: IANA timezone string (e.g. `"Asia/Gaza"`, `"Asia/Amman"`, `"Africa/Cairo"`) -> `airports.timezone`.
  - `destinations[].blockMinutes`: Flight block time in minutes (number) -> `network_routes.block_minutes`.
  - `destinations[].active`: Boolean -> `network_routes.is_active`.
- **Inbound/Outbound Route Derivation**:
  In the operational network, flights operate bidirectionally between the `"GZA"` hub and each active outstation destination:
  - **Outbound routes**: `origin_code = 'GZA'`, `destination_code = destination.code` (direction `"out"`).
  - **Inbound routes**: `origin_code = destination.code`, `destination_code = 'GZA'` (direction `"in"`).
    Both directional segments share the same route block minutes (`blockMinutes`) and active status. Hub-and-spoke scheduling materializes corresponding paired dated services (`GZA -> dest` and `dest -> GZA`).
- **Handling**: Compiled seeds via `seedNetworkEnvelope()` are authoritative. Local browser edits are quarantined.

### 3.2 Fleet & Layout Authority (`gza.fleet.v1`)

- **Source**: `src/lib/fleet/types.ts` (`Aircraft`, `AircraftLayout`, `FleetEnvelopeV1`) & `src/lib/fleet/seed.ts` (`seedFleetEnvelope()`).
- **Target Tables**: `aircraft`, `seat_layouts`.
- **Classification**: **`seed`**.
- **Accurate Domain Fields**:
  - `aircraft[].id`: Stable immutable identifier (`"a320neo"`, `"a321neo"`, `"b737800"`). Note: Palestinian Airlines historical roster details (e.g. historical DC-3/F27/Dash 8) are not active fleet aircraft.
  - `aircraft[].model`: Bounded model string (e.g. `"Airbus A320neo"`, `"Airbus A321neo"`, `"Boeing 737-800"`).
  - `aircraft[].registration`: Normalized uppercase registration (e.g. `"PS-GZA"`, `"PS-GZB"`, `"PS-GZC"`).
  - `aircraft[].active`: Boolean (`true` for a320neo and a321neo; `false` for b737800 in seed).
  - `layouts`: Keyed dictionary `Record<string, AircraftLayout>` mapping `aircraftId` to its physical geometry.
  - `layouts[aircraftId].rows`: Integer row count (1..60).
  - `layouts[aircraftId].letters`: Uppercase single letter array (e.g. `["A", "B", "C", "D", "E", "F"]`).
  - `layouts[aircraftId].aisleAfter`: Single aisle column index (e.g. `3` for 3-3 configuration).
  - `layouts[aircraftId].zones`: Array of `SeatZone` (`{ id: CabinId, firstRow: number, lastRow: number }`) where `CabinId` is `"economy" | "premium" | "business"`. Zones cover rows 1..rows without gaps or overlaps.
  - `layouts[aircraftId].extraLegroomRows`: Array of row numbers offering extra legroom.
  - `layouts[aircraftId].unavailable`: Array of structurally unavailable seat codes (e.g. `["33B", "33E"]` on a321neo).
- **Handling**: Production database is seeded directly from `seedFleetEnvelope()`. Derived capacity is strictly calculated from `rows * letters.length - unavailable.length`.

### 3.3 Recurring Schedule Authority (`gza.schedule.v1`)

- **Source**: `src/lib/schedules/types.ts` (`Schedule`, `ScheduleException`) & `src/lib/schedules/seed.ts` (`seedSchedules()`).
- **Target Tables**: `schedules`, `dated_services`.
- **Classification**: **`seed`**.
- **Accurate Domain Fields**:
  - `id`: Exact schedule ID string (e.g. `"sch-AMM-out"`, stored as `TEXT`).
  - `number`: Flight number (e.g. `"PS100"`, `"PS101"`).
  - `direction`: Route direction (`"out"` = GZA -> destination; `"in"` = destination -> GZA).
  - `destination`: Destination airport code (`"AMM"`, `"CAI"`, etc.).
  - `days`: Operating days of week (`number[]` strictly using 0 = Sunday .. 6 = Saturday).
  - `departTime`: Planned departure time string `HH:mm`.
  - `arriveTime`: Planned arrival time string `HH:mm`.
  - `aircraft`: Aircraft model display name string.
  - `aircraftId`: Optional fleet airframe ID string.
  - `from`: ISO start date `YYYY-MM-DD`.
  - `until`: ISO end date `YYYY-MM-DD`.
  - `active`: Boolean indicating whether schedule is active for planning.
  - `exceptions`: Array of `ScheduleException` with structured effect unions (`"cancelled"`, `"time"`, `"aircraft"`, `"extra"`).
- **Handling**: Seeded via `seedSchedules()`. Triggers materialization of `dated_services` for rolling operational window using canonical `datedServiceId(scheduleId, date)`.

### 3.4 Commercial Catalog Authority (`gza.commercial.v1`)

- **Source**: `src/lib/commercial/types.ts` (`CommercialCatalog`, `FareProduct`, `BaggagePolicy`, `CatalogOption`) & `src/lib/commercial/seed.ts` (`seedCommercialCatalog()`).
- **Target Tables**: `fare_products`, `cabin_pricing`, `baggage_policies`, `commercial_options`.
- **Classification**: **`seed`**.
- **Accurate Domain Fields**:
  - `fares`: Array of `FareProduct` (`id`: `"essential" | "classic" | "flex"`, `multiplier: number`, `allowedCabins: ["economy", "premium", "business"]`, `order: number`, `active: boolean`).
  - `cabins`: Array of `CabinPricing` (`id`: `"economy" | "premium" | "business"`, `multiplier: number`).
  - `baggage`: `BaggagePolicy` (`cabinKg: 7`, `cabinDims: "55 × 40 × 20 cm"`, `checkedKg: 23`, `extraBagPrice: number`, `note: { en, ar }`).
  - `meals`: Array of `CatalogOption` (`id`, `label: { en, ar }`, `active: boolean`, `order: number`).
  - `defaultMealId`: String (`"standard"`).
  - `assistance`: Array of `CatalogOption` (`id`, `label: { en, ar }`, `active: boolean`, `order: number`).
- **Handling**: Seeded via `seedCommercialCatalog()`. Money boundary: `extraBagPrice` $35 is converted via exact decimal adapter to `extraBagPriceMinor` 3500 cents (USD minor) with zero silent `Math.round()`. Multipliers remain unitless ratios. All 10 commercial mutation families map to server-authorized operations with receipts (`CommercialMutationReceipt`). Obsolete standalone ancillary placeholders removed.

### 3.5 Historical Archive Catalog Authority (`gza.archive.draft.v1`)

- **Source**: `src/lib/archive/types.ts` (`ArchiveRecord`, `SourceRecord`, enums), `src/lib/archive/catalog.ts` (`ARCHIVE_CATALOG`), and `src/lib/archive/sources.ts` (`SOURCE_REGISTRY`).
- **Target Tables**: `archive_records`, `archive_sources`, `media_assets`.
- **Classification**: **`seed`**.
- **Accurate Domain Enums (Preserved Exactly from Source)**:
  - `Medium`: `"photograph" | "document" | "video" | "illustration"` (preserves `"illustration"`!).
  - `HistoricalPhase`: `"planning-construction" | "opening-golden-era" | "closure-destruction" | "post-destruction-ruins" | "contemporary-status"`.
  - `ArchiveSubject`: `"airport-architecture" | "operations-services" | "interior-passenger-spaces" | "aircraft-fleet" | "crew-staff" | "passengers-pilgrimage" | "humanitarian-aviation" | "official-visits" | "damage-ruins" | "documents-ephemera" | "illustrations"`.
  - `EvidenceStatus`: `"verified" | "partially-verified" | "unverified"`.
  - `DatePrecision`: `"exact" | "month" | "year" | "circa" | "unknown"`.
  - `PublicationState`: `"published" | "staging" | "hold-rights" | "hold-provenance" | "excluded"` (with hyphens!).
  - `PublicationBasis`: `"rights-cleared" | "product-owner-directed-display" | "external-embed"`.
  - `RightsStatus`: `"owner-cleared" | "public-domain" | "licensed" | "attribution-license" | "rights-managed" | "unknown"`.
  - `SourceType`: `"treaty" | "official-record" | "press" | "archive" | "academic" | "video"`.
- **Accurate Record Fields**:
  - `ArchiveRecord`: `id`, `slug`, `medium`, `phase`, `subjects`, `title: { en, ar }`, `caption: { en, ar }`, `alt: { en, ar }`, optional `date`, `datePrecision`, optional `people`, `location`, `mediaId`, `youtubeId`, `evidenceStatus`, `sourceRefs: string[]`, `rights: ArchiveRights`, `publicationState` (default `'hold-provenance'`), `publicationBasis`, `curatorPublicationStatus`, `relatedTimelineEventIds`, `relatedRecordIds`, `featured`, `originalFilename`, `intakeReference`, `duplicateOf`, `factCheckNotes`.
  - `SourceRecord`: `id`, `title`, optional `titleAr`, `publisher`, `type: SourceType`, `language: "en" | "ar" | "he" | "multilingual"`, optional `publicationDate`, `eventDate`, `url`, `accessedAt`, optional `archivalStatus: "live" | "archived-wayback" | "official-repository" | "print-record"`, optional `notes`, `notesAr`.
- **Handling**: Compiled intake records seeded directly from `ARCHIVE_CATALOG` and `SOURCE_REGISTRY`. Default publication state is strictly `'hold-provenance'`; never upgraded without explicit provenance clearance.

### 3.6 CMS Documents Authority (`gza.content.draft.v1`)

- **Source**: `src/content/types.ts` (`ContentMap`, `ContentDocument`, `ContentKey`), `src/content/inventory.ts`, & `src/content/published/*`.
- **Target Tables**: `content_documents`, `content_revisions`.
- **Classification**: **`seed`**.
- **Accurate Domain Documents (The 8 ContentMap Keys)**:
  1. `"home"`: `HomeContent` (`copy: Record<HomeCopyKey, LocalizedText>`, `sections: HomeSection[]` where `HomeSectionId` = `"hero" | "search" | "board" | "heritage" | "destinations" | "manage" | "travel" | "archive"`).
  2. `"travel"`: `TravelContent` (`intro: { title, description }`, `sections: TravelGuideSection[]`).
  3. `"airport.past"`: `AirportPastContent` (`intro: { title, description, notice }`, `timeline: HistoricalTimelineEntry[]` with `evidence: EvidenceState`, `sourceRefs`).
  4. `"airport.present"`: `AirportPresentContent` (`intro: { title, subtitle, notice }`, `facts: AirportPresentFact[]`, `dossiers: AirportPresentDossier[]`, `spatial: AirportPresentSpatial`, `globalHorizons: AirportPresentGlobalHorizons`).
  5. `"airport.future"`: `AirportFutureContent` (`copy: Record<FutureCopyKey, LocalizedText>`).
  6. `"destinations.presentation"`: `DestinationsPresentationContent` (`assignments: DestinationPhotoAssignment[]`).
  7. `"destinations.editorial"`: `DestinationsEditorialContent` (`destinations: DestinationEditorialEntry[]`).
  8. `"pages.information"`: `InformationalPagesContent` (`pages: InformationalPageContent[]` covering `"about"`, `"contact"`, `"privacy"`, `"terms"`).
- **Envelope Common Shape**: Every document contains `id: K`, `kind: K`, `schemaVersion: 1`, and `seo: PageSeoContent` (`title`, `description`, optional `socialTitle`, `socialDescription`, `socialMediaId`).
- **Handling**: Compiled published documents from `src/content/published/` seeded into `content_documents`. Local drafts previewed in admin; never merge EN and AR into single strings.
- **Wire Contract & Concurrency Integration**:
  - `PUT /api/v1/cms/documents/{slug}` requires `expectedRevision >= 0` and enforces strict key-to-slug binding via `validateCmsDraftKeyBinding` (`{slug}` matches `payload.id` and `payload.kind`).
  - `POST /api/v1/cms/documents/{slug}/discard` reverts working draft to current published state.
  - Wire adapter `adaptCmsMutationReceiptToWire` maps source mutation receipts to `CmsDraftReceiptDto` (`{ slug, changed, revision }`).
  - In-memory `LocalContentRepository` verified for draft saving, identical payload no-ops, stale `expectedDraft` conflict rejection, and discard no-ops.

### 3.7 Repository Bookings & Flight Overrides (`gza.repo.v1`)

- **Source**: `src/lib/repositories/storage.ts` (`RepoStorageV1`), `src/lib/domain/booking.ts` (`Booking`), `src/lib/domain/flight.ts` (`FlightOverride`).
- **Target Tables**: `bookings`, `booking_passengers`, `flight_overrides`.
- **Classification**: **`legacy_backup`**.
- **Codex Invariant**: `gza.repo.v1` stores both bookings and operational flight overrides. **They are NEVER promoted to live server truth**. Prototype bookings were created without merchant payment capture; production booking and flight tables begin with a clean baseline derived exclusively from published recurring schedules and real incoming payments.

### 3.8 Passenger Identity & Saved Travelers (`gza.passenger.v1`)

- **Source**: `src/lib/passenger/domain.ts` (`PassengerAccount`, `Traveler`, `PassengerStorageV1`), `src/lib/passenger/storage.ts`.
- **Target Tables**: `passenger_profiles`, `saved_travelers`.
- **Classification**: **`migrate`** (Opt-In with Explicit User Consent).
- **Accurate Domain Fields & Storage Authority**:
  - Authority is `PassengerStorageV1` (`account: PassengerAccount | null`, `travelers: Traveler[]`).
  - `account`: `PassengerAccount` (`email`, `firstName`, `lastName`, `phone`, `seatPreference`, `mealPreference`, `newsletter`). Account email matches user login email and is immutable on profile update.
  - `travelers`: Array of `Traveler` (`id`, `firstName`, `lastName`, `dob`, `nationality`, `document`).
    - Client traveler `id` (`trv-...` or legacy fallback string) maps to `saved_travelers.external_id`, scoped uniquely per owner (`UNIQUE(owner_user_id, external_id)`). The server assigns a primary UUID `saved_travelers.id` while retaining and returning the client/domain `id` in wire DTOs.
    - Single-name travelers are accepted (at least one of `firstName` or `lastName` required).
    - Free-text `nationality` (e.g. `"Palestinian"`) is preserved without truncation or 2..3-character ISO restrictions.
    - Valid ISO calendar `dob` (`YYYY-MM-DD`).
    - Conflicting alias fields (`dateOfBirth`, `passport`) are strictly rejected by migration preview and commit.
- **Migration Protocol**:
  1. Authenticated passenger logs into production account (`PassengerCookieAuth`).
  2. Client inspects local storage for profile/traveler data and requests preview: `POST /api/v1/migration/passenger/preview`.
  3. Server validates schema, normalizes names, and issues preview receipt hash.
  4. User confirms consent -> `POST /api/v1/migration/passenger/commit` with preview hash.
  5. Local records marked migrated and cleared from browser storage.

### 3.9 Customer Enquiries Inbox (`gza.contact.v1`)

- **Source**: `src/lib/contact/types.ts` (`ContactMessage`, `ContactEnvelope`), `src/lib/contact/storage.ts`, and `src/lib/contact/seed.ts` (`CANONICAL_CONTACT_SEEDS`, `getCanonicalSeeds()`).
- **Target Tables**: `contact_messages`, `contact_notes`, `contact_replies`.
- **Classification**: **`legacy_backup`**. Live contact inbox starts clean in production; compiled seed messages (`getCanonicalSeeds()`) are imported in demo/staging environments only.
- **Accurate Domain Fields**:
  - `messages[].id`: Message identifier string -> `contact_messages.id`.
  - `messages[].submissionId`: Idempotent submission tracking UUID -> `contact_messages.submission_id`.
  - `messages[].senderName`: Submitting sender's name -> `contact_messages.sender_name`.
  - `messages[].email`: Submitter contact email -> `contact_messages.email`.
  - `messages[].topic`: Support category (`"booking" | "baggage" | "accessibility" | "archive" | "media" | "other"`) -> `contact_messages.topic`.
  - `messages[].message`: Inbound inquiry message body -> `contact_messages.message`.
  - `messages[].language`: Language code (`"en" | "ar"`) -> `contact_messages.language`.
  - `messages[].bookingRef`: Optional PNR reference -> `contact_messages.booking_ref`.
  - `messages[].status`: Workflow status (`"new" | "open" | "resolved" | "spam"`) -> `contact_messages.status`.
  - `messages[].source`: Origin (`"public-contact" | "seed"`) -> `contact_messages.source`.
  - `messages[].assignedStaffId`: Optional assigned staff UUID -> `contact_messages.assigned_staff_id`.
  - `messages[].replyDraft`: Optional unsent reply draft -> `contact_messages.reply_draft`.
  - `messages[].internalNotes`: Array of `InternalNote` (`id`, `body`, `createdAt`, `staffId`, `staffName`) -> `contact_notes`.
- **Wire Contract & Concurrency Integration**:
  - `POST /api/v1/contact` accepts `CreateContactMessageRequest` and emits a minimal public acknowledgement receipt (`ContactSubmissionReceiptDto`) that strictly omits internal notes, reply drafts, and email PII.
  - Replay idempotency: creating with matching `submissionId` returns existing enquiry without duplicate database insertion; conflicting payloads are rejected with `409 Conflict`.
  - Staff inbox operations: `PATCH /api/v1/admin/contact/inbox/{id}/status` emits `ContactStatusReceiptDto`, `PATCH /api/v1/admin/contact/inbox/{id}/assign` emits `ContactAssigneeReceiptDto`, and `PUT /api/v1/admin/contact/inbox/{id}/reply-draft` updates draft on `ContactMessageDto` (returned in `ContactMessageDetailResponse`). All staff operations require `engagement.edit`.
  - In-memory `LocalContactRepository` verified for message creation, replay idempotency, status transitions, staff assignment/unassignment, internal notes, and reply draft persistence.

### 3.10 Staff Directory (`gza.staff.v1`)

- **Source**: `src/lib/staff/types.ts` (`StaffMember`, `StaffEnvelopeV1`), `src/lib/staff/storage.ts`.
- **Target Table**: `staff_users`.
- **Classification**: **`discard`**.
- **Codex Invariant**: Synthetic prototype credentials (`gza-admin`) and mock staff accounts are **permanently discarded**. Production staff accounts are created via invitation links with mandatory Argon2id passwords and TOTP MFA setup. Zero prototype credentials are ever ingested.

### 3.11 Administrative Activity Log (`gza.activity.v1`)

- **Source**: `src/lib/activity/types.ts` (`ActivityEvent`, `ActivityEnvelopeV1`), `src/lib/activity/storage.ts`.
- **Target Table**: `audit_events`.
- **Classification**: **`legacy_backup`**. Production audit log starts clean in the append-only `audit_events` table.

### 3.12 Active Multi-Step Booking Wizard Draft (`gza.booking.draft.v1`)

- **Source**: `src/lib/booking-draft/types.ts` (`BOOKING_DRAFT_STORAGE_KEY` / `BookingDraftEnvelopeV1`), `src/lib/booking-draft/storage.ts`.
- **Classification**: **`ephemeral_draft_pii`**.
- **Handling**: Contains passenger names, dates of birth, and travel document numbers. Stored strictly in local browser storage with 24-hour expiration. Cleared immediately upon booking completion. Never transmitted to server diagnostic logs.

### 3.13 Site Settings Drafts (`gza.settings.draft.v1`)

- **Source**: `src/lib/settings/types.ts` (`SettingsDraftEnvelope`), `src/lib/settings/storage.ts`.
- **Target Table**: `site_settings`.
- **Classification**: **`seed`** (Approved settings only; uncommitted drafts discarded).
- **Wire Contract & Concurrency Integration**:
  - Gated strictly on `StaffCookieAuth` with `admin.manage` permission (denying staff with `engagement.edit` alone).
  - Pure bidirectional wire adapters: `sourceContactSettingsToWire`, `wireContactSettingsToSource`, `sourceAppearanceSettingsToWire`, `wireAppearanceSettingsToSource`.
  - Rejects malformed email/phone, non-HTTPS social URLs, and forbidden aliases (`linkedIn`, `tiktok`).
  - Appearance settings canonicalize legacy `gza-geometric` alias to `pie-factory`.
  - Mutation receipts emit `SettingsDraftReceiptDto` (`{ key: "contact" | "appearance", changed: boolean, revision: number }`).
  - In-memory `LocalSettingsRepository` verified for draft saving, sibling contact/appearance preservation, and discard no-ops.

### 3.14 Legacy Theme Preview (`gza.skin.preview.v1`)

- **Source**: `src/lib/skin.ts` (`SKIN_PREVIEW_STORAGE_KEY`).
- **Classification**: **`discard`**. Superseded by `gza.settings.draft.v1` and CSS design tokens.

### 3.15 Legacy Admin Session (`gza.admin.v1`)

- **Source**: `src/lib/staff/session.ts` (`ADMIN_STORAGE_KEY`), `src/lib/repositories/storage.ts` (`LEGACY_ADMIN_KEY`).
- **Classification**: **`discard`**. Prototype session discarded.

### 3.16 Legacy Phase 3 Store (`gza.store.v1`)

- **Source**: `src/lib/booking-draft/types.ts` (`LEGACY_STORE_STORAGE_KEY`), `src/lib/repositories/storage.ts` (`LEGACY_STORE_KEY`).
- **Classification**: **`discard`**. Superseded in Phase 4.

### 3.17 Client Language Preference (`gza.lang`)

- **Source**: `src/lib/i18n.tsx` (`STORAGE_KEY = "gza.lang"`).
- **Classification**: **`client_preference`**. Stored purely in browser storage for instant client rendering. Zero server persistence.

---

## 4. Cutover Gating & Rollback Criteria

The Phase 13G production cutover requires passing all five gates:

- [ ] **Gate 1: Reference Seed Verification**: All network destinations (7), fleet airframes (3), seat layouts (3), recurring schedules, and commercial fares seeded and verified by checksum against compiled source code.
- [ ] **Gate 2: Zero Prototype Credentials**: Verification confirms zero prototype accounts (`gza-admin`) or default passphrases exist in `staff_users`.
- [ ] **Gate 3: Clean Audit Log**: `audit_events` contains zero imported mock records.
- [ ] **Gate 4: Rehearsal Import Complete**: Migration preview and commit tested in staging environment with 100% success on test passenger payloads.
- [ ] **Gate 5: Client Fallback Preserved**: If the server API is unavailable during cutover rehearsal, the client displays an offline banner without crashing.
