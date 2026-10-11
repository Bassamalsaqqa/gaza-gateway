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
| Ticket/mail | src/components/booking/boarding-pass.tsx; backend/app/Identity/Outbox | Confirmation ticket, encrypted SMTP settings, retryable logical outbox |

## Minimal API allocation

Reuse all accepted identity endpoints and C01 fleet endpoints. W1 implements /network/airports, /admin/network/airports, /schedules, /admin/schedules and a meals-only catalog. W2 adds free /reservations collection/detail/cancel and dated-offering occupancy with staff equivalents; these explicit names prevent accidentally invoking historical paid booking commands. W3 supplies CMS public published reads and staff draft/publish/revision actions plus essential settings. W4 adds privileged email settings/test/status and owner-scoped ticket/resend. Exact request/response contracts accompany implementation and actual HTTP evidence.

## Current status

W0 scope adopted. C01 corrections independently confirmed for progression at 5c0696aab0cee19a4175cd2b008b27ed14593b9b. W1–W5 are unfinished. No working production booking, SMTP delivery or CMS publication is claimed. Main and HostPapa are unchanged; PR #3 remains draft and prior review threads preserved.

Launch still requires owner-authored offerings, actual mail delivery, reviewed production configuration, backup/restore, HTTPS and explicit owner GO. Local captures do not establish external delivery.

## Free-reservation command foundation

`backend/app/Mvp/Reservations/ReservationCommand.php` and `free-reservation-command.schema.json` define the dormant free one-way command. Focused PHP 8.4.26 evidence: 26 tests / 56 assertions pass; runner reported one PHPUnit deprecation. This does not enable booking routes, allocate seats, verify session ownership or certify PostgreSQL reservations. Those obligations remain W2. The first attempted disposable container mount failed before tests; the mountpoint was corrected, with no retained container/data mutation.

The PHPUnit deprecation was isolated to the CLI option `--do-not-cache-result`; use `--do-not-record-test-run-history` for future read-only runner invocations. A one-test diagnostic confirmed the cause. Machine command schema passes its source-shaped specimen and four authority-injection controls; UUID constraints match the PHP parser.

## Shared reference integration checkpoint

- Fleet adds an atomic immutable snapshot and transactional mutation receipts under mvp-fleet.openapi.json. Original C01 endpoints remain compatible. Independent fleet-only PHP/PostgreSQL evidence: 16 tests / 303 assertions, 30 actual original error contracts and 11 additive snapshot/receipt captures.
- Network and meals AGY product changes are integrated for independent verification. No fixture auto-import command, browser authority fallback or deployment is enabled. Staff writes use persisted MFA sessions, canonical permissions, Origin/CSRF and fresh authorization after domain locks.
- Joined testing exposed and corrected a meals API-prefix integration error and migration-order assumptions in the test fixtures. Original failed receipts are preserved. Meals public/admin reads use one immutable MVCC snapshot, including revision zero.
- This is backend reference progress, not complete W1 acceptance: original Admin transport, curated schedules and public UI adapters still need joining. Free booking persistence, ticket/mail delivery, runtime CMS UI and final acceptance remain unfinished.

Joined reference gates now pass independently: fleet 16 tests / 303 assertions; network 16 tests / 256 assertions; meals 17 tests / 234 assertions. The gates ran working-tree snapshots at f695ed25e41da24f48007ada789835bef42ce8be, with proposed source hashes and cleaned disposable resources; they do not certify a clean final candidate or remote deployment. Additional fixture timing correction uses a one-second-old synthetic MFA proof, preserving the real future-proof denial. Network captures cover 25 actual errors; meals cover 35. All 140 historical/added network contracts validate. No broad identity/frontend tests repeated.

### Network receipt adapter seam

Additive POST /admin/network/airports/receipt and PATCH /admin/network/airports/{code}/receipt return airport, changed and locked revision; original DTO routes stay compatible. One focused PHP/PostgreSQL test passes (1 test / 25 assertions), covering change/no-op, authority and conflict paths. Ten actual HTTP status/schema captures validate against mvp-network.openapi.json. The initial test used a JSON list in an empty-object fixture and failed; corrected fixture passed. The subsequent capture harness failed on omitted reusable response containers; references/pinned schemes were corrected and the same captures revalidated without repeating PHP. Failed receipts remain preserved. The corrected full runner awaits the consolidated gate; no final-source or remote acceptance is claimed.

### Independent meal command review corrections

The new PR #3 findings identified wrapper unwrapping and default/reorder aliases that bypassed closed request schemas. Meal commands now require the original flat JSON object; nested wrappers, extra root keys, defaultMealId aliases and object-shaped/reorder-list substitutes are rejected before mutation. Legitimate flat commands and no-op receipts remain compatible. One new focused real PHP 8.4/PostgreSQL test passes; four actual 422 operation contracts plus success/no-op specimens and undocumented-status/content-type/schema controls pass in gaza_meals_gate_4e96c0735082926aad4fb42c74284284. No other meal/reference or identity suite was repeated. Reviewer threads remain open pending confirmation.

### Original Admin / fleet transport integration

Explicit nonproduction backend mode now retains the original AdminShell and fleet/seat-layout screens under real staff MFA sessions. Permissions come from getStaffMe; successful sign-in refreshes the staff context, stale admission responses cannot restore a signed-out session, and identity transitions cancel and purge cached queries. No fabricated staff timestamps or browser audit writes are emitted in server mode. Only connected tabs remain enabled; real settings currently expose accepted staff security functions, with contact/appearance pending W3.

Fleet adapters use the shared bounded schema-checked MVP transport, complete atomic snapshots and server mutation receipts. Missing extensions fail closed; no independent-read assembly or client-computed changed/revision fallback. Exact response identity, closed DTOs and aircraft/layout bijection are checked. Mock booking reads and writes are blocked in backend mode pending W2, including mock occupancy.

Independent checks: 29 focused Node transport/fleet tests passed, then the single changed booking-isolation test passed after tightening the server read guard. Typecheck passed after documented compiler corrections; touched-file ESLint has no errors and one existing Fast Refresh export warning. The AGY Admin relay ended without a final worker report; its partial files were reviewed and corrected directly by Codex. These tests establish adapter boundaries, not a two-browser Admin sign-in certification. That joined browser scenario remains W5; mock remains the default and production opt-in is disabled.

### Curated offerings and CMS backend integration

The W1 schedule package and W3 editorial package are integrated additively and remain local/testing-only. Owner-authored recurring schedules materialize dated commemorative offerings against persisted active fleet/network authority; no seed operations or fictional live status are enabled. Codex removed schedule-wrapper unwrapping, moved prerequisite validation under the ordered locks, enforced the exact UTF-16 identifier bound in SQL, and made public offering projections coherent PostgreSQL repeatable-read snapshots. Existing command IDs and dated-service codecs are preserved.

CMS provides eight source-compatible draft/publish/discard/unpublish/restore document families with expected-revision conflicts, immutable content history, a published-only public projection and durable 410 tombstones. Staff principal/session locks precede domain locks; post-wait authorization is fresh. Caller ownerApproved flags cannot activate content. The corrected AGY handback was independently reviewed, joined migration-test scope was repaired, and response errors use safe fixed text.

Independent disposable PHP 8.4/PostgreSQL 17 evidence: schedules 11 tests / 147 assertions, 30 actual error contracts; CMS 16 tests / 430 assertions, 51 actual error contracts. Actual success specimens, undocumented status, content-type and schema controls pass; zero skips/failures, both resource sets cleaned. Receipts: gaza_schedules_gate_50720fd715740377f486a82061ba00d1 and gaza_editorial_gate_4fe915cf1fa7a0d8d95507c79f63d2d8 (working-tree hash manifests before commit). Accepted main contract structural/policy validation passes for 140 historical/additive operations. Public/editor UI cutover, settings and reservation joins remain unfinished; this is not a final MVP acceptance gate.
