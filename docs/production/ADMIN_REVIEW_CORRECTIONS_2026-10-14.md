# Admin review corrections — owner decisions

Continuation of PR #7 and PR #8 at parent `861662c5c079c8879d4625e2472604b425da9f8b`. The owner's five decisions supersede the original customer-directory permission and invitation completion copy. This is source-only work: no merge, deployment ZIP, live data write, migration, Actions or provider change.

## Scope

1. Full customer directory requires `admin.manage` in the actual route, active MVP API contract, query enablement, denied view and navigation. General `commercial.view` still permits appropriate booking reads, not the account-wide directory. Editor/viewer, anonymous and passenger requests must remain denied.
2. Invitation completion offers Continue to Admin only when refreshed staff context establishes a full authenticated session. If session refresh cannot establish authority, preserve an honest sign-in recovery path. Never bypass enrolled MFA or invent an authenticated UI state from a successful mutation alone.
3. Activity presentation localizes known domains/actions/outcomes, has a safe unknown-event fallback and formats timestamps for EN/AR with a visible timezone. Stored identifiers, server UTC instants and append-only audit history remain unchanged.
4. New staff emails use Gaza Gateway / Gaza International Airport branding and separate English and Arabic action URLs containing the same proof. Approved origins, fragment-only tokens, encrypted outbox, expiry and replay protection remain unchanged. Actual received HostPapa mail remains a post-release owner check; no local payload test certifies delivery.
5. Measure the actual nine-source MySQL query before considering optimization.

## Actual MySQL measurement

Command: `MYSQL_MVP_TEST_FILTER='test_live_admin_customers|test_live_admin_read_permissions|test_live_admin_activity' node backend/scripts/run-mysql-mvp-gate.mjs` (PowerShell uses `$env:MYSQL_MVP_TEST_FILTER=...`). Result: 4 tests / 38 assertions PASS, disposable MySQL 8.4. Evidence: `scratch/receipt-mysql-mvp-gate-1791984759770-mysql_mvp_dd6eb970560e.json`, JUnit and `phpunit-mvp-suites.log` in `scratch/mysql_mvp_dd6eb970560e/`. Owned disposable resources were cleaned.

The measurement adds 20,000 synthetic identity audits, giving 20,001 total events. This is deliberately a busy-identity workload: the other eight union sources are empty in this measurement. It executes the genuine route and records both actual SQL statements plus `EXPLAIN ANALYZE`; it is not a balanced nine-domain production load test.

| Page | Endpoint elapsed | COUNT SQL | Page SQL |
| --- | --- | --- | --- |
| 1 | 49.12 ms | 15.32 ms | 17.46 ms |
| 10 | 48.70 ms | 13.69 ms | 18.82 ms |

Plans show union materialization/table scans and a bounded top-N sort (25 on page 1, 250 before offset on page 10). Cost grows with event count; deep offsets and larger datasets may warrant a later measurement. These local observations do not demonstrate a current expensive query, so runtime SQL and indexes are deliberately unchanged. HostPapa production latency and concurrency are not certified by this run. Do not insert measurement fixtures on the live database.

## Staff mail evidence

Command filter: `test_staff_access_outbox_contains_clickable`. Result: 1 real-MySQL test / 16 assertions PASS. Receipt: `scratch/receipt-mysql-mvp-gate-1791984839901-mysql_mvp_fdfed93fea93.json`. The actual encrypted outbox message contains EN/AR links and approved branding, with one proof and no query token or plaintext proof in stored ciphertext. No actual SMTP send was performed.

## Focused UI evidence and worker outcome

- `node --test --experimental-strip-types tests/unit/admin-activity-presentation.test.ts`: 3 tests PASS, covering real action/domain labels, EN/AR fallback safety (including prototype keys), explicit international timezone/DST formatting and invalid timestamps.
- `node tests/mvp/staff-access-ui.mjs --invitation-only`: 4 checks PASS across EN/AR. Confirmed staff context exposes Continue to Admin; a denied profile refresh exposes no such action and offers honest sign-in recovery. Receipt: `scratch/staff-invitation-correction-evidence/receipt.json`.
- `node tests/mvp/staff-access-ui.mjs --admin-review-only`: 4 checks PASS across EN/AR. The actual frontend renders localized activity and formatted instants; viewers receive the permission notice without making any customer-directory request. Receipt/screenshots: `scratch/admin-review-ui-evidence/`. Arabic activity screenshot inspected visually. Browser API responses are synthetic; actual route authorization is covered by the separate MySQL tests.
- `npm run typecheck`, focused ESLint on changed frontend/test files, registered test inventory and Git whitespace checks PASS. No unaffected broad suite reruns or new production package build.
- AGY CLI authentication/model discovery succeeded. A bounded frontend-only assignment ran headless in the detached `scratch/agy-admin-review-ui` worktree at the parent SHA. Its ten-minute print deadline expired without changed files or a final report. Receipt: `scratch/agy-admin-review-ui-result/result.json`. No worker output was accepted; Codex implemented and reviewed the remaining UI directly. Neither worker nor Codex deployed or rewrote published history.

Receipts concern the proposed working-tree source at the parent SHA, with retained file hashes where recorded; these are not clean-checkout gates at the later publication commit. The previous staff-package evidence and failed attempts remain intact.

## Review disposition

Preserve historical reports and all reviewer dispositions. Corrections may be referenced by a new ordinary commit and request reviewer confirmation; do not resolve reviewer threads or describe source-corrected findings as independently accepted. PR #6 remains separate, and main/live/legacy static branch remain unchanged. Retained earlier failing evidence is not erased or re-labelled.

The original PR #7 report's `commercial.view` customer permission is historical and is superseded by this correction and the active MVP contract. These corrections are carried together in the PR #8 descendant; do not deploy PR #7 alone as though its findings were independently fixed there.
