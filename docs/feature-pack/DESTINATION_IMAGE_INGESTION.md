# Destination Image Ingestion — Expanded Memorial Network (Slice 4)

## 1. Executive Summary

This document records the architecture, reproducible ingestion pipeline, editorial standards, and verification metrics for the **13 owner-supplied destination photos** ingested to complete visual coverage across all **20 memorial network cities** for Palestinian Airlines from Gaza International Airport (GZA).

All 13 owner-supplied raw JPG originals in `scratch/inputs/cities/` were processed through an automated, reproducible Python pipeline into modern, responsive WebP variants. The 7 pre-existing destination photos (`city-amman`, `city-cairo`, `city-doha`, `city-dubai`, `city-istanbul`, `city-jeddah`, `city-riyadh`) remain preserved and untouched.

### Key Metrics
- **Cities Ingested**: 13 (Abu Dhabi, Athens, Beirut, Frankfurt, Kuala Lumpur, Kuwait City, London, Madrid, Mumbai, New York, Paris, Rome, Toronto)
- **Total Network Cities with Genuine Photos**: 20
- **Responsive Variants per City**: 5 (`480w`, `800w`, `1200w`, `1600w`, `1920w`)
- **Total Generated Assets**: 65 WebP files (100 total across all 20 cities)
- **Raw Input Size**: 46,944,841 bytes (44.77 MB)
- **Total WebP Output Size**: 9,130,952 bytes (8.71 MB)
- **Total Storage Reduction**: 37,813,889 bytes (**80.55% space savings**)
- **Quality & Method**: WebP Quality 80, Method 6 (lossless preprocessing, EXIF orientation normalized, metadata stripped)

---

## 2. Ingestion Pipeline & Architecture

### 2.1 Reproducible Script
The ingestion script is maintained at `scripts/ingest_destination_photos.py` using Pillow (PIL) with native WebP support.
It executes the following deterministic steps:
1. **SHA-256 Checksum Calculation**: Hashes each raw input file in `scratch/inputs/cities/`.
2. **EXIF Normalization**: Invokes `PIL.ImageOps.exif_transpose()` to ensure correct orientation before processing.
3. **Metadata Stripping**: Discards camera EXIF tags, GPS tags, and vendor profiles to eliminate unnecessary payload bloat and ensure privacy.
4. **Lanczos Downsampling**: Computes aspect-preserving heights for target responsive widths `[480, 800, 1200, 1600, 1920]`. Since every raw photo native width exceeds 3600px (up to 8605px), zero upscaling occurred.
5. **WebP Encoding**: Encodes with `quality=80` and `method=6` for optimal web delivery and contrast rendering.
6. **Manifest Recording**: Emits full JSON telemetry to `scratch/destination_ingestion_manifest.json`.

### 2.2 City Mapping & Asset Slugs
| City | IATA Code | Photo ID | Asset Slug | Raw Source File | Raw Resolution | 1920w Resolution |
|---|---|---|---|---|---|---|
| Abu Dhabi | AUH | `city-abu-dhabi` | `abu-dhabi` | `Abu-Dhabi.jpg` | 5084 × 3431 | 1920 × 1296 |
| Athens | ATH | `city-athens` | `athens` | `Athens.jpg` | 3648 × 2736 | 1920 × 1440 |
| Beirut | BEY | `city-beirut` | `beirut` | `beirut.jpg` | 8605 × 4587 | 1920 × 1023 |
| Frankfurt | FRA | `city-frankfurt` | `frankfurt` | `Frankfurt.jpg` | 4928 × 3264 | 1920 × 1272 |
| Kuala Lumpur | KUL | `city-kuala-lumpur` | `kuala-lumpur` | `Kuala Lumpur.jpg` | 5988 × 3992 | 1920 × 1280 |
| Kuwait City | KWI | `city-kuwait-city` | `kuwait-city` | `Kuwait.jpg` | 5789 × 3737 | 1920 × 1239 |
| London | LHR | `city-london` | `london` | `London.jpg` | 5184 × 3456 | 1920 × 1280 |
| Madrid | MAD | `city-madrid` | `madrid` | `Madrid.jpg` | 8256 × 5504 | 1920 × 1280 |
| Mumbai | BOM | `city-mumbai` | `mumbai` | `Mumbai.jpg` | 6000 × 4000 | 1920 × 1280 |
| New York | JFK | `city-new-york` | `new-york` | `New-York.jpg` | 7952 × 5071 | 1920 × 1224 |
| Paris | CDG | `city-paris` | `paris` | `Paris.jpg` | 4731 × 3154 | 1920 × 1280 |
| Rome | FCO | `city-rome` | `rome` | `Rome.jpg` | 7008 × 4672 | 1920 × 1280 |
| Toronto | YYZ | `city-toronto` | `toronto` | `Toronto.jpg` | 5851 × 3901 | 1920 × 1280 |

---

## 3. Editorial Provenance & Truth Policy

### 3.1 Strict Separation of Archives and Editorial Content
- **Not Historical Airport Evidence**: These photographs represent contemporary cityscapes of destination cities in the commemorative Palestinian Airlines route network. They are owner-supplied editorial assets and must never be cited as historical archive records of Gaza International Airport.
- **No AI Fabrication**: No generative outpainting or artificial landmark fabrication was performed. Real photographic pixels provided by the project owner were cropped and downsampled directly.
- **Accurate Bilingual Alt Descriptions**: Alt texts describe visible pixel subjects accurately in both English and Arabic without exaggerations or speculative claims.

### 3.2 Selected Focal Points & Bilingual Descriptions
1. **Abu Dhabi (`AUH`)**:
   - Focal point: `{ x: 65, y: 50 }` (waterfront skyline towers)
   - EN: *"Modern waterfront skyline and towers in Abu Dhabi under daylight sky"*
   - AR: *"أفق وأبراج الواجهة البحرية الحديثة في أبوظبي في وضح النهار"*
2. **Athens (`ATH`)**:
   - Focal point: `{ x: 55, y: 50 }` (Mount Lycabettus rising over city)
   - EN: *"Daylight panoramic view across Athens towards Mount Lycabettus"*
   - AR: *"مشهد بانورامي نهاري لمدينة أثينا باتجاه تلة ليكابيتوس"*
3. **Beirut (`BEY`)**:
   - Focal point: `{ x: 45, y: 55 }` (Raouche Pigeon Rocks and Mediterranean shoreline)
   - EN: *"Raouche Pigeon Rocks off the Mediterranean coastline in Beirut"*
   - AR: *"صخرة الروشة على ساحل البحر الأبيض المتوسط في بيروت"*
4. **Frankfurt (`FRA`)**:
   - Focal point: `{ x: 50, y: 50 }` (Main river bridge and financial skyline)
   - EN: *"Main river bridge and financial skyline of Frankfurt in daylight"*
   - AR: *"جسر نهر الماين وأفق الحي المالي في فرانكفورت في وضح النهار"*
5. **Kuala Lumpur (`KUL`)**:
   - Focal point: `{ x: 50, y: 45 }` (Petronas Twin Towers)
   - EN: *"Petronas Twin Towers and central cityscape in Kuala Lumpur"*
   - AR: *"برجا بتروناس التوأم ووسط مدينة كوالالمبور"*
6. **Kuwait City (`KWI`)**:
   - Focal point: `{ x: 55, y: 45 }` (Liberation Tower and traditional mosque minaret)
   - EN: *"Kuwait City skyline featuring the Liberation Tower and mosque minaret"*
   - AR: *"أفق مدينة الكويت مع برج التحرير ومئذنة المسجد"*
7. **London (`LHR`)**:
   - Focal point: `{ x: 60, y: 50 }` (Palace of Westminster and Elizabeth Tower)
   - EN: *"River Thames and Palace of Westminster with Elizabeth Tower in London"*
   - AR: *"نهر التيمز وقصر وستمنستر وبرج إليزابيث في لندن"*
8. **Madrid (`MAD`)**:
   - Focal point: `{ x: 50, y: 50 }` (Cybele Palace and Gran Vía boulevard)
   - EN: *"Cybele Palace architecture and boulevard in central Madrid"*
   - AR: *"عمارة قصر الاتصالات وميدان سيبيليس في وسط مدريد"*
9. **Mumbai (`BOM`)**:
   - Focal point: `{ x: 50, y: 40 }` (Gateway of India waterfront monument)
   - EN: *"Gateway of India monument on the waterfront in Mumbai"*
   - AR: *"نصب بوابة الهند على الواجهة البحرية في مومباي"*
10. **New York (`JFK`)**:
    - Focal point: `{ x: 50, y: 45 }` (Central Park and midtown skyline)
    - EN: *"Daylight view over Central Park towards Midtown Manhattan skyscrapers"*
    - AR: *"إطلالة نهارية فوق سنترال بارك باتجاه ناطحات سحاب مانهاتن"*
11. **Paris (`CDG`)**:
    - Focal point: `{ x: 60, y: 50 }` (Parisian rooftops towards Eiffel Tower)
    - EN: *"Parisian rooftops leading towards the Eiffel Tower under clear sky"*
    - AR: *"أسطح المباني الباريسية الكلاسيكية باتجاه برج إيفل تحت سماء صافية"*
12. **Rome (`FCO`)**:
    - Focal point: `{ x: 50, y: 40 }` (Colosseum amphitheatre arches)
    - EN: *"Exterior stone arches of the Colosseum in central Rome"*
    - AR: *"الأقواس الحجرية الخارجية لمدرج الكولوسيوم في وسط روما"*
13. **Toronto (`YYZ`)**:
    - Focal point: `{ x: 50, y: 52 }` (Lake Ontario waterfront and CN Tower)
    - EN: *"Lake Ontario waterfront skyline with CN Tower in Toronto"*
    - AR: *"واجهة بحيرة أونتاريو البحرية وأفق مدينة تورونتو مع برج سي إن"*

---

## 4. Codebase Integration Details

### 4.1 Base Registry (`src/lib/destination-media-base.ts`)
- Preserves **zero Vite imports** so that Node.js test runners (`node --test --experimental-strip-types`) can import it without bundle transformation.
- Expands `DestinationPhotoId` union type with all 20 entries.
- Updates `APPROVED_DESTINATION_CODES = ALL_NETWORK_DESTINATION_CODES` (20 codes).
- Adds all 20 entries to `APPROVED_DESTINATION_PHOTO_IDS` and `DESTINATION_PHOTO_METADATA` with verified intrinsic dimensions and default focal points.

### 4.2 Asset Loader (`src/lib/destination-media.ts`)
- Imports the 65 newly generated WebP variants across the 5 responsive widths.
- Registers all 20 photo records in `DESTINATION_PHOTOS` via `attachSources()`.
- Maps all 20 IATA destination codes directly in `DESTINATION_PHOTO_BY_CODE`.

### 4.3 CMS Schema & Content Types (`src/content/schema.ts`, `src/content/types.ts`)
- **Backend/Frontend Parity**:
  - `DestinationPhotoAssignment['code']`: expanded to `DestinationCode` (all 20 approved network codes).
  - `CoreDestinationCode`: strictly preserved for `DestinationEditorialEntry['code']` (`"AMM" | "CAI" | "DOH" | "DXB" | "IST" | "JED" | "RUH"`), ensuring no unapproved expansion of `destinations.editorial`.
  - `destinations.presentation` Zod schema: relaxed to `min(7).max(20)` unique assignments with a `.refine()` rule enforcing that all 7 core destination codes remain present.
  - Legacy 7-assignment presentation documents parse and validate with zero modifications.
  - Published presentation fallback in `src/content/published/destinations-presentation.ts` contains all 20 city photo and focal defaults, while keeping the 7 core assignments intact.

### 4.4 Backend Validation Authority (`backend/app/Editorial/Validation/EditorialValidator.php`)
- **`DESTINATION_PHOTO_IDS`**: Expanded from 7 to all 20 photo IDs (`city-amman`, `city-cairo`, ..., `city-toronto`).
- **`DESTINATION_CODES`**: Preserved strictly as the 7 core codes (`AMM`, `CAI`, `DOH`, `DXB`, `IST`, `JED`, `RUH`), maintaining closed-shape validation for `destinations.editorial`.
- **`PRESENTATION_DESTINATION_CODES`**: Added containing all 20 network codes (`AMM`, `CAI`, ..., `YYZ`).
- **`validateDestinationsPresentation()`**:
  - Validates `count($payload['assignments']) >= 7 && count($payload['assignments']) <= 20`.
  - Enforces unique codes within `PRESENTATION_DESTINATION_CODES`.
  - Enforces `photoId` within `DESTINATION_PHOTO_IDS`.
  - Strictly requires all 7 core destination codes (`DESTINATION_CODES`) to be present in the assignments.
  - Preserves closed-shape validation and coordinate bounds `[0..100]` for focal points.

### 4.5 Admin CMS Route (`src/routes/{-$locale}.admin.destinations.$code.tsx`)
- **Not-Found Guard**: Expanded to check `isDestinationCode(code) || Boolean(legacyEditorial) || Boolean(currentEditorial)`, allowing admin staff to access any of the 20 network destinations without blocked navigation.
- **Virtual Fallback Assignment**: When navigating to an expanded destination whose presentation entry is not yet in the loaded document (e.g., from a stored legacy 7-assignment draft), the component derives `effectiveAssignment` from the genuine media registry (`getDestinationPhotoByCode(code)`).
- **Append-on-Edit**: `updatePresentation` updates existing entries by code, or appends a new assignment to `draft.assignments` upon explicit user mutation. Unedited documents remain completely unchanged with no phantom records or forced migrations.
- **Editorial Separation**: The editorial narrative section (`currentEditorial`) renders only when an editorial entry exists, avoiding synthetic CMS records.

### 4.6 Public Destination Route Guarding (`src/routes/{-$locale}.destinations.$code.tsx`)
- Safely falls back if a destination does not have an explicit `destinations.editorial` entry:
  - `editorial?.blurb`: renders city travel overview copy when no custom editorial blurb is authored.
  - `editorial?.goodToKnow`: renders symbolic network route guidance rather than throwing an undefined exception.
- Destination hero photos resolve dynamically via `(assignment && getDestinationPhotoById(assignment.photoId)) ?? getDestinationPhotoByCode(destination.code)`.

---

## 5. Verification & Test Coverage

### 5.1 Unit Tests
- `tests/unit/destination-media.test.ts` (14 passing tests):
  - Asserts all 20 approved destination photo entries exist in metadata and base registry.
  - Asserts all 100 responsive WebP assets exist on disk and have non-zero file sizes.
  - Verifies that all 20 codes map to 5 variants with intrinsic width 1920 and height > 1000.
  - Verifies static asset wiring integrity for all 20 photo IDs and codes in `destination-media.ts`.
  - Validates published 20-destination presentation document.
  - Validates legacy 7-item presentation documents.
  - Rejects presentations with missing core codes, duplicate codes, unknown destination codes, fewer than 7 items, unknown photo IDs, or out-of-range focal coordinates.
  - Simulates Admin UI append logic, asserting that adding a new destination preserves existing overrides and all 7 core assignments.
  - Validates `LocalContentRepository` draft persistence and discard lifecycle.
- `tests/unit/network-frontend-expansion.test.ts` (3 passing tests):
  - Asserts that all 20 genuine photo catalog entries are admitted (`APPROVED_DESTINATION_PHOTO_IDS.length === 20`, `DESTINATION_PHOTO_METADATA` contains `JFK`).
- `backend/tests/Unit/Editorial/EditorialValidatorTest.php` (10 assertions):
  - Pure PHPUnit test class exercising `EditorialValidator`.
  - Verifies admission of core 7 and full 20 presentation payloads.
  - Verifies partial expansion (8 items) with newly whitelisted photo IDs.
  - Asserts rejections for missing core codes, duplicate codes, unknown codes (`XYZ`), unknown photo IDs (`fake-photo`), out-of-range focal points (`x: 150`), and fewer than 7 assignments.
  - Asserts strict preservation of closed 7-item schema for `destinations.editorial`.
- **TypeScript Typecheck**:
  - `npx tsc --noEmit` completes with **0 errors and 0 warnings**.

### 5.2 Storage Integrity Invariants
- Original raw input JPGs in `scratch/inputs/cities/` are retained and untouched.
- No raw images are committed to version control.
- No network requests, API calls, or database mutations are executed.
