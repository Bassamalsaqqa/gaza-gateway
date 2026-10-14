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

## Observed resolution and prevention

The owner's diagnostic at 08:35:01Z reports the candidate release pointer active, all 21 exact migration identities applied, both DDL/runtime connections valid, candidate inventory verified, and neither maintenance file present. At 08:36:58Z independent read-only HTTPS probes of live `/api/v1/health` and `/api/v1/version` both returned 200; the latter identified the full `b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87` source. The owner confirmed the same live version at 08:38:30Z. The initial maintenance response was transient; the new release is active. No backup restoration, marker removal or second upgrade was performed by Codex.

The precise historical failed invocation/chronology is not proved by these facts. A demonstrated tooling defect can nonetheless make the evidence misleading: the old runner requires the original 19-migration release for every `--check` and writes caught failures over `production-upgrade-result.json`, even if the target was previously installed successfully. A repeated read-only check after upgrade therefore fails and can destroy the success/backup-pointer receipt. This is a reproducible defect, not proof that this exact command caused every owner's failure.

The corrected operator accepts a post-install `--check` only after actual target source pin, installed manifest, every declared private/public file, exact 21 migration identities and absence of maintenance are verified. It preserves success receipts, records each failure separately, identifies the preflight checkpoint and distinguishes observed maintenance from maintenance created by the invocation. It never clears pre-existing maintenance during a read-only check. No authentication, migration or backup requirement is weakened.

Focused operator regression `scratch/upgrade_rehearsal_d99811b7faf7`: 25 real disposable PHP/MySQL probes passed, including the original upgrade/restore/rollback probes plus four checks for post-install verification, preservation of success on inventory corruption, reporting/retention of pre-existing maintenance, and independent failure-event retention. The immutable application payload remains b3; the patched operator and test source are separately hash-attributed in the receipt. This operator-only test kit is not a new deployment ZIP or a claim that a new application SHA was installed. Prior diagnostic/fixture failures remain retained.

Keep the temporary upgrade and diagnostic crons removed; retain the ordinary application dispatcher. Test existing live accounts, bookings, settings and external mailbox delivery. These application/business-state checks are not certified merely by the healthy version endpoint. Do not edit the old ZIP's hash-pinned runner or rerun installation. The operator correction is for reviewed future packages; the active b3 application does not need replacing to address this reporting defect.
