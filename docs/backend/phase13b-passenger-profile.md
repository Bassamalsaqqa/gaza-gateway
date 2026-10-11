# Phase13B passenger profile and saved travelers

Status: locally reviewed bounded package; Phase13B remains incomplete. Worker baseline bc49fefb88b671c3fb9524e4203963991246204a; integration parent 061a55a5e1009164603cbcc08d18a2070e43f728. Public/admin frontend authority remains on the existing repositories. No production/staging activation.

## Routes and current authority

All paths have /api/v1 prefix; OpenAPI schemas and accepted identity command contracts remain unchanged.

| Method | Path | Operation | Success |
|---|---|---|---|
| GET | /auth/passenger/profile | getPassengerProfile | 200 |
| PUT | /auth/passenger/profile | putPassengerProfile | 200 |
| GET | /auth/passenger/travelers | getSavedTravelers | 200 |
| POST | /auth/passenger/travelers | postSavedTraveler | 201 |
| PATCH | /auth/passenger/travelers/{id} | patchSavedTraveler | 200 |
| DELETE | /auth/passenger/travelers/{id} | deleteSavedTraveler | 200 |

Codex wires PassengerProfileServiceProvider and passenger-profile.php into the existing v1 route group. Global accepted identity middleware enforces passenger realm and unconditional Origin/raw-CSRF for unsafe writes. GET/DELETE commands validate the actual raw body; unexpected bodies are rejected. Staff/anonymous authority and caller ownership aliases are rejected.

The final closed coordinators use a typed private authorization transaction helper. Each operation rejects caller-owned outer transactions, sets finite 8s statement/5s lock timeouts, locks users -> exact owner session -> profile/traveler rows, and derives fresh database time after waits. Current active verified principal, usable Argon2id hash, full session, exact owner, credential/context epoch, deadlines and revocation are checked; unsafe writes also bind header/current encrypted CSRF/context. Foreign traveler lookups use owner_user_id AND opaque external_id before locking. Successful effects and safe audit commit atomically; faults grant no success receipt.

Profile email is immutable and comes from users. Canonical preferences and honest changed/no-op account receipts are preserved. UnconfiguredMealCatalog is the deployment default: a genuinely changed meal fails service_unavailable503 before mutation, while reads/unrelated updates/unchanged retired preferences survive. Tests inject a synthetic authoritative catalog only in the disposable testing environment. Phase13C owns the real commercial adapter.

Saved travelers preserve opaque server-generated trv- IDs, free-text nationality, canonical names/dob/document and single-name records. PATCH merges with the current owned record before enforcing names. Empty DOB maps nullable DATE; nonempty DOB receives calendar validation. Documents are encrypted at rest; integrity failure returns a safe generic error instead of silently blanking data. Missing/foreign travelers return the same404. Delete receipts contain only deleted; profile no-op receipts are truthful. No alias ownership/email/path-ID mutation is accepted.

## Independent focused evidence — 2026-10-11

AGY run_5c4752a0afde4eed8aa61a6217259482 completed source-only fixture/conformance work. Codex reviewed source, closed coordinator extension surfaces, validated actual GET/DELETE bodies, and hardened owned-root retry state and child diagnostics/commands. Subsequent fixture corrections fixed backend-relative bootstrap depth, actual JSONB decoding, nondeterministic fixture ordering and the missing RequestCorrelation import. Worker self-reports are not independent evidence.

- First real PHP8.4.26/PostgreSQL17 package gate:49 tests/215 assertions;43 passing,5 child-initialization errors,1 JSONB assertion failure. The actual six-operation capture chain passed in that gate.
- Only six failures were rerun after bounded fixture corrections:6 tests/65 assertions;4 passing,2 assertion-helper import errors. Both genuine overlapping application races passed: child retains legitimate context before parent locks; parent changes epoch or revokes under principal/session locks; child actual coordinator is observed blocked via pg_blocking_pids on a distinct PG PID; after commit it denies with no profile mutation or success audit.
- Only the remaining two sequential replay cases were rerun:2 tests/26 assertions passed. All49 cases have successful cumulative evidence; no uninterrupted full-suite pass is fabricated. The separate raw-SQL serialization case is PostgreSQL locking evidence, not application authorization evidence.
- Six actual HTTP responses passed intact OpenAPI operation/status/application/json validation;14 pure envelope/family/reference-sibling negative controls rejected. New checker focused ESLint passed. No authentication/broad suites were rerun.

Reproduction: retained local stack with APP_ENV=testing, default/actual pgsql_test connection and live current_database()=gaza_gateway_test; mount the accepted Composer vendor read-only. First package command is vendor/bin/phpunit tests/Feature/IdentityPassengerProfile. A new capture root must be named passenger-profile-captures-<id> directly under storage/app/private and supplied through PASSENGER_PROFILE_CAPTURES_DIR. Then node backend/scripts/verify-passenger-profile-openapi.mjs --captures-dir <owned-root> validates actual responses. Missing/unowned captures fail; --pure is explicitly pure-only. Historical static specimen JSON is excluded from this package and cannot count as runtime captures.

Fixtures clean only tracked synthetic principals' dependent rows and retain immutable audit/audited principals. Filesystem helpers restrict exact immediate temporary children with UUID marker, bound and validate leaves before deletion, retain marker/ownership on failure and delete marker last. Subprocesses require guarded parent/child actual targets before READY/actions, finite IO/deadlines and confirmed exit before proc_close. Captures retain only operationId/status/contentType/rawResponseBody; all contact/document data is synthetic. Cookies, CSRF, passwords and request bodies are excluded.

## Remaining phase boundaries

Staff login/pending-confirmed MFA, recovery/step-up/directory/invitations; guest challenge/receipt/ownership routes; default-off EN/AR UI; and one final integrated migration/HTTP/PG-concurrency/browser evidence gate remain unfinished. Remote staging/provider custody and paid services are deferred. PR2 remains draft, original changes-requested disposition and open review threads apply. No Actions, merge, deployment, DNS change, production credentials or Phase13C.
