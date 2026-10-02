# System Architecture — Gaza Airport & Palestinian Airlines

> **Repository**: `Bassamalsaqqa/gaza-gateway`
> **Production Domain**: `https://www.gazaairport.com`
> **Engineering Status**: **Phase 5C and HC-2 (Historical Archive Publication & Documentary Foundation) ACCEPTED SOURCE on main.** Phase 5 overall remains in progress; Phase 5A, 5B, 5C, HC-0, HC-1, and HC-2 complete/accepted on `main`; Phase 5D (Public Contact Workflow Convergence) and HC-3 planned and unstarted. Packaging and pushing `hostpapa-deploy` does not constitute a live deployment; live deployment remains on Phase 5B.
> **Immediate Next Step**: Phase 5D — Public Contact Workflow Convergence (planned/unstarted).

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
| **State & Cache Layer** | React Context & Query | React Query 5.101.1 | `<QueryClientProvider>` and `<RepositoryProvider>` mounted at root; hierarchical query keys (`bookingDraftKeys`, `bookingKeys`, `flightKeys`, `passengerKeys`), repository hooks (`useBookingDraftQuery`, `useUpdateBookingDraftMutation`, `useBookingsQuery`, `useFlightSearchQuery`, `useBookingEffectiveFlights`, etc.). |

---

## 2. Canonical Domain & Repository Architecture (Phase 4, 5A, 5B & 5C Reality)

Phase 4 resolved pre-existing public/admin state disconnects by introducing two backend-ready, bounded domain aggregates with asynchronous contracts, persistent schema `gza.repo.v1`, and central React Query hooks. Phase 4.0.1 confirmed canonical booking authority in admin views. Phase 5A converged passenger identity, account state, and saved travelers into a canonical `gza.passenger.v1` store managed by `PassengerRepository`. Phase 5B converged booking draft state into `BookingDraftRepository` (`gza.booking.draft.v1`) and connected public flight discovery directly to `FlightRepository`. Phase 5C converges public Manage Trip, Check-in, and Boarding Pass surfaces onto canonical repositories and effective flights:

### 2.1 The Canonical Repositories
1. **`BookingDraftRepository` (`src/lib/booking-draft/repository.ts`)**:
   - Single source of truth and single writer for the active booking wizard draft.
   - Backed by `gza.booking.draft.v1` (`{ schemaVersion: 1, status: "active" | "cleared", revision, updatedAt, source, draft }`).
   - Implements 5 distinct storage states (`missing`, `active`, `cleared`, `malformed`, `unavailable`), one-time migration from `gza.store.v1.draft`, and tombstone anti-resurrection.
   - Serialized mutation queue prevents lost updates during concurrent edits.
   - Synchronizes across browser tabs via `storage` events without echo write loops.
2. **`BookingRepository` (`src/lib/repositories/booking-repository.ts`)**:
   - Single source of truth and single writer for completed bookings.
   - Enforces bookability invariants, deterministic stable passenger IDs (`pax-${ref}-${index}`), and fixture isolation.
   - `create` executes inside a shared coordinator transaction, re-resolves effective flights against live `flightOverrides`, checks station clock departure cutoffs and inventory capacity, and enforces idempotency via client `submissionId`.
   - Exposes bounded, typed command methods for public passenger operations: `cancel`, `updateContact`, `updateSeats`, `updateExtras`, and `completeCheckIn`.
   - Each command validates within the shared coordinator transaction, prevents mutations on cancelled bookings, enforces checked-in seat protection in `updateSeats`, recalculates totals using canonical pricing (`bookingTotal`), and guarantees atomic rollback on storage failure.
   - Backed by `gza.repo.v1` (`bookings[]`).
3. **`FlightRepository` (`src/lib/repositories/flight-repository.ts`)**:
   - Manages deterministic flight schedules composed with mutable operational flight overrides via pure `getEffectiveFlight()`.
   - Exposes `searchFlights(origin, destination, date, options)` for bidirectional route queries with effective operational status and party capacity filtering.
   - Exposes `getMonthlyServiceMap(origin, destination, yearMonth, paxCount)` for batched calendar availability and lowest bookable fare derivation.
   - Stores overrides in `gza.repo.v1` (`flightOverrides`).
   - Powers the bounded multi-query hook `useBookingEffectiveFlights(booking)` to resolve live operational status, gates, terminals, and revised departure times for booked itineraries.
4. **`PassengerRepository` (`src/lib/passenger/repository.ts`)**:
   - Single source of truth and single writer for passenger identity, account profile/preferences, and saved companions (`Traveler[]`).
   - Backed by `gza.passenger.v1` (`{ schemaVersion: 1, account: PassengerAccount | null, travelers: Traveler[] }`) with one-time migration from `gza.store.v1` only when the canonical passenger key is absent.
   - Present empty/cleared passenger state is authoritative and never resurrects legacy store records.
   - Enforces normalized lowercase email identity, profile email immutability, and deterministic stable traveler IDs (`crypto.randomUUID()` with fallback).
   - Storage coordinator (`PassengerStorageCoordinator`): transactional writes with rollback on `StorageCommitError`, cross-tab synchronization via `storage` events, and isolated in-memory preview repository for Appearance Studio.

### 2.2 Post-Phase-5C Ownership Matrix

| Aggregate / Entity | Primary Writer | Primary Storage Key | Consumers (Public & Admin) | Phase 5C Boundary | Future Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Booking Draft** | `BookingDraftRepository` (`src/lib/booking-draft/`) | `gza.booking.draft.v1` (`schemaVersion: 1`) | Public Booking Wizard (`/book`), Flight Detail CTA (`/flight/$flightId`), Flight Search Form (`FlightSearchForm`) | **Canonical Repository** | Phase 13 (Backend Cart/Session) |
| **Passenger State (Account & Travelers)** | `PassengerRepository` (`src/lib/passenger/`) | `gza.passenger.v1` (`account`, `travelers`) | Site Header, `/account/*`, `/book` (saved traveler pickers), `/signin`, `/register`, `/verify-email`, `/account/security` | **Canonical Repository** | Phase 13 (Backend Auth & DB) |
| **Booking** | `BookingRepository` | `gza.repo.v1` (`bookings[]`) | Public confirmation, Manage Booking (`/manage/*`), Check-in (`/check-in`, `/manage/:ref/check-in`), Boarding Pass (`/boarding-pass/*`), Account Trips (`/account/trips`), Admin Bookings table/detail/search | **Canonical Repository** (typed commands: cancel, updateContact, updateSeats, updateExtras, completeCheckIn) | Phase 6 |
| **Flight Overrides** | `FlightRepository` | `gza.repo.v1` (`flightOverrides{}`) | Public flight board/detail, Public booking discovery, Calendar date picker, Manage & Boarding Pass effective flights, Admin flights/dashboard | **Canonical Repository** | Phase 6 |
| **Flight Schedules** | `src/lib/data.ts` (deterministic generator) | In-memory reference | `FlightRepository`, flight search, route generation | **Preserved Baseline** | Phase 6 |
| **Legacy Store Key** | Preserved read-only migration source | `gza.store.v1` | One-time migration to `gza.booking.draft.v1` when draft key is missing | **Closed Legacy Key**: ZERO active draft writers | Deprecated |
| **Staff Session** | `src/lib/admin-store.tsx` (`useAdmin`) | `gza.admin.v1` (`staffId`) | Admin Shell, permission guards, role switcher | **Preserved Legacy Key** | Phase 6 |
| **OpsState (Simulation)**| `src/lib/admin-store.tsx` (`ops`, `patchOps`) | In-memory React state | Operations Dashboard, Turnaround timers | **Preserved Session Simulation** | Phase 6 |
| **Published Home, Travel, Past, Present editorial** | `src/content/published/` | Compiled typed source | Public Home, Travel, Airport Past (5 source-backed verified chapters), Airport Present; selected Admin read panels | **Canonical Published Content** | Phase 7 broader coverage |
| **Historical Archive & Source Registry (HC-2)** | `src/lib/archive/` (`catalog.ts`, `sources.ts`) | Compiled typed catalog & registry | Public Gallery (`/gallery`), Home archive spotlight, Airport Past sources panel (`/airport/past`) | **Canonical Archive Foundation** (`getPublishedArchiveRecords()`, `SOURCE_REGISTRY`) | Phase 7B (Provenance Admin) |
| **Local editorial draft** | `ContentRepository` | `gza.content.draft.v1` | Explicit preview and Admin Travel editor | **Browser-local, not published** | Future backend publication |
| **Other CMS & stories** | Route/i18n source and `src/lib/admin-mock.ts` | Compiled source and static fixtures | Future, About, Contact, destinations | **Not yet converged** | Phase 7 |
| **Settings (Contact & Appearance)** | `SettingsRepository` (`src/lib/settings/`) | `gza.settings.draft.v1` | Public Contact (`?settingsPreview=1`), Appearance Studio (`?skinPreview=1`), Admin Settings | **Authoritative Settings Draft** | Phase 5D / 6 |
| **Appearance Legacy Key** | Read once for migration | `gza.skin.preview.v1` | Migrated once to canonical `gza.settings.draft.v1`; untouched; no dual writes | **Dormant Legacy Key** | Deprecated |

### 2.3 Simulation Boundary & Security Declarations

- **Staff and Passenger Authentication**: Pure client-side simulation. No live backend, database, authentication SDK, mail service, or payment gateway exists. Passenger accounts and saved companions persist locally in `gza.passenger.v1`. Password inputs are never compared, persisted, hashed, logged, or placed in URLs.
- **Financial & Booking Mutations**: No real payment gateway, payment card processor, or banking API is integrated. Payment card inputs are simulated and discarded.
- **Privacy & Secrets**: Zero real secrets, API keys, private customer PII, or mutation endpoints belong in client bundles or repositories.
- **React Query Status**: Centralized query keys (`bookingKeys`, `flightKeys`, `passengerKeys`) and reactive subscription invalidation ensure public, account, and admin views stay synchronized without full-page reloads.

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

All imagery across the platform is classified under five strict truth types defined in `src/lib/media-policy.ts`:

1. **`"future-concept-ai"`**: AI-generated conceptual architectural visualizations provided by the project owner. Must always carry visible illustrative disclosure badges and notices. Never presented as historical or present evidence.
2. **`"historical-documentary"`**: Authentic archival photography documenting Gaza International Airport and Palestinian Airlines operations (e.g. passenger terminal in 2000, Palestinian Airlines aircraft on tarmac in 2000, and documented ruins in June 2008). Never tagged with future concepts; carries authentic editorial date context (`Archive · 2000`, `Airport site · documented June 2008` / `موقع المطار · موثق في يونيو/حزيران 2008`).
3. **`"illustrative-photo"`**: Genuine illustrative aviation and editorial photography supporting public informational surfaces (e.g. destinations, travel guidelines, manage booking, check-in, passenger sign-in). Ordinary illustrative photos render cleanly without technical badges, while internal policy strictly prevents them from documentary targets like `airport.chapter-card`.
4. **`"brand-mark"`**: Official insignia, logo, and emblem assets of Palestinian Airlines and Gaza International Airport.
5. **`"placeholder"`**: Generic visual placeholders for layout testing and development.

### 4.2 Asset & Content Ingestion Protocol

Future asset and copy drops must adhere to the following protocol:
1. **Preserve Masters**: Raw master assets must be placed in source storage without destructive lossy overwrites.
2. **Classify Truth & Rights**: Every asset must have an assigned `TruthClass`, historical era, and provenance documentation before code inclusion.
3. **Generate Optimized Variants**: Build WebP variants at standard widths (`640w`, `960w`, `1280w`, `1376w`, or native bounds like `1109w`) with explicit intrinsic aspect ratios.
4. **Register in `src/lib/media.ts`**: Declare stable semantic IDs (`future-hero`, `airport-archive-hero-2000`, `airport-present-ruins-2008`, etc.) and bilingual accessible alt text (`altEn`, `altAr`).
5. **Content Edits**: Home, Travel, Past, and Present compiled records are typed under `src/content/published/`. Admin Travel drafts are browser-local and never publish globally. Approved publication requires a source update and verified static release.

### 4.3 Public Media Hero & Quick-Action Rail Architecture

- **`PublicPhotoHero` (`src/components/media/public-photo-hero.tsx`)**: Reusable bounded hero rendering responsive photography via `ResponsiveImage` (intrinsic dimensions, standard srcSet/sizes, eager loading), directional dark overlay behind localized text (EN left-to-right gradient, AR right-to-left gradient), route-specific focal positioning, authentic archival date eyebrow for historical documentary assets, and stable route markers (`data-public-hero="{routeKey}"`). Implemented across `/airport`, `/airport/past`, `/airport/present`, `/gallery`, `/destinations`, `/travel`, `/manage`, `/check-in`. Photographs are strictly never mirrored.
- **Home Utility Rail (`data-home-utility-rail="true"`)**: Single grouped rail with no gaps displaying 4 utility cards (`flight-status`, `check-in`, `travel-guidelines`, `airport-heritage`). Decorative image slices maintain seamless connectivity across all four cards by mirroring only the decorative image layer (`ltr:scale-x-[-1]`) in English LTR, while Arabic RTL keeps natural unmirrored artwork.
- **Passenger Auth Shell (`PassengerAuthShell`)**: Sign-in route (`/signin`) features an optional photographic panel (`data-auth-media="signin"`) showing `signin-photo`, desktop two-column form priority, and compact mobile photo band, preserving fallback for other auth views.

### 4.4 Historical Archive Authority & Authoritative Source Registry (HC-2)

- **Canonical Archive Authority (`src/lib/archive/`)**:
  - `ARCHIVE_CATALOG`: Bounded repository of 11 records (1 published `rec-present-ruins-2008`, 6 staging [5 video records + `past-050` photograph], 3 held for provenance, 1 excluded duplicate).
  - Public archive selector: `getPublishedArchiveRecords()` exposes only schema-valid published records with approved media references. Staging, held, excluded, or duplicate records are never exposed to public views.
  - Public Gallery (`/gallery`, `/ar/gallery`): Entirely decoupled from legacy `galleryItems`. Renders responsive media cards from `getPublishedArchiveRecords()`, supports dynamic media type and historical phase filtering, and includes a singleton-safe lightbox (Escape key, focus trap/return, scroll lock, disabled prev/next buttons when a single record is present).
  - Home Archive Spotlight: Uses `getPublishedArchiveRecords()` instead of legacy mock slices.
- **Authoritative Source Registry (`SOURCE_REGISTRY`)**:
  - Contains 13 verified contemporary external records (9 text/treaty/document/official records: `src-oslo-ii-1995`, `src-ap-1998-opening`, `src-ap-1998-clinton`, `src-worldbank-2007`, `src-unsco-2000`, `src-unrwa-2001`, `src-icao-council-2002`, `src-gisha-2008`, `src-saleh-hegab-airport`; 4 verified external video references: `src-video-ap-1998-opening`, `src-video-clinton-1998`, `src-video-aljazeera-2009`, `src-video-afp-2018`).
  - Public external references are curated outbound links (`getAllSourceRecords()`), cleanly separated from reusable archive media.
- **Airport Past Chapter Architecture (`/airport/past`, `/ar/airport/past`)**:
  - Uses `PublicPhotoHero` with `airport-archive-hero-2000` (`routeKey="past"`).
  - Seeded timeline placeholder photos removed. Timeline chapters (planning, opening, operations, closure, memory) are fully typed, each with `evidence: "verified"` and valid, resolvable citations in `SOURCE_REGISTRY`.
- **Hero Metadata Clearance Gap Documented**:
  - `airport-archive-hero-2000` and `gallery-aircraft-archive-2000` retain approved historical-documentary hero status for `/airport/past` and existing media references, but lack explicit photographer/license provenance for general public archive catalog redistribution.

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
2. **Settings & Appearance Store Convergence (Phase 4C complete)**:
   - Unified multi-document settings envelope (`gza.settings.draft.v1`) with independent Contact and Appearance drafts, one-time legacy migration with untouched legacy key, transactional failure resilience, and explicit preview immunity.
3. **Public Workflows Convergence (Phase 5 in progress: Phase 5A, Phase 5B, and Phase 5C complete; Phase 5D planned)**:
   - Direct binding of passenger account management, saved companions, and public booking wizard state into repository queries and mutations. Phase 5A converged canonical passenger identity, account state, and saved travelers on `PassengerRepository` (`gza.passenger.v1`). Phase 5B converged booking wizard draft (`BookingDraftRepository` on `gza.booking.draft.v1`) and effective flight discovery (`FlightRepository`). Phase 5C converged Manage, Check-in, and Boarding Pass onto canonical repositories, typed commands, check-in eligibility window (24h to 60m), and live effective flights, accepted and merged into main. Phase 5D will converge public contact messaging and feedback.
4. **Historical Archive Foundation & Publication (HC-2 Complete / Accepted Source on main)**:
   - Decoupled public gallery from legacy fixtures, introduced canonical `getPublishedArchiveRecords()`, 13-record `SOURCE_REGISTRY` (9 text/treaty/official/archive sources, 4 verified external video references), source-backed Airport Past timeline across 5 chapters citing Oslo II, The New York Times, The Washington Post, World Bank, UNSCO, UNRWA, ICAO, Gisha, and Saleh & Hegab, singleton-safe lightbox, and 58-item intake audit. Accepted and merged into main.
5. **Admin Workflows Convergence (Phase 6)**:
   - Direct repository binding for operational flight dispatch, schedule master templates, check-in desk, customer CRM, and activity logs.
6. **SEO & Head Metadata Parity (Phase 11)**:
   - Arabic homepage `<title>` and `<meta name="description">` parity.
   - Comprehensive OpenGraph and Twitter card metadata for Arabic routes.
   - Automated `sitemap.xml` and `robots.txt` generation.
   - Structured JSON-LD metadata for airline and airport entities.
7. **Backend Readiness & API Contracts (Phase 12–13)**:
   - Server-side database, authenticated REST/tRPC endpoints, and live payment processing.
