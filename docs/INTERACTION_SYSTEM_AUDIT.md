# Gaza International Airport / Palestinian Airlines
# Phase 3A Interaction System, Component Architecture & Design Token Audit (Correction 2)

**Run ID**: `20260918-phase-3a-interaction-system`  
**Workstream**: Phase 3A Workstream 4 of 5 (Interaction System Audit)  
**Baseline Commit**: `4a7b9dea6b2502b748d00c011c0067f8c35be33c` on branch `main`  
**Governing Authorities**: [`PRODUCT.md`](../PRODUCT.md), [`AGENTS.md`](../AGENTS.md), and Phase 3A Interaction System Handoffs (Run `20260918-phase-3a-interaction-system`, Corrections 1 & 2)  
**Input Audits**: [`PHASE_3A_PUBLIC_AUDIT.md`](PHASE_3A_PUBLIC_AUDIT.md) (Accepted), [`PHASE_3A_HERITAGE_AUDIT.md`](PHASE_3A_HERITAGE_AUDIT.md) (Accepted), [`PHASE_3A_ADMIN_AUDIT.md`](PHASE_3A_ADMIN_AUDIT.md) (Accepted)  
**Deliverable Scope**: Whole-product component inventory, empirical browser behavior matrix, architectural diagnosis, prioritized confirmed defects, and candidate interaction decisions for Phase 3A synthesis.  
**Execution Boundary**: Audit-only. Zero application code changes under `src/`, zero dependency installations, zero backend creation, zero git commits/pushes. Working tree remains uncommitted and unpushed.

---

## 1. Executive Summary & Architectural Diagnosis

This audit assesses the reusable interactive primitives, overlay mechanics, form controls, data presentation patterns, and design tokens powering Gaza International Airport (GZA) and Palestinian Airlines (PS). Across the three preceding domain-specific audits (Public, Heritage, Admin), several isolated UX flaws were surfaced—such as the passenger popover escape gap, mobile drawer focus leaks, gallery lightbox focus drops, seat map linear tab burdens, and booking wizard history loss. 

This run synthesizes those observations into root-cause architectural findings through empirical browser testing and automated repository analysis:

### 1.1 The "Shadow Design System" & App-Entry Reachability
A critical architectural discovery of this audit is that **the project contains a completely disconnected starter component directory alongside its active custom design system**:
1. **The Disconnected Starter Primitives (`src/components/ui/`)**:
   - Contains **46 component files** originally copied from shadcn/Radix templates.
   - **Direct Static Import Analysis**: 37 of these 46 files have zero direct callers anywhere in the repository. The remaining 9 files (`button.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `toggle.tsx`, `tooltip.tsx`) are imported **exclusively by other files within `src/components/ui/`** (e.g. `sheet.tsx` is imported only by `sidebar.tsx`; `button.tsx` is imported only by `alert-dialog.tsx`, `carousel.tsx`, `calendar.tsx`, `sidebar.tsx`, and `pagination.tsx`).
   - **Application-Entry Reachability Graph**: A complete breadth-first traversal from application entry points (all 46 route files in `src/routes/` plus root application shells `site-header.tsx`, `site-footer.tsx`, and `admin-shell.tsx`) reveals that **ZERO (0) out of 46 components in `src/components/ui/` are reachable by the application**.
   - Not a single user-facing route or public/admin feature imports from `@/components/ui/`.
2. **The Incumbent Working Primitives (`src/components/kit.tsx` & `src/components/admin/admin-kit.tsx`)**:
   - All active user-facing routes and views are built on lightweight custom primitives in `src/components/kit.tsx` (`btnClass` with 63 callers, `Panel` with 48, `PageHeader` with 38, `Input` with 36, `Field` with 32, `Container` with 32, `Select` with 27, `Code` with 23, `Notice` with 22, `Button` with 18, `EmptyState` with 18) and `src/components/admin/admin-kit.tsx` (`AdminChip` with 23, `Ltr` with 23, `AdminPanel` with 22, `AdminPageHeader` with 20, `PermissionButton` with 16, `AdminEmpty` with 13, `AdminSheet` with 11, `Toolbar` with 9, `AttentionRow` with 3).

### 1.2 Hand-Rolled Overlay Proliferation & Behavioral Divergence
Because neither `kit.tsx` nor `admin-kit.tsx` standardized on a shared headless overlay foundation (despite `@radix-ui/react-dialog` being present in `package.json`), interactive overlays were built ad-hoc in 7 different places, resulting in glaring behavioral divergence across the product:
- **Public Mobile Drawer (`SiteHeader`)**: Implemented as a plain conditional `div[role="dialog"]`. Lacks Escape dismissal, lacks focus trapping (Tab leaks to page background), lacks accessible name (`aria-labelledby`), and drops focus to `document.body` when closed via the X button.
- **Admin Mobile Drawer (`AdminShell`)**: Implemented with custom React state and DOM `useEffect` hooks in `src/components/admin/admin-shell.tsx` (not a pre-existing Radix Sheet primitive). Successfully traps focus via manual tab-cycling logic, locks body scroll (`document.body.style.overflow = "hidden"`), closes on Escape, and returns focus to the menu trigger button.
- **Gallery Lightbox (`GalleryPage`)**: Hand-rolled modal in `src/routes/{-$locale}.gallery.tsx`. Does not lock body scroll, does not move initial focus into the viewer, and fails to trap focus (Tabbing leaks past image actions directly into background gallery cards). Focus return is conditional: when closed via Escape without focusing inside the dialog, focus remains on the active background thumbnail (`activeElementIsBody: false` in this run's test); when closed after focusing an inner control, focus unconditionally drops to `document.body` as the unmounting DOM element is destroyed (established in the accepted heritage audit).
- **Cancellation Dialog (`ConfirmDialog`)**: Alertdialog with custom focus trap and Escape handler. Successfully focuses the non-destructive dismiss button ("Keep booking") and traps focus, but **fails to lock background body scroll**.
- **Admin Side Sheet (`AdminSheet`)**: Custom slide-over sheet in `admin-kit.tsx`. Successfully locks body scroll, traps focus, listens to Escape, and returns focus to trigger.
- **Admin Search Palette (`AdminSearch`)**: Custom combobox dialog in `admin-search.tsx`. Successfully manages ⌘K/Ctrl+K, arrows up/down through results, traps focus, and closes on Escape. Typing "PS" dynamically filters flight operations and destinations, rendering 8 matching results in a listbox.
- **Passenger Selector Popover (`FlightSearchForm`)**: Custom unanchored absolute `div` in `src/components/flight-search-form.tsx`. Features counter steppers for Adults, Children, and Infants. Empirically verified: ignores the Escape key (`isOpen` remains true), ignores outside canvas clicks (`isOpen` remains true), and lacks `role="dialog"` or disclosure popover attributes.

---

## 2. Comprehensive Component & Consumer Inventory

The following inventory maps every interactive primitive in the codebase to its actual consumers, underlying DOM semantics, and architecture status:

| Component / Path | Discovered Consumers | DOM Semantics | Tested Behavior | Status / Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **`btnClass` / `Button`**<br>`src/components/kit.tsx` | 63 callers across public, booking, admin, account, heritage routes | `<button>` with Tailwind classes & `focus-visible:outline-2` | Solid keyboard activation, visible ring on light/dark; does not support `asChild` slot delegation | **RETAIN & CONSOLIDATE** with `src/components/ui/button.tsx` |
| **`Field`, `Input`, `Select`, `Textarea`**<br>`src/components/kit.tsx` | 36 callers (`Input`), 32 (`Field`), 27 (`Select`), 8 (`Textarea`) | `<label>`, `<input>`, native `<select>`, `<textarea>`, `<p role="alert">` | Simple, reliable native inputs. Native date picker lacks LTR isolation in some public RTL forms | **RETAIN** core fields; normalize RTL date input isolation |
| **`Panel`, `Container`, `Code`**<br>`src/components/kit.tsx` | 48 callers (`Panel`), 32 (`Container`), 23 (`Code`) | Surface containers and `<span class="code-id">` | Rock solid. Strict LTR isolation for aviation identifiers (`direction: ltr; unicode-bidi: isolate;`) | **RETAIN AS-IS** |
| **`Pill`, `Eyebrow`, `PageHeader`, `Notice`, `EmptyState`**<br>`src/components/kit.tsx` | 38 callers (`PageHeader`), 22 (`Notice`), 18 (`EmptyState`), 9 (`Pill`), 7 (`Eyebrow`) | Presentational editorial wrappers and badges | High fidelity, respects `--sand`, `--clay`, `--ink` tokens | **RETAIN AS-IS** |
| **`AdminPageHeader`, `AdminPanel`, `Toolbar`**<br>`src/components/admin/admin-kit.tsx` | 22 callers (`AdminPanel`), 20 (`AdminPageHeader`), 9 (`Toolbar`) | `<header>`, `<section>`, `<div role="search">` | Dense operations layout; strong contrast and structure | **RETAIN AS-IS** |
| **`AdminChip`, `Ltr`, `BilingualStatus`**<br>`src/components/admin/admin-kit.tsx` | 23 callers (`AdminChip`), 23 (`Ltr`), 6 (`BilingualStatus`) | Status badge with tone variants; `<span dir="ltr" class="code-id">` | Identical purpose to `Pill` and `Code` in `kit.tsx`. Unnecessary duplication | **CONSOLIDATE** with `kit.tsx` (`Ltr` ↔ `Code`, `AdminChip` ↔ `Pill`) |
| **`PermissionButton`**<br>`src/components/admin/admin-kit.tsx` | 16 callers across admin ops, schedules, check-in, bookings | `<button disabled aria-disabled title="...">` with `<Lock>` | Excellent permission explanation pattern; stays visible to explain why a role cannot edit | **RETAIN AS-IS** |
| **Admin Flights Direction Filter**<br>`src/routes/{-$locale}.admin.flights.index.tsx` | 1 caller (admin flight operations board) | `<div role="group" aria-label="Direction">` with 3 `<button aria-pressed="...">` | Segmented toggle buttons (`All`, `Departures`, `Arrivals`); does not implement ARIA tablist pattern | **RETAIN AS-IS** (Correct semantic group) |
| **`AdminSheet`**<br>`src/components/admin/admin-kit.tsx` | 11 callers across flight quick-edit, schedule editor, check-in extras | `<div role="dialog" aria-modal="true">` with slide-over panel | Custom trap, Escape dismissal, body scroll lock, focus return. Well implemented | **CONSOLIDATE** into unified headless Sheet primitive |
| **`AdminToasts`**<br>`src/components/admin/admin-kit.tsx` | 1 caller (`AdminShell`), driven by `useAdmin().toast()` | `<div aria-live="polite">` fixed notification list | Effective admin feedback; completely isolated from public app. `sonner` is installed but unused | **CONSOLIDATE / EXPAND** to full product |
| **`SiteHeader` Mobile Drawer**<br>`src/components/site-header.tsx` | 1 caller (`public-shell`) | `<div role="dialog" aria-modal="true">` | **DEFECTIVE**: No Escape dismissal, no focus trap, no accessible name, focus drops to body on close | **FIX REGARDLESS** / Standardize on modal drawer pattern |
| **`AdminShell` Mobile Drawer**<br>`src/components/admin/admin-shell.tsx` | 1 caller (`admin-shell`) | `<div role="dialog" aria-modal="true" aria-label="...">` | **SOUND**: Custom logic traps focus, locks body scroll, dismisses on Escape, returns focus to trigger | **CONSOLIDATE** into shared Sheet component |
| **`PassengerPicker` Popover**<br>`src/components/flight-search-form.tsx` | 1 caller (`FlightSearchForm` on homepage and `/book`) | Absolute unanchored `<div>` with 7 counter buttons | **DEFECTIVE**: Empirically confirmed: ignores Escape, ignores outside clicks, lacks dialog semantics | **FIX REGARDLESS** / Wrap in Radix Popover |
| **`GalleryPage` Lightbox**<br>`src/routes/{-$locale}.gallery.tsx` | 1 caller (`/gallery`) | `<div role="dialog" aria-modal="true" aria-label="...">` | **DEFECTIVE**: Body scroll unlocked, initial focus not moved inside, focus leaks on Tab; conditional focus drop | **FIX REGARDLESS** / Standardize on modal primitive |
| **`ConfirmDialog`**<br>`src/components/confirm-dialog.tsx` | 2 callers (Manage booking cancellation, admin booking cancel) | `<div role="alertdialog" aria-modal="true">` | Traps focus, focuses dismiss button safely, closes on Escape, but **body scroll remains unlocked** | **FIX** body scroll lock |
| **`AdminSearch` (⌘K)**<br>`src/components/admin/admin-search.tsx` | 1 caller (`AdminShell`) | `<div role="dialog">` with `input[role="combobox"]` and `ul[role="listbox"]` | Custom combobox: live query filters results (8 options for "PS"), arrow keys, Enter activation, Escape dismissal | **RETAIN UX, REBUILD INFRASTRUCTURE** with `cmdk` |
| **`SeatMap`**<br>`src/components/booking/seat-map.tsx` | 2 callers (`/book` step 4, `/manage/$ref/seats`) | Horizontal scrolling `<div overflow-x-auto>` with row `<div>`s and seat `<button>`s | **LINEAR TAB BURDEN**: 108 rendered buttons in economy cabin (inferred 73 sequential tab stops across enabled buttons in fixture; targeted 2-step Tab sequence verified). 32px mobile button passes SC 2.5.8 (24px) but falls short of 44px recommendation | **RECONSIDER UX PATTERN / REBUILD** with Roving TabIndex |
| **`Stepper`**<br>`src/components/booking/stepper.tsx` | 1 caller (`/book`) | `<nav aria-label="...">` with `<ol><li><span>` | Presentation-only step indicators. Not clickable links. Step state ephemeral (`useState`), no URL sync | **IMPROVE UX** with URL search params and history push |
| **Unreachable UI Primitives (46 files)**<br>`src/components/ui/*.tsx` | 0 callers from application entry points | Starter shadcn/Radix templates | Zero runtime reachability; dead maintenance overhead | **PURGE OR MIGRATE** |

---

## 3. Cross-Product Behavior Matrix

Empirical behavior records captured via automated CDP testing on Chrome (Run directory: `evidence/phase-3a/20260918-phase-3a-interaction-system/`):

| Interactive Overlay | Trigger & Semantics | Initial Focus | Tab Trapping | Escape Key | Outside Click | Focus Return | Body Scroll Lock | RTL Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Public Mobile Drawer**<br>([`site-header.tsx`](../src/components/site-header.tsx#L148)) | Button `aria-label="Menu"`<br>`role="dialog"` | ❌ Not set (stays on trigger/header) | ❌ **Leaked** (tabs to skip-link and language switcher) | ❌ **IGNORED** (stays open) | N/A (full screen opaque) | ❌ **Drops to `<body>`** | ✅ Locked (`overflow: hidden`) | Mirrored correctly |
| **Admin Mobile Drawer**<br>([`admin-shell.tsx`](../src/components/admin/admin-shell.tsx#L452)) | Button `aria-label="Open navigation"`<br>`role="dialog"` | ✅ First link inside drawer | ✅ **Trapped** (cycles inside drawer) | ✅ **Closes** | ✅ Backdrop button closes | ✅ **Returns to trigger** | ✅ Locked (`overflow: hidden`) | Slide-over from start inline |
| **Passenger Selector Popover**<br>([`flight-search-form.tsx`](../src/components/flight-search-form.tsx#L216)) | Button `aria-expanded="true/false"`<br>No role on popup | ❌ Not set (stays on button) | ❌ **Leaked** (tabs into date input below) | ❌ **IGNORED** (stays open) | ❌ **IGNORED** (stays open) | ❌ Stays on button / in form | ❌ Unlocked | RTL aligned, numerals isolated |
| **Gallery Lightbox**<br>([`{-$locale}.gallery.tsx`](../src/routes/{-$locale}.gallery.tsx#L145)) | Card `<button>`<br>`role="dialog"` | ❌ Not set (stays on clicked card) | ❌ **Leaked** (tabs into background cards) | ✅ **Closes** | ✅ Backdrop click closes | ⚠️ **Conditional** (stays on card if focus outside; drops to `<body>` if focus inside) | ❌ **Unlocked** (page scrolls behind) | Caption and metadata in Arabic |
| **Cancellation Confirm Dialog**<br>([`confirm-dialog.tsx`](../src/components/confirm-dialog.tsx#L64)) | Button "Cancel booking"<br>`role="alertdialog"` | ✅ Safe focus on "Keep booking" | ✅ **Trapped** (cycles between Keep and Cancel) | ✅ **Closes** | ❌ Modal barrier (intentional) | ✅ **Returns to trigger** | ❌ **Unlocked** (page scrolls behind) | Action buttons ordered start/end |
| **Admin Side Sheet**<br>([`admin-kit.tsx`](../src/components/admin/admin-kit.tsx#L370)) | Button "Quick edit"<br>`role="dialog"` | ✅ First form control in panel | ✅ **Trapped** (cycles inside panel) | ✅ **Closes** | ✅ Backdrop click closes | ✅ **Returns to trigger** | ✅ Locked (`overflow: hidden`) | Slides from inline end |
| **Admin Search Palette (⌘K)**<br>([`admin-search.tsx`](../src/components/admin/admin-search.tsx#L238)) | Button / ⌘K shortcut<br>`role="dialog"` + combobox | ✅ Input field (`role="combobox"`) | ✅ **Trapped** (cycles inside modal) | ✅ **Closes** | ❌ Dismisses on Escape/close button | ✅ **Returns to trigger** | ✅ Locked (`overflow: hidden`) | Results listbox supports RTL |

---

## 4. Deep-Dive: Navigation, Forms, Progression & Data Presentation

### 4.1 Navigation & Progression Patterns
- **Public Header & Skip Navigation**:
  - The public site includes a skip-to-main-content link (`<a href="#main" className="sr-only focus:not-sr-only ...">`). However, on mobile viewports, when the mobile drawer is opened, tabbing immediately activates this hidden skip link because focus was not trapped inside the drawer.
- **Admin Sidebar Collapsible State**:
  - The admin sidebar supports desktop collapsing (toggle between 256px `lg:w-64` and 64px `lg:w-16`). When collapsed, group headers are replaced with dividers, label text is hidden with `truncate`, and icon buttons gain tooltip `title` attributes.
- **Booking Wizard Progression Fragility**:
  - The 7-step booking process (`search`, `results`, `fare`, `passengers`, `seats`, `extras`, `review`) is managed exclusively by a React `useState<BookingStep>` in `src/routes/{-$locale}.book.tsx`.
  - **Zero URL state**: The browser address bar remains static at `/book` throughout the entire flow.
  - **Back button breakage**: Pressing browser Back while on Step 4 (Seats) navigates completely off `/book` to the previously visited page (e.g. homepage), dumping the user's booking progress.
  - **Stepper presentation gap**: The visual `Stepper` component renders steps as static `<span className="inline-flex ...">` items with `<Check>` icons. Users cannot click completed steps to return to them (e.g., clicking Step 2 "Fare" from Step 3 "Passengers").

### 4.2 Forms & Control System
- **Date Inputs**:
  - The entire application relies on native `<input type="date">` (in `FlightSearchForm`, `account.travelers.tsx`, `admin.activity.tsx`, `admin.schedules.tsx`, `admin.bookings.new.tsx`).
  - While native inputs provide native mobile wheel pickers on iOS and Android with zero JavaScript bundle cost, in Arabic RTL contexts, native date fields without explicit `dir="ltr"` suffer from reversed slash directions and inverted formatting in some Chromium builds. While admin schedule forms explicitly added `dir="ltr"`, public booking forms omitted it.
- **Passenger Counters & Bounds**:
  - In `FlightSearchForm`, adult, child, and infant counts are managed with `−` and `+` buttons.
  - Business logic is enforced correctly: adults minimum 1, infants cannot exceed adults (as infants travel on an adult's lap).
  - Accessibility gap: Counter buttons use `aria-label="Adults −"`, but the count value is rendered in an adjacent `<span class="numeral">` without `aria-live="polite"` or `role="spinbutton"` / `aria-valuenow`, meaning screen readers are not notified when the number changes.
- **Seat Map Grid Navigation & Target Size**:
  - In `src/components/booking/seat-map.tsx`, the Boeing 737-800 economy cabin zone renders rows 11 to 28 (18 rows × 6 seats/row = **108 rendered seat buttons** in DOM flow).
  - **Sequential Tab Burden (Inferred from DOM Order)**: In the empirical test fixture for flight `PS 101`, 108 total buttons are rendered across rows 11–28 (73 enabled/available, 35 disabled/occupied). Because each seat is rendered as an unmanaged native `<button>` in flat DOM flow without `tabIndex="-1"`, a keyboard user navigating through the cabin incurs an inferred 73 sequential tab stops across available seats before focus reaches trailing actions (e.g. "Continue"). A targeted 2-step Tab test empirically confirmed that Tab advances sequentially from seat to seat in DOM order (skipping occupied seats 11C/11D and advancing from 11B to 11E) rather than utilizing 2D arrow keys or a roving grid. While a full 73-key traversal was not executed key-by-key, the 73-step burden is a direct consequence of the 73 enabled native buttons in document order.
  - **Touch Target Dimensions**: Measured at 32px × 32px on mobile (390px viewport) and 36px × 36px on sm+ desktop.
    - *WCAG 2.2 AA SC 2.5.8 (Target Size - Minimum)*: Requires a minimum size of 24×24 CSS pixels (or adequate spacing). The 32px × 32px buttons **meet and exceed the WCAG 2.2 AA SC 2.5.8 requirement**.
    - *Platform Recommendation*: However, 32px falls short of the recommended 44px mobile touch target guideline (Apple HIG / WCAG AAA SC 2.5.5). This is a platform ergonomic recommendation rather than a WCAG AA failure; increasing touch hit area via touch-target expansion is recommended for optimal mobile usability.

### 4.3 Data Presentation, Tables & Notifications
- **Admin Flight Operations Toolbar**:
  - On `/admin/flights`, flight direction filtering is implemented as a segmented button group:
    `<div role="group" aria-label="Direction" className="flex rounded-md border border-border">`
    containing 3 toggle buttons: `All` (`aria-pressed="true"`), `Departures` (`aria-pressed="false"`), and `Arrivals` (`aria-pressed="false"`).
  - This is an accessible grouped toggle pattern, distinct from an ARIA `role="tablist"` / `role="tab"` pattern.
- **Admin Search Palette (⌘K)**:
  - In `src/components/admin/admin-search.tsx`, the command palette renders an input with `role="combobox"` and `aria-expanded="true"`.
  - When query `"PS"` is entered, the modal dynamically renders an active listbox (`ul[role="listbox"]`) containing 8 matching options (`li[role="option"]`), with the first option displaying `PS151 GZA → JED · 01:05`.
- **Status Chips & Badges**:
  - Two parallel implementations: `Pill` in `kit.tsx` (`neutral`, `brand`, `clay`, `ink`) and `AdminChip` in `admin-kit.tsx` (`neutral`, `muted`, `brand`, `warn`, `danger`, `info`).
  - Both render accessible inline badges with bold weight and distinct background tints.
- **Toast Systems**:
  - Public application has **zero toast feedback**. Success messages in manage and book rely on whole-page navigations or inline notices.
  - Admin application has custom `AdminToasts` powered by `useAdmin().toast()`, rendered via `<div aria-live="polite">` in `AdminShell`.
  - The installed library `sonner@2.0.7` and its wrapper `src/components/ui/sonner.tsx` are completely unutilized.
- **Boarding Pass Print Styles**:
  - Tested print layout: `src/styles.css` includes `@media print` rules hiding `header`, `footer`, and `[data-print-hide]`, setting background to `#fff` and padding to 0. Boarding passes in `boarding-pass.tsx` cleanly isolate for thermal/paper printing.

---

## 5. Design Tokens, Contrast & Directionality Audit

### 5.1 Color Tokens & Canvas-Sampled Contrast Measurements
All tokens in `src/styles.css` are specified using modern CSS `oklch()`. Using canvas pixel sampling against Chrome's rendering engine, exact sRGB values and contrast ratios were calculated:

| Token Pair / UI Element | Background (sRGB) | Foreground / Ring (sRGB) | Measured Ratio | WCAG 2.2 AA Standard | Evaluation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Body Text on Background**<br>`--foreground` on `--background` | `rgb(251, 250, 246)` | `rgb(18, 30, 23)` | **16.43 : 1** | ≥ 4.5:1 (Normal) | **EXCELLENT (AAA)** |
| **Primary Brand Button**<br>`--primary-foreground` on `--primary` | `rgb(25, 91, 59)` | `rgb(250, 248, 243)` | **7.61 : 1** | ≥ 4.5:1 (Normal) | **EXCELLENT (AAA)** |
| **Muted Text on Background**<br>`--muted-foreground` on `--background` | `rgb(251, 250, 246)` | `rgb(76, 85, 78)` | **7.40 : 1** | ≥ 4.5:1 (Normal) | **EXCELLENT (AAA)** |
| **Editorial Ink Header Text**<br>`--ink-foreground` on `--ink` | `rgb(17, 28, 22)` | `rgb(244, 245, 241)` | **15.68 : 1** | ≥ 4.5:1 (Normal) | **EXCELLENT (AAA)** |
| **Editorial Ink Muted Text**<br>`--ink-muted` on `--ink` | `rgb(17, 28, 22)` | `rgb(173, 187, 172)` | **7.62 : 1** | ≥ 4.5:1 (Normal) | **EXCELLENT (AAA)** |
| **Terracotta Clay Accent**<br>`--clay` on `--background` | `rgb(251, 250, 246)` | `rgb(171, 78, 41)` | **5.14 : 1** | ≥ 4.5:1 (Normal) | **PASSES AA** |
| **Focus Ring on Card Background**<br>`--ring` on `--card` | `rgb(255, 255, 255)` | `rgb(25, 91, 59)` | **7.73 : 1** | ≥ 3.0:1 (UI Component) | **EXCELLENT** |
| **Focus Ring on Limestone Sand**<br>`--ring` on `--sand` | `rgb(243, 241, 233)` | `rgb(25, 91, 59)` | **7.20 : 1** | ≥ 3.0:1 (UI Component) | **EXCELLENT** |

### 5.2 Focus Visible Standards
- Base focus ring is universally declared in `src/styles.css`:
  ```css
  :focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
  ```
- Focus ring contrast is **7.73:1** against white surfaces and **7.20:1** against warm limestone sand (`--sand`), far exceeding the 3.0:1 WCAG 2.2 AA minimum.
- All interactive buttons in `kit.tsx` and `admin-kit.tsx` explicitly include `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.

### 5.3 Aviation Identifier LTR Isolation in Arabic RTL
- Technical identifiers (`PS 151`, `GZA`, `AMM`, `2026-09-18`, `01:05`, `154/168`, `GZA4TQ`, `Boeing 737-800`) are isolated in the DOM via `.code-id`, `<Code>`, or `<Ltr>`:
  ```css
  @utility code-id {
    font-family: var(--font-mono-family);
    direction: ltr;
    unicode-bidi: isolate;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  ```
- **Empirical verification on `/ar/flights`**: 37 isolated tokens were asserted in the rendered DOM. Every sampled token exhibited `computed.direction === "ltr"` and `computed.unicodeBidi === "isolate"`, ensuring flight codes, times, and gates never suffer from bidirectional Arabic punctuation inversion.
- **Arabic Typography Rule**: `src/styles.css` strictly disables uppercase and letter-spacing across Arabic text while preserving them on `.code-id` and `[dir="ltr"]` tokens:
  ```css
  :is([dir="rtl"], [dir="rtl"] *):is(h1, h2, h3, h4, h5, h6, .type-title-lg, .eyebrow, ...):not([dir="ltr"], .code-id, .numeral) {
    text-transform: none;
    letter-spacing: normal;
  }
  ```

---

## 6. Prioritized Confirmed Defects

### Defect 1: Public Mobile Navigation Drawer Focus Containment Failure & Missing Escape Dismissal
- **Severity**: **High** | **Applicable Standards**: WCAG 2.2 SC 2.4.3 (Focus Order), WAI-ARIA Modal Dialog Pattern (Focus Containment)
- **Source**: `src/components/site-header.tsx` lines 147–189
- **Evidence**: On 390px viewport, opening the mobile drawer sets `document.body.style.overflow = "hidden"`, but `document.activeElement` remains on the header menu button. When pressing `Tab`, focus **escapes** the modal drawer, leaking to the off-screen skip link and top language switch behind the drawer. Pressing `Escape` does nothing (`isOpen` remains true). Clicking the close button (`X`) drops focus to `document.body` instead of returning to the menu trigger.
- **Root Cause**: The drawer was written as a raw conditional `div` with custom CSS rather than leveraging a standard dialog/sheet primitive with focus trapping and focus restoration.

### Defect 2: Gallery Lightbox Focus Leak, Unlocked Body Scroll & Focus Drop
- **Severity**: **High** | **WCAG Criteria**: SC 2.4.3 (Focus Order)
- **Source**: `src/routes/{-$locale}.gallery.tsx` lines 145–212
- **Evidence**: Clicking an image card opens the lightbox modal. `document.body.style.overflow` is never set to `"hidden"`, allowing background page scrolling while the viewer is open. Focus is not moved into the dialog on open. Tabbing past the "Next" button leaks focus directly into the background gallery thumbnail buttons. When closed via Escape without inner focus, focus remains on the active thumbnail (`activeElementIsBody: false`); when closed after focusing inside the dialog, focus unconditionally drops to `document.body` as the focused DOM element is destroyed (established in the accepted heritage audit).
- **Root Cause**: Custom lightbox overlay lacks focus trap and body scroll lock hooks.

### Defect 3: Passenger Selector Popover Missing Escape & Outside-Click Dismissal
- **Severity**: **Medium** | **Criteria / Standard**: Expected WAI-ARIA Popover Dismissal, SC 2.1.1 (Keyboard)
- **Source**: `src/components/flight-search-form.tsx` lines 216–278
- **Evidence**: Empirically confirmed in browser test records (`passenger_picker_overlay`): clicking the passenger button opens the popover (`expanded: "true"`, `hasPopover: true`). Pressing `Escape` does not dismiss it (`dismissedOnEscape: false`, `isOpen: true`). Clicking outside the popover onto the canvas does not dismiss it (`dismissedOnOutsideClick: false`, `isOpen: true`). It lacks `role="dialog"` or disclosure popover attributes.
- **Root Cause**: Popover is rendered as an unmanaged `absolute` div toggled by boolean state without event listeners for `keydown` (Escape) or `mousedown` (outside click).

### Defect 4: Seat Map Linear Tab Burden & Mobile Touch Target Ergonomics
- **Severity**: **High** | **WCAG Criteria**: SC 2.4.3 (Focus Order)
- **Source**: `src/components/booking/seat-map.tsx` lines 112–169
- **Evidence**: In Boeing 737-800 economy cabin (rows 11–28), 108 seat buttons are rendered in normal DOM flow. In the tested fixture, 73 seats are enabled/available and 35 are occupied/disabled. Because these are native enabled buttons in flat document order without `tabIndex="-1"`, keyboard navigation incurs an inferred 73 sequential tab stops across available seats to reach subsequent form actions (empirically confirmed via targeted 2-step Tab advancement; a full 73-key traversal was not run). Arrow keys do not navigate the 2D grid. Mobile seat buttons measure 32px × 32px: this satisfies the WCAG 2.2 AA SC 2.5.8 minimum (24px) but falls short of the recommended 44px mobile touch target standard (platform recommendation, not a WCAG AA failure).
- **Root Cause**: Absence of a 2D roving tabindex `role="grid"` pattern.

### Defect 5: Cancellation Confirm Alertdialog Body Scroll Unlocked
- **Severity**: **Medium** | **UX / Cognitive Order**
- **Source**: `src/components/confirm-dialog.tsx` lines 64–91
- **Evidence**: When `ConfirmDialog` opens in `/manage/GZA-7K8P`, initial focus safely moves to "Keep booking" and Tab correctly traps between "Keep booking" and "Cancel booking". However, `document.body.style.overflow` is never set to `"hidden"`, meaning wheel or trackpad gestures scroll the page behind the backdrop.
- **Root Cause**: Missing body overflow lock in `ConfirmDialog.useEffect`.

### Defect 6: Booking Wizard History Fragility & URL Deep-Link Absence
- **Severity**: **High** | **User Experience & State Preservation**
- **Source**: `src/routes/{-$locale}.book.tsx` lines 68–105
- **Evidence**: The 7-step booking wizard maintains step position in ephemeral React state (`useState<BookingStep>`). The URL remains `/book` throughout. Pressing browser Back on Step 4 (Seats) completely exits the booking flow back to the previous route, losing user orientation and active progress.
- **Root Cause**: Wizard steps are not synchronized with TanStack Router search parameters (`?step=seats`).

### Defect 7: Inverted Native Date Inputs in Arabic RTL
- **Severity**: **Medium** | **WCAG Criteria**: SC 1.3.1 (Info and Relationships)
- **Source**: `src/components/flight-search-form.tsx` line 188, `src/routes/{-$locale}.book.tsx` line 417
- **Evidence**: Native `<input type="date">` elements in public Arabic routes lack explicit `dir="ltr"` or `.code-id` wrappers, causing browser native date placeholders to format unpredictably in RTL layouts.
- **Root Cause**: Inconsistent application of `dir="ltr"` across date inputs (present in admin schedules, omitted in public booking).

### Defect 8: Unreachable Dead Code in `src/components/ui/`
- **Severity**: **Medium** | **Architecture & Maintenance**
- **Source**: `src/components/ui/` (46 files)
- **Evidence**: Static reachability analysis from application entry points confirms that 0 out of 46 files in `src/components/ui/` are reachable or imported by the application. Primitives like `accordion`, `carousel`, `chart`, `drawer`, `menubar`, `navigation-menu`, `popover`, `select`, `slider`, `switch`, `tabs` add cognitive overhead and dead weight to the repository without providing value.
- **Root Cause**: Scaffolding templates that were never adopted by application routes.

---

## 7. Material Architectural Decision Cards

The following decision cards are prepared for the later Phase 3A Synthesis and Owner Review:

### Decision Card 1: UI Primitives Foundation Consolidation
- **Current State**: 46 files in `src/components/ui/` (0 reachable from application entry points); active application runs on `src/components/kit.tsx` and `src/components/admin/admin-kit.tsx`.
- **Direct Evidence**: `inventory-analysis.json` confirmed 0 of 46 files in `ui/` are reachable from routes, while `kit.tsx` and `admin-kit.tsx` account for over 300 component callers.
- **Genuine Strengths of Current State**: `kit.tsx` is ultra-compact, has zero external Radix dependencies for simple buttons/panels, and strictly enforces the warm limestone/olive tokens.
- **Trade-offs / Alternatives**:
  - *Option A (Prune Dead Code)*: Delete the unreachable `ui/*.tsx` files. Keep `kit.tsx` and `admin-kit.tsx` as the authoritative design system.
  - *Option B (Harmonize onto Radix)*: Adopt Radix headless primitives only where accessibility requires it (dialog, sheet, popover, dropdown), while keeping `kit.tsx` for visual tokens.
- **Recommendation**: **Option B**. Prune unused UI files, but retain and standardize Radix headless primitives for complex accessible overlays (Dialog, Sheet, Popover).
- **Impact**: Zero runtime regression; removes ~3,500 lines of dead code; improves maintenance clarity.
- **Owner Decision Required?**: **NO** (Standard engineering cleanup).
- **Classification**: `CONSOLIDATE`.

---

### Decision Card 2: Shared Accessible Overlay Architecture
- **Current State**: 4 custom hand-rolled overlay implementations (`SiteHeader` mobile drawer, `AdminShell` mobile drawer, `GalleryPage` lightbox, `AdminSheet`) with diverging focus traps and escape behaviors.
- **Direct Evidence**: Public mobile drawer leaks focus and ignores Escape; Admin drawer traps focus and handles Escape via custom hooks; Lightbox unlocks body scroll and drops focus.
- **Genuine Strengths of Current State**: `AdminShell` and `AdminSheet` custom implementations are self-contained.
- **Trade-offs / Alternatives**:
  - *Option A*: Refactor `SiteHeader` drawer and `GalleryPage` lightbox to use the custom focus trap pattern from `AdminShell`.
  - *Option B*: Standardize all modal dialogs, drawers, and lightboxes on `@radix-ui/react-dialog` (already installed), which automatically handles focus trapping, Escape dismissal, backdrop click, body scroll locking, and focus restoration out of the box.
- **Recommendation**: **Option B**. Standardize on a unified `Dialog` / `Sheet` component built on Radix.
- **Impact**: Resolves Defects 1, 2, and 5 simultaneously across public, heritage, and admin.
- **Owner Decision Required?**: **NO** (Engineering quality & accessibility invariant).
- **Classification**: `KEEP UX, REBUILD INFRASTRUCTURE`.

---

### Decision Card 3: Seat Map Keyboard Navigation & Touch Target Architecture
- **Current State**: 108 separate button elements rendered in flat DOM sequence (18 rows × 6 seats; 73 enabled, 35 occupied in fixture). Mobile button size is 32px × 32px.
- **Direct Evidence**: Measured 108 rendered buttons (73 enabled, 35 disabled). Inferred 73 sequential tab stops based on flat DOM order of native buttons, supported by targeted 2-step Tab verification confirming sequential advancement. Mobile touch target size measured at 32px × 32px (meets WCAG 2.2 AA SC 2.5.8 24px minimum; falls short of 44px mobile ergonomic recommendation, which is not a WCAG AA failure).
- **Genuine Strengths of Current State**: Visually intuitive aircraft cabin representation with clear cabin zones, extra-legroom badges, and suggested seat highlights.
- **Trade-offs / Alternatives**:
  - *Option A (Keep Linear)*: Retain linear buttons but add an in-page skip link directly before the cabin grid.
  - *Option B (WAI-ARIA Roving TabIndex Grid)*: Convert the cabin to a `role="grid"` where only the current seat is in the Tab order (`tabIndex={0}`), and Arrow keys (`↑`, `↓`, `←`, `→`) navigate rows and seats. Increase mobile touch target hit area with touch-target expansion toward the 44px recommendation.
- **Recommendation**: **Option B**. Significant expected usability and keyboard navigation improvement for assistive tech users without changing visual design.
- **Impact**: Expected to consolidate cabin Tab sequence from 73 sequential stops to a single entry stop, deferring intra-cabin traversal to 2D arrow keys. Requires post-implementation keyboard and assistive-technology verification to validate actual screen reader row/column announcements and focus stability.
- **Owner Decision Required?**: **YES** (Alters keyboard navigation model for booking).
- **Classification**: `UX PATTERN SHOULD BE RECONSIDERED`.

---

### Decision Card 4: Multi-Step Booking Wizard State & History Synchronization
- **Current State**: Entire 7-step wizard driven by ephemeral component `useState`. Static URL `/book`.
- **Direct Evidence**: Browser Back button exits the wizard; page refresh drops user back to step 1.
- **Genuine Strengths of Current State**: Fast client transitions without route churn.
- **Trade-offs / Alternatives**:
  - *Option A*: Keep `useState` but intercept browser Back with `popstate` / `beforeunload` warning.
  - *Option B*: Sync wizard step to TanStack Router search params (e.g. `/book?step=seats`), pushing router history on step forward. Make `Stepper` steps clickable breadcrumbs for completed stages.
- **Recommendation**: **Option B**. Dramatically improves user trust and aligns with modern booking engine standards.
- **Impact**: Users can refresh, bookmark, or click Back without losing flight/passenger progress.
- **Owner Decision Required?**: **YES** (Flow UX and history behavior change).
- **Classification**: `UX PATTERN SHOULD BE RECONSIDERED`.

---

### Decision Card 5: Native Date Inputs vs Branded Popover Calendar
- **Current State**: Universal use of native HTML5 `<input type="date">`.
- **Direct Evidence**: Works cleanly on mobile devices with native date pickers; exhibits minor RTL slash formatting irregularities on desktop browsers without explicit `dir="ltr"`. `react-day-picker` is installed in `node_modules` but unused.
- **Genuine Strengths of Current State**: Native date pickers provide the best mobile accessibility and zero client bundle cost.
- **Trade-offs / Alternatives**:
  - *Option A (Retain Native)*: Keep native `<input type="date">`, but enforce `dir="ltr"` and `.code-id` wrapper on every instance across public and admin.
  - *Option B (Custom Branded Calendar)*: Replace with `react-day-picker` popover calendar using the limestone `--sand` and olive `--brand` design tokens.
- **Recommendation**: **Option A**. Native date inputs provide superior mobile ergonomic entry; enforce `dir="ltr"` on all date fields to guarantee RTL stability.
- **Impact**: Zero bundle growth, optimal mobile UX, fixes Arabic formatting glitch.
- **Owner Decision Required?**: **NO** (Implementation refinement).
- **Classification**: `KEEP AS-IS`.

---

### Decision Card 6: Notification & Toast System Unification
- **Current State**: Admin has custom `AdminToasts` component in `admin-shell.tsx`; public site has no toasts. `sonner` is installed but unused.
- **Direct Evidence**: Tested admin quick-edit generates toast via `useAdmin().toast()`; public manage booking updates inline without toast.
- **Genuine Strengths of Current State**: Simple inline feedback in public booking.
- **Trade-offs / Alternatives**:
  - *Option A*: Keep admin-only custom toast.
  - *Option B*: Adopt `sonner` across the entire application (public + admin) with authentic limestone/sand and ink styling.
- **Recommendation**: **Option B** (or consolidate when mock stores converge in Phase 4).
- **Impact**: Consistent feedback across passenger actions and staff operations.
- **Owner Decision Required?**: **NO**.
- **Classification**: `CONSOLIDATE`.

---

### Decision Card 7: Technical Identifier Isolation Primitive Consolidation
- **Current State**: Two duplicate primitives for the same purpose: `<Code>` in `kit.tsx` and `<Ltr>` in `admin-kit.tsx`.
- **Direct Evidence**: Both apply `.code-id` and `direction: ltr; unicode-bidi: isolate;`.
- **Recommendation**: Consolidate into a single shared `<CodeId>` primitive in `kit.tsx`.
- **Impact**: Eliminates duplication and guarantees uniform aviation identifier isolation across public and admin.
- **Owner Decision Required?**: **NO**.
- **Classification**: `CONSOLIDATE`.

---

## 8. Empirical Verification Index & Test Records

Targeted interactive test cases executed during this audit run are preserved in structured machine-readable format under [`docs/evidence/phase-3a/20260918-phase-3a-interaction-system/browser-test-records.json`](evidence/phase-3a/20260918-phase-3a-interaction-system/browser-test-records.json). Raw PNG captures remain historical worker/Git evidence preserved in baseline commit `cc57cfe2450effd78547b591fd66b156ef5e699a`.

| Observation ID / Target | Route | Locale | Viewport | Focus / Interactive State Verified |
| :--- | :--- | :--- | :--- | :--- |
| `public_mobile_drawer` | `/` | EN | 390×844 | Public mobile drawer open (demonstrates full-screen overlay) |
| `admin_mobile_drawer` | `/admin` | EN | 390×844 | Admin mobile drawer open (demonstrates slide-over navigation with ink theme) |
| `passenger_picker_overlay.desktop` | `/` | EN | 1280×900 | Page scrolled to center popover; open passenger selector popover and counter controls visibly rendered inside viewport (confirmed by DOM assertion) |
| `passenger_picker_overlay.mobile_ar` | `/ar` | AR | 390×844 | Mobile page scrolled to center popover; open passenger selector popover in Arabic view with counter controls visibly rendered inside viewport (confirmed by DOM assertion) |
| `gallery_lightbox.desktop` | `/gallery` | EN | 1280×900 | Gallery archive lightbox modal open with pagination & metadata |
| `gallery_lightbox.desktop_ar` | `/ar/gallery` | AR | 1280×900 | Gallery lightbox open in Arabic with RTL chevron mirroring |
| `cancellation_alertdialog` | `/manage/GZA-7K8P` | EN | 1280×900 | Cancellation confirmation alertdialog open with dismiss button focus |
| `admin_search_palette` | `/admin` | EN | 1280×900 | Command palette combobox modal displaying filtered search results for query 'PS' |
| `admin_side_sheet` | `/admin/flights` | EN | 1280×900 | Admin quick-edit side sheet open over flight operations table |
| `seat_map_tab_sequence` | `/book` | EN | 1280×900 | Active aircraft cabin seat map at Step 4 of booking flow (rows 11-28, 108 total rendered seat buttons: 73 enabled, 35 occupied in fixture); targeted 2-step Tab focus verified |
| `seat_map_mobile` | `/book` | EN | 390×844 | Mobile viewport (390px) rendering of aircraft cabin seat grid at Step 4 (32px × 32px touch target) |
| `booking_stepper` | `/book` | EN | 1280×900 | Booking progression stepper at Step 4 (Seats) with non-interactive indicator steps |
| `admin_tabs_flights` | `/admin/flights` | EN | 1280×900 | Admin flight operations toolbar with segmented direction toggle group (All / Departures / Arrivals) |
| `ltr_isolation_arabic` | `/ar/flights` | AR | 1280×900 | Flight board in Arabic verifying `.code-id` LTR isolation |

---

## 9. Quality Gates & Baseline Verification

- **Baseline Commit**: `4a7b9dea6b2502b748d00c011c0067f8c35be33c` on `main`
- **TypeScript Typecheck**: `bun run typecheck` → **Exit code 0** (`tsc --noEmit`)
- **ESLint Linting**: `bun run lint` → **Exit code 0** (43 warnings, 0 errors, **delta = 0**)
- **Vite Client & SSR Build**: `bun run build` → **Exit code 0**
- **HostPapa Static Build**: `bun run build:hostpapa` → **Exit code 0** (46 pages prerendered)
- **Git Diff Whitespace Check**: `git diff --check` → **Exit code 0**
- **Route Tree Parity**: `git diff --quiet -- src/routeTree.gen.ts` → **Exit code 0** (zero content diffs)
- **Application Tree Integrity**: Zero application code files under `src/` were modified. Working tree remains uncommitted and unpushed.

---
*Ready for Codex independent review and Phase 3A Synthesis preparation.*
