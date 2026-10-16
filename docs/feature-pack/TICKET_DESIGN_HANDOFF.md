# Gaza Gateway — Slice 6 Dynamic Ticket Design Implementation Handoff

**Date:** 2026-10-16

**Lanes / Task:** Feature Pack Slice 6 — Dynamic Ticket Design System (Owner Neutral Revision & Source Verification)

**Audience:** Codex (Lead Engineer / Coordinator), Product Owner, Reviewing Architect

**Source Baseline:** `743741fd93f03bb88b4754f2558cf814e83c5147` (HostPapa Laravel 13 / MySQL / React 19)

---

## 1. Executive Summary & Owner Latest Directives

This handoff documents the final bounded source verification of the approved Palestinian Airlines / Gaza Gateway dynamic ticket design. The latest owner corrections explicitly supersede original brief requirements:

1. **Owner-Approved Neutral Classification & Disclosures (Supersedes Original Brief)**:
   - **Neutral Title**: Classification rendered as `"Ticket / Itinerary"` (EN) and `"التذكرة / مسار الرحلة"` (AR), replacing previous "Commemorative E-Ticket" titles.
   - **Footer Disclaimer Omission**: The footer disclaimer caption ("Not valid for travel · Commemorative digital document") has been removed; `validityNotice` is an empty string `""` in both EN and AR.
   - **Clean Courtesy Banner**: The secondary AI caption tag in the hero courtesy section has been removed; the authentic motto `FROM GAZA ... TO THE WORLD` / `من غزة إلى العالم` remains prominent without visual clutter.
   - **Later Owner Copy Direction**: Repeated visible commemorative/AI/not-valid-for-travel copy is removed throughout public UI, email and related Admin guidance; canonical classification and documentary media restrictions remain intact.

2. **Physical Print Scaling ($0.8\times$ Transform Scale to 203.2 × 82.55 mm)**:
   - The ticket canvas is built at fixed $960 \times 390\text{ px}$ (exact $32:13$ aspect ratio).
   - In `@media print`, the canvas is scaled down by **$0.8$** via CSS `transform: scale(0.8) !important;` to yield **$768 \times 312\text{ CSS px}$**, which maps to **$203.2 \times 82.55\text{ mm}$ ($8 \times 3.25\text{ inches}$)**.
   - Container `.gza-ticket-scaler-wrapper` has `width: 203.2mm !important; height: 82.55mm !important;`.
   - Bidi-aware pinning: In LTR, scaled with `left: 0; transform-origin: top left;`. In RTL, scaled with `right: 0; transform-origin: top right;`.

3. **Multi-Page Print Flow & `:has(#mvp-reservation-ticket)` Isolation**:
   - `#mvp-reservation-ticket` is rendered in **`position: static !important;`** (normal in-flow). This eliminates blank pages caused by residual ancestor heights and guarantees multi-pass reservations (roundtrip or multi-passenger) paginate naturally across pages with `break-inside: avoid`.
   - Print isolation uses `body:has(#mvp-reservation-ticket)` to suppress header, footer, navigation chrome, and non-ticket siblings along the ancestor path.
   - `@page { size: auto; margin: 6mm 3mm; }` provides 204 mm printable width on A4, perfectly centering the 203.2 mm card with 0.4 mm clearance per side.

4. **Safety & UX Invariants**:
   - **Non-Overlapping Cancel Ribbon**: The inner cancellation ribbon (`.gza-ticket-cancelled-banner-inner`) is anchored to the top opposite corner of the main pass (`top: 0; inset-inline-end: 0;`), completely avoiding any collision with the Palestinian Airlines insignia.
   - **Seat Release**: Cancelled passes print `RELEASED` / `تم التحرير` in the seat field.
   - **No Focus Trap / Duplicate Print**: Removed the duplicate print button inside the full-size zoom `Dialog` modal.
   - **Stub Vertical Stability**: Stub vertical padding and logo margins are tightened so standard and 2-line long name passes fit comfortably within the 390 px canvas with zero bottom band overflow.
   - **Full Names Accessible**: Long passenger names up to 240 characters wrap safely across 2 lines with standard CSS ellipsis on the pass and remain 100% uncut in the accompanying detail summary.

---

## 2. Deliverables & Modified Files

| Area | File Path | Status | Purpose |
|---|---|---|---|
| **UI Component** | `src/components/booking/commemorative-ticket.tsx` | Modified | Neutral classification, inner cancel ribbon, bidi canvas pinning, static print root, no modal print trap |
| **Scoped CSS** | `src/components/booking/commemorative-ticket.css` | Modified | Removed unused `concept-tag`/`footer-notice`, tightened stub vertical rhythm, corner cancel ribbon |
| **Pure Mapper** | `src/lib/reservations/ticket-presentation.ts` | Intact | Pure mapper delivering `"Ticket / Itinerary"` / `"التذكرة / مسار الرحلة"` and empty `validityNotice` |
| **Unit Tests (TS)** | `tests/unit/ticket-presentation.test.ts` | Modified | 24 tests: added focused test asserting owner-neutral classification and footer disclaimer omission |
| **Scratch Visual Fixture** | `scratch/ticket-visual.tsx` | Modified | Accessible `htmlFor`/`id` labels, max-width bounds, pure `mapTicketPresentation` EN/AR rendering |
| **Documentation** | `docs/feature-pack/TICKET_DESIGN_HANDOFF.md` | Modified | Updated handoff with actual $0.8$ print scale and latest owner directives |

---

## 3. Physical Dimensions & Grid Distribution

```
┌─────────────────────────────────────────────────────────────┬──────────────────────────┐
│ MAIN PASS (78% width: 748.8 px)                            ┆ STUB (22% width: 211.2px)│
│                                                             ┆                          │
│ 1. Hero Band (125fr / ~32%):                                ┆ • Status Tag (Confirmed/ │
│    - Terminal concept photo + bidi gradient overlay         ┆   Cancelled) fully inside│
│    - Insignia + separator + claim + courtesy                ┆ • Palestinian Airlines   │
│    - [Cancelled Ribbon: top-opposite corner, no logo clash] ┆   Insignia               │
│ ─────────────────────────────────────────────────────────── ┆ • Passenger Name (2-line │
│ 2. Central Route & Passenger Row (115fr / ~29.5%):          ┆   compact wrap)          │
│    - FROM: GZA (Gaza) ──[Plane] PS 204──> TO: AMM (Amman)   ┆ • Flight & Route codes   │
│    - Passenger Name (2-line compact wrap) + Type Tag        ┆ • Date                   │
│ ─────────────────────────────────────────────────────────── ┆ • Seat (or "RELEASED")   │
│ 3. Travel Essentials Bar (75fr / ~19.2%):                   ┆ • REF: GZA-7K8P (Box)    │
│    - FLIGHT: PS 204  DATE: 18 SEP 2026                      ┆ • Olive Bottom Band:     │
│    - DEPART: 14:30   ARRIVE: 15:25 (+1)   SEAT: 12A         ┆   PEOPLE · PLACES        │
│ ─────────────────────────────────────────────────────────── ┆   A BRIGHTER TOMORROW    │
│ 4. Decorative Footer Area (75fr / ~19.2%):                  ┆                          │
│    - TKT: PS-0012345 · REF: GZA-7K8P                        ┆                          │
│    - Center Slogan · Olive branch · Skyline approximation   ┆                          │
└─────────────────────────────────────────────────────────────┴──────────────────────────┘
                               ▲
                 Vertical Dashed Perforation (2px dashed #8E8372)
                 with Top & Bottom Notch Cutouts (#E7E1D7)
```

- **Physical Width**: $8.0\text{ inches} = 203.2\text{ mm}$
- **Physical Height**: $3.25\text{ inches} = 82.55\text{ mm}$
- **Aspect Ratio**: $32 / 13 \approx 2.461538$
- **Canvas Resolution**: $960 \times 390\text{ px}$
- **Print Resolution**: $768 \times 312\text{ CSS px}$ ($960 \times 0.8 = 768$, $390 \times 0.8 = 312$)

---

## 4. Print Architecture & Isolation Details

```css
@page {
  size: auto;
  margin: 6mm 3mm;
}
@media print {
  /* Isolate ticket print path and suppress surrounding website chrome when mounted */
  body:has(#mvp-reservation-ticket) header,
  body:has(#mvp-reservation-ticket) footer,
  body:has(#mvp-reservation-ticket) nav,
  body:has(#mvp-reservation-ticket) [data-site-header],
  body:has(#mvp-reservation-ticket) [data-site-footer] {
    display: none !important;
  }
  body:has(#mvp-reservation-ticket) > *:not(:has(#mvp-reservation-ticket)) {
    display: none !important;
  }
  body:has(#mvp-reservation-ticket) main > *:not(:has(#mvp-reservation-ticket)):not(#mvp-reservation-ticket) {
    display: none !important;
  }
  html, body {
    background: #FFFFFF !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body:has(#mvp-reservation-ticket) div:has(#mvp-reservation-ticket),
  body:has(#mvp-reservation-ticket) main:has(#mvp-reservation-ticket) {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    max-width: none !important;
  }

  /* Print root in normal static flow (prevents blank pages and multi-page clipping) */
  #mvp-reservation-ticket {
    position: static !important;
    width: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: transparent !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    visibility: visible !important;
  }
  #mvp-reservation-ticket * {
    visibility: visible !important;
  }

  /* Suppress non-printable UI chrome */
  .gza-ticket-zoom-dialog,
  .gza-ticket-actions,
  .gza-ticket-detail-summary,
  .gza-ticket-disclosure-banner,
  .gza-ticket-cancelled-banner {
    display: none !important;
    visibility: hidden !important;
  }

  /* Multi-pass natural pagination: individual tickets do not break internally */
  .gza-ticket-item-container {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    margin: 0 auto 8mm auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    width: 203.2mm !important;
  }

  /* Scale 960x390 canvas by exactly 0.8 to fit physical 203.2 x 82.55 mm (768 x 312 CSS px) */
  .gza-ticket-scaler-wrapper {
    max-width: none !important;
    width: 203.2mm !important;
    height: 82.55mm !important;
    aspect-ratio: auto !important;
    overflow: visible !important;
    margin: 0 auto !important;
    position: relative !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .gza-ticket-scalable-canvas {
    position: absolute !important;
    top: 0 !important;
    transform: scale(0.8) !important;
    width: 960px !important;
    height: 390px !important;
  }

  :not([dir="rtl"]) .gza-ticket-scalable-canvas {
    left: 0 !important;
    right: auto !important;
    transform-origin: top left !important;
  }

  [dir="rtl"] .gza-ticket-scalable-canvas,
  :dir(rtl) .gza-ticket-scalable-canvas {
    right: 0 !important;
    left: auto !important;
    transform-origin: top right !important;
  }

  .gza-ticket {
    width: 960px !important;
    height: 390px !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    border: 1px solid #8E8372 !important;
  }
}
```

---

## 5. Verification Results

1. **TypeScript Strict Type Check**:
   - Command: `npx tsc --noEmit`
   - Output: **0 errors** across entire project.
2. **TypeScript Mapper Unit Tests**:
   - Command: `node --test --experimental-strip-types tests/unit/ticket-presentation.test.ts`
   - Output: **24 passed, 0 failed** (123ms) across signed offsets (+1,+2,-1,0), status fail-closed, aircraft omission, bidi formatting, and owner-neutral classification.
3. **Focused ESLint Check**:
   - Command: `npx eslint src/components/booking/commemorative-ticket.tsx tests/unit/ticket-presentation.test.ts scratch/ticket-visual.tsx`
   - Output: **0 errors**.

---

## 6. Preserved Boundaries & Invariants

1. **Git State**: Local working directory remains uncommitted and unstaged.
2. **Backend & Bridge Untouched**: No modifications made to backend PHP files or `mvp-reservation-views.tsx`.
3. **Browser Automation**: No headless browser, screenshot, or PDF export commands executed.

## Final owner acceptance and wording changes (2026-10-16)

The owner accepted the final ticket artwork and instructed that its visual design
remain unchanged. The traditional 8 × 3.25-inch (203.2 × 82.55 mm) format is an
owner-approved design choice, not a claim that IATA mandates one stock size.
The rendered landscape canvas measures 960 × 390 CSS pixels (2.461538:1), with
approximately 78% main pass and 22% detachable stub. At a 390px browser viewport,
the measured card is 343 × 139.34375px, retaining the same ratio.

The final artwork uses a continuous cream/sand gradient across the main ticket
and stub, a fuller reference/message/skyline footer, stronger architectural
linework, and extra-bold Arabic (40px) and English (18px) destination mottos with
no text backing. Confirmed status appears in the separate booking details;
cancelled artwork retains a cancellation indication and truthful released seats.

The owner explicitly superseded the earlier display-copy requirements: remove
future-concept/AI disclaimers, not-valid-for-travel copy, and commemorative ticket
titles from the public presentation and emails. Neutral Ticket / Itinerary labels
remain. Internal booking/media classifications, historical records and access
controls are preserved. Visible LTR/RTL suffixes are removed without changing
actual language direction. These instructions do not authorize production writes.

Mobile preserves the full physical pass and provides a separate accessible detail
summary. The full-size viewer pans horizontally. Its close behavior restores focus
to the opening control; the dialog carries its own locale/direction. Print keeps
the 960 × 390 canvas and scales it by exactly 0.8 to 768 × 312 CSS pixels, which is
203.2 × 82.55 mm at CSS print units. Conditional print isolation keeps surrounding
site UI out of the print flow and retains one pass per segment.

The owner supplied ticket-visual.pdf, retained as evidence/ticket-owner-print.pdf
(SHA-256 162530708f056cab6e3d0522874242a58e2012e9f4f4abe32bf5d174d6fb712a).
The owner subsequently requested that further design verification stop. Additional
PDF export/composition checking was stopped accordingly; independent PDF physical
measurement is not claimed. Existing before/after browser captures are component
fixtures using synthetic records and do not certify a completed guest booking.
