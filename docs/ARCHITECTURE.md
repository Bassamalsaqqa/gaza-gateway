# System Architecture — Gaza Airport & Palestinian Airlines

> **Repository**: `Bassamalsaqqa/gaza-gateway`
> **Production Domain**: `https://www.gazaairport.com`
> **Baseline Commit**: `fe294f4dc4049018d250843315b2b936c8417600` (Phase 0 baseline published; HEAD `9d1edc5673f0237bb23d40a5685c49b8fd90b3c0` includes Phase 0.1)
> **Engineering Status**: **Phase 1 Active (HostPapa Static/Prerender Implementation Complete, Ready for Codex Review)**

---

## 1. Technical Stack & Build Environment

| Layer                         | Technology                                 | Version                                    | Purpose & Implementation Reality                                                                                                                                                                                                                                                                                                                                                                           |
| :---------------------------- | :----------------------------------------- | :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime & Package Manager** | Bun / Node.js                              | Bun 1.2.22 / Node v24.12.0                 | Script runner (`bun.cmd`), lockfile (`bun.lock`).                                                                                                                                                                                                                                                                                                                                                          |
| **Frontend Framework**        | React                                      | 19.2.0                                     | Component hierarchy, hooks, context providers.                                                                                                                                                                                                                                                                                                                                                             |
| **Routing & SSR Engine**      | TanStack Start / Router                    | Router 1.170.18 / Start 1.168.32           | File-based flat routing, route loaders, SSR hydration, head management.                                                                                                                                                                                                                                                                                                                                    |
| **Bundler & Build Tool**      | Vite / Nitro                               | Vite 8.1.5 / Nitro 3.0.260603-beta         | Client/server bundling (`@lovable.dev/vite-tanstack-config`). Emits Cloudflare Pages/Nitro SSR worker bundle.                                                                                                                                                                                                                                                                                              |
| **Styling & Design Tokens**   | Tailwind CSS                               | 4.2.1                                      | CSS variables (`@theme inline`), oklch design tokens in `src/styles.css`.                                                                                                                                                                                                                                                                                                                                  |
| **Component Primitives**      | Bespoke UI / Unmounted Radix               | Various (^1.1 - ^2.2)                      | Product screens and shells use bespoke React components and `src/components/kit.tsx`. Radix/shadcn wrappers exist in `src/components/ui/` as unmounted templates.                                                                                                                                                                                                                                          |
| **Icons & Visuals**           | Lucide React                               | 0.575.0                                    | Aviation, navigation, and UI control icons.                                                                                                                                                                                                                                                                                                                                                                |
| **Charts**                    | Custom CSS / Unmounted Recharts            | Recharts 2.15.4                            | Operational analytics (`{-$locale}.admin.analytics.tsx`) renders bespoke HTML/CSS bar charts (`<Bar />` with percentage widths). `recharts` is imported strictly in `src/components/ui/chart.tsx`, which is an unmounted template not imported by any product screen.                                                                                                                                      |
| **Forms & Validation**        | Native HTML5 & React / Unmounted Hook Form | RHF 7.71.2 / Zod 3.25.76 / Resolvers 5.2.2 | Product screens across public and admin use native React `useState`, controlled inputs/selects/textareas, and standard HTML5 validation attributes (`required`, `type="date"`, `min`, `autoComplete`). `react-hook-form` is imported strictly in `src/components/ui/form.tsx` (unmounted template); `zod` and `@hookform/resolvers` are installed in `package.json` but never imported anywhere in `src/`. |

---

## 2. Flat Route Architecture & Namespace

The application uses TanStack Start's file-based router with a **flat file topology directly in `src/routes/`**. Route files use dot notation to represent URL paths. The route tree is compiled automatically into `src/routeTree.gen.ts`. Never edit `src/routeTree.gen.ts` by hand.

### 2.1 Bilingual URL Namespace (`{-$locale}`)

Public and admin pages use the optional prefix segment `{-$locale}`:

- **English (Default)**: Unprefixed URLs (`/`, `/flights`, `/admin`, `/manage/GZA-7K8P`).
- **Arabic**: Prefixed with `/ar` (`/ar`, `/ar/flights`, `/ar/admin`, `/ar/manage/GZA-7K8P`).
- **Directionality**: `src/routes/__root.tsx` resolves `<html lang={lang} dir={dirOf(lang)}>` on the server from the initial URL request. Technical identifiers (flight numbers, PNRs, dates, times) are styled with `dir="ltr"` and `font-mono`.

### 2.2 Route File Inventory (68 `.tsx` Files Total)

#### 1. Root & Base Layout (2 files):

- `src/routes/__root.tsx` — Root shell, HTML `lang`/`dir`, head metadata, and global providers (`QueryClientProvider`, `I18nProvider`, `StoreProvider`, `AdminProvider`).
- `src/routes/{-$locale}.tsx` — Locale layout wrapper.

#### 2. Public Feature Routes (43 files):

- **Homepage & Global**: `{-$locale}.index.tsx`, `{-$locale}.about.tsx`, `{-$locale}.travel.tsx`, `{-$locale}.contact.tsx`, `{-$locale}.privacy.tsx`, `{-$locale}.terms.tsx`, `{-$locale}.access-denied.tsx`.
- **Flights & Destinations**: `{-$locale}.flights.tsx`, `{-$locale}.flight.$flightId.tsx`, `{-$locale}.destinations.tsx`, `{-$locale}.destinations.$code.tsx`.
- **Booking & Boarding**: `{-$locale}.book.tsx`, `{-$locale}.booking-confirmation.$ref.tsx`, `{-$locale}.check-in.tsx`, `{-$locale}.boarding-pass.$ref.$leg.$pax.tsx`.
- **Manage Booking Hub & Subroutes**: `{-$locale}.manage.tsx`, `{-$locale}.manage.index.tsx`, `{-$locale}.manage.$ref.tsx`, `{-$locale}.manage.$ref_.seats.tsx`, `{-$locale}.manage.$ref_.extras.tsx`, `{-$locale}.manage.$ref_.contact.tsx`, `{-$locale}.manage.$ref_.check-in.tsx` (trailing `_` in `$ref_` bypasses the manage detail layout).
- **Passenger Account & Auth**: `{-$locale}.signin.tsx`, `{-$locale}.register.tsx`, `{-$locale}.forgot-password.tsx`, `{-$locale}.reset-password.tsx`, `{-$locale}.verify-email.tsx`, `{-$locale}.account.tsx`, `{-$locale}.account.index.tsx`, `{-$locale}.account.profile.tsx`, `{-$locale}.account.preferences.tsx`, `{-$locale}.account.security.tsx`, `{-$locale}.account.travelers.tsx`, `{-$locale}.account.trips.tsx`, `{-$locale}.account.trips.index.tsx`, `{-$locale}.account.trips.$ref.tsx`, `{-$locale}.account.boarding-passes.tsx`.
- **Airport Storytelling & Gallery**: `{-$locale}.airport.tsx`, `{-$locale}.airport.index.tsx`, `{-$locale}.airport.past.tsx`, `{-$locale}.airport.present.tsx`, `{-$locale}.airport.future.tsx`, `{-$locale}.gallery.tsx`.

#### 3. Admin Workspace Routes (23 files):

- **Admin Shell Layout**: `src/routes/{-$locale}.admin.tsx` — Renders `<AdminShell />` with sidebar, top bar, search palette, and mobile drawer.
- **Admin Authentication**: `src/routes/{-$locale}.admin_.signin.tsx` — Staff login (trailing `_` in `admin_` bypasses the `admin.tsx` layout).
- **Dashboard & Access**: `src/routes/{-$locale}.admin.index.tsx` (Operations Dashboard), `src/routes/{-$locale}.admin.access-denied.tsx`.
- **Operations Modules**:
  - `{-$locale}.admin.flights.index.tsx` & `{-$locale}.admin.flights.$flightId.tsx` (Flight Operations)
  - `{-$locale}.admin.schedules.tsx` (Timetable Management)
  - `{-$locale}.admin.destinations.index.tsx` & `{-$locale}.admin.destinations.$code.tsx` (Destinations)
  - `{-$locale}.admin.products.tsx` (Fares & Ancillaries)
  - `{-$locale}.admin.bookings.index.tsx`, `{-$locale}.admin.bookings.$ref.tsx`, `{-$locale}.admin.bookings.new.tsx` (Bookings Manifest & Counter Booking)
  - `{-$locale}.admin.check-in.tsx` (Station Check-in Desk)
  - `{-$locale}.admin.customers.index.tsx` & `{-$locale}.admin.customers.$id.tsx` (Customer Directory & Detail)
  - `{-$locale}.admin.website.tsx` (Website CMS)
  - `{-$locale}.admin.airport.index.tsx` (Airport History & Archive CMS)
  - `{-$locale}.admin.staff.tsx` (Staff Accounts & Permissions)
  - `{-$locale}.admin.activity.tsx` (System Audit Log)
  - `{-$locale}.admin.analytics.tsx` (Operational Analytics)
  - `{-$locale}.admin.settings.tsx` (Station Settings)
  - `{-$locale}.admin.inbox.tsx` (Staff Inbox)

---

## 3. UI Component Hierarchy & Interaction Primitives

### 3.1 Radix Primitives vs. Bespoke Implementations

- **Installed Radix & shadcn Wrappers (`src/components/ui/`)**: Accordion, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input-otp, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle-group, toggle, tooltip. All 46 template files in `src/components/ui/` exist as unmounted templates; static audit confirms that **none of these wrappers are imported or mounted** in product screens.
- **Bespoke Public Components**:
  - Native HTML5 inputs: `FlightSearchForm` uses native `<input type="date">` with `min` validation limits, not `react-day-picker` or `src/components/ui/calendar.tsx`.
  - Forms & Validation: Controlled native inputs, selects, and textareas using React `useState` and native HTML5 validation constraints (`required`, `type`, `min`, `autoComplete`). Neither `src/components/ui/form.tsx` nor `zod` is used in any screen.
  - `ConfirmDialog` (`src/components/confirm-dialog.tsx`): 100% bespoke confirmation dialog with `role="alertdialog"`, initial focus on dismiss, focus restoration on close, manual `Tab`/`Shift+Tab` focus trap, and Escape listener. Does not use Radix alert-dialog.
  - UI Kit: `src/components/kit.tsx` provides styled native HTML elements (`Button`, `Field`, `Input`, `Select`, `Textarea`, `Panel`, `Notice`).
- **Admin Workspace Bespoke Components (`src/components/admin/`)**:
  - `AdminSearch` (`admin-search.tsx`): Custom React input and listbox with manual keyboard navigation (ArrowDown, ArrowUp, Enter, Escape) and click-outside handler. Does **not** import `cmdk` or `src/components/ui/command.tsx`.
  - `AccountMenu` (`admin-shell.tsx`): Custom React dropdown with `useRef`, click-outside handler, and Escape listener. Does not use Radix dropdown.
  - `AttentionBell` (`admin-shell.tsx`): Custom React popover with `useRef`, click-outside handler, and Escape listener. Does not use Radix popover.
  - `MobileDrawer` (`admin-shell.tsx`): Custom off-canvas drawer with `document.body.style.overflow` scroll lock, manual Tab key focus loop (`e.shiftKey`), and Escape close. Does not use `vaul` or Radix dialog.
  - `AdminSheet` (`admin-kit.tsx`, used by `flight-quick-edit.tsx`): Custom slide-over panel with `aria-modal="true"`, body scroll lock, manual focus trap, and Escape listener. Does not use `vaul` or Radix dialog.
  - `AdminToasts` (`admin-kit.tsx`): Admin-only stacked toast notification manager mounted in `AdminShell`, driven by `useAdmin().toast()`. Does not use `sonner` or `src/components/ui/sonner.tsx`.
  - Operational Analytics: Bespoke HTML/CSS bar visualization (`<Bar />` in `src/routes/{-$locale}.admin.analytics.tsx`) with styled percentage `<span>` elements; does not import `recharts` or `src/components/ui/chart.tsx`.

---

## 4. Bundle Layout & Asset Footprint

Measured from production build (`bun run build`):

- **Total Client Assets**: **1,172,759 bytes** across **106 assets** (105 `.js` chunks, 1 `.css` chunk) in `.output/public/assets/`.
- **Core Runtime Chunks**:
  - `index-BAvks629.js` (361.5 KB) — React, ReactDOM, TanStack Router runtime core.
  - `kit-D6qOhOPL.js` (156.6 KB) — Shared UI kit components and Lucide icons.
  - `styles-DkElmA4J.css` (110.0 KB) — Complete Tailwind CSS stylesheet.
  - `Match-Di6JrQ0G.js` (48.7 KB) — TanStack Router route matching engine.
- **Route-Split Chunks**:
  - Public Booking Engine: `_-_locale_.book-*.js` (26.8 KB).
  - Admin Shell: `_-_locale_.admin-*.js` (25.2 KB).
  - Admin Mock Data: `admin-mock-*.js` (25.3 KB, loaded lazily on admin navigation).
  - Admin Modules: `admin.airport.*.js` (20.8 KB), `admin.products.*.js` (19.8 KB), `admin.index.*.js` (16.5 KB).

---

## 5. Design Tokens & Styling System

The styling system is configured in `src/styles.css` using Tailwind CSS v4 `@theme inline` with CSS oklch variables:

- **Surface Tokens**: `--background: oklch(0.985 0.006 95)` (Warm limestone), `--sand: oklch(0.96 0.015 92)`, `--card: oklch(1 0 0)`.
- **Brand Tokens**: `--brand: oklch(0.42 0.085 158)` (Palestinian Airlines deep olive green), `--primary`.
- **Accent Tokens**: `--clay: oklch(0.58 0.14 42)` (Terracotta / clay accent).
- **Editorial / Storytelling Tokens**: `--ink: oklch(0.21 0.024 165)` (Deep slate for historical sections).
- **Typography**: Display: `Bricolage Grotesque` / `IBM Plex Sans Arabic`; Body: `Manrope` / `IBM Plex Sans Arabic`; Monospace: `IBM Plex Mono` (for flight numbers, PNRs, dates, and times).

---

## 6. Hosting Constraints & HostPapa Static Architecture

1. **Target Host**: HostPapa shared cPanel hosting.
2. **Serving Mechanism**: Apache web server serving static files from `public_html/`.
3. **No Persistent Runtime**: No Node.js daemon, no serverless edge workers, no Docker container, and no remote build step.
4. **Static Build Implementation (Phase 1 Complete)**:
   - Dedicated build command: `bun.cmd run build:hostpapa` backed by `vite.config.hostpapa.ts`.
   - Uses `@lovable.dev/vite-tanstack-config` with `nitro: false`, keeping `vite.config.ts` untouched for Lovable editor compatibility and SSR preview.
   - Outputs a pure static artifact in `dist/client/` (no server runtime required).
5. **Prerender & Dynamic Shell Architecture**:
   - **42 Prerendered Public Routes**: Substantive HTML for all public paths (21 English + 21 Arabic), including home, flights, airport, travel, gallery, about, contact, legal, booking engine, and all 7 destination detail routes.
   - **4 Targeted Application Shells**: Prerendered via explicit routes (`_shell.html` via `/?shell=1`, `ar/_shell.html` via `/ar?shell=1`, `admin/_shell.html` via `/admin/signin?shell=1`, and `ar/admin/_shell.html` via `/ar/admin/signin?shell=1`).
   - **Apache `.htaccess`**: Direct file checks, directory indexes, asset 404s for missing static files, and locale/admin-aware fallback routing.
6. **Hydration Error #418 & Volatile Date Resolution**:
   - Resolved React Hydration Error #418 by matching shell layout DOM (admin shell without header/footer vs public shell) and locale text nodes.
   - Resolved volatile date mismatches between build-time UTC ISO dates and client local dates: `initialDraft()` and `FlightSearchForm` initialize with deterministic empty values (`""`) during prerendering, populated safely on client mount via `useEffect`. Zero `suppressHydrationWarning` used.
7. **Deployment Reality**: Local build and static simulation verified. Live upload to HostPapa hosting remains unexecuted pending Phase 12 production certification.

---

## 7. Empirical Verification & Measured Baseline Evidence

### 7.1 Independent Codex Browser Evidence (Spot Check)

Codex ran Playwright against the local Vite dev server across mobile (**390x844**, **390x900**) and desktop (**1280x900**) viewports:

- **Routes Sampled**:
  - Public: `/`, `/ar`, `/flights`, `/ar/flights`, `/book`, `/ar/book`, `/destinations`, `/ar/destinations`, `/destinations/AMM`, `/ar/destinations/AMM`, `/gallery`, `/ar/gallery`, `/manage`, `/ar/manage`, `/account`, `/ar/account`, `/airport`, `/ar/airport`.
  - Admin (after setting mock admin identity `adm-1` in `localStorage`): `/admin/signin`, `/ar/admin/signin`, `/admin`, `/ar/admin`, `/admin/flights`, `/ar/admin/flights`, `/admin/bookings`, `/ar/admin/bookings`, `/admin/check-in`, `/ar/admin/check-in`, `/admin/website`, `/ar/admin/website`, `/admin/analytics`, `/ar/admin/analytics`.
- **Directionality & Overflow**: Confirmed that `document.documentElement.scrollWidth <= innerWidth` across all sampled requests (no page-level horizontal scrollbar blowout). Document `lang`/`dir` matched the URL locale (`lang="en" dir="ltr"` on English routes; `lang="ar" dir="rtl"` on Arabic routes).
- **Visible Headings & Accessibility Scope**: Localized visible `<h1>` headings appeared on primary content pages; however, some auth/account pages lacked a visible H1 in the immediate sampled DOM. Full heading hierarchy, interactive states, and screen-reader accessibility remain open for Phase 8.
- **Evidence Artifacts**:
  - `.ai/antigravity-runs/20260918-phase-0-baseline/codex-ar-home-390.png`
  - `.ai/antigravity-runs/20260918-phase-0-baseline/codex-ar-signin-1280.png`
  - `.ai/antigravity-runs/20260918-phase-0-baseline/codex-ar-admin-bookings-390.png`
  - Additional Playwright console logs and DOM snapshots in `.ai/antigravity-runs/20260918-phase-0-baseline/codex-playwright-artifacts/` and `codex-playwright-artifacts-2/`.
- **Scope Note**: This represents an independent spot check of 32 sampled route paths (18 public, 14 admin), not complete Phase 8 visual/interaction certification.

### 7.2 Two Concrete Observed Risks & Technical Investigations

1. **English Document Titles Across Arabic Public Pages**:
   - **Observation**: While visible page headings were in Arabic, Arabic public routes produced English `<title>` text on `/ar`, `/ar/flights`, `/ar/book`, `/ar/destinations`, `/ar/destinations/AMM`, `/ar/gallery`, `/ar/manage`, `/ar/account`, and `/ar/airport`. In contrast, sampled Arabic admin titles were properly localized.
   - **Root Cause**: Public route definitions use static `head: () => ({ meta: [ { title: "..." } ] })` without reading `params.locale`. In contrast, `{-$locale}.admin_.signin.tsx` uses the `pageHead({ locale: params.locale, en: {...}, ar: {...} })` helper.
   - **Action**: Recorded under Phase 7 (Bilingual Certification) and Phase 12 (SEO Production Certification) metadata parity debt.
2. **Date Input Hydration Attribute Mismatch on `/ar`**:
   - **Observation**: Loading `/ar` once logged a React hydration attribute mismatch in `FlightSearchForm` around the flight-search date inputs at the UTC/local date boundary (`min` differed between server and client around the 2026-09-17/18 boundary, and `caret-color` appeared in the DOM diff).
   - **Investigation Findings**:
     - `initialDraft()` in `src/lib/store.tsx` sets default `departDate` using `new Date().toISOString().slice(0, 10)` (UTC timestamp).
     - `todayISO()` in `src/lib/data.ts` uses local calendar date getters (`getFullYear()`, `getDate()`).
     - **Confirmed Date-Basis Conflict**: When SSR runs in UTC or requests cross midnight boundaries (e.g. 22:54 UTC vs. 01:54 UTC+3 local time), `min="2026-09-18"` conflicts with `value="2026-09-17"`.
     - **Unconfirmed Complete Cause**: A later repeat visit to `/ar` did **not** reproduce the warning. The warning's complete cause remains unconfirmed, and asserting that `caret-color: transparent` was injected by browser user-agent date-picker styling is unsupported.
   - **Action**: No booking code is altered in Phase 0 without reproduction and a proven fix. The date conflict is mapped to Phase 5 (public booking workflow) and SSR behavior to Phase 1 investigation.

### 7.3 Semantic Lint Gate Separation & Formatting Debt

- **ESLint Configuration Update**: Updated `eslint.config.js` to use `eslint-config-prettier` instead of `eslint-plugin-prettier/recommended`. This preserves all substantive TypeScript, JavaScript, and React hooks rules while suppressing formatting rule conflicts without turning Prettier code-wrap deviations into ESLint errors.
- **Semantic Lint Gate**: `bun.cmd run lint` (`eslint .`) passes cleanly with exit code 0 (**0 errors**, 43 `react-refresh/only-export-components` warnings).
- **Formatting Debt Check**: Added `"format:check": "prettier --check ."` to `package.json`. It runs Prettier independently and documents remaining code-wrap formatting debt across repository files without blocking the semantic lint gate.
