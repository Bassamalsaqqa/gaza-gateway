# Active MVP implementation record

Canonical scope: [Final delivery plan v2](GAZA_GATEWAY_FINAL_MVP_DELIVERY_PLAN_v2.md).

## Decisions

- Existing Laravel 13 / PHP 8.4 / PostgreSQL 17, React Query repositories and EN/AR Admin UI remain.
- Reservations require an authenticated verified passenger account; one-way first; adult/child passengers only. Infant selection is unavailable until its linkage rules are implemented.
- Confirmation is free and atomic. No paid quote, payment state, callback, payment row, refund or check-in prerequisite. Seat uniqueness is per dated offering and physical seat. A taken seat returns a retryable 409; confirmation retries use an owner-bound idempotency key.
- Cancellation releases claims transactionally. Identity and immutable ticket snapshots survive. Unsupported changes stay unavailable.
- CMS uses server drafts, optimistic revisions, authorized publish/unpublish/restore and active published public reads. Compiled assets retain provenance; no arbitrary uploads.
- Backend opt-in remains nonproduction until the owner authorizes deployment and reviewed cutover. Explicit backend failures never fall back to local authority.

## Verified P0 source map

| Slice | Existing source | Required connection |
| --- | --- | --- |
| Staff/Admin | src/lib/admin-store.tsx; src/routes/{-$locale}.admin.tsx; src/routes/{-$locale}.admin_.signin.tsx; src/components/admin/admin-shell.tsx | Full persisted MFA staff session drives original shell and permissions; no local identity |
| Fleet | backend/routes/reference.php; src/lib/fleet/repository.ts; src/lib/repositories/registry.ts | C01 HTTP adapter and registry binding |
| Network | src/lib/network/types.ts; src/lib/network/repository.ts; src/lib/destination-reference.ts | PG network revisions and exact bilingual API; no automatic demo seed |
| Offerings | src/lib/schedules/repository.ts; src/lib/dated-services/resolver.ts; src/lib/repositories/flight-repository.ts | Staff-curated dates/schedules, public active read, no mock status/counters |
| Meals | src/lib/commercial/repository.ts; src/lib/commercial/types.ts | Shared active ordered options/default, no prices |
| Reservation | src/lib/repositories/booking-repository.ts; src/lib/booking-draft; src/routes/{-$locale}.book* | Owner-bound PG aggregate, actual occupancy, confirm/cancel, shared staff read |
| Account | src/lib/passenger/http-repository.ts; src/lib/api/identity-client.ts | Existing account/traveler UI and owner My Bookings |
| Editorial | src/content/repository.ts; src/content/published; src/content/preview.tsx; src/lib/archive/drafts | Runtime published read beats compiled baseline, server editor/revisions |
| Settings/contact | src/lib/settings/repository.ts; src/lib/contact/repository.ts | Shared published settings/inbox or unavailable controls |
| Ticket/mail | src/components/boarding-pass.tsx; backend/app/Identity/Outbox | Confirmation ticket, encrypted SMTP settings, retryable logical outbox |

## Minimal API allocation

Reuse all accepted identity endpoints and C01 fleet endpoints. W1 implements /network/airports, /admin/network/airports, /schedules, /admin/schedules and a meals-only catalog. W2 adds free /reservations collection/detail/cancel and dated-offering occupancy with staff equivalents; these explicit names prevent accidentally invoking historical paid booking commands. W3 supplies CMS public published reads and staff draft/publish/revision actions plus essential settings. W4 adds privileged email settings/test/status and owner-scoped ticket/resend. Exact request/response contracts accompany implementation and actual HTTP evidence.

## Current status

W0 scope adopted. C01 corrections independently confirmed for progression at 5c0696aab0cee19a4175cd2b008b27ed14593b9b. W1–W5 are unfinished. No working production booking, SMTP delivery or CMS publication is claimed. Main and HostPapa are unchanged; PR #3 remains draft and prior review threads preserved.

Launch still requires owner-authored offerings, actual mail delivery, reviewed production configuration, backup/restore, HTTPS and explicit owner GO. Local captures do not establish external delivery.

## Free-reservation command foundation

`backend/app/Mvp/Reservations/ReservationCommand.php` and `free-reservation-command.schema.json` define the dormant free one-way command. Focused PHP 8.4.26 evidence: 26 tests / 56 assertions pass; runner reported one PHPUnit deprecation. This does not enable booking routes, allocate seats, verify session ownership or certify PostgreSQL reservations. Those obligations remain W2. The first attempted disposable container mount failed before tests; the mountpoint was corrected, with no retained container/data mutation.

The PHPUnit deprecation was isolated to the CLI option `--do-not-cache-result`; use `--do-not-record-test-run-history` for future read-only runner invocations. A one-test diagnostic confirmed the cause. Machine command schema passes its source-shaped specimen and four authority-injection controls; UUID constraints match the PHP parser.
