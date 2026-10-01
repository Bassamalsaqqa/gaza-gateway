# External Asset Attributions

## Hero Patterns (Curated Shortlist & Default Geometry)
- **Assets**:
  - Canonical Default: `pie-factory` ("Pie Factory") 60×60 seamless SVG background pattern.
  - Curated Registry Shortlist: `pie-factory`, `architect`, `graph-paper`, `rails`, `connections`, `signal`, `topography`, `steel-beams`, `overlapping-diamonds`, `floor-tile`, `circuit-board`.
- **Creator**: Steve Schoger
- **URL**: [heropatterns.com](https://heropatterns.com/)
- **License**: Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))
- **Adaptation**: Authored as a portable pure-TypeScript pattern registry (`src/design/patterns/`). Base background and fill colors adapted to the Gaza International Airport / Palestinian Airlines palette:
  - Public canvas: `#FBFAF6` with deep olive `#073724` at 6.5% opacity (`fill-opacity='0.065'`)
  - Sand headers & editorial: `#F5F2E7` with deep olive `#195B3B` at 5.5% opacity (`fill-opacity='0.055'`)
  - Admin workstation: `#FCF9F2` with deep olive `#073724` at 3.5% opacity (`fill-opacity='0.035'`)
  All decorative linework sits beneath content without compromising legibility, operational clarity, or WCAG 2.2 AA contrast compliance.

## Photographic Media & Documentary Records
- **Gaza International Airport Archive (Year 2000)**:
  - `airport-archive-hero-2000`: Historical documentary photograph of the Gaza International Airport passenger terminal in 2000 (`Gaza Airport Archive year 2000.jpg`). Derivative cropped to remove bottom caption strip; original scene and architecture preserved.
  - `gallery-aircraft-archive-2000`: Historical documentary photograph of a Palestinian Airlines aircraft on the apron/tarmac at Gaza International Airport in 2000 (`Archive Airplane year 2000.jpg`). Derivative cropped to remove bottom caption strip.
- **Gaza International Airport Archive (Year 2008 Ruins)**:
  - `airport-present-ruins-2008`: Documentary photograph of Gaza International Airport passenger terminal ruins and architectural dome.
    - **Original File**: `File:Gaza_AirPort_,_Gaza_,_2-1-2011_(47).jpg` via Wikimedia Commons (sourced from Flickr).
    - **Original Master File**: `scratch/masters/gaza-airport-ruins-2008-original.jpg` (64,619 bytes, SHA-256: `a43a0cd51f780b8964c7e7c6827a1503a1b3163dc3596fd0c3eb00db2c0a9100`, native 1109×411).
    - **Author / Credit**: Gisha Access.
    - **Capture Date**: June 13, 2008.
    - **License**: Creative Commons Attribution-ShareAlike 2.0 Generic ([CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)).
    - **Adaptation**: Converted to multi-density responsive WebP variants (480w, 768w, 960w, 1109w); original panoramic framing preserved (no crop). Derivatives total 96,076 bytes, licensed under CC BY-SA 2.0.
- **Present Dossier Decorative Artwork Skins (HC-0)**:
  - `fact-location.webp`, `fact-aero-codes.webp`, `fact-operating-period.webp`, `fact-facility-status.webp`: Four fact card decorative top skins derived from designer PNG masters (`صفحة الحاضر والمستقبل/`).
  - `dossier-boundaries.webp`, `dossier-runway.webp`, `dossier-verification.webp`: Three dossier banner skins derived from designer PNG masters.
  - `spatial-geometry.webp`: Spatial overview skin derived from designer PNG master (`المخطط المساحي وهندسة المطار.png`, green stylized world map).
  - `global-network.webp`: International corridors / global horizons transition skin derived from designer master (`صورة مكررة - المستقبل في 3 مواقع.png`, blue stylized world map).
  - All nine skins total 141,086 bytes (from 383,437 bytes PNG masters) and are classified strictly as decorative UI artwork, outside the evidentiary archive and truth-class photo catalog. Combined new assets total 237,162 bytes.
- **Editorial & Aviation Photography (Illustrative)**:
  - `destinations-hero`: Illustrative aerial photograph of passenger aircraft in flight (`Destinations-hero.jpg`).
  - `travel-info-hero`: Illustrative photograph of modern passenger terminal interior and wayfinding (`travel-info-hero.jpg`).
  - `manage-booking-hero`: Illustrative photograph of departure concourse and passenger service desks (`manager-booking-hero.jpg`).
  - `check-in-hero`: Illustrative photograph of airport passenger boarding gate (`check-in-hero.jpg`).
  - `signin-photo`: Illustrative photograph of commercial aircraft on airport apron (`sign-in-photo.jpg`).
- **Home Utility Rail Decorative Artwork**:
  - `utility-flight-status.webp`, `utility-check-in.webp`, `utility-travel-guidelines.webp`, `utility-airport-heritage.webp`: Four contiguous slices from owner-approved master artwork (`4-cards/`). Decorative image layers mirrored in English LTR to preserve connectivity seams; unmirrored in Arabic RTL.

## Historical Archive Intake Audit & Machine Counts (HC-2)
- **Intake Master Directory**: `images_assets_to_be_used_in_website_after_proper_placement_and_compression/Past` (read-only source intake).
- **Exact Machine-Derived Counts**:
  - Total intake files audited: **58**
  - Unique visual/SHA-256 hashes: **57**
  - Exact byte/visual duplicates: **1** (`past-052` is identical to `past-050`)
  - Newly cleared intake photos: **0** (authorized stance; zero unverified intake photos published)
  - Published archive records in `ARCHIVE_CATALOG`: **1** (`rec-present-ruins-2008` / `airport-present-ruins-2008`, Gisha Access, June 13, 2008, CC BY-SA 2.0)
  - Staging catalog records: **7** (6 video records + `past-050`)
  - Held for provenance / dispute: **1** (`vid-journeyman-2002`, held due to November 2 opening date conflict)
  - Excluded duplicate records: **1** (`past-052` referencing `past-050`)
  - Total records in `ARCHIVE_CATALOG`: **10**
  - Authoritative external source records in `SOURCE_REGISTRY`: **6**
  - New production image assets / derivatives added: **0** (reused existing approved assets)

## Historical Documentary Hero Metadata Clearance Gap (HC-2)
- **`airport-archive-hero-2000`** and **`gallery-aircraft-archive-2000`**:
  - Approved historical-documentary hero assets for `/airport/past` and existing media references.
  - Lack explicit individual photographer credit and open-access licensing paperwork for reusable public catalog distribution.
  - Retained as approved bounded heroes without fabricating provenance or rights, but intentionally excluded from public reusable gallery archive listings (`getPublishedArchiveRecords()`).

## Authoritative External Primary & Contemporary Sources (HC-2)
- **Oslo II Accord (`src-oslo-ii-1995`)**:
  - Israeli-Palestinian Interim Agreement on the West Bank and the Gaza Strip, Annex I (Protocol Concerning Redeployment and Security Arrangements), Article IX (Passenger Terminal and Airfield).
  - Date: September 28, 1995.
  - Repository: United Nations Peacemaker (`peacemaker.un.org`).
- **Associated Press Archive — Opening (`src-ap-1998-opening`)**:
  - News agency contemporary report: "Yasser Arafat Opens Gaza International Airport". Commercial inaugural flight operations.
  - Date: November 24, 1998.
  - Publisher: Associated Press Archive (Story No. 008779).
- **Associated Press Archive — Ribbon Cutting (`src-ap-1998-clinton`)**:
  - News agency contemporary report: "Clinton Cuts Ribbon at Gaza Airport". Official dedication ceremony with President Bill Clinton.
  - Date: December 14, 1998.
  - Publisher: Associated Press Archive (Story No. 010041).
- **ICAO Council Resolution (`src-icao-council-2002`)**:
  - International Civil Aviation Organization 165th Session Resolution on the destruction of Gaza International Airport runway and radar facilities.
  - Date: March 13, 2002.
  - Repository: ICAO Council Working Papers (`icao.int`).
- **Gisha – Legal Center for Freedom of Movement (`src-gisha-2008`)**:
  - Gaza Closure and Civil Aviation Infrastructure Documentation.
  - Date: June 13, 2008.
  - License: Creative Commons Attribution-ShareAlike 2.0 Generic ([CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)).
  - Host: Wikimedia Commons / Flickr.
- **Saleh & Hegab Architectural and Engineering Profile (`src-saleh-hegab-airport`)**:
  - Original architectural and civil engineering project documentation for Gaza International Airport terminal and runway infrastructure.
  - Publisher: Saleh & Hegab Architectural & Engineering Consultants.
