# HostPapa full-stack update runbook

## Installed baseline and Batch 02 candidate ? 21 October 2026

Installed source: `55dfa645e59e66c2da03744673fbb212a5077d51`, release `rel_20261020T043444_55dfa64_clean`, 23 migrations, immutable manifest SHA-256 `c9275e79156c4e5c08e267c429fd9034b337e69e71bafad7dc6e021609c89420`. These are retained deployment evidence, not fresh host certification.

Accepted application main: `0aacf1452d47bbf5660f060a718409dfff32a54c`, 25 migrations. The separate operator successor uses mandatory `--profile=installed_55_23`; historical PR #20 is not merged or reused as an installer. The two Batch02 additions are allowlisted exactly, with all 23 baseline migration bytes unchanged. Generated rollback migration maps are sorted before strict comparison. Expanded schema refuses old-code rollback and requires forward repair; no migration DOWN or database restore is automatic.

The installed single `*/10` dispatcher must be preserved. No cron change, production upload, deployment or application-data mutation is authorized by operator source preparation. Final deployment requires separate exact-kit owner GO.

Batch02 preservation retains digests of every pre-existing row, permitting only missing OSL/ARN airport rows, four exact Nordic schedule IDs, one appended canonical revision per changed domain and its exact +1 revision-control transition. Existing fleet must already be active; no fallback fleet inserts admitted. Existing business records, historical reference rows and all other control columns remain hashed. This specialization requires exact-kit rehearsal and independent operator review before release acceptance.

Read-only host preflight must certify real web-SAPI 10M uploads, 40M bounded request/post capacity, at least five files, finite memory; GD/FreeType/PNG, calendar and ar-php Arabic shaping; MySQL constraints; private upload paths/permissions; backup headroom/integrity; installed source/manifest/migrations and original cron. See [upload requirements](batch02/ARCHIVE_UPLOAD_HOSTPAPA_REQUIREMENTS.md). Never infer web PHP settings from CLI alone.

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
