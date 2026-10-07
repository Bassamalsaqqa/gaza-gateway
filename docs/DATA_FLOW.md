# Data Flow, State Management & Pretend-Action Inventory

> **Document Purpose**: Complete audit of current data sources, state persistence, cross-screen entity splits, and enabled no-op actions across public and admin workspaces.
> **Status**: **Phase 6B - Complete / Accepted Source / Accepted Release / Deployed by Owner.** Phase 6C - Admin Directory, Staff & Activity Convergence is **Complete / Accepted Source**. Phase 6 engineering implementation is complete; Phase 6 is Complete / Accepted Source, published to main at `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Production remains owner-deployed consolidated Phase 6B. The final Phase 6 static package is published; Phase 6C owner deployment is not confirmed. Phase 7 is Implemented / Awaiting Independent Review; Phase 7B remains Planned / Unstarted. Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source.
> **Production / Source Checkpoint**: Current owner-deployed production release: `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`; deployed runtime source: `2749c26714258871c32bd2b14a75fc4e87a68b62`. Deployment is confirmed by the product owner. AGY reported HTTP 200 for targeted route checks; no independent live bundle verification claimed. Historical Phase 6A: Complete / Accepted Source / Accepted Release / Deployed by Owner, engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`, source `2ae1a876018992649074cbed1ebf0560e4da03ff`, release `b5cff4db4b6e087907a9733ffd841880439fbfdb`. Phase 5D is a historical completed phase. Earlier production checkpoints remain historical.
> **Immediate Next Step**: Independent review of the pushed Phase 7 CMS candidate. Phase 7B remains Planned / Unstarted.


---


## 1. Current State Stores & Persistence

After accepted Phase 6 source publication, Phase 7 extends editorial workflows without changing operational persistence authority.

| Store / Source | Implementation Files | Persistence | Entities & Data Types Managed |
| :--- | :--- | :--- | :--- |
| **Commercial catalog** | `src/lib/commercial/` | `gza.commercial.v1` schemaVersion 1 / revision | Fares, cabin prices, baggage and option lifecycle. Historical PNR basis stays in Booking. |
| **Fleet & Seat Layout Authority** (`FleetRepository`) | `src/lib/fleet/` | `localStorage["gza.fleet.v1"]` (schemaVersion: 1) | Canonical aircraft fleet types (`Aircraft[]`) and physical seat layout definitions (`AircraftLayout records`). Dynamic seat map rendering, roving focus, cabin zones, and booking layout snapshots. |
| **Canonical Contact State** (`ContactRepository`) | `src/lib/contact/` | `localStorage["gza.contact.v1"]` (schemaVersion: 1) | Customer contact enquiries (`ContactMessage[]`), status transitions (`new`, `open`, `resolved`, `spam`), internal notes, staff assignment, and local reply drafts. Serialized coordinator, seed anti-resurrection on empty storage, cross-tab synchronization. |
| **Canonical Booking Draft** (`BookingDraftRepository`) | `src/lib/booking-draft/` | `localStorage["gza.booking.draft.v1"]` (schemaVersion: 1) | Active booking wizard draft (`BookingDraft`). 5 storage states, serialized mutation queue, tombstone anti-resurrection, cross-tab synchronization. |
| **Canonical Repositories** (`BookingRepository`, `FlightRepository`) | `src/lib/repositories/`, `src/lib/domain/` | `localStorage["gza.repo.v1"]` (schemaVersion: 1) | Canonical bookings (`Booking[]`) and mutable operational flight overrides (`flightOverrides: Record<string, FlightOverride>`). Single source of truth for public and admin views. Synchronized across tabs via `subscribeToStorage()`. |
| **Canonical Passenger State** (`PassengerRepository`) | `src/lib/passenger/` | `localStorage["gza.passenger.v1"]` (schemaVersion: 1) | Canonical passenger account (`PassengerAccount \| null`), profile preferences, and saved companions (`Traveler[]`). Migrated once from `gza.store.v1` only if absent; present empty state is authoritative. Synchronized across tabs via `subscribe()`. |
| **Published Editorial Content** | `src/content/published/` | Compiled source in static output | Eight typed documents: Home, Travel, Past, Present, Future, destination presentation/editorial and informational pages. Normal public URLs never read local drafts. |
| **Historical Archive & Source Registry (HC-2 / HC-3)** | `src/lib/archive/` | Compiled typed catalog (`catalog.ts`), schema (`schema.ts`), and registry (`sources.ts`) | Canonical archive records (`getPublishedArchiveRecords()`) for public Gallery (`/gallery`), Home archive spotlight (6 featured cards), Airport Past documentary strips (`getPublishedArchiveRecordsForTimelineEvent()`) and watch archive section (`getVerifiedVideoReferences()`). Curated external primary sources (`SOURCE_REGISTRY`). Zero local video files. |
| **Local Editorial Drafts** | `src/content/repository.ts` | `gza.content.draft.v1` schemaVersion 1 | Shared ContentRepository; detached validated writes, stale-baseline conflicts, typed failures without repair, explicit post-hydration preview and isolated Studio. All bounded CMS editors integrated and reviewed. |
| **Legacy Store Key** | Preserved read-only migration source | `localStorage["gza.store.v1"]` | Closed legacy store. Migrated once to `gza.booking.draft.v1` if canonical draft is missing. ZERO active draft writers; original string preserved byte-for-byte; never resurrected once cleared. |
| **Admin Staff Session / RBAC Simulation** (`useAdmin`) | `src/lib/admin-store.tsx` | `localStorage["gza.admin.v1"]` (staffId) | Staff identity (`Staff \| null`), active role (`AdminRole`). AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. |
| **Recurring schedule planning** | `src/lib/schedules/` | `gza.schedule.v1`; version 1, revision, schedules; queued Web Lock commits | Admin Schedule Manager and related destination schedules; current dated-service discovery through the shared resolver. |
| **Network reference** | `src/lib/network/` | `gza.network.v1`; version 1, revision, destinations | Fixed airport reference identities, operational destination editing and Schedule route validation; no CMS/pricing/materialization. |
| **Remaining Admin Fixtures** | `src/lib/admin-mock.ts` | Static fixtures | Deferred media/analytics/remaining UI fixtures only; staff/customer/activity and operational authorities were retired from fixture consumption in Phase 6. Phase 7 CMS fixture writers have been retired. |
| **Settings Draft Store** (Contact & Appearance) | `src/lib/settings/` | `localStorage["gza.settings.draft.v1"]` (schemaVersion: 1) | Multi-document envelope (`{ schemaVersion: 1, site: { contact?, appearance? } }`). Independent per-document save/discard. Active in Admin Settings and explicit `?settingsPreview=1` / `?skinPreview=1`. |
| **Appearance Legacy Key** | `src/lib/skin.ts` | `localStorage["gza.skin.preview.v1"]` | Legacy working copy. Migrated deterministically into `gza.settings.draft.v1` on first load; left byte-for-byte untouched. No dual writes. |

### 1.1 Admin Flight Overrides Implementation Reality

In `src/lib/repositories/flight-repository.ts` and the migrated query/mutation consumers:
- Canonical flight overrides are stored in `gza.repo.v1` as `flightOverrides: Record<string, FlightOverride>` via `FlightRepository.setOverride(flightId, patch)`.
- Overrides are applied using the pure `getEffectiveFlight(baseFlight, override?)` helper in `src/lib/domain/flight.ts`, which merges base flight objects with active overrides.
- Overrides are sanitized on load (`sanitizeFlightOverride()`) to validate flight statuses and trim string fields while allowing intentional clears.
- Legacy `gza.admin.v1` overrides are migrated into `gza.repo.v1` on first load. A sentinel protection ensures canonical flight operations do not modify `gza.admin.v1`, and staff changes preserve legacy overrides.
- Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly. Public boards/detail and booking discovery use the same effective-flight authority. AdminProvider has no override mutation facade or mirrored override state.

### 1.2 Public Booking Draft & Date Synchronization Reality

In `src/lib/booking-draft/` and its draft factories:
- Search criteria in `createFreshDraft()` computes departure date using station timezone policy (`todayISO(now, "Asia/Gaza")` from `src/lib/data.ts`).
- Active draft mutations persist through BookingDraftRepository to `gza.booking.draft.v1` and are sanitized by the canonical draft coordinator:
  - If departure date is in the past relative to station date, rolls forward to `todayISO()`.
  - Re-evaluates bookability via `isFlightBookable(outboundFlight)`: if unbookable, clears flight selection and dependent seat selections.
  - Preserves entered passenger names, dates of birth, and contact information even if flight criteria roll forward.
  - Calculates maximum accessible wizard step (`calculateMaxStep`), clamping wizard progression to Step 1 (flight selection) or Step 3 (passenger details) if prerequisites are missing.

### 1.3 Canonical Passenger State & Auth-Truth Reality (`gza.passenger.v1`)

In `src/lib/passenger/`:
- **Single Source of Truth**: `PassengerRepository` manages canonical passenger identity (`PassengerAccount | null`) and saved companions (`Traveler[]`) stored under `localStorage["gza.passenger.v1"]`.
- **Anti-Resurrection Rule**: Migration from `gza.store.v1` occurs **only** when `gza.passenger.v1` is completely absent (`null`). If `gza.passenger.v1` is present (even with a null account or empty travelers), legacy values are never resurrected.
- **No Dual Writer**: StoreProvider is a booking compatibility reader/writer facade over BookingRepository; it does not own passenger/draft persistence. Canonical draft and passenger repositories never write their mutations back to `gza.store.v1`.
- **Identity Normalization & Email Immutability**: All email inputs are trimmed and lowercased (`normalizeEmailIdentity`). Updating profile preferences preserves the original identity email; email cannot be changed through profile save.
- **Transactional Persistence**: `PassengerStorageCoordinator` builds state candidates, writes to storage, and only adopts and notifies subscribers if storage succeeds. Quota errors reject with `StorageCommitError` and roll back memory.
- **Auth Truth & Privacy**: There is no live backend, database, or authentication API. Sign-in and register adopt local identity on this device. Password fields are never compared, persisted, hashed, logged, or placed in URLs. Near-form disclosure states that password authentication is not connected.
- **Hardened Booking Claims**: Unowned bookings matching the passenger's contact email can be claimed. Rejects if owned by another account (`"owned-by-another"`) or contact email mismatches (`"contact-mismatch"`). Idempotent if already owned (`"already-owned-by-user"`). Contact email on the booking remains unmodified.

### 1.4 Appearance Studio & Settings Draft Reality (`gza.settings.draft.v1`)

In `src/lib/settings/`, `src/lib/skin.ts`, and `src/components/admin/appearance-studio/`:
- **In-Memory Working Preview & Preview Isolation**: Working edits made in Appearance Studio do not touch storage on each control change. They update local in-memory React state and synchronize immediately to the embedded preview iframe via the typed `postMessage` protocol (`STUDIO_PROTOCOL_VERSION = "1.0.0"`).
- **Explicit Save Draft Authority**: The explicit "Save Draft" action commits the sanitized appearance configuration into canonical storage at `localStorage["gza.settings.draft.v1"]` under `site.appearance` via `SettingsRepository`.
- **Discard Draft**: "Discard Saved Draft" (`a2.se.discardSaved`) removes `site.appearance` from `gza.settings.draft.v1` and reverts the editor and preview frame to compiled published defaults (`PUBLISHED_APPEARANCE_SETTINGS`). "Discard Unsaved" reverts local in-memory edits back to the current saved baseline.
- **Legacy Migration & Writer Removal**: Legacy writer functions (`writePreviewSkin`, `clearPreviewSkin`) are completely removed from `src/lib/skin.ts`. The legacy storage key `localStorage["gza.skin.preview.v1"]` is strictly read-only and serves as an unmutated migration fallback on first load. Once migrated or discarded, legacy resurrection is prevented by tombstone semantics.
- **Clean / Dirty Cross-Tab Synchronization**: When an external tab saves or discards a draft, clean editors (local in-memory state matches the previous saved baseline) automatically adopt the external saved state and sync their iframe. Dirty editors preserve uncommitted in-memory edits while learning the updated saved baseline and displaying a restrained bilingual external-change notice.
- **Public URL Immunity**: Ordinary public visits never read or apply draft settings. Compiled defaults (`DEFAULT_SITE_SKIN` and `DEFAULT_SURFACE_GRAMMAR_CONFIG`) render statically. Only routes with explicit query opt-in (`?skinPreview=1`, `?settingsPreview=1`) apply saved drafts after safe hydration.
- **Studio Scenario Fixtures**: In `studioPreview=1`, preview routes bypass `localStorage["gza.store.v1"]` mutations, rendering deterministic in-memory fixtures to prevent test booking debris from polluting user storage.
- **Export Action**: The Appearance Studio provides a bounded "Export appearance configuration" dialog (`gza.appearance.v1`) that serializes sanitized working configuration for copying or JSON file download without requiring a persistent backend or fake global Publish mutation.

### 1.5 Simulation Boundary & Security Declarations

- **Staff and Passenger Authentication**: Pure client-side simulation. Mock passphrases and email logins set local state tokens (`localStorage["gza.admin.v1"]` and `localStorage["gza.passenger.v1"]`). There is no session token verification, token rotation, or server-side authorization. Passwords are never stored, verified, or hashed.
- **Financial & Commercial Boundary**: The booking wizard concludes at Step 6 (Review & Confirmation) with PNR generation (e.g. `GZA-7K8P`). No real payment gateway, merchant facility, or financial processing exists. Payment card inputs are simulated and discarded.
- **Secrets & Customer Privacy**: Zero real secrets, database credentials, payment card data, or private customer PII belong in client repositories or bundles. All customer profiles and staff accounts are synthetic fixtures.
- **React Query Status**: `@tanstack/react-query` is mounted at the root (`QueryClientProvider`). Phase 4 added canonical booking and flight query keys, and Phase 5A added `passengerKeys`. Subscription invalidation keeps public, account, and admin views synchronized without full-page reloads.

### 1.5 Asset & Content Ingestion Protocol and Archival Truth

To maintain strict truth and prevent unverified imagery or text from entering the product:
1. **Master File Preservation**: Preserve uncompressed master files in local source storage prior to web asset generation.
2. **Truth & Rights Classification**: Every asset must be assigned a canonical `TruthClass` (`"future-concept-ai"`, `"historical-documentary"`, `"illustrative-photo"`, `"brand-mark"`, or `"placeholder"`), historical era, and verifiable provenance record.
3. **Optimized Variant Generation**: Output responsive WebP/AVIF variants with explicit intrinsic aspect ratios, capped at native dimensions. HC-3 owner archive derivatives use smaller responsive widths and native maxima; archival masters are never upscaled.
4. **Registration in `src/lib/media.ts`**: Declare stable semantic IDs (`future-hero`, `future-aerial-day`, etc.) and bilingual accessible descriptions (`altEn`, `altAr`).
5. **Content Workflow**: Home, Travel, Airport Past, and Airport Present published copy lives in compiled typed records. The Admin Travel editor saves a browser-local draft only; approved global publication requires a source update and verified HostPapa release. In HC-2, the public Gallery and Home archive preview were converged onto canonical `getPublishedArchiveRecords()` and `getAllSourceRecords()`. In HC-3, this was expanded with canonical intake of 67 records, explicit publication basis (`rights-cleared`, `product-owner-directed-display`, `external-embed`), 37 published photographs and 1 document, with 124 responsive WebP derivatives for the 37 owner records, and 4 verified external videos in a lightweight player without local video files.
6. **Strict Archival Truth**: Never present unlabeled material, mock data, or AI-generated concepts as historical evidence. Authentic documentary photos are presented without artificial truth badges over hero imagery; authentic archive provenance is provided via restrained editorial context and accessible attribution links; illustrative photos remain unbadged; AI future concepts must always display visible illustrative disclosure badges. Photographic assets are never mirrored. External video records are never rehosted or converted to local media.

### 1.6 Known SEO Gaps (Earmarked for Phase 11)

Identified SEO debt recorded for Phase 11 resolution without expanding Phase 3.9 scope:
1. **Arabic Homepage Metadata**: Ensure parity between English and Arabic `<title>`, `<meta name="description">`, and OpenGraph headers.
2. **Route Head Parity**: Provide unique canonical URLs and localized hreflang tags for all public routes (`/` vs `/ar`).
3. **Automated Sitemap & Robots**: Generate static `sitemap.xml` and `robots.txt` compatible with HostPapa Apache static hosting.
4. **Structured Data**: Implement JSON-LD schemas for `Airline`, `Airport`, and `FlightReservation` entities.


---


## 2. Public vs. Admin Entity Splits

Following Phase 4, bookings and operational flight overrides share canonical repository identity across public and admin views. Remaining splits exist only for features not yet migrated:

1. **Bookings — Converged**:
   - A passenger booking completed on `/book` writes to the canonical `BookingRepository` (`gza.repo.v1`).
   - The admin booking list (`/admin/bookings`), detail (`/admin/bookings/:ref`), and global search all query the same canonical `BookingRepository`. A public-created PNR appears immediately in the admin booking table and detail view. An empty repository correctly shows an empty list; a missing PNR correctly shows a not-found state.
   - `mockBookings` in `src/lib/admin-mock.ts` remains for non-migrated customer detail fixture references and migration-era sample data. It is never a fallback for a successfully resolved canonical booking list, detail, or global search.
2. **Check-in — Converged on Public Side & Admin Desk (Phase 6A)**:
   - Public Manage, Check-in, and Boarding Pass routes are 100% repository-native (`BookingRepository` + `FlightRepository`). When a passenger checks in via `/manage/:ref/check-in`, `useCompleteCheckInMutation` invokes `BookingRepository.completeCheckIn` which atomically persists passenger documents, leg seat assignments, and `checkedIn` indexes in a single coordinator transaction with full rollback on storage error.
   - The airport check-in desk monitor (`/admin/check-in`) converged in Phase 6A onto canonical `FlightRepository` and `BookingRepository`. It queries Gaza station departures (`originCode === "GZA"`), computes pure `buildAdminCheckInRows()` view models, enforces status precedence (`done` -> `closed` -> `docs` -> `seat` -> `ready`), performs real `completeCheckIn` and `undoCheckIn` mutations via the storage coordinator, and provides direct navigation to `/boarding-pass/$ref/$leg/$pax`.
3. **Contact & Inbox — Converged in Phase 5D**:
   - Public contact form submissions (`src/routes/{-$locale}.contact.tsx`) invoke `ContactRepository.create()` which validates input data, generates a client-side `submissionId`, and writes directly to canonical `localStorage["gza.contact.v1"]` via `ContactStorageCoordinator`.
   - The admin staff inbox (`src/routes/{-$locale}.admin.inbox.tsx`) queries this same canonical `ContactRepository`. Public submissions appear immediately in the inbox in their original language. Staff can transition status (`new` -> `open` -> `resolved` / `spam`), append internal notes with staff attribution, assign staff, and save local reply drafts.
   - The shell Inbox badge and Dashboard attention item (`att-inbox`) dynamically derive from `useContactNewCount()`, updating immediately across tabs and clearing when all messages are addressed.
4. **Flight Operations Overrides — Converged**:
   - When staff edit flight status (gate change, delay) in `/admin` via `flight-quick-edit.tsx`, the change is saved to the canonical `FlightRepository` (`gza.repo.v1`) via `flightRepo.setOverride()`.
   - Both admin and public views can access effective flights through repository query hooks with operational overrides merged.
5. **New Booking at Counter (`src/routes/{-$locale}.admin.bookings.new.tsx`) — Converged in Phase 6A**:
   - Staff counter booking creation converged in Phase 6A into a real 5-step commercial creation wizard without mock fixtures. Staff search effective flights, select fares, enter validated passenger and contact identities, choose seats and Extras, review dynamically calculated totals, and commit via `BookingRepository.create()` with `channel: "desk"`, `ownerEmail: null`, and canonical stored pricing recalculation (`bookingTotal()`). A real PNR is generated and persists immediately into `gza.repo.v1`.


---


## 3. Systematic No-Op / Pretend-Action Inventory & Mutation Reality

### 3.1 Historical pretend-action inventory and current CMS resolution

The table below is the historical pre-convergence inventory retained for traceability. Its Phase 6 fixture descriptions are historical, not current runtime authority. Phase 7 CMS rows below reflect the implemented candidate; independently accepted phase/source state remains in the living status block.

| Route / Component | Exact File Path | Action / Element | Current Implementation & State Effect | Resolution Phase |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Check-in" / "Undo" | Real `completeCheckIn` & `undoCheckIn` mutations via `gza.repo.v1`; direct Boarding Pass navigation | Complete (Phase 6A) |
| **Admin Create Booking** | `src/routes/{-$locale}.admin.bookings.new.tsx` | "Create Booking" (`a2.nb.create`) | Real `createBooking` mutation with `channel: 'desk'`, `ownerEmail: null`, stored pricing recalculation, and generated PNR | Complete (Phase 6A) |
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Edit Contact" / "Seat" / "Extras" Save | Real mutations (`updateBookingContact`, `updateBookingSeats`, `updateBookingExtras`, `cancelBooking`) on `gza.repo.v1`; checked-in seats protected from edit | Complete (Phase 6A) |
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Re-send" / "Print Manifest" / "Boarding Pass" | Calls `useAdmin().toast(t("a2.uiOnly"))` (no action performed) | Phase 6B / 6C |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Edit Contact" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.saved"))` without updating `mockCustomers` | Phase 6C |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Attach Booking" / "Reset Password" | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Disable Account" (`a2.cu.disable`) | Opens bespoke `ConfirmDialog`; onConfirm calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | Home/Travel Save Draft / Preview / Discard | Real typed ContentRepository commands, expected-draft conflict checks and semantic activity. Explicit local preview; no Publish action. | Phase 7 candidate |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | Pages blocks/paragraphs and Navigation | Real informational bundle editing; actual compiled navigation displayed read-only. No pretend save or published timestamps. | Phase 7 candidate |
| **Admin Airport CMS** | `src/routes/{-$locale}.admin.airport.index.tsx` | Past/Present/Future narratives, source references and SEO | Real typed local draft commands, retained errors, bilingual field validation and preview. Fixed chapter/evidence identity retained. | Phase 7 candidate |
| **Admin Airport CMS** | `src/routes/{-$locale}.admin.airport.index.tsx` | Archive / Sources / Media | Clearly disclosed read-only Phase 7B reference fixtures; pretend upload/save actions removed. | Phase 7B deferred |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Invite Staff" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.st.inviteSent"))` (no record added) | Phase 6 |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Change Role" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.st.roleChanged"))` (no record updated) | Phase 6 |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Disable Staff" (`a2.st.disable`) | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Settings** | `src/routes/{-$locale}.admin.settings.tsx` | "Save Station Settings" | Calls `useAdmin().toast(t("a2.saved"))`; uncontrolled `defaultValue` form inputs reset on reload | Phase 6 |

### 3.2 Canonical Operations Configuration Mutations

Network controls commit through NetworkRepository and persist in this browser. Product-domain session writes have been removed from AdminProvider:

| Route / Component | Exact File Path | Action / Element | State Mutation & Scope | Persistence |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Destinations** | `src/routes/{-$locale}.admin.destinations.$code.tsx` | Save Network Basics | Commits validated airport/city/country names, timezone, block duration and active state through NetworkRepository | Browser-local `gza.network.v1` |
| **Admin Products — commercial tabs** | `src/components/admin/commercial-catalog-editor.tsx` | Fare / Cabin Pricing / Baggage / Meal / Assistance commands | Awaits canonical CommercialCatalogRepository commit; full validation and rollback | `gza.commercial.v1`, same-origin browser-local |
| **Admin Products — Aircraft / Seat Maps** | `src/routes/{-$locale}.admin.products.tsx` | Save Aircraft / Seat Map | Awaits canonical FleetRepository commit; full validation and rollback | `gza.fleet.v1`, same-origin browser-local |

### 3.3 Working Persistent Actions

The following controls persist across browser reloads. Schedule Manager create/edit/deactivate uses ScheduleRepository (`gza.schedule.v1`), with structured effects and current dated-service projection, commit-before-success, authoritative empty storage, corrupt write protection and same-origin storage events. Destination-related schedule reads share that repository.

Other persistent actions:

1. **Public Cancel Booking (`src/routes/{-$locale}.manage.$ref.tsx`)**:
   - Opens `ConfirmDialog`; on confirmation, invokes `await cancelBooking(ref)` via `useCancelBookingMutation()`.
   - Delegates directly to `bookingRepo.cancel(ref)` which validates active status inside `RepoStorageCoordinator.mutate()`, transitions status to `"cancelled"`, and serializes to `localStorage["gza.repo.v1"]`. On storage failure, throws `StorageCommitError` and rolls back in-memory state.
2. **Public Flight Check-in (`src/routes/{-$locale}.manage.$ref_.check-in.tsx`)**:
   - Performs a single atomic `await completeCheckIn(input)` via `useCompleteCheckInMutation()`.
   - Delegates directly to `bookingRepo.completeCheckIn(input)` which revalidates eligibility, non-infant passengers, unique required documents, and non-duplicate valid seat assignments, persisting seats, passenger documents, and `checkedIn` indexes together in `gza.repo.v1`. On failure, rolls back and UI does not advance to success state.
3. **Public Booking Creation (`src/routes/{-$locale}.book.tsx`)**:
   - Submitting the multi-step booking engine invokes `useCreateBookingMutation()`; BookingRepository revalidates and calculates stored pricing.
   - Generates a persistent PNR (e.g. `GZA-7K8P`) via `bookingRepo.create()` and persists to `gza.repo.v1`.
4. **Public Saved Travelers & Profile (`src/routes/{-$locale}.account.*.tsx`)**:
   - Adding, editing, or deleting saved passenger profiles persists to `localStorage["gza.passenger.v1"]`.
5. **Admin Flight Operational Overrides (`src/components/admin/flight-quick-edit.tsx`)**:
   - Editing flight status, gate, terminal, revised departure time, or operational note invokes `flightRepo.setOverride(flightId, patch)`.
   - Persists to `gza.repo.v1` via `RepoStorageCoordinator.mutate()` and merges with base flights via effective flight queries.
6. **Admin Booking Cancellation (`src/routes/{-$locale}.admin.bookings.$ref.tsx`)**:
   - Confirmation invokes `useCancelBookingMutation()`. Status is canonical query state; failures preserve the previous booking.
7. **Public Manage Trip Edits (`src/routes/{-$locale}.manage.$ref_.*.tsx`)**:
   - Contact (`updateContact`), Seats (`updateSeats`), and Extras (`updateExtras`) invoke dedicated typed mutation hooks against `BookingRepository`.
   - Each command revalidates against latest canonical booking, rejects changes on cancelled bookings, enforces checked-in seat protection (cannot change seat of an already checked-in passenger on that leg), and canonically recalculates total price via pure `bookingTotal`.
8. **Public Contact Form (`src/routes/{-$locale}.contact.tsx`)**:
   - Submitting the form validates inputs against `contactCreateInputSchema`, assigns a client-side `submissionId`, and executes `createContactMutation.mutateAsync()`.
   - Persists directly into `localStorage["gza.contact.v1"]` via `ContactStorageCoordinator`. On failure, catches error, retains all input fields, and renders an accessible `role="alert"` allowing retry. Renders truthful inline success panel stating the enquiry was saved locally for workflow testing. In `?settingsPreview=1`, validates normally without mutating storage.
9. **Admin Inbox Actions (`src/routes/{-$locale}.admin.inbox.tsx`)**:
   - Changing status (`setStatus`), adding internal notes (`addInternalNote`), assigning staff (`setAssignee`), and saving or clearing reply drafts (`saveReplyDraft`) execute real mutations against `ContactRepository` with immediate React Query invalidation and persistence in `gza.contact.v1`. Explicitly discloses that external email transport is not connected.


---


## 4. UI Primitives & Implementation Reality

| UI Pattern | Implementation Reality & Exact Technique | Primary File Locations | Implementation Notes |
| :--- | :--- | :--- | :--- |
| **Modal Dialogs & Alerts** | **Bespoke React implementation** (`ConfirmDialog`) | `src/components/confirm-dialog.tsx` | Bespoke component with `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`, manual `Tab`/`Shift+Tab` focus trap, `dismissRef` initial focus, and `triggerRef` focus restoration on close. Radix wrappers in `src/components/ui/dialog.tsx` and `alert-dialog.tsx` are **unmounted templates**. |
| **Admin Slide-over Sheet** | **Bespoke React implementation** (`AdminSheet`) | `src/components/admin/admin-kit.tsx`, `src/components/admin/flight-quick-edit.tsx` | Bespoke implementation using `useRef`, body scroll lock (`document.body.style.overflow = "hidden"`), manual focus trap (`e.shiftKey`), and Escape key listener. Does **not** use `vaul` or `src/components/ui/sheet.tsx`. |
| **Admin Mobile Navigation** | **Bespoke React implementation** (`MobileDrawer`) | `src/components/admin/admin-shell.tsx` | Custom off-canvas drawer with manual focus loop and body scroll lock. Does **not** use `vaul`. |
| **Public Mobile Navigation** | **Bespoke React implementation** (`SiteHeader`) | `src/components/site-header.tsx` | Collapsible navigation menu using React `useState`. |
| **Admin Global Search** | **Bespoke React implementation** (`AdminSearch`) | `src/components/admin/admin-search.tsx` | Custom combobox input and listbox with manual keyboard navigation (ArrowDown, ArrowUp, Enter, Escape) and click-outside listener. Does **not** import `cmdk` or `src/components/ui/command.tsx`. |
| **Admin Account Menu** | **Bespoke React implementation** (`AccountMenu`) | `src/components/admin/admin-shell.tsx` | Custom dropdown with click-outside listener and Escape handler. Does **not** use `@radix-ui/react-dropdown-menu` or `src/components/ui/dropdown-menu.tsx`. |
| **Admin Attention Popover** | **Bespoke React implementation** (`AttentionBell`) | `src/components/admin/admin-shell.tsx` | Custom popover with click-outside listener and Escape handler. Does **not** use `@radix-ui/react-popover` or `src/components/ui/popover.tsx`. |
| **Date Selection** | **Native HTML5 `<input type="date">`** | `src/components/flight-search-form.tsx` | Styled native date inputs with `min` limits. `react-day-picker` and `src/components/ui/calendar.tsx` are installed/wrapped but **not imported or mounted** in any product screen. |
| **Seat Map** | **Custom SVG / Interactive Grid** | `src/components/booking/seat-map.tsx` | Aircraft cabin visualizer (Boeing 737 / Airbus A320/A321); handles seat selection and occupied states. |
| **Accordion / Collapsible** | **Bespoke HTML `<details>/<summary>` & `useState`** | `src/components/kit.tsx`, product routes | Radix wrappers `src/components/ui/accordion.tsx` and `collapsible.tsx` are **unmounted templates**. |
| **Toast Notifications** | **Custom Admin Toast Stack (`AdminToasts`)** | `src/components/admin/admin-kit.tsx`, `src/components/admin/admin-shell.tsx` | Admin-only stacked toast notifications rendered from `useAdmin().toasts`. `sonner` and `src/components/ui/sonner.tsx` are **not imported or mounted** in the application; public routes render no toasts. |
| **Operational Analytics Charts** | **Custom HTML/CSS Bar Meter (`<Bar />`)** | `src/routes/{-$locale}.admin.analytics.tsx` | Bespoke HTML/CSS percentage bars rendered with styled `<span>` elements. `recharts` and `src/components/ui/chart.tsx` are **unmounted templates** not imported by any product screen. |
| **Forms & Input Validation** | **Native HTML5 & React `useState`** | `src/components/flight-search-form.tsx`, `src/components/kit.tsx`, product routes | Controlled native inputs and native HTML5 constraints remain common. Phase 4B uses the existing `zod` dependency in `src/content/schema.ts` to validate local editorial drafts. Generic form wrappers remain unused. |


---


## 5. Repository and Content Convergence (Phases 4 and 4B Complete)

Phase 4 introduced this path for migrated booking and flight reads and writes. Other domains remain in the legacy stores listed above until their planned phase. Services are added only when a use case requires them.

```text
UI and compatibility facades
  -> TanStack Query hooks where migrated
  -> BookingRepository / FlightRepository contracts
  -> browser mock repository (gza.repo.v1)
  -> future API implementation after backend authorization
```

### 5.1 Approved Master Engineering Roadmap Sequence (Phases 4–14+)

The development program follows this strictly sequenced progression:

1. **Phase 4 — Canonical Mock Domain & Repository Layer (complete)**:
   - Established typed booking and flight domain models, asynchronous repository contracts, and the versioned `gza.repo.v1` mock browser store.
   - Migrated legacy public bookings and admin flight overrides into canonical records while retaining legacy keys for rollback. Representative public and admin booking/flight views now share repository identity. Admin desk fixtures and broader workflows remain for Phases 5 and 6.
2. **Phase 4B — Typed Content & CMS Schema (complete)**:
   - Compiled bilingual Home, Travel, Airport Past, and Airport Present records, runtime validation, local draft repository and explicit preview. Admin Travel editing is the real draft proof; global publishing and broader CMS work remain future phases. Gallery renders canonical archive records (`getPublishedArchiveRecords()`) and source registry (`SOURCE_REGISTRY`) under HC-2.
3. **Phase 4C — Settings & Appearance Store Convergence (complete)**:
   - Unified multi-document settings envelope (gza.settings.draft.v1) with independent Contact and Appearance drafts, one-time legacy migration with untouched legacy key, transactional failure resilience, and explicit preview immunity.
4. **Phase 5 — Public Workflows Convergence (Complete / Accepted Source: Phase 5A, Phase 5B, Phase 5C and Phase 5D complete)**:
   - Connect booking engine, trip management, check-in, passenger account hub, and contact forms to canonical domain repositories with comprehensive client-side validation. Phase 5A converged passenger identity, account state, and saved travelers on `PassengerRepository` (`gza.passenger.v1`). Phase 5B converged booking wizard draft (`BookingDraftRepository`) and effective flight discovery (`FlightRepository`), accepted and merged into main. Phase 5C converged Manage, Check-in, and Boarding Pass onto canonical repositories and effective flights, accepted and merged into main. Phase 5D converged public Contact and Admin Inbox through the browser-local ContactRepository; no transport or email delivery was added.
5. **Phase 6 — Admin Workflows Convergence**:
   - Connect admin flight quick-edit, schedule manager, passenger desk, customer notes, and activity logs to the shared domain repositories, eliminating simulated no-ops.
6. **Phase 7 — CMS Admin Workflows**:
   - Enable authored CMS management for destinations, airport historical chapters, and travel guidance.
7. **Phase 7B — Media & Provenance Admin**:
   - Implement structured media catalog management with strict truth classification, provenance tagging, and multi-resolution variant inspection.
8. **Phase 8 — Visual System & Assets Finalization**:
   - Complete asset delivery optimization, iconography audits, and surface grammar token refinements.
9. **Phase 9 — Arabic, RTL, Accessibility & Responsive Certification**:
   - Comprehensive multi-breakpoint audit (320px–1920px), keyboard navigation, focus management, and screen-reader semantics.
10. **Phase 10 — Comprehensive Durable Regressions Program**:
    - Expand test coverage with automated mock-state mutation tests, end-to-end user journeys, and regression baselines (expanding on Phase 3.9's minimal test foundation).
11. **Phase 11 — SEO, Performance & HostPapa Production Certification**:
    - Address known SEO gaps (Arabic homepage metadata, route head parity, sitemap, structured data), core web vitals, and HostPapa production deployment.
12. **Phase 12 — Backend Readiness & API Contracts Design**:
    - Design REST/RPC API contracts, payload schemas, and backend migration readiness blueprints.
13. **Phase 13 — Production Backend, Auth & Database Integration**:
    - Implement persistent server infrastructure, database, secure authentication, and payment processing.
14. **Phase 14+ — Optional Ecosystem Integrations**:
    - GDS flight data feeds, external loyalty programs, cargo logistics, and external partner APIs.

## Phase 6B1 accepted source (historical completed production phase)

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase reconciled onto main and deployed by Bassam (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. In accepted Phase 6B2B source, aircraft and seat layouts use `FleetRepository`; Network reference configuration now uses NetworkRepository in Phase 6B2C1; public editorial and merchandising fixtures remain compiled. Commercial product configuration uses `CommercialCatalogRepository`; there is no monolithic durable OpsState. See [Schedule model](SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B2 is Complete / Accepted Source: Phase 6B2A — Sellable Commercial Catalog & Pricing Authority is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority is Complete / Accepted Source; Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence is Complete / Accepted Source; Phase 6B2C2A - Stable Dated-Service Materialization Foundation is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. Deployment is owner-confirmed; Git/source/release provenance was independently checked after deployment. No independent ChatGPT/Codex live-browser verification is claimed. The earlier Phase 6B2A post-deployment documentation reconciliation performed no rebuild or deployment.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository owns recurring planning and structured effects; DatedServiceResolver now projects current service discovery from Schedule and Network authority.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner**, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`). Existing Flight IDs remain compatibility identities; current services use stable Schedule-derived IDs with canonical Network and Schedule facts, retaining additive `aircraftId` linkage. Phase 6B is Complete / Accepted Source / Accepted Release / Deployed by Owner. Phase 6C is Complete / Accepted Source; Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

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

Broad Flight lookup retains stored Booking Flight snapshots, including cancelled history. Operational boards retain only confirmed Booking Flight snapshots and relevant override-only legacy Flights. Current bases take precedence when available. Existing PNR mutations can fall back to their stored Flight plus current override during planning removal or authority corruption. Historical pricing and seat-layout snapshots remain authoritative. Planning deactivation is not retroactive cancellation: explicit structured cancellation or FlightOverride cancellation supplies operational truth.

The frozen legacy generator is compatibility-only. There is no generated Flight persistence store, hardcoded cutover date, PNR/draft/override identity migration, backend or cross-device claim. Browser-local `svc1-*` Flight Detail uses generic static metadata because prerender cannot read local Schedule/Network state. Booking route selectors use active Network routes; compiled destination information pages remain available.

Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1 and Phase 6B2C2A release/deployment remain intentionally pending. C2B engineering is accepted and source is finalized; C2B has no Accepted Release and is not deployed. Phase 6C / 7 / 7B remain Planned / Unstarted.

## Phase 6B2C2B Independent Review Correction 01

Status remains **Complete / Accepted Source**. Reviewed parent: `ff46f8e7ab606731be679eaedbada9e07d09e91a`.

PNR-facing operations use `FlightRepository.getBookingFlight(ref, leg)`: prefer a currently materializable service, otherwise use that exact canonical Booking leg's stored Flight, then compose the freshly read matching FlightOverride. Query cache identity includes Booking reference and leg. Multiple PNRs sharing a stable service ID may retain different historical times/equipment; broad public Flight detail is a separate compatibility contract. Read resolution does not migrate Bookings, prices or seat layouts.

`getCheckInFlights(date)` is a desk-only read. Healthy planning retains normal current/compatibility operational listings. Unavailable planning yields an explicit EN/AR warning and confirmed Gaza-departure PNR compatibility from their stored snapshots plus overrides. A Booking/leg map supplies each desk row's own operational timing and sheet Flight. Final check-in remains the canonical BookingRepository command. Public boards, sale search and new Booking creation still fail truthfully during current-authority corruption.

Board relevance uses current services, confirmed PNR snapshots and explicit legacy override-only compatibility. Cancelled PNRs retain history/detail snapshots but do not independently resurrect a retired service on Home/public/Admin boards. Cancelling the last confirmed PNR removes its compatibility-only board row; explicit valid legacy overrides remain operationally relevant.

*(Historical context at 6B2C2B source)*: At the time of 6B2C2B, production remained owner-deployed Phase 6B2A. Current production is the consolidated Phase 6B owner deployment (`8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, source `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B remain Planned / Unstarted. Protected main and HostPapa, current discovery authority, new-sale validation, historical pricing/layouts, Studio isolation and all identity/store boundaries remain unchanged.


## Phase 6B2C2B accepted-source checkpoint (Historical — 2026-10-06)

*Historical milestone record (superseded by Phase 6B consolidated deployment below)*:
**Phase 6B2C2B Complete / Accepted Source. Phase 6B Complete / Accepted Source.** ChatGPT independently accepted engineering at `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4` (original implementation: `ff46f8e7ab606731be679eaedbada9e07d09e91a`; accepted C2A baseline: `412fc2b4f79e01da0607b5bca44e01d76156a634`). Acceptance is recorded in the owner-supplied 2026-10-06 master handoff. The accepted-source candidate is the docs/status-only finalization commit introducing this checkpoint; its exact SHA is recorded in the publication handback. Independent accepted-source verification precedes main fast-forward.

PNR-facing Flight reads use `(Booking reference, leg)`: current service when available, otherwise that exact leg's stored Flight, then current FlightOverride. Historical pricing and seat-layout snapshots remain unchanged. Admin Check-in can discover confirmed PNRs using their own snapshots during planning failure, with an explicit localized warning. Public/new-sale authority still fails truthfully. Cancelled PNRs preserve their own history without independently resurrecting retired operational board rows.

*(Historical context at 6B2C2B checkpoint)*: At the time of 6B2C2B completion, production remained Phase 6B2A (`2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`), with consolidated release pending.

## Phase 6B consolidated release & Phase 6C status

Phase 6 engineering implementation is complete. Phase 6 and Phase 6C are **Complete / Accepted Source**, published to main at `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Accepted Phase 6C engineering and Correction 05: `d5dd2942fad517cc5f1be353ad206511cc0724cc`; original implementation: `3ac3c8a078f7ffa82b411744b656c3575a3955c4`.

The final Phase 6 static package is published on HostPapa at `421101d294674aaa503565cfc4df9fafb62527ba`, packaging source `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Owner deployment of that package has not been confirmed. Phase 6C is not deployed.

Confirmed production remains **Phase 6B - Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source `2749c26714258871c32bd2b14a75fc4e87a68b62`. Deployment is confirmed by the product owner. No independent live bundle verification claimed for this reconciliation.

**Phase 7 - CMS Admin Workflows: Implemented / Awaiting Independent Review.** The typed content foundation, storage/conflict handling, administrative audit commands, explicit public previews, canonical content inventory/search, and Home, Travel, Airport, destination and informational-page editors are implemented. Codex collected and independently reviewed both bounded AGY editor tasks, correcting validation, navigation, storage-error and mobile behavior before integration. Phase 7B remains Planned / Unstarted. No Phase 7 release or acceptance is claimed.

**Next milestone:** independent ChatGPT engineering review of the pushed whole Phase 7 candidate. Main and HostPapa remain unchanged during this review. See [CMS workflows](CMS_WORKFLOWS.md) for the implementation contract. Earlier milestone sections retain their historical source/release state; they do not override this current block.
