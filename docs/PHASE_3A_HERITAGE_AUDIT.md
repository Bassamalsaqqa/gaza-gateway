# Phase 3A Heritage, Destination & Visitor Experience Audit

> **Run ID**: `20260918-phase-3a-heritage`  
> **Workspace**: `C:\Users\bassa\Documents\GazaAirPort\gaza-gateway`  
> **Baseline Git Commit**: `4a7b9dea6b2502b748d00c011c0067f8c35be33c` on `main`  
> **Git Status at Handoff**: `M src/routeTree.gen.ts` (0 content diffs confirmed via `git diff -- src/routeTree.gen.ts`; Windows CRLF/stat artifact); untracked `.ai/`, `.claude/`, `.codex/`, `.playwright-mcp/`, `docs/PHASE_3A_PUBLIC_AUDIT.md`, and `images_assets_to_be_used_in_website_after_proper_placement_and_compression/` preserved.  
> **Scope**: Bounded Phase 3A workstream 2 of 5 (Heritage, Destination & Visitor Information). No UI source edits, no redesign implementation, no new dependencies, no Git commit or push.

---

## 1. Executive Summary

This audit evaluates the civic memory, cultural archive, destination network, and passenger visitor information surfaces of the Gaza Gateway web application across four core visitor journeys:

1. **Journey 1: The Airport Story (`/airport`, `/airport/past`, `/airport/present`, `/airport/future`)**: Evaluates the tripartite historical narrative (Past $\rightarrow$ Present $\rightarrow$ Future), milestone timeline rendering, badge indicators (`Verified` vs `Placeholder`), site documentary reporting, and future architectural concepts.
2. **Journey 2: Archive & Gallery (`/gallery`)**: Evaluates category and era filtering, 24-item media grid, lightbox modal viewer dialog, keyboard controls (Escape, ArrowLeft, ArrowRight), credit/metadata attribution, and empty state resilience.
3. **Journey 3: Destinations & Network (`/destinations`, `/destinations/$code`)**: Evaluates the regional destination directory, real-time query search, key flight metrics, schedule days, and uncovers a critical **TanStack Router parent collision defect** where the destination detail route (`/destinations/$code`) is occluded by the parent route list.
4. **Journey 4: Visitor Information, Travel Guide & Contact (`/travel`, `/contact`, `/about`)**: Evaluates passenger preparation guidelines, baggage allowances, accessibility disclosures, contact form validation and mock-submission feedback, and institutional project provenance statements.

### Key Audit Findings Summary

| Surface / Flow | Current Implementation State | Confirmed Defects & Architecture Gaps | Accessibility & Responsiveness (WCAG 2.2 AA) | Recommendation & Direction |
|---|---|---|---|---|
| **Airport Story** (`/airport/*`) | Clean tripartite structure (`/past`, `/present`, `/future`) with dark-ink headers, milestone rail, and factual disclaimers. | Footer navigation completely omits `/airport/present` (lists only `/airport`, `/past`, `/future`). Past sources panel links forward to `/gallery` and `/present`, but Present links only to `/future`, and Future lacks a backlink to Present. | Semantic `<ol>` list with clean `<h1>`/`<h2>` hierarchy. RTL border rail (`border-s`) flips seamlessly. High legibility on dark ink using design system tokens (`--ink` surface with `--ink-foreground` text). | **CONSOLIDATE & COMPLETE NAV**: Add Present to footer Discover column; implement persistent chapter sub-navigation bar across all three chapters. |
| **Archive Gallery** (`/gallery`) | 24 mock items filterable by 4 categories and 3 eras; full-screen lightbox modal with metadata and previous/next controls. | **Modal focus leak & drop**: Opening the lightbox does NOT move focus inside the dialog (focus remains on opening card button); tabbing navigates background page cards behind the modal. Closing from inside the modal drops focus to `document.body` rather than restoring to the trigger. | Fails WCAG 2.2 SC 2.4.3 (Focus Order) and WAI-ARIA Modal Dialog Pattern. Touch targets on 320px wrap cleanly without horizontal overflow. Escape key and backdrop click dismiss modal. | **FIX REGARDLESS**: Migrate lightbox to standard dialog component (e.g. Radix Dialog) to provide focus containment, initial focus management, and automatic focus restoration upon close. |
| **Destinations & Detail** (`/destinations`, `/destinations/$code`) | Rich 7-destination directory with real-time text query search; detailed code implementation in `{-$locale}.destinations.$code.tsx`. | **Critical Route Occlusion Defect**: `src/routes/{-$locale}.destinations.tsx` exports `DestinationsPage` directly with NO `<Outlet />`. Navigating to `/destinations/AMM` updates document `<title>` via `$code.tsx head()`, but mounts `DestinationsPage` in DOM. The entire destination detail page (hero, embedded flight search form, weekly schedule chips, Good to know aside, Book CTA) is completely unreachable in browser! | Destination cards have visible focus rings and accessible labels. Route defect prevents detail page evaluation in live browser. | **FIX REGARDLESS**: Split `/destinations` into a layout route (`.destinations.tsx` with `<Outlet />`) and index route (`.destinations.index.tsx`), restoring `$code.tsx` detail rendering. |
| **Visitor & Travel Info** (`/travel`) | Sticky sidebar navigation with 5 travel sections (`prepare`, `documents`, `baggage`, `airport`, `accessibility`). | Homepage quick links (`/travel#baggage`, etc.) all link to generic `/travel` with no section parameter; always resets to first section ("prepare"). Section navigation uses `<nav aria-label="Travel information">` containing 5 plain `<button>` elements with `aria-current="true"` instead of WAI-ARIA tablist semantics; arrow keys do not cycle sections. | Horizontal scrolling navigation bar on 390px mobile. Uses standard Tab sequence; lacks arrow-key cycling. Content text rendered with clean typographic hierarchy. | **KEEP UX, REBUILD INFRASTRUCTURE**: Adopt URL search parameter `?section=` or hash anchors, and upgrade navigation markup to WAI-ARIA Tabs pattern. |
| **Contact Form** (`/contact`) | Message form with Name, Email, Subject dropdown, Textarea, prototype notice, and institutional contact details. | No operational backend messaging; form state toggles `sent = true` displaying honest feedback: *"Your message has not been sent anywhere yet — messaging is not connected."* Explicit reset button provided. | Form inputs have explicit labels and HTML5 validation (`required`, `type="email"`). Phone `+970 8 000 0000` remains LTR. | **KEEP AS-IS**: Exemplary pre-operational prototype behavior; transparently prevents false delivery expectations while demonstrating complete UX. |
| **About Page** (`/about`) | Dual-column institutional summary for Airport and Airline, with network code badges and archive material provenance statement. | Generic photo placeholder used for archive desk. No direct deep-link to oral histories or funding partner archive documentation. | Clean semantic grid, responsive single-column on mobile. | **KEEP AS-IS**: Clear, dignified statement separating confirmed project baselines from provisional demonstration data. |

---

## 2. Screenshot & Empirical Evidence Index

All 44 screenshots were captured using Chromium/Edge headless automation against the live running application (`http://localhost:8080`) across Desktop (1280×900), Tablet (768×1024), Mobile (390×844), and Small Mobile (320×568) in both English (`en`, LTR) and Arabic (`ar`, RTL).

Raw screenshot files and structured manifests are stored at:
- Screenshots: `evidence/phase-3a/20260918-phase-3a-heritage/screenshots/`
- Manifest: `evidence/phase-3a/20260918-phase-3a-heritage/screenshot-manifest.json`
- Test Assertions: `evidence/phase-3a/20260918-phase-3a-heritage/browser-test-records.json`

| Screenshot Filename | Journey | Route | Locale | Viewport | Content / Fixture State | What It Proves |
|---|---|---|---|---|---|---|
| `j1_01_airport_index_en_1280.png` | Journey 1 | `/airport` | `en` | 1280×900 | Airport overview landing with three chapter cards (01 Past, 02 Present, 03 Future) and disclaimer note | Proves chapter card layout, imagery, typography, and clear provisional disclaimer. |
| `j1_02_airport_index_ar_390.png` | Journey 1 | `/ar/airport` | `ar` | 390×844 | Arabic airport overview on mobile showing stacked chapter cards with RTL directionality and Arabic typography | Proves responsive vertical stacking on 390px, Arabic headings, and RTL card layout. |
| `j1_03_airport_past_en_1280.png` | Journey 1 | `/airport/past` | `en` | 1280×900 | Chapter 1 (Past) hero header and placeholder disclaimer notice | Proves dark ink hero header, title, and clear disclaimer banner separating history from provisional content. |
| `j1_04_airport_past_timeline_en_1280.png` | Journey 1 | `/airport/past` | `en` | 1280×900 | Timeline milestones view showing mock Verified vs Placeholder pills, dates, and archival placeholder imagery | Proves milestone rendering, timeline rail, mock badge status (Verified vs Placeholder), and image provenance notes. |
| `j1_05_airport_past_sources_en_1280.png` | Journey 1 | `/airport/past` | `en` | 1280×900 | Sources & archive metadata callout panel with navigation buttons to Gallery and Present chapter | Proves presence of sources callout and forward navigation links to Gallery and Chapter 02. |
| `j1_06_airport_past_ar_390.png` | Journey 1 | `/ar/airport/past` | `ar` | 390×844 | Arabic timeline on mobile showing start-aligned timeline rail (`border-s`), mock badges, and dates | Proves RTL timeline alignment, `border-s` positioning, badge rendering, and numerals. |
| `j1_07_airport_present_en_1280.png` | Journey 1 | `/airport/present` | `en` | 1280×900 | Chapter 2 (Present) hero header, factual notice, and four structured fact cards (Site, IATA code, Opened, Status) | Proves distinct secondary hero styling, factual disclaimer, and key aviation fact `<dl>` grid. |
| `j1_08_airport_present_site_en_1280.png` | Journey 1 | `/airport/present` | `en` | 1280×900 | The site narrative panels and placeholder site map graphic with forward link to Chapter 03 (Future) | Proves documentary layout, site panels, map graphic with replacement notice, and navigation to Future. |
| `j1_09_airport_present_ar_390.png` | Journey 1 | `/ar/airport/present` | `ar` | 390×844 | Arabic present facts and narrative panels on mobile | Proves 2-column mobile fact grid, RTL text alignment, and panel spacing. |
| `j1_10_airport_future_en_1280.png` | Journey 1 | `/airport/future` | `en` | 1280×900 | Chapter 3 (Future) hero header and concept work disclaimer notice | Proves future vision hero styling, kicker, and concept notice. |
| `j1_11_airport_future_themes_en_1280.png` | Journey 1 | `/airport/future` | `en` | 1280×900 | Future concept theme cards (Terminal concepts, Passenger experience, Masterplan) with alternating layout | Proves architectural concept presentations, theme icons, alternating figure layout, and copy. |
| `j1_12_airport_future_network_en_1280.png` | Journey 1 | `/airport/future` | `en` | 1280×900 | Future network panel displaying destination badges and cross-navigation to Gallery and Past | Proves network ambition narrative, interactive destination pill links, and return navigation. |
| `j1_13_airport_future_ar_390.png` | Journey 1 | `/ar/airport/future` | `ar` | 390×844 | Arabic future concept cards on mobile | Proves mobile single-column card flow, RTL icon and heading alignment. |
| `j2_14_gallery_overview_en_1280.png` | Journey 2 | `/gallery` | `en` | 1280×900 | Gallery overview with placeholder notice, category and era filter pill groups, item counter (24 items), and card grid | Proves initial gallery render, 24 items count, dual filter pill sets, placeholder notice, and image grid. |
| `j2_15_gallery_filtered_architecture_en_1280.png` | Journey 2 | `/gallery` | `en` | 1280×900 | Gallery filtered by Architecture category showing active pill state and reduced item grid | Proves category filtering mutation, active pill styling (`aria-pressed`), and filtered item count. |
| `j2_16_gallery_filtered_future_en_1280.png` | Journey 2 | `/gallery` | `en` | 1280×900 | Gallery filtered by Architecture category AND Future era showing combined intersection | Proves dual-filter intersection behavior and accurate item counter update. |
| `j2_18_gallery_lightbox_open_en_1280.png` | Journey 2 | `/gallery` | `en` | 1280×900 | Lightbox modal dialog open on Item 1 showing large image, close button, category/era pills, title, caption, credit, metadata, and prev/next controls | Proves lightbox display, accessible modal structure, metadata attributes (credit, ID, date), and navigation buttons. |
| `j2_19_gallery_lightbox_next_en_1280.png` | Journey 2 | `/gallery` | `en` | 1280×900 | Lightbox navigated to Item 2 via ArrowRight keyboard shortcut | Proves keyboard ArrowRight navigates to next item; title and metadata update accordingly. |
| `j2_20_gallery_lightbox_ar_390.png` | Journey 2 | `/ar/gallery` | `ar` | 390×844 | Arabic lightbox open on mobile showing RTL metadata layout, close button, and navigation arrows | Proves RTL alignment inside lightbox modal, translated controls, and mobile modal containment. |
| `j2_21_gallery_overview_ar_390.png` | Journey 2 | `/ar/gallery` | `ar` | 390×844 | Arabic gallery on mobile showing filter pill groups, item counter, and responsive single/two-column cards | Proves Arabic translation for filters, item counter in Arabic, and mobile touch targets. |
| `j3_22_destinations_index_en_1280.png` | Journey 3 | `/destinations` | `en` | 1280×900 | Destinations network overview with search input in page header and 7 destination cards (AMM, CAI, IST, DOH, DXB, JED, RUH) | Proves 7 destination cards, flight times, prices from, airport codes, and header search input. |
| `j3_23_destinations_search_filter_en_1280.png` | Journey 3 | `/destinations` | `en` | 1280×900 | Destinations filtered by search query "cairo" displaying single matching Cairo International (CAI) card | Proves real-time query filtering across city and country names. |
| `j3_24_destinations_empty_search_en_1280.png` | Journey 3 | `/destinations` | `en` | 1280×900 | Destinations empty state when searching for an unserved city ("london") | Proves zero-match message rendering and clean empty container. |
| `j3_25_destinations_index_ar_390.png` | Journey 3 | `/ar/destinations` | `ar` | 390×844 | Arabic destinations index on mobile showing Arabic search placeholder and stacked destination cards | Proves Arabic translations, RTL layout of cards, and mobile card readability. |
| `j3_26_destination_detail_amm_en_1280.png` | Journey 3 | `/destinations/AMM` | `en` | 1280×900 | URL `/destinations/AMM`: title updates to *"Amman (AMM) from Gaza — Palestinian Airlines"*, but page renders `DestinationsPage` (H1 "Destinations", search input, 7 cards) due to missing `<Outlet />` in `{-$locale}.destinations.tsx` | **Proves TanStack parent route collision defect**: `{-$locale}.destinations.tsx` acts as parent route without `<Outlet />`, blocking child route `DestinationPage` component in `{-$locale}.destinations.$code.tsx` from rendering. |
| `j3_27_destination_detail_amm_search_en_1280.png` | Journey 3 | `/destinations/AMM` | `en` | 1280×900 | URL `/destinations/AMM` scrolled down, displaying the destinations grid rather than the embedded `FlightSearchForm` from `$code.tsx` | Proves `DestinationPage` child component (and its embedded `FlightSearchForm`) is unreachable at `/destinations/AMM`. |
| `j3_28_destination_detail_amm_schedule_en_1280.png` | Journey 3 | `/destinations/AMM` | `en` | 1280×900 | URL `/destinations/AMM` scrolled to bottom, showing the bottom of the destinations list rather than weekly schedule chips or Good to know aside | Proves schedule chips and operational notes from `$code.tsx` are completely occluded by the parent route. |
| `j3_29_destination_detail_amm_ar_390.png` | Journey 3 | `/ar/destinations/AMM` | `ar` | 390×844 | URL `/ar/destinations/AMM` on 390px mobile, rendering Arabic `DestinationsPage` rather than Arabic `DestinationPage` | Proves route occlusion occurs identically in Arabic namespace. |
| `j3_30_destination_detail_404_en_1280.png` | Journey 3 | `/destinations/XYZ` | `en` | 1280×900 | URL `/destinations/XYZ`: title updates to *"Destination not in the network — GZA"*, but page renders `DestinationsPage` instead of the 404 `EmptyState` | Proves 404 `EmptyState` in `$code.tsx` is also occluded by the missing `<Outlet />` defect. |
| `j4_31_travel_info_prepare_en_1280.png` | Journey 4 | `/travel` | `en` | 1280×900 | Travel information guide with sidebar navigation and active "Preparing to travel" section showing timing rules and key check points | Proves sticky sidebar navigation, active section styling, checkmark point cards, and flight/book CTAs. |
| `j4_32_travel_info_baggage_en_1280.png` | Journey 4 | `/travel` | `en` | 1280×900 | Travel information with active "Baggage" section displaying cabin bag (7 kg) and checked bag (23 kg) specifications | Proves tab switching mutation and accurate rendering of baggage rules. |
| `j4_33_travel_info_accessibility_en_1280.png` | Journey 4 | `/travel` | `en` | 1280×900 | Travel information with active "Accessibility" section detailing wheelchair assistance and step-free routes | Proves accessibility service documentation, step-free claims, and assistance notice. |
| `j4_34_travel_info_ar_390.png` | Journey 4 | `/ar/travel` | `ar` | 390×844 | Arabic travel information on mobile showing horizontally scrolling section tabs and Arabic points | Proves mobile horizontal tab scroll bar, RTL orientation, and Arabic point formatting. |
| `j4_35_contact_form_en_1280.png` | Journey 4 | `/contact` | `en` | 1280×900 | Contact page with message form (Name, Email, Subject dropdown, Message textarea), prototype notice, and contact details aside | Proves contact form layout, subject dropdown options, contact info cards, phone/email, and prototype disclaimer. |
| `j4_36_contact_validation_en_1280.png` | Journey 4 | `/contact` | `en` | 1280×900 | Contact form validation state preventing empty submission via HTML5 required attributes | Proves client-side form validation prevents submission when required fields are empty. |
| `j4_37_contact_sent_state_en_1280.png` | Journey 4 | `/contact` | `en` | 1280×900 | Contact form post-submission state displaying confirmation and prototype disclaimer (*"Your message has not been sent anywhere yet — messaging is not connected."*) with recovery reset button | Proves submission state mutation, honest unrouted-message disclaimer, and reset button affordance. |
| `j4_38_contact_ar_390.png` | Journey 4 | `/ar/contact` | `ar` | 390×844 | Arabic contact page on mobile with RTL form controls and localized placeholders | Proves mobile form layout, RTL labels and input text, and contact info presentation. |
| `j4_39_about_overview_en_1280.png` | Journey 4 | `/about` | `en` | 1280×900 | About page with airport mission panel, Palestinian Airlines home carrier panel with destination codes, and "About the material" provenance statement | Proves institutional narrative, confirmed baseline vs placeholder distinction, network destination badges, and archive provenance statement. |
| `j4_40_about_ar_390.png` | Journey 4 | `/ar/about` | `ar` | 390×844 | Arabic about page on mobile showing stacked institutional panels and localized provenance statement | Proves Arabic typography, mobile panel stacking, and RTL badge alignment. |
| `x_41_homepage_airport_story_en_1280.png` | Cross-Journey | `/` | `en` | 1280×900 | Homepage airport story section in dark ink surface featuring Past, Present, and Future chapter cards | Proves primary entry point into airport history from the home page. |
| `x_42_homepage_travel_archive_en_1280.png` | Cross-Journey | `/` | `en` | 1280×900 | Homepage quick travel info links (Baggage, Documents, Accessibility) and 6-item Archive gallery teaser | Proves direct links to travel subtopics and teaser grid into the full archive. |
| `x_43_footer_discover_links_en_1280.png` | Cross-Journey | `/` | `en` | 1280×900 | Site footer showing Discover links (`/airport`, `/airport/past`, `/airport/future`, `/gallery`) and Help links | Proves persistent footer navigation structure and **reveals complete omission of `/airport/present` link**. |
| `x_44_responsive_gallery_320.png` | Cross-Journey | `/gallery` | `en` | 320×568 | Small mobile 320px viewport audit on Gallery inspecting filter pill wrapping and card width | Proves layout resilience at narrow 320px breakpoint; checks whether filter buttons wrap cleanly without horizontal scrollbar (`bodyScrollWidth === 320`). |
| `x_45_responsive_destination_amm_768.png` | Cross-Journey | `/destinations/AMM` | `en` | 768×1024 | Tablet portrait 768px layout on destination detail inspecting 2-column to 1-column responsive transition | Proves tablet responsive layout of the destinations index at `/destinations/AMM`. |

---

## 3. Journey-by-Journey Walkthrough & Empirical Findings

### Journey 1: Airport Story (Past $\rightarrow$ Present $\rightarrow$ Future)

#### 1. Entry & Overview (`/airport`)
- **Homepage Entry**: Scrolled to the dark ink section (`x_41`), three full-bleed cards invite exploration with kicker "The airport", title "One airport, told in three chapters", and subtitle "Its history, its present state, and the vision for its future." Each card carries an Arabic/English label and forward arrow.
- **Landing Hub (`/airport`)**: Displays `PageHeader` with title *"Gaza International Airport"* and subtitle *"One airport, told in three chapters."* Three prominent cards (`j1_01`) present chapters 01 (Past), 02 (Present), and 03 (Future) with aspect-ratio 16:10 photography, numbering (`numeral`), and read buttons (`airport.readChapter`).
- **Provisional Disclaimer**: Below the cards, a direct, honest statement is rendered:
  > *"Archive photography, documents and architectural material will replace the placeholders in these chapters as verified sources are added."* (Arabic: *"ستحل الصور الأرشيفية والوثائق والمواد المعمارية مكان العناصر المؤقتة في هذه الفصول عند إضافة مصادر موثّقة."*)

#### 2. Chapter 01: Past (`/airport/past`)
- **Visual Tone & Atmosphere**: Immersive dark-ink hero section with 30% opacity archival photography (`airport-archive-hall`), soft clay eyebrow, and prominent title.
- **Milestone Timeline Semantics**:
  - Rendered using an ordered list (`<ol>`) with a continuous vertical start-border (`border-s border-border ps-6 sm:ps-10`).
  - Circular indicator (`rounded-full bg-primary`) pinned to the start line (`-start-[1.85rem]`). In Arabic RTL, this positioning flips cleanly to the right-hand margin with zero overlapping text.
  - Heading hierarchy: `<h1>The past</h1>` $\rightarrow$ `<h2>Planning and construction</h2>`, `<h2>The airport opens</h2>`, etc.
- **Prototype Status Badges**:
  - The 1998 opening milestone carries `<Pill tone="brand"><BadgeCheck /> Verified</Pill>`. In `src/lib/data.ts`, this is driven by the mock fixture flag `entry.verified: true`. As established in `PRODUCT.md`, this flag is an internal prototype UI fixture demonstrating badge styling rather than an independent historical verification.
  - Planning (1994–1997), Operations (1998–2001), Closure (2001–2002), and Memory (2002–today) all carry `<Pill tone="clay"><AlertCircle /> Placeholder</Pill>`.
  - Every placeholder entry explicitly states: *"Placeholder chapter. The construction period, funding partners, design team and engineering decisions will be documented here from verified archive sources."*
- **Sources & Metadata Callout**: At the foot of the chapter (`j1_05`), a callout box clarifies:
  > *"Each chapter will carry its own source list: archive references, document scans, photograph credits, interview dates and transcripts. Nothing here is presented as verified until a source is attached."*
  Two CTAs offer paths to the Gallery (`/gallery`) and Chapter 02 (`/airport/present`).

#### 3. Chapter 02: Present (`/airport/present`)
- **Visual Shift**: Intentionally transitions from dark-ink memory to a neutral stone/sand light surface (`bg-secondary`), signaling documentary factual reporting rather than evocative retrospection (`j1_07`).
- **Factual Disclaimers & Structured Facts**:
  - Prominent notice: *"This chapter is deliberately factual. No generic photography is shown here as documentary evidence; images will be added only when their source and date are known."*
  - Four key data points in a definition list (`<dl>`):
    1. Site: *"Southern Gaza Strip, near Rafah"*
    2. IATA Code: `"GZA"`
    3. Opened: `"1998"`
    4. Current Status: *"Not operating — pending documentation"*
- **Narrative Panels & Site Map**: Two structured panels discuss *"The site"* (terminal, runway, apron surveys) and *"What is documented"* (satellite imagery with dates, on-the-ground reporting). A neutral map outline graphic carries a caption: *"Placeholder graphic. A dated site map will replace it."*
- **Forward Path**: Callout button leads forward to Chapter 03 (`/airport/future`).

#### 4. Chapter 03: Future (`/airport/future`)
- **Visual Shift**: Returns to dark-ink editorial styling with a 40% opacity vision hero (`future-airport-vision`).
- **Architectural Concept Themes**: Three thematic articles with alternating image/copy alignment (`j1_11`):
  1. *Terminal concepts* (`Building2` icon): Massing, daylight strategy, passenger flows, regional materials.
  2. *Passenger experience* (`Sparkles` icon): Calm security flow, self check-in, family provisions, dignified waiting halls.
  3. *Masterplan* (`Plane` icon): Runway rehabilitation, apron capacity, cargo, phased expansion.
- **Network Ambition Panel**: Outlines future long-term ambitions beyond the regional opening network (Europe, North Africa) with interactive pill badges linking to each destination.

---

### Journey 2: Archive & Gallery (`/gallery`)

#### 1. Discovery & Filtering
- **Item Inventory**: Initial render presents 24 items (`j2_14`), filterable by 4 categories (*Photographs*, *Documents*, *Architecture*, *Concepts*) and 3 eras (*Past*, *Present*, *Future*).
- **Active Pill Semantics**: Filter buttons use `<button aria-pressed={value === option.id}>`. When active, styling transitions to `border-primary bg-primary text-primary-foreground`.
- **Filtering Mutations**:
  - Selecting "Architecture" (`j2_15`) mutates the item count from 24 to 6.
  - Adding "Future" era filter (`j2_16`) mutates the item count to 2 (`architectureFilterCount: 6`, `comboFilterCount: 2`).
  - Active numeral label dynamically updates to reflect matching items (e.g. "6 items", "2 items", Arabic "٦ عناصر").
- **Empty State**: Clearing filters via "Clear filters" button resets state cleanly.

#### 2. Lightbox Modal Dialog & Media Inspection
- **Interaction**: Clicking any gallery card opens the full-screen lightbox modal (`j2_18`).
- **Modal Metadata**: Displays a high-resolution 1600×1000 image, close button (`X`), category/era badges, full title, caption, credit line (*"Awaiting archive credit"*), and metadata string (`item-1 · Undated`).
- **Navigation Controls**: Previous (`ChevronLeft`) and Next (`ChevronRight`) buttons cycle items circularly. Keyboard shortcuts `ArrowRight` and `ArrowLeft` smoothly transition items in place (`j2_19`).
- **Keyboard Dismissal**: Pressing `Escape` or clicking the dark backdrop (`isClosedBackdrop: true`) closes the modal immediately.
- **Measured Keyboard & Focus Behaviors**:
  - *Focus on open*: Focus remains on the opening card button (`activeElementTag: 'BUTTON'`); focus is not programmatically moved into the dialog shell or to the close button.
  - *Focus leak*: When pressing `Tab` while the modal is open, focus cycles through the background card buttons behind the modal backdrop (`tab progression: ['DocumentsPastArchive placeholder 2', 'ArchitecturePastArchive placeholder 3', ...]`) rather than being trapped within the dialog.
  - *Focus upon close (from trigger)*: If the user opens the modal and immediately presses Escape or clicks the backdrop without moving focus inside, focus remains on the card trigger button.
  - *Focus drop upon close (from inside dialog)*: If the user focuses a control inside the modal (e.g. Close, Prev, or Next buttons) and dismisses via Escape or backdrop click, `src/routes/{-$locale}.gallery.tsx` does not restore focus to the opening card button; focus drops to `document.body` (`tagName: 'BODY'`, `isBody: true`), violating WCAG 2.2 SC 2.4.3.

---

### Journey 3: Destinations & Network (`/destinations`, `/destinations/$code`)

#### 1. Network Index (`/destinations`)
- **Directory**: Displays 7 regional destinations in the opening network (`j3_22`): Amman (`AMM`), Cairo (`CAI`), Istanbul (`IST`), Doha (`DOH`), Dubai (`DXB`), Jeddah (`JED`), and Riyadh (`RUH`).
- **Destination Cards**: Each card shows city name, country, 3-letter IATA code, flight duration (`minutesToLabel`), starting fare (`money(priceFrom)`), and an arrow icon.
- **Search Filtering**:
  - Typing `"cairo"` (`j3_23`) instantly filters to a single card: Cairo International (`CAI`, Egypt, 1h 15m, from $139).
  - Typing an unserved city like `"london"` (`j3_24`) displays a clean empty state: *"Nothing matches these filters yet."*

#### 2. Critical Route Occlusion Defect (`/destinations/$code`)
- **The Expected Implementation**: `src/routes/{-$locale}.destinations.$code.tsx` contains an extensive, beautiful `DestinationPage` component featuring:
  - Hero header with route eyebrow (`GZA -> AMM`), city title, country, flight duration, starting price, and weekly frequency (`14x weekly`).
  - Embedded `FlightSearchForm` prefilled with `origin: "GZA"` and `destination: destination.code`.
  - Weekly operating schedule day indicators (Sun through Sat).
  - "Good to know" operational notes aside.
  - "PS Palestinian Airlines" aircraft notice and "Book to {city}" CTA button linking to `/book`.
  - "Other destinations" 3-card recommendation grid.
  - 404 EmptyState for unserved destinations (`"We don't fly there yet"`).
- **The Empirical Reality in the Browser**:
  - When clicking a destination card or entering `http://localhost:8080/destinations/AMM` in the browser:
    1. TanStack Router executes `head()` from `$code.tsx`, so the browser document `<title>` correctly displays: `"Amman (AMM) from Gaza — Palestinian Airlines"`.
    2. BUT TanStack Router mounts `src/routes/{-$locale}.destinations.tsx` as the parent route!
    3. Because `{-$locale}.destinations.tsx` renders `DestinationsPage` directly with **NO `<Outlet />`**, the child component `DestinationPage` is completely occluded!
    4. The user sees `DestinationsPage` (H1 "Destinations", search input, and 7 cards grid), and the destination detail page is completely unreachable!
    5. This defect occurs identically for all destinations (`/destinations/CAI`, `/destinations/DXB`), for the 404 error route (`/destinations/XYZ`), and across both English and Arabic namespaces (`/ar/destinations/AMM`).
- **Empirical Assertion Record**: Confirmed via DOM assertions (`records.journey3_destinations.amm_detail`): `containsWeeklySchedule: false`, `containsGoodToKnow: false`, `hasSearchForm: false`, `hasDestSearchInput: true`.

---

### Journey 4: Travel Info, Contact, About & Visitor UX

#### 1. Travel Information (`/travel`)
- **Section Navigation**: Desktop layout (`j4_31`) features a sticky left sidebar (`w-64`) with `<nav aria-label="Travel information">` containing an unordered list (`<ul>`) of 5 `<button>` elements corresponding to topical sections:
  1. *Preparing to travel* (`prepare`): active section marked with `aria-current="true"`; covers 24-hour check-in rules, 2-hour airport arrival, booking reference reminder.
  2. *Travel documents* (`documents`): Passport validity (6 months), exact name matching, child documentation rules.
  3. *Baggage* (`baggage`, `j4_32`): 7 kg cabin bag (55 × 40 × 20 cm), 23 kg checked bag, $35 extra bag fee.
  4. *At the airport* (`airport`): Check-in, security, passport control, quiet areas and family rooms.
  5. *Accessibility* (`accessibility`, `j4_33`): Kerb-to-gate wheelchair assistance, step-free paths, assistance animals.
- **Keyboard & Tab Behavior**: Tested with browser automation scoped to `main nav[aria-label="Travel information"]` (`deepA11yInspections.travelNavigation`); buttons follow linear Tab order (`tabTraversesButtons: true`). Arrow keys (ArrowDown / ArrowRight) do not cycle focus (`arrowDownMovesFocus: false`) because the navigation uses standard list buttons without WAI-ARIA `role="tablist"` or `role="tab"` markup.
- **Section Points Grid**: Each section renders an overview paragraph followed by a 2-column card grid with checkmark icons (`Check`) highlighting concrete rules.
- **Mobile Responsive Layout**: On 390px mobile (`j4_34`), the vertical sidebar switches to a horizontally scrolling navigation bar (`overflow-x-auto pb-2`), preserving screen real estate while keeping all 5 sections accessible.
- **Cross-Journey Anchoring Friction**: On the homepage (`src/routes/{-$locale}.index.tsx`), lines 195–204 feature quick links labeled "Baggage", "Travel document number", and "Special assistance". All three link to `/travel` without any search params or hash anchors. Because `/travel` uses local state initialized to the first section (`prepare`), clicking "Baggage" or "Accessibility" on the homepage always lands the user on "Preparing to travel"!

#### 2. Contact Form & Prototype Feedback (`/contact`)
- **Form Layout**: Clean 2-column form card (`j4_35`) with Name, Email, Subject dropdown (Booking enquiry, Baggage, Accessibility, Archive contribution, Media), and Message textarea.
- **HTML5 Validation**: Clicking "Send message" with empty fields (`j4_36`) triggers native browser validation tooltips on the first required input (`#c-name`), preventing blank submissions.
- **Prototype Submission State**: Submitting valid data (`j4_37`) transitions local state to a confirmation panel:
  > *"Thank you — your message has been recorded. Your message has not been sent anywhere yet — messaging is not connected."*
  > Button: *"Message"* (clicking resets the form for another submission).
- **Contact Details Aside**: Phone `+970 8 000 0000` (code-id font, LTR), email `hello@gza-airport.ps`, physical location *"Gaza International Airport, Gaza"*, and placeholder note *"Placeholder contact details — replace with the real ones."*
- **Social Media Links**: Four pill tags (Instagram, X, Facebook, YouTube) linking to `#`.

#### 3. About Gaza Airport & Palestinian Airlines (`/about`)
- **Institutional Context**: Features two balanced panels (`j4_39`):
  - *Airport Panel*: Outlines opening in 1998, role as Gaza's civil gateway, and clear separation between historical memory and future concepts.
  - *Airline Panel*: Identifies Palestinian Airlines (`PS`) as the home carrier, Airbus A320 fleet, and displays code badges for the 7 opening destinations (`AMM`, `CAI`, `IST`, `DOH`, `DXB`, `JED`, `RUH`).
- **Archive Provenance Statement**: Full-width panel explicitly states:
  > *"Imagery on this site is temporary and generic. Nothing here is presented as authentic Gaza International Airport photography, and historical detail is marked as a placeholder until an archive source is attached. Flight schedules, fares and bookings are demonstration data held in your browser only."*

---

## 4. Four-Level Audit Findings

### Level 1: Implementation Defects

1. **Missing `<Outlet />` in `src/routes/{-$locale}.destinations.tsx`**:
   - **Type**: Critical Router Defect / Broken Navigation.
   - **Evidence**: `j3_26_destination_detail_amm_en_1280.png`, `j3_29_destination_detail_amm_ar_390.png`, `j3_30_destination_detail_404_en_1280.png`, `browser-test-records.json`.
   - **Details**: TanStack Router interprets `{-$locale}.destinations.tsx` as a layout route because child route `{-$locale}.destinations.$code.tsx` exists. However, `destinations.tsx` exports `DestinationsPage` directly without `<Outlet />`. Any visit to `/destinations/:code` renders `DestinationsPage` instead of `DestinationPage`. The entire destination detail page is completely unreachable in the browser.
2. **Missing `/airport/present` in Site Footer**:
   - **Type**: Missing Link / Navigation Inconsistency.
   - **Evidence**: `x_43_footer_discover_links_en_1280.png`, `src/components/site-footer.tsx` lines 17–24.
   - **Details**: The "Discover" footer column lists `/airport`, `/airport/past`, `/airport/future`, and `/gallery`. Chapter 02 (`/airport/present`) is completely missing, creating an inconsistent gap in the historical trilogy.
3. **Homepage Travel Quick Links Lack Section Anchoring**:
   - **Type**: Usability Defect / Broken Intent.
   - **Evidence**: `x_42_homepage_travel_archive_en_1280.png`, `src/routes/{-$locale}.index.tsx` lines 195–204.
   - **Details**: Clicking "Baggage" or "Accessibility" from the homepage navigates to `/travel` without any anchor or query param. Because `/travel` initializes state to `travelSections[0].id` (`"prepare"`), the user's intent is lost.
4. **Incorrect Label Translation Key in Homepage Travel Section**:
   - **Type**: Copy / Translation Inconsistency.
   - **Evidence**: `src/routes/{-$locale}.index.tsx` line 202 (`[t("book.baggage"), t("book.docNumber"), t("book.assistance")][i]`).
   - **Details**: The second link uses `book.docNumber` (translating to "Travel document number" / "رقم وثيقة السفر") instead of "Travel documents" (`travelSections[1].title` or dedicated nav string).

---

### Level 2: Component Architecture

1. **Gallery Lightbox Focus Leak and Focus Drop to Body on Close**:
   - **Type**: Accessibility Defect (WCAG 2.2 SC 2.4.3 Focus Order, WAI-ARIA Modal Dialog Pattern).
   - **Evidence**: `records.deepA11yInspections.galleryLightbox`, `j2_18_gallery_lightbox_open_en_1280.png`.
   - **Details**: The lightbox is implemented with raw `<div>` elements marked with `role="dialog"` and `aria-modal="true"`, but lacks focus management. When opened, focus remains on the card trigger button instead of moving into the dialog. Pressing `Tab` leaks focus to the background gallery cards behind the modal overlay. Furthermore, when focus is moved inside the dialog (to Close or Next buttons) and the modal is dismissed via Escape or backdrop click, focus drops to `document.body` rather than returning to the invoking card trigger.
2. **Travel Information Uses Plain Buttons in `<nav>` Rather Than WAI-ARIA Tabs**:
   - **Type**: Semantic / Accessibility Architecture Issue.
   - **Evidence**: `records.deepA11yInspections.travelNavigation`, `src/routes/{-$locale}.travel.tsx` lines 37–57.
   - **Details**: Travel sections are implemented as a `<nav aria-label="Travel information">` containing an unordered list (`<ul>`) of five `<button>` elements with `aria-current={active === item.id ? "true" : undefined}`. Browser testing confirmed that while standard Tab navigation functions, arrow keys (ArrowDown / ArrowRight) do not cycle focus between sections. Implementing the WAI-ARIA Tabs design pattern (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`) is standard for single-page tabbed panels and provides proper screen-reader and arrow-key navigation.
3. **Airport Trilogy Lacks Unifying Sub-Navigation Bar**:
   - **Type**: Component Consistency / Orientation Friction.
   - **Evidence**: `j1_03`, `j1_07`, `j1_10`.
   - **Details**: Past, Present, and Future are separate full-page routes, but they do not share a common sub-header or chapter stepper. Past links forward to Gallery and Present; Present links only forward to Future; Future links back to Gallery and Past. A persistent chapter bar would give readers clear spatial orientation.

---

### Level 3: UX Patterns & Visual Direction

1. **Exemplary Provenance & Transparency Disclaimers**:
   - **Type**: UX Pattern Strength / Ethical Design.
   - **Evidence**: `j1_03`, `j1_07`, `j1_10`, `j2_14`, `j4_39`.
   - **Details**: Every surface that contains provisional, mock, or placeholder material explicitly declares it. In the airport history timeline, the UI visually distinguishes the opening milestone (marked with a brand-toned `<Pill tone="brand"><BadgeCheck /> Verified</Pill>` badge driven by the mock fixture flag `entry.verified: true`) from provisional chapters (marked with clay `<Pill tone="clay"><AlertCircle /> Placeholder</Pill>` badges).
2. **Honest Prototype Form Feedback**:
   - **Type**: UX Pattern Strength / Deception Avoidance.
   - **Evidence**: `j4_37_contact_sent_state_en_1280.png`.
   - **Details**: The contact form avoids pretending to dispatch emails to an imaginary backend server. It explicitly reassures the user that the form is a prototype demonstration and provides an immediate recovery reset button.
3. **Filter Pill Wrap & Touch Targets on 320px**:
   - **Type**: Responsive UX Strength.
   - **Evidence**: `x_44_responsive_gallery_320.png`, `records.responsiveAudits.gallery320`.
   - **Details**: Tested on narrow 320px viewport; all filter pills wrap cleanly with `gap-2`, touch targets maintain $\ge 36\text{px}$ height, and `document.body.scrollWidth === 320` confirms zero horizontal overflow.

---

### Level 4: Workflow & Information Architecture

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                        Homepage                         │
                  │                            /                            │
                  └───────────┬──────────────┬──────────────┬───────────────┘
                              │              │              │
             ┌────────────────┘              │              └────────────────┐
             ▼                               ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
    │  Airport Story  │             │ Archive/Gallery │             │  Destinations   │
    │    /airport     │             │    /gallery     │             │  /destinations  │
    └────────┬────────┘             └─────────────────┘             └────────┬────────┘
             │                                                               │
   ┌─────────┼─────────┐                                           [PARENT ROUTE COLLISION]
   ▼         ▼         ▼                                            (Detail occluded)
┌──────┐  ┌───────┐  ┌────────┐                                              │
│ Past │  │Present│  │ Future │                                              ▼
│/past │  │/present│ │/future │                                     ┌─────────────────┐
└──────┘  └───────┘  └────────┘                                     │ Detail ($code)  │
                                                                    │ (Unreachable!)  │
                                                                    └─────────────────┘
```

1. **Disconnected Heritage vs Utility**:
   - The airport story and gallery are rich in narrative potential, but currently operate as static read-only chapters. Future synthesis should explore contextual cross-links (e.g., viewing historical destinations from 1998–2000 within the Past chapter, or linking the Future masterplan to the modern fleet vision).
2. **Destination-to-Booking Friction**:
   - Because the destination detail page is occluded, users cannot currently benefit from the prefilled `FlightSearchForm` designed in `{-$locale}.destinations.$code.tsx`. Restoring this route is the single highest-impact UX repair for passenger discovery.

---

## 5. Historical Integrity & Provenance Assessment

In accordance with `PRODUCT.md` ("Brand Commitments — Factual & Archive Provenance"), all historical dates, milestones, and documentation must be grounded in verified archival evidence. In the current pre-operational prototype, the application maintains a strict separation between established project institutional identities, current site and codebase mock-content claims awaiting archival verification, and broader candidate historical research inquiries.

### 5.1 Confirmed Project & Institutional Identity (`PRODUCT.md`)

The following elements represent the authoritative entity identities and technical identifiers established by the product specification in `PRODUCT.md`:

| Baseline Attribute | Established Specification | Notes / Operating Boundary |
|---|---|---|
| **Airport Name** | Gaza International Airport (مطار غزة الدولي) | Primary civil aviation gateway of the Gaza Strip; historical naming also includes Yasser Arafat International Airport. |
| **Home Carrier Name** | Palestinian Airlines (الخطوط الجوية الفلسطينية) | Flag carrier and designated home carrier for the airport. |
| **IATA Airline Code** | `PS` | Official IATA designator for Palestinian Airlines. |
| **IATA Airport Code** | `GZA` | Official IATA 3-letter location identifier for Gaza International Airport. |

*Note*: `PRODUCT.md` establishes these entity names and IATA codes, but explicitly treats all specific operational dates, historical milestones, geographic coordinates, and archival media as provisional prototype content awaiting formal archival verification.

### 5.2 Current Site & Codebase Mock Claims Awaiting Archival Verification

The public-facing user interface and codebase mock datasets (`src/lib/data.ts`) currently display several specific historical and geographic claims. These represent provisional prototype presentation data rather than verified facts:

| Current UI / Mock Claim | Where Displayed in UI | Codebase Implementation State | Verification Status & Boundary |
|---|---|---|---|
| **1998 Opening Milestone** | `/airport/past` (timeline entry), `/airport/present` (key facts `<dl>`), `/about` (airport panel) | `src/lib/data.ts` line 529 sets `timeline[1].verified: true`, rendering a green `<Pill tone="brand"><BadgeCheck /> Verified</Pill>` badge. | **Provisional UI Mock Flag**: The `verified: true` property is an internal fixture boolean used to demonstrate badge styling in the UI. Neither `PRODUCT.md` nor the codebase attaches primary archival records. Must be verified against official inauguration documents. |
| **Location near Rafah** | `/airport/present` (fact card: *"Southern Gaza Strip, near Rafah"*), `/about` | Static string in `src/routes/{-$locale}.airport.present.tsx` and `src/lib/data.ts`. | **Awaiting Archival Survey**: Not defined in `PRODUCT.md`. Requires formal geographic, cadastral, and civil aviation boundary documentation. |
| **Provisional Chapters (Planning, Operations, Closure, Memory)** | `/airport/past` milestone rail | Marked `verified: false` in `src/lib/data.ts`, rendering clay `<Pill tone="clay"><AlertCircle /> Placeholder</Pill>` badges. | **Explicitly Provisional**: UI explicitly states: *"Nothing here is presented as verified until a source is attached."* |

### 5.3 Candidate Historical Research Claims to Verify

The following technical, operational, and historical claims appear in codebase mock text or preliminary research discussions. None of these are established by the product specification or backed by attached primary source documents in the repository. They are **candidate claims to verify** that require primary archival documentation before being published as authoritative:

| Research Domain | Candidate Claim to Verify | Archival Verification Requirement |
|---|---|---|
| **Exact Geographic Coordinates** | Candidate coordinates: 31°14′45″N, 34°16′33″E. (Current UI uses general description: *"Southern Gaza Strip, near Rafah"*). | Require official cadastral survey records, civil aviation aeronautical information publications (AIP), or official boundary maps. |
| **Inauguration & Formal Opening** | Candidate date: 24 November 1998 formal opening ceremony attended by President Yasser Arafat and international dignitaries. | Require documented opening ceremony flight manifest, civil aviation authority inauguration records, and contemporaneous press archives. |
| **Runway Dimensions & Heading** | Candidate specifications: 3,080 meters (10,105 ft) asphalt runway (heading 01/19), capable of handling Boeing 747 aircraft. | Require original engineering construction blueprints, ICAO aerodrome certification data, and pavement classification numbers (PCN). |
| **Annual Passenger Volume** | Candidate volume: ~90,000–100,000 passengers handled annually during peak operations. | Require official civil aviation traffic reports, border control statistics, or annual airline passenger manifests from 1998–2001. |
| **Historical Route Network & Timetables** | Candidate network: Scheduled flights serving Amman, Cairo, Dubai, Jeddah, Doha, Larnaca, and Istanbul. | Require published 1998–2001 Palestinian Airlines flight timetables, bilateral air service agreements, and slot allocations. |
| **Historical Fleet Chronology** | Candidate fleet: Historical operations using Fokker 50 and Boeing 727 aircraft (contrasted with the modern concept A320neo / B737-800 models simulated in the mock booking engine). | Require aircraft registration records (e.g. SU- or Palestinian civil aircraft registry), lease agreements, and delivery documentation. |
| **Destruction & Closure Records** | Candidate events: Radar/tower damage in Dec 2001 and runway destruction in Jan 2002. | Require formal UN damage assessments, ICAO incident declarations, and satellite verification with certified capture dates. |
| **Authentic Archival Media** | Candidate material: Photographic, architectural, and documentary media of airport construction and operations. | Site currently uses placeholder images (`picsum.photos`). Real archival assets held by the owner require verified provenance metadata: photographer credit, original archive accession number, date of capture, and publication rights. |

---

## 6. Bounded Decision Cards

### Decision Card 1: Airport Story Structure & Chapter Navigation

- **Current State**: `/airport` acts as an overview index displaying three cards. Chapters 01 (`/airport/past`), 02 (`/airport/present`), and 03 (`/airport/future`) are separate routes with differing visual treatments. Forward links exist between some chapters, but there is no persistent sub-navigation bar.
- **Evidence**: `j1_01`, `j1_03`, `j1_07`, `j1_10`, `x_41`.
- **Genuine Strengths**:
  - Distinct aesthetic atmosphere for each era: dark ink for historical memory and future vision; clean sand/secondary light surface for documentary present-day facts.
  - Transparent placeholder notices on every chapter.
- **Defects vs Opportunities**:
  - *Defect*: No persistent sub-nav bar; readers must reach the bottom of the page or return to `/airport` to change chapters.
  - *Opportunity*: Introduce a shared sticky chapter rail (`Past · Present · Future`) with active progress indicator.
- **Materially Distinct Options**:
  - *Option A (Preserve Route Separation with Sticky Sub-Nav)*: Keep `/airport/past`, `/airport/present`, `/airport/future` as separate URLs, but introduce a persistent chapter tab bar in the header/shell.
  - *Option B (Single Unified Long-Form Story Page)*: Consolidate Past, Present, and Future into a single scrolling editorial document (`/airport`) with smooth scroll-spy anchors.
- **Recommendation & Trade-offs**: **Option A (Preserve Route Separation with Sticky Sub-Nav)**. Separate routes allow direct sharing of specific chapters, distinct SEO/social metadata, and independent scrolling states, while a persistent tab bar eliminates navigation dead-ends.
- **Impacts**:
  - Desktop: High orientation gain.
  - Mobile: Smooth horizontal swipe or compact segmented pill control.
  - EN/AR: Parity preserved.
  - A11y: Requires `aria-current="page"` on active chapter link.
  - Complexity: Low (layout component addition).
- **Owner Decision Required?**: `NO` (Engineering and IA polish).
- **Classification**: `CONSOLIDATE`.

---

### Decision Card 2: History & Archive Provenance Treatment (Verified vs Placeholder)

- **Current State**: The timeline on `/airport/past` uses visual pills: brand green for `Verified` (1998 opening) and clay red/brown for `Placeholder` (Planning, Operations, Closure, Memory). In `src/lib/data.ts`, this is driven by `timeline[1].verified: true` as an internal mock fixture flag demonstrating UI badge styling.
- **Evidence**: `j1_04_airport_past_timeline_en_1280.png`, `src/lib/data.ts` lines 513–578.
- **Genuine Strengths**:
  - Strict honesty: Never fabricates historical dates or claims certainty without proof.
  - Distinguishes provisional draft text from established facts.
- **Defects vs Opportunities**:
  - *Opportunity*: Ingest authentic primary historical citations (ICAO bulletin references, EU project declarations, 1998 press archives) in a future curated asset phase so that the Operations and Construction chapters can be elevated to verified status with attached sources.
- **Materially Distinct Options**:
  - *Option A (Keep Badge System)*: Maintain `Verified` vs `Placeholder` badges on every milestone card until the real archive phase.
  - *Option B (Remove Badges in Favor of Footnotes)*: Remove prominent badges and use academic-style citation footnotes (`[1]`, `[2]`) linking to the bottom sources panel.
- **Recommendation & Trade-offs**: **Option A (Keep Badge System)**. For a civic memorial archive in prototype phase, conspicuous status badges build immediate credibility with researchers and public observers by demonstrating transparent editorial restraint.
- **Impacts**:
  - Credibility: Outstanding.
  - Design Complexity: Negligible.
- **Owner Decision Required?**: `NO`.
- **Classification**: `KEEP AS-IS`.

---

### Decision Card 3: Past / Present / Future Temporal Distinction

- **Current State**:
  - Past (`/airport/past`): Dark ink background (`bg-ink text-ink-foreground`), archival photo underlay.
  - Present (`/airport/present`): Light sand/secondary background (`bg-secondary`), structured `<dl>` facts, documentary panels.
  - Future (`/airport/future`): Dark ink background (`bg-ink text-ink-foreground`), architectural vision underlay.
- **Evidence**: `j1_03`, `j1_07`, `j1_10`.
- **Genuine Strengths**:
  - The lighting change (dark $\rightarrow$ light $\rightarrow$ dark) deliberately frames the present day as a clear, unembellished daylight survey of the physical site, preventing romanticization of wartime damage.
- **Defects vs Opportunities**:
  - Switching from dark to light and back to dark can feel jarring if the user expects a uniform design surface across a single section.
- **Materially Distinct Options**:
  - *Option A (Keep Thematic Lighting Shift)*: Preserve the intentional contrast between evocative dark memory/vision and neutral documentary daylight.
  - *Option B (Unify Under Standard Light Surface)*: Render all three chapters on standard limestone/sand surfaces with consistent content styling.
- **Recommendation & Trade-offs**: **Option A (Keep Thematic Lighting Shift)**. The thematic shift was a deliberate editorial decision capturing the gravity of the airport's physical reality.
- **Impacts**:
  - Emotional Impact: High.
  - Consistency: High within each chapter's purpose.
- **Owner Decision Required?**: `YES` (Owner aesthetic preference).
- **Classification**: `OWNER DECISION REQUIRED`.

---

### Decision Card 4: Gallery Discovery & Media Interaction (Lightbox vs Grid)

- **Current State**: `/gallery` renders a filterable 24-card grid. Clicking any card opens a custom fixed overlay `div[role="dialog"]` with large image, caption, metadata, and prev/next buttons. Keyboard ArrowLeft/Right cycles items; Escape closes the overlay.
- **Evidence**: `j2_14`, `j2_18`, `j2_19`, `records.deepA11yInspections.galleryLightbox`.
- **Genuine Strengths**:
  - Fast client-side filtering by category and era.
  - Clean image presentation with credit and ID attributes.
- **Defects vs Opportunities**:
  - *Confirmed Defect*: Modal focus leak — opening the lightbox leaves focus on the opening card button; tabbing cycles through background buttons behind the modal overlay (violating WCAG 2.2 SC 2.4.3).
  - *Confirmed Defect*: Modal focus drop on close — when focus is moved inside the dialog (e.g. to Close or Next buttons), closing via Escape or backdrop click drops focus to `document.body` rather than restoring to the opening card button (violating WCAG 2.2 SC 2.4.3).
- **Materially Distinct Options**:
  - *Option A (Migrate to Standard Dialog Component)*: Replace custom `div` overlay with `@radix-ui/react-dialog` (already in `package.json`), which provides built-in focus trapping, screen-reader announcements, body scroll locking, and automatic focus restoration.
  - *Option B (Dedicated Item Detail Route)*: Convert items into shareable routes (`/gallery/$itemId`) with a drawer or dedicated page.
- **Recommendation & Trade-offs**: **Option A (Migrate to Standard Dialog Component)**. Keeps the seamless single-page browsing experience while resolving modal focus containment, focus restoration, and dialog semantics.
- **Impacts**:
  - A11y: Resolves modal focus containment, focus order (SC 2.4.3), and dialog accessibility semantics (SC 4.1.2) for the gallery lightbox. (Note: whole-page WCAG compliance requires broader multi-component auditing).
  - User Experience: Eliminates focus leaks to background elements and preserves user keyboard context upon modal dismissal.
- **Owner Decision Required?**: `NO` (Clear accessibility defect fix).
- **Classification**: `FIX REGARDLESS`.

---

### Decision Card 5: Destination Network Architecture & Booking Handoff

- **Current State**:
  - `src/routes/{-$locale}.destinations.tsx` defines the parent route with `DestinationsPage` and NO `<Outlet />`.
  - `src/routes/{-$locale}.destinations.$code.tsx` defines the destination detail page with rich `DestinationPage` component.
  - Because `destinations.tsx` lacks `<Outlet />`, TanStack Router mounts `DestinationsPage` on all `/destinations/*` URLs. The destination detail page is completely occluded and unreachable in the browser.
- **Evidence**: `j3_26`, `j3_27`, `j3_28`, `j3_29`, `j3_30`, `records.journey3_destinations.amm_detail`.
- **Genuine Strengths**:
  - `DestinationPage` in `$code.tsx` is already fully designed with flight time, starting price, frequency, embedded `FlightSearchForm`, weekly schedule chips, Good to know aside, and Book CTA.
- **Defects vs Opportunities**:
  - *Critical Architectural Defect*: The entire destination detail experience is blocked from users due to a missing TanStack layout boundary.
- **Materially Distinct Options**:
  - *Option A (Layout + Index Route Split)*: Split `/destinations` into `{-$locale}.destinations.tsx` (exporting `<Outlet />`) and `{-$locale}.destinations.index.tsx` (exporting `DestinationsPage`). This follows the exact pattern used successfully by `/airport`.
  - *Option B (Flat Layout-Bypassing Route)*: Rename `$code.tsx` to `{-$locale}.destinations_.$code.tsx` to bypass parent route nesting.
- **Recommendation & Trade-offs**: **Option A (Layout + Index Route Split)**. Establishes clean hierarchical nesting consistent with the rest of the application (matching `/airport`, `/admin/bookings`, etc.) and immediately exposes the rich destination detail and embedded booking form to passengers.
- **Impacts**:
  - Critical Functionality: Restores destination detail browsing, schedule inspection, and prefilled booking handoff.
  - Performance & SEO: Generates distinct prerendered HTML pages for each destination under HostPapa static build.
- **Owner Decision Required?**: `NO` (Critical routing bug fix).
- **Classification**: `FIX REGARDLESS`.

---

### Decision Card 6: Visitor Information & Travel Guide Organization

- **Current State**: `/travel` features a sticky sidebar (desktop) and horizontal scrollbar (mobile) navigating 5 travel sections via `<nav aria-label="Travel information">` containing five `<button>` elements. Content points render in checkmark cards. Homepage quick links link to `/travel` without section parameters.
- **Evidence**: `j4_31`, `j4_32`, `j4_33`, `j4_34`, `x_42`.
- **Genuine Strengths**:
  - Clear, scan-friendly point cards for baggage allowances, passport rules, and accessibility assistance.
  - Clean responsive adaptation between desktop sidebar and mobile horizontal tab bar.
- **Defects vs Opportunities**:
  - *Defect*: Homepage quick links ("Baggage", "Accessibility") lose user intent by resetting to section 0 ("prepare").
  - *Defect*: Navigation uses `<nav aria-label="Travel information">` with plain `<button>` elements with `aria-current="true"` rather than WAI-ARIA Tabs pattern; arrow keys do not cycle sections.
- **Materially Distinct Options**:
  - *Option A (URL Search Params + WAI-ARIA Tabs)*: Support `/travel?section=baggage` or `/travel#baggage`. Homepage links directly deep-link to the intended section. Upgrade markup to WAI-ARIA Tabs pattern.
  - *Option B (Accordion Layout)*: Replace sidebar tab switching with a collapsible accordion (`<Accordion>`) where all 5 sections exist on the page simultaneously.
- **Recommendation & Trade-offs**: **Option A (URL Search Params + WAI-ARIA Tabs)**. Preserves the elegant, focused single-section reading experience while enabling direct deep-linking from homepage, footer, and booking flows.
- **Impacts**:
  - User Efficiency: Direct deep-linking saves clicks.
  - A11y: Standard tab keyboard navigation (arrow keys).
- **Owner Decision Required?**: `NO` (Usability and accessibility repair).
- **Classification**: `KEEP UX, REBUILD INFRASTRUCTURE`.

---

## 7. Findings for Interaction System & Synthesis Runs

1. **Modal & Dialog Primitive Standardization**:
   - The public audit identified missing focus containment on the mobile drawer; this heritage audit identified identical focus leakage on the gallery lightbox. The upcoming Interaction System workstream should standardize all modal overlays around a unified, accessible primitive (e.g. Radix Dialog) with guaranteed focus traps, backdrop click dismiss, Escape key handling, and focus return.
2. **Deep-linking & Routing Uniformity**:
   - Both `/travel` and `/destinations` suffered from routing anomalies (missing `<Outlet />` collision on destinations; missing search param / hash synchronization on travel tabs). The routing convention across public utility and heritage must be formalized.
3. **Harmonization of Civil Memory & Airline Operations**:
   - The site successfully maintains tone parity: neither cynical corporate travel hype nor sensationalized rhetoric. The upcoming Synthesis workstream should connect the historical 1998–2000 flight operations in `/airport/past` with the simulated modern flight network in `/flights` to provide seamless historical continuity.

---
