# Phase 13A local foundation review

Status: Local Engineering Accepted / Remote Staging Gates Deferred at `91a918caf0b22e565a43f52e46cf85ca4eb4825c`, independently accepted by owner-supplied ChatGPT review. Main was fast-forwarded and pushed without rewriting history. External staging and backend CI gates remain deferred and unmet. Phase 13B identity is authorized / preparation underway; no runtime authentication implemented yet; Phase 13C–G remain Planned / Unstarted.

The original Phase 13A reachable staging and backend CI definition-of-done gates remain deferred and unmet under current owner policy. Local proof does not satisfy remote gates. No paid services, DNS, real provider credentials, customer data or traffic cutover were introduced. Automatic GitHub Actions remain disabled.

## Architecture and boundaries

The accepted Phase 12 stack remains modular Laravel 13 / PHP 8.4 / PostgreSQL 17 in `backend/`, with the existing static frontend on HostPapa. The immutable runtime uses digest-pinned FrankenPHP in classic request mode, separate web/queue processes and a one-shot migrator. No Octane, persistent application request state, Redis or additional database authority is introduced.

Only cache/queue infrastructure migrations and three system GET endpoints are implemented. UTC is the application timezone; generated request IDs are UUIDv4, accepted correlation values must be valid UUIDs. Domain identity codecs and transactions remain governed by the accepted Phase 12 contracts and are not implemented prematurely. Destructive migrations are restricted to the disposable testing database. Production changes use additive migrations with a separate DDL role; runtime credentials receive DML privileges only.

The frontend remains on its accepted mock repositories. The isolated typed client defaults to disabled and makes only read-only health/readiness/version requests after explicit known nonproduction opt-in. Credentials are omitted. No UI consumer or route has been cut over. Authentication placeholders consist of these explicit boundaries; no tokens or identity handlers are implemented.

Mail and private storage interfaces have honest local adapters for local/testing. Mail is captured locally, not delivered. Private storage uses opaque keys, bounded payloads, private permissions and atomic publication. Deployment profiles bind unconfigured adapters that fail closed. Real provider selection/configuration is an owner-gated later step.

## Requirement evidence

| Requirement | Implementation and evidence |
| --- | --- |
| Locked local PHP/PostgreSQL skeleton, migration/cache/queue lifecycle | [Foundation01 historical checkpoint](phase13a-foundation.md), `backend/docker-compose.yml`, two infrastructure migrations and PHPUnit feature tests |
| Fail-closed configuration, host/CORS/header/error/request correlation and safe structured logs | `backend/app/Support/`, `backend/app/Http/`, environment configuration and feature negative probes |
| Immutable web/worker image, least privilege, bounded database faults, reproducible deployment-profile simulation | [Runtime candidate](phase13a-runtime.md), `Dockerfile.production`, scoped loopback-only runtime Compose and runtime scripts |
| Mail and private storage abstraction | [Provider seams](phase13a-provider-seams.md), PHP unit tests and independent nonroot atomic read/write/no-clobber probes |
| Harmless typed frontend requests with default mock behavior | [System client](phase13a-system-client.md), narrow generated types, sixty focused tests and live local health/version requests |
| Phase 12 contracts retained | `node scripts/validate-backend-contracts.mjs` and no accepted contract edits |
| Historical frontend/static provenance retained | Five `network-status` tests across fourteen living documents; unchanged UI/routes/repository consumers |
| Reachable remote staging, TLS/proxy verification, backend CI | Deferred and unmet: owner prohibits provisioning and automatic Actions; local simulation is not a substitute |

## Review and QA

Foundation01 was locally reviewed at `92b7eb45beab11f701619640b5b5bd5f73d21a5d`, parent `60415d171d278b55ac4bb78e0d0f21bc2a23321d` (isolated source-map-js 1.2.2 security patch), parent `3dda29cc94503725762e8a317900420a4f99fc1f` (accepted Phase 12 status), parent `7dab821d7d205b41ae925e013fe9c69a97a7e875` (independently accepted Phase 12). No published history is rewritten.

AGY supplied bounded implementation/correction handbacks. Codex reviewed actual source and evidence independently. The original Foundation01 version outage exceeded eight seconds and remains recorded as a failed probe. A runtime verifier that ignored schema results was rejected; its earlier schema-pass claims are not accepted evidence. Final runtime acceptance requires repaired negative gates and fresh HTTP validation.

Independent provider review passed 65 tests / 198 assertions and 239 complete concurrent reads with no-clobber preservation. Client review passed 60 tests, eight adversarial reviewer probes, type/lint/artifact checks, and two actual local responses against accepted OpenAPI. The final integrated PHP suite passed **118 tests / 370 assertions** against the disposable PostgreSQL test database: 65 provider unit tests and 53 feature tests, including the 14 new timeout cases. It ran as a nonroot user with PHP 8.4.26 and PHPUnit 13.4.1. The worker's 39-test older-checkout result is historical, not substituted for this result.

The integrated immutable image built successfully as local image `sha256:68cd1d59fc2bba4c8e5dfd3be97c89021f728f429bcb6b4053835a26fef2513c`. Eleven fresh live HTTP captures passed actual method/path/status schema validation, security-header checks and correlation. Six deliberately invalid verifier subprocess cases exited 1; the intact positive case exited 0. Startup missing-key/invalid-role/invalid-port checks failed safely without reflecting sentinels. The image runs as UID33, omits `.env`, tests, PHPUnit and scratch evidence, keeps application code nonwritable and only designated runtime paths writable.

Real integrated-image fault measurements: stopped PostgreSQL retained liveness200 (14ms), readiness503 (13ms), version503 (16ms), then recovered readiness200. The actual configured PDO timeout produced a genuine TCP timeout at3.003s; PostgreSQL cancelled `pg_sleep(5)` with SQLSTATE57014 at3.014s. Final cleanup verified readiness200 before declaring PASS. Connection and query timing evidence is distinct from HTTP outage evidence.

Final Node gates passed: API60/60, historical-status5/5, generated types `--check`, TypeScript, focused ESLint, complete test inventory and the accepted contract validator (138operations /131paths /1154references). Composer manifest strict validation and all actual platform requirements passed. Whitespace and the entire feature diff are reviewed; no full frontend suite or browser matrix was unnecessarily rerun by Codex.

No associated Phase 13A PR existed at the 2026-10-09 review checkpoint; there were no PR reviews, inline comments, unresolved threads or review submissions to reconcile. The Regression and Published static package workflows and required quality-gate rule are disabled; history protections and security scanning remain preserved. Do not enable automatic Actions.

The Phase 8–11 HostPapa release remains `a47afded49e900b75c907e7230ca4dfef5b3f91e`, from source `e1b4e3c62238357209990e80b00cc4635f621b76`. Live cPanel deployment remains unverified and owner-managed. Feature-branch publication does not deploy either frontend or backend.

ChatGPT independent review accepted Phase 13A local engineering foundation at `91a918caf0b22e565a43f52e46cf85ca4eb4825c`. Main was fast-forwarded and pushed without rewriting history. Phase 13B identity is authorized / preparation underway; no deployment or Actions allowed; external staging and backend CI gates remain deferred and unmet; no runtime authentication implemented yet; Phase 13C–G remain Planned / Unstarted.

Clean integrated-image bootstrap also passed on a new isolated loopback stack: PostgreSQL 17 TLS, two fresh migrations as `gza_migrator`, runtime `gza_runtime` DML with CREATE denied (SQLSTATE42501), cache roundtrip, actual worker queue completion, deployment mail/storage bindings unconfigured, natural stopped-worker heartbeat expiry/readiness503 and restarted-worker readiness200. Only the owned scratch stack was removed; the original local proof stacks and Docker daemon remain running. An additional direct probe required the exact queue `completed` receipt. Composer audit of the locked PHP dependencies reported no advisories.

Codex final runtime repairs removed the job-consuming one-second startup preflight, used cryptographic disposable keys, pinned probe origins/projects, rejected invalid CLI arguments and existing evidence directories, enforced a valid integer Retry-After and safe diagnostic output. These refinements are included in the reviewed source; no new service scope or architecture decision was introduced.

Dependency note: Dependabot alert 1 (source-map-js < 1.2.2) is FIXED at 2026-10-09T20:04:35Z after locked source-map-js 1.2.2 reached main. The affected transitive dependency is used by Tailwind/PostCSS build tooling; the static HostPapa package has no Node runtime. GitHub classifies its dependency scope as runtime in the lockfile. No unrelated dependencies were upgraded.
