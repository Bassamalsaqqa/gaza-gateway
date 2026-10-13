# Owner-authorized manual production cutover

The owner requested production deployment and will perform acceptance testing afterwards. This overrides the earlier requirement to wait for all H4 checks before cutover; it is not independent reviewer acceptance. No browser actions are performed by Codex after the owner requested manual operation.

Application source: `7a8f0fa2f25851c4f75422f86139e0bb020ea4de`.
Release: `rel_20261013T082656_7a8f0fa_clean`.
Release manifest SHA-256: `f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf`.
The new wrapper is separately reviewed tooling, not a rebuilt application or a relabelled application test gate. The package remains an unreviewed candidate under owner-authorized launch/testing. PR #4, main and hostpapa-deploy are not merged or changed by this procedure.

## Prepared files

Local private handoff directory: `scratch/h4-private-inputs/production-owner-ready/` in the convergence worktree. `HOSTPAPA_PRODUCTION_READY.zip` includes the exact manifested application in `release/`, private production environment/installer approval, first-owner SMTP input and `deploy-production.php`. This ZIP contains credentials; upload it only to `/home/gaza5045/gaza-live-package`, never to public_html or Git. Fresh production app secrets are independent from staging. Existing owner-provided live database and mailbox credentials are already filled. Do not reuse staging database/users or migrate its passengers/bookings/test schedule.

Canonical airport/fleet/layout/meal/CMS setup is a separate, authenticated local helper. It uses the approved source fixture, no schedules, bookings, passenger identities or prototype prices. It requires the owner's existing real Admin password, entered invisibly at the local terminal after accepting the invitation. It cannot create a staff password or bypass authentication/CSRF/RBAC.

## cPanel steps

1. **Backup.** A File Manager compression of public_html and `.gazaairport-deployed-files` was already observed complete in `/home/gaza5045/gaza-live-package/precutover-public-20261013.tar.gz` (19.51 MB). Confirm it is still present. If the public website has changed since that backup, take a fresh gzip archive of those two entries and use the same required backup name. This is a new empty production database; existing unrelated databases are not migrated or touched.
2. **Upload/extract.** In File Manager set `/home/gaza5045/gaza-live-package` permissions to **0700**, then open that directory. Upload `HOSTPAPA_PRODUCTION_READY.zip` and Extract into `/gaza-live-package`. Its top level must show `deploy-production.php`, `live-runtime.env`, `live-approval.json`, `owner-bootstrap.json`, and `release/`. Inside release must be `public/`, `private/`, `installer/`, and `release-manifest.json`; avoid a second nested folder. Partial older uploads of the same files can be overwritten with this complete ZIP. Do not overwrite the backup. The runner also enforces the package directory's 0700 and its three private inputs' 0600 permissions before invoking the installer.
3. **Run once.** Under Cron Jobs, temporarily choose Every Minute and paste the command below. It is guarded by an exclusive lease and persistent attempted marker, so it cannot repeat migrations/invitations every minute. Check the private result after the first run; then remove this temporary cron. Do not remove the attempt marker to force a retry after failure.

```text
umask 077; /usr/local/bin/php /home/gaza5045/gaza-live-package/deploy-production.php --deploy >> /home/gaza5045/gaza-live-package/production-deploy.log 2>&1
```

4. **Read result.** View `production-deploy.log` and `production-result.json` in the private package folder. Success is `DEPLOYED_OWNER_TESTING_PENDING`. The real installer checks all manifested bytes, boot/config/database bindings and migrations before switching public files and the active code pointer. It retains a separate private static backup. The wrapper then configures encrypted SMTP, queues the first Admin invitation and runs one bounded cron. A `FAIL` includes a safe stage name; preserve log/marker/backup and send the result to Codex. Failure during `owner_invitation` or `initial_cron` can occur after installation; it does not mean the public switch was undone. Do not run migrations manually or change APP_ENV to local.
5. **Add recurring cron.** Use Minute `*/15`, Hour/Day/Month/Weekday `*`, with this exact command:

```text
umask 077; /usr/local/bin/php /home/gaza5045/gaza-gateway/releases/rel_20261013T082656_7a8f0fa_clean/bin/hostpapa-cli shared-hosting:cron --max-seconds=25 --batch-limit=25 >> /home/gaza5045/gaza-gateway/shared/storage/logs/cron-result.log 2>&1
```

This is the approved cadence and uses database lease protection; no permanent worker. Messages queued just after a run may wait up to 15 minutes. Keep the staging cron separate while it is needed; do not run Laravel schedule:work or queue:work.

6. **Accept your Admin invitation.** The first account is username `owner`, email `notifications@gazaairport.com`. Read the new production invitation in that mailbox, open `https://www.gazaairport.com/admin/signin`, select **Accept invitation**, paste its token and choose/submit your own password (15+ characters recommended). Initial MFA is optional; accounts with enrolled factors still require them. No staging password/account is copied.
7. **Initialize approved content.** On your Windows computer open PowerShell and run the local helper:

```powershell
Set-Location 'C:\Users\bassa\Documents\GazaAirPort\gaza-gateway\scratch\hostpapa-convergence\scratch\h4-private-inputs\production-owner-ready'
node .\initialize-production.mjs
```

Enter the existing `owner` Admin password when prompted; it is not displayed or saved. The helper is pinned to the production origin and exact deployed SHA, signs in normally, obtains CSRF and executes authorized API commands. It checks existing records rather than overwriting differing edits. Success reports canonical references/content published and writes a credential-free operation receipt locally. This installs 8 airports including GZA, 14 derived routes, 3 memorial aircraft/layouts, 4 meals and 8 approved CMS documents. It does **not** create any test offering. Add your chosen commemorative dates in Admin > Schedules before testing a booking.

## Owner checks and limits

Open `https://www.gazaairport.com/api/v1/version` and confirm the exact source above. `https://www.gazaairport.com/api/v1/health/ready` should report connected/up-to-date/healthy after the first successful cron. Check normal EN/AR pages and Admin, then perform the owner's registration, verification, booking, seat/meal, ticket/PDF/email, cancellation and shared-state tests. SMTP worker completion is provider acceptance, not proof of mailbox arrival.

Actual staging core workflow and focused EN-home/AR-ticket mobile rendering passed. Actual saved PDF, complete mobile booking workflow, fresh on-host same-seat conflict and deliberate failed-mail retry remain owner acceptance checks. Earlier genuine MySQL concurrency and synthetic mail-retry evidence retain their source attribution. Do not report full production acceptance from installation success alone.

After setup succeeds, remove the temporary cron. Keep the private backup and operational logs. Move redundant secret-bearing upload ZIP and bootstrap/DDL input files to private owner-controlled storage or delete them through cPanel's recoverable Trash; never move them to webroot. Runtime .env and encrypted SMTP setting must stay in installed private storage.

## First-cutover rollback

This is the first PHP-backed production installation; the old public release has no private code pointer for ordinary installer rollback. Disable only the new production recurring cron, move `/home/gaza5045/public_html` to a new private path such as `/home/gaza5045/gaza-live-package/postcutover-public-retained`, and extract `precutover-public-20261013.tar.gz` into `/home/gaza5045`. This restores the old public_html and deployment marker without deleting the new copy, new database or private application. Confirm the old static site renders. Do not import, drop or rewind the live database once new registrations/bookings exist. A later application rollback uses the installer's pinned prior-release approval; incompatible MySQL schema rollback requires separately approved database backup restoration.
