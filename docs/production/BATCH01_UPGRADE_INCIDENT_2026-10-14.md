# Batch 01 production upgrade incident — investigation pending

Owner evidence: three generic preflight failures, latest 2026-10-14T08:20:03Z for candidate `b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87`, plus a live canonical maintenance response. The result says `maintenance_retained: false`; this variable describes maintenance created by this runner, not actual existing maintenance state. It cannot establish that the site is out of maintenance.

The runner does not create maintenance or apply migrations during preflight. Its single generic preflight stage obscures which prerequisite failed. No root cause, partial-install state, or permission fix is inferred from that report. A forward repair is preferred; do not restore a backup, remove maintenance or erase attempt markers without actual state evidence.

## One owner-assisted read-only probe

Disable the temporary **upgrade** cron first. Keep the existing application dispatcher; do not add another dispatcher.

Upload only `tools/hostpapa-release/production-upgrade/production-upgrade-diagnostic.php` to `/home/gaza5045/gaza-upgrade-package/production-upgrade-diagnostic.php`, outside public_html. Leave the original runner, manifests, files, markers and results unchanged.

Temporarily execute through cPanel cron:

```sh
umask 077; /usr/local/bin/php /home/gaza5045/gaza-upgrade-package/production-upgrade-diagnostic.php > /home/gaza5045/gaza-upgrade-package/production-upgrade-diagnostic.log 2>&1
```

Remove this diagnostic cron after its result appears. Return `production-upgrade-diagnostic-result.json`. If missing, return the diagnostic log. No passwords or environment-file contents are needed.

The private CLI diagnostic independently checks the active release pointer, observed maintenance/attempt/config file state and permissions, tar/mysqldump availability, candidate verifier/inventory, original private inventory, and read-only DDL/runtime database connectivity and migration identities. It does not boot Laravel, migrate, write SQL, remove maintenance, change permissions on existing files, or overwrite the prior incident receipt. Its own result is 0600. Raw exceptions, credentials and subprocess stderr are excluded.

Focused isolated PHP test proves structured independent failures, secret omission, maintenance/result/marker preservation and private report permissions. No application suite was repeated. The initial test harness erroneously matched the safe machine-code prefix `PRIVATE_`; that test error was corrected to match the actual secret sentinels.

## Forward repair acceptance

Use the returned diagnostic to correct the measured incompatibility. Add a reproducing focused negative/positive test, then rebuild a newly pinned kit if its runner or candidate bytes change. Never edit a hash-pinned deployed runner in place or relabel the previous ZIP. Future upgrade receipts must identify the failed preflight checkpoint and separately report observed maintenance versus maintenance created by the invocation. Any maintenance cleanup must be guarded by actual source/schema/backup and installer-lock evidence; no blind unlink or migration reset.

Deployment, cleanup and diagnosis are distinct actions. This probe authorizes no deployment or rollback and does not claim a root-cause fix.
