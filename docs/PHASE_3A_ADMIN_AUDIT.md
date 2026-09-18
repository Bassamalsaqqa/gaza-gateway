# Phase 3A Admin and Station Operations UX Audit

> **Run ID**: `20260918-phase-3a-admin`  
> **Workspace**: `C:\Users\bassa\Documents\GazaAirPort\gaza-gateway`  
> **Baseline Git Commit**: `4a7b9dea6b2502b748d00c011c0067f8c35be33c` on `main`  
> **Current Deliverable Status**: Accepted & Committed Phase 3A Audit (committed in `cc57cfe2450effd78547b591fd66b156ef5e699a`, cleaned/normalized in `2a9a6b2ab15ba50aec98366f47aee9287797018f`; historical run status at handoff: `M src/routeTree.gen.ts` [0 content diffs], untracked files preserved).
> **Scope**: Bounded Phase 3A workstream 3 of 5 (Admin & Station Operations UX Audit). No UI source edits, no redesign implementation, no new dependencies, no backend creation, no Git commit or push.

---

## 1. Executive Summary

This audit comprehensively evaluates the simulated back-office station workspace, operations desk, commercial controls, and content administration of the Gaza Gateway application. The station simulation represents an operational environment for **Gaza International Airport** (IATA: `GZA` / ICAO: `LVGZ`) and **Palestinian Airlines** (IATA: `PS` / ICAO: `PNW`), strictly governed by the product boundaries defined in [`PRODUCT.md`](../PRODUCT.md) and [`AGENTS.md`](../AGENTS.md).

The codebase defines 23 admin-related route files under `src/routes/{-$locale}.admin*.tsx` (comprising the `{-$locale}.admin.tsx` shell layout and 22 routable files total, including sign-in and access-denied). The browser audit directly visited 21 distinct English admin URLs, 4 sampled Arabic admin URLs (`/ar/admin/signin`, `/ar/admin`, `/ar/admin/flights`, `/ar/admin/bookings`), and 1 public URL (`/flights`), asserting actual browser interactions, state mutations, permission barriers, responsive layouts (from 320px mobile to 1280px desktop), English (LTR) and Arabic (RTL) typography, and accessibility behaviors across four primary staff workflows:

1. **Workflow 1: Access & Orientation (`/admin/signin`, `/admin`, role switching, permission gates, access-denied)**: Evaluates the client-side session barrier, quick-fill staff persona helpers (Admin, Ops Editor, Commercial Viewer), topbar breadcrumbs, quick-switcher (`Cmd+K`), attention popovers, collapsible sidebar, mobile drawer, and instant role switching. (Note: `<AdminDenied>` was evaluated via direct deep-link to `/admin/staff` under the Viewer role; `/admin/access-denied` was not separately navigated to as an independent URL).
2. **Workflow 2: Daily Operations (`/admin/flights`, `/admin/flights/$flightId`, `/admin/schedules`, `/admin/products`)**: Evaluates the daily flight operations board, status semantics, gate and time overrides, flight detail audit tabs, operational schedule editor, and fleet/fare class configuration.
3. **Workflow 3: Booking & Station Desk (`/admin/bookings`, `/admin/bookings/$ref`, `/admin/bookings/new`, `/admin/check-in`, `/admin/customers`, `/admin/customers/$id`)**: Evaluates station booking lookup and filtering, booking cancellation workflow, 5-step counter booking wizard, passenger check-in desk, baggage/document inspection drawer, and customer relationship management directory.
4. **Workflow 4: Content & Organization (`/admin/destinations`, `/admin/destinations/$code`, `/admin/airport`, `/admin/website`, `/admin/inbox`, `/admin/staff`, `/admin/settings`, `/admin/analytics`, `/admin/activity`)**: Evaluates route network content management, bilingual milestone and fact curation, CMS layout controls, staff messaging inbox, user access administration, station configuration, conversion funnel analytics, and the chronological operational audit log.

### Key Audit Findings Summary

| Workflow / Surface | Current Implementation State | Confirmed Defects & Architecture Gaps | Accessibility & Responsiveness (WCAG 2.2 AA) | Recommendation & Direction |
|---|---|---|---|---|
| **Access & Orientation** (`/admin/signin`, `/admin`, Shell) | Clean dual-column sign-in with quick-use staff cards. Shell features collapsible sidebar (w-60 to w-16), quick-search dialog (`Cmd+K`), and live role switcher in `AccountMenu`. Unauth guard renders "Sign in to continue" challenge (verified in `workflow1_access_orientation.unauth_guard`). | **Disconnected Session Simulation**: No backend authentication or JWT; session is client-only state (`gza.admin.v1`). Role switching in `AccountMenu` immediately grants all permissions on client without credential challenge. | Fully accessible skip link (`#admin-main`). Escape key correctly closes `AccountMenu` and returns focus to trigger button (`aria-label="Staff account"`). Search modal (`Cmd+K`) manages focus. | **KEEP UX, REBUILD INFRASTRUCTURE**: Retain the fast, elegant staff navigation UX; replace ad-hoc client state with unified session repository in Phase 4. |
| **Daily Operations** (`/admin/flights`, `$flightId`, `/schedules`) | Comprehensive flight board with date picker, direction filters, gate/terminal chips, load factors, and slide-over Quick Edit sheet. | **Public/Admin Store Boundary Disconnect**: Flight quick edits persist to `localStorage["gza.admin.v1"]` and update `/admin/flights` via `withOverride()`. However, the public flight board (`/flights`) does NOT invoke `withOverride()`. In empirical testing (`store_boundaries.public_vs_admin_flight_overrides`), flight `PS151` modified to `Boarding`/gate `A3`/`08:25` on `/admin/flights` visibly remains `Scheduled`/gate `A4`/`01:05` on `/flights`. | Dense table cleanly switches to stacked operational cards on 390px mobile. Aviation codes (`PS151`, `GZA → JED`, `14:30`) preserve strict LTR isolation via `.code-id` and `dir="ltr"` in Arabic RTL. | **CONSOLIDATE**: Unify flight data into single mock repository layer serving both public visitor boards and station dispatcher boards. |
| **Booking & Station Desk** (`/admin/bookings`, `$ref`, `/check-in`) | Filterable bookings table; booking cancellation modal; 5-step counter booking wizard; station check-in desk with flight selector pills and document inspection drawer. | **Static / Display-Only Isolation**: (1) Based on source inspection, public bookings (`localStorage["gza.store.v1"]`) and admin bookings (static `mockBookings`) operate in completely decoupled storage layers with no synchronization. (2) Counter booking wizard creates `GZA-NEW1` but appends nowhere. (3) Detail cancellation updates local component state only; navigating back reverts status to Confirmed. (4) Check-in desk buttons are toast-only; passenger status remains `Ready`. | Modals and slide-over sheets close on Escape. Mobile check-in desk renders clean vertical cards without horizontal overflow. Tables have semantic `<caption className="sr-only">`. | **KEEP UX, REBUILD INFRASTRUCTURE**: Keep the high-density operational desk interfaces; replace hardcoded mock arrays with reactive mutations in the unified repository. |
| **Content & Organization** (`/admin/destinations`, `/airport`, `/website`) | Multi-tab destination editor; historical milestone & fact editor with verification badges; homepage section toggles; staff directory with role manager; tamper-evident activity log. | **Ephemeral Session State & Toast-Only CMS**: (1) Destination changes update in-memory `opsState` via `patchOps()`, resetting on page refresh. (2) Archive milestones, archive item edits, website reordering, and staff invite/role changes trigger toasts without modifying underlying data. | Tablists use semantic `role="tablist"` and `role="tab"` with `aria-selected`. High contrast on limestone sand and olive green brand tokens. RTL mirroring operates correctly across all forms. | **CONSOLIDATE**: Connect content editing forms to persisted state and ensure historical claims display provenance verification labels matching public archive standards. |

---

## 2. Empirical Verification Index & Test Records

All administrative workflows, permission models, mutation persistence, and accessibility behaviors were evaluated using automated Chrome CDP execution against the production prerender build server (`PORT 4182`) across Desktop (1280×900) and Mobile (390×844) viewports in both English (`en`, LTR) and Arabic (`ar`, RTL).

Structured assertion records are permanently tracked in [`docs/evidence/phase-3a/20260918-phase-3a-admin/browser-test-records.json`](evidence/phase-3a/20260918-phase-3a-admin/browser-test-records.json).

The table below indexes the exact structured evidence records and verified postconditions:

| Record Key (JSON Object Path) | Route & Viewport | Focus / Target Area | Verified Postconditions & Behavioral Assertions |
| :--- | :--- | :--- | :--- |
| `workflow1_access_orientation.unauth_guard` | `/admin` (1280×900) | Unauthenticated Gate (`<AdminAuthGuard>`) | Confirmed unauthenticated barrier redirects to challenge card displaying heading **"Sign in to continue"** (`actualHeading: "Sign in to continue"`, `guardWorking: true`, `hasSignInButton: true`, `hasPublicSiteButton: true`). Automated query for "Sign in required" was an assertion text mismatch; source and browser confirm guard operates correctly. |
| `workflow2_daily_operations.quick_edit_mutation` | `/admin/flights` (1280×900) | Flight Dispatch Quick Edit Sheet | Confirmed operational mutation on flight `PS151`: status changed from Scheduled to Boarding, gate from A4 to A3, revised departure to 08:25 (`toastObserved: true`). Verified override persisted to `localStorage["gza.admin.v1"]` under key `PS151-2026-09-18-out` (`persistedInLocalStorage: true`) and flight row immediately re-rendered with new parameters. |
| `workflow3_booking_station_desk.booking_cancellation` | `/admin/bookings/GZA4TQ` (1280×900) | Station Booking Cancellation | Confirmed cancellation modal updates detail badge to `Cancelled` (`detailStatusAfterCancel: "Cancelled"`). However, navigating back to bookings directory reverts badge to `Confirmed` (`tableStatusAfterNavigatingBack: "Confirmed (reverted)"`, `persistedToStore: false`); mutation updates local component state only without persisting to backing mock data. |
| `workflow3_booking_station_desk.counter_booking_creation` | `/admin/bookings/new` (1280×900) | Ticket Counter Booking Wizard | Confirmed 5-step wizard completes and renders synthetic booking confirmation reference card `GZA-NEW1` (`generatedRef: "GZA-NEW1"`). Confirmed display-only simulation; new reference is not appended to the station bookings ledger (`appendedToBookingsList: false`). |
| `workflow3_booking_station_desk.desk_checkin_action` | `/admin/check-in` (1280×900) | Station Check-In Desk | Confirmed clicking "Check in" on passenger Nadia Sabbagh triggers green toast notification (`a2.ci.checkedInToast`), but passenger status badge remains `Ready` (`mutated: false`). Proves toast-only action behavior without mutating the backing `deskPassengers` array. |
| `workflow4_content_organization.destination_mutation` | `/admin/destinations/AMM` (1280×900) | Destination Content Editor | Confirmed multi-tab editorial edits save to in-memory ops state via `patchOps("destinations", ...)` (`savesToOpsState: true`), but ops state is not saved to `localStorage` (`persistedInLocalStorage: false`), resetting upon page refresh. |
| `interactive_a11y_directionality.skip_link` | `/admin` (1280×900) | Admin Keyboard Skip Navigation | Confirmed pressing `Tab` on initial page load immediately focuses `<a href="#admin-main">Skip to admin content</a>` (`works: true`). |
| `interactive_a11y_directionality.account_menu_keyboard` | `/admin` (1280×900) | Account Menu Dropdown Keyboard Management | Confirmed opening account menu mounts dropdown dialog (`opened: true`); pressing `Escape` cleanly dismisses the dropdown (`dismissedOnEscape: true`) and returns focus to triggering button (`focusReturned: true`). |
| `interactive_a11y_directionality.ltr_isolation_arabic` | `/ar/admin/flights`, `/ar/admin/bookings`, `/ar/admin` (1280×900) | RTL Aviation Technical Identifier Isolation | Inspected 180 inline technical spans and code elements (`sampleCount: 180`). Confirmed strict LTR isolation (`dir="ltr"`) for flight numbers (`PS151`), IATA codes (`GZA`), times (`01:05`), aircraft types (`Boeing 737-800`), gates (`1 · A4`), seat loads (`154/168`), and keyboard shortcuts (`⌘K`). |
| `store_boundaries.public_vs_admin_flight_overrides` | `/admin/flights` vs `/flights` (1280×900) | Cross-Application Store Boundary | Empirical proof of decoupled stores (`propagated: false`): flight `PS151` on Friday 18 Sept displays status Scheduled and gate A4 on public `/flights`, while `/admin/flights` displays status Boarding, gate A3, and departure 08:25. Source inspection confirms `useAdmin().withOverride()` reads overrides in admin but is not called by the public flight board. |
| `store_boundaries.public_vs_admin_bookings` | `/book` vs `/admin/bookings` | Booking Storage Architecture Analysis | Architectural evaluation confirms public booking flow writes to `localStorage["gza.store.v1"]` via `useStore()`, whereas station admin at `/admin/bookings` reads hardcoded `mockBookings` from `src/lib/admin-mock.ts` (`sharesDataStore: false`), operating in completely decoupled data spaces without cross-store synchronization. |

---

## 3. Detailed Walkthrough of Actual Staff Workflows

### Workflow 1: Access and Orientation

The admin shell (`AdminShell`) establishes a dedicated operational workspace distinct from the public portal, utilizing a darker, focused palette with limestone and olive-green accents:

1. **Sign-In Flow & Persona Seeding**:
   - Navigating to `/admin` without an authenticated session mounts `<AdminAuthGuard>` (evaluated in `workflow1_access_orientation.unauth_guard`), which prevents access and renders a clear challenge screen displaying the heading **"Sign in to continue"** (`t("adm.signin.required")`) with a "Sign in" button pointing to `/admin/signin` and a "Back to the website" link pointing to `/`.
   - *Test Record Clarification*: The automated assertion record in `browser-test-records.json` initially looked for the substring "Sign in required", which returned `false` due to selector text mismatch; browser testing and source inspection of `src/routes/{-$locale}.admin.tsx` confirm the guard functions correctly with the heading "Sign in to continue".
   - `/admin/signin` displays a split layout with a branded side banner ("Station control & operations") and three convenient one-click persona cards:
     - **Rana Habib (Station Admin)**: Full administrative access (`admin.manage`, `ops.edit`, `commercial.edit`).
     - **Tariq Zeidan (Ops Editor)**: Operational and content editing permissions (`ops.edit`, `content.edit`).
     - **Laila Qandil (Commercial Viewer)**: Read-only access (`ops.view`, `commercial.view`).
   - Clicking "Use" fills the form, and submitting signs in immediately by setting `staffSession` in `localStorage["gza.admin.v1"]`.
   - On 390px and 320px mobile viewports, the side banner is cleanly hidden via `hidden lg:flex`, keeping all helper cards accessible without horizontal scroll.

2. **Shell Navigation & Responsive Adaptability**:
   - **Sidebar**: The desktop sidebar provides 13 organized navigation links categorized under Operations, Station Desk, Content & CMS, and Administration. A collapse toggle button shrinks the sidebar from `w-60` to `w-16` (icon-only mode with tooltips), expanding horizontal table space.
   - **Mobile Drawer**: At viewports below 1024px (`lg`), the sidebar disappears and a hamburger menu button in the header opens a slide-over `AdminDrawer`.
   - **Command Palette (`Cmd+K`)**: Pressing `Cmd+K` or clicking the header search input opens a keyboard-navigable command dialog, providing search suggestions and quick filtering across flights, bookings, customers, destinations, and content.
   - **Attention Popover**: A bell icon button opens the operational dispatch popover, listing urgent items such as unassigned gates or flights awaiting closeout.

3. **Role Switching & Permission Enforcement**:
   - In `AccountMenu` (evaluated in `interactive_a11y_directionality.account_menu_keyboard`), staff can toggle their simulated role between Admin, Editor, and Viewer with a single click.
   - Switching to Editor instantly hides Administration links (`/admin/staff`, `/admin/settings`) from the sidebar navigation.
   - Direct navigation to `/admin/staff` under the Viewer role cleanly renders `<AdminDenied>`, showing a red security shield icon, the user's current role badge (`Viewer`), the missing required permission (`admin.manage`), and a button to return to the dashboard.
   - *Screen Inventory Note*: The standalone route file `src/routes/{-$locale}.admin.access-denied.tsx` exists in the route tree, but the access-denied behavior was evaluated in-browser at `/admin/staff` via `<AdminDenied>`. `/admin/access-denied` was not separately navigated to as a standalone page.
   - **Simulation Boundary Note**: This is a client-side simulation. No JWT tokens or server authentication headers are verified; any client script can modify `gza.admin.v1` to alter roles.

---

### Workflow 2: Daily Operations

1. **Daily Flight Operations Board (`/admin/flights`)**:
   - The flight operations table displays daily flight dispatches with filtering by date, direction (All, Departures, Arrivals), and status (Scheduled, Boarding, Departed, Delayed, Cancelled).
   - Each flight row presents rich operational data: Scheduled and revised times, flight number (`PS151`), route (`GZA → JED`), aircraft type (`Boeing 737-800`), terminal/gate (`1 · A4`), sold load factor (`154/168`), check-in count (`0 of 0`), and operational status badge.
   - On 390px mobile, the table transforms into stacked operational cards, preventing text truncation or awkward horizontal scrolling.
   - In Arabic RTL, technical codes maintain strict LTR isolation via `.code-id` and `dir="ltr"`.

2. **Flight Quick Edit Mutation**:
   - Clicking "Quick edit" on flight `PS151` opens a slide-over `AdminSheet` (evaluated in `workflow2_daily_operations.quick_edit_mutation`).
   - Testing an operational mutation:
     - **Before**: Status = `Scheduled`, Gate = `A4`, Time = `01:05`. `storageOverrides` = `{}`.
     - **Action**: Modified status to `Boarding`, gate to `A3`, revised departure to `08:25`, and entered dispatcher note: *"Gate change announced for departure"*.
     - **After in Admin Board**: Flight board updates immediately showing revised time `08:25`, gate `A3`, and green `Boarding` chip.
     - **Store Verification**: `localStorage["gza.admin.v1"]` recorded:
       ```json
       {
         "PS151-2026-09-18-out": {
           "status": "Boarding",
           "gate": "A3",
           "terminal": "1",
           "revisedDepart": "08:25",
           "aircraft": "Boeing 737-800",
           "note": "Gate change announced for departure"
         }
       }
       ```
   - **Public Store Boundary Disconnect**:
     - *Empirical Browser Observation*: Navigating to the public departures board at `/flights` provides immediate visual proof of the store boundary. In browser testing (test record `store_boundaries.public_vs_admin_flight_overrides`), flight `PS151` on Friday 18 Sept visibly displays its unoverridden defaults: status **Scheduled**, gate **A4**, and scheduled departure **01:05**. Meanwhile, on `/admin/flights` (evaluated in `workflow2_daily_operations.quick_edit_mutation`), the same flight displays status **Boarding**, gate **A3**, and revised departure **08:25**.
     - *Source Code Explanation*: Source inspection reveals that `src/routes/{-$locale}.admin.flights.index.tsx` invokes `withOverride()` from `useAdmin()`, overlaying overrides from `localStorage["gza.admin.v1"]`. In contrast, `src/routes/{-$locale}.flights.tsx` renders static flight data directly from `src/lib/data.ts` without calling `withOverride()`. Admin dispatcher overrides are therefore structurally blocked from reaching public visitors.

3. **Flight Detail & Operational Audit Trail (`/admin/flights/$flightId`)**:
   - Clicking a flight row opens its deep operational inspection view.
   - The Overview tab visualizes load factors, gate/stand allocations, baggage reconciliation progress, and crew assignments.
   - The History tab provides a chronological event log tracking state changes.

4. **Schedules & Fleet Configuration**:
   - `/admin/schedules` manages recurring weekly flight timetables with day-of-week frequency chips (e.g. `M T W T F S S`). Clicking an entry opens a schedule editor sheet.
   - `/admin/products` displays fleet aircraft specifications (Boeing 737-800, De Havilland Dash 8-300), seat counts, pitch, cabin classes, and baggage tier pricing.

---

### Workflow 3: Booking & Station Desk

1. **Bookings Ledger & Filters (`/admin/bookings`)**:
   - Central booking registry with search by PNR or passenger name, and filtering by status (`Confirmed`, `Pending`, `Cancelled`).
   - Table columns include Booking reference (`GZA4TQ`), Primary passenger (`Nadia Sabbagh`), Flight number (`PS100`), Route (`GZA → AMM`), Date, Total fare (`$180`), and Status badge.
   - In Arabic RTL, PNR references and monetary figures retain strict LTR isolation.

2. **Booking Cancellation Mutation Test (`/admin/bookings/$ref`)**:
   - Viewing booking `GZA4TQ` displays passenger details, contact information, itinerary legs, and payment summary.
   - Clicking "Cancel booking" triggers a confirmation dialog.
   - Confirming cancellation immediately updates the detail screen badge to `Cancelled` (evaluated in `workflow3_booking_station_desk.booking_cancellation`).
   - **State Defect**: Navigating back to `/admin/bookings` revealed the row still showed `Confirmed`. Source inspection of `src/routes/{-$locale}.admin.bookings.$ref.tsx` showed the cancellation updates local React component state only, without mutating the static `mockBookings` array in `admin-mock.ts`.

3. **Counter Booking Creation Wizard (`/admin/bookings/new`)**:
   - A 5-step wizard designed for station ticket counter agents:
     - **Step 1 (Flight Search)**: Origin, destination (`AMM`), departure date, and cabin class (`Economy`).
     - **Step 2 (Select Flight)**: Selects flight `PS100` ($180).
     - **Step 3 (Passenger Details)**: Fills passenger details for Nadia Sabbagh (Email: `nadia@example.com`, Phone: `+970 59 000 0000`, Document: `P12345678`).
     - **Step 4 (Seat & Extras)**: Assigns seat `14C`, 1 checked bag (23kg), standard meal, no special assistance.
     - **Step 5 (Review & Summary)**: Displays pricing breakdown ($180 flight + $30 baggage = $210 total) and prototype disclaimer.
     - **Success Screen**: Clicking "Create booking" displays synthetic confirmation reference `GZA-NEW1` (evaluated in `workflow3_booking_station_desk.counter_booking_creation`).
   - **Simulation Defect**: Navigating to `/admin/bookings` proved `GZA-NEW1` was **NOT appended** to the bookings list. The wizard is purely display-only.

4. **Public vs Admin Booking Store Boundary (Architectural Inference)**:
   - *Status of Run Fixture*: No public booking was generated at `/book` during this audit run (`publicBookingsInStorage: 0`).
   - *Architectural Finding*: Based on source inspection of `src/lib/store.tsx` (where public bookings from `/book` write to `localStorage["gza.store.v1"]` via `useStore().createBooking()`) and `src/routes/{-$locale}.admin.bookings.index.tsx` (which reads from the hardcoded array `mockBookings` in `src/lib/admin-mock.ts`), the two systems operate in completely isolated data spaces. The admin booking ledger neither reads from nor synchronizes with the public local storage store.

5. **Station Check-In Desk (`/admin/check-in`)**:
   - Designed for gate agents and counter staff. Flight selector pills switch passenger manifests between active departures (`PS100`, `PS200`, `PS150`).
   - The passenger manifest lists Passenger name, PNR, Document status (`Verified` / `Pending`), Assigned seat (`12A`), Checked bags (`2`), Special assistance (`None`), and Check-in status (`Ready`).
   - On 390px mobile, passengers render as cleanly formatted touch-friendly cards.
   - **Toast-Only Action Defect**: Clicking "Check in" on passenger Nadia Sabbagh triggers a green toast notification ("Passenger checked in"), but the passenger status badge remains `Ready` (evaluated in `workflow3_booking_station_desk.desk_checkin_action`). The click handler executes `toast()` without mutating the `deskPassengers` array.
   - Clicking "View extras" opens an inspection sheet detailing baggage weight, passport verification, and seat allocation.

6. **Customer Directory & Profile CRM (`/admin/customers`)**:
   - `/admin/customers` lists frequent travelers, contact details, total trip counts, and status.
   - Deep inspection of customer `c-1001` displays Nadia Sabbagh's complete CRM record: historical flights, saved family travelers (Karim Sabbagh, Huda Sabbagh), and travel preferences (Window seat, Halal meal).

---

### Workflow 4: Content & Organization

1. **Destinations Network CMS (`/admin/destinations`, `$code`)**:
   - Overview table lists regional routes with weekly frequencies, base fares, editorial status (`Published` / `Draft`), and bilingual completeness badges.
   - Editing Amman (`AMM`) provides a tabbed editor (Basics, Public Page, Route, SEO) and language switcher (`EN` / `AR`), evaluated in `workflow4_content_organization.destination_mutation`.
   - The Public Page tab provides editorial textareas for city descriptions and highlighted "Good to know" points.
   - **In-Memory Ops State Defect**: Saving updates `opsState` in `admin-ops.ts`, updating the view during the session. However, because `opsState` is not persisted to `localStorage`, refreshing the browser discards edits.

2. **Airport Heritage & Archive CMS (`/admin/airport`)**:
   - The Past tab manages historical milestones with bilingual titles and verification status badges (`Verified`, `Pending research`).
   - The Present tab curates airport facts (coordinates, IATA code `GZA`, runway length 3,080m, status) with verification badges.
   - The Archive tab displays a visual grid of digitized photographs and historical documents.
   - Clicking "Edit" on an archive item opens a metadata sheet with category, era, date, rights, caption, and credit fields.
   - **Action Defect**: Editing archive metadata triggers `toast("Saved")` without updating `archiveItems`.

3. **Website Notices & Layout (`/admin/website`)**:
   - `/admin/website` provides CMS controls for public site sections: toggling visibility (Hero, Flight Search, Destinations, Heritage, Travel Information) and reordering section sequences via up/down controls.

4. **Staff Inbox (`/admin/inbox`)**:
   - A master-detail inbox for customer enquiries and ground support messages. Selecting a thread displays the message history, links directly to the related booking reference (`GZA4TQ`), and provides a reply composer.

5. **Staff Administration (`/admin/staff`)**:
   - User directory displaying active staff members, roles, email addresses, and last active timestamps.
   - Clicking "Invite staff" opens a slide-over sheet with role selection radio buttons (Admin, Ops Editor, Commercial Viewer).
   - Action buttons ("Change role", "Disable", "Invite staff") trigger toast notifications without mutating `staffRows`.

6. **Settings, Analytics & Activity Audit**:
   - **Settings (`/admin/settings`)**: Station configuration covering airport names, codes, timezones, and active gates (A1–A6, B1–B4).
   - **Analytics (`/admin/analytics`)**: Conversion metrics tracking a 9-stage booking funnel (Search $\rightarrow$ Select $\rightarrow$ Passenger $\rightarrow$ Seats $\rightarrow$ Extras $\rightarrow$ Review $\rightarrow$ Payment $\rightarrow$ Confirmation $\rightarrow$ Manage), route popularity, and load trends.
   - **Activity Log (`/admin/activity`)**: Tamper-evident operational audit trail documenting actions, timestamps, actors, modules, and before/after values.

---

### Cross-Cutting Interactive, Accessibility & Directionality Tests

The automated audit asserted keyboard navigation, focus management, and directionality across the admin shell:

1. **Skip Link**:
   - Pressing `Tab` upon navigating to `/admin` immediately focuses `<a href="#admin-main">Skip to admin content</a>`. Verified in `browser-test-records.json` under `interactive_a11y_directionality.skip_link`.
2. **Modal & Menu Keyboard Dismissal & Focus Return**:
   - Opening `AccountMenu` mounts a dropdown dialog. Pressing `Escape` cleanly dismisses the menu, and focus is automatically restored to the triggering button (`aria-label="Staff account"`). Verified in `browser-test-records.json` under `interactive_a11y_directionality.account_menu_keyboard`.
   - Opening slide-over sheets (`AdminSheet`) traps focus within the panel and dismisses immediately upon pressing `Escape` or clicking the backdrop.
3. **Arabic RTL Directionality & LTR Technical Isolation**:
   - Audited 180 inline technical spans and code elements across `/ar/admin/flights`, `/ar/admin/bookings`, and `/ar/admin` (verified in `interactive_a11y_directionality.ltr_isolation_arabic`).
   - Verified that all aviation identifiers—flight numbers (`PS151`), IATA airport codes (`GZA`, `JED`, `AMM`), times (`01:05`, `08:25`), dates (`2026-09-18`), aircraft models (`Boeing 737-800`), gate numbers (`A3`), load ratios (`154/168`), and PNR references (`GZA4TQ`)—maintain strict LTR isolation via `.code-id` or explicit `dir="ltr"`.

---

## 4. Classified Findings

### 4.1 Implementation Defects

1. **Booking Cancellation Local-Only State**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/routes/{-$locale}.admin.bookings.$ref.tsx`](../src/routes/{-$locale}.admin.bookings.$ref.tsx#L50).
   - *Evidence*: `browser-test-records.json` shows booking `GZA4TQ` changes to `Cancelled` in detail view, but reverts to `Confirmed` when navigating back to `/admin/bookings`.
   - *Cause*: Cancellation modifies local component state `useState("confirmed")` instead of mutating the backing array or store.

2. **Counter Booking Wizard Does Not Append Record**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/routes/{-$locale}.admin.bookings.new.tsx`](../src/routes/{-$locale}.admin.bookings.new.tsx#L180).
   - *Evidence*: `browser-test-records.json` records that synthetic booking `GZA-NEW1` is never added to `mockBookings`.
   - *Cause*: Wizard completion sets `created = "GZA-NEW1"` to show the success card, but performs no mutation to any data store.

3. **Check-In Desk Actions are Toast-Only**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/routes/{-$locale}.admin.check-in.tsx`](../src/routes/{-$locale}.admin.check-in.tsx#L185).
   - *Evidence*: Clicking "Check in" on Nadia Sabbagh shows a toast, but status remains `Ready` (evaluated in `workflow3_booking_station_desk.desk_checkin_action`).
   - *Cause*: `onClick={() => { toast(t("a2.ci.checkedInToast")); }}` does not update `deskPassengers`.

4. **Destination CMS Changes Discarded on Refresh**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/lib/admin-ops.ts`](../src/lib/admin-ops.ts#L45) / [`{-$locale}.admin.destinations.$code.tsx`](../src/routes/{-$locale}.admin.destinations.$code.tsx#L82).
   - *Evidence*: `patchOps("destinations", ...)` updates in-memory `opsState`, but `opsState` is not persisted to `localStorage`. Refreshing resets all edits to seed defaults.

5. **Public Flight Board Ignores Admin Overrides**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/routes/{-$locale}.flights.tsx`](../src/routes/{-$locale}.flights.tsx#L30).
   - *Evidence*: In empirical browser testing (test record `store_boundaries.public_vs_admin_flight_overrides`), flight `PS151` on Friday 18 Sept visibly shows status **Scheduled** and gate **A4** (scheduled time `01:05`), while `/admin/flights` (evaluated in `workflow2_daily_operations.quick_edit_mutation`) shows status **Boarding**, gate **A3**, and revised departure **08:25**. Admin dispatcher overrides did not propagate to the public flight board.
   - *Cause*: Source inspection confirms `{-$locale}.admin.flights.index.tsx` invokes `withOverride()` from `useAdmin()`, whereas `{-$locale}.flights.tsx` renders static mock flights from `src/lib/data.ts` without calling `withOverride()`.

---

### 4.2 Component Architecture & Layout Findings

1. **Isolated Data Store Fragmentation**:
   - *Classification*: Architecture Gap.
   - *Finding*: Based on source inspection, the application maintains four completely disconnected data layers:
     1. Public Store: `localStorage["gza.store.v1"]` managing public bookings and user profiles.
     2. Admin Store: `localStorage["gza.admin.v1"]` managing staff session and flight overrides.
     3. Ops State: In-memory `opsState` in `admin-ops.ts` managing schedules and destination configurations.
     4. Static Mock Arrays: Hardcoded arrays in `admin-mock.ts` managing admin bookings, check-in desk passengers, and customer accounts.
   - *Impact*: Architectural analysis confirms that public bookings written to `localStorage["gza.store.v1"]` do not appear in `/admin/bookings` (which reads static `mockBookings`), and admin flight overrides do not propagate to the public flight board.

2. **Unified Admin Kit (`AdminKit`) Consistency**:
   - *Classification*: Architecture Strength.
   - *Finding*: The visited admin section pages consistently leverage standardized primitives from [`src/components/admin/admin-kit.tsx`](../src/components/admin/admin-kit.tsx): `<AdminPageHeader>`, `<AdminPanel>`, `<AdminTabs>`, `<AdminChip>`, `<AdminSheet>`, `<AdminField>`, `<Ltr>`, and `<PermissionButton>`.
   - *Impact*: Visual consistency, typography, border styling, and focus states are strictly maintained across the entire back-office suite.

---

### 4.3 UX & Usability Patterns

1. **Responsive Table Adaptation**:
   - *Classification*: Usability Strength.
   - *Finding*: High-density data tables (`/admin/flights`, `/admin/bookings`, `/admin/check-in`, `/admin/staff`) gracefully hide table headers on mobile viewports (<768px) and switch to stacked card layouts.
   - *Impact*: Staff operations can be managed comfortably on mobile devices (390px/320px) without horizontal scrolling.

2. **Transparent Pre-Operational Simulation**:
   - *Classification*: Design System Adherence.
   - *Finding*: The admin shell consistently displays prototype notices ("Simulated Station Operations", "Pre-operational demonstration environment") and explicitly marks mock actions with badges.
   - *Impact*: Prevents false assumptions of live airline or security connectivity, honoring `PRODUCT.md`.

---

## 5. Aviation Identifiers, Provenance & Store Boundary Assessment

### Directionality & LTR Technical Isolation

Aviation operations depend heavily on standardized alphanumeric identifiers. In accordance with Invariant 3 in [`AGENTS.md`](../AGENTS.md), these must remain strictly LTR regardless of the document's overall directionality:

- **Flight Numbers**: `PS 151`, `PS 100`, `PS 204`
- **IATA / ICAO Codes**: `GZA`, `AMM`, `CAI`, `JED`, `LVGZ`, `PNW`
- **Booking References (PNRs)**: `GZA4TQ`, `GZA-NEW1`, `GZA-7K8P`
- **Aircraft Types & Registrations**: `Boeing 737-800`, `Dash 8-300`, `SU-YAH`
- **Dates & Times**: `2026-09-18`, `01:05`, `08:25`, `14:30`
- **Passenger Contact & Identifiers**: `+970 59 000 0000`, `nadia@example.com`, `P12345678`

The audit confirmed that across all Arabic admin views (`/ar/admin/*`), these identifiers are consistently wrapped in `<Ltr>` components or styled with `.code-id` (`dir="ltr"`), preventing bidirectional punctuation corruption (such as `151-PS` or `GZA → AMM` arrows flipping incorrectly).

### Provenance & Historical Accuracy in Admin Editor

In `/admin/airport`, the admin editor provides structured metadata management for historical milestones and airport facts. Each milestone is labeled with a verification state:
- `Verified`: Historically established facts (e.g. 1998 opening, 3,080m runway, IATA code `GZA`).
- `Pending research`: Historical claims awaiting formal archival documentation.

This editorial pattern reinforces the historical integrity requirements of `PRODUCT.md` and provides the necessary foundation for the public airport archive surfaces.

---

## 6. Eight Bounded Decision Cards

### Card 1: Admin Navigation & Role Orientation
- **Current State**: Collapsible sidebar, mobile drawer, `Cmd+K` search modal, and topbar account switcher providing instant persona switching (`admin`, `editor`, `viewer`).
- **Evidence**: Retained browser test records `workflow1_access_orientation.unauth_guard`, `interactive_a11y_directionality.skip_link`, and `interactive_a11y_directionality.account_menu_keyboard`; inspected in `src/components/admin/admin-shell.tsx` and `src/components/admin/account-menu.tsx`.
- **Strengths**: Fast, elegant orientation; keyboard accessibility with focus management; clean responsive collapse.
- **Defects vs Opportunities**: Current authentication and role switching are client-only local state without server enforcement.
- **Options**:
  - *Option A*: Maintain client simulation UX while routing role state through a unified mock session repository (Phase 4).
  - *Option B*: Introduce real JWT/backend authentication prematurely (violates Invariant 5: No backend yet).
- **Recommendation**: Adopt Option A.
- **Classification**: `KEEP UX, REBUILD INFRASTRUCTURE`
- **Owner Decision Required?**: NO

---

### Card 2: Flight & Schedule Editing
- **Current State**: Flight board with quick edit sheet that persists overrides to `localStorage["gza.admin.v1"]` (`withOverride()`). In-memory seasonal schedule planner.
- **Evidence**: Retained browser test records `workflow2_daily_operations.quick_edit_mutation` and `store_boundaries.public_vs_admin_flight_overrides`; inspected in `src/routes/{-$locale}.admin.flights.index.tsx` and `src/routes/{-$locale}.flights.tsx`.
- **Strengths**: Working local mutation; intuitive slide-over quick edit sheet; clear status chips and gate assignment controls.
- **Defects vs Opportunities**: In empirical testing (`store_boundaries.public_vs_admin_flight_overrides`), flight `PS151` remains `Scheduled`/gate `A4` on public `/flights`, while `/admin/flights` shows `PS151` as `Boarding`/gate `A3`. Admin dispatcher overrides do not propagate to public visitors.
- **Options**:
  - *Option A*: Consolidate flight data so both public boards and admin boards share the same mock repository and override layer.
  - *Option B*: Keep separate stores and accept that public and admin views will disagree.
- **Recommendation**: Adopt Option A.
- **Classification**: `CONSOLIDATE`
- **Owner Decision Required?**: NO

---

### Card 3: Booking & Desk Operations
- **Current State**: Booking ledger with filters; detail view with cancellation confirmation; 5-step counter booking wizard.
- **Evidence**: Retained browser test records `workflow3_booking_station_desk.booking_cancellation`, `workflow3_booking_station_desk.counter_booking_creation`, and `store_boundaries.public_vs_admin_bookings`; inspected in `src/routes/{-$locale}.admin.bookings.$ref.tsx` and `src/routes/{-$locale}.admin.bookings.new.tsx`.
- **Strengths**: Comprehensive station booking workflows; clear pricing breakdowns and passenger detail forms.
- **Defects vs Opportunities**: Cancellations do not persist to backing arrays; counter bookings generate PNRs but do not append to the booking list; source inspection indicates public bookings made at `/book` (`gza.store.v1`) do not feed into `/admin/bookings` (static `mockBookings`).
- **Options**:
  - *Option A*: Keep the complete UX flow and bind it to the unified mock repository so counter bookings and cancellations persist.
  - *Option B*: Simplify to a read-only booking viewer.
- **Recommendation**: Adopt Option A.
- **Classification**: `KEEP UX, REBUILD INFRASTRUCTURE`
- **Owner Decision Required?**: NO

---

### Card 4: Check-in Desk & Passenger Manifest Workflow
- **Current State**: Interactive check-in desk with flight selector pills, passenger manifests, and document inspection drawer.
- **Evidence**: Retained browser test record `workflow3_booking_station_desk.desk_checkin_action`; inspected in `src/routes/{-$locale}.admin.check-in.tsx`.
- **Strengths**: Realistic gate agent desk interface; clear documentation status indicators; responsive mobile card layout.
- **Defects vs Opportunities**: "Check in" and "Issue boarding pass" buttons trigger toasts without mutating passenger status.
- **Options**:
  - *Option A*: Retain the check-in desk UX and connect actions to real mutations in the mock repository.
  - *Option B*: Remove check-in desk from admin and restrict check-in to public `/manage`.
- **Recommendation**: Adopt Option A.
- **Classification**: `KEEP UX, REBUILD INFRASTRUCTURE`
- **Owner Decision Required?**: NO

---

### Card 5: Content Editing & Archival Provenance
- **Current State**: Destination editor and airport archive editor with verification badges (`Verified` / `Pending`).
- **Evidence**: Retained browser test record `workflow4_content_organization.destination_mutation`; inspected in `src/routes/{-$locale}.admin.destinations.$code.tsx`, `src/routes/{-$locale}.admin.airport.tsx`, and `src/lib/admin-ops.ts`.
- **Strengths**: Clear bilingual editing interfaces; structured verification badges honoring historical provenance.
- **Defects vs Opportunities**: Destination edits reset on refresh; archive milestone edits are toast-only.
- **Options**:
  - *Option A*: Consolidate content state into persistent mock storage and connect admin edits to public visitor views.
  - *Option B*: Remove content editing screens from the admin simulation.
- **Recommendation**: Adopt Option A.
- **Classification**: `CONSOLIDATE`
- **Owner Decision Required?**: NO

---

### Card 6: Table & Filter System
- **Current State**: High-density data tables across flights, bookings, check-in, staff, and activity with search filters and status pills.
- **Evidence**: Responsive layout inspections across high-density operational tables (`/admin/flights`, `/admin/bookings`, `/admin/check-in`, `/admin/staff`, `/admin/activity`) using `<AdminPanel>` and `<AdminKit>`.
- **Strengths**: Consistent typography; semantic `<caption className="sr-only">`; responsive card collapse on mobile.
- **Defects vs Opportunities**: Sorting is currently static or limited to predefined filters.
- **Options**:
  - *Option A*: Keep table and filter componentry as-is; it meets all operational needs.
  - *Option B*: Add generic multi-column sortable table library (unnecessary bundle bloat).
- **Recommendation**: Adopt Option A.
- **Classification**: `KEEP AS-IS`
- **Owner Decision Required?**: NO

---

### Card 7: Permissions, Role Gates & Feedback
- **Current State**: Fine-grained permissions (`ops.view`, `ops.edit`, `admin.manage`) checked via `can(permission)`. `<AdminDenied>` screen for forbidden direct links. `<PermissionButton>` renders disabled state with explanatory tooltip when unauthorized.
- **Evidence**: Inspected role permission gating in `src/lib/admin-context.tsx`, `<AdminDenied>` in `src/components/admin/admin-denied.tsx`, and `<PermissionButton>` in `src/components/admin/admin-kit.tsx`.
- **Strengths**: Robust simulation of role-based access control; clear feedback explaining why an action is prohibited.
- **Defects vs Opportunities**: Purely client-side simulation.
- **Options**:
  - *Option A*: Retain the client permission system and connect to mock session state in Phase 4.
  - *Option B*: Remove permission gating entirely.
- **Recommendation**: Adopt Option A.
- **Classification**: `KEEP UX, REBUILD INFRASTRUCTURE`
- **Owner Decision Required?**: NO

---

### Card 8: Responsive Layout & Bilingual Ergonomics
- **Current State**: Responsive breakpoints supporting 320px to 1920px. RTL alignment in Arabic with strict LTR isolation for aviation identifiers.
- **Evidence**: Retained browser test record `interactive_a11y_directionality.ltr_isolation_arabic`; responsive inspections across 320px, 390px, and 1280px viewports in English and Arabic.
- **Strengths**: High mobile usability; zero horizontal overflow on 320px; complete Arabic translation across all visited views.
- **Defects vs Opportunities**: Minor text tightness on narrow mobile cards in Arabic.
- **Recommendation**: Maintain responsive and directionality patterns across all future phases.
- **Classification**: `FIX REGARDLESS`
- **Owner Decision Required?**: NO

---

## 7. Concise Inputs for Interaction System and Synthesis Runs

1. **For Run 4 (Interaction System Audit)**:
   - Examine how the `AdminSheet`, `AdminModal`, and `AccountMenu` components handle focus trapping, scroll locking, and Escape key dismissal across desktop and mobile.
   - Investigate form validation feedback across dense operational forms (Quick Edit, Counter Booking, Destination Editor).
2. **For Run 5 (Synthesis Audit)**:
   - Reconcile the fragmented data layers (Public Store vs Admin Overrides vs In-Memory Ops vs Static Mock Arrays) into a single, cohesive specification for the **Unified Mock Repository** in Phase 4.
   - Define exact cross-view reactivity requirements: e.g. when a flight gate changes in admin quick edit, how it immediately updates both `/flights` and `/manage/$ref`.
