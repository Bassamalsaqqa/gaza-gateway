# Phase 13A — Frontend System API Client

Status: Local Engineering Accepted / Remote Staging Gates Deferred.
Baseline: accepted Phase 13A foundation at `91a918caf0b22e565a43f52e46cf85ca4eb4825c`; Phase 12 independently accepted at `7dab821d7d205b41ae925e013fe9c69a97a7e875` (external staging/CI gates deferred and unmet; Phase 13B authorized / preparation underway; no runtime authentication implemented yet; Phase 13C–G remain Planned / Unstarted).
Scope: isolated typed read-only health/readiness/version frontend client, narrow generated types, and fail-closed validation.

## 1. Architectural Overview & Boundaries

The System API client provides an isolated, typed, read-only interface for system probes (`GET /api/v1/health`, `/health/ready`, and `/version`) without modifying frontend mock repositories, consumer routes, or application UI.

Key architectural boundaries:
- **Default Mock Mode**: Configuration defaults to `enabled: false` (mock mode), making zero network requests and preserving existing application state invariants.
- **Explicit Non-Production Opt-In**: Live HTTP transport requires explicit opt-in (`enabled: true`, `nonProductionOptIn: true`) and is strictly rejected in production environments (`PROD: true`, `MODE: "production"`, `NODE_ENV: "production"`).
- **No Credentials / No State**: Request credentials are set to `credentials: "omit"`. The client does not accept, store, or transmit authentication headers, cookies, or tokens, and does not touch `localStorage` or `sessionStorage`.
- **Redirect Rejection**: Transport enforces `redirect: "error"` to prevent probes from following redirects to untrusted or foreign origins.
- **No Backend Edits**: Client implementation is strictly confined to frontend utilities under `src/lib/api/`.

## 2. Base URL Normalization & Origin Constraints

Base URLs are validated and normalized by `validateAndNormalizeBaseUrl()`:
- **Loopback HTTP**: Permitted exclusively on `localhost`, `127.0.0.1`, and IPv6 loopback `[::1]`.
- **Staging HTTPS**: Permitted exclusively on `https://staging-api.gazaairport.com`.
- **Accidental Production Rejection**: Production hosts (`api.gazaairport.com`, `www.gazaairport.com`, `gazaairport.com`) are rejected fail-closed with explicit configuration errors.
- **Input Sanitization**: Userinfo (`user:pass@`), query parameters (`?key=val`), and hash fragments (`#hash`) are rejected. Raw host/path/userinfo strings are never reflected into diagnostic errors.
- **Path Normalization**: Base path is normalized to end with `/api/v1` without duplicate or lost slashes. Ambiguous paths (e.g. `/api/v2`, `/foo`) are rejected.

## 3. Request Correlation & Bounded Timeout

- **Request ID Correlation**: Each request generates a UUIDv4 or accepts a UUID, transmitted via the `X-Request-Id` header. The response envelope's `meta.requestId` is validated to correlate with the request ID; correlation mismatches trigger a protocol error. Present response headers must also correlate without echoing untrusted values into errors.
- **Bounded Timeout (C1)**: The client timeout (defaulting to 10,000ms) bounds both the initial network dispatch and complete response body parsing via `Promise.race` against an active abort controller. Both factory configuration and per-request `timeoutMs` overrides are validated prior to network activity to ensure they are finite positive integers within `1..60000ms`. Invalid overrides fail closed immediately with zero dispatched HTTP calls. Shorter deadlines reliably bound hanging fetch or response streaming even if the underlying transport or stream ignores `AbortSignal`.
- **Caller Cancellation**: Supports caller-directed cancellation through `AbortSignal`, cleanly aborting in-flight requests and body reads with `kind: "abort"`.

## 4. OpenAPI Narrow Type Generation & Preflight (C3)

- **Generator Script**: `scripts/generate-system-api-types.mjs` reads `docs/backend/openapi.v1.json` and extracts the 200 schemas for `/health`, `/health/ready`, `/version`, and `ErrorResponse`.
- **Reachable-Reference Preflight**: Validates the reachable schema graph prior to emission, strictly rejecting unsupported keywords (`oneOf`, `anyOf`, `not`), `$ref` sibling assertions (e.g. `{ $ref, not: true }`), circular cycles, and unresolvable/dangling references. Any reachable component schema is traversed and emitted into `src/lib/api/system-types.ts`.
- **Strict CLI Arguments**: Unknown CLI arguments (e.g. `--chekc`) are strictly rejected with exit code 1 without mutating disk artifacts.
- **Checked-In Artifact & Stale Detection**: Generated TypeScript types reside at `src/lib/api/system-types.ts`. Running `node scripts/generate-system-api-types.mjs --check` verifies artifact parity with OpenAPI specs, exiting with code 1 if stale.

## 5. Safe Consumer Error Model (C2)

The client error model (`SystemApiError`) classifies errors into distinct kinds without leaking unbounded raw payloads, HTML pages, or sensitive sentinels:
- `configuration`: Invalid client options, production opt-in violations, or malformed/unapproved URLs.
- `network`: Low-level network or connection failures.
- `timeout`: Request or body read exceeding timeout bounds.
- `abort`: Caller cancellation via `AbortSignal`.
- `protocol`: Redirects, non-JSON Content-Type, malformed JSON, schema violation, or request ID mismatch.
- `http_error`: Canonical non-2xx HTTP responses (e.g. 503, 429), preserving safe `status`, `code`, `requestId`, and `Retry-After`.

Key safety and hygiene invariants:
- **Zero Sentinel Reflection**: Server messages, invalid header values, malformed caller IDs, invalid URL hosts/paths, and unparsed property names are strictly suppressed from error messages, stack traces, and serialized `toJSON()` output.
- **Fixed Status-Based Diagnostics**: Canonical non-2xx errors use fixed local diagnostic messages derived exclusively from HTTP status codes (e.g. "Service temporarily unavailable" for 503, "Too many requests" for 429).
- **Safe Code Grammar**: Canonical machine error codes must adhere to a strict bounded grammar (`/^[a-z0-9_-]{1,64}$/i`). Arbitrary or unapproved code strings are rejected as protocol errors.
- **Calendar RFC 3339 Validation**: Validates leap years and Gregorian calendar day bounds, plus strict capture bounds on timezone offset hours (`00..23`) and minutes (`00..59`), rejecting offsets such as `+99:99`.
- **Strict HTTP-Date Retry-After**: Parses standard IMF-fixdate HTTP-Date strings via regex and bounds integer seconds to `604800s` (seven days), ignoring invalid dates, locale strings, or negative values.

## 6. Verification & Quality Gates

The client and type generator are verified through:
- Unit tests: `node scripts/test-unit.mjs api` (60 tests across 13 suites, registered in `scripts/test-groups.mjs`).
- Contract regression: `node scripts/test-unit.mjs contracts` (192 tests across 21 suites).
- Type check: `npm run typecheck` (`tsc --noEmit`).
- Lint check: `npx eslint src/lib/api/ tests/unit/system-api-client.test.ts scripts/generate-system-api-types.mjs`.
- Type artifact integrity: `node scripts/generate-system-api-types.mjs --check`.
- Live connectivity probe: genuine harmless read-only requests to `http://127.0.0.1:18084` for `/health` and `/version`.
