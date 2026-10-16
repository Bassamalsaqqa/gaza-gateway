# Gaza Gateway — Big Feature Pack Master Brief
**Date:** 2026-10-16

**Audience:** Codex (lead engineer / coordinator), AGY (bounded implementation worker), product owner review

**Project:** Gaza Gateway / Gaza International Airport memorial website

**Repo:** `Bassamalsaqqa/gaza-gateway`

**Hosting target:** HostPapa shared cPanel only

**Status context:** Mobile cinematic work was the latest accepted source lane. If PR #17 is not yet merged, merge/wrap it first before starting this brief. If it is already merged, start from the latest `main`.

---

## 0) Executive summary
This brief defines the **next major product lane** for Gaza Gateway. The objective is to improve the **booking/searching/ticketing/travel-guidance ecosystem** so the website feels like a polished, modern memorial-airline experience rather than a rigid mock workflow.

This lane includes:

1. **Guest booking without account creation**.
2. **Smarter booking search UX** on homepage and `/flights`, including alternative dates/options instead of dead ends.
3. **Improved trip logic** including proper round-trip support where appropriate.
4. **Destination image ingestion** for newly added cities using local source photos, compressed and integrated consistently with existing assets.
5. **A modern redesigned `/travel` page** with structured, interactive UI/UX.
6. **Manage booking without account**, using booking reference + email verification flow.
7. **Audit and populate schedules** so routes are realistic, bidirectional, and already published/admin-usable.
8. **Ticket design system implementation**, inspired by the approved ticket design assets, but rebuilt as a dynamic, reusable system for on-site ticket rendering and ticket emails.

This is a **big coordinated feature pack**, but implementation should still be broken into clean, reviewable slices.

---

## 1) Ground rules

### 1.1 Product reality
This is a **memorial / commemorative / conceptual airport website**, not a real airline operation.
That means:
- We still want realistic booking/search/ticket behavior.
- We do **not** need the operational/legal complexity of a real airline.
- We should optimize for **clarity, elegance, low friction, emotional/storytelling quality, and believable realism**.

### 1.2 Platform constraints
- HostPapa shared cPanel only.
- Keep deployment friction low.
- No Render / external backend drift.
- No GitHub Actions.
- Focused tests only.
- Preserve existing production data.
- Keep release tooling compatible with the actual installed baseline.
- Remember: **Issue #15 (preservation certification / MySQL 4031 lane) remains separate and unresolved**. Do not pretend this brief closes it.

### 1.3 Git rules
- If PR #17 is still open, **finish that lane first** (merge cleanly if authorized and appropriate).
- Start this work on a **new feature branch from latest `main`**.
- Recommended branch name:
  - `feature/booking-guest-search-ticket-travel-experience`
- Preserve published history.
- Keep PRs reviewable. Do not pile everything into one unreviewable blob.

### 1.4 Review model
- AGY may implement bounded sub-tasks.
- Codex must independently inspect and correct AGY outputs.
- Product owner reviews major UX/product decisions.
- ChatGPT acts as architect/reviewer on handback.

---

## 2) Success definition
This feature pack is successful when:

1. A visitor can book **without signing in**.
2. Search never leaves the user in a useless dead end; the system always tries to offer **other dates, nearby options, or route alternatives**.
3. Round-trip and one-way logic behaves sensibly.
4. Destination pages/cards feel complete, including the newly added cities and their images.
5. `/travel` feels premium, modern, interactive, structured, and mobile-friendly.
6. `/manage` works even for guest bookings through a secure low-friction retrieval flow.
7. Schedules/routes are already populated with believable bidirectional flights and durations.
8. Ticket rendering on the website and in emails uses a **dynamic replica system** based on the provided ticket design language rather than a fixed static image.
9. The owner’s manual work remains minimal.

---

## 3) Recommended implementation structure
Do **not** try to do this as a single giant implementation drop. Use the following sequence.

### Phase A — Booking flow modernization core
1. Guest booking (no account required)
2. Smarter search + no-dead-end alternatives
3. Round-trip support / better date picking
4. Manage booking without account

### Phase B — Data/content enrichment
5. Route/schedule audit and repopulation
6. Destination image ingestion and population

### Phase C — Experience / design improvements
7. `/travel` redesign
8. Ticket design system (website + email)

### Phase D — Final polish
9. Cross-flow QA
10. Final minimal-owner deployment prep

---

## 4) Detailed product requirements

# 4A) Guest booking without account

## Goal
A user should be able to search and book without creating an account or logging in.

## Required behavior
- The booking flow should allow:
  - **Guest booking** as default/simple path.
  - Optional sign-in for returning users/admin/staff if desired.
- Minimum guest identity should likely include:
  - Full name
  - Email address
  - Optional phone number (only if useful)
- We should **not** force account creation.
- The booking confirmation and ticket should be sent by email.
- If email verification is needed, keep it light and practical.

## Recommended design direction
- On homepage booking card and `/flights` booking/search flow:
  - Prioritize **search first**, not account walls.
- At checkout/passenger stage:
  - Offer **Continue as guest** as the primary/default option.
  - Optionally show “Have a booking/account? Sign in” as secondary.

## Data/system guidance
- Support bookings linked to either:
  - a user account, or
  - a guest contact identity.
- If current schema assumes authenticated ownership only, refactor carefully.
- Guest booking must still generate:
  - booking reference
  - passenger/contact record
  - ticket viewable on site
  - manageable booking access path

## Important
- Do not break existing authenticated paths.
- Prefer additive/refactoring changes.

---

# 4B) Smarter booking card, search UX, and alternatives

## Problem
The current booking experience can dead-end the user:
- maybe only one-way is shown,
- date picking may not guide users toward dates with actual flights,
- search may return “no flights” without helpful recovery.

## Required outcomes

### 1. Main booking card
Investigate why it currently appears one-way only.
- Determine if this is a UI limitation, route data limitation, or publication/config limitation.
- The homepage search should support at least:
  - **One-way**
  - **Round-trip**
- If multi-city is out of scope, do not add it now.

### 2. Date picker intelligence
The date picker should help the user choose useful dates.
Recommended behavior:
- Highlight/show dates with actual available departures.
- If flight frequency is weekly/non-daily, expose that reality clearly.
- When a searched date has no flights:
  - offer next available date(s),
  - offer previous available date(s),
  - optionally show a “nearest options” strip/list.

### 3. No dead ends
On homepage and `/flights`, when search finds no exact flights:
- show alternatives instead of a dead end.
- alternatives may include:
  - same route, nearest date(s)
  - reverse date range / nearby dates
  - same destination with adjacent schedule options
- UI copy should helpfully guide the visitor.

### 4. Always present options on `/flights`
For `https://gazaairport.com/flights`:
- search results page should never just stop at “nothing found”.
- always attempt to present:
  - closest dates with flights,
  - alternative departures/returns,
  - possibly related options if route exists but not on that date.

## Suggested UX patterns
- “Next available flights” section
- “Try these dates” chips/buttons
- lightweight date strip / calendar availability dots
- preserve user search context while nudging them to adjacent valid options

---

# 4C) Manage booking without account

## Goal
A guest who booked without account must still be able to access and manage the booking.

## Required behavior
For `/manage`:
- allow access using:
  - booking reference / PNR / booking number
  - email address
- then verify ownership with one of:
  - magic link to email (preferred), and/or
  - email verification code (secondary/fallback)

## Recommended flow
### Option A — preferred
1. User enters booking reference + email.
2. System sends secure one-time management link to email.
3. User clicks link.
4. User can manage booking.

### Option B — fallback
1. Enter booking reference + email.
2. Receive short verification code.
3. Enter code on site.
4. Access booking.

## Manage capabilities
Define and implement only realistic memorial-site actions. Suggested:
- view booking summary
- view/download/share ticket
- cancel booking (if your current app supports it)
- perhaps amend passenger contact info or date/route only if this fits current architecture

## Security constraints
- time-limited tokens
- single-use or bounded-use access links
- no exposure of booking details without verification
- rate limiting
- avoid enumeration leaks

---

# 4D) Route and schedule audit / two-way flight integrity

## Goal
The route system should already feel populated, consistent, and realistic.

## Requirements
1. Audit whether current routes are effectively one-way only or incompletely mirrored.
2. Ensure routes that should be bidirectional are represented coherently.
3. Populate schedules with believable:
   - days of week
   - departure times
   - durations
   - arrival times (if applicable in UI/system)
   - recurring patterns
4. Populate up to about **20 major destinations** as already discussed/approved.

## Owner direction to follow
Use major cities around the world and make them feel realistic. Existing/new additions mentioned include:
- Abu Dhabi
- Athens
- Beirut
- Frankfurt
- Kuala Lumpur
- Kuwait City
- London
- Madrid
- Mumbai
- New York
- Paris
- Rome
- Toronto
- plus prior destinations already in system

## Product interpretation guidance
Because this is commemorative, realism matters more than real-world regulatory correctness.
So:
- schedules should feel plausible,
- frequencies should vary by importance,
- durations should be believable,
- do not overcomplicate with fleet operations.

## Admin/data expectations
- These flights should be **already populated in admin/content systems**, not left as owner manual work.
- Publish or stage them appropriately according to existing system behavior.
- Preserve current published/admin authority model.

---

# 4E) Destination images ingestion and population

## Local source folder
Use the owner-provided local folder:

`C:\Users\bassa\Documents\GazaAirPort\gaza-gateway\new-citires`

### Contents
- Abu-Dhabi.jpg
- Athens.jpg
- Beirut.jpg
- Frankfurt.jpg
- Kuala Lumpur.jpg
- Kuwait City.jpg
- London.jpg
- Madrid.jpg
- Mumbai.jpg
- New York.jpg
- Paris.jpg
- Rome.jpg
- Toronto.jpg

## Requirements
1. Treat these like existing destination/city assets.
2. Move them into proper repo structure.
3. Compress/convert responsibly (likely WebP variants, maybe multiple responsive sizes if current site already uses that pattern).
4. Integrate them into the website so they appear as if they were originally part of the existing content system.
5. Populate all related destination sections/pages/cards where appropriate.

## Important
- Respect existing asset conventions and naming schemes.
- Do not bloat the site.
- Reuse established image pipeline patterns from the project.
- If the current system uses manifests or structured content entries, update those properly.

## Deliverables expected from Codex
- exact asset placement
- compression summary
- before/after byte savings
- where each destination is now referenced in site/admin/content

---

# 4F) `/travel` page full UX redesign

## Problem
Current `/travel` is too text-heavy and static.

## Goal
Turn `/travel` into a modern, structured, interactive travel guide.

## Product direction
Make it feel like a polished guide rather than a wall of text.
Use:
- tabs
- steppers / step-by-step reveal
- accordions
- sticky guide navigation
- cards
- icon-supported sections
- progressive disclosure
- maybe lazy-loaded richer sections if useful

## Suggested information architecture
Possible sections:
1. Before you travel
2. Booking and ticket
3. Check-in and airport arrival
4. Baggage / travel preparation (commemorative interpretation if present)
5. At the airport
6. Boarding
7. After booking / managing booking
8. FAQs / travel tips

## UX goals
- strong on mobile and desktop
- easy scanning
- user engagement
- modern visual hierarchy
- dynamic feel without becoming gimmicky

## Technical goals
- preserve accessibility
- avoid unnecessary JS bloat
- lazy-load heavier sections if helpful
- maintain EN/AR parity

## Important
This should be a real redesign, not just a CSS refresh on existing text.

---

# 4G) Ticket design system (website + email)

## Goal
Use the provided ticket design as **visual reference**, but do **not** simply display the static image as the product.
Instead, build a **dynamic reusable ticket/boarding-pass design system**.

## Local source folder
Use:

`C:\Users\bassa\Documents\GazaAirPort\gaza-gateway\images_assets_to_be_used_in_website_after_proper_placement_and_compression\ticket-design`

### Key files/folders
- `Palestinian Airlines Boarding Pass.png`
- `Gaza_Airport_Ticket_Design_Assets_and_Agent_Handoff.zip`
- extracted handoff folder:
  - `AGENT_IMPLEMENTATION_HANDOFF.md`
  - `README.md`
  - `ticket-demo.html`
  - `design-tokens.css`
  - `design-tokens.json`
  - assets/logo/
  - assets/ornaments/
  - assets/patterns/
  - assets/photos/
  - preview/
  - reference/

## Product requirement
Recreate the same **design language / look / feel / layout spirit**, while ensuring all important values are dynamic:
- passenger name
- booking reference
- flight number
- route
- date
- departure time
- arrival time (if shown)
- gate
- seat
- class
- branding/disclaimer fields
- QR/barcode if system already uses or can sensibly generate it

## Where it should be used
1. On-site ticket view after booking
2. On-site ticket view from manage-booking
3. Email ticket/booking confirmation presentation
4. Potential printable/downloadable ticket page

## Important design guidance
- Treat provided design as **approved art direction**.
- Use repo/local assets properly placed and compressed if needed.
- Build a component/template system, not a one-off image.
- Prefer HTML/CSS-driven rendering for dynamic ticket display.
- If PDF or downloadable image export is already supported or sensible, implement carefully as a follow-up only if low-risk.

## Implementation recommendations
- Create a reusable ticket component or template layer.
- Separate design tokens from booking data.
- Use existing project logo/assets.
- Rebuild ornaments/patterns in a clean reusable way if appropriate.
- Ensure bilingual support where useful.
- Make desktop ticket premium while keeping mobile display readable.

## Email considerations
- Email HTML must be robust.
- If the full rich visual ticket is too complex for email clients, use one of these approaches:
  1. simplified email-safe ticket block + CTA to view full ticket online, or
  2. send a tasteful email summary plus hosted full ticket link.
- Do not create a brittle email template that breaks in common clients.
- If a graphic attachment or server-side generated ticket preview is useful, evaluate carefully but do not overcomplicate if unnecessary.

## Security / identity considerations
- Tickets must reflect real booking data.
- Public ticket access must be tied to secure guest/account flows.
- Do not expose tickets without proper booking ownership verification.

---

## 5) UX/product guidance per page

### Homepage
- booking card should support one-way + round-trip
- date inputs should guide toward valid dates
- search should route into helpful results, not dead ends
- keep mobile cinematic work intact

### `/flights`
- richer search and alternatives
- helpful recovery when exact result is absent
- maybe fare/result cards that can show “closest next departures” or “return options”

### `/manage`
- guest-friendly retrieval flow
- strong clarity and low friction

### `/travel`
- redesigned as interactive guide

### Destination-related pages
- populate new cities and imagery consistently

### Ticket/ticket email
- premium, branded, dynamic, believable

---

## 6) Suggested technical architecture

### Guest booking domain model
You may need a structure such as:
- booking
- passengers
- contact identity (email, maybe phone)
- optional linked user account
- booking access token / management session token

Do not overengineer if current schema can be extended cleanly.

### Search alternatives engine
At minimum, implement a practical algorithm such as:
1. try exact route + exact date
2. if none, search same route on nearest future/past available dates
3. if round-trip, independently recover outbound and return options
4. present a ranked alternatives set

### Availability-aware date picker
Possible approach:
- derive available departure dates for selected route from published schedule/search index
- decorate picker or show helper strip/list

### Ticket rendering system
Possible structure:
- shared design tokens
- ticket data mapper
- web ticket component
- email-safe ticket summary template
- optional print page route/view

### Travel guide redesign
Possible structure:
- content sections schema
- presentational interactive shell
- per-section cards/accordion/tabs/stepper
- keep content maintainable and bilingual

---

## 7) Delivery plan for Codex / AGY

### Step 1 — merge/wrap current lane
- If PR #17 is not fully merged, resolve it first.
- Confirm the new working baseline.

### Step 2 — branch setup
Create a new feature branch from latest `main`:
- `feature/booking-guest-search-ticket-travel-experience`

### Step 3 — discovery/audit
Before coding, audit and document:
1. current booking auth assumptions
2. current route/trip data shape
3. why homepage booking card behaves as one-way (if it does)
4. current `/flights` dead-end logic
5. existing destination asset/content patterns
6. current `/travel` structure
7. current ticket/ticket-email capabilities
8. current manage-booking capabilities

Return a short internal engineering map before large implementation.

### Step 4 — implement in bounded slices
Recommended slices:

#### Slice 1
Guest booking foundation + manage-booking guest access model

#### Slice 2
Search/date intelligence on homepage and `/flights`

#### Slice 3
Schedule/route audit + populate realistic bidirectional flights

#### Slice 4
Destination image ingestion and integration

#### Slice 5
`/travel` redesign

#### Slice 6
Ticket design system + website ticket + email summary/full flow

### Step 5 — verification
Use focused tests only. Include:
- guest booking happy path
- booking with/without account
- manage booking via email link/code
- search alternatives when exact date unavailable
- round-trip search behavior
- destination content/image integrity
- travel page rendering EN/AR and mobile/desktop
- ticket rendering with dynamic data
- email output sanity

### Step 6 — release planning
Do **not** deploy automatically.
Prepare a minimal-friction HostPapa update path after owner approval.
Remember:
- do not reuse obsolete installer assumptions
- account for public asset permissions for any new media directories/files
- production issue #15 remains separate

---

## 8) Explicit AGY delegation suggestions
Codex may delegate bounded work to AGY such as:
- destination asset compression/migration
- travel page component scaffolding
- ticket component HTML/CSS scaffolding
- schedule seed/content generation
- guest booking UI wiring pass

But Codex must independently verify and correct.

---

## 9) Acceptance checklist

### Booking / manage
- [ ] Guest can search and book without account
- [ ] Ticket/confirmation sent to email
- [ ] Existing signed-in path still works
- [ ] `/manage` works for guest booking via booking ref + email flow

### Search UX
- [ ] Homepage booking card supports intended trip types
- [ ] Date UI helps surface valid flight dates
- [ ] No dead-end search on homepage or `/flights`
- [ ] Alternative dates/options shown clearly

### Route/content data
- [ ] Routes are realistically populated and bidirectional where intended
- [ ] Flight durations/timings/frequency believable
- [ ] Admin/published data reflects this consistently

### Destination media
- [ ] All new city photos properly compressed and integrated
- [ ] Proper placement/naming consistent with repo conventions
- [ ] Relevant destination sections/pages populated

### Travel page
- [ ] `/travel` redesigned into structured, interactive UI
- [ ] EN/AR and mobile/desktop quality acceptable

### Ticket design
- [ ] Dynamic ticket replicates approved visual language
- [ ] Website ticket works after booking and in manage-booking
- [ ] Email experience is robust and tasteful
- [ ] No static one-off fake image solution

### Release safety
- [ ] Production issue #15 explicitly kept separate
- [ ] Public asset permission needs remembered
- [ ] Minimal-friction HostPapa deployment path prepared

---

## 10) What not to do
- Do not force account creation for ordinary booking.
- Do not leave user at dead-end “no flights found” pages.
- Do not dump the new city images into the repo without proper optimization/integration.
- Do not use the provided ticket PNG as the final product.
- Do not make `/travel` just a prettier text page; redesign the experience.
- Do not break the cinematic homepage work.
- Do not quietly ignore production issue #15.
- Do not deploy or merge large unreviewed work blindly.
- Do not create unnecessary infrastructure complexity.

---

## 11) Final instruction to Codex
Act as lead engineer and coordinator. Use this document as your operating brief.
If the current cinematic PR is not fully integrated, wrap that lane first. Then create the new feature branch and execute this work in bounded, reviewable slices.

Your first response/work product should be:
1. confirmation of baseline/branch status,
2. a short engineering map of the current system relative to this brief,
3. your proposed slice plan,
4. then implementation begins.

Do not wait for another prompt from the owner unless a genuine product ambiguity blocks you.
