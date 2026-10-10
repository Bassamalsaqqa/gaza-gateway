# Phase 13B reviewed foundations checkpoint

Status: **In Progress / Awaiting Independent Review**. This is a partial engineering checkpoint, not Phase 13B acceptance or a deployable identity product.

Date: 2026-10-10. Main/base: `93ffaeb5619c6c5115512b57ebf069cbd153e60e`. Reviewed code checkpoint: `a5b7c6fba1ab8dfad872d5903541576c7f70930f`. The following documentation commit records this assessment without adding runtime functionality.

## Included in the feature branch

| Package | Implemented boundary | Evidence and limitations |
| --- | --- | --- |
| Identity core | PostgreSQL identity/session persistence, Argon2id policy, credential epochs, durable limits and exact RBAC | [Core review](phase13b-core-identity.md); real PHP/PostgreSQL checks and race probes. These are primitives, not registration/login endpoints. |
| MFA | RFC 6238 TOTP, encrypted secrets, recovery-code and replay primitives | [MFA review](phase13b-mfa-primitives.md). No complete pending/enrollment/step-up HTTP lifecycle yet. |
| Command contracts | Exact operation-bound PHP validation for 46 identity/guest/claim commands | [Command review](phase13b-command-contracts.md); 207 PHP tests and 455 PHP/Node specimens previously reviewed. Contract support does not mean every route is implemented. |
| Supporting persistence | Relational dependencies, profile/traveler storage and append-only constrained audit tables | [Persistence review](phase13b-identity-persistence.md). Booking dependency tables are inert; no booking inventory/payment workflow. |
| Directory invariant | Sentinel locking, typed mutation plans, eligible-last-admin checks and real PostgreSQL races | [Directory review](phase13b-directory-invariant.md). Full invitations/recovery and staff lifecycle coordinator remain future work. |
| Browser/server protocol | Separate cookie realms, current database guards, two CSRF bootstraps, unconditional Origin/raw-CSRF enforcement and closed operation ingress | [Protocol review](phase13b-protocol.md). Final Codex checks: 68 PHP tests/455 assertions; 6 independent tests/12 assertions; 8 strict-CA HTTPS probes plus one negative control. Encoded route aliases preserve raw command bytes. |
| Browser client | 41 typed operations, 11 aliases, actual generated-schema validation, bounded evaluation/diagnostics, per-realm transport queues and explicit nonproduction opt-in | [Client review](phase13b-identity-client.md). Final Codex checks: 76 tests/19 suites, 12 independent probes, generator check, TypeScript, focused ESLint and exact nine-file hygiene. No UI/provider cutover; default remains mock. |

Earlier bounded-package checks are recorded in their linked evidence; they were not repeated merely to publish this checkpoint. Recent client/protocol checks are independent Codex reruns after the final worker corrections. No full-suite or browser-matrix certification is claimed.

## Excluded worker handback and blocking review finding

AGY proof/outbox task `phase13b_lifecycle04_20261010`, run `run_7a1d076ca6d2480fbe5b5f8385392a83`, remains uncommitted in its isolated workspace and is **not included in this branch**. Codex independently reran its focused PHP 8.4.26/PostgreSQL 17 suite: 61 tests, 530 assertions, exit 0.

A further independent failure-injection test failed: when deletion of both the superseded capture and the newly written capture fails, the new raw proof capture remains on disk without durable retention tracking. The isolated test used synthetic material and an owned disposable directory; 1 test/1 assertion/1 failure. This is a blocker, not a passing package. Mandatory ledger enforcement, explicit owned test-root validation and fixture/process bounds also require review before acceptance. No new correction run was started when the owner requested closure.

## Remaining roadmap and acceptance gates

1. Repair and independently accept proof/outbox retention, concurrency and safe dispatch boundaries.
2. Implement passenger registration, verification, recovery, login/logout, profile/travelers, password/session lifecycle and actual post-commit worker/cleanup execution.
3. Implement staff pending MFA, enrollment, confirmation, step-up and session lifecycle, then directory/invitation/recovery using one closed transaction coordinator and race-safe last-admin enforcement.
4. Implement guest OTP grants, ownership proof and receipt security hooks without inventing Phase 13D booking workflows.
5. Integrate EN/AR identity UI behind explicit nonproduction opt-in, preserving default mock behavior and preventing local authority fallback.
6. Complete focused integrated PHP/PostgreSQL, HTTP/HTTPS cookie and browser evidence, then independent Phase 13B review.

Remote staging, real mail-provider acceptance/delivery, paid infrastructure, initial administrator custody/bootstrap, DNS and production cutover remain deferred and unmet. Local mail capture never proves provider delivery. Phase 13C–G remain Planned / Unstarted. This checkpoint must not be merged as completed Phase 13B or deployed.

## Git, CI and deployment truth

Phase 12 remains accepted at `7dab821d7d205b41ae925e013fe9c69a97a7e875`; Phase 13A local engineering remains accepted at `91a918caf0b22e565a43f52e46cf85ca4eb4825c`. Feature commits preserve ordinary linear ancestry from main; no published history rewrite.

Fresh GitHub inspection confirmed Regression and Published static package workflows are disabled, the Quality gate ruleset is disabled, and linear-history/deletion/non-fast-forward protections remain active. No Actions are intentionally triggered. Dependabot alert #1 is fixed on main (`source-map-js@1.2.2`, GHSA-68fv-2mgg-jv7q; fixed_at 2026-10-09T20:04:35Z); it was not dismissed.

The Phase 8–11 HostPapa release remains `a47afded49e900b75c907e7230ca4dfef5b3f91e`, source `e1b4e3c62238357209990e80b00cc4635f621b76`. Live cPanel deployment remains unverified and owner-managed. No Render provisioning, DNS changes, paid services, real credentials, deployment, main merge or Phase 13C work occurred.
