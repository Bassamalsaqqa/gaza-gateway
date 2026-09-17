# Master Engineering Roadmap — Gaza Airport & Palestinian Airlines

> **Product**: Digital home of Palestinian Airlines operating through Gaza International Airport ([gazaairport.com](https://www.gazaairport.com)), featuring an airport public presence and an administration workspace.
> **Current Status**: **Phase 0 Active (Measured Baseline Audit — Gates Open)**.
> **Commit Reality**: Commit `c263a78cc2ff82a1a7fe92a679c692038ce15daa` merged all admin workspace modules (68 `.tsx` route files total in `src/routes/`: 23 admin, 44 public feature/layout routes, 1 root shell).

---

## Historical Passes (Landed)

1. **Public Passenger Experience (Batch A)**:
   - Network flight search, multi-step booking (flights, fares, passenger details with infant-to-adult linking, seat selection, baggage & extras, review & confirmation).
   - Public Manage Booking (`/manage/$ref`, seats, extras, contact edit, cancellation flow).
   - Public Check-in (`/check-in`, `/manage/$ref/check-in`) with per-leg, per-passenger flows.
   - Boarding pass generation (`/boarding-pass/$ref/$leg/$pax`) with print-optimized styling.
   - User account area (`/account`, trips, saved travelers, preferences).
   - Bilingual URL architecture: flat route structure under `src/routes/{-$locale}.*.tsx` serving `/` (English) and `/ar` (Arabic) with persistent directionality and URL-driven switching.
2. **Admin Workspace Foundation (Batch 1 & 2 / Pass 2)**:
   - Staff sign-in (`/admin/signin`, `/ar/admin/signin`) with role switcher (Operations Manager, Station Agent, Content Editor).
   - Admin shell: collapsible/RTL-mirrored sidebar, header bar, breadcrumbs, global search (`Ctrl/Cmd+K`), attention bell, language switch, quick-switch identity menu, mobile navigation drawer.
   - Today's operations dashboard with operational stats, flight list, check-in monitor, quick-edit slide-over sheet.
   - Core operational modules: Flights (`/admin/flights`), Schedules (`/admin/schedules`), Destinations (`/admin/destinations`), Products & Fares (`/admin/products`), Bookings (`/admin/bookings`, `/admin/bookings/new`, `/admin/bookings/$ref`), Check-in Desk (`/admin/check-in`), Customers (`/admin/customers`, `/admin/customers/$id`), Website CMS (`/admin/website`), Airport Operations & Archive (`/admin/airport`), Staff Management (`/admin/staff`), Activity Log (`/admin/activity`), Analytics (`/admin/analytics`), and Settings (`/admin/settings`).

---

## Master 13-Phase Progression

| Phase | Name | Status | Core Objective |
| :--- | :--- | :--- | :--- |
| **Phase 0** | **Baseline Audit & Engineering Contract** | **ACTIVE** | Audit repository state, verify build/lint/typecheck gates, catalog flat routes/components/data sources, document no-op actions and HostPapa constraints, record independent browser spot-check evidence and Prettier auto trial, establish immutable engineering invariants. |
| **Phase 1** | **HostPapa Static/Prerender Artifact & Route Refresh** | Planned | Produce a prebuilt static artifact (`index.html` + assets) deployable to HostPapa cPanel `public_html/` via Git pull, without requiring persistent Node SSR or server runtime. |
| **Phase 2** | **Visual Design-System Certification** | Planned | Certify limestone/sand, olive-green, clay/terracotta, and dark editorial visual language across all screens, resolving token inconsistencies. |
| **Phase 3** | **Interaction-System Consolidation** | Planned | Consolidate duplicated modal dialogs, drawers, sheets, dropdowns, and toast patterns into shared, accessible UI primitives. |
| **Phase 4** | **Canonical Mock Domain & Repository Layer** | Planned | Design typed domain entities and unified repository interfaces decoupling UI from storage mechanisms; prepare unified mock repository. |
| **Phase 5** | **Complete Public Workflows** | Planned | Connect public booking, manage, check-in, account, and contact forms to the canonical mock repository with complete validation. |
| **Phase 6** | **Complete Admin Mock Workflows** | Planned | Connect admin flight quick-edit, schedule manager, passenger desk, customer notes, CMS editor, and inbox to the shared mock repository with live cross-screen state updates. |
| **Phase 7** | **Bilingual & RTL Certification** | Planned | Rigorous audit of English `/` and Arabic `/ar` parity: layout mirroring, font hierarchies, typography, and LTR preservation for technical identifiers (flight numbers, PNRs, dates). |
| **Phase 8** | **Responsive & Accessibility Certification** | Planned | Multi-breakpoint verification (320px to 1920px), keyboard navigation, focus traps, screen-reader semantics, WCAG 2.2 AA compliance. |
| **Phase 9** | **Final Visual & UX Polish** | Planned | Micro-interactions, transition animations, empty states, error recovery, responsive table behaviors. |
| **Phase 10** | **Owner Real Assets & Performance Tuning** | Planned | Integrate owner-provided official logos, historical archive photographs, optimize image delivery and bundle chunking. |
| **Phase 11** | **Large Mock-Dataset Stress & Scale Simulation** | Planned | Test system performance with 1,000+ flights, 10,000+ bookings, complex customer histories, and multi-leg search filtering. |
| **Phase 12** | **SEO & HostPapa Production Certification** | Planned | Final production deployment verification: canonicals, hreflang, sitemaps, robots.txt, Apache `.htaccess` rewrite rules, cache headers on `gazaairport.com`. |

> **Backend Architecture Boundary**: Production backend, database infrastructure, real auth, payment gateways, and transactional email are deferred until after Phase 12 frontend certification. Phases 4–6 converge public and admin mutations in a coherent client-side mock repository.
