# Gaza Gateway — Travel Guide UX Redesign (Slice 5) Implementation Document

**Date:** 2026-10-16

**Author:** AGY Implementation Worker

**Reviewer:** Codex (Lead Engineer & Coordinator) / Product Owner

**Scope:** Slice 5 — `/travel` UX Redesign & Truthful Commemorative Guidance

**Status:** Implemented & Verified Uncommitted (Ready for Coordinator Integration & Real-Browser Visual QA)

---

## 1. Executive Summary

This document specifies the complete UX, information architecture, and contract-aligned factual content for the `/travel` surface ([`src/routes/{-$locale}.travel.tsx`](file:///C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/feature-pack-travel-worker/src/routes/{-$locale}.travel.tsx)), supported by modular components under `src/components/travel-guide/`, truthful published fallback content in [`src/content/published/travel.ts`](file:///C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/feature-pack-travel-worker/src/content/published/travel.ts), and focused behavioral unit tests in [`tests/unit/travel-guide.test.ts`](file:///C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/feature-pack-travel-worker/tests/unit/travel-guide.test.ts).

The implementation strictly reflects the actual source contract across [`src/components/booking/mvp-free-booking.tsx`](file:///C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/feature-pack-travel-worker/src/components/booking/mvp-free-booking.tsx) and [`src/lib/reservations/client.ts`](file:///C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/feature-pack-travel-worker/src/lib/reservations/client.ts):
- Booking collects passenger name, birth date, nationality, and document reference (no file scan/upload, not verified with governments or for real travel).
- Guest management verification operates via a 6-digit email code.
- Commemorative tickets display passenger name, route, date, local departure/arrival times, assigned seats, and booking references for printing or saving as PDF via browser (no unbacked baggage allowances).
- Removed unsourced destruction years and period claims; points to dedicated Past/Present pages for documented airport history.

---

## 2. Invariants & Scope Boundaries

1. **No External Scope Drift**:
   - Strictly bounded to `src/routes/{-$locale}.travel.tsx`, `src/components/travel-guide/*`, `src/content/published/travel.ts`, `docs/feature-pack/TRAVEL_GUIDE_IMPLEMENTATION.md`, and `tests/unit/travel-guide.test.ts`.
   - [`scripts/test-groups.mjs`](file:///C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/feature-pack-travel-worker/scripts/test-groups.mjs) was **not modified** (owned by another concurrent worker).
   - No backend, booking console, destinations, ticket design system, or cinematic layers were modified.
   - Zero new dependencies added to `package.json`.
2. **CMS Authority & Schema Invariant**:
   - `TravelContent` schema version 1 and all 5 canonical section IDs (`prepare`, `documents`, `baggage`, `airport`, `accessibility`) and 15 point IDs (`prepare-1..3`, `documents-1..3`, `baggage-1..3`, `airport-1..3`, `accessibility-1..3`) are strictly preserved.
   - CMS preview (`useContentPreview("travel", publishedTravel)`) preserves real-time reactivity to edited titles, bodies, and points.
3. **Factual Source Contract Alignment**:
   - Form fields: accurately describes that passenger name, birth date, nationality, and document reference are stored in the private backend for the commemorative record, without claiming privacy exemptions not present in code.
   - Verification: states that a 6-digit code is queued by email for guest booking retrieval/management (no magic links).
   - Ticket details: shows actual confirmed ticket fields (passenger, flight, date, times, assigned seat, leg reference, browser print/PDF); omits baggage allowance claims from ticket data.
   - Airport history: does not invent or oversimplify destruction years in travel copy; cites the Past and Present pages as authoritative history sources.

---

## 3. Information Architecture & Section Model

| Section ID | Canonical Title (EN / AR) | Factual Scope & Source Contract Alignment | Real Action Links |
| :--- | :--- | :--- | :--- |
| `prepare` | **Planning your symbolic journey** / التخطيط لرحلتك الرمزية | Searching published timetables; selecting one-way or return; guest checkout workflow; email confirmation queue; reference retrieval. | `/flights` (Timetables)<br>`/book` (Reserve Seat)<br>`/manage` (Lookup) |
| `documents` | **Passenger details & verification** / بيانات المسافر والتحقق | Passenger name, birth date, nationality, and document reference requested for commemorative record; documents not verified with government; 6-digit email code for manage access. | `/book` (Symbolic Flight)<br>`/manage` (Verify Details) |
| `baggage` | **Your ticket & booking reference** / تذكرتك ورمز الحجز | Displays confirmed flight, route, local times, assigned seats, and leg reference; print or save as PDF via browser; 100% free; manage/cancel via code. | `/book` (Free Ticket)<br>`/manage` (View & Manage) |
| `airport` | **Terminal architecture & history** / عمارة وتاريخ المطار | Architectural legacy and visionary future terminal concepts; points visitors to documented history on Past/Present pages; clarifies physical operations do not run. | `/airport/past` (Heritage)<br>`/flights` (Symbolic Board) |
| `accessibility` | **Website accessibility & navigation** / إمكانية الوصول والتصفح | Digital inclusion adhering to WCAG 2.2 AA; full keyboard roving focus; visible focus rings; Arabic RTL layout parity; clarifies in-person escorts are not provided. | `/book` (Commemorative Flight)<br>`/contact` (Contact Team) |

---

## 4. Component Architecture (`src/components/travel-guide/`)

### 4.1 `travel-helpers.ts` (Pure Functions)
- `normalizeTravelSections(sections)`: Pure filter returning only `visible: true` sections and points, preserving exact ordering.
- `resolveActiveSection(sections, requestedSection, hash)`: Resolves active section with deterministic priority: Query Parameter (`?section=...`) > URL Hash (`#...`) > First visible section.
- `estimateReadTime(text, lang)`: Derives reading time dynamically from word count (150 words/min), eliminating arbitrary hardcoded numbers.
- `getTravelSectionMeta(section, lang)`: Returns step numbering (`01`–`05`), category, icon type, derived reading time, and aligned section title/summary tags.
- `getSectionSummaryFacts(sectionId, lang)`: Derives 3 structured summary facts based strictly on actual platform features and form contracts (e.g. "Name, DOB, Doc Ref", "6-Digit Code", "Route, Seat & Ref", "$0.00 Free").
- `getSectionFaqs(sectionId, lang)`: Returns meaningful Q&A items for progressive disclosure, explaining document references, 6-digit access codes, ticket printing, and memorial platform boundaries.
- `getSectionActions(sectionId, lang)`: Maps section context to authentic routes without dead ends.

### 4.2 `travel-nav.tsx` (Accessible Guide Navigation)
- Renders an accessible sticky guide rail with `role="tablist"` and `role="tab"`.
- Implements **roving focus** with circular wrapping (Left/Right arrow, Home, End):
  - Automatically moves DOM focus to the newly selected tab button via explicit refs (`nextTrigger.focus()`).
  - Correctly inverts Left/Right arrows in Arabic RTL (`dir="rtl"`).
- Automatically scrolls active tab into view on mobile viewports while obeying reduced motion (`behavior: reduceMotion ? "auto" : "smooth"`).
- Uses `motion-safe:scroll-smooth` on the container to prevent forced smooth-scrolling when users request reduced motion.
- Guarantees touch-friendly minimum 44px tap targets (`min-h-11`).

### 4.3 `travel-commemorative-notice.tsx` (Scope & Guidance Notice)
- Plain-language callout at the head of the guide clearly articulating the scope of Gaza Gateway without marketing buzzwords ("Zero Friction" removed) or hardcoded period claims.
- Emphasizes free commemorative tickets, guest reservation workflow, and memorial platform scope.

### 4.4 `travel-section-view.tsx` (Editorial Presentation & Progressive Disclosure)
- Wraps each section in `GazaSurface` (`family="guide"`, `target="travel.guide"`).
- **Core CMS Checklist**: Renders exact CMS point copy (`pick(lang, point.text)`) directly as an uncompromised, readable checklist with olive checkmarks.
- **Genuine Progressive Disclosure**: Embeds a dedicated, accessible single-collapsible Accordion (`@radix-ui/react-accordion`) containing authentic section FAQs closed by default.
- **Summary Facts**: Renders clean, 3-column (collapsing to single column on mobile) fact tiles derived from actual capabilities.
- **Surface Grammar & Appearance Studio Compatibility**:
  - Full support for `top`, `side`, `cover`, and `watermark` treatments.
  - Fixes watermark fallback so media renders properly with subtle opacity.
  - Pins the mandatory AI classification badge (`future-concept-ai`) on `cover` and `watermark` treatments.
  - In standard mode, displays the approved `passenger-assistance` image under `accessibility` with clear illustrative disclosure.
- **Responsive Layout**: Uses `minmax(0, 1fr)` columns and responsive padding to ensure zero side-scroll overflow on 320px screens.

### 4.5 `travel-action-tray.tsx` (Real Navigation Links)
- Renders contextual action buttons linking to real features (`/flights`, `/book`, `/manage`, `/airport/past`, `/contact`).

---

## 5. URL & Navigation State Management

In `src/routes/{-$locale}.travel.tsx`, the URL is established as the **single source of truth**:
1. `activeId` is derived directly from `Route.useSearch().section`, with fallback to `window.location.hash`, with fallback to the first visible section.
2. Clicking a navigation tab triggers `navigate({ search: (prev) => ({ ...prev, section: id }), replace: true })`.
3. Browser back/forward navigation updates `search.section`, immediately updating `activeId` without local state desynchronization or infinite render oscillation.
4. Unused imports removed from route component.

---

## 6. Verification Evidence

### 6.1 Unit Tests (`node --test --experimental-strip-types tests/unit/travel-guide.test.ts`)
- **Suites**: 9
- **Tests**: 19
- **Results**: 19 passed, 0 failed (139.5ms)
- **Covered Invariants**:
  - Section normalization and visibility filtering.
  - Deep-link resolution priority (Query > Hash > First visible).
  - Dynamic read-time calculation.
  - Section metadata and custom section fallback.
  - Authentic summary facts (Name, DOB, Doc Ref; 6-digit code; Route, Seat & Ref).
  - Verifiable section FAQs for all 5 sections in English and Arabic.
  - Action link validity against known application routes.
  - CMS baseline validation (`validateTravelContent`).
  - Section `baggage` accurately titled "Your ticket & booking reference" / "تذكرتك ورمز الحجز".
  - Backend form contract fields (name, DOB, nationality, document reference) accurately represented.

---

## 7. Coordinator Integration & Real-Browser Visual QA Callout

Because browser automation is reserved for the lead coordinator's batched visual QA phase, the following visual checks are flagged for coordinator verification:

1. **320px Viewport (Small Mobile)**:
   - Verify that horizontal padding (`p-4 sm:p-6`) and fact tiles (`grid-cols-1 sm:grid-cols-3`) produce zero horizontal overflow on iPhone SE / 320px screens.
   - Verify that `TravelNav` scroll track scrolls cleanly with swipe gestures.
2. **390px Viewport (Standard Mobile)**:
   - Verify tap target comfort (min 44px) on navigation buttons and accordion triggers.
3. **1280px+ Viewport (Desktop)**:
   - Verify balanced editorial column proportions (`minmax(0, 1.15fr)` and `minmax(0, 0.85fr)`).
   - Verify sticky behavior of `TravelNav` below the primary site navigation bar.
4. **Arabic RTL Inspection (`/ar/travel`)**:
   - Verify right-to-left layout alignment, Chevron rotation, checkmark position, and tab order.
5. **Appearance Studio / Skin Preview**:
   - Verify `travel.guide` surface under `top`, `side`, `cover`, and `watermark` treatments with AI concept badge visibility.
