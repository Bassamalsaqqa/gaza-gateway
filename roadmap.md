# Master Engineering Roadmap — Gaza Airport & Palestinian Airlines

> **Product**: Digital home of Palestinian Airlines operating through Gaza International Airport ([gazaairport.com](https://www.gazaairport.com)), featuring an airport public presence and an administration workspace.
> **Current Status**: **Phase 0 & 0.1 Complete; Phase 1 Complete; Phase 2 Complete; Impeccable PRODUCT.md Context Complete; Phase 3A Complete; Whole-Product Design-Direction Shaping Complete (`docs/DESIGN.md`); Phase 3B Complete (Master UI/UX Modernization & Final Closure Pass)**.
> **Immediate Next Step**: **Phase 4 — Canonical Mock Domain & Repository Layer** (Decouple UI components into typed domain entities and unified mock repository layer).
> **Commit Reality**: Commit `fe294f4dc4049018d250843315b2b936c8417600` published Phase 0 baseline audit; commit `9d1edc5673f0237bb23d40a5685c49b8fd90b3c0` published Phase 0.1 baseline accuracy; commit `cc57cfe2450effd78547b591fd66b156ef5e699a` published Phase 3A audits, synthesis, and owner decisions checkpoint.

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
   - Core operational modules: Flights (`/admin/flights`), Schedules (`/admin/schedules`), Destinations (`/admin/destinations`), Products & Fares (`/admin/products`), Bookings (`/admin/bookings`, `/admin/bookings/new`, `/admin/bookings/$ref`), Check-in Desk (`/admin/check-in`), Customers (`/admin/customers`, `/admin/customers/$id`), Website CMS (`/admin/website`), Airport History & Archive CMS (`/admin/airport`), Staff Management (`/admin/staff`), Activity Log (`/admin/activity`), Analytics (`/admin/analytics`), and Settings (`/admin/settings`).

---

## Master Progression

| Phase | Name | Status | Core Objective |
| :--- | :--- | :--- | :--- |
| **Phase 0 / 0.1** | **Baseline Audit, Accuracy & Semantic Lint Gate** | **Complete** | Audit repository state, verify build/typecheck/semantic lint gates, catalog flat routes/components/data sources, document no-op actions and HostPapa constraints, record independent browser spot-check evidence, separate semantic lint from formatting debt, establish immutable engineering invariants. |
| **Phase 1** | **HostPapa Static/Prerender Artifact & Route Refresh** | **Complete** | Produce a prebuilt static artifact (`dist/client/`) deployable to HostPapa cPanel `public_html/` with 46 prerendered public pages, targeted application shells, Apache `.htaccess` fallback rules, and deterministic hydration-safe dates resolving React #418. |
| **Phase 2** | **Visual Design-System Certification** | **Complete** | Establish semantic typography roles in incumbent implementation (`Bricolage Grotesque`, `Manrope`, `IBM Plex Sans Arabic`, `IBM Plex Mono`), Arabic RTL cursive ligature protection, token calibration for WCAG 2.2 AA contrast, and durable `docs/DESIGN_SYSTEM.md`. |
| **Context** | **Product Authority & Identity Grounding** | **Complete** | Establish `PRODUCT.md` as durable product truth: dignified, calm, professional, clear, hospitable, technically credible, culturally grounded, historically responsible; preserve Palestinian civil aviation identity and operational realism. |
| **Phase 3A** | **System Audits, Whole-Product Synthesis & Owner Decisions** | **Complete** | Conduct 5 independent audit workstreams (Public, Heritage, Admin, Interaction System, Synthesis), establish 19-record findings register, define 14 bounded decision cards, resolve 8 strategic owner direction choices (Cards 01, 02, 04, 06, 07, 11, 13, 14), curate structured evidence in `docs/evidence/phase-3a/`, and publish checkpoint commit `cc57cfe2450effd78547b591fd66b156ef5e699a`. |
| **Design Shaping** | **Whole-Product Design-Direction Shaping** | **Complete** | Shape canonical screen templates and interaction patterns: public gateway/home/navigation/search console, guided booking wizard, heritage/archive storytelling, and high-density admin operations dashboard across desktop, mobile, English, and Arabic. Authored authoritative `docs/DESIGN.md`. |
| **Phase 3B** | **Component & Interaction Modernization / Consolidation** | **Complete** | Consolidated shared UI primitives on installed Radix headless foundation (`Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Tabs`, `Select`, `Switch`, `Checkbox`, `RadioGroup`), modernized passenger pickers (`AirportCombobox`, `AirlineDatePicker`, `TravellersCabinPicker`, `PassengerDobPicker`), consolidated admin drawers on `GazaSheet`, refined dashboard hierarchy, unified loading skeletons (`GazaLoadingState`), verified 2D seat map roving navigation, and certified 320–1920 responsive zero-overflow behavior across EN and AR. |
| **Phase 4** | **Canonical Mock Domain & Repository Layer** | **Next Engineering Phase** | Design typed domain entities and unified repository interfaces decoupling UI from storage mechanisms; prepare unified mock repository converging public (`useStore`) and admin (`admin-ops`, `admin-mock`) data layers. |
| **Phase 5** | **Complete Public Workflows** | Planned | Connect public booking, manage, check-in, account, and contact forms to the canonical mock repository with complete validation. |
| **Phase 6** | **Complete Admin Mock Workflows** | Planned | Connect admin flight quick-edit, schedule manager, passenger desk, customer notes, CMS editor, and inbox to the shared mock repository with live cross-screen state updates. |
| **Phase 7** | **Bilingual & RTL Certification** | Planned | Rigorous audit of English `/` and Arabic `/ar` parity: layout mirroring, font hierarchies, typography, and LTR preservation for technical identifiers (flight numbers, PNRs, dates). |
| **Phase 8** | **Responsive & Accessibility Certification** | Planned | Multi-breakpoint verification (320px to 1920px), keyboard navigation, focus traps, screen-reader semantics, WCAG 2.2 AA compliance. |
| **Phase 9** | **Final Visual & UX Polish** | Planned | Micro-interactions, transition animations, empty states, error recovery, responsive table behaviors. |
| **Phase 10** | **Owner Real Assets & Performance Tuning** | Planned | Integrate owner-provided official logos, historical archive photographs, optimize image delivery and bundle chunking. |
| **Phase 11** | **Large Mock-Dataset Stress & Scale Simulation** | Planned | Test system performance with 1,000+ flights, 10,000+ bookings, complex customer histories, and multi-leg search filtering. |
| **Phase 12** | **SEO & HostPapa Production Certification** | Planned | Final production deployment verification: canonicals, hreflang, sitemaps, robots.txt, Apache `.htaccess` rewrite rules, cache headers on `gazaairport.com`. |

> **Backend Architecture Boundary**: Production backend, database infrastructure, real auth, payment gateways, and transactional email are deferred until after Phase 12 frontend certification. Phases 4–6 converge public and admin mutations in a coherent client-side mock repository.
