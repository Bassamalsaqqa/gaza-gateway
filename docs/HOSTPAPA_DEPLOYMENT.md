# HostPapa full-stack update runbook

## Installed baseline ? re-read 23 October 2026

| Pin | Verified value |
| --- | --- |
| Application | `0aacf1452d47bbf5660f060a718409dfff32a54c` |
| Active release | `rel_20261021T164700_0aacf14_clean` |
| Release manifest SHA-256 | `efb2e5378fe3403715f2f6d10ea8c4493a5c177bcd916b8d7dccfac4dd88c800` |
| Migration identities | 25 in retained exact manifest and October 22 live ledger |
| Verified completion | 2026-10-22T07:43:08Z; `FORWARD_COMPLETION_VERIFIED` |
| Private application | `/home/gaza5045/gaza-gateway` |
| Pointer | `/home/gaza5045/gaza-gateway/current-release.txt` |
| Public root | `/home/gaza5045/public_html` |
| Source main at mission start | `6f52044b88e56b005bf11ee96b274580fd6d8a11` (licensing-only successor) |

The pointer and manifest bytes were downloaded read-only through cPanel on October 23 and match the October 22 genuine recovery receipt. The October 23 readiness endpoint reports database connected, migrations up to date and queue healthy; this does not replace an exact live ledger read before the next release. Do not equate Git main with installed source. Preserve all private backups, shared configuration and original incident evidence.

HostPapa shared cPanel remains the sole production target: prebuilt React/Vite, Laravel 13/PHP 8.4+, MySQL/InnoDB, SMTP, private files and the existing bounded dispatcher. No production Node/Docker daemon, external backend, Actions or static-only `hostpapa-deploy` branch.

## Batch 02 recovery record and next-release stop condition

The original owner-authorized upgrade applied migration UP, then its fixed 390-second alarm stopped execution before activation. Its failure evidence and attempt markers were retained. A separate one-shot guarded forward completion verified the immutable package, backups, staged release, exact ledger, file permissions, and 82 original durable tables against the retained SQL backup before and after activation. Shared environment bytes matched the retained private backup. Maintenance was removed only after verification, and the owned cron lease was released. Never manufacture an original-run success receipt or clear the failed markers.

The production-derived `routes` view adds four routes for Oslo/Stockholm. Recovery verified complete approved route values, normalized only unspecified inbound array tie ordering, and checked snapshot JSON/bytes/hash consistency. The historical PR22 helper omitted derived routes; its 390-second deadline and exit-based failure receipt also need correction before reuse. **PR22 `173e51a` remains separate operator provenance; do not blindly merge it or rerun its 23-migration baseline.** The next upgrade needs an independently reviewed `0aacf14`/25 baseline profile.

Retained production evidence (private, never copy credentials/backups to Git or AGY):

- `/home/gaza5045/gaza-batch02-preflight-20261022/forward-completion-receipt.json` and original `deployment-*`/`recovery-audit*` records.
- `/home/gaza5045/gaza-gateway/shared/backups/upgrade_20261022_045504_a8a94f57/` contains the SQL, public/private archives and receipt.
- Kit ZIP SHA-256 `c770dbb40591629db7340285c766ef66cee7a5aaa3b965a3cdb0c0b02ca2c292`; runner `2c59bac19faf8a4512cb81b242578aaffd3ce921a59ec3db817488418d99682a`.
- Package root `.htaccess` SHA-256 `2dba81e95cc03e9b4e47cddda07e50f1e6230251bba59690e38a965e42b10e4f`. Separately owner-approved `LimitRequestBody 41943040` override produces `21724477d484edc2fa517c44b2e09b3ae752c9bd9b26b2389ba58102a586a486`. Actual pre-upgrade loopback checks observed HTTP 413 above the bound and accepted a 35,000,000-byte valid envelope. A later zero-body headers-only probe timed out and is not additional proof.

Source review, integration, package preparation, host preflight and final production GO remain separate gates. The current mission authorizes local review branches, not production mutation or destructive cleanup.

## Authorized release preparation

1. After source acceptance and explicit release-preparation authorization, reverify installed pointer, immutable manifest bytes, source SHA and all migration identities read-only. A mismatch stops preparation.
2. Extend the reviewed operator for that exact baseline, preserving lock/lease, one-shot markers, maintenance, manifest verification, backups, preservation digests and schema-compatible rollback barriers. Review that change; never relax guards.
3. Build from a clean checkout of the actual accepted source SHA with the production HostPapa configuration. Pin application and operator SHAs separately. Generate one full-stack package, immutable release manifest and matching upgrade kit.
4. Verify package/manifest/template/rendered-runner/installer hashes, locked production dependencies, migration identities and public/private permissions. Keep private configuration outside the public root. Exclude secrets, local fixtures, private receipts and backups from Git and the public payload.
5. Rehearse the exact bytes locally against the recorded baseline and disposable database. Verify backups, preserved records/configuration, one-shot behavior and compatible recovery. Rehearsal is not a production success receipt.

## Read-only host preflight

Only after owner authorization to transfer the kit and run preflight:

1. Use a new private target directory. Verify all uploaded hashes before execution; never overwrite earlier evidence.
2. Run only the reviewed runner's `--check` path with its reviewed one-shot invocation. Validate baseline, candidate manifest/permissions, schema, backup prerequisites and headroom without staging/applying an update. Diagnostic files may be recorded; no application/data mutation is permitted.
3. If a temporary cron is separately authorized because Terminal is unavailable, use a unique atomic noclobber guard and remove only that temporary job after completion. Preserve the application job and all guards/logs.
4. Interpret the exact checkpoint/reason code. Retain markers and evidence on failure, determine the cause, and prepare a reviewed correction. Never clear markers or retry blindly.

The existing dispatcher was observed healthy at `*/10` on October 23. The owner reports HostPapa approval of one-minute cron; the email was not independently inspected. Preserve cadence and the single dispatcher unless separately authorized.

## Final deployment and recovery

Return exact source/operator/package hashes, preflight evidence, verified backup locations and compatibility limits. Wait for a separate explicit GO naming the candidate. Execute the matching guarded upgrade exactly once; never rerun an old installer.

The operator must acquire the installer lock and cron lease, retain the attempt marker, enter maintenance, verify consistent private/database/public backups, apply only reviewed migration UP operations, switch the release and verify immutable bytes, permissions, preserved durable data/configuration and runtime health. Final verification must establish a **fresh runtime PDO connection after long backup/copy work**, avoiding MySQL inactivity error 4031. Never rewrite failed verification as success.

Verify source through reviewed release identity checks, not generic health alone. Preserve legitimate post-update data. MySQL DDL autocommits: never automatically import an old dump or roll migrations down over live records. Rollback requires owner authorization and the actual schema-compatible barrier; otherwise use forward repair. Preserve original incident evidence and attempt markers.

See the [historical index](archive/INDEX.md) and [qualified Issue 15 reconciliation](production/ISSUE_15_PRESERVATION_RECONCILIATION_2026-10-17.md). Older 7a8, b3 and 965 commands are historical provenance, not executable instructions for the installed baseline.
