# Phase 13B Isolated Identity Transport Client

## 1. Architectural Scope and Boundaries

This package implements an isolated, typed, non-production HTTPS client for the **12 accepted identity operations** defined in `docs/backend/openapi.v1.json`, `docs/backend/identity-lifecycle.v1.json`, and `docs/backend/operation-policies.v1.json`.

In accordance with Phase 13B boundaries and AGENTS.md engineering invariants:
- **Client-only scope**: This package implements client-side transport protocol logic and protocol validation only. It does **not** provide a runtime HTTP server, backend authentication middleware, Argon2id hashing, database persistence, session table handlers, or live email delivery.
- **Frontend remains on mocks**: The existing public and admin frontend remains bound to current mock repositories. No UI cutover or repository switching has been executed.
- **Zero production access**: The client is disabled by default (mock mode with zero network calls) and cannot be enabled in production environments (`PROD=true`, `MODE=production`, or `NODE_ENV=production`).
- **Zero invented state when disabled**: The disabled client fails closed with a safe configuration error on every operation. It never invents fake registrations, fake sessions, mock staff authority, or fabricated CSRF tokens.

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

## 3. The 12 Accepted Operations

The client implements exactly 12 named, typed methods mapping to the accepted OpenAPI operations:

| # | Operation ID | Method | Path | Expected Status | Realm | Requires CSRF | Auth-Changing | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `getAuthCsrfBootstrap` | `GET` | `/auth/csrf` | `200 OK` | Passenger | No | No | Raw `{ csrfToken }` bootstrap |
| 2 | `postPassengerRegister` | `POST` | `/auth/register` | `202 Accepted` | Passenger | Yes | No | Unverified account registration receipt |
| 3 | `postPassengerLogin` | `POST` | `/auth/login` | `200 OK` | Passenger | Yes | Yes | Passenger sign-in; returns `PassengerAuthResponse` |
| 4 | `postPassengerLogout` | `POST` | `/auth/logout` | `200 OK` | Passenger | Yes | Yes | Passenger session revocation receipt |
| 5 | `postPassengerPasswordForgot` | `POST` | `/auth/password/forgot` | `202 Accepted` | Passenger | Yes | No | Anti-enumeration generic receipt |
| 6 | `postPassengerPasswordReset` | `POST` | `/auth/password/reset` | `200 OK` | Passenger | Yes | Yes | Password reset completion; drops session/CSRF |
| 7 | `postPassengerEmailVerify` | `POST` | `/auth/email/verify` | `200 OK` | Passenger | Yes | No | Proof verification; returns `{ verified: true }` |
| 8 | `postPassengerEmailResend` | `POST` | `/auth/email/resend` | `202 Accepted` | Passenger | Yes | No | Verification email resend receipt |
| 9 | `getStaffCsrfBootstrap` | `GET` | `/staff/csrf` | `200 OK` | Staff | No | No | Raw `{ csrfToken }` bootstrap |
| 10 | `postStaffLogin` | `POST` | `/staff/login` | `200 OK` | Staff | Yes | Yes | Credential sign-in; returns **pending MFA state only** |
| 11 | `postStaffLogout` | `POST` | `/staff/logout` | `200 OK` | Staff | Yes | Yes | Staff session revocation receipt |
| 12 | `getStaffMe` | `GET` | `/staff/me` | `200 OK` | Staff | No | No | Authenticated staff profile & permissions |

*Note on Staff Login Authority*: `postStaffLogin` returns `StaffPendingAuthResponse` with `status: 'mfa_required' | 'enrollment_required'`. It never returns full staff authority or profile tokens. Full staff authority requires secondary MFA verification (Phase 13B core).

---

## 4. CSRF Protocol & Realm Memory Isolation

1. **ECMAScript `#private` Secret State**:
   - Passenger and staff CSRF tokens, generation numbers, and queues reside in true `#private` fields (`#passengerCsrfToken`, `#staffCsrfToken`, `#passengerQueue`, etc.).
   - Tokens never leak into `JSON.stringify(client)`, `Object.keys`, `Object.entries`, object spread, or runtime inspection.
   - `client.toJSON()` returns strictly non-secret diagnostics: `{ isEnabled, mode, baseUrl, isDisposed }`.
2. **Unsafe Writes (POST)**:
   - On mutation dispatch, the client checks for a cached token in that realm. If absent, it automatically executes the same-realm bootstrap (`GET /auth/csrf` or `GET /staff/csrf`).
   - The token is transmitted via raw `X-CSRF-TOKEN` header.
3. **Per-Realm Write Serialization & Queue Discipline**:
   - Both public bootstrap and mutations in each realm are serialized using dedicated promises (`RealmQueue`).
   - Queue wait races against caller `signal` abort and single deadline timeout. If a request is aborted while queued, it rejects immediately and never executes fetch later.
   - Disposing the client while operations are queued ensures queued operations reject on wake-up with zero network dispatch.
4. **Single End-to-End Deadline Budget**:
   - A single deadline budget spans queue wait, bootstrap fetch, response stream reading, and mutation dispatch end-to-end. Timeouts are never reset or doubled.
5. **Bounded Response Body Reading**:
   - Response streams are read in chunks bounded to a maximum of 1 MiB (`1024 * 1024` bytes).
   - If a stream exceeds 1 MiB, it is cancelled immediately and fails closed with a protocol error.
6. **CSRF Invalidation & No-Retry Policy**:
   - A realm's cached token is immediately dropped after auth-changing operations (`login`, `logout`, `password reset`).
   - A realm's cached token is immediately dropped upon receiving HTTP `401 Unauthorized`, `419 CSRF Token Mismatch`, network failure, timeout, or protocol error.
   - Mutations are **never automatically retried** upon failure; failure is surfaced immediately to the caller. Re-bootstrap occurs on the next explicit caller mutation request.
7. **Generation & Disposal Guards**:
   - Each realm maintains an internal generation counter. If a slow bootstrap request resolves after an invalidation, logout, or client disposal has already occurred, the stale token is discarded and throws a protocol error.
   - Calling `client.dispose()` aborts in-flight requests, clears cached tokens and pending state, and rejects all subsequent calls.
8. **Zero Web Storage Usage**:
   - `localStorage` and `sessionStorage` are strictly avoided. No tokens, proofs, or session identifiers are written to or read from web storage.

---

## 5. Input Shapes and Safe Diagnostics

1. **Closed Request Shapes & Options**:
   - Per-call options are validated as closed shapes (`requestId`, `signal`, `timeoutMs`). Unknown properties or malformed fields fail closed before dispatch.
   - Request DTOs are validated with closed schemas. Extra/unexpected properties (e.g. attempted privilege escalation tampering like `role: "admin"`) are rejected fail-closed before network dispatch.
   - Email format is validated directly without trimming caller input.
2. **Password Integrity & Unicode Rules**:
   - Passwords must be well-formed Unicode; strings containing lone surrogates are rejected fail-closed before JSON encoding.
   - Passenger registration and reset passwords require 15?128 Unicode code points. Passenger login has no schema length bound; staff login requires a non-empty password and has no schema maximum. Credential creation policy is enforced separately by the server.
   - Passwords, tokens, and emails are never trimmed or altered: exact bytes and surrounding whitespace are preserved intact.
3. **Safe Diagnostics & Error Model (Correction 02 Redaction & Canonical Codes)**:
   - `IdentityApiError` provides safe, typed classification: `configuration`, `network`, `timeout`, `abort`, `protocol`, and `http_error`.
   - Error messages, `JSON.stringify`, `Object.entries`, and `util.inspect` representations are strictly sanitized: passwords, tokens, emails, sentinels, and credentials are never echoed in diagnostic outputs.
   - Non-canonical or unknown server error codes are normalized to the accepted canonical codes (`bad_request`, `unauthorized`, `forbidden`, `not_found`, `method_not_allowed`, `csrf_mismatch`, `csrf_token_mismatch`, `validation_error`, `too_many_requests`, `internal_error`, `service_unavailable`) or generic fallback `"http_error"`.
   - Error `fields` payloads from the server discard arbitrary server text completely: authentic allowlisted request field keys map strictly to static generic messages `["Invalid field value."]`. Non-allowlisted server fields are omitted entirely.
   - Unknown caller option properties fail closed without reflecting the unknown property name into error text.
4. **Contract Fidelity & OpenAPI Schema Parity (Correction 02)**:
   - Request DTO validators strictly adhere to OpenAPI 3.1 component schemas without inventing ungrounded client constraints (such as ungrounded `token.length >= 1` constraints).
   - All 12 operations possess specimen request and response envelope definitions validated using `validatePayloadAgainstSchema` against the accepted OpenAPI schema AST, verifying parity for optional, required, and closed fields across spec and runtime.
   - `scripts/generate-identity-api-types.mjs` generates `identity-contract.json` containing complete schema ASTs and a SHA-256 digest of all reachable schemas.
   - `checkIdentityApiTypes()` verifies both TypeScript interfaces and contract JSON against `openapi.v1.json`, detecting constraint modifications (e.g. password `minLength` or field formats).
5. **Independent Settle on Deadline/Abort/Disposal & Complete Signal Duck-Typing (Correction 02)**:
   - Client settlements do not depend on injected `fetch` honoring `AbortSignal` or `ReadableStream` reads settling: fetch and streaming body reads race against `budget.cancelPromise`.
   - Stream reader and response body cancellations are triggered fire-and-forget (`.catch(() => {})`) without awaiting potentially hanging cancel calls.
   - In-flight fetch rejections after budget timeout/abort are suppressed (`.catch(() => {})`), preventing unhandled rejections on late network failures.
   - Queued operations aborted during queue wait unblock the realm queue immediately while preserving FIFO write serialization for subsequent operations.
   - Caller `signal` validation requires either `AbortSignal` instance or a complete compatible duck type implementing `aborted: boolean`, `addEventListener: function`, and `removeEventListener: function`.

---

## 6. Phase 13B Integration Still Pending

These server and UI components remain required within Phase 13B; their absence prevents phase completion. Remote staging and production verification remain separate external gates:
1. **Actual HTTP Server / Middleware**: Real Laravel 13 routing, session storage in PostgreSQL 17, and Argon2id hash benchmarking.
2. **Host-Only Secure Cookies**: Live browser receipt of `HttpOnly; Secure; SameSite=Lax` cookies on API endpoints.
3. **Real Origin Verification**: Server-side `VerifyApplicationCsrfHeader` middleware validating configured frontend origins.
4. **Staff MFA & Step-Up Protocol**: TOTP RFC 6238 challenge/verify and single-use recovery code consumption.
5. **Frontend UI Cutover**: Connecting public and admin forms to the client behind reviewed feature switches.
