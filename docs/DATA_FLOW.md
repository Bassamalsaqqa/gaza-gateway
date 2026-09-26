# Data Flow, State Management & Pretend-Action Inventory

> **Document Purpose**: Complete audit of current data sources, state persistence, cross-screen entity splits, and enabled no-op actions across public and admin workspaces.
> **Status**: **Phase 3.9 & 3.9.1 Complete (System Stabilization, Flight-Detail Bookability & Source-of-Truth Reset)**.
> **Future Target**: Convergence into a unified Mock Repository Layer in Phases 4–6 before any production backend.

---

## 1. Current State Stores & Persistence

The application currently operates across five independent data sources and storage singletons:

| Store / Source | Implementation Files | Persistence | Entities & Data Types Managed |
| :--- | :--- | :--- | :--- |
| **Public Store** (`useStore`) | `src/lib/store.tsx` | `localStorage["gza.store.v1"]` (persisted) | Public bookings (`Booking[]`), account session (`Account | null`), saved travelers (`Traveler[]`), and active booking draft (`draft: Draft`) are persisted to `localStorage["gza.store.v1"]` upon mutation (`hasMutatedRef.current`). Draft state restores through pure domain validation and sanitization (`validateAndSanitizeDraft` in `src/lib/booking-draft.ts`), preserving traveler names and contact info while safely clearing invalid/stale flight legs and dependent seat allocations. Maximum wizard step progression is enforced via `calculateMaxStep`. |
| **Admin Store** (`useAdmin`) | `src/lib/admin-store.tsx` | `localStorage["gza.admin.v1"]` | Staff identity (`Staff | null`), active role (`AdminRole`), flight operational overrides stored as `Record<string, FlightOverride>`. |
| **Admin Operations State** (`useAdmin().ops`) | `src/lib/admin-ops.ts` (models & seeds), `src/lib/admin-store.tsx` (`ops` & `patchOps`) | Session in-memory state in `AdminProvider` (`useState<OpsState>`). Resets to seed on reload. | Schedules (`Schedule[]`), aircraft fleet (`AircraftType[]`), seat maps (`Record<string, SeatMapConfig>`), fare products (`FareConfig[]`), baggage allowance (`BaggageConfig`), meals (`OptionItem[]`), assistance options (`OptionItem[]`), destination parameters (`DestinationConfig[]`). |
| **Admin Static Mock Data** | `src/lib/admin-mock.ts` | In-memory static constants | Bookings (`mockBookings: MockBooking[]`), customer profiles (`mockCustomers: MockCustomer[]`), check-in desk flights & passengers (`deskFlights: DeskFlight[]`, `deskPassengers: Record<string, DeskPassenger[]>`), staff inbox (`inboxMessages: InboxMessage[]`), staff directory (`staffRows: StaffRow[]`), audit log (`activityEntries: ActivityEntry[]`), operational analytics (`analyticsOverview`, `funnelSteps`, `routeStats`, `contentStats`), CMS & storytelling collections (`homeSections`, `travelSections`, `sitePages`, `timelineEntries`, `presentFacts`, `futureItems`, `archiveItems`, `sourceRecords`, `mediaItems`). |
| **Appearance / Skin Preview Store** | `src/lib/skin.ts`, `src/design/surfaces/context.tsx` | `localStorage["gza.skin.preview.v1"]` | Authored surface skin, canvas motifs, and per-target recipe overrides (`SkinConfig`). Active **only** when `skinPreview=1` or `studioPreview=1` is present in the query string. Normal visitor sessions on ordinary URLs (`/`, `/book`, etc.) completely ignore this key and render the committed baseline design tokens with zero SSR/hydration mismatch and zero state leakage. |

### 1.1 Admin Flight Overrides Implementation Reality

In `src/lib/admin-store.tsx`:
- Overrides are held in a key-value dictionary: `overrides: Record<string, FlightOverride>`.
- Overrides are applied using `applyOverride(flightId: string, patch: FlightOverride)`.
- Base flight objects are merged with active overrides using `withOverride(flight: Flight): Flight & { note?: string; revisedDepart?: string }`.
- Overrides persist to `localStorage["gza.admin.v1"]` and are sanitized on load (`sanitizeOverride()`) to validate flight statuses and trim string fields while allowing intentional clears.
- **Limitation**: Flight overrides apply exclusively to views consuming `withOverride()` (Admin Dashboard and Flight Operations). They do **not** automatically sync to `gza.store.v1` customer booking records, public flight status views (`/flights`), or public booking search results (`/book`).

### 1.2 Public Booking Draft & Date Synchronization Reality

In `src/lib/store.tsx` and `src/lib/booking-draft.ts`:
- Search criteria in `createFreshDraft()` computes departure date using station timezone policy (`todayISO(now, "Asia/Gaza")` from `src/lib/data.ts`).
- Active draft mutations persist to `localStorage["gza.store.v1"]` and are restored on load via `validateAndSanitizeDraft()`:
  - If departure date is in the past relative to station date, rolls forward to `todayISO()`.
  - Re-evaluates bookability via `isFlightBookable(outboundFlight)`: if unbookable, clears flight selection and dependent seat selections.
  - Preserves entered passenger names, dates of birth, and contact information even if flight criteria roll forward.
  - Calculates maximum accessible wizard step (`calculateMaxStep`), clamping wizard progression to Step 1 (flight selection) or Step 3 (passenger details) if prerequisites are missing.

### 1.3 Appearance Studio & Skin Preview Store Reality (`gza.skin.preview.v1`)

In `src/lib/skin.ts` and `src/components/admin/appearance-studio/`:
- **Preview Isolation**: Preview changes made in the Appearance Studio write to `localStorage["gza.skin.preview.v1"]` or sync to the preview frame via typed `postMessage` protocol (`STUDIO_PROTOCOL_VERSION = "1.0.0"`).
- **Public URL Immunity**: Ordinary public visits never read or apply `gza.skin.preview.v1`. The default site skin (`DEFAULT_SITE_SKIN`) and default surface grammar (`DEFAULT_SURFACE_GRAMMAR_CONFIG`) are compiled statically.
- **Studio Scenario Fixtures**: In `studioPreview=1`, preview routes bypass `localStorage["gza.store.v1"]` mutations, rendering deterministic in-memory fixtures to prevent test booking debris from polluting user storage.
- **Export Action**: The Appearance Studio provides a bounded "Export appearance configuration" dialog (`gza.appearance.v1`) that serializes sanitized preview configuration for copying or JSON file download without requiring a persistent backend or fake global Publish mutation.

### 1.4 Simulation Boundary & Security Declarations

- **Staff and Passenger Authentication**: Pure client-side simulation. Mock passphrases and email logins set local state tokens (`localStorage["gza.admin.v1"]` and `localStorage["gza.store.v1"]`). There is no session token verification, token rotation, or server-side authorization.
- **Financial & Commercial Boundary**: The booking wizard concludes at Step 6 (Review & Confirmation) with PNR generation (e.g. `GZA-7K8P`). No real payment gateway, merchant facility, or financial processing exists. Payment card inputs are simulated and discarded.
- **Secrets & Customer Privacy**: Zero real secrets, database credentials, payment card data, or private customer PII belong in client repositories or bundles. All customer profiles and staff accounts are synthetic fixtures.
- **React Query Status**: `@tanstack/react-query` is mounted at the root (`QueryClientProvider`), but application query/mutation use is currently minimal (most screens bind directly to `useStore()`, `useAdmin()`, or static mock imports). Phase 4 will introduce formal repository contracts and query/mutation hooks.

### 1.5 Asset & Content Ingestion Protocol and Archival Truth

To maintain strict truth and prevent unverified imagery or text from entering the product:
1. **Master File Preservation**: Preserve uncompressed master files in local source storage prior to web asset generation.
2. **Truth & Rights Classification**: Every asset must be assigned a canonical `TruthClass` (`"future-concept-ai"`, `"brand-mark"`, or `"placeholder"`), historical era, and verifiable provenance record.
3. **Optimized Variant Generation**: Output WebP/AVIF variants at standardized widths (`640w`, `960w`, `1280w`, `1376w`) with explicit intrinsic aspect ratios.
4. **Registration in `src/lib/media.ts`**: Declare stable semantic IDs (`future-hero`, `future-aerial-day`, etc.) and bilingual accessible descriptions (`altEn`, `altAr`).
5. **Content Workflow**: Before Phase 4B, small copy updates proceed directly via source edits. After Phase 4B, content is managed through canonical typed content records.
6. **Strict Archival Truth**: Never present unlabeled material, mock data, or AI-generated concepts as historical evidence. AI future concepts must always display visible illustrative disclosure badges.

### 1.6 Known SEO Gaps (Earmarked for Phase 11)

Identified SEO debt recorded for Phase 11 resolution without expanding Phase 3.9 scope:
1. **Arabic Homepage Metadata**: Ensure parity between English and Arabic `<title>`, `<meta name="description">`, and OpenGraph headers.
2. **Route Head Parity**: Provide unique canonical URLs and localized hreflang tags for all public routes (`/` vs `/ar`).
3. **Automated Sitemap & Robots**: Generate static `sitemap.xml` and `robots.txt` compatible with HostPapa Apache static hosting.
4. **Structured Data**: Implement JSON-LD schemas for `Airline`, `Airport`, and `FlightReservation` entities.

---

## 2. Public vs. Admin Entity Splits

Because public and admin state are decoupled, mutations performed on one side do not reflect on the other:

1. **Bookings Disconnect**:
   - A passenger booking completed on `/book` writes to `localStorage["gza.store.v1"]`.
   - The admin booking manifest (`/admin/bookings`, file `src/routes/{-$locale}.admin.bookings.index.tsx`) reads from static `mockBookings` in `src/lib/admin-mock.ts`. It **cannot see** passenger bookings made in the public interface.
2. **Check-in Disconnect**:
   - When a passenger checks in via `/manage/:ref/check-in` (`src/routes/{-$locale}.manage.$ref_.check-in.tsx`), the public store updates `booking.checkedIn` (type `CheckedIn = { out: number[]; in: number[] }`), appending checked-in passenger indices for that leg.
   - The airport check-in desk monitor (`/admin/check-in`, file `src/routes/{-$locale}.admin.check-in.tsx`) renders static `deskPassengers: Record<string, DeskPassenger[]>` from `src/lib/admin-mock.ts` and does not reflect public passenger check-in progress.
3. **Contact & Inbox Disconnect**:
   - Submitting the public contact form (`src/routes/{-$locale}.contact.tsx`) updates local component state (`setSent(true)`) to display an inline prototype panel stating the message was not delivered anywhere; it emits no toast and writes to no store.
   - The admin staff inbox (`src/routes/{-$locale}.admin.inbox.tsx`) displays static `inboxMessages: InboxMessage[]` and never receives public submissions.
4. **Flight Operations Overrides**:
   - When staff edit flight status (e.g. gate change, delay) in `/admin` via `flight-quick-edit.tsx`, the change is saved to `localStorage["gza.admin.v1"]` via `applyOverride()`.
   - Admin views render this override via `withOverride(flight)`. Public flight status views (`src/routes/{-$locale}.flights.tsx`) do not currently consult the admin override store.
5. **New Booking at Counter (`src/routes/{-$locale}.admin.bookings.new.tsx`)**:
   - Staff booking creation sets page-local state (`setDone(true)`) and triggers a toast, rendering a confirmation card with hardcoded reference `GZA-NEW1`. It does not commit the booking to either `mockBookings` or `gza.store.v1`.

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
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Cancel Booking" | Opens bespoke `ConfirmDialog`; onConfirm sets page-local `cancelled = true` and calls `toast` (`mockBookings` untouched) | Phase 6 |
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Edit Contact" / "Seat" / "Extras" Save | Inside `AdminSheet`, Save button calls `useAdmin().toast(t("a2.saved"))` without mutating booking | Phase 6 |
| **Admin Booking Detail** | `src/routes/{-$locale}.admin.bookings.$ref.tsx` | "Re-send" / "Print Manifest" / "Boarding Pass" | Calls `useAdmin().toast(t("a2.uiOnly"))` (no action performed) | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Edit Contact" Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.saved"))` without updating `mockCustomers` | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Attach Booking" / "Reset Password" | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Disable Account" (`a2.cu.disable`) | Opens bespoke `ConfirmDialog`; onConfirm calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | "Save Draft" / "Publish" | "Save Draft" calls `toast(t("a2.saved"))`; "Publish" calls `toast(t("a2.uiOnly"))` | Phase 6 |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | Move Section Up / Down | Calls `useAdmin().toast(t("a2.saved"))` without reordering `homeSections` | Phase 6 |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | Edit Page Content Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.saved"))` | Phase 6 |
| **Admin Airport CMS** | `src/routes/{-$locale}.admin.airport.index.tsx` | Edit Timeline Entry Save | Inside `AdminSheet`, Save calls `useAdmin().toast(t("a2.saved"))` | Phase 6 |
| **Admin Airport CMS** | `src/routes/{-$locale}.admin.airport.index.tsx` | Duplicate / Move / Archive / Attach | Calls `useAdmin().toast(t("a2.uiOnly"))` | Phase 6 |
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
   - Opens `ConfirmDialog`; on confirmation, invokes `updateBooking(ref, { status: "cancelled" })` on `useStore()`.
   - Mutates `bookings: Booking[]` and immediately serializes the updated collection to `localStorage["gza.store.v1"]`.
2. **Public Flight Check-in (`src/routes/{-$locale}.manage.$ref_.check-in.tsx`)**:
   - Invokes `checkInLeg(ref, leg, paxIndexes)` on `useStore()`.
   - Appends passenger indices to `booking.checkedIn` (`CheckedIn = { out: number[]; in: number[] }`) and serializes to `localStorage["gza.store.v1"]`.
3. **Public Booking Creation (`src/routes/{-$locale}.book.tsx`)**:
   - Submitting the multi-step booking engine invokes `addBooking(...)` on `useStore()`.
   - Generates a persistent PNR (e.g. `GZA-7K8P`) and writes the complete booking record to `localStorage["gza.store.v1"]`.
4. **Public Saved Travelers & Profile (`src/routes/{-$locale}.account.*.tsx`)**:
   - Adding, editing, or deleting saved passenger profiles (`addTraveler`, `updateTraveler`, `removeTraveler`) persists to `localStorage["gza.store.v1"]`.
5. **Admin Flight Operational Overrides (`src/components/admin/flight-quick-edit.tsx`)**:
   - Editing flight status, gate, terminal, revised departure time, or operational note invokes `applyOverride(flightId, patch)` on `useAdmin()`.
   - Persists the override dictionary to `localStorage["gza.admin.v1"]` and merges with base flights via `withOverride(flight)`.

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
| **Forms & Input Validation** | **Native HTML5 & React `useState`** | `src/components/flight-search-form.tsx`, `src/components/kit.tsx`, product routes | Controlled native inputs, selects, and textareas using React `useState` and native HTML5 validation constraints (`required`, `type`, `min`, `autoComplete`). `react-hook-form`, `@hookform/resolvers`, `zod`, and `src/components/ui/form.tsx` are **unmounted templates or unused dependencies**. |

---

## 5. Mock Repository Convergence Plan (Phases 4–6) & Approved Roadmap Sequence

To eliminate data splits and pretend actions without building a backend prematurely, the project will converge into a unified mock repository:

```text
[ UI Components & Screens ]
           │
           ▼
[ TanStack Query Hooks (useFlight, useBookings, useCheckIn) ]
           │
           ▼
[ Domain Services (bookingService, flightService, operationsService) ]
           │
           ▼
[ Repository Interfaces (IBookingRepository, IFlightRepository) ]
           │
           ├── Phases 4–12: [ LocalStorage / In-Memory Mock Repository ]
           │                  (Unifies state across Public & Admin)
           │
           └── Phase 13+:   [ Remote API Repository ]
                              (Connects to production database & auth API)
```

### 5.1 Approved Master Engineering Roadmap Sequence (Phases 4–14+)

The development program follows this strictly sequenced progression:

1. **Phase 4 — Canonical Mock Domain & Repository Layer**:
   - Decouple UI components from direct `localStorage` access into domain entities and typed repository interfaces (`IBookingRepository`, `IFlightRepository`, `IOperationsRepository`).
   - Create a unified mock repository converging public bookings (`gza.store.v1`) and admin manifests (`mockBookings`, `deskPassengers`).
2. **Phase 4B — Typed Content & CMS Schema**:
   - Formalize typed content models for homepage editorial blocks, travel advisories, airport history chapters, and bilingual metadata.
3. **Phase 4C — Settings & Appearance Store Convergence**:
   - Migrate Appearance Studio draft state from query-parameter / browser-local storage into the canonical settings repository.
4. **Phase 5 — Public Workflows Convergence**:
   - Connect booking engine, trip management, check-in, passenger account hub, and contact forms to canonical domain repositories with comprehensive client-side validation.
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
