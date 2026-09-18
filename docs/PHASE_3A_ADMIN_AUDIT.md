# Phase 3A Admin and Station Operations UX Audit

> **Run ID**: `20260918-phase-3a-admin`  
> **Workspace**: `C:\Users\bassa\Documents\GazaAirPort\gaza-gateway`  
> **Baseline Git Commit**: `4a7b9dea6b2502b748d00c011c0067f8c35be33c` on `main`  
> **Git Status at Handoff**: `M src/routeTree.gen.ts` (0 content diffs confirmed via `git diff -- src/routeTree.gen.ts`; Windows CRLF/stat artifact); untracked `.ai/`, `.claude/`, `.codex/`, `.playwright-mcp/`, `docs/PHASE_3A_PUBLIC_AUDIT.md`, `docs/PHASE_3A_HERITAGE_AUDIT.md`, and `images_assets_to_be_used_in_website_after_proper_placement_and_compression/` preserved.  
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
| **Access & Orientation** (`/admin/signin`, `/admin`, Shell) | Clean dual-column sign-in with quick-use staff cards. Shell features collapsible sidebar (w-60 to w-16), quick-search dialog (`Cmd+K`), and live role switcher in `AccountMenu`. Unauth guard renders "Sign in to continue" challenge (`w1_05`). | **Disconnected Session Simulation**: No backend authentication or JWT; session is client-only state (`gza.admin.v1`). Role switching in `AccountMenu` immediately grants all permissions on client without credential challenge. | Fully accessible skip link (`#admin-main`). Escape key correctly closes `AccountMenu` and returns focus to trigger button (`aria-label="Staff account"`). Search modal (`Cmd+K`) manages focus. | **KEEP UX, REBUILD INFRASTRUCTURE**: Retain the fast, elegant staff navigation UX; replace ad-hoc client state with unified session repository in Phase 4. |
| **Daily Operations** (`/admin/flights`, `$flightId`, `/schedules`) | Comprehensive flight board with date picker, direction filters, gate/terminal chips, load factors, and slide-over Quick Edit sheet. | **Public/Admin Store Boundary Disconnect**: Flight quick edits persist to `localStorage["gza.admin.v1"]` and update `/admin/flights` via `withOverride()`. However, the public flight board (`/flights`) does NOT invoke `withOverride()`. In empirical testing, flight `PS151` modified to `Boarding`/gate `A3`/`08:25` on `/admin/flights` (`w2_06`) visibly remains `Scheduled`/gate `A4`/`01:05` on `/flights` (`w2_07`). | Dense table cleanly switches to stacked operational cards on 390px mobile (`w2_03`). Aviation codes (`PS151`, `GZA → JED`, `14:30`) preserve strict LTR isolation via `.code-id` and `dir="ltr"` in Arabic RTL. | **CONSOLIDATE**: Unify flight data into single mock repository layer serving both public visitor boards and station dispatcher boards. |
| **Booking & Station Desk** (`/admin/bookings`, `$ref`, `/check-in`) | Filterable bookings table; booking cancellation modal; 5-step counter booking wizard; station check-in desk with flight selector pills and document inspection drawer. | **Static / Display-Only Isolation**: (1) Based on source inspection, public bookings (`localStorage["gza.store.v1"]`) and admin bookings (static `mockBookings`) operate in completely decoupled storage layers with no synchronization. (2) Counter booking wizard creates `GZA-NEW1` but appends nowhere. (3) Detail cancellation updates local component state only; navigating back reverts status to Confirmed. (4) Check-in desk buttons are toast-only; passenger status remains `Ready`. | Modals and slide-over sheets close on Escape. Mobile check-in desk renders clean vertical cards without horizontal overflow. Tables have semantic `<caption className="sr-only">`. | **KEEP UX, REBUILD INFRASTRUCTURE**: Keep the high-density operational desk interfaces; replace hardcoded mock arrays with reactive mutations in the unified repository. |
| **Content & Organization** (`/admin/destinations`, `/airport`, `/website`) | Multi-tab destination editor; historical milestone & fact editor with verification badges; homepage section toggles; staff directory with role manager; tamper-evident activity log. | **Ephemeral Session State & Toast-Only CMS**: (1) Destination changes update in-memory `opsState` via `patchOps()`, resetting on page refresh. (2) Archive milestones, archive item edits, website reordering, and staff invite/role changes trigger toasts without modifying underlying data. | Tablists use semantic `role="tablist"` and `role="tab"` with `aria-selected`. High contrast on limestone sand and olive green brand tokens. RTL mirroring operates correctly across all forms. | **CONSOLIDATE**: Connect content editing forms to persisted state and ensure historical claims display provenance verification labels matching public archive standards. |

---

## 2. Screenshot & Empirical Evidence Index

All 59 screenshots were captured using Chromium/Edge headless automation against the live running application (`http://localhost:8080`) across Desktop (1280×900), Mobile (390×844), and Small Mobile (320×568) in both English (`en`, LTR) and Arabic (`ar`, RTL).

Raw screenshot files and structured assertion records are stored at:
- Screenshots: `evidence/phase-3a/20260918-phase-3a-admin/screenshots/`
- Manifest: [`evidence/phase-3a/20260918-phase-3a-admin/screenshot-manifest.json`](evidence/phase-3a/20260918-phase-3a-admin/screenshot-manifest.json)
- Assertion Records: [`evidence/phase-3a/20260918-phase-3a-admin/browser-test-records.json`](evidence/phase-3a/20260918-phase-3a-admin/browser-test-records.json)

| Screenshot Filename | Workflow | Route | Locale | Viewport | Role / Fixture | Visible State | What It Proves |
|---|---|---|---|---|---|---|---|
| `w1_01_signin_en_1280.png` | Workflow 1 | `/admin/signin` | `en` | 1280×900 | Unauthenticated | Admin sign-in page with dark brand side banner and quick-use staff helper accounts | Dual-column sign-in presentation, clear mock helper accounts, and public return link. |
| `w1_02_signin_ar_1280.png` | Workflow 1 | `/ar/admin/signin` | `ar` | 1280×900 | Unauthenticated | Arabic admin sign-in layout with RTL alignment and LTR email inputs | Bilingual parity, RTL layout flow, and LTR preservation on email fields. |
| `w1_03_signin_en_390.png` | Workflow 1 | `/admin/signin` | `en` | 390×844 | Unauthenticated | Mobile 390px sign-in screen hiding desktop side-hero and showing single-column card | Clean responsive collapse without horizontal overflow on mobile viewports. |
| `w1_04_signin_en_320.png` | Workflow 1 | `/admin/signin` | `en` | 320×568 | Unauthenticated | Small mobile 320px sign-in screen showing compact inputs and helper cards | Layout resilience and readable touch targets on narrow 320px screens. |
| `w1_05_admin_unauth_guard_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Unauthenticated | Inline "Sign in to continue" gate rendered when opening `/admin` without active staff session | Graceful client-side auth barrier redirecting unauthenticated visitors to sign in. |
| `w1_06_signin_filled_1280.png` | Workflow 1 | `/admin/signin` | `en` | 1280×900 | Rana Habib (Admin) | Sign-in form auto-filled via Rana Habib admin helper button | Mock authentication shortcut populating staff email and passphrase. |
| `w1_07_dashboard_admin_en_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Rana Habib (Admin) | Main station dashboard overview with operational KPI metrics, quick actions, and alerts | Complete station dashboard rendering with full administrative permissions. |
| `w1_08_dashboard_admin_ar_1280.png` | Workflow 1 | `/ar/admin` | `ar` | 1280×900 | Rana Habib (Admin) | Arabic admin dashboard overview showing RTL grid, KPI cards, and Arabic typography | Full RTL dashboard parity, Arabic KPI labels, and isolated technical codes. |
| `w1_09_attention_popover_open_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Rana Habib (Admin) | Attention required popover open showing unassigned gates and dispatch alerts | Topbar notification popover surfacing urgent operational dispatch items. |
| `w1_10_search_modal_open_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Rana Habib (Admin) | Quick search modal (`Cmd+K`) open with grouped navigation links and shortcut keys | Working command-palette search dialog enabling keyboard navigation across all admin routes. |
| `w1_11_account_menu_open_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Rana Habib (Admin) | Account menu dropdown displaying current user, role badge, instant role switcher, and sign-out | Interactive role switcher allowing on-the-fly toggling between Admin, Editor, and Viewer. |
| `w1_12_dashboard_editor_role_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Tariq Zeidan (Editor) | Dashboard in Ops Editor role showing reduced navigation (restricted staff admin access) | Permission-aware UI hiding unauthorized navigation links for editor persona. |
| `w1_13_dashboard_viewer_role_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Laila Qandil (Viewer) | Dashboard in Commercial Viewer role showing read-only indicator badge | Read-only simulation role with disabled action buttons across station modules. |
| `w1_14_denied_staff_viewer_1280.png` | Workflow 1 | `/admin/staff` | `en` | 1280×900 | Laila Qandil (Viewer) | Access Denied gate when attempting direct URL access to `/admin/staff` under Viewer role | Working `<AdminDenied>` barrier blocking unauthorized deep links with role explanation. |
| `w1_15_sidebar_collapsed_1280.png` | Workflow 1 | `/admin` | `en` | 1280×900 | Rana Habib (Admin) | Collapsed icon-only sidebar mode expanding content canvas area | Working sidebar collapse toggle providing extra workspace for dense data tables. |
| `w1_16_mobile_drawer_open_390.png` | Workflow 1 | `/admin` | `en` | 390×844 | Rana Habib (Admin) | Mobile navigation slide-over drawer open on 390px viewport | Responsive mobile menu drawer providing touch navigation to all admin sections. |
| `w2_01_flights_board_en_1280.png` | Workflow 2 | `/admin/flights` | `en` | 1280×900 | Rana Habib (Admin) | Daily flight operations board with date picker, direction filters, status chips, and quick edits | Comprehensive flight operations table with status semantics, gates, aircraft, and check-in indicators. |
| `w2_02_flights_board_ar_1280.png` | Workflow 2 | `/ar/admin/flights` | `ar` | 1280×900 | Rana Habib (Admin) | Arabic flight operations board maintaining LTR isolation for flight numbers and times | Bilingual typography and correct LTR isolation for flight numbers (`PS151`) and times in RTL. |
| `w2_03_flights_board_mobile_390.png` | Workflow 2 | `/admin/flights` | `en` | 390×844 | Rana Habib (Admin) | Mobile card view of flight board on 390px viewport replacing table layout | Responsive adaptation switching from dense table to stacked operational cards on mobile. |
| `w2_04_quick_edit_sheet_open_1280.png` | Workflow 2 | `/admin/flights` | `en` | 1280×900 | Rana Habib (Admin) | Flight Quick Edit sheet open for flight PS151 allowing status, gate, terminal, and note overrides | Slide-over quick edit sheet for flight dispatchers. |
| `w2_05_quick_edit_sheet_filled_1280.png` | Workflow 2 | `/admin/flights` | `en` | 1280×900 | Rana Habib (Admin) | Flight Quick Edit form modified for PS151: status Boarding, gate A3, revised time 08:25, note | Parameter editing inside sheet before applying mutation. |
| `w2_06_flight_board_after_mutation_1280.png` | Workflow 2 | `/admin/flights` | `en` | 1280×900 | Rana Habib (Admin) | Flight board after saving override: row displays Boarding status, gate A3, revised time 08:25 for PS151 | Working mock mutation persisting overrides to `localStorage["gza.admin.v1"]`. |
| `w2_07_public_flights_board_boundary_1280.png` | Workflow 2 | `/flights` | `en` | 1280×900 | Public Visitor | Public flight departures board visibly showing flight PS151 on Friday 18 Sept with status Scheduled and Gate A4 — admin override to Boarding/A3 did not propagate | Proves public/admin data boundary: public flight board displays unoverridden Scheduled/A4 while admin board displays Boarding/A3. |
| `w2_08_flight_detail_overview_1280.png` | Workflow 2 | `/admin/flights/PS151-2026-09-18-out` | `en` | 1280×900 | Rana Habib (Admin) | Flight detail overview for PS151 showing passenger load breakdown, gate dispatch, and timeline | Deep operational flight detail view connecting dispatch, load factor, and crew metrics. |
| `w2_09_flight_detail_history_1280.png` | Workflow 2 | `/admin/flights/PS151-2026-09-18-out` | `en` | 1280×900 | Rana Habib (Admin) | Flight detail History tab for PS151 showing operational event audit trail | Event log tracking operational state changes and timestamps for the specific flight. |
| `w2_10_schedules_index_1280.png` | Workflow 2 | `/admin/schedules` | `en` | 1280×900 | Rana Habib (Admin) | Recurring seasonal schedule table with weekday frequency badges, aircraft, and active toggle | Operational schedule planner managing recurring weekly flight patterns. |
| `w2_11_schedule_edit_sheet_1280.png` | Workflow 2 | `/admin/schedules` | `en` | 1280×900 | Rana Habib (Admin) | Schedule item editor sheet allowing modification of departure time, days of week, and aircraft type | Schedule adjustment form for seasonal frequency planning. |
| `w2_12_products_fleet_fares_1280.png` | Workflow 2 | `/admin/products` | `en` | 1280×900 | Rana Habib (Admin) | Fleet and fare class configuration table showing aircraft types, seat configurations, and baggage rules | Commercial product settings managing cabin layouts (Economy, Business) and fare allowances. |
| `w3_01_bookings_list_en_1280.png` | Workflow 3 | `/admin/bookings` | `en` | 1280×900 | Rana Habib (Admin) | Station bookings directory with status filters (Confirmed, Pending, Cancelled), search, and metrics | Centralized booking ledger with PNR lookup, lead passenger, flight, and fare status. |
| `w3_02_bookings_list_ar_1280.png` | Workflow 3 | `/ar/admin/bookings` | `ar` | 1280×900 | Rana Habib (Admin) | Arabic bookings directory maintaining LTR isolation for PNR codes (`GZA4TQ`) and amounts | Bilingual booking table with RTL alignment and strict LTR preservation for PNR references. |
| `w3_03_booking_detail_overview_1280.png` | Workflow 3 | `/admin/bookings/GZA4TQ` | `en` | 1280×900 | Rana Habib (Admin) | Detailed booking record for `GZA4TQ` (Nadia Sabbagh) with passenger details, ticket, and payment | Comprehensive booking inspection screen linking itinerary, passenger documents, and payment. |
| `w3_04_booking_cancel_dialog_1280.png` | Workflow 3 | `/admin/bookings/GZA4TQ` | `en` | 1280×900 | Rana Habib (Admin) | Cancellation confirmation modal dialog with warning and action buttons | Confirmation dialog preventing accidental booking cancellation. |
| `w3_05_booking_detail_after_cancel_1280.png` | Workflow 3 | `/admin/bookings/GZA4TQ` | `en` | 1280×900 | Rana Habib (Admin) | Booking detail screen showing Cancelled status badge after confirming cancellation | Component-level status mutation to Cancelled within the booking detail view. |
| `w3_06_new_booking_step1_1280.png` | Workflow 3 | `/admin/bookings/new` | `en` | 1280×900 | Rana Habib (Admin) | Counter booking wizard Step 1: flight selection with origin, destination, date, and cabin class | Desk agent booking creation wizard initializing flight search parameters. |
| `w3_07_new_booking_step2_1280.png` | Workflow 3 | `/admin/bookings/new` | `en` | 1280×900 | Rana Habib (Admin) | Counter booking wizard Step 2: available flights list with select button for flight `PS100` | Real-time flight selection step in station counter booking workflow. |
| `w3_08_new_booking_step3_1280.png` | Workflow 3 | `/admin/bookings/new` | `en` | 1280×900 | Rana Habib (Admin) | Counter booking wizard Step 3: passenger details form filled for Nadia Sabbagh | Passenger contact and identification data entry form. |
| `w3_09_new_booking_step4_1280.png` | Workflow 3 | `/admin/bookings/new` | `en` | 1280×900 | Rana Habib (Admin) | Counter booking wizard Step 4: seat assignment (`14C`), baggage count, meal, assistance | Ancillary and seat selection form for counter booking. |
| `w3_10_new_booking_step5_1280.png` | Workflow 3 | `/admin/bookings/new` | `en` | 1280×900 | Rana Habib (Admin) | Counter booking wizard Step 5: summary review showing total price and mock disclaimer | Final booking review summary before confirmation. |
| `w3_11_new_booking_success_1280.png` | Workflow 3 | `/admin/bookings/new` | `en` | 1280×900 | Rana Habib (Admin) | Success screen showing synthetic booking reference `GZA-NEW1` with options to book another or view bookings | Completed counter booking flow and reference generation. |
| `w3_12_checkin_desk_en_1280.png` | Workflow 3 | `/admin/check-in` | `en` | 1280×900 | Rana Habib (Admin) | Station check-in desk showing flight selector pills and passenger manifest table for `PS100` | Gate and counter check-in desk interface with documentation validation and bag counts. |
| `w3_13_checkin_desk_mobile_390.png` | Workflow 3 | `/admin/check-in` | `en` | 390×844 | Rana Habib (Admin) | Mobile check-in desk card layout on 390px viewport | Responsive adaptation of passenger check-in cards on mobile screens. |
| `w3_14_checkin_desk_after_action_1280.png` | Workflow 3 | `/admin/check-in` | `en` | 1280×900 | Rana Habib (Admin) | Check-in desk after clicking "Check in": toast appears, but passenger status remains Ready | Toast-only action behavior: desk actions show toasts without mutating in-memory passenger status. |
| `w3_15_checkin_extras_sheet_1280.png` | Workflow 3 | `/admin/check-in` | `en` | 1280×900 | Rana Habib (Admin) | Passenger extras inspection sheet displaying baggage allowance, seat, and documentation status | Slide-over drawer for gate agent verification of travel documents. |
| `w3_16_customers_list_1280.png` | Workflow 3 | `/admin/customers` | `en` | 1280×900 | Rana Habib (Admin) | Customer accounts directory showing member names, contact details, booking counts, and status | Traveler profile directory supporting customer lookup and history. |
| `w3_17_customer_detail_1280.png` | Workflow 3 | `/admin/customers/c-1001` | `en` | 1280×900 | Rana Habib (Admin) | Customer profile detail for Nadia Sabbagh: trips list, saved travelers, and preferences | Passenger CRM screen linking past bookings, saved family travelers, and preferences. |
| `w4_01_destinations_index_1280.png` | Workflow 4 | `/admin/destinations` | `en` | 1280×900 | Rana Habib (Admin) | Destinations content management table with editorial readiness pills, weekly frequencies, and prices | Route network editorial overview with bilingual completion badges. |
| `w4_02_destination_editor_amm_1280.png` | Workflow 4 | `/admin/destinations/AMM` | `en` | 1280×900 | Rana Habib (Admin) | Destination content editor for Amman (`AMM`) showing Basics tab, bilingual switcher, and price settings | Working multi-tab destination content editor. |
| `w4_03_destination_editor_public_tab_1280.png` | Workflow 4 | `/admin/destinations/AMM` | `en` | 1280×900 | Rana Habib (Admin) | Destination Public Page tab with description textarea and good-to-know bullet editor | Editorial copy and highlight editing for destination visitor pages. |
| `w4_04_airport_editor_past_1280.png` | Workflow 4 | `/admin/airport` | `en` | 1280×900 | Rana Habib (Admin) | Airport archive editor Past tab showing timeline milestones and verification badges | Historical milestone curation with editorial provenance labels. |
| `w4_05_airport_editor_present_1280.png` | Workflow 4 | `/admin/airport` | `en` | 1280×900 | Rana Habib (Admin) | Airport Present tab facts table with verification status badges for location, IATA, runway, status | Structured fact curation distinguishing verified metadata from pending research. |
| `w4_06_airport_editor_archive_items_1280.png` | Workflow 4 | `/admin/airport` | `en` | 1280×900 | Rana Habib (Admin) | Archive items grid showing cards with category pills, era tags, source links, and draft/published status | Digital archive item management with source provenance links. |
| `w4_07_airport_archive_item_sheet_1280.png` | Workflow 4 | `/admin/airport` | `en` | 1280×900 | Rana Habib (Admin) | Archive item editor sheet with title, category, era, date, rights, caption, and credit fields | Metadata editor for historical documents and photographs. |
| `w4_08_website_editor_homepage_1280.png` | Workflow 4 | `/admin/website` | `en` | 1280×900 | Rana Habib (Admin) | Website content management screen showing homepage section visibility toggles and reordering arrows | CMS layout controls for public site sections with EN/AR preview links. |
| `w4_09_inbox_master_detail_1280.png` | Workflow 4 | `/admin/inbox` | `en` | 1280×900 | Rana Habib (Admin) | Staff inbox master-detail view showing enquiries, topics, related PNR link, and reply composer | Passenger enquiry inbox connecting messages to booking records. |
| `w4_10_staff_administration_1280.png` | Workflow 4 | `/admin/staff` | `en` | 1280×900 | Rana Habib (Admin) | Staff administration table with members, role badges, active/disabled status, and action buttons | User management table with Invite Staff and Change Role modal actions. |
| `w4_11_staff_invite_modal_1280.png` | Workflow 4 | `/admin/staff` | `en` | 1280×900 | Rana Habib (Admin) | Invite staff sheet with name, email, and role selector radio buttons | Staff invitation onboarding form. |
| `w4_12_settings_airport_tab_1280.png` | Workflow 4 | `/admin/settings` | `en` | 1280×900 | Rana Habib (Admin) | Settings screen Airport tab showing airport name, IATA code (`GZA`), airline (`PS`), timezone, and gates | Station configuration parameters and terminal/gate definitions. |
| `w4_13_analytics_dashboard_1280.png` | Workflow 4 | `/admin/analytics` | `en` | 1280×900 | Rana Habib (Admin) | Analytics dashboard showing traffic metrics, 9-stage booking conversion funnel, and route popularity | Commercial and conversion funnel monitoring for station services. |
| `w4_14_activity_log_1280.png` | Workflow 4 | `/admin/activity` | `en` | 1280×900 | Rana Habib (Admin) | Operational activity audit trail showing chronological actions, actors, before/after values, and module tags | Tamper-evident operational log for staff accountability. |

---

## 3. Detailed Walkthrough of Actual Staff Workflows

### Workflow 1: Access and Orientation

The admin shell (`AdminShell`) establishes a dedicated operational workspace distinct from the public portal, utilizing a darker, focused palette with limestone and olive-green accents:

1. **Sign-In Flow & Persona Seeding**:
   - Navigating to `/admin` without an authenticated session mounts `<AdminAuthGuard>` (`w1_05`), which prevents access and renders a clear challenge screen displaying the heading **"Sign in to continue"** (`t("adm.signin.required")`) with a "Sign in" button pointing to `/admin/signin` and a "Back to the website" link pointing to `/`.
   - *Test Record Clarification*: The automated assertion record in `browser-test-records.json` initially looked for the substring "Sign in required", which returned `false` due to selector text mismatch; the visual rendering in `w1_05_admin_unauth_guard_1280.png` and source inspection of `src/routes/{-$locale}.admin.tsx` confirm the guard functions correctly with the heading "Sign in to continue".
   - `/admin/signin` (`w1_01`) displays a split layout with a branded side banner ("Station control & operations") and three convenient one-click persona cards:
     - **Rana Habib (Station Admin)**: Full administrative access (`admin.manage`, `ops.edit`, `commercial.edit`).
     - **Tariq Zeidan (Ops Editor)**: Operational and content editing permissions (`ops.edit`, `content.edit`).
     - **Laila Qandil (Commercial Viewer)**: Read-only access (`ops.view`, `commercial.view`).
   - Clicking "Use" fills the form (`w1_06`), and submitting signs in immediately by setting `staffSession` in `localStorage["gza.admin.v1"]`.
   - On 390px and 320px mobile viewports (`w1_03`, `w1_04`), the side banner is cleanly hidden via `hidden lg:flex`, keeping all helper cards accessible without horizontal scroll.

2. **Shell Navigation & Responsive Adaptability**:
   - **Sidebar**: The desktop sidebar provides 13 organized navigation links categorized under Operations, Station Desk, Content & CMS, and Administration. A collapse toggle button (`w1_15`) shrinks the sidebar from `w-60` to `w-16` (icon-only mode with tooltips), expanding horizontal table space.
   - **Mobile Drawer**: At viewports below 1024px (`lg`), the sidebar disappears and a hamburger menu button in the header opens a slide-over `AdminDrawer` (`w1_16`).
   - **Command Palette (`Cmd+K`)**: Pressing `Cmd+K` or clicking the header search input opens a keyboard-navigable command dialog (`w1_10`), providing search suggestions and quick filtering across flights, bookings, customers, destinations, and content.
   - **Attention Popover**: A bell icon button opens the operational dispatch popover (`w1_09`), listing urgent items such as unassigned gates or flights awaiting closeout.

3. **Role Switching & Permission Enforcement**:
   - In `AccountMenu` (`w1_11`), staff can toggle their simulated role between Admin, Editor, and Viewer with a single click.
   - Switching to Editor (`w1_12`) instantly hides Administration links (`/admin/staff`, `/admin/settings`) from the sidebar navigation.
   - Direct navigation to `/admin/staff` under the Viewer role cleanly renders `<AdminDenied>` (`w1_14`), showing a red security shield icon, the user's current role badge (`Viewer`), the missing required permission (`admin.manage`), and a button to return to the dashboard.
   - *Screen Inventory Note*: The standalone route file `src/routes/{-$locale}.admin.access-denied.tsx` exists in the route tree, but the access-denied behavior was evaluated in-browser at `/admin/staff` via `<AdminDenied>` (`w1_14`). `/admin/access-denied` was not separately navigated to as a standalone page.
   - **Simulation Boundary Note**: This is a client-side simulation. No JWT tokens or server authentication headers are verified; any client script can modify `gza.admin.v1` to alter roles.

---

### Workflow 2: Daily Operations

1. **Daily Flight Operations Board (`/admin/flights`)**:
   - The flight operations table (`w2_01`) displays daily flight dispatches with filtering by date, direction (All, Departures, Arrivals), and status (Scheduled, Boarding, Departed, Delayed, Cancelled).
   - Each flight row presents rich operational data: Scheduled and revised times, flight number (`PS151`), route (`GZA → JED`), aircraft type (`Boeing 737-800`), terminal/gate (`1 · A4`), sold load factor (`154/168`), check-in count (`0 of 0`), and operational status badge.
   - On 390px mobile (`w2_03`), the table transforms into stacked operational cards, preventing text truncation or awkward horizontal scrolling.
   - In Arabic RTL (`w2_02`), technical codes maintain strict LTR isolation via `.code-id` and `dir="ltr"`.

2. **Flight Quick Edit Mutation**:
   - Clicking "Quick edit" on flight `PS151` opens a slide-over `AdminSheet` (`w2_04`, `w2_05`).
   - Testing an operational mutation:
     - **Before**: Status = `Scheduled`, Gate = `A4`, Time = `01:05`. `storageOverrides` = `{}`.
     - **Action**: Modified status to `Boarding`, gate to `A3`, revised departure to `08:25`, and entered dispatcher note: *"Gate change announced for departure"*.
     - **After in Admin Board**: Flight board updates immediately (`w2_06`) showing revised time `08:25`, gate `A3`, and green `Boarding` chip.
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
     - *Empirical Browser Observation*: Navigating to the public departures board at `/flights` (`w2_07`) provides immediate visual proof of the store boundary. In `w2_07_public_flights_board_boundary_1280.png`, flight `PS151` on Friday 18 Sept visibly displays its unoverridden defaults: status **Scheduled**, gate **A4**, and scheduled departure **01:05**. Meanwhile, on `/admin/flights` (`w2_06`), the same flight displays status **Boarding**, gate **A3**, and revised departure **08:25**.
     - *Source Code Explanation*: Source inspection reveals that `src/routes/{-$locale}.admin.flights.index.tsx` invokes `withOverride()` from `useAdmin()`, overlaying overrides from `localStorage["gza.admin.v1"]`. In contrast, `src/routes/{-$locale}.flights.tsx` renders static flight data directly from `src/lib/data.ts` without calling `withOverride()`. Admin dispatcher overrides are therefore structurally blocked from reaching public visitors.

3. **Flight Detail & Operational Audit Trail (`/admin/flights/$flightId`)**:
   - Clicking a flight row opens its deep operational inspection view (`w2_08`).
   - The Overview tab visualizes load factors, gate/stand allocations, baggage reconciliation progress, and crew assignments.
   - The History tab (`w2_09`) provides a chronological event log tracking state changes.

4. **Schedules & Fleet Configuration**:
   - `/admin/schedules` (`w2_10`) manages recurring weekly flight timetables with day-of-week frequency chips (e.g. `M T W T F S S`). Clicking an entry opens a schedule editor sheet (`w2_11`).
   - `/admin/products` (`w2_12`) displays fleet aircraft specifications (Boeing 737-800, De Havilland Dash 8-300), seat counts, pitch, cabin classes, and baggage tier pricing.

---

### Workflow 3: Booking & Station Desk

1. **Bookings Ledger & Filters (`/admin/bookings`)**:
   - Central booking registry (`w3_01`) with search by PNR or passenger name, and filtering by status (`Confirmed`, `Pending`, `Cancelled`).
   - Table columns include Booking reference (`GZA4TQ`), Primary passenger (`Nadia Sabbagh`), Flight number (`PS100`), Route (`GZA → AMM`), Date, Total fare (`$180`), and Status badge.
   - In Arabic RTL (`w3_02`), PNR references and monetary figures retain strict LTR isolation.

2. **Booking Cancellation Mutation Test (`/admin/bookings/$ref`)**:
   - Viewing booking `GZA4TQ` (`w3_03`) displays passenger details, contact information, itinerary legs, and payment summary.
   - Clicking "Cancel booking" triggers a confirmation dialog (`w3_04`).
   - Confirming cancellation immediately updates the detail screen badge to `Cancelled` (`w3_05`).
   - **State Defect**: Navigating back to `/admin/bookings` revealed the row still showed `Confirmed`. Source inspection of `src/routes/{-$locale}.admin.bookings.$ref.tsx` showed the cancellation updates local React component state only, without mutating the static `mockBookings` array in `admin-mock.ts`.

3. **Counter Booking Creation Wizard (`/admin/bookings/new`)**:
   - A 5-step wizard designed for station ticket counter agents:
     - **Step 1 (Flight Search)** (`w3_06`): Origin, destination (`AMM`), departure date, and cabin class (`Economy`).
     - **Step 2 (Select Flight)** (`w3_07`): Selects flight `PS100` ($180).
     - **Step 3 (Passenger Details)** (`w3_08`): Fills passenger details for Nadia Sabbagh (Email: `nadia@example.com`, Phone: `+970 59 000 0000`, Document: `P12345678`).
     - **Step 4 (Seat & Extras)** (`w3_09`): Assigns seat `14C`, 1 checked bag (23kg), standard meal, no special assistance.
     - **Step 5 (Review & Summary)** (`w3_10`): Displays pricing breakdown ($180 flight + $30 baggage = $210 total) and prototype disclaimer.
     - **Success Screen** (`w3_11`): Clicking "Create booking" displays synthetic confirmation reference `GZA-NEW1`.
   - **Simulation Defect**: Navigating to `/admin/bookings` proved `GZA-NEW1` was **NOT appended** to the bookings list. The wizard is purely display-only.

4. **Public vs Admin Booking Store Boundary (Architectural Inference)**:
   - *Status of Run Fixture*: No public booking was generated at `/book` during this audit run (`publicBookingsInStorage: 0`).
   - *Architectural Finding*: Based on source inspection of `src/lib/store.tsx` (where public bookings from `/book` write to `localStorage["gza.store.v1"]` via `useStore().createBooking()`) and `src/routes/{-$locale}.admin.bookings.index.tsx` (which reads from the hardcoded array `mockBookings` in `src/lib/admin-mock.ts`), the two systems operate in completely isolated data spaces. The admin booking ledger neither reads from nor synchronizes with the public local storage store.

5. **Station Check-In Desk (`/admin/check-in`)**:
   - Designed for gate agents and counter staff (`w3_12`). Flight selector pills switch passenger manifests between active departures (`PS100`, `PS200`, `PS150`).
   - The passenger manifest lists Passenger name, PNR, Document status (`Verified` / `Pending`), Assigned seat (`12A`), Checked bags (`2`), Special assistance (`None`), and Check-in status (`Ready`).
   - On 390px mobile (`w3_13`), passengers render as cleanly formatted touch-friendly cards.
   - **Toast-Only Action Defect**: Clicking "Check in" on passenger Nadia Sabbagh triggers a green toast notification ("Passenger checked in"), but the passenger status badge remains `Ready` (`w3_14`). The click handler executes `toast()` without mutating the `deskPassengers` array.
   - Clicking "View extras" opens an inspection sheet (`w3_15`) detailing baggage weight, passport verification, and seat allocation.

6. **Customer Directory & Profile CRM (`/admin/customers`)**:
   - `/admin/customers` (`w3_16`) lists frequent travelers, contact details, total trip counts, and status.
   - Deep inspection of customer `c-1001` (`w3_17`) displays Nadia Sabbagh's complete CRM record: historical flights, saved family travelers (Karim Sabbagh, Huda Sabbagh), and travel preferences (Window seat, Halal meal).

---

### Workflow 4: Content & Organization

1. **Destinations Network CMS (`/admin/destinations`, `$code`)**:
   - Overview table (`w4_01`) lists regional routes with weekly frequencies, base fares, editorial status (`Published` / `Draft`), and bilingual completeness badges.
   - Editing Amman (`AMM`) (`w4_02`) provides a tabbed editor (Basics, Public Page, Route, SEO) and language switcher (`EN` / `AR`).
   - The Public Page tab (`w4_03`) provides editorial textareas for city descriptions and highlighted "Good to know" points.
   - **In-Memory Ops State Defect**: Saving updates `opsState` in `admin-ops.ts`, updating the view during the session. However, because `opsState` is not persisted to `localStorage`, refreshing the browser discards edits.

2. **Airport Heritage & Archive CMS (`/admin/airport`)**:
   - The Past tab (`w4_04`) manages historical milestones with bilingual titles and verification status badges (`Verified`, `Pending research`).
   - The Present tab (`w4_05`) curates airport facts (coordinates, IATA code `GZA`, runway length 3,080m, status) with verification badges.
   - The Archive tab (`w4_06`) displays a visual grid of digitized photographs and historical documents.
   - Clicking "Edit" on an archive item opens a metadata sheet (`w4_07`) with category, era, date, rights, caption, and credit fields.
   - **Action Defect**: Editing archive metadata triggers `toast("Saved")` without updating `archiveItems`.

3. **Website Notices & Layout (`/admin/website`)**:
   - `/admin/website` (`w4_08`) provides CMS controls for public site sections: toggling visibility (Hero, Flight Search, Destinations, Heritage, Travel Information) and reordering section sequences via up/down controls.

4. **Staff Inbox (`/admin/inbox`)**:
   - A master-detail inbox (`w4_09`) for customer enquiries and ground support messages. Selecting a thread displays the message history, links directly to the related booking reference (`GZA4TQ`), and provides a reply composer.

5. **Staff Administration (`/admin/staff`)**:
   - User directory (`w4_10`) displaying active staff members, roles, email addresses, and last active timestamps.
   - Clicking "Invite staff" opens a slide-over sheet (`w4_11`) with role selection radio buttons (Admin, Ops Editor, Commercial Viewer).
   - Action buttons ("Change role", "Disable", "Invite staff") trigger toast notifications without mutating `staffRows`.

6. **Settings, Analytics & Activity Audit**:
   - **Settings (`/admin/settings`)** (`w4_12`): Station configuration covering airport names, codes, timezones, and active gates (A1–A6, B1–B4).
   - **Analytics (`/admin/analytics`)** (`w4_13`): Conversion metrics tracking a 9-stage booking funnel (Search $\rightarrow$ Select $\rightarrow$ Passenger $\rightarrow$ Seats $\rightarrow$ Extras $\rightarrow$ Review $\rightarrow$ Payment $\rightarrow$ Confirmation $\rightarrow$ Manage), route popularity, and load trends.
   - **Activity Log (`/admin/activity`)** (`w4_14`): Tamper-evident operational audit trail documenting actions, timestamps, actors, modules, and before/after values.

---

### Cross-Cutting Interactive, Accessibility & Directionality Tests

The automated audit asserted keyboard navigation, focus management, and directionality across the admin shell:

1. **Skip Link**:
   - Pressing `Tab` upon navigating to `/admin` immediately focuses `<a href="#admin-main">Skip to admin content</a>` (`w1_07`). Verified in `browser-test-records.json`.
2. **Modal & Menu Keyboard Dismissal & Focus Return**:
   - Opening `AccountMenu` (`w1_11`) mounts a dropdown dialog. Pressing `Escape` cleanly dismisses the menu, and focus is automatically restored to the triggering button (`aria-label="Staff account"`). Verified in `browser-test-records.json`.
   - Opening slide-over sheets (`AdminSheet`) traps focus within the panel and dismisses immediately upon pressing `Escape` or clicking the backdrop.
3. **Arabic RTL Directionality & LTR Technical Isolation**:
   - Audited 180 inline technical spans and code elements across `/ar/admin/flights` (`w2_02`), `/ar/admin/bookings` (`w3_02`), and `/ar/admin` (`w1_08`).
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
   - *Evidence*: Clicking "Check in" on Nadia Sabbagh shows a toast, but status remains `Ready` (`w3_14`).
   - *Cause*: `onClick={() => { toast(t("a2.ci.checkedInToast")); }}` does not update `deskPassengers`.

4. **Destination CMS Changes Discarded on Refresh**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/lib/admin-ops.ts`](../src/lib/admin-ops.ts#L45) / [`{-$locale}.admin.destinations.$code.tsx`](../src/routes/{-$locale}.admin.destinations.$code.tsx#L82).
   - *Evidence*: `patchOps("destinations", ...)` updates in-memory `opsState`, but `opsState` is not persisted to `localStorage`. Refreshing resets all edits to seed defaults.

5. **Public Flight Board Ignores Admin Overrides**:
   - *Classification*: Confirmed Defect.
   - *Location*: [`src/routes/{-$locale}.flights.tsx`](../src/routes/{-$locale}.flights.tsx#L30).
   - *Evidence*: In empirical browser testing, `w2_07_public_flights_board_boundary_1280.png` visibly shows flight `PS151` on Friday 18 Sept with status **Scheduled** and gate **A4** (scheduled time `01:05`), while `/admin/flights` in `w2_06` shows `PS151` with status **Boarding**, gate **A3**, and revised departure `08:25`. Admin dispatcher overrides did not propagate to the public flight board.
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
   - *Finding*: High-density data tables (`/admin/flights`, `/admin/bookings`, `/admin/check-in`, `/admin/staff`) gracefully hide table headers on mobile viewports (<768px) and switch to stacked card layouts (`w2_03`, `w3_13`).
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

In `/admin/airport` (`w4_04`, `w4_05`), the admin editor provides structured metadata management for historical milestones and airport facts. Each milestone is labeled with a verification state:
- `Verified`: Historically established facts (e.g. 1998 opening, 3,080m runway, IATA code `GZA`).
- `Pending research`: Historical claims awaiting formal archival documentation.

This editorial pattern reinforces the historical integrity requirements of `PRODUCT.md` and provides the necessary foundation for the public airport archive surfaces.

---

## 6. Eight Bounded Decision Cards

### Card 1: Admin Navigation & Role Orientation
- **Current State**: Collapsible sidebar, mobile drawer, `Cmd+K` search modal, and topbar account switcher providing instant persona switching (`admin`, `editor`, `viewer`).
- **Evidence**: `w1_07`, `w1_10`, `w1_11`, `w1_12`, `w1_13`, `w1_15`, `w1_16`.
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
- **Evidence**: `w2_04`, `w2_05`, `w2_06`, `w2_07`, `w2_10`, `w2_11`.
- **Strengths**: Working local mutation; intuitive slide-over quick edit sheet; clear status chips and gate assignment controls.
- **Defects vs Opportunities**: In empirical testing, `w2_07` visibly shows flight `PS151` remains `Scheduled`/gate `A4` on public `/flights`, while `w2_06` shows `PS151` as `Boarding`/gate `A3` on `/admin/flights`. Admin overrides do not propagate to public visitors.
- **Options**:
  - *Option A*: Consolidate flight data so both public boards and admin boards share the same mock repository and override layer.
  - *Option B*: Keep separate stores and accept that public and admin views will disagree.
- **Recommendation**: Adopt Option A.
- **Classification**: `CONSOLIDATE`
- **Owner Decision Required?**: NO

---

### Card 3: Booking & Desk Operations
- **Current State**: Booking ledger with filters; detail view with cancellation confirmation; 5-step counter booking wizard.
- **Evidence**: `w3_01`, `w3_03`, `w3_04`, `w3_05`, `w3_10`, `w3_11`.
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
- **Evidence**: `w3_12`, `w3_13`, `w3_14`, `w3_15`.
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
- **Evidence**: `w4_01`, `w4_02`, `w4_04`, `w4_05`, `w4_06`.
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
- **Evidence**: `w2_01`, `w3_01`, `w3_12`, `w4_10`, `w4_14`.
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
- **Evidence**: `w1_12`, `w1_13`, `w1_14`.
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
- **Evidence**: `w1_03`, `w1_04`, `w1_08`, `w2_02`, `w2_03`, `w3_02`, `w3_13`.
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
