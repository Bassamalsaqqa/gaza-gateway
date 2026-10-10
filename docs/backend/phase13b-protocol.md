# Phase 13B Identity Protocol Architecture & Verification

## 1. Executive Summary & Scope Boundaries

Phase 13B Package 02 establishes the bounded browser identity protocol foundation and Laravel guard boundaries for the Gaza Gateway / Palestinian Airlines system.

### Scope Invariants
- **Bounded Protocol Surface**: Implements strictly production `GET /api/v1/auth/csrf` (passenger) and `GET /api/v1/staff/csrf` (staff), separate cookie guards, and unconditional `VerifyApplicationCsrfHeader` middleware.
- **Excluded Lifecycles**: Login flows, registration submission, MFA enrollment/challenges, password reset lifecycles, and directory queries remain reserved for subsequent packages.
- **Immutable Dependencies**: Pinned 17 command-contract files (`scratch/CODEX_COMMAND_DEPENDENCY_MANIFEST.json`) remain strictly untouched and excluded from product commits.
- **Reviewed Core Foundations**: Session stores (`PassengerSessionStore`, `StaffSessionStore`), RBAC policy (`RbacPolicy`), password hashing, and database DDL remain pinned and unmodified.
- **Deployment Invariants**: No cloud provisioning, DNS changes, Render/HostPapa deployments, or GitHub Actions. All execution takes place in isolated local Docker environment (`gaza_gateway_phase13b_protocol02`) on loopback port `18090`.

---

## 2. Architecture & Security Invariants

### 2.1 Cookie Security & Separate Realms (`CookieSecurity`)
- **Realm Separation**:
  - `gza_session`: Passenger realm session cookie.
  - `gza_staff_session`: Staff realm session cookie.
  - `gza_staff_pending`: Pending staff authentication cookie (for multi-factor challenge transitions).
- **Hardened Attributes**:
  - Host-only: No `Domain` attribute (strictly locked to serving host).
  - `Secure`: Transmitted solely over HTTPS.
  - `HttpOnly`: Inaccessible to clientside JavaScript (`document.cookie`).
  - `SameSite=Lax`: First-party contextual transmission with top-level navigation safety.
  - `Path=/api/v1`: Scoped exclusively to the API path prefix.
- **Presence Tracking**:
  - Differentiates present-but-empty (`""`) or whitespace cookies from legitimately absent (`null`) cookies.
  - Present malformed, empty, expired, or duplicate cookies are rejected with `401 unauthorized` / `400 duplicate_cookie` and explicitly cleared (`Max-Age=0`). Only genuinely absent expected cookies trigger anonymous session issuance.
  - Cross-realm cookies coexist without cross-contamination or authority leakage.

### 2.2 CSRF Bootstrap Endpoints (`IdentityBootstrapController`)
- **Passenger Realm**: `GET /api/v1/auth/csrf`
  - Returns `{ "csrfToken": "<raw_base64url_32_bytes>" }`.
  - Headers: `Cache-Control: no-store, private`, `Content-Type: application/json`, correlated `X-Request-ID`.
  - Rebootstrap with valid session cookie returns the exact active CSRF token with reissued bounded cookie TTL.
- **Staff Realm**: `GET /api/v1/staff/csrf`
  - Returns `{ "csrfToken": "<raw_base64url_32_bytes>" }`.
  - Evaluates only `gza_staff_session`.

### 2.3 Unconditional Protocol Middleware (`VerifyApplicationCsrfHeader`)
- **Server-Owned Policy Registry**:
  - Operation policies are resolved strictly from `IdentityOperationPolicies`, deterministically generated from `docs/backend/operation-policies.v1.json` (Source Digest: `73fb8ab0b908a9100876ec65b6c3d17874e4600efffc83a76e2262c3e6700939`).
  - Anchored path matching with declared template parameters (`TEMPLATES`). Path normalization prevents directory traversal, null bytes, query-string influence, double-slashes, and trailing-slash alias confusion.
  - Caller-controlled route attributes or headers cannot select or alter policies.
- **Unconditional Transport Security**:
  - Enforces HTTPS unconditionally (`$request->isSecure()`); request-controlled header or environment bypasses are prohibited.
- **Unconditional Origin Validation**:
  - Required on all unsafe HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`).
  - Must match authorized CORS origins (`config('cors.allowed_origins')`). `Sec-Fetch-Site: same-origin` or `Referer` cannot substitute.
- **CSRF Token Validation**:
  - Raw `X-CSRF-TOKEN` header is validated against canonical base64url representation and compared in constant-time (`hash_equals`) against the decrypted active session CSRF token.
- **Protected Safe GET Enforcement**:
  - Safe methods (`GET`, `HEAD`) declaring security requirements require full-realm authenticated sessions (denying anonymous sessions).
- **StaffPreAuthCookieAuth Enforcement**:
  - Pending staff operations require active `gza_staff_pending` cookie AND bound anonymous staff session cookie AND bound anonymous CSRF token.
  - Validates `staff_pending_auth` PostgreSQL record: unexpired, unconsumed, unrevoked, purpose matching (`login_mfa` / `enroll_mfa`), staff principal active, and credential epoch current.
- **Recent Step-Up Authentication Window**:
  - Enforces `requiresRecentStepUp` policy on sensitive staff operations.
  - Evaluated against durable database record: `0 <= age < 300` seconds since confirmed MFA proof (`mfa_verified_at`), and strictly never in the future.

### 2.4 Custom Guards Privacy & Hygiene
- **Adapters**: `PassengerSessionGuard` and `StaffSessionGuard` adapt reviewed core session stores to Laravel's authentication system.
- **Information Leak Prevention**:
  - `__debugInfo()` excludes raw tokens, CSRF tokens, and credentials.
  - Serialization (`__serialize`, `__unserialize`) is explicitly denied.
  - `setUser()` forbids manufacturing authenticatable authority without a matching persisted, verified session in PostgreSQL.

### 2.5 Request Body Preservation
- Identity endpoints are excluded from Laravel's global `TrimStrings` and `ConvertEmptyStringsToNull` middleware via path-bound callbacks, preventing truncation of passwords, tokens, or empty strings.

---

## 3. Verification & Evidence

### 3.1 PHPUnit Test Suite
- Total Tests: **51**
- Total Assertions: **381**
- Test Status: **100% PASS (0 Errors, 0 Failures)**

| Suite | File | Tests | Assertions | Result |
|---|---|---|---|---|
| Feature | `tests/Feature/IdentityProtocol/CsrfBootstrapFeatureTest.php` | 10 | 71 | PASS |
| Feature | `tests/Feature/IdentityProtocol/VerifyApplicationCsrfHeaderFeatureTest.php` | 20 | 61 | PASS |
| Unit | `tests/Unit/IdentityProtocol/CookieSecurityTest.php` | 5 | 21 | PASS |
| Unit | `tests/Unit/IdentityProtocol/IdentityOperationPoliciesTest.php` | 6 | 118 | PASS |
| Unit | `tests/Unit/IdentityProtocol/IdentityPrincipalTest.php` | 4 | 22 | PASS |
| Unit | `tests/Unit/IdentityProtocol/SessionGuardsPrivacyAndHygieneTest.php` | 6 | 88 | PASS |

### 3.2 Policy Generator Parity Check
- Execution: `node backend/scripts/generate-identity-protocol-policies.mjs --check`
- Result: **PASS**
- Source SHA-256 Digest: `73fb8ab0b908a9100876ec65b6c3d17874e4600efffc83a76e2262c3e6700939` (41 operations).

### 3.3 Immutable Dependency Manifest Verification
- Execution: Cross-verified against `scratch/CODEX_COMMAND_DEPENDENCY_MANIFEST.json`.
- Result: **17 / 17 files match SHA-256 exactly** (unmodified and excluded from product commit).

### 3.4 Live HTTPS Probe & OpenAPI Schema Validation
- Execution: `node backend/scripts/probe-identity-protocol.mjs`
- Target: `https://127.0.0.1:18090` (FrankenPHP Caddy container)
- TLS Authority: Strict verification with `scratch/local_caddy_ca.crt` (no `-k`).
- Probes Summary:
  - Probe 1: Absent cookie passenger bootstrap -> 200, schema valid, host-only `gza_session`.
  - Probe 2: Valid cookie passenger rebootstrap -> 200, schema valid, identical CSRF token returned.
  - Probe 3: Absent cookie staff bootstrap -> 200, schema valid, host-only `gza_staff_session`.
  - Probe 4: Valid cookie staff rebootstrap -> 200, schema valid, identical CSRF token returned.
  - Probe 5: Present-empty cookie rejection -> 401, clearing cookie issued, ErrorResponse schema valid.
  - Probe 6: Malformed cookie rejection -> 401, clearing cookie issued, ErrorResponse schema valid.
  - Probe 7: Duplicate cookie header rejection -> 400 (`duplicate_cookie`), ErrorResponse schema valid.
  - Probe 8: Cross-realm cookie coexistence -> 200, both cookies coexist without cross-contamination.
  - Probe 9: Schema validator negative control -> correctly fails closed on illegal payload.
- Capture Manifest: Saved to `scratch/identity-protocol-probe-receipt.json` (SHA-256: `9a59d1a8d747bb9720af932fb55f5322b264cd08e3c25d424e5b0bd6cbe2bd19`).
- Redaction: Zero raw tokens, session cookies, or PII present in captured receipts.

---

## 4. Local Execution Recipe

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Open loopback port `18090`

### Step-by-Step Clean Reproduction
1. **Dynamic Ignored Application Key**:
   ```bash
   export APP_KEY="base64:$(openssl rand -base64 32)"
   ```
2. **Launch Isolated Containers**:
   Uses `backend/docker/Caddyfile.identity` and binds loopback port `18090`:
   ```bash
   APP_KEY="${APP_KEY}" docker compose -p gaza_gateway_phase13b_protocol02 -f backend/docker-compose.identity.yml up -d
   ```
3. **Database Migrations**:
   Run schema migrations against both isolated dev and test PostgreSQL databases:
   ```bash
   docker exec gaza_gateway_phase13b_protocol02-app-1 php artisan migrate --force
   docker exec -e DB_CONNECTION=pgsql_test gaza_gateway_phase13b_protocol02-app-1 php artisan migrate --force
   ```
4. **Certificate Export & Loopback Healthcheck**:
   Export internal Caddy PKI authority certificate and verify TLS without `-k`:
   ```bash
   docker cp gaza_gateway_phase13b_protocol02-web-1:/data/caddy/pki/authorities/local/root.crt scratch/local_caddy_ca.crt
   curl --cacert scratch/local_caddy_ca.crt -fsS https://127.0.0.1:18090/api/v1/health
   ```
5. **Execute PHPUnit Test Suite**:
   ```bash
   docker exec -e DB_CONNECTION=pgsql_test -e APP_ENV=testing -e LOG_CHANNEL=stderr gaza_gateway_phase13b_protocol02-web-1 ./vendor/bin/phpunit tests/Feature/IdentityProtocol tests/Unit/IdentityProtocol
   ```
6. **Verify Policy Generator Parity**:
   ```bash
   node backend/scripts/generate-identity-protocol-policies.mjs --check
   ```
7. **Execute Live HTTPS Probe**:
   ```bash
   node backend/scripts/probe-identity-protocol.mjs
   ```
