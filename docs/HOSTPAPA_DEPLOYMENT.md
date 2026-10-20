# HostPapa full-stack update runbook

## Recorded installed baseline — 19 October 2026

| Pin | Recorded value |
| --- | --- |
| Application | `69743b44066501e1b7a7be9e55181c5a9da13b3b` |
| Active release | `rel_20261017T161436_69743b4_clean` |
| Release manifest SHA-256 | `408b48ef4a23fc30191a8dcc556abf02d009d72fe13aa1e8f1277d7c39d5f2da` |
| Migration identities | 23 |
| Deployment | 2026-10-18T06:35:45Z; `DEPLOYED_OWNER_TESTING_PENDING` |
| Private application | `/home/gaza5045/gaza-gateway` |
| Pointer | `/home/gaza5045/gaza-gateway/current-release.txt` |
| Public root | `/home/gaza5045/public_html` |

These are accepted deployment records, not a fresh private-host inspection on every documentation read. Reverify them before another update. Preserve private backups, shared configuration, credentials, business data and original failed-upgrade evidence. Actual production booking and mailbox acceptance remain owner checks.

HostPapa shared cPanel is the sole production target: prebuilt React/Vite, Laravel 13/PHP 8.4+, MySQL/InnoDB and HostPapa SMTP. No production Node/Docker daemon, external backend, Actions or static-only `hostpapa-deploy` branch.

## Guarded upgrade operator profile — installed_697_23

The production upgrade operator builder defines the mandatory production profile `installed_697_23` targeting installed baseline `69743b44066501e1b7a7be9e55181c5a9da13b3b` (release `rel_20261017T161436_69743b4_clean`, manifest `408b48ef4a23fc30191a8dcc556abf02d009d72fe13aa1e8f1277d7c39d5f2da`, 23 migration identities) to upgrade candidate `55dfa645e59e66c2da03744673fbb212a5077d51` (target 23 migrations). Earlier profiles (`installed_965_21`, `b3_21`, `legacy_7a_19`) are superseded and rejected on the production CLI.

### Dedicated kit layout and commands

- Kit directory: `/home/gaza5045/gaza-upgrade-package-697-55dfa64`
- Release preparation CLI invocation:
  ```bash
  node scripts/prepare-hostpapa-production-upgrade.mjs \
    --package-dir=scratch/.hostpapa-shared-release \
    --output-dir=scratch/gaza-upgrade-package-697-55dfa64 \
    --output-zip=scratch/gaza-upgrade-package-697-55dfa64.zip \
    --source-sha=55dfa645e59e66c2da03744673fbb212a5077d51 \
    --profile=installed_697_23 \
    --installed-manifest=/path/to/immutable/baseline/release-manifest.json
  ```
- Private host read-only check:
  ```bash
  php /home/gaza5045/gaza-upgrade-package-697-55dfa64/production-upgrade-runner.php --check
  ```
- Private host guarded upgrade:
  ```bash
  php /home/gaza5045/gaza-upgrade-package-697-55dfa64/production-upgrade-runner.php --upgrade --confirm-upgrade
  ```
- Private host guarded rollback (schema-compatible barrier; guest schema preserved):
  ```bash
  php /home/gaza5045/gaza-upgrade-package-697-55dfa64/production-upgrade-runner.php --rollback --confirm-rollback
  ```

Package generation, host preflight transfer, and execution remain separate owner gates; this runbook describes operator profile instructions without claiming package generation, preflight pass, or deployment certification.

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

The existing dispatcher was observed healthy at `*/10` on October 18. The owner reports HostPapa approval of one-minute cron; the email was not independently inspected. Preserve cadence and the single dispatcher unless separately authorized.

## Final deployment and recovery

Return exact source/operator/package hashes, preflight evidence, verified backup locations and compatibility limits. Wait for a separate explicit GO naming the candidate. Execute the matching guarded upgrade exactly once; never rerun an old installer.

The operator must acquire the installer lock and cron lease, retain the attempt marker, enter maintenance, verify consistent private/database/public backups, apply only reviewed migration UP operations, switch the release and verify immutable bytes, permissions, preserved durable data/configuration and runtime health. Final verification must establish a **fresh runtime PDO connection after long backup/copy work**, avoiding MySQL inactivity error 4031. Never rewrite failed verification as success.

Verify source through reviewed release identity checks, not generic health alone. Preserve legitimate post-update data. MySQL DDL autocommits: never automatically import an old dump or roll migrations down over live records. Rollback requires owner authorization and the actual schema-compatible barrier; otherwise use forward repair. Preserve original incident evidence and attempt markers.

See the [historical index](archive/INDEX.md) and [qualified Issue 15 reconciliation](production/ISSUE_15_PRESERVATION_RECONCILIATION_2026-10-17.md). Older 7a8, b3 and 965 commands are historical provenance, not executable instructions for the installed baseline.
