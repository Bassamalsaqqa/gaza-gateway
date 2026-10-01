# Data Flow, State Management & Pretend-Action Inventory

> **Document Purpose**: Complete audit of current data sources, state persistence, cross-screen entity splits, and enabled no-op actions across public and admin workspaces.
> **Status**: **Phase 5C Manage, Check-in & Boarding Pass Convergence ACCEPTED SOURCE on main.** HC-2 (Historical Archive Publication & Documentary Foundation) implemented on feature branch `hc2/historical-archive-publication` awaiting independent acceptance (not merged to `main`, not deployed). Phase 5 overall remains in progress; Phase 5A, 5B, 5C, and HC-0/HC-1/Present complete; Phase 5D (Public Contact) and HC-3 planned and unstarted. Repository publication does not mean live cPanel deployment.
> **Future Target**: Independent review of HC-2 on feature branch, followed by Phase 5D (Public Contact Workflow Convergence), then Phase 6 before any production backend.

---

## 1. Current State Stores & Persistence

Following Phase 5C, the application coordinates persistence across canonical repositories and legacy boundary keys:

| Store / Source | Implementation Files | Persistence | Entities & Data Types Managed |
| :--- | :--- | :--- | :--- |
| **Canonical Booking Draft** (`BookingDraftRepository`) | `src/lib/booking-draft/` | `localStorage["gza.booking.draft.v1"]` (schemaVersion: 1) | Active booking wizard draft (`BookingDraft`). 5 storage states, serialized mutation queue, tombstone anti-resurrection, cross-tab synchronization. |
| **Canonical Repositories** (`BookingRepository`, `FlightRepository`) | `src/lib/repositories/`, `src/lib/domain/` | `localStorage["gza.repo.v1"]` (schemaVersion: 1) | Canonical bookings (`Booking[]`) and mutable operational flight overrides (`flightOverrides: Record<string, FlightOverride>`). Single source of truth for public and admin views. Synchronized across tabs via `subscribeToStorage()`. |
| **Canonical Passenger State** (`PassengerRepository`) | `src/lib/passenger/` | `localStorage["gza.passenger.v1"]` (schemaVersion: 1) | Canonical passenger account (`PassengerAccount \| null`), profile preferences, and saved companions (`Traveler[]`). Migrated once from `gza.store.v1` only if absent; present empty state is authoritative. Synchronized across tabs via `subscribe()`. |
| **Published Editorial Content** | `src/content/published/` | Compiled source in prerendered HTML and route chunks | Canonical Home, Travel, Airport Past (5 source-backed verified chapters), and Airport Present proof documents. Normal public URLs never read local drafts. |
| **Historical Archive & Source Registry (HC-2)** | `src/lib/archive/` | Compiled typed catalog (`catalog.ts`) and registry (`sources.ts`) | Canonical archive records (`getPublishedArchiveRecords()`) for public Gallery (`/gallery`) and Home spotlight. Curated external primary sources (`SOURCE_REGISTRY`, `getAllSourceRecords()`). Legacy `galleryItems` removed from public routes. |
| **Local Editorial Drafts** | `src/content/repository.ts` | `localStorage["gza.content.draft.v1"]` (schemaVersion: 1) | Admin Travel draft and explicit `?contentPreview=1` overlay only. Save errors reject; corrupt data falls back to published. |
| **Legacy Store Key** | Preserved read-only migration source | `localStorage["gza.store.v1"]` | Closed legacy store. Migrated once to `gza.booking.draft.v1` if canonical draft is missing. ZERO active draft writers; original string preserved byte-for-byte; never resurrected once cleared. |
| **Admin Store Façade** (`useAdmin`) | `src/lib/admin-store.tsx` | `localStorage["gza.admin.v1"]` (staffId) | Staff identity (`Staff \| null`), active role (`AdminRole`). Flight operational override mutations delegate directly to `flightRepo` (single writer). |
| **Admin Operations State** (`useAdmin().ops`) | `src/lib/admin-ops.ts`, `src/lib/admin-store.tsx` | Session in-memory state in `AdminProvider` (`useState<OpsState>`). Resets to seed on reload. | Schedules (`Schedule[]`), aircraft fleet (`AircraftType[]`), seat maps (`Record<string, SeatMapConfig>`), fare products (`FareConfig[]`), baggage allowance (`BaggageConfig`), meals (`OptionItem[]`), assistance options (`OptionItem[]`), destination parameters (`DestinationConfig[]`). |
| **Admin Static Mock Data** | `src/lib/admin-mock.ts` | In-memory static constants | Customer profiles (`mockCustomers`), check-in desk fixtures, staff inbox, staff directory, audit and analytics fixtures, and non-migrated CMS/story collections. Home, Travel and Past proof arrays now derive from `src/content/`. |
| **Settings Draft Store** (Contact & Appearance) | `src/lib/settings/` | `localStorage["gza.settings.draft.v1"]` (schemaVersion: 1) | Multi-document envelope (`{ schemaVersion: 1, site: { contact?, appearance? } }`). Independent per-document save/discard. Active in Admin Settings and explicit `?settingsPreview=1` / `?skinPreview=1`. |
| **Appearance Legacy Key** | `src/lib/skin.ts` | `localStorage["gza.skin.preview.v1"]` | Legacy working copy. Migrated deterministically into `gza.settings.draft.v1` on first load; left byte-for-byte untouched. No dual writes. |

### 1.1 Admin Flight Overrides Implementation Reality

In `src/lib/repositories/flight-repository.ts` and `src/lib/admin-store.tsx`:
- Canonical flight overrides are stored in `gza.repo.v1` as `flightOverrides: Record<string, FlightOverride>` via `FlightRepository.setOverride(flightId, patch)`.
- Overrides are applied using the pure `getEffectiveFlight(baseFlight, override?)` helper in `src/lib/domain/flight.ts`, which merges base flight objects with active overrides.
- Overrides are sanitized on load (`sanitizeFlightOverride()`) to validate flight statuses and trim string fields while allowing intentional clears.
- Legacy `gza.admin.v1` overrides are migrated into `gza.repo.v1` on first load. A sentinel protection ensures canonical flight operations do not modify `gza.admin.v1`, and staff changes preserve legacy overrides.
- Migrated admin flight views and public flight board/detail views can access effective flights through repository query hooks. The booking wizard still uses its legacy schedule search pending Phase 5.

### 1.2 Public Booking Draft & Date Synchronization Reality

In `src/lib/store.tsx` and `src/lib/booking-draft.ts`:
- Search criteria in `createFreshDraft()` computes departure date using station timezone policy (`todayISO(now, "Asia/Gaza")` from `src/lib/data.ts`).
- Active draft mutations persist to `localStorage["gza.store.v1"]` and are restored on load via `validateAndSanitizeDraft()`:
  - If departure date is in the past relative to station date, rolls forward to `todayISO()`.
  - Re-evaluates bookability via `isFlightBookable(outboundFlight)`: if unbookable, clears flight selection and dependent seat selections.
  - Preserves entered passenger names, dates of birth, and contact information even if flight criteria roll forward.
  - Calculates maximum accessible wizard step (`calculateMaxStep`), clamping wizard progression to Step 1 (flight selection) or Step 3 (passenger details) if prerequisites are missing.

### 1.3 Canonical Passenger State & Auth-Truth Reality (`gza.passenger.v1`)

In `src/lib/passenger/`:
- **Single Source of Truth**: `PassengerRepository` manages canonical passenger identity (`PassengerAccount | null`) and saved companions (`Traveler[]`) stored under `localStorage["gza.passenger.v1"]`.
- **Anti-Resurrection Rule**: Migration from `gza.store.v1` occurs **only** when `gza.passenger.v1` is completely absent (`null`). If `gza.passenger.v1` is present (even with a null account or empty travelers), legacy values are never resurrected.
- **No Dual Writer**: `StoreProvider` in `src/lib/store.tsx` retains the legacy envelope in memory solely to re-serialize `gza.store.v1` semantically on draft edits, keeping absent fields absent. It never writes canonical passenger mutations back to legacy storage.
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
3. **Optimized Variant Generation**: Output WebP/AVIF variants at standardized widths (`640w`, `960w`, `1280w`, `1376w`) with explicit intrinsic aspect ratios.
4. **Registration in `src/lib/media.ts`**: Declare stable semantic IDs (`future-hero`, `future-aerial-day`, etc.) and bilingual accessible descriptions (`altEn`, `altAr`).
5. **Content Workflow**: Home, Travel, Airport Past, and Airport Present published copy lives in compiled typed records. The Admin Travel editor saves a browser-local draft only; approved global publication requires a source update and verified HostPapa release. In HC-2, the public Gallery and Home archive preview were converged onto canonical `getPublishedArchiveRecords()` and `getAllSourceRecords()`, retiring legacy `galleryItems` from public surfaces.
6. **Strict Archival Truth**: Never present unlabeled material, mock data, or AI-generated concepts as historical evidence. Authentic documentary photos are presented without artificial truth badges over hero imagery; authentic archive provenance is provided via restrained editorial context and accessible attribution links; illustrative photos remain unbadged; AI future concepts must always display visible illustrative disclosure badges. Photographic assets are never mirrored.

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
2. **Check-in — Converged on Public Side**:
   - Public Manage, Check-in, and Boarding Pass routes are 100% repository-native (`BookingRepository` + `FlightRepository`). When a passenger checks in via `/manage/:ref/check-in`, `useCompleteCheckInMutation` invokes `BookingRepository.completeCheckIn` which atomically persists passenger documents, leg seat assignments, and `checkedIn` indexes in a single coordinator transaction with full rollback on storage error.
   - The airport check-in desk monitor (`/admin/check-in`) still renders static `deskPassengers` from `src/lib/admin-mock.ts` and does not reflect public passenger check-in progress. Resolution: Phase 6.
3. **Contact & Inbox Disconnect**:
   - Submitting the public contact form (`src/routes/{-$locale}.contact.tsx`) updates local component state (`setSent(true)`) to display an inline prototype panel; it emits no toast and writes to no store.
   - The admin staff inbox (`src/routes/{-$locale}.admin.inbox.tsx`) displays static `inboxMessages` and never receives public submissions.
4. **Flight Operations Overrides — Converged**:
   - When staff edit flight status (gate change, delay) in `/admin` via `flight-quick-edit.tsx`, the change is saved to the canonical `FlightRepository` (`gza.repo.v1`) via `flightRepo.setOverride()`.
   - Both admin and public views can access effective flights through repository query hooks with operational overrides merged.
5. **New Booking at Counter (`src/routes/{-$locale}.admin.bookings.new.tsx`)**:
   - Staff booking creation sets page-local state and triggers a toast with a hardcoded reference `GZA-NEW1`. It does not commit to the canonical repository. Resolution: Phase 6.

---

## 3. Systematic No-Op / Pretend-Action Inventory & Mutation Reality

### 3.1 Simulated & No-Op Actions (Toast-Only or Simulated UI Controls)

The following table catalogs user-facing controls that appear functional (buttons, forms, action menus) but currently produce simulated feedback (toast notifications, page-local UI flags, or no-ops) without altering any underlying data store:

| Route / Component | Exact File Path | Action / Element | Current Implementation & State Effect | Resolution Phase |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Check-in" / "Undo" | Calls `useAdmin().toast(t("a2.ci.checkedInToast"))` (no mutation to `deskPassengers`) | Phase 6 |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Issue Boarding Pass" | Calls `useAdmin().toast(t("a2.ci.issuedToast"))` (no mutation to `deskPassengers`) | Phase 6 |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Check-in" in Sheet Footer | Closes sheet (`setSelected(null)`) and calls `useAdmin().toast(...)` | Phase 6 |
| **Admin Create Booking** | `src/routes/{-$locale}.admin.bookings.new.tsx` | "Create Booking" (`a2.nb.create`) | Sets page-local `done = true` and `useAdmin().toast()`; displays static `GZA-NEW1` (no record saved) | Phase 6 |
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Edit Contact" / "Seat" / "Extras" Save | Inside `AdminSheet`, Save button calls `useAdmin().toast(t("a2.saved"))` without mutating booking | Phase 6 |
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Re-send" / "Print Manifest" / "Boarding Pass" | Calls `useAdmin().toast(t("a2.uiOnly"))` (no action performed) | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Edit Contact" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.saved"))` without updating `mockCustomers` | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Attach Booking" / "Reset Password" | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Disable Account" (`a2.cu.disable`) | Opens bespoke `ConfirmDialog`; onConfirm calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | Travel Save Draft / Preview / Discard | Real `ContentRepository` mutation to `gza.content.draft.v1`; explicit preview only. No global Publish button for this module. | Phase 4B complete |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | Home reorder / other page editing | Home controls are read-only; non-migrated page editor Save is disabled as prototype-only. | Phase 7 |
| **Admin Airport CMS** | `src/routes/{-$locale}.admin.airport.index.tsx` | Past timeline editing / duplicate / reorder / archive / attach | Canonical Past timeline is shown read-only; editing controls are disabled pending a real workflow. | Phase 7 |
| **Admin Airport CMS** | `src/routes/{-$locale}.admin.airport.index.tsx` | Add Fact / Vision / Record / Media / Source | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Invite Staff" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.st.inviteSent"))` (no record added) | Phase 6 |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Change Role" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.st.roleChanged"))` (no record updated) | Phase 6 |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Disable Staff" (`a2.st.disable`) | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Settings** | `src/routes/{-$locale}.admin.settings.tsx` | "Save Station Settings" | Calls `useAdmin().toast(t("a2.saved"))`; uncontrolled `defaultValue` form inputs reset on reload | Phase 6 |
| **Admin Inbox** | `src/routes/{-$locale}.admin.inbox.tsx` | Reply / Add Note / Assign / Resolve / Reopen | Calls `useAdmin().toast()` with no state update; message selection uses page-local `useState(activeId)` | Phase 6 |
| **Public Contact Form** | `src/routes/{-$locale}.contact.tsx` | "Send Message" | Toggles page-local `useState(sent = true)` displaying inline prototype notice; no toast, no store write | Phase 5 |

### 3.2 Session-Only Operations Mutations (Shared In-Memory State)

These controls perform real, functional mutations across shared state within the user's active session via `useAdmin().patchOps(...)`, immediately updating connected admin views. However, because they mutate in-memory `OpsState` in `AdminProvider`, changes reset to initial seeds on full page reload:

| Route / Component | Exact File Path | Action / Element | State Mutation & Scope | Persistence |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Schedules** | `src/routes/{-$locale}.admin.schedules.tsx` | Create / Edit / Delete Schedule | Mutates shared session `ops.schedules` via `patchOps("schedules", next)`; updates schedules timetable immediately | In-memory session only (resets on reload) |
| **Admin Destinations** | `src/routes/{-$locale}.admin.destinations.$code.tsx` | Save Destination Route | Mutates shared session `ops.destinations` via `patchOps("destinations", next)`; updates destination configuration immediately | In-memory session only (resets on reload) |
| **Admin Products** | `src/routes/{-$locale}.admin.products.tsx` | Save Aircraft / Seat Map / Fare / Baggage / Option | Mutates shared session `ops` via `patchOps(...)`; updates fleet, cabin maps, fares, and ancillaries immediately | In-memory session only (resets on reload) |

### 3.3 Verified Working Persistent Actions (For Contrast)

For engineering clarity, the following controls perform authentic data mutations that persist across browser reloads:

1. **Public Cancel Booking (`src/routes/{-$locale}.manage.$ref.tsx`)**:
   - Opens `ConfirmDialog`; on confirmation, invokes `await cancelBooking(ref)` via `useCancelBookingMutation()`.
   - Delegates directly to `bookingRepo.cancel(ref)` which validates active status inside `RepoStorageCoordinator.mutate()`, transitions status to `"cancelled"`, and serializes to `localStorage["gza.repo.v1"]`. On storage failure, throws `StorageCommitError` and rolls back in-memory state.
2. **Public Flight Check-in (`src/routes/{-$locale}.manage.$ref_.check-in.tsx`)**:
   - Performs a single atomic `await completeCheckIn(input)` via `useCompleteCheckInMutation()`.
   - Delegates directly to `bookingRepo.completeCheckIn(input)` which revalidates eligibility, non-infant passengers, unique required documents, and non-duplicate valid seat assignments, persisting seats, passenger documents, and `checkedIn` indexes together in `gza.repo.v1`. On failure, rolls back and UI does not advance to success state.
3. **Public Booking Creation (`src/routes/{-$locale}.book.tsx`)**:
   - Submitting the multi-step booking engine invokes `addBooking(...)` on `useStore()`.
   - Generates a persistent PNR (e.g. `GZA-7K8P`) via `bookingRepo.create()` and persists to `gza.repo.v1`.
4. **Public Saved Travelers & Profile (`src/routes/{-$locale}.account.*.tsx`)**:
   - Adding, editing, or deleting saved passenger profiles persists to `localStorage["gza.passenger.v1"]`.
5. **Admin Flight Operational Overrides (`src/components/admin/flight-quick-edit.tsx`)**:
   - Editing flight status, gate, terminal, revised departure time, or operational note invokes `flightRepo.setOverride(flightId, patch)`.
   - Persists to `gza.repo.v1` via `RepoStorageCoordinator.mutate()` and merges with base flights via effective flight queries.
6. **Admin Booking Cancellation (`src/routes/{-$locale}.admin.bookings.$ref.tsx`)**:
   - Confirmation invokes `useUpdateBookingMutation()` with `status: "cancelled"`. The canonical booking record changes in `gza.repo.v1`; the local cancelled flag is only immediate presentation state.
7. **Public Manage Trip Edits (`src/routes/{-$locale}.manage.$ref_.*.tsx`)**:
   - Contact (`updateContact`), Seats (`updateSeats`), and Extras (`updateExtras`) invoke dedicated typed mutation hooks against `BookingRepository`.
   - Each command revalidates against latest canonical booking, rejects changes on cancelled bookings, enforces checked-in seat protection (cannot change seat of an already checked-in passenger on that leg), and canonically recalculates total price via pure `bookingTotal`.

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
   - Compiled bilingual Home, Travel, Airport Past, and Airport Present records, runtime validation, local draft repository and explicit preview. Admin Travel editing is the real draft proof; global publishing and broader CMS work remain future phases. Gallery continues on its legacy placeholder system pending HC-2.
3. **Phase 4C — Settings & Appearance Store Convergence (complete)**:
   - Unified multi-document settings envelope (gza.settings.draft.v1) with independent Contact and Appearance drafts, one-time legacy migration with untouched legacy key, transactional failure resilience, and explicit preview immunity.
4. **Phase 5 — Public Workflows Convergence (in progress: Phase 5A, Phase 5B, and Phase 5C complete; Phase 5D planned)**:
   - Connect booking engine, trip management, check-in, passenger account hub, and contact forms to canonical domain repositories with comprehensive client-side validation. Phase 5A converged passenger identity, account state, and saved travelers on `PassengerRepository` (`gza.passenger.v1`). Phase 5B converged booking wizard draft (`BookingDraftRepository`) and effective flight discovery (`FlightRepository`), accepted and merged into main. Phase 5C converged Manage, Check-in, and Boarding Pass onto canonical repositories and effective flights, accepted and merged into main. Phase 5D will address public contact forms and messaging.
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
