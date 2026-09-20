# Gaza Airport & Palestinian Airlines — Visual Design System

## 1. Identity & Philosophy

The visual design system honors the authentic heritage of **Gaza International Airport (Yasser Arafat International Airport, IATA: GZA)** and **Palestinian Airlines (IATA: PS)**.

- **Atmosphere**: Warm limestone, Mediterranean sunlight, ancient olive groves, clay pottery, and dark ink editorial framing.
- **Visual Restraint**: Zero generic SaaS blues, neon accents, or arbitrary purples.
- **Two Distinct Densities**:
  - **Public Experience**: Spacious, editorial, photography-led framing, warm limestone sand surfaces, generous touch targets (min 44px), and rounded-full status badges.
  - **Admin & Operations**: Calm, dense, high-information efficiency, card panels (`surface`), compact table views (36px controls), and rounded-md chips.

---

## 2. Typography System

### Font Families

- **Display**: `"Bricolage Grotesque", "IBM Plex Sans Arabic", system-ui, sans-serif`
  - Expressive character, used for hero titles, section headlines, and prominent brand marks.
- **Body / Sans**: `"Manrope", "IBM Plex Sans Arabic", system-ui, sans-serif`
  - Highly legible geometric sans, balanced for long-form narrative and data display.
- **Monospace / Technical**: `"IBM Plex Mono", ui-monospace, monospace`
  - Tabular numerals, flight numbers, PNRs, IATA codes, timestamps, and financial figures.

### Semantic Typography Roles

| Role             | Utility Class    | Font & Size                                                         | Line Height | Implementation & Product Usage                                                     |
| :--------------- | :--------------- | :------------------------------------------------------------------ | :---------- | :--------------------------------------------------------------------------------- |
| **Title Large**  | `.type-title-lg` | Display, `clamp(1.875rem, 3.5vw, 3rem)` (30–48px), Bold             | 1.15        | Public page headers (`PageHeader` in `src/components/kit.tsx`)                     |
| **Title Medium** | `.type-title-md` | Display, `clamp(1.25rem, 2vw, 1.5rem)` (20–24px), Bold              | 1.25        | Admin page headers (`AdminPageHeader` in `src/components/admin/admin-kit.tsx`)     |
| **Title Small**  | `.type-title-sm` | Display, `1.125rem` (18px), Semibold                                | 1.3         | Section subheadings, empty state titles (`EmptyState` in `src/components/kit.tsx`) |
| **Label**        | `.type-label`    | Body, `0.75rem` (12px), Semibold, Uppercase, Tracking 0.05em        | 1.0 (16px)  | Form input labels (`Field`, `AdminField`), metric titles (`Metric`)                |
| **Table Header** | `.type-th`       | Body, `0.75rem` (12px), Semibold, Uppercase, Tracking 0.05em, Muted | 1.0 (16px)  | Operational data table headers across 13 admin route tables (`th.type-th`)         |
| **Technical ID** | `.code-id`       | Mono, `direction: ltr`, Tabular Numerals, Tracking 0.02em           | Inherit     | Flight numbers (`PS 204`), IATA (`GZA`), PNRs (`GZA-7K8P`), timestamps             |
| **Numeral**      | `.numeral`       | Mono, `direction: ltr`, Tabular Numerals                            | Inherit     | Durations, seat letters, prices                                                    |

---

## 3. Arabic Typographic Invariants & Directionality

1. **Cursive Integrity (No Uppercase / Letter-Spacing Distortion)**:
   - Arabic is an alphabet without grammatical case (no uppercase) and cursive (letters connect).
   - In Latin typography, small labels often use `uppercase` with `letter-spacing: 0.1em+` (`tracking-wider`). In Arabic, adding letter-spacing physically breaks the ligatures between letters, rendering the text disjointed and unreadable.
   - **Central Invariant Rule**: In all RTL contexts (`[dir="rtl"]`), `uppercase` and `letter-spacing` are automatically suppressed on Arabic text (including `h1`–`h6` headings, semantic `.type-title-*` roles, `.eyebrow`, `.type-label`, `.type-th`, and utility classes containing `uppercase` or `tracking-`), while strictly excluding intentionally isolated LTR technical text:
     ```css
     :is([dir="rtl"], [dir="rtl"] *):is(
         h1,
         h2,
         h3,
         h4,
         h5,
         h6,
         .type-title-lg,
         .type-title-md,
         .type-title-sm,
         .eyebrow,
         .type-label,
         .type-th,
         [class*="uppercase"],
         [class*="tracking-"]
       ):not([dir="ltr"], [dir="ltr"] *, .code-id, .code-id *, .numeral, .numeral *) {
       text-transform: none;
       letter-spacing: normal;
     }
     ```
   - **Exclusion Mechanism**: By excluding `[dir="ltr"]`, `.code-id`, and `.numeral` (and their descendants) directly from matching the reset selector, intentionally isolated Latin technical text retains author-level utility classes (`.uppercase`, `.tracking-wider`, `.tracking-[0.16em]`) and `.code-id`'s 0.02em tracking, without requiring `revert` or `!important`.
2. **Technical Identifiers Remain Strict LTR**:
   - Technical identifiers embedded within Arabic text remain left-to-right with isolate bidi via `@utility code-id` and `@utility numeral`:
     ```css
     @utility code-id {
       font-family: var(--font-mono-family);
       direction: ltr;
       unicode-bidi: isolate;
       font-variant-numeric: tabular-nums;
       letter-spacing: 0.02em;
     }

     @utility numeral {
       font-variant-numeric: tabular-nums;
       direction: ltr;
       unicode-bidi: isolate;
     }
     ```
   - Covers: Flight numbers (`PS 204`), Booking refs (`GZA-7K8P`), IATA codes (`GZA`, `AMM`), Seat assignments (`12A`), ISO dates (`2026-09-18`), 24h clock times (`14:30`), phone numbers, and emails.
3. **Logical Directional Properties**:
   - Layout code strictly uses logical Tailwind utilities: `ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s-*`, `rounded-e-*`.

---

## 4. Color Palette & WCAG 2.2 AA Contrast

All colors are declared as CSS `oklch()` tokens in `src/styles.css`.

### Core Palette

| Token                   | OKLCH Value             | Role & Usage                                   | WCAG AA Contrast                  |
| :---------------------- | :---------------------- | :--------------------------------------------- | :-------------------------------- |
| `--background`          | `oklch(0.985 0.006 95)` | Page canvas (warm limestone off-white)         | Baseline canvas                   |
| `--foreground`          | `oklch(0.22 0.02 160)`  | Primary text (deep olive ink)                  | 16.49:1 vs background (AAA)       |
| `--card`                | `oklch(1 0 0)`          | Card / panel surface (pure white)              | Baseline canvas                   |
| `--sand`                | `oklch(0.96 0.015 92)`  | Tinted limestone surface for headers & banners | 14.2:1 vs foreground (AAA)        |
| `--sand-deep`           | `oklch(0.9 0.028 88)`   | Subtle warm border & hover surface             | Canvas accent                     |
| `--muted-foreground`    | `oklch(0.44 0.017 150)` | Secondary text, captions, table headers        | 6.49:1 vs bg, 6.86:1 vs sand (AA) |
| `--primary` / `--brand` | `oklch(0.42 0.085 158)` | Deep Palestinian green                         | 7.66:1 vs white text (AAA)        |
| `--brand-deep`          | `oklch(0.3 0.06 162)`   | Primary button hover / dark accent             | 11.2:1 vs white text (AAA)        |
| `--brand-soft`          | `oklch(0.93 0.03 158)`  | Active row highlight, soft badge background    | Background for dark green text    |
| `--clay`                | `oklch(0.54 0.13 42)`   | Terracotta accent & secondary action button    | 5.10:1 vs white text (AA)         |
| `--clay-soft`           | `oklch(0.94 0.035 55)`  | Soft notice container & info chip bg           | Background for dark clay text     |
| `--ink`                 | `oklch(0.21 0.024 165)` | Dark storytelling sections & admin sidebar     | 15.68:1 vs ink-foreground (AAA)   |
| `--ink-foreground`      | `oklch(0.96 0.01 95)`   | Text on dark ink surfaces                      | 15.68:1 on ink (AAA)              |
| `--ink-muted`           | `oklch(0.74 0.015 120)` | Secondary text on dark ink surfaces            | 7.66:1 on ink (AAA)               |

### Operational Status Colors

| Status Token         | OKLCH Value            | Hue / Character                             | Measured Text Contrast on White Card |
| :------------------- | :--------------------- | :------------------------------------------ | :----------------------------------- |
| `--status-ontime`    | `oklch(0.5 0.1 158)`   | Olive green (On time, confirmed)            | 5.92:1 (Passes AA >= 4.5:1)          |
| `--status-boarding`  | `oklch(0.52 0.13 240)` | Mediterranean slate blue (Boarding)         | 5.34:1 (Passes AA >= 4.5:1)          |
| `--status-delayed`   | `oklch(0.53 0.14 65)`  | Calibrated amber ochre (Delayed, warning)   | 5.45:1 (Passes AA >= 4.5:1)          |
| `--status-cancelled` | `oklch(0.53 0.19 27)`  | Crimson terracotta (Cancelled, error)       | 5.82:1 (Passes AA >= 4.5:1)          |
| `--status-neutral`   | `oklch(0.5 0.015 150)` | Muted limestone slate (Scheduled, archived) | 5.10:1 (Passes AA >= 4.5:1)          |

---

## 5. Surfaces, Elevation & Radii

### Border Radii

- `--radius`: `0.5rem` (8px).
- **Controls & Chips**: `rounded-md` (6px) in dense admin contexts.
- **Cards & Inputs**: `rounded-lg` (8px).
- **Panels & Dialogs**: `rounded-xl` (12px, `.surface`).
- **Hero Containers**: `rounded-2xl` (16px).
- **Badges & Public Pills**: `rounded-full` (9999px).

### Shadows

Natural tinted shadows using low-opacity ink rather than synthetic black:

- `--shadow-soft`: `0 1px 2px oklch(0.22 0.02 160 / 6%), 0 12px 32px -18px oklch(0.22 0.02 160 / 22%)`
- `--shadow-lift`: `0 2px 4px oklch(0.22 0.02 160 / 6%), 0 26px 60px -30px oklch(0.22 0.02 160 / 32%)`

---

## 6. Components & Interactive Rules

### Buttons

- Variants:
  - `primary`: `--primary` background with `--primary-foreground` text; hover `--brand-deep`.
  - `secondary`: `--secondary` background with `--secondary-foreground` text; hover `--sand-deep`.
  - `ghost`: Transparent background with `--foreground` text; hover `--secondary`.
  - `ink`: `--ink` background with `--ink-foreground` text; hover `--brand-deep`.
  - `clay`: `--clay` background with `--primary-foreground` text (5.1:1 contrast).
  - `outline`: Bordered card background with `--foreground` text.
- Sizes:
  - `sm`: Height 36px (`h-9`), padding `px-3 text-sm gap-1.5` (dense admin actions).
  - `md`: Height 44px (`h-11`), padding `px-5 text-sm gap-2` (standard public touch target).
  - `lg`: Height 52px (`h-13`), padding `px-6 text-base gap-2` (hero CTA).

### Form Controls

- Shared base: `rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground`.
- Vertical padding calibrated to `py-2` so text descenders (e.g. `g`, `y`, `p`, `ع`, `ي`, `ر`) remain unclipped inside `h-9` and `h-11` inputs.
- Focus: `:focus-visible` with 2px solid `--color-ring` and 2px offset.

### Badges & Chips

- **Public Pill**: `rounded-full px-2.5 py-1 text-xs font-semibold`.
- **Admin Chip**: `rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap`.

---

## 7. Master UI/UX Modernization Closure Record (Phase 3B)

The UI/UX Modernization Pass successfully converged and hardened all interactive controls, overlays, and responsive behaviors across public and administrative surfaces:

1. **Headless Primitive Foundation**:
   - Standardized on installed `@radix-ui` primitives: `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Tabs`, `Select`, `Switch`, `Checkbox`, and `RadioGroup`.
   - Replaced all ad-hoc focus traps, tab-cycle loops, and manual `document.body.style.overflow` mutations with accessible, battle-tested Radix implementations that guarantee exact focus restoration.

2. **Unified Motion & Reduced Motion Policy**:
   - Functional transitions only (`150ms`–`300ms` ease-out); zero decorative scaling, bouncing, or physics overhead.
   - Strict `motion-reduce:animate-none` compliance across all dialogs, drawers, and spinners.

3. **GazaSheet Consolidation**:
   - Replaced fragmented legacy `AdminSheet` with unified `GazaSheet` across all 11 admin modules (Schedules, Bookings, Flights, Staff, Website CMS, Airport CMS, Check-in, Customers, Products, Activity).
   - Enforced focus containment, Escape key handling, and seamless focus restoration to triggering buttons.

4. **Passenger Pickers & Date Architecture**:
   - `AirportCombobox`: Accessible combobox on `cmdk` with single-click activation, ArrowDown closed navigation, Escape dismissal, and reliable focus return without double toggling.
   - `TravellersCabinPicker`: Split activation model (Radix Popover on desktop, full Dialog on mobile), strict adult/infant clamp logic, roving radio cabin selector, and Done button.
   - `AirlineDatePicker`: Built on `react-day-picker` with centralized `money()` pricing, immutable outbound visual retention during return selection, disabled past/invalid return dates, and Western Latin digits in all locales.
   - `PassengerDobPicker`: Controlled DOB selection with year/month dropdown navigation, ISO draft format (`YYYY-MM-DD`), and strict Latin numeral formatting.

5. **SeatMap 2D Roving Navigation**:
   - Spatial 2D roving `tabIndex` (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) allowing keyboard users to traverse aircraft seating grids smoothly with live region announcements and LTR isolation.

6. **Shared Skeleton & Readiness Family**:
   - Introduced `GazaLoadingState` in `src/components/ui/skeleton.tsx` (re-exported via `kit.tsx`) replacing bare ellipses placeholders with structured, layout-stable skeletons featuring `role="status"` and localized screen-reader announcements.

7. **Admin Hierarchy & Density**:
   - Refined the operational dashboard "Today" summary into 4 primary KPI metrics (Departures, Arrivals, Bookings, Passengers) and a compact secondary signal strip (Delayed, Cancelled, Checked-in, Enquiries, Attention).
   - Standardized `AdminTabs` on Radix Tabs with roving tabindex and arrow navigation across all tabbed admin subviews.
