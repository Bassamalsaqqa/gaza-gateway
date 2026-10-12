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

W0 scope is adopted. W1 reference authority, W2 free reservations and W3/W4 editorial/contact/gallery/settings/ticket/account-mail authority are locally integrated behind explicit nonproduction opt-in. Focused PostgreSQL and real-browser evidence is recorded in [the integration checkpoint](../backend/mvp-w3-w4-checkpoint.md). W5 exact-commit consolidated certification remains pending; production acceptance and external delivery are not claimed. Main and HostPapa are unchanged; PR #3 remains draft and prior review threads are preserved.

Launch still requires owner-authored offerings, actual external mail delivery, reviewed production HTTPS/proxy/scheduler configuration, operational backup/rollback and explicit owner GO. Local synthetic acceptance does not establish external delivery. The following sections preserve the historical implementation/evidence sequence; current status above takes precedence over earlier unfinished-slice descriptions.

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

### PR review: CSRF bootstrap error semantics

Trusted IdentityApiError HTTP classifications from passenger/staff CSRF bootstrap now preserve canonical status/code without propagating upstream messages. Timeout and caller cancellation remain distinct; no mutation is dispatched when bootstrap fails. Thirteen new focused Node probes passed (both realms: 401/403/429/503, typed abort/timeout/network/protocol, elapsed deadline and caller cancellation); affected-file ESLint and whitespace checks passed. Existing transport tests were not repeated. This is a bounded client correction, not remote provider or browser certification. Reviewer thread remains open for confirmation.

### Original Admin and public reference adapters

Network, meals and schedules now use shared schema-checked API authority in explicit nonproduction backend mode. Original destination, product and schedule editors issue server commands and consume server receipts; public destination cards and curated dated offerings use the same persisted references. Backend-mode flight views omit fictional gates/status, prices and online check-in controls. Mock mode remains the default. Booking controls remain visibly unavailable until W2 is joined.

Eight network/meal boundary tests passed before schedule edits; four new schedule/offering tests passed separately, without repeating the earlier tests. Typecheck passes; touched-file ESLint reports zero errors and one existing Fast Refresh warning; whitespace passes. These are transport/source checks, not a two-browser certification. Seventeen historical paid/guest/check-in operations are annotated excluded-disabled in the normative API; metadata is explicitly not a runtime guard, and joined free-booking route isolation is still required.

AGY quota-failed W1/W2/W3/W4 runs are preserved as partial evidence. Codex completed and independently checked this adapter slice directly; no worker completion or final MVP acceptance is claimed. Next: durable free reservations and CMS/publication UI, then tickets/mail/settings and the consolidated acceptance gate. No Actions, merge, deployment or provisioning occurred.

### Free reservation backend and original CMS publication controls

The local/testing-only reservation module now resolves actual persisted offerings, commits owner-bound free reservations and unique per-service seat claims atomically, preserves ticket/meal/reference snapshots, releases claims on cancellation, and records one logical confirmation-mail intent. Same-owner submission replay returns the existing reservation even after reference retirement; changed payload replay conflicts. Real passenger/staff sessions, Origin/CSRF and commercial permissions guard the nine operations. When reservations are enabled, historical guest booking/claim routes are not registered; paid/check-in routes remain absent. Registration exclusions are asserted separately from global policy rejection responses. No prototype bookings, staff or flight fixtures are promoted.

Independent PHP 8.4/PostgreSQL 17 evidence: 22 tests / 191 assertions passed in `gaza_reservations_gate_9c18632cc4d5fa557e877d138d6ed384`, including real two-user seat concurrency, failed-transaction rollback, migration reversal and authorization after lock wait. Its complete runner receipt remains FAILED because the following OpenAPI preflight exposed missing pinned scheme definitions. Those definitions and the incorrect copied layout schema were repaired without repeating the PHP suite. A focused protocol/capture correction passed (1 test / 23 assertions) in `gaza_reservations_gate_96f0298b88caeb891d202c0676832da8`. The provenance-bound union of their real captures passes all nine operation contracts and 54 actual error contracts, including negative undocumented-status/content-type/schema controls. Failed receipts and original files remain retained; this is working-tree evidence, not a green exact-final-SHA consolidated gate.

In explicit nonproduction backend mode, the original Website, Airport Past/Present/Future and Destination editorial editors now save server drafts with CAS revisions and expose privileged Publish/Unpublish/Restore. Public content consumers fetch published server revisions; only explicit never-published 404 uses the compiled initial baseline. Unpublish 410 and transport failures fail visibly. Dirty editor conflicts preserve the original revision until explicit reload. Local-only archive/source/media draft tabs remain hidden pending shared archive authority. Existing mock mode remains unchanged.

Four new focused CMS client/editor tests passed (three initially, followed by only the corrected failed canonical-error-fixture test). Typecheck passed after the affected tab typing correction. Touched-file ESLint has zero errors and one Fast Refresh export warning. CMS browser-to-browser certification, reservation customer/Admin UI, SMTP/email and essential settings remain unfinished. Mail intents are pending, not sent. The MVP and Phase 13C remain in progress; no production activation, Actions, merge or deployment occurred.

### Reservation customer and Admin UI wiring

In explicit nonproduction backend mode, published offerings now link to the original booking route with their exact dated-service identity. The free one-way form reads real offering geometry, occupied seats, active meals and saved travelers, then submits the closed owner-bound reservation command. Uncertain confirmation results retain the same immutable submission in memory; input edits stay disabled until a definitive rejection. A retry remains available even when a later reference refresh fails. No price, payment or infant command is offered.

The original account trip routes and Admin booking routes now read the shared reservation API, expose authorized cancellation and render printable per-passenger ticket snapshots. Backend-mode legacy surname lookup, operational check-in and guest ownership-claim controls are unavailable. Passenger login/logout and account revalidation purge private reservation caches. Default mock mode remains unchanged. Staff detail uses a separate closed owner/audit schema; those fields are rejected on passenger responses.

Focused verification: the five initial reservation transport/replay/schema tests passed; one subsequently added server-normalization test and one staff-detail isolation test each passed independently without repeating the earlier tests. An initial comparison against retained real PostgreSQL HTTP captures found the staff owner/audit extension missing in the client. After correcting the staff schema, all five applicable retained actual responses passed. This reused existing evidence rather than rerunning database suites. Typecheck and the integrated Vite build passed; touched-file ESLint had zero errors and one existing Fast Refresh warning. Test inventory and whitespace checks passed. Generated route-tree output was produced by Vite, not hand-edited.

This is source/transport/build evidence, not a joined two-browser acceptance result. Tickets are printable; email remains honestly unavailable until the separate W4 worker package is reviewed. CMS recursive closure and fleet committed-result recovery are assigned to the separate review-repair worker. Shared contact/settings/gallery authority, joined browser certification and the final exact-SHA consolidated gate remain open. No Actions, merge, deployment or provider activation occurred.
