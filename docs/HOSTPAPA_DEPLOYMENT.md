# HostPapa full-stack production upgrade guide

Operative guidance as of 2026-10-14. The existing shared cPanel account runs prebuilt React/Vite, Laravel 13/PHP 8.4+, MySQL/InnoDB, HostPapa SMTP and one bounded cron dispatcher. Private application/configuration/storage remain outside `public_html`; public Apache routing serves the frontend and private API. No production Node daemon or external application host.

## Authority and installed baseline

- `main` is source authority. Review branches and pushed commits are not installed releases or merge approval.
- Recorded installed source: `b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87`, with 21 migration identities. Reverify the actual pointer, retained manifest, immutable installed bytes and migration ledger before each upgrade.
- Deployment authority requires an approved exact source SHA, new production-profile full-stack ZIP, immutable archive SHA-256 and per-file manifest. Public frontend and private PHP files must belong to the same release.
- `hostpapa-deploy` is unrelated legacy static-release history. Never merge or deploy its HEAD or run its static-only deployment script against this PHP application. Git pull / cPanel Deploy HEAD is not the full-stack upgrade mechanism.

## Guarded release workflow

1. Review source and integrate to `main` only with owner authorization and preserved history. Build a new clean exact-source production package with the approved origins, prebuilt frontend and locked no-dev Composer dependencies. Verify all archive/profile/source and file-manifest pins. Do not reuse the old staging ZIP or initial `7a8f0fa` installer.
2. Rehearse migration-up, installation and code/static rollback locally against a disposable matching MySQL baseline. Preserve failed evidence and exact source attribution; do not relabel an older gate as execution at a new SHA.
3. Prepare a private upload kit reusing installed shared runtime configuration and existing private migration approval. No new database/password request, database reset, staging-data copy or first-owner bootstrap belongs in a routine upgrade.
4. Perform non-destructive production preflight: compare actual installed source/schema/configuration with the expected `b3afa9c`/21-migration baseline, candidate hashes, tools/privileges and backup capacity. An unexpected baseline or existing attempt marker requires diagnosis, not removal or blind retry.
5. Present exact source/package hashes, rehearsal/preflight evidence, verified-backup and rollback procedures, and minimal private cPanel upload/execution instructions. **Stop for explicit final owner release GO.** Source publication or PR approval alone does not authorize deployment.
6. After GO, run the reviewed guarded upgrade once: acquire upgrade guards and the existing dispatcher's database lease, enter canonical maintenance, take and verify consistent database plus public/private backups, apply reviewed migration UP only if needed, then activate matching public/private files. Preserve live users, bookings, content, SMTP settings, shared credentials and private storage. No destructive migration or automatic database restore.
7. Verify version/source pointer, complete migration identities, preserved authority and readiness. Retain sanitized receipts, failed attempts and backups. Resume the existing single pointer-following cron; do not duplicate it or change cadence. The owner reports written HostPapa support approval for a one-minute cron on this specific account (2026-10-14; support email not independently inspected). Treat this account-specific policy question as resolved per owner confirmation. Preserve the existing single bounded dispatcher and current cadence; never add duplicate jobs. GitHub Actions stay disabled.

## Failure and rollback

Inspect retained diagnostics, active pointer, installed bytes, migration ledger and maintenance ownership before retry. A failure receipt does not prove activation never happened. Do not delete evidence or clear another operation's maintenance blindly.

Use the rehearsed, owner-authorized code/static rollback preserving shared configuration and live database records. MySQL DDL autocommits: never automatically roll migrations down or import a backup. Data restoration or incompatible-schema recovery requires a separate reviewed owner decision. Never overwrite live files with the legacy static release.

## Standard Operator Procedures (SOP): prepare, check, owner GO, upgrade, recovery

Tooling provenance must remain distinct from application release payload. Never print credentials, alter shared configuration in place, remove attempt markers, or bypass baseline checks.

### 1. Prepare (Offline / Worktree Kit Generation)
- Target release candidate must be a clean package from `main` (e.g. `96538d9affdc843d08ef3c801f15c7f92dfd46b3`).
- Select closed profile: default `legacy_7a_19` (initial baseline `7a8f0fa`, 19 migrations) or reviewed `b3_21` (installed baseline `b3afa9c`, 21 migrations).
- Profile `b3_21` requires explicit immutable `--installed-manifest=<path>` (verified SHA-256 `2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0`). Unimplemented baselines and arbitrary descriptor overrides are rejected.
- Generate kit to a dedicated profile output directory:
  ```sh
  node scripts/prepare-hostpapa-production-upgrade.mjs \
    --package-dir=scratch/.hostpapa-shared-release \
    --output-dir=scratch/production-upgrade-kit-b3 \
    --output-zip=scratch/production-upgrade-kit-b3.zip \
    --source-sha=96538d9affdc843d08ef3c801f15c7f92dfd46b3 \
    --profile=b3_21 \
    --installed-manifest=scratch/b3-installed-manifest.json
  ```
- Verify truthful hashes in `upgrade-manifest.json`: candidate manifest SHA-256, runner template SHA-256, rendered runner SHA-256 (`rendered: true` for `b3_21`), installer SHA-256, and target folder (`gaza-upgrade-package-b3`).

### 2. Check (Read-Only Production Preflight)
- Target directory requirement: Requires an empty, never-used target directory (e.g. `/home/gaza5045/gaza-upgrade-package-b3`); halt if previously used or containing files. Stable profile folder names are not universally unique and must never overwrite retained evidence.
- Execute via single-run temporary cPanel cron with an atomic noclobber guard (`set -C`) to eliminate race conditions and prevent repeat execution on cron intervals:
  ```sh
  umask 077; ( set -C; : > /home/gaza5045/gaza-upgrade-package-b3/check-once ) 2>/dev/null && /usr/local/bin/php /home/gaza5045/gaza-upgrade-package-b3/production-upgrade-runner.php --check > /home/gaza5045/gaza-upgrade-package-b3/production-upgrade-check.log 2>&1
  ```
- Delete the temporary cron entry manually after execution; no auto cron removal script is trusted. A retained `check-once` guard file means inspect logs, never remove the file or blindly retry.
- Correlate invocation: `--check` does not write `production-upgrade-result.json` on success; preflight success is attested by stdout `PASS: ...`. Failures emit `production-upgrade-failure-*.json` and `production-upgrade-last-failure.json`. `--check` does not skip on existing attempt markers.

### 3. Owner GO Gate (Explicit Release Authorization)
- Compilation of audit receipts: preflight stdout log, application payload archive SHA-256, rendered runner SHA-256, and backup capacity.
- Code commit or PR approval is not deployment authority. **Stop for explicit, recorded owner GO.**

### 4. Upgrade (Single Guarded Execution)
- Configure temporary cPanel cron with atomic noclobber guard:
  ```sh
  umask 077; ( set -C; : > /home/gaza5045/gaza-upgrade-package-b3/upgrade-once ) 2>/dev/null && /usr/local/bin/php /home/gaza5045/gaza-upgrade-package-b3/production-upgrade-runner.php --upgrade --confirm-upgrade > /home/gaza5045/gaza-upgrade-package-b3/production-upgrade-run.log 2>&1
  ```
- Guarded sequence: validates preflight & acquires installer lock; creates `production-upgrade-attempted` marker immediately (before cron lease/maintenance/backups); acquires app cron DB lease; sets canonical maintenance; takes verified DB dump and file backups; applies migration UP (if any); swings `current-release.txt`; clears maintenance; writes success receipt `outcome: DEPLOYED_OWNER_TESTING_PENDING` to `production-upgrade-result.json` and `production-upgrade-success.json`.
- Delete the temporary upgrade cron task manually immediately after execution. A retained `upgrade-once` guard means inspect receipts, never remove to re-run.
- Verify live endpoint: check `/api/v1/version` for exact expected source SHA (generic `/api/v1/health` alone is insufficient).
- Cron cadence: Observed cron is `*/10`; preserve existing dispatcher without altering cadence or adding duplicates until separate owner reconciliation.

### 5. Recovery and Rollback (Controlled Incident Handling)
- On failure: do not remove attempt markers or blindly retry. Inspect `production-upgrade-failure-*.json` and diagnostic logs.
- Guarded rollback requires `--confirm-rollback` with atomic noclobber guard:
  ```sh
  umask 077; ( set -C; : > /home/gaza5045/gaza-upgrade-package-b3/rollback-once ) 2>/dev/null && /usr/local/bin/php /home/gaza5045/gaza-upgrade-package-b3/production-upgrade-runner.php --rollback --confirm-rollback > /home/gaza5045/gaza-upgrade-package-b3/production-upgrade-rollback.log 2>&1
  ```
- Rollback compatibility policy: `b3_21` permits rollback within bounds supported by `b3`: exact 21 airport codes `['GZA','AMM','CAI','IST','DOH','DXB','JED','RUH','BEY','KWI','AUH','ATH','FCO','CDG','LHR','FRA','MAD','BOM','KUL','JFK','YYZ']` and block minutes between 20 and 1440, under InnoDB reference barriers. Beyond those bounds, rollback is refused and forward repair is required. No automatic DDL rollback or backup import.

## Historical records — not current execution instructions

- [Batch 01 upgrade record](production/BATCH_01_PRODUCTION_UPGRADE_2026-10-13.md) preserves the original `7a8f0fa` → `b3afa9c` baseline-specific procedure/evidence.
- [Initial installation record](production/MANUAL_PRODUCTION_CUTOVER_2026-10-13.md) preserves initial setup and mail provenance; do not replay first-owner/database setup against the installed application.
- [Historical static deployment guide](production/HISTORICAL_HOSTPAPA_STATIC_DEPLOYMENT_GUIDE.md) is preserved byte-for-byte from source `216a0ffffc9bc994fb83e1082d030c1e5a325857`. Its static-branch commands are superseded and must not be executed against the PHP site. Relative paths in that archived text refer to its original `docs/HOSTPAPA_DEPLOYMENT.md` location.

This documentation correction does not build a release or authorize a merge, deployment, production write or infrastructure change.
