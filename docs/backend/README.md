# Phase 12 — Backend readiness, API and database contracts

Status: Design complete / awaiting independent GitHub review.
Baseline: accepted Phase 11 source e1b4e3c62238357209990e80b00cc4635f621b76.
Architecture: modular Laravel 13 / PHP 8.4 API, PostgreSQL 17, paid Render web/worker/cron; existing HostPapa static frontend.

This phase specifies future production behavior and supplies dependency-free development validators, source adapters and deterministic state models. It introduces no backend runtime, DB, services, frontend cutover or production deployment. AGY delivered twelve bounded manual corrections; Codex independently reviewed and directly completed the remaining security, inventory/payment and publication contracts at Bassam's request. Worker handback reports are historical evidence, not final acceptance.

## Requirement-to-artifact map

| Requirement                                           | Authoritative artifacts                                                           | Focused evidence                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Hosting alternatives and stack                        | ADR-001-platform.md; deployment-topology.md                                       | Primary-source feasibility, twelve dimensions, explicit owner/production gates                                  |
| Relational identity and security lifecycle            | identity-lifecycle.v1.json; auth-rbac.md                                          | Closed architectural policy, direct/composite FKs, maintained replay/epoch/MFA/sentinel models                  |
| Aviation/commercial/booking/CMS/archive/contact/audit | data-model.md; openapi.v1.json                                                    | Authentic source fixtures and 25 real in-memory mutation/receipt families                                       |
| Exact server authorization                            | operation-policies.v1.json; per-operation x-protocol and x-authorization-branches | All security schemes/alternatives, owner/action predicates, permissions, Origin/CSRF and recent step-up         |
| Inventory and payment integrity                       | inventory-payment.v1.json                                                         | Global claims, one booking/hold, multi-leg locks, expiry/shrink, scoped idempotency and late-refund state tests |
| Immutable publication and environment isolation       | publication-lifecycle.v1.json; deployment-topology.md                             | Exact snapshot/build/deployment/activation/rollback operations and pin/hash/CAS tests                           |
| Browser-local migration                               | migration-map.md                                                                  | Seventeen genuine storage authorities; consent, backup/quarantine, zero prototype credentials/audit             |
| Security and implementation gates                     | threat-model.md; phase13-sequencing.md                                            | Required negative HTTP/concurrent DB/provider/restore tests before cutover                                      |

Machine API: OpenAPI 3.1.0, 138 operations across 131 paths, fourteen Phase 13A–G tags. All JSON success envelopes have success const true, data and meta, except the two explicitly pinned raw CSRF bootstraps. ErrorResponse has success const false. command schemas reject undeclared properties. Read api-contract.md for the complete operation index.

## Authority and compatibility

The OpenAPI defines wire shapes. Named development adapters preserve source types and real mutation receipts for fleet/network/schedules, commercial, passenger, settings, CMS, archive and contact. Backend-specific identity, checkout, publication and payment contracts are designed extensions, not claims that the mock frontend already implements them.

Architectural policy modules are authored independently of the API under test. Closed manifests are compared against them; fixture copies record the chosen design. The validator is a bounded JSON Schema 2020-12 subset with fail-closed rejection of unsupported assertions/containers. It is not a general OpenAPI certification tool. Unicode schema lengths count code points; the existing dated-service codec separately uses JavaScript's 160 UTF-16-unit schedule-ID bound. Exact whitespace/case/Unicode IDs and 0=Sunday..6=Saturday are preserved.

Source evidence includes all 67 archive records, 13 source records, eight CMS documents, genuine network/fleet/schedule/commercial seeds, real in-memory commercial/passenger/settings/CMS/contact mutations, no-op receipts, and receipt-family tampering. Archive intake defaults hold-provenance and source archival_status NULL. Existing owner-directed display basis remains intact, with uncertainty/illustration labels; no evidence or rights upgrade is invented.

Development state tests demonstrate sequential outcomes and negative context/replay checks. They do not prove deployed middleware, cryptographic implementation, actual mail, live Postgres contention, merchant suitability or recovery targets.

## Focused QA

Run from the repository/worktree root with the existing Node 24 toolchain:

    node scripts/validate-backend-contracts.mjs
    node scripts/test-unit.mjs contracts
    node scripts/test-unit.mjs --list
    npx eslint --no-ignore scripts/lib/backend-*.mjs scripts/validate-backend-contracts.mjs tests/unit/backend-contracts.test.ts tests/unit/backend-identity-contracts.test.ts tests/unit/backend-foundation-contracts.test.ts
    npm run typecheck
    git diff --check

No browser/full-suite reruns are required for these documentation and development-tool changes. Final measured results are recorded in phase12-review.md.

## Remaining external decisions

Before Phase 13 provisioning/production: owner approval of paid-service budget and region/residency; real mail/storage credentials; merchant/provider onboarding; DNS and measured proxy chain; offline first-admin bootstrap; legal PII/audit retention; measured backups/restore; irreversible migration/cutover acceptance. These are future external gates, not missing Phase 12 design artifacts.

Phase 11 consolidated release a47afded49e900b75c907e7230ca4dfef5b3f91e is published on the release ref; owner live cPanel deployment remains unverified/separate. Stop after the Phase 12 feature branch is pushed for manual ChatGPT independent GitHub review. Do not merge, deploy or begin Phase 13 without acceptance.
