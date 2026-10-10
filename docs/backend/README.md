# Phase 12 — Backend readiness, API and database contracts

Status: Complete / Accepted Source (owner-supplied review authorization at 7dab821d7d205b41ae925e013fe9c69a97a7e875; public cross-phase findings remain open).
Baseline: accepted Phase 11 source e1b4e3c62238357209990e80b00cc4635f621b76.
Architecture: modular Laravel 13 / PHP 8.4 API, PostgreSQL 17, paid Render web/worker/cron; existing HostPapa static frontend.

This Phase 12 specification defined future production behavior and supplied dependency-free development validators, source adapters and deterministic state models. As a design and contract milestone, Phase 12 introduced no backend runtime, DB, services, frontend cutover or production deployment (the initial isolated local backend runtime and database migrations were later established under Phase 13A local foundation). AGY delivered twelve bounded manual corrections; Codex independently reviewed and directly completed the remaining security, inventory/payment and publication contracts at Bassam's request. Phase 12 source 7dab821d7d205b41ae925e013fe9c69a97a7e875 was fast-forwarded to main under owner-supplied acceptance instructions; public Issue #1 retains five normative contract findings, as distinguished in the review disposition. Current stage: Phase 13A local backend foundation is Local Engineering Accepted / Remote Staging Gates Deferred at 91a918caf0b22e565a43f52e46cf85ca4eb4825c, independently accepted by owner-supplied ChatGPT review and fast-forwarded to main (isolated Laravel 13 / PHP 8.4 / PostgreSQL 17 infrastructure migrations and system endpoints only; frontend mock repositories remain default; no deployed backend or staging, authentication, booking persistence, payments or publication; Phase 13B identity foundations and CSRF bootstraps are implemented for review; end-to-end authentication and UI remain incomplete; Phase 13C–G remain Planned / Unstarted).

Accepted local engineering baseline: [Phase13A integration review](phase13a-review.md), with separate foundation, runtime, provider and client evidence. External staging and backend CI gates remain deferred and unmet.

Current feature-branch progress (2026-10-10): [Phase 13B reviewed foundations checkpoint](phase13b-review-checkpoint.md), [bootstrap admission correction](phase13b-bootstrap-admission.md), [corrected proof/outbox primitives](phase13b-lifecycle-primitives.md) and [independent review disposition](phase13b-review-disposition.md). Identity primitives, cookie/CSRF bootstraps and the 41-operation transport are implemented for review; end-to-end authentication/UI remains incomplete. Corrected proof/outbox primitives passed independent focused checks and are included; HTTP integration and final phase certification remain pending. Owner-authorized source advancement does not close the five normative contract findings in public Issue #1; the disposition distinguishes those records.

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

Phase 11 consolidated release a47afded49e900b75c907e7230ca4dfef5b3f91e is published on the release ref; owner live cPanel deployment remains unverified/separate. Phase 12 is Complete / Accepted Source under owner-supplied acceptance instructions at 7dab821d7d205b41ae925e013fe9c69a97a7e875 and fast-forwarded to main; public Issue #1 findings remain open. Phase 13A local backend foundation is Local Engineering Accepted / Remote Staging Gates Deferred at 91a918caf0b22e565a43f52e46cf85ca4eb4825c, independently accepted by owner-supplied ChatGPT review and fast-forwarded to main (isolated Laravel 13 / PHP 8.4 / PostgreSQL 17 infrastructure migrations and system endpoints only; frontend mock repositories remain default; typed client explicit nonproduction opt-in/noauth; original reachable staging and backend CI definition-of-done gates remain deferred under owner prohibition; no paid services, DNS, real credentials or traffic cutover). Phase 13B identity foundations and CSRF bootstraps are implemented for review; end-to-end authentication and UI remain incomplete; Phase 13C–G remain Planned / Unstarted.
