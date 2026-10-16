# Booking, guest, search, ticket and travel lane

Baseline: latest fetched main `743741fd93f03bb88b4754f2558cf814e83c5147` (PR #17
merged). Branch: `feature/booking-guest-search-ticket-travel-experience`.
Production remains application `96538d9`; Issue #15 certification and pending
incident permission/verifier tooling changes stay separate. No production build,
ZIP, migration, deployment or Actions is authorized by this implementation lane.
The dirty repository root is preserved; implementation uses isolated worktrees.

## Current source map

| Surface | Actual authority / gap | Planned bounded change |
| --- | --- | --- |
| Booking | `MvpFreeBooking` demands a verified passenger account; `RequirePassengerReservationAuth` and `ReservationCoordinator` enforce it. `mvp_reservations` / submissions require user ownership. | Add genuine guest principal/verified-email access without fake accounts; preserve account checks, idempotency, immutable snapshots and unique physical seats. |
| Manage | MVP `MvpBookingAccess` is a sign-in prompt. Legacy guest challenges target the older bookings tables and are disabled under MVP. | New MVP-scoped email verification and bounded session grants; never enable the legacy protocol against the wrong tables. |
| Search | `MvpFlightSearchConsole` explicitly labels one way and calls the chosen date only. `/flights` switches to `MvpOfferingBoard`; neither recovers sparse dates. | Shared real published availability, useful date alternatives, independent outbound/return selection and chronological validation. |
| Trip model | Canonical reservation/ticket/submission represent one service; account bookings already support 1–9 passengers. | Preserve individual leg references and atomic confirmation of a selected two-leg journey; no partial-success round trip presented as complete. |
| Network | 20 destinations already accepted by schema. `tools/memorial-curation` can add 13 airports but its timetable generates recurring services for seven core routes only. Staff UI publishes through normal audited APIs. | Extend additive curation to 20 destinations, preserve staff edits and existing reservations, generate all directions and varying plausible symbolic patterns. Prepare publication locally; no live data changes. |
| Destination media | Seven city registries use responsive WebP variants, bilingual metadata and CMS IDs. Expanded cities have no supplied photo mapping yet. | Compress the owner's 13 images, extend the same pure metadata/Vite registry and CMS choices; preserve old overrides and record savings/hashes. |
| Travel | Existing tab/skin system consumes published CMS sections. Some inherited copy implies operational check-in. | Structured guide with progressive disclosure, honest commemorative scope, real links and EN/AR parity while preserving CMS/preview compatibility. |
| Tickets/email | `ConfirmedReservationTicket` renders authoritative ticket snapshots. `TicketEmail` builds actual queued confirmations; print uses selectable HTML. | Approved warm-paper/olive art direction as reusable dynamic component plus email-safe template; no fake gate, barcode, boarding authority or static screenshot ticket. |

## Execution slices

1. Guest backend, verified contact challenge and scoped management, additive
   migration with existing account regression tests.
2. Shared availability/search recovery and real two-leg selection; integrate
   guest checkout and round-trip transaction after backend contracts stabilize.
3. Audit/extend canonical curation and local publication fixtures for 20 routes.
4. Ingest 13 city photos and integrate all relevant registry/CMS consumers.
5. Redesign travel guide using established Radix/UI and bilingual CMS content.
6. Implement reusable ticket component, protected ticket flow, print and email
   summary from canonical snapshots and supplied approved assets.
7. Focused cross-flow tests and batched real-browser EN/AR desktop/mobile review.

AGY owns bounded implementation in separate clean worktrees. Codex owns contracts,
review, integration, focused independent checks and handback. Workers do not commit,
push, build or deploy. No production credentials/backups/packages are transferred.
The owner explicitly authorized feature-pack source, task-data and supplied asset
transfers to AGY on 2026-10-16 after automatic approval review requested specificity.

## Working product decisions

- Email code verification uses the owner-approved fallback variant from the brief;
  it avoids requiring a new magic-link route and does not create an account.
- Guest access is session-bound and reservation-scoped, time limited and throttled.
  Reference/email alone never returns a booking or ticket. No query-string PII or
  persistent browser storage of booking/access credentials.
- Two legs retain separate immutable tickets/references, but confirmation must be
  atomic and retry-safe. Cancellation must clearly identify its leg/scope.
- Availability is a bounded read against actual published schedule authority,
  never mock fallback or invented dates. If no schedule exists, state that honestly
  and provide a route/date recovery action without manufacturing options.
- The approved ticket asset handoff is art direction, not operational data. No
  check-in, gate or scannable-code claims are introduced. Existing real assigned
  seats, passenger/flight values and cancellation states remain authoritative.
- New destination content uses owner-supplied editorial photos, with no invented
  historical provenance. Cinematic homepage work stays intact.
- Local population and future deployment planning do not authorize production
  publication. A future release must verify the current installed `96538d9`
  baseline and use reviewed compatible tooling, never an old b3 kit.

## Verification boundaries

Use pure/frontend tests for changed adapters and policies; use owned disposable
MySQL/PHP 8.4+ for real persistence, migration/rollback, access, concurrency and
mail-intent behavior. Keep filters narrow. No DB resets outside explicitly owned
disposable fixtures. Real-browser checks must be labeled local and must not claim
physical-device or live SMTP certification. Final release preparation remains a
separate owner decision after source/UX review.
