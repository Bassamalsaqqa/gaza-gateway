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

- **Client-Side Simulation & Prototype State**: `gza.repo.v1` is the canonical local repository for completed bookings and flight operational overrides. `gza.passenger.v1` is the canonical local repository for passenger account and saved companions (`PassengerRepository`), which strictly never stores passwords or security credentials. `gza.contact.v1` is the canonical local repository for customer contact enquiries and administrative inbox state (`ContactRepository`), completely decoupled from contact settings and bookings. Home, Travel, Airport Past, and Airport Present published editorial content is compiled from typed `src/content/published/` records; `gza.content.draft.v1` stores only browser-local, unpublished drafts. `gza.settings.draft.v1` stores browser-local, unpublished drafts for Contact and Appearance settings, while `gza.skin.preview.v1` remains only as a dormant, unmutated migration fallback. `gza.store.v1` is a closed legacy key with zero active writers, while `gza.booking.draft.v1` retains the active booking wizard draft. `gza.admin.v1` retains the simulated staff session. Product-domain `OpsState` is eliminated; remaining staff/activity/CMS `admin-mock.ts` fixtures are separate later-phase work. There is no live backend database, authentication server, transactional email service, external airline GDS integration, or payment processor.
- **Pre-Operational Commercial Boundary**: The booking flow concludes at Step 6 (Review & Confirmation) with PNR issuance (e.g. `GZA-7K8P`). No real payment gateway, payment card transactions, or banking integrations exist. Simulated card inputs are validated synthetically and discarded. Contact form submissions are saved locally on device for workflow testing; no emails are transmitted.
- **Privacy & Security Boundaries**: Secrets, database credentials and payment card data must not be stored in client repositories or bundles. Compiled demo profiles, bookings, contact messages and staff records are synthetic fixtures. User-entered enquiries may contain real names, email addresses and message content; they remain in browser-local `gza.contact.v1`, are not included in compiled static output, and are not transmitted to a backend or staff device.
- **HostPapa Static Deployment**: Target hosting is static file serving on shared Apache cPanel hosting (`public_html/`) without persistent server-side Node.js, SSR runtimes, or build daemons. All public routes and application fallback shells are pre-built to static HTML supported by `.htaccess` rewrite rules.
- **Provisional Prototype Data**: Specific initial routes (such as regional routes via Amman, Cairo, Istanbul, Doha, Dubai, Jeddah, Riyadh), named fare tiers, aircraft cabin layouts, and menu options represent current prototype examples and design baselines; they are subject to future refinement and do not bind future UX redesigns.
- **Master Roadmap Progression**: Phase 4 complete; Designer Media & Public Surface Integration Checkpoint accepted by owner; Phase 5A (Passenger State, Account & Auth-Truth Convergence) complete; HC-0/HC-1 (Present Dossier + Archive Foundation) accepted by owner with publication authorized; Phase 5B (Booking Draft & Search Convergence) complete; Phase 5C (Manage, Check-in & Boarding Pass Convergence) complete (accepted source on main); HC-2 (Historical Archive Publication & Documentary Foundation) complete (accepted source on main); HC-3 (Owner Archive Visual Integration & Media Experience) complete (accepted source on main); Phase 5D (Public Contact Workflow Convergence) is Complete / Accepted Source / Deployed by Owner (engineering acceptance: `05f0e97982f47b18e40b93d1cb3f2e29b548eff2`); Phase 6A (Admin Commercial Desk Convergence) is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`); Phase 6B1 is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`). Phase 6B2A is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`); Phase 6B2B is Complete / Accepted Source; Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence is Complete / Accepted Source; Phase 6B2C2A - Stable Dated-Service Materialization Foundation is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Phase 6C (Admin Directory Staff & Activity Convergence), Phase 7 (CMS Admin), Phase 7B (Media/Provenance Admin), Phase 8 (Visual/Assets), Phase 9 (Arabic/RTL/a11y), Phase 10 (Durable Regressions), Phase 11 (SEO/Performance/HostPapa), Phase 12 (Backend Readiness), Phase 13 (Backend/Auth/Database), and 14+ (Optional Integrations) unstarted.
- **Current Production / Source Checkpoint**: Phase 6B2A — Sellable Commercial Catalog & Pricing Authority — is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint. Current owner-deployed production release: `2751e22be91ad74eacc9213489a57a21baf04807`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`. Deployment is confirmed by the product owner. Git/source/release provenance was independently checked after deployment; no independent live-browser verification from the ChatGPT/Codex environment is claimed. Main may advance through accepted source engineering and documentation commits while the deployed runtime source remains unchanged. Phase 6B1 is a historical completed production phase: Complete / Accepted Source / Accepted Release / Deployed by Owner (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`, engineering `b2e37ba4f7d2b0ae66a444747340acfe818a3832`). Phase 6A is a historical completed production phase: Complete / Accepted Source / Accepted Release / Deployed by Owner (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`, source `2ae1a876018992649074cbed1ebf0560e4da03ff`, engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`). Phase 5D is a historical completed phase: Complete / Accepted Source / Deployed by Owner (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source). Phase 6C — Admin Directory Staff & Activity Convergence, Phase 7 and Phase 7B remain Planned / Unstarted.

## Brand Commitments

- **Entity Names**: Gaza International Airport (مطار غزة الدولي; IATA: `GZA`) and Palestinian Airlines (الخطوط الجوية الفلسطينية; IATA: `PS`).
- **Tone & Voice**: Dignified, calm, professional, clear, and hospitable. Avoid generic corporate travel hype, aggressive artificial urgency, or polemical rhetoric.
- **Factual & Archive Provenance**:
  - Historical dates, milestones, and documentation must be grounded in verified archival evidence.
  - In HC-3, canonical intake represented 67 archive records: 58 owner intake files (57 unique visual hashes, 1 duplicate `past-052 -> past-050`), 8 video records, 1 Gisha ruins record. Under an explicit publication basis (`product-owner-directed-display`), 37 eligible owner records (36 photographs and 1 document) are displayed alongside the licensed Gisha 2008 ruins image (37 photographs and 1 document in total), with 124 responsive WebP derivatives generated (widths up to native max ceiling) and registered with `historical-documentary` truth class. 4 verified external video references are integrated via a lightweight player without local video files. 18 owner intake records remain held (9 rights holds and 9 provenance/rights holds); past-037 remains staging pending license conditions, past-004 is an excluded digital aircraft illustration, and past-052 is the excluded duplicate of past-050. Canonical public archive media is accessed via `getPublishedArchiveRecords()`, and external primary references via `SOURCE_REGISTRY`. Official vector brand marks have not yet been provided by the owner; no fabricated provenance or synthetic identities should be introduced.
  - **Canonical Truth Classification**: All media is strictly classified under `TruthClass`: `"future-concept-ai"`, `"historical-documentary"`, `"illustrative-photo"`, `"brand-mark"`, or `"placeholder"`. AI future concepts must always display visible illustrative disclosure badges and must never substitute for historical or present evidence.
  - **Asset & Content Ingestion Protocol**: Future asset drops must preserve masters, classify truth/era/rights, generate optimized multi-breakpoint WebP variants, declare stable semantic IDs in `src/lib/media.ts`, provide bilingual accessible metadata (`altEn`/`altAr`), and verify in-browser. Home, Travel, Past, and Present editorial updates now use canonical typed records; local drafts require engineering promotion and a verified release to become globally published.
- **Visual Design Independence**: The incumbent color palette, typography hierarchy, and component styling documented in `docs/DESIGN_SYSTEM.md` represent the current baseline implementation and do not restrict future UI, typography, or visual redesign.

## Evidence on Hand

- **Prototype Datasets**:
  - Network schedule generation logic for regional routes connecting Gaza (`src/lib/data.ts`).
  - Canonical flight bookability rules (`isFlightBookable`, `getFlightBookability`) and draft recovery (`validateAndSanitizeDraft`) in `src/lib/booking-rules.ts` and `src/lib/booking-draft.ts`.
  - Illustrative aircraft cabin models with multi-zone seat maps (`src/lib/fleet/`, `src/components/seat-map.tsx`).
  - Provisional historical milestones and placeholder gallery records (`src/lib/data.ts`).
  - Synthetic administrative records for bookings, customers, staff accounts, and activity logs (`src/lib/admin-mock.ts`).
  - Authored Appearance Studio skin and surface grammar (`src/lib/skin.ts`, `src/design/surfaces/`).
- **Confirmed Absences (Must Not Fabricate)**:
  - No live commercial ticketing, payment processing, or airline merchant facilities.
  - Official vector logo files remain unsupplied. A small verified documentary photo set is committed (`airport-archive-hero-2000`, `gallery-aircraft-archive-2000`, `airport-present-ruins-2008`), and accepted HC-3 represents all 58 owner intake files in the 67-record canonical archive. Public local media comprises 36 owner-directed photographs, 1 licensed Gisha photograph and 1 owner-directed document, plus 4 verified external video references. The owner intake has 18 held records, 1 staging record and 2 exclusions (illustration and duplicate), with 124 responsive WebP derivatives for public owner records. Owner-directed display is not rights clearance; `rights-cleared`, `product-owner-directed-display` and `external-embed` remain distinct. Placeholder imagery and AI concepts must never masquerade as historical evidence.

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

## Phase 6B1 accepted source (historical completed production phase)

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase reconciled onto main and deployed by Bassam (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. In accepted Phase 6B2B source, aircraft and seat layouts use `FleetRepository`; Network reference configuration now uses NetworkRepository in Phase 6B2C1; public editorial and merchandising fixtures remain compiled. Commercial product configuration uses `CommercialCatalogRepository`; there is no monolithic durable OpsState. See [Schedule model](docs/SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B2 is Complete / Accepted Source: Phase 6B2A — Sellable Commercial Catalog & Pricing Authority is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority is Complete / Accepted Source; Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence is Complete / Accepted Source; Phase 6B2C2A - Stable Dated-Service Materialization Foundation is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. Deployment is owner-confirmed; Git/source/release provenance was independently checked after deployment. No independent ChatGPT/Codex live-browser verification is claimed. The earlier Phase 6B2A post-deployment documentation reconciliation performed no rebuild or deployment.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository owns recurring planning and structured effects; DatedServiceResolver now projects current service discovery from Schedule and Network authority.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner**, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](docs/COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own commercial catalog state or proxy flight overrides. Aircraft and seat layouts use `FleetRepository` in accepted Phase 6B2B source; current drafts use Fleet geometry and confirmed PNRs use stored or frozen legacy layouts. Existing Flight IDs remain compatibility identities; current services use stable Schedule-derived IDs and ScheduleRepository now supplies the current resolver. Phase 6B is Complete / Accepted Source. Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source; Phase 6C, Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

## Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority

**Complete / Accepted Source**

Phase 6B2B implements canonical fleet and dynamic seat layout authority while preserving deployed Phase 6B2A as the active production checkpoint (release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, accepted engineering SHA `1c5e6b6259add7b59199725f6b23324e8d1c58eb`).

- **Canonical Fleet Repository (`gza.fleet.v1`)**: Governs the fleet model and dynamic seat layouts with deterministic seeds for A320 (`a320neo`, 168 seats), A321 (`a321neo`, 196 usable seats), and B737-800 (`b737800`, 162 seats). Supports persistent layouts with derived capacity and cabin classes.
- **Stable Aircraft Identity**: Additive `aircraftId` on `Flight` and `Schedule` maintains byte-for-byte backwards compatibility with legacy flight identifiers (`PS100-...`), flight numbers, routes, and dates. Operational flight overrides support dynamic aircraft assignment without mutating baseline schedules.
- **Dynamic Seat Authority & UI Components**: `SeatMap` dynamically renders layout geometry (rows, letters, aisles, emergency exits, wing markers, class partitions, lavatories, galleys, bassinet and accessible seats), roving keyboard tabindex, ARIA selection counts, and physical LTR rendering inside Arabic RTL containers.
- **Booking Seat Layout Snapshots (`BookingSeatLayoutsV1`)**: Confirmed PNRs store immutable per-leg layout snapshots on creation, preserving historical seating geometry regardless of subsequent fleet reconfigurations. Legacy bookings without snapshots resolve the frozen 28-row baseline layout without mutation. Current booking drafts dynamically resolve active fleet layouts.
- **Transactional Cross-PNR Occupancy**: `BookingRepository` enforces seat uniqueness across all active bookings sharing the same flight ID during creation, seat changes, and check-in completion, preventing seat double-booking collisions across PNRs.
- **Operational Boundaries**: Coarse `seatsLeft` snapshots remain operational metrics. Fleet and booking storage maintain separate aggregate command boundaries. No automated equipment re-accommodation, schedule materialization, destination persistence, or server inventory ledger is introduced.
- **Subsequent Phases**: Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source; Phase 6C — Admin Directory Staff & Activity Convergence, Phase 7, and Phase 7B remain Planned / Unstarted.

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2A is **Complete / Accepted Source**; Phase 6B2C2B remains **Complete / Accepted Source**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Complete / Accepted Source.** Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; its release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [docs/NETWORK_MODEL.md](docs/NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.

## Phase 6B2C2A - Stable Dated-Service Materialization Foundation

**Complete / Accepted Source.** Establishes pure, deterministic projection of recurring schedules onto concrete calendar dates with structured operational effects (`cancelled`, `time`, `aircraft`, `extra`). Versioned URL-safe reversible codec `svc1-<base64url>-<date>` preserves exact Schedule identity without loss. Schedule lifecycle eliminates destructive `remove`; `active = false` is the sole retirement mechanism.

Phase 6B2A is Complete / Accepted Source / Accepted Release / Deployed by Owner (current production release: `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`). Phase 6B2B is Complete / Accepted Source (release/deployment intentionally pending). Phase 6B2C1 is Complete / Accepted Source.

Phase 6B2C2B - Network & Dated-Service Discovery Cutover: **Complete / Accepted Source**. In Phase 6B2C2A, live consumer discovery (Public Flights, Home board, Flight Detail, Booking search, Admin global search) remains bound to the compiled legacy generator and canonical overrides. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [docs/DATED_SERVICE_MODEL.md](docs/DATED_SERVICE_MODEL.md).

## Phase 6B2C2A accepted-source checkpoint

**Phase 6B2C2A Complete / Accepted Source.** ChatGPT independently accepted engineering at `429ca82dfa3db0453feeab5b53bb45e9e14cf45a` (reviewed original implementation: `2e1a3e626c48836384cb22ed57a4d6c4a13e7be3`). Accepted C2A source is `412fc2b4f79e01da0607b5bca44e01d76156a634`; the source-finalization handback records its provenance. C2A has no Accepted Release and is not deployed.

Phase 6B2B and Phase 6B2C1 are Complete / Accepted Source; their release/deployment is intentionally pending. Production remains owner-deployed Phase 6B2A, Complete / Accepted Source / Accepted Release / Deployed by Owner: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2C2B remains Complete / Accepted Source; Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. The historical C2A finalization performed no public or Booking discovery cutover, stored identity migration, release or deployment. C2B current behavior is described below.

## Phase 6B2C2B - Canonical Dated-Service Discovery & Booking Cutover

**Complete / Accepted Source.** Baseline accepted source: `412fc2b4f79e01da0607b5bca44e01d76156a634`. Phase 6B2C2A remains Complete / Accepted Source (accepted engineering `429ca82dfa3db0453feeab5b53bb45e9e14cf45a`). Phase 6B as a whole is Complete / Accepted Source.

Current authority is NetworkRepository + ScheduleRepository + read-only compiled route merchandising price, projected by the shared DatedServiceResolver into `svc1-*` Flights, then composed with canonical FlightOverride. Current search, monthly sellability, Home/public boards, Admin search and new public/desk Booking creation use this chain. Valid empty Schedule storage produces zero current services; corrupt Schedule/Network authority fails truthfully without legacy discovery fallback.

New Booking commands resolve current service IDs only. Committed submission replay precedes every external authority read. Command-time Commercial/Fleet/Schedule/Network snapshots are composed with transaction-current FlightOverrides, and Flight/pricing/seat-layout snapshots plus total commit together in `gza.repo.v1`. This is browser command-time snapshot composition, not multi-store ACID.

Broad Flight lookup retains stored Booking Flight snapshots for history. Operational boards retain only confirmed-PNR snapshots and relevant override-only legacy Flights; cancelled PNRs cannot independently retain a retired board row. Current bases take precedence when available. Existing PNR mutations can fall back to their stored Flight plus current override during planning removal or authority corruption. Historical pricing and seat-layout snapshots remain authoritative. Planning deactivation is not retroactive cancellation: explicit structured cancellation or FlightOverride cancellation supplies operational truth.

The frozen legacy generator is compatibility-only. There is no generated Flight persistence store, hardcoded cutover date, PNR/draft/override identity migration, backend or cross-device claim. Browser-local `svc1-*` Flight Detail uses generic static metadata because prerender cannot read local Schedule/Network state. Booking route selectors use active Network routes; compiled destination information pages remain available.

Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1 and Phase 6B2C2A release/deployment remain intentionally pending. C2B engineering is accepted and source is finalized; C2B has no Accepted Release and is not deployed. Phase 6C / 7 / 7B remain Planned / Unstarted.


## Phase 6B2C2B accepted-source checkpoint

**Phase 6B2C2B Complete / Accepted Source. Phase 6B Complete / Accepted Source.** ChatGPT independently accepted engineering at `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4` (original implementation: `ff46f8e7ab606731be679eaedbada9e07d09e91a`; accepted C2A baseline: `412fc2b4f79e01da0607b5bca44e01d76156a634`). Acceptance is recorded in the owner-supplied 2026-10-06 master handoff. The accepted-source candidate is the docs/status-only finalization commit introducing this checkpoint; its exact SHA is recorded in the publication handback. Independent accepted-source verification precedes main fast-forward.

PNR-facing Flight reads use `(Booking reference, leg)`: current service when available, otherwise that exact leg's stored Flight, then current FlightOverride. Historical pricing and seat-layout snapshots remain unchanged. Admin Check-in can discover confirmed PNRs using their own snapshots during planning failure, with an explicit localized warning. Public/new-sale authority still fails truthfully. Cancelled PNRs preserve their own history without independently resurrecting retired operational board rows.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1, Phase 6B2C2A and Phase 6B2C2B release/deployment remain pending. Phase 6B has no consolidated Accepted Release and is not deployed as a consolidated milestone. No live production verification is claimed by this finalization.

**Next milestone:** independently verify accepted source, then construct/review the consolidated Phase 6B HostPapa release for owner deployment and production reconciliation. Phase 6C / 7 / 7B remain Planned / Unstarted. This finalization changes no runtime implementation. The immutable planning snapshot is [the 2026-10-06 master handoff](GAZA_GATEWAY_MASTER_AI_AGENT_HANDOFF_ROADMAP_2026-10-06.md); its pre-finalization refs/status are historical snapshot facts, not moving current refs.
