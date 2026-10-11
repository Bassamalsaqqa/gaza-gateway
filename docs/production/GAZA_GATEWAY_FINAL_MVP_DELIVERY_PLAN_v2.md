# Gaza Gateway — Final MVP Delivery Plan
## One Release · Real Admin Controls · Free Booking · Email Tickets

**Version:** 2.0 — 11 October 2026  
**Status:** Product-owner direction accepted for implementation; production acceptance still requires evidence.  
**Repository:** https://github.com/Bassamalsaqqa/gaza-gateway  
**Owner:** Product owner controls release, credentials, paid services and deployment.  
**Delivery objective:** Finish the smallest polished, fully connected Gaza Airport website with working accounts, admin-controlled content and symbolic flights, free reservations, assigned seats, meal choices, tickets and emails. **One production launch.**

> **Scope precedence.** This document **supersedes** `GAZA_GATEWAY_COMMEMORATIVE_MVP_SCOPE_FREEZE_v1.md` and the payment/commercial-airline scope of older completion plans **for launch prioritization**. Older files remain historical evidence and technical references; preserve their accepted invariants where applicable. Specifically: **no payments or payment gateway**; **no mandatory “not valid for travel” banner/text on every ticket**; **admin-published edits must actually appear on the public website from another browser/device**. Do not copy the superseded document's conflicting disclaimers, CMS deferrals, or payment milestones into the active checklist.

---

## 1. Exact launch product

A visitor can browse historical/editorial pages and curated Gaza Airport flights, create an account, log in, select a flight/date, enter passenger details, pick **unoccupied** seats and optional meals, press **Confirm Booking** (no charge), get a durable reference and a polished ticket, receive the ticket by email, and later view/manage/cancel it in My Bookings. The existing admin panel—**not a separate replacement UI**—controls destinations, flights, dates, aircraft/layouts, meals, bookings, accounts/staff, editorial pages, gallery/media assignments, and essential settings. Changes appear to ordinary visitors and other admins through shared server state, not browser-local storage.

- **No payments at all:** no gateway, cards, payment status, merchant, refund, settlement, paid quote, fake payment success, invoice, or financial reconciliation. Replace/remove monetary totals and payment logic exposed in the booking flow. If preserving an existing payment-styled button, it is simply the free **Confirm Booking** action.
- This is a commemorative website, not an operational airline system. Use deliberate owner-authored flight and destination offerings; **do not silently promote demo flight/status/price fixtures to public authority**. No compulsory disclaimer sentence or repetitive warning badges on tickets. Maintain truthful product context without disrupting the design.
- **No check-in prerequisite to get a ticket.** Reuse existing ticket/boarding-pass visual components, but issue the booking ticket at confirmation. Actual airline check-in, boarding gates and operational status control can remain disabled or absent for MVP.
- Retain approved visual assets, airport history, archival sources, articles/videos and EN/AR/RTL design; avoid new UI systems or large redesigns.

### Visible-feature rule

For **every visible enabled control** on the public site or Admin: it must perform its claimed operation against the production authority, show meaningful success/failure, and survive a refresh/new device. If not part of P0, **hide it or explicitly mark it unavailable**, rather than leaving fake editors, local-only saves or demo counters. Do not call a mock display “live.”

---

## 2. Verified codebase baseline (not a production-browser certification)

**Verified via GitHub on 11 Oct 2026**. The public-site behavior has **not** been independently validated through a live browser in this review.

| Component | Current reality | MVP disposition |
|---|---|---|
| `main` | `c7be134bfa87ef58dcfae142b770da639863e4b3`; Phase 13B merged under owner-authorized local integration | Preserve accepted identity foundation |
| Draft PR #3 | `5c0696aab0cee19a4175cd2b008b27ed14593b9b`; C01 fleet correction verified; draft/unmerged; two reviewed threads remain open | C01 accepted **for next-package progression**; continue same feature branch; no premature merge |
| HostPapa release | `hostpapa-deploy` `a47afded49e900b75c907e7230ca4dfef5b3f91e`; actual live state not certified in this review | No release changes until launch authorization |
| Identity backend | Laravel/PG passenger + staff identity, verification/recovery, sessions, MFA, RBAC, profile/travelers, 46 identity HTTP operations implemented locally | Connect to **existing** account + admin shell; remote mail/provider/security gate later |
| Real admin authentication in frontend | `src/routes/{-$locale}.admin.tsx` currently switches to `StaffIdentityWorkspace` when identity preview enabled; otherwise `MockAdminLayout` | **P0 blocker:** authenticated staff must reach the **full existing admin dashboard** with real RBAC, not be confined to preview |
| Fleet | C01 real Laravel/PG API for aircraft/layouts; current default frontend `createRepositories()` still creates `LocalFleetRepository` | Use C01 backend in live admin/public adapters; retain fake fixtures only in test/mock mode |
| Network, schedules, meals | Real browser-local repositories/editors; C02–C04 server authority not yet built | Build only essential server reference operations and adapters |
| Bookings/seats | Mature React booking, seat/map, confirmation and admin UX; `LocalBookingRepository` uses `gza.repo.v1` browser localStorage | **P0 blocker:** transactional PG booking and seat uniqueness; shared customer/admin view |
| Editorial CMS | `src/content/repository.ts`: `LocalContentRepository` saves browser-local drafts; public pages import `src/content/published/*` and previews use `contentPreview=1` | **P0 blocker:** server draft/publish + public published reads for key pages |
| Media/archive | Existing compiled archive/catalog and local draft editor (`LocalArchiveDraftRepository`), extensive curated visuals | Keep assets; wire published metadata/assignments to public; new uploads only if P0 requires |
| Settings | Local contact and appearance drafts, not production publication; no complete SMTP admin screen | Implement essential shared settings + email configuration |
| Staff/customer/booking admin | Designed pages and commands largely route through local repositories; analytics currently mock | Reuse pages, connect real APIs; hide misleading mock-only panels |
| Backend exposure | `backend/routes/api.php` has foundation + identity; new fleet in PR #3 behind nonproduction gate | Explicit secure deployment/cutover needed; cannot claim operational production now |

**Source anchors:** `src/lib/repositories/registry.ts`; `src/lib/repositories/storage.ts`; `src/content/repository.ts`; `src/content/preview.tsx`; `src/lib/settings/repository.ts`; `src/routes/{-$locale}.admin.tsx`; `src/routes/{-$locale}.admin.bookings.*`; `src/routes/{-$locale}.admin.website.tsx`; `backend/routes/api.php`; `docs/backend/phase13c-reference-plan.md` and PR #3.

---

## 3. P0 launch matrix — what must be truly connected

| Feature / Admin control | P0 working behavior | Existing asset to reuse | Implementation gap |
|---|---|---|---|
| Account, login and security | Real signup, verification, login/logout, reset, profile/saved travelers; owner-only My Bookings | Phase 13B endpoints and frontend identity forms | Real frontend auth integration (not preview workspace only), provider later |
| Staff login and permissions | Staff signs in and uses **the normal Admin dashboard**; permission-sensitive commands enforced on server | Staff identity/MFA/RBAC and Admin UI | Replace mock admin gate/context, bind to current staff session |
| Dashboard | Real booking counts, published content state and actionable totals | Admin dashboard cards/tables | Query real endpoints; remove demo analytics/counters |
| Fleet/layout | Admin create/edit, seat geometry, inactive state; public uses same reference | C01 APIs and seat-map editor | Production adapter + coherent reference read |
| Destinations/network | Admin add/edit/retire curated destinations; bilingual labels/public cards update | Existing network and destination UI | PG/API C02; shared reads; no silent hardcoded list overriding edits |
| Flight offerings/schedules | Admin create/edit/publish/disable symbolic flights and dates; customer search sees them | Existing schedules, dated-service resolver, flight UI | Simplified C03 server authority; remove simulated gates/status/seats-left from live truth |
| Meals/options | Admin manage active meals/order/default; booking gets same live options | Local commercial catalog & extras UI | Narrow C04: **meals and necessary options only**, no prices/fares/payment infrastructure |
| Booking/seats | Authenticated user can book once, one seat per passenger, no double allocation across devices, durable refs/snapshots | Existing booking wizard, seat UI and PG foundation | New server booking aggregate; database constraints, transactions/idempotency |
| Booking management | Customer view/print/download/cancel; permitted changes only if transactional; admin search/detail/cancel/modify according to roles | Existing account trips/Admin bookings UI | Replace `LocalBookingRepository`, shared access/authorization and audit |
| Email/tickets | Booking confirmation automatically queued; branded bilingual HTML + plain-text; printable ticket; resend/error state | Visual ticket components + identity outbox primitives | Template rendering, safe queue, SMTP adapter/settings and frontend connection |
| Website CMS | Admin edit/preview/publish Home, Airport Past/Present/Future, Travel, information pages, destination editorial; visitors see published changes | Existing CMS editor and compiled baseline | Database document/revision/publish API, runtime public reads; don't require cPanel rebuild per edit |
| Gallery/archive | Admin published media metadata, captions/source links and assignments appear publicly; approved assets remain available | Existing gallery, archive and media catalog | Server-managed published catalog/assignments; upload processing can be later if hidden |
| Essential settings | Admin updates public contact details, key branding/visible site fields and sender details; visitors see updates | Existing settings/admin UI | Server-backed settings and public consumption |
| Contact/inbox, if exposed | Actual public submission appears in shared Admin inbox; staff reply drafts remain drafts unless send capability genuinely exists | Existing contact/inbox UI | Minimal persisted contact/inbox API or disable route clearly |
| EN/AR and mobile | All P0 journeys render correctly in both languages, responsive and keyboard navigable | Current frontend/design system | Focused integration QA; fix changed areas only |

**Not required for launch:** advanced fare classes/pricing, baggage extras unless essentially free to wire, guest bookings and guest claiming, infant bookings unless adult linkage invariant is implemented (otherwise reject/hide), actual check-in/boarding, airline operational feeds, advanced flight status/gates, dynamic marketing analytics, bulk campaigns, full media-upload pipeline, appearance studio deployment controls, complex CMS immutable-build publishing, and **everything payment-related**. Existing code may remain gated or dormant; public UI must not suggest it works when it doesn't.

### CMS publishing model for speed

Choose the simplest consistent implementation: **server-stored drafts, admin-authorized Publish/Unpublish/Restore (at least prior revision), and public API reads of the active published revision**. Keep existing compiled content as an initial/fallback source, but never override a successful server publication with browser-local or hardcoded content. Public pages must update after refresh on another device **without source rebuild or redeploy**. Preserve media ownership/provenance/rights metadata and avoid introducing arbitrary unreviewed file uploads. Keep the static HostPapa frontend; fetch published content at runtime, with appropriate caching and a bounded SEO consideration for important pages. If the existing static SEO path becomes materially inconsistent, propose the narrowest correction, not a new rendering framework.

### Production data rule

Do not auto-import existing prototype bookings, mock admin users, fake airline schedules, fares or sample flight/status figures into production. Curated commemorative offerings and gallery material are owner-admin published. Production can begin with intentional blank operational records until staff configures and publishes them. Preserve authentic archival content and owner-directed media assignments.

---

## 4. Fastest implementation order: six bounded work packages

**Do one integrated production MVP, not a full commercial-airline platform.** Codex should implement complete vertical slices and review them at meaningful gates. Packages can overlap once APIs are agreed; do not require a ChatGPT conversation after each small commit.

### W0 — Scope/contract cut (small, immediate)

- Commit this plan under `docs/production/` as canonical launch scope; link from roadmap and supersede old plan without destroying history.
- Produce a file-by-file P0 endpoint/UI gap list and a minimal API map: existing 13B, C01, required C02/C03/meals, booking, CMS, email/settings.
- Amend normative contracts **narrowly** to remove public payment assumptions and make free booking without settlement; keep historical payment contracts for traceability, explicitly out of MVP and disabled. Preserve important auth and concurrency constraints.
- Decide now at the implementation level (no owner meeting): logged-in booking only; one-way booking first if genuinely faster, add round-trip only when existing UI can work correctly; no infant P0 unless complete invariant; simplest predictable confirm/cancel rules.
- Gate: no ambiguous paid/actual-operational flows; no scope creep.

### W1 — Shared reference + existing Admin wiring

- Continue PR #3 after locally accepted C01; complete network, **curated flight-offering schedules**, and meal definitions only.
- Use existing Laravel/PG foundation and C01 revision/audit patterns, but avoid unneeded enterprise-style catalog machinery. Keep original stable IDs, bilingual labels, source-compatible date/time rules; do not invent date/status/availability data.
- Introduce HTTP repositories into the **existing** React Query registry. In production, no fallback to local mock authority if API fails; show actionable error. Mock/studio modes remain explicitly isolated.
- Integrate real staff identity with `AdminShell`/`Outlet`, keeping original admin layouts and server RBAC.
- Prove: staff adds/changes/retire an offering and a meal; a fresh unauthenticated browser sees the new public offering; two staff browsers see identical state.
- Gate: C01–C04 core reference source accepted for P0; source-safe private tests and actual HTTP contracts. **PR #3 remains draft until suitable consolidated acceptance**; don't conflate C01 review with full 13C acceptance.

### W2 — Server booking, seat allocation and passenger integration

- Build a minimal free reservation API: list/search available offerings, occupancy; create reservation with authenticated owner/passenger/traveler/seat/meal snapshots; view list/detail; customer cancel; admin list/detail/cancel and carefully bounded changes.
- Seat claims must be unique per offering/date/seat using real DB constraints/locking; revalidate available seats at confirm; preserve cancellation and idempotent retries, avoid partial booking after error. A simple atomic confirmation without a long hold is preferable **if** it fits UX and properly handles seat-taken retry. Expiring holds only if required by the existing interaction.
- Bookings persist under user ownership and are visible to Admin from another device. Never trust client price, capacity, booking ownership or seat status. No payment rows, paid states or payment callbacks.
- Wire existing booking wizard, confirmation, My Bookings, admin bookings, customer screens to the API; cut over the final UI once correctly integrated.
- Gate: two independent users race for the same seat → one confirmed, other gets a clean retry; refresh/restart retains confirmed booking; cancellation and authorization work. Test admin edits against held/confirmed seats to avoid invalidating existing allocations.

### W3 — Site CMS and Admin settings publication

- Reuse existing Website/Airport/Destination/Archive editors. Add server draft/save/preview/publish/revision actions, simple staff permission checks, safe public reads and usable conflict handling for concurrent editors.
- Make published content, media selection, contact settings and visible labels actually update public pages across browsers. Audit the page route mapping to ensure no hardcoded import silently wins over the published API data.
- Allow existing archive/media assets to be selected and published, preserve source and rights metadata. Defer arbitrary new media uploads if they would require another major pipeline; hide upload action until real.
- Hide or properly relabel irrelevant Analytics/Check-in/Appearance tools that do not function globally. Existing active P0 Admin buttons must be real.
- Gate: staff edits a Home section, destination narrative and gallery assignment; publishes; a different browser sees all three; unauthorized staff cannot publish; rollback/revision works.

### W4 — Ticket + SMTP settings/email outbox

- Convert current ticket/boarding pass visual into a **confirmed-booking ticket**; no check-in gating. Accessible responsive EN/AR email HTML, text alternative, printable/downloadable view. Preserve visual identity and source-aligned fields.
- Add **Admin → Settings → Email** with SMTP host, port, TLS mode, username, write-only password, sender name/address, reply-to, configured/unconfigured state, send-test action, message log, safe resend, and basic branded template preview. Secrets encrypted at rest and never returned/logged. Restricted to privileged staff.
- Reuse 13B queue/outbox facilities where suitable. Queue delivery after durable reservation commit; sending failure never rolls back booking. Idempotent dispatch, bounded retries and admin-delivery status. Separate booking confirmed from email sent.
- Local sink works with no real credentials; owner supplies SMTP settings in later staging. **Production launch with promised emailed tickets requires one real end-to-end email delivery test** (plus essential account verification/recovery). No provider choice or paid connection now.
- Gate: actual saved booking emits exactly one logical confirmation mail; preview/print matches data; transient mail failure leaves correct booking and retriable outbox; test admin credentials never leak.

### W5 — Consolidated integrated launch/cutover

- One reproducible local **MVP-only** integration gate at exact tested source SHA: core identity, reference, booking, CMS, admin, emails, negative routes and seed/fixture isolation. Reuse successful prior tests; no full legacy-suite repetition every commit.
- Cross-browser/admin-to-customer end-to-end tests and critical mobile EN/AR/RTL visual/keyboard checks. Verify production mock is off and no payment handler/route is enabled.
- Prepare actual server deploy, PostgreSQL backup/restore test, HTTPS/CORS/cookie/proxy checks, staff/bootstrap secret custody, queue scheduler, mail sender/config, error logging, health checks and rollback. Frontend remains on HostPapa if feasible; backend deploy target decided with owner at the provisioning gate.
- Verify actual live domain and **real email** once configured; owner reviews visible content and authorizes final activation.
- Gate: documented owner GO/NO-GO with P0 checklist; no unverified claim that local-gate passing means production is live.

**Release-critical path:** W0 → W1 stable APIs + staff shell → W2 reservation authority → W4 delivery → W5. **W3 must also finish before launch**, and can run alongside W2 after W1 API contracts stabilize. No Phase 13F payments package at any point.

---

## 5. Original roadmap → final launch crosswalk

| Old roadmap | Final treatment |
|---|---|
| Phases 0–11: visuals, booking UI, CMS, archive, SEO | Keep assets/UI and accepted work; targeted integration fixes only |
| Phase 12: airline API contracts | Historical source baseline; narrow free-booking scope amendment, no sweeping reimplementation |
| 13A foundation / 13B identity | Reuse; real production wiring and deferred remote gates remain |
| 13C C01 Fleet | Keep PR #3 C01; accepted for continued local development, not final phase merge |
| 13C C02 Network / C03 Schedules | Implement essential persisted destinations and curated commemorative offerings |
| 13C C04 Commercial | Reduce to **meal/necessary option catalog**; no fares/prices/currency required |
| 13C C05/C06 | Fold into connected adapters and consolidated reference evidence, then MVP end-to-end gate |
| 13D Booking & inventory | Implement **free** authoritative reservations, real seats, ownership and management |
| 13E Editorial/publication | Implement practical **admin draft → publish → public reads** and necessary site settings; defer elaborate deployment sealing and speculative CMS features |
| 13F Payments | **CANCEL for this product**; don't build, configure or activate |
| 13G Migration/cutover | Narrow to actual live migration, bootstrap, backups, monitoring, testing and owner activation |

**Phase 12 Issue #1:** keep traceability. Infant/adult invariant must be enforced **if** infants are enabled, otherwise disable P0. Publication visibility and owner authorization remain relevant for CMS publication: no caller-controlled `ownerApproved` boolean. Refund/capture findings are not launch blockers because payment code/endpoints are excluded/disabled, not because the original findings have magically been fixed. Do not rewrite GitHub review history.

---

## 6. Quality and security: simple but real

This site has user accounts and passenger names. It does **not** need bank-grade payment systems, but it **does** need:

- HTTPS; existing secure cookies, sessions, password hashing, Origin/CSRF; staff MFA/RBAC; account and booking ownership checks.
- Server-side input validation, bounded login/booking/email resend rates; no plaintext SMTP credentials; no open relay; no prototype staff access in production.
- Database uniqueness for seat claims; transactional writes, repeat-request safety and stable booking snapshots; correct handling of cancellations/edits.
- Safe errors without personal-data leaks; basic audit records for important admin changes; database backup with one real restore test, service health and rollback.
- Prevent public users from reading unapproved CMS drafts or another user's tickets; no unverified fixture content promoted as real.
- A few **high-value adversarial scenarios** and one final release gate, **not** exhaustive theoretical/security stress programs.

**Test budget:** targeted tests during implementation, focused source review after major integrated slices, **one complete P0 integrated gate** at final SHA, then limited staging/live smoke. GitHub Actions remain off. Do not rerun the 766-case identity suite by default after every feature.

---

## 7. End-to-end definition of done: the actual finish line

From two clean browsers (different sessions/devices) using the same deployed API:

1. Authorized staff logs in to the **original Admin panel** and creates/publishes a destination, commemorative flight/date, aircraft/layout, and meal options.
2. Customer A signs up/verifies/logs in, sees exactly those offerings, selects passenger + seat + meal and confirms a free booking. No monetary charge, no payment state.
3. Customer B attempts the same seat and is correctly prevented. Customer B can choose an available seat and confirm independently.
4. Customer A sees the same booking under My Bookings after new browser/restart; can view/download the branded ticket and cancel or perform supported edits. Staff sees both bookings with correct seat/meal data.
5. A queued booking email is sent exactly once in the logical outbox; with actual SMTP configuration a real message is delivered, opens, and matches the stored ticket. Reset/verification emails also work.
6. Staff edits/publishes Home text, destination editorial material and a gallery/media assignment. A separate non-admin browser loads the updated published content, not a local preview; unauthorized users cannot publish.
7. Restart backend/frontend: published content, admin settings, accounts, bookings, seats and audit records remain correct. No local/mock-only production write, disabled payment logic or mock analytics masquerading as real.
8. English/Arabic, phone/desktop, simple accessibility, live HTTPS, mail sender, service monitoring, backup/restore and rollback are checked; owner approves the site before launch.

If any enabled P0 admin control fails the two-browser test, **the product is not done**. If an out-of-scope control cannot be made real, hide it rather than rebuild it.

---

## 8. Working agreement and owner decisions

- **Owner:** scope, visuals, content truth, credentials and paid deployment choices; launch GO/NO-GO. This plan constitutes approval to **build locally**, **not** approval to deploy/provision/buy/activate production.
- **Codex:** primary implementation lead, source auditor, API/frontend integrator, PR maintainer; may implement directly for speed, and may prepare bounded AGY assignments. **AGY is manually started by owner**, never assumed running. Independent ChatGPT reviews **meaningful cross-cutting milestones** and the final readiness gate, not every trivial commit.
- **Repository:** keep PR #3 draft during incomplete reference work, ordinary linear history, no force-push or surprise merge. Reconcile its two corrected review threads without fake approval. Keep `main` and HostPapa isolated until authorized merge/release.
- **No GitHub Actions**, unnecessary broad reruns, new paid vendors or unrelated feature expansion.
- **Cadence:** Codex should work continuously through unblocked local milestones; provide a short checkpoint after each meaningful vertical slice: final SHA, user-visible behavior proven, focused test results, unresolved P0 blockers, next slice. **Do not stop for permission after every subtask.** Stop for actual architectural tradeoff, required AGY manual start, credentials/cost, merge conflict, external provisioning or production activation.
- **Decisions deferred to owner:** SMTP real credentials/sender domain; server hosting/location and budget; intended curated commemorative flight schedule/content; public DNS/live deployment. Real mail delivery and live deployment certification cannot be skipped at launch.

### Explicit stop rules

Do not call the MVP complete because all local React screens exist, because 138 contracts validate, because PR #3 is mergeable, or because local SMTP captures a message. Only the joined end-to-end acceptance above and owner release GO satisfy completion.

**No further feature brainstorms or broad roadmap rewrites unless a concrete P0 blocker requires one. This is the build-to-launch plan.**
