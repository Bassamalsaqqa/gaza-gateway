# H2 database lease and private owner-input checkpoint

HostPapa shared-only architecture preserved: **YES**. These focused checks do not certify the full MySQL application, SMTP delivery or installer.

Source baseline: `7a90c18e999fe1a13fa442c1273c375a730be062`, with the added probe/helper files reviewed in this checkpoint. GitHub Actions remain disabled. No live hosting changes occurred.

## Executed checks

- `node --test tests/tooling/hostpapa-private-owner-input.test.mjs`: one test passed; 12 negative controls in disposable Linux PHP 8.4 storage. Rejects symlink files/ancestors, public paths, non-private permissions, oversized/malformed/non-object JSON and noncanonical paths. A private regular file is accepted. This does not test the first-admin database transaction.
- `node scratch/probe-mysql-cron.mjs .`: real disposable MySQL 8.4 and PHP 8.4; 10 assertions passed. A second PHP process cannot acquire the held Laravel DatabaseLock; an expired owner cannot remove its successor's lock; normal release permits reacquisition; a missing lock table fails closed instead of reporting overlap. No host database port was exposed.
- `node --check backend/scripts/run-mysql-cron-lease-gate.mjs` and `git diff --check`: passed.
- PHP 8.4 targeted PHPUnit filter `test_missing_deployment_cleanup_is_an_error_not_silent_success`: one test, four assertions passed. Production/staging cron now records a missing session-cleanup dependency as an error instead of silently counting the cycle healthy. The isolated runner emitted a read-only PHPUnit history-cache warning; assertions and exit status were green. No broad suite was rerun.

The checked probe is now reproducible through `node backend/scripts/run-mysql-cron-lease-gate.mjs .`, with `IDENTITY_GATE_VENDOR` pointing to the locked Composer vendor directory. The executed scratch harness preceded this promotion; only source discovery/validation and hash inventory changed. The unchanged PHP probe and lease implementation were exercised. The promoted harness was syntax-checked, not rerun.

Private evidence: `scratch/mysql-cron-probe-a0b264fb6d/receipt.json` and `cron-lease.log`. Both uniquely owned containers and their network were explicitly verified absent after cleanup. Earlier `scratch/mysql-cron-probe-16c841918d/receipt.json` preserves the failed probe autoload-path error, corrected before the successful run. That failure occurred before lease execution.

## Independent SMTP deadline correction

The returned mail worker reported 25 tests / 133 assertions on its isolated identity/test-mail schema. That report is not a joined application acceptance. Two additional Codex probes rejected its deadline helper: it used `App\Deployment\SharedHostingTimeoutException` instead of cron's timeout type, and an inner SMTP timeout erased the pending outer alarm. The rejected result is retained at `scratch/joined-mail-deadline-rejected.json`.

Codex extracted cron's timeout type into a PSR-4 class, made SMTP use that same type and invoke the original parent handler, and restored the remaining parent alarm after inner failures. The exact standalone PHP 8.4 probe then passed both scenarios, with six seconds remaining on the eight-second parent alarm. It performed no SMTP send or database access. The unchanged probe is retained as `backend/tests/SharedHostingRuntime/probe-joined-mail-deadline.php`; its Node wrapper was syntax-checked, not redundantly rerun. The helper is integrated; the full mail dispatcher package remains excluded until reviewed against the joined MySQL schema.

## Remaining gates

This proves lease semantics, not the joined cron dispatcher's command/dependency resolution or SMTP deadline behavior. The full 18-migration native conversion, joined mail gate, release installation/rollback, first-admin invitation/MFA lifecycle, and actual HostPapa end-to-end checks remain outstanding. Real mailbox delivery is still owner-verified webmail only; application SMTP is unverified.
