# HostPapa Deployment Architecture & Verification Guide

> **Current Status**: **Phase 1 Static Implementation Complete (Ready for Codex Review)**.
> **Deployable Artifact**: `dist/client/` produced by `bun.cmd run build:hostpapa`.
> **Deployment Reality**: Local build and static simulation verified. **No live deployment to HostPapa hosting has occurred yet.**

---

## 1. Package & Static Build Architecture

To satisfy the HostPapa shared cPanel hosting constraint (`public_html/` static file serving with zero persistent Node.js, Bun, Nitro, or SSR daemon), Phase 1 implemented a dedicated, decoupled static build pipeline while leaving the default Lovable SSR build and editor sync untouched:

- **Framework**: TanStack Start (`@tanstack/react-start` `1.168.32`, `@tanstack/react-router` `1.170.18`, `@tanstack/router-plugin` `1.168.23`).
- **Config Wrapper**: `@lovable.dev/vite-tanstack-config` `^2.20.0` with Vite `8.1.5`.
- **Dedicated Build Config**: `vite.config.hostpapa.ts`
  - Configures `nitro: false`.
  - Disables SPA wrapper injection (`spa: { enabled: false }`) to manage dedicated prerendered shells explicitly.
  - Configures TanStack Start crawler and explicit `prerender.pages` for all 42 public pages and 4 targeted application shells.
- **Normal Build Unchanged**: `vite.config.ts` remains 100% untouched for Lovable editor compatibility and normal SSR builds (`bun.cmd run build` emits Cloudflare/Nitro SSR bundle into `.output/`).
- **HostPapa Build Command**:
  ```bash
  bun.cmd run build:hostpapa
  ```
  (Backed by `package.json`: `"build:hostpapa": "vite build --config vite.config.hostpapa.ts"`).

---

## 2. Deployable Artifact Structure (`dist/client/`)

Running `bun.cmd run build:hostpapa` generates a pure static directory under `dist/client/`:

- **Static Pages (46 HTML files total)**:
  - **42 Public Content Pages** (21 English + 21 Arabic): Full semantic HTML rendered at build time with route-specific content, metadata, and appropriate `lang` / `dir` attributes (`lang="en" dir="ltr"` vs `lang="ar" dir="rtl"`).
  - **4 Targeted Application Shells**: Pre-booted HTML templates for client-side routing.
- **Static Assets (`dist/client/assets/`)**:
  - Code-split JavaScript bundles (`.js`) and complete Tailwind CSS (`.css`).
- **Apache Configuration**:
  - `dist/client/.htaccess` (automatically copied from `public/.htaccess` during build).
- **Server Bundle Status**:
  - `dist/server/` is generated temporarily during the build to execute static prerendering, but **is not required at runtime** and **is not deployed to HostPapa**.
  - HostPapa shared hosting receives **only the contents of `dist/client/`**.

---

## 3. Prerender & Shell Coverage Matrix

### 3.1 Prerendered Public Routes (42 Pages)

All 42 public routes emit substantive HTML (not blank shells) with exact `lang` and `dir` attributes:

| Route Path                                       | Language | Direction | Prerender Type                    |
| :----------------------------------------------- | :------- | :-------- | :-------------------------------- |
| `/`, `/ar`                                       | EN / AR  | LTR / RTL | Root Homepage                     |
| `/flights`, `/ar/flights`                        | EN / AR  | LTR / RTL | Flights Schedule & Search         |
| `/destinations`, `/ar/destinations`              | EN / AR  | LTR / RTL | Destinations Directory            |
| `/destinations/{AMM,CAI,IST,DOH,DXB,JED,RUH}`    | EN       | LTR       | 7 Destination Detail Pages        |
| `/ar/destinations/{AMM,CAI,IST,DOH,DXB,JED,RUH}` | AR       | RTL       | 7 Arabic Destination Detail Pages |
| `/airport`, `/ar/airport`                        | EN / AR  | LTR / RTL | Airport Overview                  |
| `/airport/past`, `/ar/airport/past`              | EN / AR  | LTR / RTL | Airport History (1998–2001)       |
| `/airport/present`, `/ar/airport/present`        | EN / AR  | LTR / RTL | Airport Present State             |
| `/airport/future`, `/ar/airport/future`          | EN / AR  | LTR / RTL | Airport Future Vision             |
| `/gallery`, `/ar/gallery`                        | EN / AR  | LTR / RTL | Historical & Visual Gallery       |
| `/travel`, `/ar/travel`                          | EN / AR  | LTR / RTL | Passenger Travel Guide            |
| `/about`, `/ar/about`                            | EN / AR  | LTR / RTL | About Palestinian Airlines        |
| `/contact`, `/ar/contact`                        | EN / AR  | LTR / RTL | Contact & Station Directory       |
| `/privacy`, `/ar/privacy`                        | EN / AR  | LTR / RTL | Privacy Policy                    |
| `/terms`, `/ar/terms`                            | EN / AR  | LTR / RTL | Conditions of Carriage & Terms    |
| `/book`, `/ar/book`                              | EN / AR  | LTR / RTL | Flight Booking Engine             |

### 3.2 Targeted Application Shells (4 Pages)

To prevent React Hydration Error #418 and locale flashing on dynamic and admin routes, four distinct shells are prerendered:

| Shell File             | Source Prerender Page      | Initial Locale & Chrome                                                                             | Target Dynamic URL Namespace                                                                                                     |
| :--------------------- | :------------------------- | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `_shell.html`          | `/?shell=1`                | English LTR, Public Chrome (`<header>`, `<footer>`)                                                 | Public English dynamic routes (`/manage/*`, `/account/*`, `/booking-confirmation/*`, `/boarding-pass/*`, unknown 404s)           |
| `ar/_shell.html`       | `/ar?shell=1`              | Arabic RTL, Public Chrome (`<header>`, `<footer>`)                                                  | Public Arabic dynamic routes (`/ar/manage/*`, `/ar/account/*`, `/ar/booking-confirmation/*`, `/ar/boarding-pass/*`, Arabic 404s) |
| `admin/_shell.html`    | `/admin/signin?shell=1`    | English LTR, Clean Admin Shell (`SiteFrame` renders `<Outlet />` directly, no public header/footer) | English admin routes (`/admin`, `/admin/*`)                                                                                      |
| `ar/admin/_shell.html` | `/ar/admin/signin?shell=1` | Arabic RTL, Clean Admin Shell (`SiteFrame` renders `<Outlet />` directly, no public header/footer)  | Arabic admin routes (`/ar/admin`, `/ar/admin/*`)                                                                                 |

---

## 4. Root Cause Analysis & Hydration Fixes

### 4.1 React Hydration Error #418 & Locale Flash

During spike validation, direct loads to `/ar/admin/signin`, `/admin/signin`, and `/ar/manage/ABC123` logged minified React Hydration Error #418, while Arabic routes initially loaded an English shell. Root cause analysis revealed three distinct issues:

1. **DOM Tree Mismatch (Public vs. Admin Layout)**:
   - The original single `_shell.html` included the public site frame (`<header>` and `<footer>`).
   - Admin routes (such as `/admin/signin` and `/admin/*`) match layouts where `SiteFrame` returns `<Outlet />` without public headers or footers.
   - When React hydrated an admin route against `_shell.html`, the client expected no header/footer while the DOM contained `<header>` and `<footer>`, triggering React Error #418 (`args[] = HTML`).
2. **Text Node Mismatch & Locale Flash**:
   - Serving `_shell.html` (`lang="en" dir="ltr"`) for `/ar/*` routes caused an immediate visual flash of English navigation and layout direction.
   - During hydration, React hydrated Arabic text nodes against English DOM nodes, triggering React Error #418 (`args[] = text`).
3. **Volatile Date Mismatch**:
   - `initialDraft()` in `src/lib/store.tsx` evaluated `new Date().toISOString().slice(0, 10)` (UTC timestamp) during build-time prerendering.
   - `todayISO()` in `src/lib/data.ts` evaluated local calendar date getters (`getFullYear()`, `getDate()`).
   - When prerendered HTML was served days later, the build-time date became stale, violating HTML5 constraints (`value < min`) and causing hydration attribute mismatches.

### 4.2 The Solution

1. **Quad-Shell Prerendering**:
   - By prerendering four specialized shells via `vite.config.hostpapa.ts` (`/?shell=1`, `/ar?shell=1`, `/admin/signin?shell=1`, `/ar/admin/signin?shell=1`), the initial static HTML perfectly matches the layout structure and locale/direction of the requested route namespace.
2. **Deterministic Hydration-Safe Date Initialization**:
   - In `src/lib/store.tsx`, `initialDraft()` renders deterministic empty criteria: `defaultCriteria("", "")`.
   - In `src/components/flight-search-form.tsx`, `minDate` initializes to `""` during prerendering, emitting `<input type="date" value="">` with no stale build timestamp.
   - On client mount after hydration, a React `useEffect` populates volatile dates (`todayISO()` and `addDaysISO(today, 6)`), ensuring that prerendered HTML remains 100% valid indefinitely across any date or timezone boundary without using `suppressHydrationWarning` or client-only whole-site rendering.

---

## 5. Apache `.htaccess` Fallback Configuration

The static build includes `public/.htaccess`, which Vite automatically places at the root of `dist/client/.htaccess`:

```apache
# ----------------------------------------------------------------------
# HostPapa cPanel Apache Configuration for Gaza Airport / Palestinian Airlines
# Static Pre-rendered Architecture with Locale & Admin SPA Shell Fallback
# ----------------------------------------------------------------------

# Prevent directory indexing
Options -Indexes

# Set default directory index
DirectoryIndex index.html

RewriteEngine On
RewriteBase /

# 1. Existing regular files: serve directly
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

# 2. Prerendered directory index matching: /path or /path/ -> /path/index.html
# Only rewrite if an index.html actually exists in that directory.
# This ensures directories without index.html (e.g. /admin, /ar/admin) can fall through to shell rules.
RewriteCond %{DOCUMENT_ROOT}/$1/index.html -f [OR]
RewriteCond %{REQUEST_FILENAME}/index.html -f
RewriteRule ^(.*)/?$ $1/index.html [L]

# 3. Missing static assets: return 404 directly (do not serve HTML shell)
RewriteCond %{REQUEST_URI} \.(?:css|js|mjs|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|map)$ [NC]
RewriteRule ^ - [R=404,L]

# 4. Dynamic SPA fallbacks:
# Directories without index.html (like /admin, /ar/admin) and dynamic subpaths fall through here.

# 4a. Arabic Admin fallback (matches /ar/admin, /ar/admin/, /ar/admin/*)
RewriteRule ^ar/admin(?:/.*)?$ ar/admin/_shell.html [L]

# 4b. English Admin fallback (matches /admin, /admin/, /admin/*)
RewriteRule ^admin(?:/.*)?$ admin/_shell.html [L]

# 4c. Arabic Public dynamic fallback (/ar/manage/*, /ar/account/*, Arabic 404s, etc.)
RewriteRule ^ar(?:/.*)?$ ar/_shell.html [L]

# 4d. English Public dynamic fallback (/manage/*, /account/*, English 404s, etc.)
RewriteRule ^ _shell.html [L]
```

### 5.1 Apache Rule Reasoning (Specification-Level Analysis)

1. **Directories Without `index.html`**:
   `dist/client/admin/` and `dist/client/ar/admin/` are real filesystem directories holding `_shell.html`, but neither contains an `index.html`.
   Under Rule 1, only regular files (`-f`) terminate rewriting. Under Rule 2, rewriting to `.../index.html` only occurs if `index.html` is verified to exist on disk. Because neither `admin/index.html` nor `ar/admin/index.html` exists, Rule 2 does not match. Requests for `/admin`, `/admin/`, `/ar/admin`, and `/ar/admin/` successfully fall through to Rules 4a and 4b, returning the intended clean admin shell without public header/footer chrome.
2. **Trailing Slash Handling**:
   The pattern `^(.*)/?$` in Rule 2 normalizes paths with or without a trailing slash (e.g. `/flights` vs `/flights/`) to `flights/index.html`. For admin paths, `^admin(?:/.*)?$` matches `/admin`, `/admin/`, and `/admin/signin`.
3. **Asset 404 Protection**:
   Rule 3 prevents rewrite loops and MIME-type errors by issuing a direct 404 status for missing files matching common static asset extensions.

---

## 6. Verification Results: Static Simulation & Real Browser Testing

### 6.1 Static Server Route Matrix (44 Paths Tested)

A local Node.js static server accurately modeling the updated Apache rules was executed against `dist/client/`:
- **Prerendered Public Routes (with and without trailing slash)**: `/`, `/ar`, `/ar/`, `/flights`, `/flights/`, `/ar/flights`, `/ar/flights/`, `/destinations`, `/destinations/`, `/destinations/AMM`, `/destinations/AMM/`, `/ar/destinations/AMM`, `/ar/destinations/AMM/`, `/airport`, `/ar/airport`, `/gallery`, `/ar/gallery`, `/contact`, `/ar/contact`, `/book`, `/ar/book`.
  - **Result**: HTTP 200 via Rule 2 (`Directory index.html`).
- **Directories Without Index (`/admin`, `/ar/admin`)**:
  - `/admin`, `/admin/`, `/admin/signin`, `/admin/bookings` -> HTTP 200 via Rule 4b (`admin/_shell.html`).
  - `/ar/admin`, `/ar/admin/`, `/ar/admin/signin`, `/ar/admin/bookings` -> HTTP 200 via Rule 4a (`ar/admin/_shell.html`).
- **Dynamic Public Routes**:
  - `/manage/ABC123`, `/booking-confirmation/ABC123`, `/boarding-pass/ABC123/out/0`, `/account`, `/account/trips` -> HTTP 200 via Rule 4d (`_shell.html`).
  - `/ar/manage/ABC123`, `/ar/booking-confirmation/ABC123`, `/ar/boarding-pass/ABC123/out/0`, `/ar/account`, `/ar/account/trips` -> HTTP 200 via Rule 4c (`ar/_shell.html`).
- **Missing Assets & Unknown Routes**:
  - Missing `.js`, `.css`, `.png` assets returned HTTP 404 (not HTML).
  - Unknown paths (`/unknown-route-12345`, `/ar/unknown-route-12345`) returned HTTP 200 with corresponding shells for TanStack Router 404 handling.

### 6.2 Real Headless Google Chrome Browser Verification

Using Google Chrome (`152.0.7977.84`) via Chrome DevTools Protocol (CDP), real browser navigations and client JavaScript hydration were tested against the static server output across 19 representative routes:

| Route Path | Type | Verified `lang` | Verified `dir` | Console Errors | React #418 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Prerendered English Home | `en` | `ltr` | `0` | **False** |
| `/ar` | Prerendered Arabic Home | `ar` | `rtl` | `0` | **False** |
| `/flights` | Prerendered Flights | `en` | `ltr` | `0` | **False** |
| `/ar/flights` | Prerendered Arabic Flights | `ar` | `rtl` | `0` | **False** |
| `/book` | Prerendered Booking Engine | `en` | `ltr` | `0` | **False** |
| `/ar/book` | Prerendered Arabic Booking | `ar` | `rtl` | `0` | **False** |
| `/destinations/AMM` | Prerendered Destination Detail | `en` | `ltr` | `0` | **False** |
| `/manage/ABC123` | Dynamic Public English | `en` | `ltr` | `0` | **False** |
| `/ar/manage/ABC123` | Dynamic Public Arabic | `ar` | `rtl` | `0` | **False** |
| `/booking-confirmation/GZA-7K8P` | Dynamic Confirmation English | `en` | `ltr` | `0` | **False** |
| `/ar/booking-confirmation/GZA-7K8P` | Dynamic Confirmation Arabic | `ar` | `rtl` | `0` | **False** |
| `/admin/signin` | English Admin Sign-in | `en` | `ltr` | `0` | **False** |
| `/ar/admin/signin` | Arabic Admin Sign-in | `ar` | `rtl` | `0` | **False** |
| `/admin` | English Admin Root | `en` | `ltr` | `0` | **False** |
| `/admin/` | English Admin Trailing Slash | `en` | `ltr` | `0` | **False** |
| `/ar/admin` | Arabic Admin Root | `ar` | `rtl` | `0` | **False** |
| `/ar/admin/` | Arabic Admin Trailing Slash | `ar` | `rtl` | `0` | **False** |
| `/admin/flights` | English Admin Dashboard | `en` | `ltr` | `0` | **False** |
| `/ar/admin/flights` | Arabic Admin Dashboard | `ar` | `rtl` | `0` | **False** |

**Conclusion**: Across all 19 tested pages, **zero console errors** were logged, **zero React hydration mismatches** occurred, and all Arabic pages initialized directly in Arabic/RTL without flashing English or LTR chrome.

---

## 7. Deployment Instructions for HostPapa

When deployment authorization is granted:

1. **Build the static artifact locally**:
   ```bash
   bun.cmd run build:hostpapa
   ```
2. **Deployable Files**:
   - Upload the entire contents of `dist/client/` (including `dist/client/.htaccess`) into the HostPapa cPanel `public_html/` directory.
3. **DO NOT UPLOAD**:
   - `dist/server/` (build-time prerender helper only)
   - `.git/` (git history)
   - `.ai/` (agent run logs)
   - `src/` (source code)
   - `node_modules/`
   - `.env`, `.env.local`

---

## 8. What Remains Unverified

1. **Live Apache Environment Certification**:
   No local Apache executable is installed on this Windows environment, and no live deployment to HostPapa shared hosting has occurred. While the rewrite rules are verified by rule-level reasoning and accurate simulation, real Apache server behavior on HostPapa (including cPanel `mod_rewrite` overrides and server configuration) will be certified during Phase 12.
2. **Automated Git Deployment / Packaging**:
   Automated Git-based deployment workflows (e.g. tracking prebuilt assets or release tags) remain undecided and are intentionally not implemented in Phase 1.
