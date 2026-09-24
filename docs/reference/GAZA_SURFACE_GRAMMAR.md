# Gaza Surface Grammar — Engineering Architecture & Component Reference

> **Document Status**: Production Architecture & Component Reference — Stage 2 (Visual System B Preview Pass)<br>
> **Canonical Source**: `src/design/surfaces/`<br>
> **Scope**: Browser-local preview pass (`?skinPreview=1`) across Flight Selection, Guided Booking Flow, Heritage & Future Airport Dossiers, Passenger Travel Guides, and Admin Appearance Lab (`/admin/settings?tab=appearance`).

---

## 1. Architectural Motivation & Principles

Historically, modern web applications default to monotonous "white card on grey canvas" treatments (`bg-card border border-border rounded-xl shadow-xs`). While functional, generic styling flattens informational hierarchy, induces visual fatigue, and erases the distinct civic identity of Gaza International Airport.

The **Gaza Surface Grammar** introduces an authored, semantic structural system that transforms generic containers into calm, tactile, aeronautical surfaces:
1. **Materiality Grounded in Authentic Tokens**: Warm Mediterranean limestone (`--sand`, `--sand-deep`), crisp Mediterranean sunlight (`--background`, `--card`), deep olive-green brand (`--brand`, `--primary`, `--surface-olive-soft`), baked terracotta clay (`--clay`), and dark ink archival framing (`--ink`). All materials are 100% opaque to guarantee ambient wallpaper patterns never bleed through transactional cards.
2. **Aeronautical Precision**: Structural rails (`border-inline-start`), technical index flags (`01 · PS 204`), tabular data ledgers with strict LTR isolation, and route datums (`GZA ──── PS 204 ──── AMM`).
3. **Strict Archival Truth & Restraint**: Decorative motifs never overwhelm content, never masquerade as authentic historical artifacts, and are strictly distinct from Palestinian tatreez or folkloric embroidery. Visual studies are explicitly disclosed as documentary or illustrative (`Concept Study · Illustrative` / `دراسة تصورية · توضيحي`).
4. **Logical Directionality**: Universal logical CSS properties (`border-s-[4px]`, `border-s-[5px]`, `start-0`, `end-0`) ensure seamless, automatic physical mirroring between English (LTR) and Arabic (RTL). Technical identifiers (flight codes, dates, times, PNRs) remain strictly LTR.
5. **Zero Baseline Drift**: Production URLs without `?skinPreview=1` retain the exact baseline production appearance. Preview choices are stored in browser local storage (`gza.skin.preview.v1`) and activated only when `?skinPreview=1` is present or when inside the Appearance Lab.

---

## 2. Implemented Schema & Concrete Enums

The system is defined in `src/design/surfaces/types.ts` with exact TypeScript enums:

### 2.1 Enums

- **Semantic Families (`SurfaceFamilyId`)**:
  `"operational"` | `"fare"` | `"dossier"` | `"form-sheet"` | `"guide"` | `"editorial"`
- **Structural Frames (`SurfaceFrame`)**:
  `"plain"` | `"rail"` | `"indexed"` | `"ticket"` | `"chapter"`
- **Material Tones (`SurfaceTone`)**:
  `"paper"` | `"limestone"` | `"olive-soft"` | `"olive"` | `"ink"` (all 100% opaque)
- **Accent Tokens (`SurfaceAccent`)**:
  `"none"` | `"brand"` | `"clay"` | `"brass"`
- **Corner Radii (`SurfaceRadius`)**:
  `"compact"` (`rounded-lg`) | `"soft"` (`rounded-xl`) | `"editorial"` (`rounded-2xl`)
- **Elevation Profiles (`SurfaceElevation`)**:
  `"flat"` (`shadow-none`) | `"soft"` (`shadow-[var(--shadow-soft)]`) | `"lift"` (`shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5`)
- **Pattern Placements (`PatternPlacement`)**:
  `"none"` | `"rail"` | `"header"` | `"corner"` | `"watermark"`
- **Pattern Motifs on Surfaces (`PatternId`)**:
  `"none"` | `"gza-lattice"` | `"runway-datum"` | `"pie-factory"`
- **Pattern Intensity (`PatternIntensity`)**:
  `"off"` (0) | `"very-subtle"` (0.04–0.06) | `"subtle"` (0.08–0.12) | `"present"` (0.14–0.20)
- **Pattern Scale (`PatternScale`)**:
  `"small"` (18–24px) | `"standard"` (32–48px) | `"large"` (48–64px)

---

## 3. The 6 Semantic Families & Canonical Defaults

Each family has an authored default recipe (`DEFAULT_SURFACE_RECIPES` in `src/design/surfaces/presets.ts`):

| Family | Role in Application | Default Frame | Default Tone | Default Accent | Default Radius | Default Elevation | Default Placement | Default Pattern | Media Allowed? |
|---|---|---|---|---|---|---|---|---|---|
| **`operational`** | Flight cards, seat selection cards, airfield telemetry | `rail` | `paper` | `brand` | `compact` | `flat` | `none` | `none` | No |
| **`fare`** | Coherent fare tier options (`01 Essential`, `02 Classic`, `03 Flex`) | `indexed` | `paper` | `brand` | `soft` | `soft` | `none` | `none` | No |
| **`dossier`** | Passenger trip summary, checkout price ledger, booking review dossier | `ticket` | `paper` | `clay` | `compact` | `soft` | `none` | `none` | No |
| **`form-sheet`** | Passenger details, document upload, contact forms (zero pattern behind inputs) | `plain` | `paper` | `none` | `soft` | `flat` | `none` | `none` | No |
| **`guide`** | Passenger travel advice, terminal navigation, baggage policies | `rail` | `limestone` | `brass` | `soft` | `soft` | `header` | `none` | Yes |
| **`editorial`** | Airport heritage chapters, Future Vision architectural proposals | `chapter` | `ink` | `clay` | `editorial` | `flat` | `watermark` | `none` | Yes |

---

## 4. Per-Family Allowlist Matrix

Enforced at compile time and runtime via `FAMILY_ALLOWLISTS` in `src/design/surfaces/allowlists.ts`:

```ts
export const FAMILY_ALLOWLISTS: Record<SurfaceFamilyId, FamilyAllowlist> = {
  operational: {
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "corner"],
    mediaAllowed: false,
  },
  fare: {
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "header", "corner"],
    mediaAllowed: false,
  },
  dossier: {
    frames: ["plain", "rail", "indexed", "ticket"],
    tones: ["paper", "limestone", "olive-soft", "olive", "ink"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["compact", "soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "watermark"],
    mediaAllowed: false,
  },
  "form-sheet": {
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone"],
    accents: ["none", "brand"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft"],
    patternPlacements: ["none", "rail"],
    mediaAllowed: false,
  },
  guide: {
    frames: ["plain", "rail", "indexed", "chapter"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "corner"],
    mediaAllowed: true,
  },
  editorial: {
    frames: ["plain", "rail", "indexed", "chapter"],
    tones: ["paper", "limestone", "olive-soft", "olive", "ink"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "corner", "watermark"],
    mediaAllowed: true,
  },
};
```

---

## 5. Pattern Artworks & Honest Provenance

Only three active pattern motifs plus `"none"` are permitted on surfaces in this preview pass:

| Pattern ID | Display Name | Source | License | Geometric Motif & Cultural Provenance |
|---|---|---|---|---|
| `none` | None | System | N/A | Completely removes pattern overlay from the surface. |
| `gza-lattice` | Gaza Lattice — Experimental | `gza` (Project) | `project` | Modern architectural concourse diagrid truss / solar shading geometry inspired by airport terminal roof framing. **Non-folkloric, non-tatreez**. |
| `runway-datum` | Runway Datum — Experimental | `gza` (Project) | `project` | Technical aviation centerline datum, threshold hash marks, and touchdown zone indicators. **Non-folkloric, non-tatreez**. |
| `pie-factory` | Pie Factory | `hero-patterns` | `CC BY 4.0` | Geometric pattern artwork by **Steve Schoger** ([Hero Patterns](https://heropatterns.com)). Rendered with tone-adaptive stroke (`#FAF6EE` on dark surfaces, `#073724` on light surfaces). |

> **Bundle Isolation Guarantee**: Heavy SVG pattern strings (e.g. Topography `M600 325.1` and Circuit Board `M44.1 224a5`) remain isolated to the lazy `skin-preview-*.js` chunk. They are never imported into initial application chunks or ordinary routes.

---

## 6. Reusable Production Primitives

Located in `src/design/surfaces/primitives.tsx` and exported via `src/design/surfaces/index.ts`:

### 6.1 `<GazaSurface>`
Polymorphic container supporting `div`, `article`, `section`, `aside`, `form`, etc.
- In preview mode (`useGrammar === true`), resolves recipes via `useSurfaceRecipe(family)`.
- In baseline mode (`useGrammar === false`), renders using `baselineClassName`, enforcing **zero baseline drift**.

### 6.2 `<SurfaceRail>`
Inline-start structural rail (3–6px or 8–12px chapter). Automatically mirrors to the right in Arabic (RTL) via `border-inline-start`.

### 6.3 `<SurfaceIndex>`
Monospace technical index marker (e.g. `01`, `02`, `PS 204`, `MANIFEST`) with isolated LTR directionality.

### 6.4 `<SurfaceDatum>`
Aviation route datum layout (`ORIGIN ──── FLIGHT ──── DEST`) with centered flight badge.

### 6.5 `<SurfaceLedger>`, `<SurfaceLedgerRow>`, `<SurfaceLedgerTotal>`
Financial and pricing breakdown docket with dashed architectural rules and aligned numerals.

### 6.6 `<SurfaceMedia>`
Constrained media frame with mandatory truth classification label:
- Arabic: `"دراسة تصورية · توضيحي"`
### 6.7 `<GazaSurface target={...}>` & Semantic Target Registry
The polymorphic `<GazaSurface>` now accepts an optional `target?: TargetId` attribute, which:
1. Emits `data-surface-target="<targetId>"` on the container DOM element, enabling the parent Appearance Studio to detect, highlight, and select the component in Inspect Mode.
2. Resolves component-level recipe overrides configured in `config.surfaceGrammar.targetOverrides[targetId]` using `resolveTargetRecipe(family, targetId, config)` via `useSurfaceRecipe(family, targetId)`.
3. Validates all overrides through `sanitizeTargetOverride(targetId, override)` against strict per-target allowlists.

---

## 7. Media Truthfulness & Integrity Guardrails

1. **Illustrative Classification**: All future terminal visual studies are classified as `illustrative`.
2. **Historical Accuracy**: Archive imagery provenance must never be fabricated. Future AI renderings must never substitute for past evidence.
3. **Operational Truth**: Flight statuses (`Scheduled`, `Delayed`, `Cancelled`) must reflect actual `flight.status` exactly once. Never normalize or fabricate operational status to fill a UI design slot.
4. **Form Ergonomics**: Form sheet backgrounds (`form-sheet`) must remain completely free of patterns behind input elements to preserve legibility and accessibility.
5. **Target Boundaries**: Operational, Fare, Dossier, and Form Sheet components are strictly disallowed from media overrides (`mediaAllowed: false`). Guide and Editorial components only accept approved media items from `src/lib/media.ts` with truth classification. AI concept visualizations are strictly prohibited on Past and Present chapters.

---

## 8. Appearance Studio Architecture (`src/components/admin/appearance-studio/`)

The **Appearance Studio** replaces the former static lab at `/admin/settings?tab=appearance` with an interactive authoring workspace:
1. **Inspector Panel (~420px)**:
   - Target breadcrumb navigation and quick selector across all 20 targets (Canvases, Families, and Component recipes).
   - Dynamic controls filtered by `meta.allowedControls` (Frame, Tone, Accent, Radius, Elevation, Pattern, Intensity, Scale, Media Treatment).
   - Reset individual target recipe or all surface grammar overrides.
2. **Persistent Iframe Preview Pane**:
   - Sandboxed real-route preview loading real application routes with `?studioPreview=1`.
   - Dynamic route & scenario switcher covering Home, Booking (Results, Fare, Passengers, Seats, Extras, Review), Travel (Preparing, Baggage, Accessibility), and Airport (Overview, Future Vision).
   - Strict CSS media-query viewport emulator: `1440px`, `1280px`, `768px`, `390px`, `320px`, and `Fit`.
   - Scale control: Fit vs 100% (using CSS transform scale to prevent breaking viewport responsive queries).
   - Inspect Mode vs Browse Mode with bidirectional postMessage target synchronization.
   - Baseline vs Draft comparison toggle.
3. **Studio Isolation & Store Safety**:
   - `isStudioPreviewActive()` guarantees `StoreProvider` never reads from or writes to `localStorage` (`gza.store.v1`). All scenarios run off deterministic mock fixtures with zero data leakage.
4. **Retained Design System Specimens Sub-View**:
   - The former Surface Lab is preserved as a dedicated "Design System Specimens" tab within the Appearance Studio workspace for direct archetypal comparison.

---

## 9. Current Implementation Scope vs. Future Possibilities

### Implemented in Current Pass (Visual System B.1):
* Typed Semantic Target Registry across 20 targets (`src/design/surfaces/targets.ts`).
* Full-featured responsive Appearance Studio (`src/components/admin/appearance-studio/`).
* Typed Parent <-> Iframe communication protocol (`src/lib/studio-protocol.ts`).
* Deterministic mock fixtures and isolated scenario matrix (`src/lib/studio-scenarios.ts`).
* Production component `data-surface-target` tagging and override resolution across Booking, Travel, Airport, and Home.
* Retained Design System Specimens sub-view.
* Zero baseline drift on production URLs without preview parameters.

### Proposed Future Possibilities (Not Implemented in this Pass):
* Global publishing of custom surface themes to production cPanel without `?skinPreview=1`.
* Exporting theme presets as JSON or downloadable CSS token bundles.
* Additional project SVG motifs beyond `gza-lattice` and `runway-datum`.
