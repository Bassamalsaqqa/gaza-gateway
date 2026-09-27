# System Architecture — Gaza Airport & Palestinian Airlines

> **Repository**: `Bassamalsaqqa/gaza-gateway`
> **Production Domain**: `https://www.gazaairport.com`
> **Phase 4 starting commits**: `9e36b869274830f84c97cbbefe3b3fb0a98c6d2e` (`main`); `92ad935f8477e1663eefa8282d2770c66b64b8b2` (`hostpapa-deploy`). These are historical starting points, not current branch heads.
> **Engineering Status**: **Phase 4B Complete — typed editorial content foundation**
> **Immediate Next Step**: **Phase 4C — Settings & Appearance Store Convergence**

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
| **State & Cache Layer** | React Context & Query | React Query 5.101.1 | `<QueryClientProvider>` and `<RepositoryProvider>` mounted at root; hierarchical query keys (`bookingKeys`, `flightKeys`), repository hooks (`useBookingsQuery`, `useBookingQuery`, `useFlightsQuery`, `useFlightQuery`, etc.). |

---

## 2. Canonical Domain & Repository Architecture (Phase 4 Reality)

Phase 4 resolved pre-existing public/admin state disconnects by introducing two backend-ready, bounded domain aggregates with asynchronous contracts, persistent schema `gza.repo.v1`, and central React Query hooks. Phase 4.0.1 confirmed that successful empty and missing booking queries remain authoritative in migrated list, detail, search, and confirmation views:

### 2.1 The Two Canonical Repositories
1. **`BookingRepository` (`src/lib/repositories/booking-repository.ts`)**:
   - Single source of truth and single writer for the Booking aggregate.
   - Enforces bookability invariants, deterministic stable passenger IDs (`pax-${ref}-${index}`), and fixture isolation.
   - Backed by `gza.repo.v1` with idempotent migration from legacy `gza.store.v1`.
   - Losslessly adapted for legacy admin table/detail views via `bookingToMockBooking()`.
2. **`FlightRepository` (`src/lib/repositories/flight-repository.ts`)**:
   - Manages deterministic flight schedules composed with mutable operational flight overrides via pure `getEffectiveFlight()`.
   - Stores overrides in `gza.repo.v1` (`flightOverrides`).
   - Reflects operational gate and status revisions (e.g. Delayed, B7) across public flight boards, flight detail, and admin dispatch views.
   - Prevents synthetic scenario flights (`CAP-PROOF-*`) from leaking into live repositories.

### 2.2 Post-Phase-4 Ownership Matrix

| Aggregate / Entity | Primary Writer | Primary Storage Key | Consumers (Public & Admin) | Phase 4 Boundary | Future Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Booking** | `BookingRepository` | `gza.repo.v1` (`bookings[]`) | Public confirmation, Manage Booking, Admin Bookings table/detail/search | **Canonical Repository** | Phase 5/6 |
| **Flight Overrides** | `FlightRepository` | `gza.repo.v1` (`flightOverrides{}`) | Public flight board/detail, Admin flights/dashboard | **Canonical Repository** | Phase 6 |
| **Flight Schedules** | `src/lib/data.ts` (deterministic generator) | In-memory reference | `FlightRepository`, flight search, route generation | **Preserved Baseline** | Phase 6 |
| **Booking Draft** | `src/lib/store.tsx` (`useStore`) | `gza.store.v1` (`draft`) | Public Booking Wizard (`/book`) | **Preserved Legacy Key** | Phase 5 |
| **Account & Travelers** | `src/lib/store.tsx` (`useStore`) | `gza.store.v1` (`account`, `travelers`) | Passenger Account (`/account/*`), Manage Booking | **Preserved Legacy Key** | Phase 5 |
| **Staff Session** | `src/lib/admin-store.tsx` (`useAdmin`) | `gza.admin.v1` (`staffId`) | Admin Shell, permission guards, role switcher | **Preserved Legacy Key** | Phase 6 |
| **OpsState (Simulation)**| `src/lib/admin-store.tsx` (`ops`, `patchOps`) | In-memory React state | Operations Dashboard, Turnaround timers | **Preserved Session Simulation** | Phase 6 |
| **Published Home, Travel, Past editorial** | `src/content/published/` | Compiled typed source | Public Home, Travel, Airport Past; selected Admin read panels | **Canonical Published Content** | Phase 7 broader coverage |
| **Local editorial draft** | `ContentRepository` | `gza.content.draft.v1` | Explicit preview and Admin Travel editor | **Browser-local, not published** | Future backend publication |
| **Other CMS & stories** | Route/i18n source and `src/lib/admin-mock.ts` | Compiled source and static fixtures | Present, Future, About, Contact, destinations, archive | **Not yet converged** | Phase 7 |
| **Appearance & Skin** | `src/lib/skin.ts` | `gza.skin.preview.v1` | Appearance Studio (`/admin/settings?tab=appearance`) | **Preserved Preview Key** | Phase 4C |

### 2.3 Simulation Boundary & Security Declarations

- **Staff and Passenger Authentication**: Pure client-side simulation. Mock passphrases and email logins set local state tokens.
- **Financial & Booking Mutations**: No real payment gateway, payment card processor, or banking API is integrated. Payment card inputs are simulated and discarded.
- **Privacy & Secrets**: Zero real secrets, API keys, private customer PII, or mutation endpoints belong in client bundles or repositories.
- **React Query Status**: Centralized query keys (`bookingKeys`, `flightKeys`) and reactive subscription invalidation ensure public and admin views stay synchronized without full-page reloads.

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
5. **Content Edits**: Home, Travel and Past compiled records are typed under `src/content/published/`. Admin Travel drafts are browser-local and never publish globally. Approved publication requires a source update and verified static release.

---

## 5. Durable Local Regression Foundation

Phase 3.9 and Phase 4 established a permanent, lightweight local test foundation using Node 24 native capabilities:

- **Unit Test Runner**: `npm test` runs `node --test --experimental-strip-types tests/unit/*.test.ts`. Phase 4B adds content validation and draft repository tests. Counts are release measurements, not architecture constants.
  - `repositories.test.ts`: Canonical normalization, deterministic stable passenger IDs, pure flight override composition, synthetic fixture detection, idempotent legacy store migration (`gza.store.v1`, `gza.admin.v1`), corruption recovery, booking repository CRUD and subscriber notifications, flight repository overrides, and central query key factory stability.
  - `booking-rules.test.ts`: Operational status semantics, departure clock checks, inventory limits, localized label mapping, and flight-detail bookability guards.
  - `draft-recovery.test.ts`: Passenger details preservation across search criteria adjustments, stale flight clearance, seat clearance, and step gating.
  - `surface-grammar.test.ts`: Target ID validation, family inheritance vs component overrides, media truth filtering, and config sanitization.
  - `studio-protocol.test.ts`: Message schema parsing, version validation (`1.0.0`), route traversal protection (`isValidStudioRoutePath`).
  - `i18n-parity.test.ts`: 100% key parity between English and Arabic dictionaries across public, admin, and admin2 catalogs.
- **Browser Smoke Test**: `npm run test:smoke` runs `tests/smoke/browser-smoke.mjs` using Playwright with system Edge/Chrome. Phase 4B adds bilingual Travel draft, preview, published immunity and discard proof to prior checks:
  - English & Arabic public homepages (`/`, `/ar`)
  - Booking wizard & capacity proof (`/book`, `/ar/book`)
  - URL scenario isolation proof (`/book?scenario=...`, `/ar/book?scenario=...`)
  - Admin Appearance Studio & controls interaction (`/admin/settings?tab=appearance`)
  - Arabic Appearance Studio & RTL arrow navigation (`/ar/admin/settings?tab=appearance`)
  - Flight detail bookability & unbookable states (`/flight/*`)
  - Arabic flight detail & technical LTR formatting (`/ar/flight/*`)
  - Cross-public/admin PNR identity proof (Check 9: PNR visible across public confirmation, admin table, and admin detail)
  - Operational flight override reflection proof (Check 10: Delayed status and revised gate reflected on public detail)

---

## 6. Completed Foundation & Remaining Work

1. **Typed Content & CMS Schema (Phase 4B complete)**:
   - Typed bilingual Home, Travel and Airport Past records; compiled published source, validated browser-local drafts and explicit preview. Full media management remains Phase 7B.
2. **Settings & Appearance Store Convergence (Phase 4C)**:
   - Migration of Appearance Studio preview configurations into a unified settings repository.
3. **Public Workflows Convergence (Phase 5)**:
   - Direct binding of passenger account management, saved companions, and public booking wizard state into repository queries and mutations.
4. **Admin Workflows Convergence (Phase 6)**:
   - Direct repository binding for operational flight dispatch, schedule master templates, check-in desk, customer CRM, and activity logs.
5. **SEO & Head Metadata Parity (Phase 11)**:
   - Arabic homepage `<title>` and `<meta name="description">` parity.
   - Comprehensive OpenGraph and Twitter card metadata for Arabic routes.
   - Automated `sitemap.xml` and `robots.txt` generation.
   - Structured JSON-LD metadata for airline and airport entities.
6. **Backend Readiness & API Contracts (Phase 12–13)**:
   - Server-side database, authenticated REST/tRPC endpoints, and live payment processing.
