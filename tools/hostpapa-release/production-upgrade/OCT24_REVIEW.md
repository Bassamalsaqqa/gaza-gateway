# October 24 operator review candidate

Application source remains `26e31557f894c5a744da47d7abb9b25172c21e8c`, tree `ff4a194a9f68e4bbc8b7cd1c1449327bd67ee6bd`. These changes are separate release-tooling provenance and do not change application main.

The explicit `installed_0aac_25` profile binds installed source `0aacf1452d47bbf5660f060a718409dfff32a54c`, release `rel_20261021T164700_0aacf14_clean`, manifest `efb2e5378fe3403715f2f6d10ea8c4493a5c177bcd916b8d7dccfac4dd88c800`, and 25 migrations. Candidate inventory must contain those migration bytes unchanged and exactly the two reviewed October 23 additions (27 total).

Preservation captures original column projections and row counts before migration. This avoids falsely reporting additive archive columns as changes to old records. New metadata must retain default values; new analytics rows/settings are checked separately. Derived routes and shared configuration retain their existing checks. Final verification still opens a fresh PDO connection.

Phase alarms replace the historical 390-second exit. Timeout exceptions flow through the actual failure-receipt handler, cancel alarms during cleanup, and retain markers/maintenance after irreversible work. Failure requires reviewed forward completion; it does not authorize automatic SQL restore, migration contraction or retry. A process killed externally cannot guarantee a receipt: retained markers, maintenance and backups remain the recovery authority. Per-phase timings require exact-kit and host certification.

The generated root Apache configuration now includes the existing owner-approved `LimitRequestBody 41943040`. This changes generated public bytes and their manifest, requiring a new final kit; the earlier application-only ZIP is obsolete. Client/application code is unchanged. The builder and Apache template hashes are recorded in kit provenance. ZIP files declare Unix owner-only modes; extraction must remain under an owner-only private directory, and the installer applies final public permissions.

Focused verification: 14 local tests passed (11 profile/preservation/deadline, 2 Apache-bound, 1 ZIP permissions). PHP 8.4 runtime lint passed. The actual timeout handler and outer catch execute in a temporary fixture with retained synthetic maintenance/attempt files and no success receipt. Windows PHP fixture execution does not certify POSIX signal delivery. A separate disposable MySQL 8.4 rehearsal passed 25→27 migration execution, all 88 baseline table projections/counts, default metadata/settings and negative tampering checks. This is not a substitute for the exact delivery-kit rehearsal or actual host preflight.

Independent source review, exact-kit rehearsal, effective website-SAPI/request-limit and rendering checks, revision-safe CMS editorial acceptance/publication, and owner GO remain release gates. No production changes or cron edits are part of this commit. Preserve the live October 13 cron wrapper and all historical incident evidence.
