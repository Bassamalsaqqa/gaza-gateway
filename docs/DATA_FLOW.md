# Data Flow, State Management & Pretend-Action Inventory

> **Document Purpose**: Complete audit of current data sources, state persistence, cross-screen entity splits, and enabled no-op actions across public and admin workspaces.
> **Status**: **Phase 0.1 Active (Baseline Accuracy & Semantic Lint Gate)**.
> **Future Target**: Convergence into a unified Mock Repository Layer in Phases 4–6 before any production backend.

---

## 1. Current State Stores & Persistence

The application currently operates across four independent data sources:

| Store / Source | Implementation Files | Persistence | Entities & Data Types Managed |
| :--- | :--- | :--- | :--- |
| **Public Store** (`useStore`) | `src/lib/store.tsx` | `localStorage["gza.store.v1"]` (persisted) + in-memory session draft | Public bookings (`Booking[]`), account session (`Account | null`), and saved travelers (`Traveler[]`) are persisted to `localStorage["gza.store.v1"]`. Active booking search/selection draft (`draft: Draft`) is in-memory session state in `StoreProvider` (`useState<Draft>`) and resets on page reload. |
| **Admin Store** (`useAdmin`) | `src/lib/admin-store.tsx` | `localStorage["gza.admin.v1"]` | Staff identity (`Staff | null`), active role (`AdminRole`), flight operational overrides stored as `Record<string, FlightOverride>`. |
| **Admin Operations State** (`useAdmin().ops`) | `src/lib/admin-ops.ts` (models & seeds), `src/lib/admin-store.tsx` (`ops` & `patchOps`) | Session in-memory state in `AdminProvider` (`useState<OpsState>`). Resets to seed on reload. | Schedules (`Schedule[]`), aircraft fleet (`AircraftType[]`), seat maps (`Record<string, SeatMapConfig>`), fare products (`FareConfig[]`), baggage allowance (`BaggageConfig`), meals (`OptionItem[]`), assistance options (`OptionItem[]`), destination parameters (`DestinationConfig[]`). |
| **Admin Static Mock Data** | `src/lib/admin-mock.ts` | In-memory static constants | Bookings (`mockBookings: MockBooking[]`), customer profiles (`mockCustomers: MockCustomer[]`), check-in desk flights & passengers (`deskFlights: DeskFlight[]`, `deskPassengers: Record<string, DeskPassenger[]>`), staff inbox (`inboxMessages: InboxMessage[]`), staff directory (`staffRows: StaffRow[]`), audit log (`activityEntries: ActivityEntry[]`), operational analytics (`analyticsOverview`, `funnelSteps`, `routeStats`, `contentStats`), CMS & storytelling collections (`homeSections`, `travelSections`, `sitePages`, `timelineEntries`, `presentFacts`, `futureItems`, `archiveItems`, `sourceRecords`, `mediaItems`). |

### 1.1 Admin Flight Overrides Implementation Reality

In `src/lib/admin-store.tsx`:
- Overrides are held in a key-value dictionary: `overrides: Record<string, FlightOverride>`.
- Overrides are applied using `applyOverride(flightId: string, patch: FlightOverride)`.
- Base flight objects are merged with active overrides using `withOverride(flight: Flight): Flight & { note?: string; revisedDepart?: string }`.
- Overrides persist to `localStorage["gza.admin.v1"]` and are sanitized on load (`sanitizeOverride()`) to validate flight statuses and trim string fields while allowing intentional clears.

### 1.2 Public Booking Draft & Date Synchronization Reality

In `src/lib/store.tsx`:
- Initial search criteria in `initialDraft()` computes default departure date using `new Date().toISOString().slice(0, 10)` (UTC timestamp).
- Form validation and input limits in `FlightSearchForm` (`src/components/flight-search-form.tsx`) use `min={todayISO()}` from `src/lib/data.ts`, which uses local calendar date getters (`getFullYear()`, `getDate()`).
- **Confirmed Date-Basis Conflict**: When SSR executes in UTC or requests cross midnight boundaries (e.g. 22:54 UTC vs. 01:54 UTC+3 local time), `min="2026-09-18"` conflicts with `value="2026-09-17"`.
- **Observation Status**: A React hydration warning was observed once on `/ar` under dev-server testing around midnight, but did not reproduce on a repeat visit. The complete cause remains unconfirmed. Booking state code is left unchanged in Phase 0; resolution is mapped to Phase 1 (static pre-rendering) and Phase 5 (public booking workflow).

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

## 5. Mock Repository Convergence Plan (Phases 4–6)

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
