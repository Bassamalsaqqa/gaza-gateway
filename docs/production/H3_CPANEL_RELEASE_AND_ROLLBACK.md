# H3 private cPanel release lifecycle

Status: IN PROGRESS. H1/native MySQL and H2/synthetic mail evidence are separate from whole-release acceptance. Actual HostPapa application SMTP and joined browser acceptance remain unverified.

## Candidate preparation

Build from clean committed source using `scripts/build-hostpapa-shared-client.mjs`, then `scripts/build-hostpapa-shared-release.mjs` with a genuine locked `composer install --no-dev` vendor. Run the strict verifier with the exact source SHA. Preserve its manifest checksum and output. Classification stays UNREVIEWED_RELEASE_CANDIDATE until independent review; clean Git state is not acceptance.

No package is uploaded by those commands. The owner-controlled `hostpapa-deploy` branch stays unchanged.

## No-SSH owner procedure after package acceptance and GO

1. Back up the existing public directory and database privately. Verify a restore on a disposable database before live GO.
2. Upload/extract the complete bundle into `/home/gaza5045/gaza-release-package` outside `public_html`. Public and private files must not be extracted together into the webroot.
3. Prepare `/home/gaza5045/gaza-runtime.env` with mode 0600 using `hostpapa-runtime.env.example`. Generate a private random 32-byte APP_KEY and a separate guest OTP pepper. Use the exact release SHA for APP_COMMIT, proper production environment and approved HTTPS hosts. Never reuse example values or paste credentials into Git/chat.
4. Create separate MySQL users: migration user with the necessary DDL/trigger privileges, runtime user limited to SELECT/INSERT/UPDATE/DELETE on only the application database. Verify actual account grants; the local disposable gate is not proof of HostPapa privileges.
5. Create a mode-0600 private approval JSON binding every field below. Use the actual manifest checksum, release ID and full source SHA; no credentials enter cron arguments.

```json
{
  "schema_version": "1.0",
  "action": "install",
  "release_id": "EXACT_RELEASE_ID",
  "source_sha": "EXACT_40_CHARACTER_SHA",
  "manifest_sha256": "EXACT_64_CHARACTER_CHECKSUM",
  "environment": "production",
  "target_webroot": "/home/gaza5045/public_html",
  "app_dir": "/home/gaza5045/gaza-gateway",
  "database": {"host": "127.0.0.1", "port": 3306, "database": "OWNER_APPLICATION_DATABASE", "username": "OWNER_MIGRATION_USER", "password": "PRIVATE_VALUE"},
  "runtime_env_file": "/home/gaza5045/gaza-runtime.env"
}
```

6. After owner GO, create a one-shot cPanel cron using the confirmed PHP 8.4+ CLI binary:

```text
<confirmed-php-cli> /home/gaza5045/gaza-release-package/installer/hostpapa-install.php --action=install --package-dir=/home/gaza5045/gaza-release-package --approval-file=/home/gaza5045/gaza-install-approval.json > /home/gaza5045/gaza-install-result.log 2>&1
```

Remove this one-shot cron immediately after execution. Read the result privately. Do not use `APP_ENV=local` to bypass a refusal. The installer validates the bundled real application and resolved runtime database, applies UP migrations with separate temporary DDL credentials, and only then changes public files and the code pointer. Runtime `.env` persists across upgrades.

7. Use `hostpapa:bootstrap-owner` through the installed private CLI. Supply the closed private `owner-bootstrap.json` described by `OwnerBootstrapConfiguration`; it creates one 24-hour invitation and encrypted SMTP settings, not a default password or MFA bypass. Complete the invitation and TOTP enrollment before expiry. Actual mailbox acceptance remains a separate owner test.
8. Set the bounded recurring cron only after confirming the permitted account cadence (default 15 minutes):

```text
<confirmed-php-cli> /home/gaza5045/gaza-gateway/releases/<release-id>/bin/hostpapa-cli shared-hosting:cron --max-seconds=25 --batch-limit=25
```

The private wrapper selects the active code pointer and shared config/storage, so the path need not change immediately after upgrades. No persistent worker is required.

## Rollback and recovery

For code/static rollback, use a fresh mode-0600 approval with `action: rollback` and the target previous release's exact ID/source/manifest checksum. Keep all closed fields (retain the same database binding and runtime_env_file; rollback validates runtime connectivity but does not run DDL). Execute the installer with `--action=rollback --approval-file=<private-file> --confirm-rollback`. It verifies the retained public snapshot and real profile before switching. Database, .env and shared storage are preserved.

Each attempted public switch retains a private `shared/backups/static_<id>/restore.json` ledger and prior bytes. An initial-install failure restores those changed bytes and removes newly added files; unrelated public uploads are not deleted. A manual first-release restore uses the owner's pre-install full public backup. Do not infer database rollback from a successful pointer rollback.

If automatic file restoration fails, maintenance stays active and the private backup is retained. Stop and recover from that ledger/full backup; do not clear maintenance to hide an incomplete restoration. API maintenance is canonical 503, but static copying can briefly expose mixed static bytes, so a protected owner test window is required.

## Evidence and limits

AGY package-review03 ended RESOURCE_EXHAUSTED with unfinished tests and a stale prior report. Its completion is not accepted. Codex preserved the rejected installer and replaced its unsafe approval/configuration/migration/static restoration paths. Focused source boundaries and PHP generation checks passed; genuine whole-bundle profile/install/rollback evidence must be recorded separately before owner deployment is requested. No GitHub Actions, remote services, DNS, cPanel writes or deployment have occurred.
