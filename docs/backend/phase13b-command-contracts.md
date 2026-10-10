# Phase 13B Identity Command Contracts & Schema Validation

## Overview

The `App\Identity\Contracts` package provides pure, fail-closed PHP command validation for the exact accepted identity HTTP operations defined in the authoritative OpenAPI 3.1 specification (`docs/backend/openapi.v1.json`).

This package is bounded and independent:
- It validates HTTP command request bodies and parameters against accepted schemas.
- It is **not** an authentication service, session manager, credential verifier, or HTTP routing layer.
- It contains **no** dependencies on Node.js, external network resources, database connections, or mutable filesystem paths at runtime.
- The compiled schema artifact is packaged directly within `backend/app/Identity/Contracts/identity-command-contracts.v1.json` and copied into production Docker images as part of the immutable application source.

---

## Accepted Scope: 41 Identity Operations

The package selects every accepted operation in `docs/backend/openapi.v1.json` whose path starts with `/auth/` or `/staff/`. There are exactly **41 operations** across **26 paths**:

| Operation ID | Method | Path | Request Body | Parameters |
|---|---|---|---|---|
| `getAuthCsrfBootstrap` | GET | `/auth/csrf` | None (bodyless) | None |
| `postPassengerRegister` | POST | `/auth/register` | `RegisterRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postPassengerLogin` | POST | `/auth/login` | `LoginRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postPassengerLogout` | POST | `/auth/logout` | None (bodyless) | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postPassengerPasswordForgot` | POST | `/auth/password/forgot` | `PasswordForgotRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postPassengerPasswordReset` | POST | `/auth/password/reset` | `PasswordResetRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postPassengerEmailVerify` | POST | `/auth/email/verify` | `EmailVerifyRequest` | `X-Request-Id` |
| `getPassengerProfile` | GET | `/auth/passenger/profile` | None (bodyless) | `X-Request-Id` |
| `putPassengerProfile` | PUT | `/auth/passenger/profile` | `UpdatePassengerProfileRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `getSavedTravelers` | GET | `/auth/passenger/travelers` | None (bodyless) | `X-Request-Id` |
| `postSavedTraveler` | POST | `/auth/passenger/travelers` | `CreateTravelerRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `deleteSavedTraveler` | DELETE | `/auth/passenger/travelers/{id}` | None (bodyless) | `id` (path, string), `X-Request-Id`, `X-CSRF-TOKEN` |
| `patchSavedTraveler` | PATCH | `/auth/passenger/travelers/{id}` | `PatchTravelerRequest` | `id` (path, string), `X-Request-Id`, `X-CSRF-TOKEN` |
| `getStaffCsrfBootstrap` | GET | `/staff/csrf` | None (bodyless) | None |
| `postStaffLogin` | POST | `/staff/login` | `StaffLoginRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffLogout` | POST | `/staff/logout` | None (bodyless) | `X-Request-Id`, `X-CSRF-TOKEN` |
| `getStaffMe` | GET | `/staff/me` | None (bodyless) | `X-Request-Id` |
| `postStaffMfaSetup` | POST | `/staff/mfa/setup` | None (bodyless) | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffMfaChallenge` | POST | `/staff/mfa/challenge` | `StaffMfaChallengeRequest` | `X-Request-Id` |
| `postStaffMfaVerify` | POST | `/staff/mfa/verify` | `StaffMfaVerifyRequest` | `X-Request-Id` |
| `getStaffSessions` | GET | `/staff/sessions` | None (bodyless) | `X-Request-Id` |
| `deleteStaffSession` | DELETE | `/staff/sessions/{id}` | None (bodyless) | `id` (path, string), `X-Request-Id`, `X-CSRF-TOKEN` |
| `getStaffUsersDirectory` | GET | `/staff/users` | None (bodyless) | `X-Request-Id` |
| `postStaffUserInvite` | POST | `/staff/users` | `CreateStaffUserRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `patchStaffUser` | PATCH | `/staff/users/{id}` | `PatchStaffUserRequest` | `id` (path, UUID), `X-Request-Id`, `X-CSRF-TOKEN` |
| `deleteStaffUser` | DELETE | `/staff/users/{id}` | None (bodyless) | `id` (path, UUID), `X-Request-Id`, `X-CSRF-TOKEN` |
| `postPassengerEmailResend` | POST | `/auth/email/resend` | `PassengerEmailResendRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `getPassengerSessions` | GET | `/auth/passenger/sessions` | None (bodyless) | `X-Request-Id` |
| `deletePassengerSession` | DELETE | `/auth/passenger/sessions/{id}` | None (bodyless) | `id` (path, UUID), `X-Request-Id`, `X-CSRF-TOKEN` |
| `putPassengerPassword` | PUT | `/auth/passenger/password` | `PassengerPasswordChangeRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffMfaEnrollmentSetup` | POST | `/staff/mfa/enrollment/setup` | None (bodyless) | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffMfaEnrollmentConfirm` | POST | `/staff/mfa/enrollment/confirm` | `StaffMfaEnrollmentConfirmRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffStepUp` | POST | `/staff/step-up` | `StaffStepUpRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffMfaSetupConfirm` | POST | `/staff/mfa/setup/confirm` | `StaffMfaSetupConfirmRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffMfaRecoveryCodesRegenerate` | POST | `/staff/mfa/recovery-codes/regenerate` | None (bodyless) | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffPasswordForgot` | POST | `/staff/password/forgot` | `StaffPasswordForgotRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffPasswordReset` | POST | `/staff/password/reset` | `StaffPasswordResetRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `putStaffPassword` | PUT | `/staff/password` | `StaffPasswordChangeRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffInvitationAccept` | POST | `/staff/invitations/accept` | `StaffInvitationAcceptRequest` | `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffUserInviteReissue` | POST | `/staff/users/{id}/invite/reissue` | None (bodyless) | `id` (path, string), `X-Request-Id`, `X-CSRF-TOKEN` |
| `postStaffUserInviteRevoke` | POST | `/staff/users/{id}/invite/revoke` | None (bodyless) | `id` (path, string), `X-Request-Id`, `X-CSRF-TOKEN` |

---

## Architectural & Security Invariants

### 1. Fail-Closed Schema Preflight & Dialect Support
- Supported assertion keywords: `type`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`, `uniqueItems`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `format`, `enum`, `const`, `oneOf`, `anyOf`, `allOf`, `not`, `$ref`.
- Informational keywords tolerated: `$schema`, `$id`, `$comment`, `title`, `description`, `default`, `example`, `examples`, `deprecated`, `readOnly`, `writeOnly`.
- **Full recursive preflight**: Preflights every branch of `not`, `items`, `additionalProperties`, `properties`, combinators, and `$ref`.
- **Keyword shape enforcement**: Presence verified via `array_key_exists` (never `isset` null omission).
- **Bounds enforcement**: Finite numeric bounds, positive `multipleOf > 0`, non-negative integer item/length bounds, boolean `uniqueItems`, and unique `type`/`required`/`enum` arrays. Array-form items tuples (`items: [...]`) are strictly rejected.
- **Boolean schema nodes**: Supported coherently per JSON Schema 2020-12 (`true` accepts, `false` rejects, `not: true` fails, `not: false` passes).
- **Public `evaluateSchema()` guard**: Public entry point preflights arbitrary schemas fail-closed before evaluation.

### 2. Transport Boundary & Parameter Preserving
- Command parameters arrive already decoded by the transport layer / HTTP router.
- The validator performs **no secondary URL decoding** (`urldecode()` removed), preserving exact opaque identifiers such as `trv+name`, literal `%2F`, and Unicode opaque IDs.
- Parameter types and formats strictly enforced without coercion:
  - `deleteSavedTraveler` and `patchSavedTraveler` parameter `id` is an opaque string (`type: string` without format). The validator never coerces or expects UUID for opaque traveler IDs.
  - `patchStaffUser`, `deleteStaffUser`, and `deletePassengerSession` require `format: uuid`. Non-UUID strings fail with `INVALID_FORMAT`.

### 3. Bodyless & Optional Body Semantics
- **Bodyless operations**: Empty or whitespace-only bodies are accepted; unexpected JSON bodies (including `{}` and `[]`) fail with `UNEXPECTED_BODY`. Oversized whitespace (> 1 MiB) is rejected with `PAYLOAD_TOO_LARGE` at entry before trim.
- **Required bodies**: Missing or empty strings fail with `BODY_REQUIRED`. Explicit JSON `null` is supplied to schema evaluation and fails with `INVALID_TYPE` against object schemas.
- **Optional bodies**: Absent body passes; explicit JSON `null` is validated against schema.
- **Property null vs absent**: Every present property (including explicit `null`) is evaluated against its declared property schema. `required` strictly checks presence (`array_key_exists`) and never treats present nullable values as missing.
- **Missing schema protection**: Operations declaring `hasBody: true` must specify a non-null `requestBodySchema` or fail closed. Parameter schemas are strictly required and non-null (no silent defaults).

### 4. Input Complexity & Resource Limits
- Raw JSON byte limit: 1 MiB (`MAX_RAW_BYTES = 1048576`), checked at entry of `validateJson` before `trim()`, UTF-8 validation, or decoding.
- Aggregate payload and parameter byte budget: 1 MiB (`MAX_RAW_BYTES = 1048576`), accumulated across all string keys and string values across decoded payload and parameters combined in a single shared traversal without copying or stringifying.
- JSON instance safety before schema evaluation: rejects non-finite scalars (`INF`, `NAN`), PHP resources, non-`stdClass` objects, non-UTF-8 strings/keys, and cyclic graphs before evaluation under boolean `true`, empty schema `{}`, or arbitrary schema trees.
- JSON decode depth limit: 32 (`MAX_DECODE_DEPTH = 32`).
- Mixed input complexity depth limit: 32.
- Input node count ceiling: 2000 nodes (`MAX_INPUT_NODES = 2000`) across payload and parameters.
- Work budget & terminal exhaustion: 2000 evaluation steps (`MAX_WORK_STEPS = 2000`) and max evaluation depth 50 (`MAX_EVALUATION_DEPTH = 50`). Work budget or depth exhaustion is a global terminal validation failure that cannot be swallowed or inverted by `not`, `anyOf`, `oneOf`, `$ref`, or skipped loops; all entrypoints convert exhaustion to a single fixed safe violation (`MAX_DEPTH_EXCEEDED`).
- Uniqueness comparison budget: `hasUniqueItems` charges work steps per pair comparison to prevent quadratic loop runaway.
- Maximum violations reported: 50 (`MAX_VIOLATIONS = 50`).

### 5. Safe Error Model (Privacy & Information Hiding)
- Contains only authentic declared field paths and fixed local violation codes.
- Never contains raw input values, unknown property names, passwords, tokens, proofs, documents, or email addresses.
- When `additionalProperties: false` is violated, the error path is the container path (`""` for root), and the injected key name is never echoed.
- When `additionalProperties` has a schema, violations report `additionalProperties` as the path, never leaking arbitrary unknown input keys.
- Closed registry configuration and schema preflight errors use fixed safe messages without echoing arbitrary operation keys, paths, schemas, digests, types, formats, or regex sentinels.

### 6. Mathematical Integers & Number Semantics
- Integers evaluated per JSON Schema: any finite number with no fractional part is accepted as `integer` (native `1.0` matches `integer`).
- Non-finite numbers (`INF`, `NAN`) are strictly rejected from `number` and `integer`.
- Deep equality distinguishes objects from arrays, respects property order independence on objects, and treats mathematically equal finite numbers as equal (`1 == 1.0`).

---

## Generator & Parity Verification

1. **Artifact Generation**:
   `node backend/scripts/generate-identity-command-contracts.mjs`
   Reads `docs/backend/openapi.v1.json`, produces `backend/app/Identity/Contracts/identity-command-contracts.v1.json` with deterministic LF line endings and canonical SHA-256 schema digest (`sha256:d9f531bbc40e8d7908e0ea4feb730ec93ca4a530df21a3a2ed428ce9f28bd852`).
   `node backend/scripts/generate-identity-command-contracts.mjs --check` exits non-zero if the artifact is missing, stale, or tampered.

2. **Cross-Language Parity Harness & Isolated Corruption Probes**:
   `node backend/scripts/verify-identity-command-contracts.mjs`
   - Evaluates 358 test specimens (89 static + 269 dynamic) covering all 41 accepted operations and all 22 command request schemas across both PHP (via `backend/scripts/probe-identity-command-validation.php`) and Node (`scripts/lib/backend-contract-validation.mjs`), confirming 100% agreement.
   - Dynamically evaluates every declared property with null values, type mismatches, required property deletions, and optional property omissions across both runtimes.
   - Executes 12 isolated subprocess corruption probes testing missing artifact, stale artifact, changed bound, changed ref sibling, changed format, duplicate required keys, duplicate enum items, invalid additionalProperties shape, array-form items tuple, `type: null`, `not: { minProperties: 1 }`, and `multipleOf: -1`. All 12 probes fail closed with non-zero exit codes.

3. **PHPUnit Test Suite**:
   Runs under PHPUnit 13.4.1 and PHP 8.4.26 inside Docker (`gaza-gateway-backend:phase13a`) with `--network none`:
   `vendor/bin/phpunit --configuration phpunit.xml --do-not-record-test-run-history --fail-on-phpunit-deprecation tests/Unit/IdentityCommands`
   Result: **141 tests, 591 assertions, 0 failures, 0 deprecations**.

## Independent package review

Codex independently ran 141 PHP tests / 591 assertions, six targeted positive/negative probes, the generator check, focused lint and 358 dual-runtime specimens with 12 corruption controls. The portable parity script is retained under backend/scripts; it uses this checkout's locked backend/vendor by default, with IDENTITY_CONTRACT_VENDOR_PATH available for a reviewed read-only vendor tree. Docker access is required, and runtime validation itself has no Node/Docker dependency. This bounded package does not implement authentication or HTTP middleware. Shared input limits apply to direct payload plus parameters; the raw JSON path first bounds raw bytes plus parameters, then separately validates the decoded instance safety and structural limits. The raw encoding conservatively bounds decoded content.
