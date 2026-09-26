# Master Engineering Roadmap — Gaza Airport & Palestinian Airlines

> **Product**: Digital home of Palestinian Airlines operating through Gaza International Airport ([gazaairport.com](https://www.gazaairport.com)), featuring an airport public presence and an administration workspace.
> **Current Status**: **Phase 3.9 Complete (System Stabilization, Startup Bundle Isolation, Booking Correctness, Appearance Studio UX, Truth Model, and Local Regression Foundation)**.
> **Immediate Next Step**: **Phase 4 — Canonical Mock Domain & Repository Layer** (Decouple UI components into typed domain entities and unified mock repository layer).
> **Commit Reality**: Commit `fe294f4dc4049018d250843315b2b936c8417600` (Phase 0 audit); `9d1edc5673f0237bb23d40a5685c49b8fd90b3c0` (Phase 0.1 accuracy); `cc57cfe2450effd78547b591fd66b156ef5e699a` (Phase 3A synthesis); `1f49869ca83c82d23dcb4396a06b81e30843da54` (current source main baseline); `2ecf3577356e257d2e05ccb84d73c95e32fa7d97` (hostpapa-deploy release baseline). Phase 3.9 implementation changes remain uncommitted and unstaged for Codex review.

---

## Master Progression & Phasing Sequence

| Phase | Name | Status | Core Objective |
| :--- | :--- | :--- | :--- |
| **Phase 0 / 0.1** | **Baseline Audit, Accuracy & Semantic Lint Gate** | **Complete** | Audit repository state, verify build/typecheck/lint gates, catalog flat routes, components, and data sources. |
| **Phase 1** | **HostPapa Static/Prerender Artifact & Route Refresh** | **Complete** | Produce prebuilt static artifact (`dist/client/`) with 46 prerendered pages, application shells, and deterministic dates. |
| **Phase 2** | **Visual Design-System Certification** | **Complete** | Certified typography (`Bricolage Grotesque`, `Manrope`, `IBM Plex Sans Arabic`, `IBM Plex Mono`), RTL cursive ligatures, and WCAG AA tokens. |
| **Context** | **Product Authority & Identity Grounding** | **Complete** | Grounded `PRODUCT.md`: calm, professional, clear, hospitable, technically credible, culturally grounded, historically responsible. |
| **Phase 3A** | **System Audits, Whole-Product Synthesis & Owner Decisions** | **Complete** | 5 independent audits, 19 findings, 14 decision cards, 8 strategic choices resolved. |
| **Design Shaping** | **Whole-Product Design-Direction Shaping** | **Complete** | Shaped screen templates: gateway home, search console, booking wizard, archive storytelling, admin operations dashboard (`docs/DESIGN.md`). |
| **Phase 3B** | **Component & Interaction Modernization / Consolidation** | **Complete** | Consolidated Radix primitives, passenger pickers, `GazaSheet`, 2D seat map roving navigation, responsive zero-overflow. |
| **Phase 3.9** | **System Stabilization & Source-of-Truth Reset** | **Current / Complete** | 1. Booking correctness: canonical `isFlightBookable(flight, now?)` rule, Radix disabled options, passenger details preservation on draft recovery, step gating, submit safeguard.<br>2. Startup bundle isolation: split `runtime-targets.ts` from editor metadata; reduced root bundle from 465 kB to 405 kB; verified 0 editor metadata and 0 heavy Hero Patterns in initial graph.<br>3. Appearance Studio UX: screen → scenario → viewport → Inspect → edit flow; Radix RadioGroup for single-choice controls; family inheritance vs component override status; demoted Specimens to Design QA.<br>4. Truth model: canonical `TruthClass = "future-concept-ai" \| "brand-mark" \| "placeholder"`; added versioned `gza.appearance.v1` export.<br>5. Durable local regression foundation: permanent `npm test` with 58 Node 24 native unit tests; committed browser smoke script (`npm run test:smoke`).<br>6. Documentation truth reset across all architectural guides. |
| **Phase 4** | **Canonical Domain & Repository Layer** | **Next Engineering Phase** | Decouple UI components from storage singletons into typed domain entities and unified repository interfaces; converge public (`useStore`) and admin (`admin-ops`, `admin-mock`) data layers. |
| **Phase 4B** | **Typed Content & CMS Schema** | Planned | Formalize typed content entities for homepage editorials, travel guides, airport history chapters, and bilingual media metadata. |
| **Phase 4C** | **Settings & Appearance Store Convergence** | Planned | Migrate Appearance Studio state from preview-only query storage into the canonical settings repository. |
| **Phase 5** | **Public Workflows Convergence** | Planned | Connect booking, manage trips, check-in, passenger accounts, and contact forms to canonical domain repositories with complete validation. |
| **Phase 6** | **Admin Workflows Convergence** | Planned | Connect admin flight quick-edit, schedule manager, passenger desk, customer notes, and activity logging to the shared domain repositories. |
| **Phase 7** | **CMS Admin Workflows** | Planned | Enable full authored CMS editing for destinations, airport historical chapters, and travel guidance. |
| **Phase 7B** | **Media & Provenance Admin** | Planned | Structured media catalog management with strict truth classification, provenance tagging, and multi-resolution variant inspection. |
| **Phase 8** | **Visual System & Assets Finalization** | Planned | Complete asset delivery optimization, icon audits, and surface grammar token refinements. |
| **Phase 9** | **Arabic, RTL, Accessibility & Responsive Certification** | Planned | Comprehensive multi-breakpoint audit (320px–1920px), keyboard navigation, focus management, and screen-reader semantics. |
| **Phase 10** | **Comprehensive Durable Regressions Program** | Planned | Expand test coverage with automated mock-state mutation tests, end-to-end user journeys, and regression baselines. |
| **Phase 11** | **SEO, Performance & HostPapa Production Certification** | Planned | Address known SEO gaps (Arabic homepage metadata, route head parity, sitemap, structured data), core web vitals, and HostPapa production deployment. |
| **Phase 12** | **Backend Readiness & API Contracts Design** | Planned | Design REST/RPC API contracts, payload schemas, and backend migration readiness blueprints. |
| **Phase 13** | **Production Backend, Auth & Database Integration** | Planned | Implement persistent server infrastructure, database, secure authentication, and payment processing. |
| **Phase 14+** | **Optional Ecosystem Integrations** | Planned | GDS flight data feeds, external loyalty programs, cargo logistics, and external partner APIs. |

---

## Architectural & Hosting Constraints

1. **Client Simulation Boundary**: Current passenger authentication, staff sign-in, booking records, and flight dispatch operations are client-side simulations (`gza.store.v1`, `gza.admin.v1`, `OpsState`). No real secrets, credit cards, or customer data belong on current client auth.
2. **Static Deployment Target**: Prebuilt static HTML and assets deployed to HostPapa shared hosting (`public_html/`) via `build:hostpapa`, `hostpapa:prepare`, and `hostpapa:verify`.
3. **Repository Convergence**: Phase 4 will introduce domain query/mutation hooks replacing ad-hoc storage singletons across public and admin interfaces.
