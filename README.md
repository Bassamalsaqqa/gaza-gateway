# Gaza Gateway

> **Product**: Gaza International Airport (`GZA`) & Palestinian Airlines (`PS`)
> **Production Domain**: [https://www.gazaairport.com](https://www.gazaairport.com)
> **Engineering Status**: **Phase 6A Complete / Accepted Source / Accepted Release / Deployed by Owner.** Phase 5A–5D and HC-0–HC-3 are Complete / Accepted Source. Phase 5D — Public Contact Workflow Convergence is Complete / Accepted Source / Deployed by Owner (engineering acceptance: `05f0e97982f47b18e40b93d1cb3f2e29b548eff2`); Phase 6A — Admin Commercial Desk Convergence is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`). Phase 6B1 is Implemented / Awaiting Independent Review on its feature branch. Phase 6B2 (Network, Fleet & Sellable Product Authority), Phase 6C (Admin Directory Staff & Activity Convergence), Phase 7, and Phase 7B remain Planned / Unstarted. HC-3 delivers canonical ingestion of 67 archive records (58 owner intake, 8 video intake, 1 Gisha ruins record), explicit publication basis (`rights-cleared`, `product-owner-directed-display`, `external-embed`), 37 published photographs (36 owner-directed + 1 licensed Gisha) and 1 owner-directed document, with 124 responsive WebP derivatives for the 37 owner records, 4 verified external video references via lightweight `ArchiveVideoPlayer`, authentic documentary imagery across Home and Airport Overview, documentary chapter strips and watch-archive section on Airport Past, and refined typography and text-half textures on Airport Future. See [roadmap.md](roadmap.md) for the full sequence.
> **Production / Source Checkpoint**: Phase 6A — Admin Commercial Desk Convergence — is Complete / Accepted Source / Accepted Release / Deployed by Owner. Current owner-deployed production release: `b5cff4db4b6e087907a9733ffd841880439fbfdb`; deployed runtime source: `2ae1a876018992649074cbed1ebf0560e4da03ff`; accepted engineering SHA: `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`. Deployment is confirmed by the product owner. Git/release provenance and the package were independently verified before deployment; no independent live-browser verification from the ChatGPT environment is claimed. Main may advance through documentation-only commits while the deployed runtime source remains unchanged. Phase 5D is a historical completed phase: Complete / Accepted Source / Deployed by Owner (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`).
> **Immediate Next Step**: Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence (Implemented / Awaiting Independent Review). Phase 6B2 — Network, Fleet & Sellable Product Authority (Planned / Unstarted). Phase 6C — Admin Directory Staff & Activity Convergence, Phase 7 and Phase 7B remain Planned / Unstarted.
> **Documentation Index**:
> - [Master Engineering Roadmap (Phases 0–12)](roadmap.md)
> - [System Architecture Specification](docs/ARCHITECTURE.md)
> - [Data Flow, State Stores & Pretend-Action Inventory](docs/DATA_FLOW.md)
> - [Typed Editorial Content Model](docs/CONTENT_MODEL.md)
> - [Contact Domain & Administrative Inbox Model](docs/CONTACT_MODEL.md)
> - [Settings Model Architecture](docs/SETTINGS_MODEL.md)
> - [Canonical Domain & Repository Architecture](docs/CANONICAL_REPOSITORIES.md)
> - [HostPapa Deployment Architecture Guide](docs/HOSTPAPA_DEPLOYMENT.md)
> - [Engineering Invariants & Agent Guidelines](AGENTS.md)
> - [Routes Architecture & Conventions](src/routes/README.md)

---

## Original Product Design Brief

Design and build a complete modern public-facing website for:




GAZA INTERNATIONAL AIRPORT

GZA




with the main airline experience centered around:




PALESTINIAN AIRLINES

PS




I want this designed the way a strong modern airline or international airport

website would be designed.




Use your best UI/UX and product-design judgment.




Do not ask me to choose colors, typography, layouts, card styles, navigation

patterns, or a visual theme before you start.




Choose the design direction yourself and make it coherent across the entire

website.




The result should feel polished, credible, modern, premium, easy to use, and

specific to Gaza International Airport and Palestinian Airlines.






============================================================

MAIN IDEA

============================================================




The website has two main purposes.




First, it should work like a real airport / airline travel website.




A visitor should be able to:




- search for flights from Gaza

- explore destinations

- view departures and arrivals

- book a flight

- choose a fare

- enter passenger details

- choose seats

- choose baggage and extras

- review the trip

- confirm the booking

- receive a booking reference

- manage the booking later

- optionally create an account

- view trips and boarding-pass-related content




Second, the website should preserve and present Gaza International Airport itself.




Visitors should also be able to explore:




- the airport's history

- important moments and milestones

- archive material

- photographs and documents

- the airport's present/current-state story

- its future vision

- future architecture and concept material

- a rich gallery/archive




These two sides should feel like one coherent airport website, not two unrelated

products.





============================================================

AIRLINE AND ROUTES

============================================================




The main airline is:




Palestinian Airlines

الخطوط الجوية الفلسطينية

Code: PS




The initial route network should include flights between Gaza International

Airport and:




- Amman — AMM

- Cairo — CAI

- Istanbul — IST

- Doha — DOH

- Dubai — DXB

- Jeddah — JED

- Riyadh — RUH




Use realistic mock flight numbers, schedules, durations, fares, aircraft, seats,

baggage allowances, and booking details for the frontend experience.




This is frontend mock data only.





============================================================

PUBLIC WEBSITE

============================================================




Create the complete visitor-facing website.




Include the pages and experiences you would expect from a good modern airline

and airport website, including:




- Homepage

- Flights / Departures / Arrivals

- Destinations

- Book a Flight

- Manage Booking

- Travel / Passenger Information

- The Airport

- History / Past

- Present

- Future Vision

- Gallery / Archive

- About

- Contact

- Sign In / Register

- Passenger Account

- My Trips

- Trip Details

- Boarding Passes

- Saved Travelers

- Profile

- appropriate supporting, error, and empty states




Organize the navigation in the way you think provides the best user experience.





============================================================

HOMEPAGE

============================================================




Design the homepage like a strong airline/airport homepage.




It should make it immediately easy to:




- search for a flight

- see useful flight information

- explore destinations

- manage an existing booking




It should also introduce Gaza International Airport and encourage visitors to

discover its story, history, gallery, current state, and future vision.




The booking/travel utility should feel natural and prominent.




The airport story should add character and meaning without making the homepage

feel like a museum.





============================================================

FLIGHT SEARCH

============================================================




Create a high-quality flight-search experience.




Support:




- Round trip

- One way

- From

- To

- Departure date

- Return date

- Passengers

- Cabin

- Search Flights




Default origin:




GZA — Gaza International Airport




Use the initial destinations listed above.




Make this work very well on both desktop and mobile.





============================================================

FLIGHTS

============================================================




Create a useful Flights experience with:




- Departures

- Arrivals

- date

- flight number

- destination/origin

- time

- status

- useful flight details




Use statuses such as:




- Scheduled

- On Time

- Boarding

- Delayed

- Departed

- Landed

- Cancelled




Design it as a modern airport information experience.





============================================================

DESTINATIONS

============================================================




Create a destination-discovery experience for the initial route network.




Use appropriate generic city/travel imagery from the internet.




Let visitors understand the destination and quickly start booking.





============================================================

BOOKING EXPERIENCE

============================================================




Create the complete frontend booking flow.




A sensible flow would include:




Search

→ Flight Results

→ Select Flight

→ Fare Selection

→ Passenger Details

→ Seat Selection

→ Baggage / Extras

→ Review

→ Confirmation




Do not include payment yet.




We may add payment later between Review and Confirmation.




Allow guest booking.




Do not force a visitor to create an account before completing a booking.




After booking, the user may optionally create an account.





============================================================

FARES

============================================================




Create a realistic airline fare-selection experience.




You may choose suitable fare names and structure.




Clearly show differences such as:




- price

- baggage

- seat selection

- flexibility

- changes

- cancellation/refund conditions




Use your best airline UX judgment.





============================================================

SEAT SELECTION

============================================================




Create a proper interactive airline seat-selection experience.




Include:




- aircraft seat map

- rows

- aisles

- available seats

- unavailable seats

- selected seats

- passenger assignment

- clear legend




Make the mobile experience genuinely usable.





============================================================

BAGGAGE AND EXTRAS

============================================================




Create a realistic but restrained extras step.




This may include:




- baggage

- extra baggage

- meals

- special assistance

- other useful passenger options




Do not make it feel like an aggressive ecommerce upsell flow.





============================================================

BOOKING CONFIRMATION

============================================================




Create a polished confirmation experience.




Show useful information such as:




- Booking Confirmed

- Booking Reference / PNR

- Route

- Flight

- Date

- Passengers

- Seats

- Baggage

- next actions




Useful actions could include:




- View Booking

- Manage Booking

- Boarding Pass

- Create Account





============================================================

MANAGE BOOKING

============================================================




Create a public Manage Booking experience.




Allow lookup using:




- Booking Reference / PNR

- Last Name or Email




Then show the trip, passengers, seats, baggage, status, and useful management

actions.




Frontend prototype behavior is enough for now.





============================================================

PASSENGER ACCOUNT

============================================================




Create a simple modern passenger account.




Include:




- Overview

- My Trips

- Trip Details

- Boarding Passes

- Saved Travelers

- Profile

- Preferences

- Security




Keep it practical and easy to use.




It should belong to the same overall design system as the public website.





============================================================

THE AIRPORT

============================================================




Create a major section dedicated to Gaza International Airport itself.




I want visitors to be able to understand the airport across:




PAST

PRESENT

FUTURE




Choose the best UX for this.




It could use chapters, navigation, timeline, scrolling, tabs, or another design

you think works better.





============================================================

PAST / HISTORY

============================================================




Create a rich historical experience that can eventually contain:




- airport history

- construction

- opening

- milestones

- archive photography

- documents

- maps

- tickets / ephemera

- people

- stories

- oral histories

- sources and archive metadata




Do not invent detailed historical facts when they are not provided.




Use sensible placeholder content until real archive material is supplied.





============================================================

PRESENT

============================================================




Create a section for the airport's current-state story.




This should be more documentary and factual in character.




The final project will later receive proper current imagery and content.




Do not pretend generic temporary photography is genuine documentary material.





============================================================

FUTURE VISION

============================================================




Create an inspiring Future Vision experience that can later contain:




- airport concepts

- terminal concepts

- masterplan

- architectural imagery

- future passenger experience

- future destinations

- galleries

- supporting project information




Real future-vision images will be supplied later.





============================================================

GALLERY / ARCHIVE

============================================================




Create a rich gallery/archive experience.




It should be able to handle:




- photographs

- documents

- architecture

- historical material

- future concepts

- video if needed later




Include useful browsing, filtering, and a polished image/detail viewer.





============================================================

TRAVEL INFORMATION

============================================================




Create the useful passenger-information areas expected from a good airport

website.




This may include:




- Departures

- Arrivals

- Baggage

- Accessibility

- Travel Preparation

- Travel Documents

- At the Airport




Use your judgment about how to organize this clearly.





============================================================

ABOUT AND CONTACT

============================================================




Create a proper About page for Gaza International Airport.




Also create a real Contact page with a clean contact form and space for public

contact information and social links.




No backend submission is needed yet.





============================================================

LANGUAGES

============================================================




Support:




English

Arabic




Both should feel first-class.




English mode should show English UI.




Arabic mode should show Arabic UI and proper RTL behavior.




Do not display both languages under every interface label.




Technical identifiers such as:




GZA

PS101

AMM

CAI

12A

PNR codes




can remain naturally LTR inside Arabic UI.





============================================================

IMAGES

============================================================




DO NOT GENERATE IMAGES.




Use good-quality generic images from the internet or appropriate placeholder

image sources for the purpose of designing the website.




We will replace them later with the correct:




- Gaza Airport photography

- Palestinian Airlines imagery

- archive photographs

- documents

- present-state imagery

- future architectural renders

- logo

- boarding pass

- gallery assets




Keep imagery easy to replace later.




For city/destination pages, appropriate generic destination photography is fine.




Do not present unrelated generic imagery as authentic Gaza Airport historical or

documentary material.





============================================================

BRANDING

============================================================




The final logo has not been provided yet.




Use a simple temporary brand treatment for:




GZA

Gaza International Airport




Keep it easy to replace later.




You decide the overall visual identity, colors, typography, layout system, and

UI style.





============================================================

FRONTEND ONLY

============================================================




Build the frontend and UX only.




Use local/mock state where interaction is useful.




Do not implement:




- backend

- database

- Supabase

- cloud backend

- real authentication backend

- real email

- real payment

- production booking inventory

- external APIs




We will connect these systems later.





============================================================

RESPONSIVE AND ACCESSIBLE

============================================================




Make the whole experience excellent across:




- mobile

- tablet

- laptop

- desktop




Do not simply shrink desktop layouts.




Design mobile properly.




Pay particular attention to:




- flight search

- booking

- passenger forms

- seat selection

- Manage Booking

- account

- gallery

- Arabic RTL




Use strong accessibility practices:




- readable contrast

- keyboard support

- clear focus

- proper labels

- usable touch targets

- semantic structure

- reduced-motion consideration





============================================================

DESIGN EXPECTATION

============================================================




Think about how the best airline and airport websites solve these problems.




Then design your own solution for Gaza International Airport and Palestinian

Airlines.




I want your design judgment, not a prescribed theme.




Do not wait for me to choose:




- colors

- fonts

- layout

- navigation style

- hero style

- card style

- visual direction




Choose what works best and build it.




Avoid generic AI-template design.




Avoid unnecessary complexity.




Avoid making everything a card.




Avoid excessive visual effects.




Prioritize:




- excellent airline UX

- clear travel actions

- easy booking

- strong mobile design

- coherent visual identity

- meaningful airport storytelling

- excellent Arabic/RTL

- overall polish





============================================================

FINAL INSTRUCTION

============================================================




Build the complete visitor-facing Gaza International Airport / Palestinian

Airlines frontend.




Do not build the admin panel yet.




Do not generate images.




Use generic internet imagery temporarily.




Do not implement backend infrastructure.




Use your best current UI/UX judgment and create the design you believe is most

appropriate for a modern airline and international airport website.




Make it complete enough for us to evaluate the overall product direction, not

just the homepage.

## Development & Build

You need Node.js 20+ and npm:

```sh
# Install dependencies
npm ci

# Local development server
npm run dev

# Normal build (Nitro SSR / Cloudflare Pages)
npm run build

# Static HostPapa build (Static prerender + shells in dist/client/ for Apache cPanel)
npm run build:hostpapa

# Quality gates
npm run typecheck
npm run lint
```

## Contact prototype transport boundary

`gza.contact.v1` stores enquiries only in browser-local storage. Public submissions do not transmit data to airport staff. Admin Inbox shares those records only within the same browser/storage origin, with no cross-device synchronization or server persistence. There is no backend Contact service, SMTP service or email reply delivery; replies are locally saved drafts. User-entered enquiries may contain real PII, which remains browser-local. Contact settings remain independent in `gza.settings.draft.v1`.

## Phase 5D acceptance verification record

Prior Codex local verification of production source `2e166ed815010728d25a891939b84db4109ae65e`: 442 tests / 119 suites; 59/59 successful final smoke rerun; 0 lint errors / 56 existing warnings. One navigation timeout occurred on the first full smoke run; the unchanged-source full rerun passed 59/59, and the root cause was not established. These are local verification results, not GitHub CI or independent live browser verification. This documentation-only reconciliation performs no rebuild or deployment.

## Phase 6B1 feature candidate

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Implemented / Awaiting Independent Review** on `phase6b1/flight-ops-schedule-persistence`, based on source `43369c032ae9f7c3b08b5997dae35957050c6bb4`. Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. Products and destination configuration remain session-only; there is no monolithic durable OpsState. See [Schedule model](docs/SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B2 — Network, Fleet & Sellable Product Authority — is Planned / Unstarted. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is not complete. The owner-deployed Phase 6A release/source checkpoint recorded above is unchanged. Local HostPapa commands validate this candidate only; no new release or deployment is performed.

AdminProvider owns staff session / RBAC simulation and the remaining session-only mixed product/destination OpsState. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository is separate planning-only authority.
