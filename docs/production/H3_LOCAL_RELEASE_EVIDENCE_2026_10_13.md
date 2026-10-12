# H3 local release evidence — 2026-10-13

Production package source: `e0ae91d7ad114c3389c2ffda504e1002d7abbcb5`.
Release: `rel_20261012T210653_e0ae91d_clean`.
Manifest SHA-256: `bdf9519fc30eb2f150b99cf91862076f0fb685cf6bc53f0bef9cdd58c34dab1f`.
Classification: UNREVIEWED_RELEASE_CANDIDATE. No upload, deployment or independent whole-app acceptance is claimed.

## Completed local evidence

- Exact-source frontend: approved same-origin production opt-in and 544 hashed build artifacts; 46 pages prerendered. Final package adds the PHP bridge/.htaccess: **546 public files and 6,677 private files**.
- Genuine Composer `install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-scripts`: zero upgrades, 29 development packages removed; all non-dev PHP 8.4.26 platform checks passed. Locked production names/versions/dist/source references and actual package bytes are audited. Canonical vendor was never changed.
- `node --test tests/tooling/hostpapa-release-boundaries.test.mjs`: **5 passed**, including closed manifest/control/path negatives, stale source/wrong flags/artifact tampering and source-directory deletion protection. Four separate real PHP 8.4 private-input refusal controls passed. Generated public/CLI PHP and installer syntax passed.
- `node scripts/verify-hostpapa-shared-release.mjs --strict --expected-sha=e0ae91d7ad114c3389c2ffda504e1002d7abbcb5`: PASS; all exact package file checksums verified. Strict means a clean unreviewed candidate, never reviewer approval.
- `node backend/scripts/run-hostpapa-release-gate.mjs scratch/.hostpapa-shared-release scratch/h3_release_34ccc3956161/candidate.tar`: **18 runtime probes passed**, plus a real schema dump/restore: 18 migrations, 78 base tables, zero non-InnoDB tables and restored route view readable.

The runtime probes cover actual production-profile boot, wrong-profile refusal before public activation, all migrations through the real Console Kernel, separate DDL/runtime credentials, no persisted DDL password, private cron execution, migration-wrapper denial, actual public PHP bridge liveness, rollback removal of obsolete application files while retaining unrelated uploads/database, and a genuine Unix write failure after a file was copied. That failure removes new files, preserves old pointer/bytes, and retains maintenance when restoration is incomplete.

## Source attribution and preserved failures

Passing receipt: `scratch/h3_release_885f91884764/receipt.json`.
Logs: same directory `commands.json`; log SHA-256 `3d50fd8b357590f0406051c99e9c1311f79a18fa0870440df2828988ce3e467f`.
Receipt source hashes, log checksum and package manifest were independently matched after the run.

The installer and all bundled production bytes are the exact committed e0ae91d source. Gate-only TCP-readiness/archive-reuse diagnostics and test-environment corrections were tested as proposed files, whose precise hashes are in the receipt, then recorded in the subsequent attestation commit. Do not describe that subsequent head as a rebuilt/retested production package. No PHP/PostgreSQL/browser execution by ChatGPT is claimed.

Failed runs remain:

- `h3_release_34ccc3956161`: socket-only MySQL readiness raced the server's temporary initialization socket; no identity/application assertion passed.
- `h3_release_b7b383eba816` and `h3_release_64363b01f51c`: production profile passed, migration UP failed on the default binary-logged disposable server. Public files/pointer were not activated. The passing run explicitly uses H1's **test-only --skip-log-bin**, not a privileged production workaround.
- Docker-to-Windows vendor copy I/O failure retained in `scratch/h3-codex-review/vendor-docker-copy-failed.log`; native host copying and an owned Linux Composer volume replaced that failed transport.
- Initial frontend receipt refusal was caused by Git metadata/line-ending changes with an identical route Git blob. Canonical tracked-byte/untracked-file checks corrected this; no generated route was hand-edited. Successful builds were repeated only for corrected provenance/new source SHAs.
- AGY package-review03 quota failure and rejected installer are retained; its stale earlier 12-test narrative was not adopted as completion evidence.

## Limits and next gate

This is fresh disposable **local** MySQL/PHP evidence with binary logging disabled. It does not certify the actual HostPapa migration user's trigger privileges, runtime DML-only grants, PHP subprocess permissions, cron/LVE quotas or installed Laravel routes. The owner's H0 reported MySQL PASS implies the canary's INSERT-trigger check passed if the uploaded source was this checked-in prober; its private report bytes were not independently collected. Do not require a redundant canary merely to replace that owner-reported evidence, but verify the full application's migrations on the isolated account database.

The restored database contains fresh schema, migration history and canonical timezone/sentinel data; it is not a restore certification of passenger bookings or SMTP secrets. Those belong in H4's joined workflow.

No application email was sent to a real mailbox. Earlier 25/133 mail evidence uses synthetic SMTP against the real 18-migration schema. Owner webmail send/reply is separate evidence. The legacy guest booking challenge routes are excluded while memorial reservations are enabled; do not infer live guest-OTP delivery from this gate.

H4 must use an owner-approved isolated HTTPS HostPapa surface/database, private config and actual mailbox credentials, then verify Admin/publish → fresh browser/register/verify → free booking/seat/meal/ticket/email → My Bookings/cancel → matching Admin data. Check EN/AR, mobile, same-seat conflict, retry and restore. The prepared www/apex production artifact must not be silently reused as a staging-origin build. No new DNS/provisioning or public activation is authorized here.

PR #4 remains draft with no reviews/inline comments at this checkpoint. PR #3 remains open at cecd1c9 with ten unresolved threads; Issue #1 remains open with its five historical findings. Prior review dispositions, phase ownership and no-payments exclusion are preserved. Main and hostpapa-deploy are unchanged. Actions remain disabled.
