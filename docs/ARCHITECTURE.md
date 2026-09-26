# System Architecture — Gaza Airport & Palestinian Airlines

> **Repository**: `Bassamalsaqqa/gaza-gateway`
> **Production Domain**: `https://www.gazaairport.com`
> **Baseline Commit**: `1f49869ca83c82d23dcb4396a06b81e30843da54` (source main); `2ecf3577356e257d2e05ccb84d73c95e32fa7d97` (hostpapa-deploy release baseline)
> **Engineering Status**: **Phase 3.9 Complete (System Stabilization & Source-of-Truth Reset Complete, Ready for Codex Review)**
> **Immediate Next Step**: **Phase 4 — Canonical Mock Domain & Repository Layer**

---

## 1. Technical Stack & Build Environment

| Layer | Technology | Version | Purpose & Implementation Reality |
| :--- | :--- | :--- | :--- |
| **Runtime & Test Runner** | Node.js / npm | Node v24.12.0 / npm 11.11.0 | Built-in test runner (`node --test --experimental-strip-types`), `package.json` scripts (`npm test`, `npm run test:smoke`). |
| **Frontend Framework** | React | 19.2.0 | Component hierarchy, hooks, context providers. |
| **Routing & SSR Engine** | TanStack Start / Router | Router 1.170.18 / Start 1.168.32 | File-based flat routing, route loaders, SSR hydration, head management. Auto-generated `src/routeTree.gen.ts`. |
| **Bundler & Build Tool** | Vite / Nitro | Vite 8.1.5 / Nitro 3.0.260603-beta | Multi-target build configurations: SSR Cloudflare/Nitro (`npm run build`) and pure static HostPapa artifact (`npm run build:hostpapa`). |
| **Styling & Design Tokens** | Tailwind CSS | 4.2.1 | CSS variables (`@theme inline`), oklch tokens in `src/styles.css`, semantic typography (`.type-*`), RTL cursive protection. |
| **Component Primitives** | Radix UI Headless | Various (^1.1 - ^2.2) | Accessible headless primitives (`RadioGroup`, `Dialog`, `AlertDialog`, `Popover`, `Select`, `Switch`, `Tabs`, `Accordion`). |
| **Icons** | Lucide React | 0.575.0 | Aviation, navigation, and UI control icons. |
| **State & Cache Layer** | React Context & Query | React Query 5.101.1 | `<QueryClientProvider>` mounted in root shell; application state currently held in fragmented React Contexts; Phase 4 will introduce canonical query/mutation hooks. |

---

## 2. Data Layer Fragmentation & Simulation Boundaries

### 2.1 The Five State Stores (Pre-Phase 4 Reality)

The current application relies on five distinct storage singletons and in-memory caches. Phase 4 will converge these into a unified repository layer:

1. **`gza.store.v1` (`src/lib/store.tsx`)**:
   - **Storage**: Browser `localStorage`.
   - **Scope**: Public customer state: customer bookings (`bookings`), active booking draft (`draft`), customer account profile (`account`), saved travel companions (`travelers`).
   - **Consumers**: Public booking engine (`/book`), Manage Booking (`/manage`), Public Check-in (`/check-in`), Boarding Pass issuance (`/boarding-pass`), Passenger Account (`/account`).
2. **`gza.admin.v1` (`src/lib/admin-store.tsx`)**:
   - **Storage**: Browser `localStorage`.
   - **Scope**: Admin staff authentication session (`staffId`), operational quick-edits / flight overrides (`overrides: Record<string, FlightOverride>`).
   - **Limitation**: Flight overrides (status adjustments, gate reassignments, revised departure times) apply only to views consuming `withOverride()` (Dashboard, Flight Operations). They do **not** automatically sync to `gza.store.v1` booking records or public passenger manifests.
   - **Consumers**: Admin layout (`/admin/*`), Admin Dashboard (`/admin`), Flight Operations (`/admin/flights`).
3. **`OpsState` (`src/lib/admin-ops.ts`)**:
   - **Storage**: In-memory React state within `AdminProvider` (initialized from `seedOpsState()`).
   - **Scope**: Real-time simulation metrics: turnaround timers, baggage carousel assignments, runway queue, active station alerts.
   - **Consumers**: Admin Operations Dashboard (`/admin/index.tsx`), Flight Dispatch (`/admin/flights`).
4. **`admin-mock.ts` (`src/lib/admin-mock.ts`)**:
   - **Storage**: Static in-memory mock datasets.
   - **Scope**: Customer CRM records, staff rosters, schedule master templates, system audit logs, and analytics metrics.
   - **Consumers**: Customer Directory (`/admin/customers`), Staff Management (`/admin/staff`), Schedules (`/admin/schedules`), Analytics (`/admin/analytics`), Activity Log (`/admin/activity`).
5. **`gza.skin.preview.v1` (`src/lib/skin.ts`)**:
   - **Storage**: Browser `localStorage`.
   - **Scope**: Appearance Studio authored surface skin and grammar configuration.
   - **Strict Isolation**: Consumed **only** when `skinPreview=1` query parameter is explicitly present in the URL. Normal visitors on ordinary URLs (`/`, `/book`, etc.) completely ignore this key and render the committed default skin (`pie-factory`, `DEFAULT_SURFACE_GRAMMAR_CONFIG`).

### 2.2 Simulation Boundary & Security Declarations

- **Staff and Passenger Authentication**: Pure client-side simulation. Mock passphrases and email logins set local state tokens.
- **Financial & Booking Mutations**: No real payment gateway, payment card processor, or banking API is integrated. Payment card inputs are simulated and discarded.
- **Privacy & Secrets**: Zero real secrets, API keys, private customer PII, or mutation endpoints belong in client bundles or repositories.
- **React Query Status**: `@tanstack/react-query` is mounted at root, but application data fetching currently uses direct synchronous context state. Phase 4 will introduce async repository contracts, query keys, and mutation hooks.

---

## 3. Startup Bundle Isolation & Surface Architecture

### 3.1 Runtime vs Editor Separation

In Phase 3.9, the surface system was split to eliminate startup bundle bloat:

- **Lightweight Runtime (`src/design/surfaces/runtime-targets.ts`)**:
  - Contains only target type identifiers (`TargetId`), semantic family mapping (`TARGET_FAMILY_MAP`), media allowance policy (`TARGET_MEDIA_ALLOWED`), canonical truth class allowlists, and recipe resolution logic (`resolveTargetRecipe`, `sanitizeTargetOverride`).
  - **Zero imports of `MEDIA`** or editor UI metadata.
  - Loaded by ordinary public pages and `SurfaceProvider`.
- **Editor Registry (`src/design/surfaces/targets.ts`)**:
  - Contains rich authoring metadata: target labels, human descriptions, preview routes, test scenarios, and editor allowlists.
  - Imported **exclusively** by the Appearance Studio inspector (`src/components/admin/appearance-studio/`), keeping it out of the public initial JS graph.
- **Measured Bundle Impact**:
  - Root entry chunk: reduced from **465,009 bytes** (`index-dS7DcdvJ.js`) to **404,998 bytes** (`index-lGVaPZJr.js`), a **60,011 byte (~13%) net reduction**.
  - Heavy Hero Patterns catalog (~104 kB) and Appearance Studio (~91 kB) are strictly code-split into lazy chunks.
  - Public initial assets scanned: 0 traces of Studio protocol (`GZA_STUDIO_PARENT_INIT`), 0 traces of editor registry, 0 traces of Topography or Circuit Board SVG geometry.

---

## 4. Truth Classification & Media Registry

### 4.1 Canonical Media Truth Classification

All imagery across the platform is classified under three strict truth types defined in `src/lib/media.ts`:

1. **`"future-concept-ai"`**: AI-generated conceptual architectural visualizations provided by the project owner. Must always carry visible illustrative disclosure badges and notices. Never presented as historical or present evidence.
2. **`"brand-mark"`**: Official insignia, logo, and emblem assets of Palestinian Airlines and Gaza International Airport.
3. **`"placeholder"`**: Generic visual placeholders for layout testing and development.

### 4.2 Asset & Content Ingestion Protocol

Future asset and copy drops must adhere to the following protocol:
1. **Preserve Masters**: Raw master assets must be placed in source storage without destructive lossy overwrites.
2. **Classify Truth & Rights**: Every asset must have an assigned `TruthClass`, historical era, and provenance documentation before code inclusion.
3. **Generate Optimized Variants**: Build WebP variants at standard widths (`640w`, `960w`, `1280w`, `1376w`) with explicit intrinsic aspect ratios.
4. **Register in `src/lib/media.ts`**: Declare stable semantic IDs (`future-hero`, `future-aerial-day`, etc.) and bilingual accessible alt text (`altEn`, `altAr`).
5. **Content Edits**: Small copy edits proceed via source updates; Phase 4B will introduce canonical typed content records.

---

## 5. Durable Local Regression Foundation

Phase 3.9 established a permanent, lightweight local test foundation using Node 24 native capabilities:

- **Unit Test Runner**: `npm test` runs `node --test --experimental-strip-types tests/unit/*.test.ts` (58 tests across 25 suites, ~150ms execution time, zero external dependencies).
  - `booking-rules.test.ts`: Operational status semantics, departure clock checks, inventory limits, and localized label mapping.
  - `draft-recovery.test.ts`: Passenger details preservation across search criteria adjustments, stale flight clearance, seat clearance, and step gating.
  - `surface-grammar.test.ts`: Target ID validation, family inheritance vs component overrides, media truth filtering, and config sanitization.
  - `studio-protocol.test.ts`: Message schema parsing, version validation (`1.0.0`), route traversal protection (`isValidStudioRoutePath`).
  - `i18n-parity.test.ts`: 100% key parity between English and Arabic dictionaries across public, admin, and admin2 catalogs.
- **Browser Smoke Test**: `npm run test:smoke` runs `tests/smoke/browser-smoke.mjs` using Playwright with system Edge/Chrome (verifying `/`, `/ar`, `/book`, `/ar/book`, and `/admin/settings?tab=appearance`).

---

## 6. Known Technical Gaps (Scheduled for Future Phases)

1. **SEO & Head Metadata Parity (Phase 11)**:
   - Arabic homepage `<title>` and `<meta name="description">` parity.
   - Comprehensive OpenGraph and Twitter card metadata for Arabic routes.
   - Automated `sitemap.xml` and `robots.txt` generation.
   - Structured JSON-LD metadata for airline and airport entities.
2. **Repository Convergence (Phase 4)**:
   - Migration from direct `localStorage` access to unified repository hooks.
   - Real-time cross-store synchronization between admin flight dispatch and public booking results.
