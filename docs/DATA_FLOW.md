# Data Flow, State Management & Pretend-Action Inventory

> **Document Purpose**: Complete audit of current data sources, state persistence, cross-screen entity splits, and enabled no-op actions across public and admin workspaces.
> **Status**: **Phase 0 Active (Measured Baseline Audit — Gates Open)**.
> **Future Target**: Convergence into a unified Mock Repository Layer in Phases 4–6 before any production backend.

---

## 1. Current State Stores & Persistence

The application currently operates across four independent data sources:

| Store / Source | Implementation File | Persistence | Entities & Data Types Managed |
| :--- | :--- | :--- | :--- |
| **Public Store** (`useStore`) | `src/lib/store.tsx` | `localStorage["gza.store.v1"]` | Public bookings (`Booking[]`), account session, saved travelers, user preferences, draft booking. |
| **Admin Store** (`useAdmin`) | `src/lib/admin-store.tsx` | `localStorage["gza.admin.v1"]` | Staff identity (`Staff | null`), active role (`AdminRole`), flight operational overrides stored as `Record<string, FlightOverride>`. |
| **Admin Operations State** | `src/lib/admin-ops.ts` | React component `useState` (in-memory) | Schedules (`FlightSchedule[]`), destinations (`DestinationOps[]`), aircraft fleet (`AircraftOps[]`), fare products (`ProductOps[]`). Resets on reload. |
| **Admin Static Mock Data** | `src/lib/admin-mock.ts` | In-memory static constants | Admin bookings (`mockBookings`), customer profiles (`mockCustomers`), check-in desk passengers (`mockDeskPassengers`), audit log (`mockActivityLog`), inbox messages (`mockInboxMessages`), analytics data (`mockAnalyticsData`). |

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
   - When a passenger checks in via `/manage/:ref/check-in` (`src/routes/{-$locale}.manage.$ref_.check-in.tsx`), the booking's `legs[].pax[].checkedIn` flag is updated in the public store.
   - The airport check-in desk monitor (`/admin/check-in`, file `src/routes/{-$locale}.admin.check-in.tsx`) renders static `mockDeskPassengers` from `src/lib/admin-mock.ts` and does not reflect public passenger check-in progress.
3. **Contact & Inbox Disconnect**:
   - Submitting the public contact form (`src/routes/{-$locale}.contact.tsx`) displays a success toast and resets the form, but writes no message to any store.
   - The admin staff inbox (`src/routes/{-$locale}.admin.inbox.tsx`) displays static `mockInboxMessages` and never receives public submissions.
4. **Flight Operations Overrides**:
   - When staff edit flight status (e.g. gate change, delay) in `/admin` via `flight-quick-edit.tsx`, the change is saved to `localStorage["gza.admin.v1"]` via `applyOverride()`.
   - Admin views render this override via `withOverride(flight)`. Public flight status views (`src/routes/{-$locale}.flights.tsx`) do not currently consult the admin override store.
5. **New Booking at Counter (`src/routes/{-$locale}.admin.bookings.new.tsx`)**:
   - Staff booking creation generates a mock reference `GZA-NEW1` and displays a confirmation card, but does not commit the booking to either `mockBookings` or `gza.store.v1`.

---

## 3. Systematic No-Op / Pretend-Action Inventory

The following table catalogs user-facing controls that appear functional (buttons, forms, action menus) but currently produce only simulated feedback (toast notifications, local component state, or no-ops):

| Route / Component | Exact File Path | Action / Element | Current Implementation / Effect | Resolution Phase |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Offload Passenger" | `toast.success(t(a2.offloaded, a2.offloadedAr))` (no state change) | Phase 6 |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Print Bag Tag" | `toast.success(t(a2.printed, a2.printedAr))` | Phase 6 |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Add Bag" | `toast.success(t(a2.bagAdded, a2.bagAddedAr))` (no record update) | Phase 6 |
| **Admin Check-in Desk** | `src/routes/{-$locale}.admin.check-in.tsx` | "Mark Boarded" | `toast.success(t(a2.statusUpdated, a2.statusUpdatedAr))` (no state change) | Phase 6 |
| **Admin Create Booking** | `src/routes/{-$locale}.admin.bookings.new.tsx` | "Issue Ticket" | Displays mock confirmation `GZA-NEW1`; no record created | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Save Notes" | `toast.success("Notes updated (mock)")`; notes not saved | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Flag for Review" | `toast.success("Customer flagged for review")` | Phase 6 |
| **Admin Customer Detail** | `src/routes/{-$locale}.admin.customers.$id.tsx` | "Re-send Booking" | `toast.success("Booking re-sent to customer email")` | Phase 6 |
| **Admin Website CMS** | `src/routes/{-$locale}.admin.website.tsx` | "Publish Banner / Content" | `toast.success(t(a2.uiOnly, a2.uiOnlyAr))` (UI preview only) | Phase 6 |
| **Admin Airport Operations** | `src/routes/{-$locale}.admin.airport.index.tsx` | "Update Facility / Runway" | `toast.success(t(a2.uiOnly, a2.uiOnlyAr))` (UI preview only) | Phase 6 |
| **Admin Staff Management** | `src/routes/{-$locale}.admin.staff.tsx` | "Invite Staff Member" | `toast.success("Staff invitation sent (mock)")` | Phase 6 |
| **Admin Settings** | `src/routes/{-$locale}.admin.settings.tsx` | "Save Station Settings" | `toast.success("Settings saved (mock)")` | Phase 6 |
| **Admin Inbox** | `src/routes/{-$locale}.admin.inbox.tsx` | "Reply / Archive" | Mutates local component `useState`; lost on page reload | Phase 6 |
| **Admin Schedules** | `src/routes/{-$locale}.admin.schedules.tsx` | "Save Schedule" | Mutates local component `useState`; lost on page reload | Phase 6 |
| **Admin Destinations** | `src/routes/{-$locale}.admin.destinations.$code.tsx` | "Update Route" | Mutates local component `useState`; lost on page reload | Phase 6 |
| **Admin Products** | `src/routes/{-$locale}.admin.products.tsx` | "Save Fare Rules" | Mutates local component `useState`; lost on page reload | Phase 6 |
| **Public Contact Form** | `src/routes/{-$locale}.contact.tsx` | "Send Message" | `toast.success("Message sent")`; dropped, no inbox link | Phase 5 |
| **Public Manage Booking** | `src/routes/{-$locale}.manage.$ref.tsx` | "Change Flight" | Modal stating flight changes are not available in mock | Phase 5 |

---

## 4. UI Primitives & Implementation Reality

| UI Pattern | Implementation Reality & Exact Technique | Primary File Locations | Implementation Notes |
| :--- | :--- | :--- | :--- |
| **Modal Dialogs & Alerts** | `@radix-ui/react-dialog` & `@radix-ui/react-alert-dialog` | `src/components/ui/dialog.tsx`, `src/components/confirm-dialog.tsx` | Used in public flows (cancellation confirmation, passenger detail). |
| **Admin Slide-over Sheet** | **Custom React implementation** (`AdminSheet`) | `src/components/admin/admin-kit.tsx`, `src/components/admin/flight-quick-edit.tsx` | Bespoke implementation using `useRef`, body scroll lock, manual focus trap (`e.shiftKey`), Escape listener. Does **not** use `vaul` or Radix dialog. |
| **Admin Mobile Navigation** | **Custom React implementation** (`MobileDrawer`) | `src/components/admin/admin-shell.tsx` | Custom off-canvas drawer with manual focus loop and body scroll lock. Does **not** use `vaul`. |
| **Admin Global Search** | **Custom React implementation** (`AdminSearch`) | `src/components/admin/admin-search.tsx` | Custom input and listbox with manual keyboard navigation (ArrowDown, ArrowUp, Enter, Escape). Does **not** import `cmdk`. |
| **Admin Account Menu** | **Custom React implementation** (`AccountMenu`) | `src/components/admin/admin-shell.tsx` | Custom dropdown with click-outside listener and Escape handler. Does **not** use Radix dropdown. |
| **Admin Attention Popover** | **Custom React implementation** (`AttentionBell`) | `src/components/admin/admin-shell.tsx` | Custom popover with click-outside listener and Escape handler. Does **not** use Radix popover. |
| **Date Selection** | `react-day-picker` | `src/components/ui/calendar.tsx`, `src/components/flight-search-form.tsx` | Accessible calendar for departure/return flight search. |
| **Seat Map** | Custom SVG / Interactive Grid | `src/components/booking/seat-map.tsx` | Aircraft cabin visualizer (Boeing 737 / Dash 8); handles seat selection and occupied states. |
| **Accordion / Collapsible** | `@radix-ui/react-accordion` | `src/components/ui/accordion.tsx` | Used in flight baggage rules, FAQs, and collapsible booking breakdown. |
| **Toast Notifications** | `sonner` / Custom Admin Toasts | `src/components/ui/sonner.tsx`, `src/components/admin/admin-kit.tsx` | Global toast provider in public app shell; custom stacked toast rendering in admin shell. |

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
