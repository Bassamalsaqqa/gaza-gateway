# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Travelers & Passengers**:
   - Individuals, families, and diaspora travelers planning or simulating journeys to and from Gaza across regional destinations.
   - Users seeking flight schedules, fares, baggage allowances, seat selection, and passenger details.
   - Guest bookers needing quick trip reservations without mandatory account registration, receiving a manageable booking reference (PNR).
   - Travelers retrieving existing reservations to check in, select or change seats, add ancillaries, view or print boarding passes, and manage travel preferences.

2. **Researchers, Historians & Civic Observers**:
   - Visitors seeking documented history, photography, architectural concepts, and civil aviation records relating to Gaza International Airport across its operational past, present state, and future vision.
   - Users browsing historical milestones and multimedia archives with clear distinction between verified source material and provisional placeholders.

3. **Airport Station Agents & Operations Personnel**:
   - Airport staff, station agents, and administrators using a simulated back-office workspace to monitor flight boards, manage operational schedules, inspect passenger manifests, simulate counter bookings and check-in desks, and curate digital content.

## Product Purpose

Gaza Gateway is the bilingual digital home for **Gaza International Airport (IATA: `GZA`)** and **Palestinian Airlines (IATA: `PS`)**.

The product serves a balanced dual purpose:

- **Travel & Passenger Utility**: A complete, modern commercial airline and airport digital experience supporting flight discovery, transparent booking, seat selection, online check-in, boarding passes, and passenger self-service.
- **Civic Memory & Future Vision**: A dignified presentation of Gaza International Airport's history, documentary present, and future architectural concepts, integrated into the life of the airport rather than sequestered in an isolated sub-site.

In its current pre-operational phase, the product functions as a high-fidelity digital prototype and station simulation. It demonstrates operational workflows, establishes technical conventions, and anchors the digital presence of Palestinian civil aviation ahead of any physical airport reconstruction or commercial service launch.

Success means travelers and observers encounter an intuitive, authentic, and cohesive digital experience where airline utility and airport heritage reinforce each other, delivered with equal quality in English and Arabic.

## Positioning

- **Unified Airport & Airline Gateway**: Combines airport station presence and flag-carrier airline operations into one cohesive digital product.
- **Pre-Operational Digital Prototype**: Delivers realistic passenger and operational flows (including guest booking and PNR management) to establish digital readiness and user experience benchmarks without asserting premature commercial or live flight operations.
- **Dignified Public Utility**: Replaces aggressive commercial airline upselling, deceptive conversion tactics, and unrelated advertising with calm, transparent passenger information and respectful civic storytelling.
- **Bilingual Core**: Built from the ground up for seamless operation in both English and Arabic, treating both languages as primary.

## Operating Context

- **Responsive Web Delivery**: Operates across the full span of modern web viewports (320px mobile through wide desktop displays), maintaining usability and layout stability across form factors.
- **Bilingual & Directional Architecture**:
  - English (`/`, LTR) and Arabic (`/ar`, RTL) operate via dedicated, URL-driven namespaces.
  - Directionality is established at the root document level to prevent layout shifts or language flashing.
  - UI copy maintains strict linguistic separation (no bilingual compound labels).
- **Technical Aviation Identifiers**:
  - International aviation data—flight numbers (`PS 204`), booking references (PNRs), airport IATA/ICAO codes (`GZA`, `AMM`), ISO dates, clock times, seat coordinates, phone numbers, and email addresses—remain formatted in left-to-right (LTR) directionality even within Arabic (RTL) views.
- **Open Guest Access**:
  - Public booking and trip lookup do not require mandatory account registration or pre-authentication.

## Capabilities and Constraints

### Core Capabilities

- **Flight Discovery**: Browse departures, arrivals, flight status, and route schedules across the airline network.
- **Booking Flow**: Multi-step reservation workflow covering search, flight selection, fare options, passenger information (including adult-lap infant linking), interactive seat selection, baggage and travel options, trip review, and confirmation with a generated booking reference.
- **Trip Management & Check-in**: PNR-based booking retrieval, self-service changes (seats, baggage, cancellation), passenger check-in per flight leg, and printable/displayable boarding pass issuance.
- **Passenger Account Hub**: Optional profile management, saved travel companions, seat and meal preferences, and past/upcoming trip overviews.
- **Airport Storytelling & Archive**: Structured presentation of airport history (Past), present documentary state (Present), and concept designs (Future), supported by a filterable gallery of photographs, documents, and architectural materials.
- **Station Operations Simulation (`/admin`)**: A comprehensive administrative workspace allowing staff to monitor daily flight status, edit schedules, simulate counter ticketing and desk check-in, manage customer and booking manifests, update site notices, and review system activity.

### Current Technical & Architecture Constraints

- **Client-Side Simulation & Prototype State**: The application runs entirely on client-side state and mock storage singletons (`gza.store.v1`, `gza.admin.v1`, `OpsState`, `admin-mock.ts`, `gza.skin.preview.v1`). Staff authentication, passenger login, booking creation, desk check-in, and flight dispatch operations are simulations. There is no live backend database, authentication server, transactional email service, external airline GDS integration, or payment processor.
- **Pre-Operational Commercial Boundary**: The booking flow concludes at Step 6 (Review & Confirmation) with PNR issuance (e.g. `GZA-7K8P`). No real payment gateway, payment card transactions, or banking integrations exist. Simulated card inputs are validated synthetically and discarded.
- **Privacy & Security Boundaries**: Zero real secrets, database credentials, payment card data, or private customer PII belong in client repositories or bundles. All customer profiles, bookings, and staff records are synthetic test fixtures.
- **HostPapa Static Deployment**: Target hosting is static file serving on shared Apache cPanel hosting (`public_html/`) without persistent server-side Node.js, SSR runtimes, or build daemons. All public routes and application fallback shells are pre-built to static HTML supported by `.htaccess` rewrite rules.
- **Provisional Prototype Data**: Specific initial routes (such as regional routes via Amman, Cairo, Istanbul, Doha, Dubai, Jeddah, Riyadh), named fare tiers, aircraft cabin layouts, and menu options represent current prototype examples and design baselines; they are subject to future refinement and do not bind future UX redesigns.
- **Master Roadmap Progression**: Engineering follows the approved sequence: Phase 3.9 (System Stabilization & Source-of-Truth Reset, current/complete) -> Phase 4 (Canonical Mock Domain & Repository Layer) -> 4B (Typed Content/CMS) -> 4C (Settings/Appearance) -> 5 (Public Workflows) -> 6 (Admin Workflows) -> 7 (CMS Admin) -> 7B (Media/Provenance Admin) -> 8 (Visual/Assets) -> 9 (Arabic/RTL/a11y) -> 10 (Durable Regressions) -> 11 (SEO/Performance/HostPapa) -> 12 (Backend Readiness) -> 13 (Backend/Auth/Database) -> 14+ (Optional Integrations).

## Brand Commitments

- **Entity Names**: Gaza International Airport (مطار غزة الدولي; IATA: `GZA`) and Palestinian Airlines (الخطوط الجوية الفلسطينية; IATA: `PS`).
- **Tone & Voice**: Dignified, calm, professional, clear, and hospitable. Avoid generic corporate travel hype, aggressive artificial urgency, or polemical rhetoric.
- **Factual & Archive Provenance**:
  - Historical dates, milestones, and documentation must be grounded in verified archival evidence.
  - Official vector brand marks and authentic historical imagery will be provided by the owner in dedicated asset phases; no fabricated provenance or synthetic identities should be introduced.
  - **Canonical Truth Classification**: All media is strictly classified under `TruthClass`: `"future-concept-ai"`, `"brand-mark"`, or `"placeholder"`. AI future concepts must always display visible illustrative disclosure badges and must never substitute for historical or present evidence.
  - **Asset & Content Ingestion Protocol**: Future asset drops must preserve masters, classify truth/era/rights, generate optimized multi-breakpoint WebP variants, declare stable semantic IDs in `src/lib/media.ts`, provide bilingual accessible metadata (`altEn`/`altAr`), and verify in-browser. Content updates before Phase 4B proceed via source edits; after Phase 4B, via canonical typed CMS records.
- **Visual Design Independence**: The incumbent color palette, typography hierarchy, and component styling documented in `docs/DESIGN_SYSTEM.md` represent the current baseline implementation and do not restrict future UI, typography, or visual redesign.

## Evidence on Hand

- **Prototype Datasets**:
  - Network schedule generation logic for regional routes connecting Gaza (`src/lib/data.ts`).
  - Canonical flight bookability rules (`isFlightBookable`, `getFlightBookability`) and draft recovery (`validateAndSanitizeDraft`) in `src/lib/booking-rules.ts` and `src/lib/booking-draft.ts`.
  - Illustrative aircraft cabin models with multi-zone seat maps (`src/lib/data.ts`, `src/lib/admin-ops.ts`).
  - Provisional historical milestones and placeholder gallery records (`src/lib/data.ts`).
  - Synthetic administrative records for bookings, customers, staff accounts, and activity logs (`src/lib/admin-mock.ts`).
  - Authored Appearance Studio skin and surface grammar (`src/lib/skin.ts`, `src/design/surfaces/`).
- **Confirmed Absences (Must Not Fabricate)**:
  - No live commercial ticketing, payment processing, or airline merchant facilities.
  - No verified historical photo archives or official vector logo files currently committed in the repository. Placeholder imagery and AI concepts must never masquerade as historical evidence.

## Product Principles

1. **Coherent Dual Purpose**:
   Travel utility and cultural preservation belong to the same institution. Flight booking and airport storytelling must feel like parts of one unified digital airport experience rather than separate products.

2. **Technical Aviation Precision**:
   Airline codes, flight numbers, booking references, cabin classes, and operational states must follow recognizable international civil aviation conventions, ensuring the prototype remains technically credible.

3. **Linguistic Parity**:
   English and Arabic are equal first-class citizens. Both languages must provide complete feature coverage, natural typographic layout, proper bidirectional mirroring, and correct isolation of technical identifiers.

4. **Integrity in Evidence**:
   Maintain clear boundaries between verified historical facts, realistic prototype behaviors, and temporary placeholder content. Never present mock data or placeholder images as authenticated historical artifacts.

5. **Dignified, Frictionless UX**:
   Prioritize user clarity, accessibility, and speed over decorative complexity or aggressive marketing. Allow travelers and observers to accomplish their tasks with minimal friction and maximum respect.

## Accessibility & Inclusion

- **Quality Target**: Target WCAG 2.2 AA conformance across all public and administrative interfaces.
- **Responsive Breadth**: Complete functional and visual usability across device viewports from 320px to 1920px without unintended horizontal overflow.
- **Keyboard & Focus Ergonomics**: Full keyboard navigability across all interactive elements, visible focus indicators, logical tab ordering, Escape key dismissal for overlays, and proper focus containment and restoration for dialogs.
- **Directional & Typographic Integrity**: Native Arabic text flow respecting cursive letterforms and ligatures without artificial letter-spacing or case transformations, paired with isolated LTR rendering for technical codes.
- **Semantic Structure**: Meaningful semantic HTML landmarks, clear form labeling, accessible error messaging, and appropriate ARIA attributes for dynamic interactive components.
