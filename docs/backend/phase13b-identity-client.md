# Phase 13B Isolated Identity Transport Client

## 1. Architectural Scope and Boundaries

This package implements an isolated, typed, browser-safe HTTPS client for the **41 accepted identity operations** (and 11 backwards-compatible ergonomic aliases) defined in `docs/backend/openapi.v1.json`, `docs/backend/identity-lifecycle.v1.json`, `docs/backend/operation-policies.v1.json`, and `scratch/CODEX_IDENTITY41_OPERATION_EXPECTATIONS.json`.

In accordance with Phase 13B boundaries and AGENTS.md engineering invariants:
- **Client-only transport expansion**: This package implements client-side transport protocol logic, path encoding, and runtime schema validation only. It does **not** provide or claim backend authentication authority, live PHP/Laravel middleware, Argon2id hashing, database persistence, session table handlers, or live email delivery.
- **Frontend remains on mocks**: The public and admin frontend remains bound to current mock repositories. No UI cutover or repository switching has been executed.
- **Default disabled / zero production access**: The client is disabled by default (`mode: "mock"`, `isEnabled: false`) with zero network calls and zero fabricated responses. It cannot be enabled in production environments (`PROD=true`, `MODE=production`, or `NODE_ENV=production`).
- **Zero invented state when disabled**: The disabled client fails closed with a safe configuration error on every operation. It never invents fake registrations, fake sessions, mock staff authority, or fabricated CSRF tokens.
- **Zero new dependencies**: Pure TypeScript / browser standard runtime (Fetch API, Streams API, Web Crypto API) without Node dependencies or external npm libraries.

---

## 2. HTTPS-Only Transport Policy

The Identity API handles sensitive credentials and authentication proofs. Transport security policies are strictly enforced before any network dispatch:

1. **HTTPS-Only Requirement**:
   - Loopback hosts (`localhost`, `127.0.0.1`, `::1`, `[::1]`) permit **HTTPS only**. Plaintext `http:` is strictly rejected fail-closed with a configuration error.
   - Remote hosts: Accepted staging API host only (`staging-api.gazaairport.com`) on standard port 443. Custom ports on staging are rejected.
   - Accidental production hosts (`api.gazaairport.com`, `www.gazaairport.com`, `gazaairport.com`) are permanently disallowed.
2. **URL Sanitization & Delimiter Rejection**:
   - User credentials (`userinfo`), query parameters (`?`), and fragments (`#`) in base URLs are strictly forbidden, including empty delimiters (`@`, `?`, `#`).
   - Base paths are normalized to preserve exact `/api/v1` without ambiguous, duplicate, or encoded path segments.
3. **Transport Options**:
   - `credentials: 'include'`: Required for browser handling of host-only, Secure, HttpOnly session cookies (`gza_session`, `gza_staff_session`, `gza_staff_pending`).
   - `redirect: 'error'`: HTTP redirects (301/302) are rejected fail-closed to prevent credential leakage.
   - `cache: 'no-store'`: Set explicitly on `RequestInit` and `Cache-Control: 'no-store'` header.
   - `Accept: 'application/json'`: Enforced on all requests; response `Content-Type` must be `application/json`.
   - `X-Request-Id`: Generated via cryptographic UUID (`crypto.randomUUID` or `crypto.getRandomValues`). No `Math.random` fallback; fails closed if secure RNG is absent. Caller-supplied request IDs are validated against RFC 4122 UUID grammar.
   - **Response Correlation Header**: CSRF bootstrap responses lack body metadata; the client strictly enforces the `X-Request-Id` response header matching the request ID.
   - **HTTP 429 Rate Limit Policy**: HTTP 429 responses must include a valid `Retry-After` header; missing or invalid headers are rejected fail-closed.
   - **Origin Header**: Browser manages `Origin` natively; the client never synthesizes or overrides `Origin`.

---

## 3. The 41 Accepted Operations and Ergonomic Aliases

The client implements exactly 41 named, typed methods mapping to the accepted OpenAPI operations, plus 11 backwards-compatible aliases:

### Passenger Realm Operations (15 operations)

| # | Operation ID | Method | Path | Expected Status | Requires CSRF | Auth-Changing | Description |
|---|---|---|---|---|---|---|---|
| 1 | `getAuthCsrfBootstrap` | `GET` | `/auth/csrf` | `200 OK` | No | No | Raw `{ csrfToken }` bootstrap |
| 2 | `postPassengerRegister` | `POST` | `/auth/register` | `202 Accepted` | Yes | No | Unverified account registration receipt |
| 3 | `postPassengerLogin` | `POST` | `/auth/login` | `200 OK` | Yes | Yes | Passenger sign-in; returns `PassengerAuthResponse` |
| 4 | `postPassengerLogout` | `POST` | `/auth/logout` | `200 OK` | Yes | Yes | Passenger session revocation receipt |
| 5 | `postPassengerPasswordForgot` | `POST` | `/auth/password/forgot` | `202 Accepted` | Yes | No | Anti-enumeration generic receipt |
| 6 | `postPassengerPasswordReset` | `POST` | `/auth/password/reset` | `200 OK` | Yes | Yes | Password reset completion; drops session/CSRF |
| 7 | `postPassengerEmailVerify` | `POST` | `/auth/email/verify` | `200 OK` | Yes | No | Proof verification; returns `{ verified: true }` |
| 8 | `getPassengerProfile` | `GET` | `/auth/passenger/profile` | `200 OK` | No | No | Passenger profile read |
| 9 | `putPassengerProfile` | `PUT` | `/auth/passenger/profile` | `200 OK` | Yes | No | Passenger profile update |
| 10 | `getSavedTravelers` | `GET` | `/auth/passenger/travelers` | `200 OK` | No | No | Saved companion travelers list |
| 11 | `postSavedTraveler` | `POST` | `/auth/passenger/travelers` | `201 Created` | Yes | No | Saved companion traveler creation |
| 12 | `deleteSavedTraveler` | `DELETE` | `/auth/passenger/travelers/{id}` | `200 OK` | Yes | No | Saved companion traveler deletion |
| 13 | `patchSavedTraveler` | `PATCH` | `/auth/passenger/travelers/{id}` | `200 OK` | Yes | No | Saved companion traveler update |
| 14 | `postPassengerEmailResend` | `POST` | `/auth/email/resend` | `202 Accepted` | Yes | No | Verification email resend receipt |
| 15 | `getPassengerSessions` | `GET` | `/auth/passenger/sessions` | `200 OK` | No | No | Active passenger sessions list |
| 16 | `deletePassengerSession` | `DELETE` | `/auth/passenger/sessions/{id}` | `200 OK` | Yes | Yes | Specific passenger session revocation |
| 17 | `putPassengerPassword` | `PUT` | `/auth/passenger/password` | `200 OK` | Yes | Yes | Password change; drops session/CSRF |

### Staff Realm Operations (24 operations)

| # | Operation ID | Method | Path | Expected Status | Requires CSRF | Auth-Changing | Description |
|---|---|---|---|---|---|---|---|
| 18 | `getStaffCsrfBootstrap` | `GET` | `/staff/csrf` | `200 OK` | No | No | Raw `{ csrfToken }` bootstrap |
| 19 | `postStaffLogin` | `POST` | `/staff/login` | `200 OK` | Yes | Yes | Credential sign-in; returns pending MFA state only |
| 20 | `postStaffLogout` | `POST` | `/staff/logout` | `200 OK` | Yes | Yes | Staff session revocation receipt |
| 21 | `getStaffMe` | `GET` | `/staff/me` | `200 OK` | No | No | Authenticated staff profile & permissions |
| 22 | `postStaffMfaSetup` | `POST` | `/staff/mfa/setup` | `200 OK` | Yes | No | TOTP secret and QR code URI generation |
| 23 | `postStaffMfaChallenge` | `POST` | `/staff/mfa/challenge` | `200 OK` | Yes | No | MFA challenge initiation for pending session |
| 24 | `postStaffMfaVerify` | `POST` | `/staff/mfa/verify` | `200 OK` | Yes | Yes | MFA challenge verification; returns full staff profile |
| 25 | `getStaffSessions` | `GET` | `/staff/sessions` | `200 OK` | No | No | Active staff sessions list |
| 26 | `deleteStaffSession` | `DELETE` | `/staff/sessions/{id}` | `200 OK` | Yes | Yes | Specific staff session revocation |
| 27 | `getStaffUsersDirectory` | `GET` | `/staff/users` | `200 OK` | No | No | Staff users directory list |
| 28 | `postStaffUserInvite` | `POST` | `/staff/users` | `201 Created` | Yes | No | Staff user invitation creation |
| 29 | `patchStaffUser` | `PATCH` | `/staff/users/{id}` | `200 OK` | Yes | No | Staff user profile/role update |
| 30 | `deleteStaffUser` | `DELETE` | `/staff/users/{id}` | `200 OK` | Yes | No | Staff user account deletion |
| 31 | `postStaffMfaEnrollmentSetup` | `POST` | `/staff/mfa/enrollment/setup` | `200 OK` | Yes | No | Mandatory MFA enrollment setup |
| 32 | `postStaffMfaEnrollmentConfirm` | `POST` | `/staff/mfa/enrollment/confirm` | `200 OK` | Yes | Yes | Mandatory MFA enrollment confirmation |
| 33 | `postStaffStepUp` | `POST` | `/staff/step-up` | `200 OK` | Yes | No | Step-up elevation proof submission |
| 34 | `postStaffMfaSetupConfirm` | `POST` | `/staff/mfa/setup/confirm` | `200 OK` | Yes | Yes | Voluntary MFA setup confirmation |
| 35 | `postStaffMfaRecoveryCodesRegenerate` | `POST` | `/staff/mfa/recovery-codes/regenerate` | `200 OK` | Yes | No | Emergency recovery codes regeneration |
| 36 | `postStaffPasswordForgot` | `POST` | `/staff/password/forgot` | `202 Accepted` | Yes | No | Staff anti-enumeration password reset receipt |
| 37 | `postStaffPasswordReset` | `POST` | `/staff/password/reset` | `200 OK` | Yes | Yes | Staff password reset completion |
| 38 | `putStaffPassword` | `PUT` | `/staff/password` | `200 OK` | Yes | Yes | Staff password change; drops session/CSRF |
| 39 | `postStaffInvitationAccept` | `POST` | `/staff/invitations/accept` | `200 OK` | Yes | Yes | Staff invitation acceptance & password set |
| 40 | `postStaffUserInviteReissue` | `POST` | `/staff/users/{id}/invite/reissue` | `200 OK` | Yes | No | Staff invitation reissue |
| 41 | `postStaffUserInviteRevoke` | `POST` | `/staff/users/{id}/invite/revoke` | `200 OK` | Yes | No | Staff invitation revocation |

### Ergonomic Operation Aliases (11 methods)
For backwards compatibility with existing Phase 13A consumers, ergonomic aliases map directly to the canonical operation methods:
- `getAuthCsrf` -> `getAuthCsrfBootstrap`
- `registerPassenger` -> `postPassengerRegister`
- `loginPassenger` -> `postPassengerLogin`
- `logoutPassenger` -> `postPassengerLogout`
- `forgotPassengerPassword` -> `postPassengerPasswordForgot`
- `resetPassengerPassword` -> `postPassengerPasswordReset`
- `verifyPassengerEmail` -> `postPassengerEmailVerify`
- `resendPassengerEmail` -> `postPassengerEmailResend`
- `getStaffCsrf` -> `getStaffCsrfBootstrap`
- `loginStaff` -> `postStaffLogin`
- `logoutStaff` -> `postStaffLogout`

---

## 4. Exact Identifier Fidelity (T02.1)

1. **Opaque Path Identifiers**:
   - Saved traveler IDs (`/auth/passenger/travelers/{id}`) and similar general path IDs are opaque strings (e.g. `" trv-preserve "`).
   - `validatePathId` preserves exact original characters (untrimmed whitespace, Unicode characters like `"مسافر-1"`, literal percent `"%"` encoded once to `"%25"`, and plus `"+"` encoded to `"%2B"`). Trimming or casefolding is strictly forbidden.
2. **Path Sanitization & Injection Prevention**:
   - Empty strings (`""`) and whitespace-only strings (`"   "`, `"\t\n"`) are rejected fail-closed.
   - Dot segments (`"."` and `".."`), path separators (`/`, `\`), and null bytes (`\0`) are rejected fail-closed with safe `IdentityApiError({ kind: "protocol" })` before network dispatch to prevent URL normalization traversal.
   - Lone surrogate ill-formed Unicode strings (`\uD800`) are rejected with `IdentityApiError({ kind: "protocol" })` rather than escaping raw `URIError`.
3. **PII-Safe Diagnostics**:
   - Diagnostics strictly avoid reflecting parameter values in error messages: errors identify the parameter name (`id`) but never echo the user-supplied value.
4. **Declared UUID Constraints**:
   - UUID-constrained staff operations (`patchStaffUser`, `deleteStaffUser`, `postStaffUserInviteReissue`, `postStaffUserInviteRevoke`, `deletePassengerSession`) enforce RFC 4122 UUID syntax via `validatePathUuid`, making zero network calls on invalid identifiers.

---

## 5. Operation-Bound Runtime Schema Gate (T02.2 & T03.1–T03.2)

1. **Direct Tie to `identity-contract.json`**:
   - The client runtime imports `identity-contract.json` directly and enforces schema validation via `validateOperationRequest` and `validateOperationResponse` inside `executeLiveMutation`, `executeLiveRead`, and `executeCsrfBootstrap`.
   - Reuses accepted schema validation semantics from `scripts/lib/backend-contract-validation.mjs` in a browser-safe, pure TypeScript implementation (`src/lib/api/identity-schema-validation.ts`) with zero Node dependencies.
2. **Schema Engine Capabilities, JSON-Value Preflight, and Budgets (T03.1)**:
   - **Bounded JSON-Value Structural Preflight**: Independent of schema assertion selection, runs once per root validation. Rejects cyclic instance graphs (`circular instance reference detected`), non-finite numbers (`Infinity`, `-Infinity`, `NaN`), unsupported JS types (`undefined`, `function`, `symbol`, `bigint`), and non-plain objects without silent coercion. Enforces maximum instance depth (50) and instance node bounds (10,000).
   - **Internal JSON Pointers (`$ref`)**: Resolves component schema references across root document. Traverses reference targets during preflight with active-cycle detection (`visitedRefs = new Set()`) so every reachable assertion is verified before branch selection.
   - **Conjunctive $ref Siblings**: Sibling assertions on `$ref` (e.g. `description`, constraints) are evaluated conjunctively.
   - **Composition**: Recursively evaluates `allOf`, `anyOf`, `oneOf`, and `not` (including full preflight traversal through `not` branches).
   - **One Shared Evaluation Budget Across All Branches**: Single evaluation budget (10,000 evaluations max) shared continuously across refs, combinator branches, properties, and items. Budget exhaustion is a fatal whole-validation condition that cannot be hidden by `anyOf` fallback or inverted into a match by `not`.
   - **Bounded Canonical Equality & Linear uniqueItems**: `canonicalJsonString` produces lexicographically key-sorted canonical representations for deep structural comparisons across `const`, `enum`, and `uniqueItems`. Each visited node in the value AST charges `chargeStep()` against the shared 10,000 operation budget. `uniqueItems` performs $O(N)$ linear deduplication using a canonical string `Set`, eliminating quadratic $O(N^2)$ comparisons. Complex objects with differing key order (e.g. `[{ a: 1, b: 2 }, { b: 2, a: 1 }]`) are deterministically detected as duplicates. Canonical strings on objects are memoized via `WeakMap` in `EvaluationContext` to avoid repeated recanonicalization per combinator branch.
   - **Centralized Bounded Diagnostic Appending**: All schema preflight, instance preflight, and schema evaluation errors pass through `appendDiagnostic`. Enforces hard caps: max 50 errors per evaluation, max 4,096 total retained error bytes, and max 120 characters per message (truncating long property names/keys to 32 characters with `...`). Reaching the diagnostic cap guarantees at least one error is recorded, preventing error suppression from falsely turning an invalid branch into a match in `anyOf` or `not`.
   - **Closed Shapes & Supported Dialect**: Enforces `additionalProperties: false` fail-closed across all object schemas. Undeclared keywords outside `DECLARED_SCHEMA_KEYWORDS` fail closed.
   - **Keyword Value Shape Validation**: Validates `required` (must be array of unique non-empty strings), `enum` (non-empty unique items), numeric bounds (`minimum`, `maximum`, etc. must be finite numbers), `multipleOf` (positive finite number), regex `pattern` (must compile), and `format` (closed set: `email`, `uuid`, `date`, `time`, `date-time`, `uri`, `int32`, `int64`, `float`, `double`, `byte`, `binary`, `password`).
   - **Schema Budgets & Cycle Detection**: Aggregate schema node budget (max 5,000 nodes) and depth limit (max 50) in preflight; schema recursion cycle detection failing closed safely without unbounded recursion.
3. **Authoritative Operation Metadata & Subprocess Drift Detection (T03.2)**:
   - `scripts/generate-identity-api-types.mjs` extracts and pins exact accepted operation `x-authorization-branches`, `parameters`, `method`, `path`, `expectedStatus`, `media type`, `security`, and `protocol` metadata against `docs/backend/openapi.v1.json`.
   - All 41 operations include authoritative `authorizationBranches` in `identity-contract.json`, and all operation metadata is digested via SHA-256 canonical serialization.
   - Real subprocess verification detects contract and spec drift across 7 corruption types (path, method, status, content/schema constraint, security, protocol, and authorization branches) exiting 1.
4. **Safe Bounded Public Error Diagnostics (T03.2)**:
   - `validateOperationRequest`, `validateOperationResponse`, and `validateContractSchema` emit fixed bounded safe diagnostic messages (`Invalid request payload for operation '${operationId}': schema contract validation failed.`) without interpolating raw schema errors or instance property names/values.
   - Attacker-controlled keys and values (sentinels) never leak into `error.message`, `JSON.stringify()`, `util.inspect()`, `error.toJSON()`, or `Object.entries()`.

---

## 6. CSRF Protocol & Realm Memory Isolation

1. **ECMAScript `#private` Secret State**:
   - Passenger and staff CSRF tokens, generation numbers, and queues reside in true `#private` fields (`#passengerCsrfToken`, `#staffCsrfToken`, `#passengerQueue`, `#staffQueue`).
   - Tokens never leak into `JSON.stringify(client)`, `Object.keys`, `Object.entries`, object spread, or runtime inspection.
   - `client.toJSON()` returns strictly non-secret diagnostics: `{ isEnabled, mode, baseUrl, isDisposed }`.
2. **Per-Realm Write Serialization & Queue Aggregate Budget**:
   - Both public bootstrap and mutations in each realm are serialized using dedicated promises (`RealmQueue`).
   - A single end-to-end deadline budget spans queue wait, bootstrap fetch, streaming body reads, and mutation dispatch.
   - If an operation's wait time in queue exceeds its operation budget, it times out immediately with `IdentityApiError({ kind: "timeout" })` without dispatching network requests.
3. **Disposal Lifecycle**:
   - Calling `client.dispose()` aborts all active `AbortController` instances, clears cached CSRF tokens, and cleans up registered listeners.
   - Subsequent calls on a disposed client reject immediately with `IdentityApiError({ kind: "abort" })` with zero network dispatch.
4. **CSRF Invalidation & No-Retry Policy**:
   - A realm's cached token is immediately dropped after auth-changing operations (`login`, `logout`, `password reset`, `password change`, `mfa verify`, `invitation accept`).
   - A realm's cached token is dropped upon receiving HTTP `401 Unauthorized`, `419 CSRF Token Mismatch`, network failure, timeout, or protocol error.
   - Mutations are **never automatically retried or replayed** upon failure. Failure is surfaced immediately to caller; re-bootstrap occurs on the next explicit caller mutation request.
5. **Pending Staff Identity as Non-Full Authority**:
   - `postStaffLogin` returns `status: "mfa_required"` or `"enrollment_required"`. It never returns full staff authority or staff profile tokens. Full staff authority requires secondary MFA verification (`postStaffMfaVerify`).

---

## 7. Phase 13B Integration Still Pending

The following server and UI components remain required for full Phase 13B completion; their absence prevents phase closure. Remote staging and production verification remain separate external gates:
1. **Actual HTTP Server / Middleware**: Real Laravel 13 routing, PostgreSQL 17 session storage, and Argon2id hash benchmarking.
2. **Host-Only Secure Cookies**: Live browser receipt of `HttpOnly; Secure; SameSite=Lax` cookies on API endpoints.
3. **Real Origin Verification**: Server-side `VerifyApplicationCsrfHeader` middleware validating configured frontend origins.
4. **Staff MFA & Step-Up Protocol**: TOTP RFC 6238 challenge/verify and single-use recovery code consumption.
5. **Frontend UI Cutover**: Connecting public and admin forms to the client behind reviewed feature switches.
