# H0 actual cPanel observations ? 2026-10-12

Overall H0: **UNVERIFIED / partial read-only evidence**. Codex read the owner-authenticated cPanel UI; no setting, database, user, cron, DNS or site file was changed. Session URLs, account identifiers and credentials are deliberately omitted.

| Item | Direct UI observation | Limits |
|---|---|---|
| Plan/server | Hosting package COM-WH; cPanel 134.0 build63; Apache2.4.69; Linux x86_64 | Actual resource/account contract quotas still require confirmation |
| Database | Server Information reports MySQL8.4.11-cll-lve | Transactions, CHECK/FK/triggers/locks/DDL privileges not executed yet |
| PHP selector | Account global PHP8.5 current | Actual web and CLI runtime may differ; locked Composer platform check not executed |
| Enabled extensions | pdo_mysql, nd_pdo_mysql, openssl, mbstring, intl, fileinfo, curl, ctype, tokenizer, json, XML, zip, bcmath, GMP | Selector checkbox evidence only; function-level runtime probes pending |
| Sodium | Unchecked | Required-versus-optional usage must be inspected before any setting change |
| PHP options | UTC; max_execution_time30s; memory_limit128M; post_max_size8M; upload_max_filesize2M; display_errors off; log_errors on; expose_php on | Actual CLI limits, memory/Argon2 benchmark and runtime response still pending |
| Cron | Tool available; menu offers1/5/10/15/30-minute schedules; example PHP executable /usr/local/bin/php | UI options do NOT establish the permitted plan minimum or actual CLI version; no job added |
| Databases | Existing databases/users and create/manage controls visible | Existing data untouched; dedicated disposable canary DB/user not created |
| Private files | cPanel home directory and File Manager/Directory Privacy/Git controls visible | Private copy, permissions and isolated API rewrite proof pending |
| Current static release | Git interface HEAD and Last Deployed SHA both da08d452a9efbd6947e49f09a66c3f133c66240c; last deployment displayed12Oct2026 | cPanel deployment receipt observed; live-page smoke and backend exposure not certified |
| SMTP | Email Accounts/Deliverability tools available; sendmail path displayed | SMTP authentication/TLS/quota/SPF-DKIM-DMARC/external delivery untested |

Next: independently review the isolated H0 canary, establish a disposable DB/private test root with owner-controlled credentials, execute web+CLI/MySQL/cron checks without touching existing tables/public root, retain sanitized receipts and clean only owned canary artifacts. Local MySQL evidence cannot promote this host gate to PASS.

## Owner-executed isolated cron canary — 2026-10-12

The earlier read-only observations above describe the initial inspection, not the subsequent isolated setup. Codex created only the dedicated disposable canary database and private test folder. The owner created its user/credentials and executed the canary through cPanel cron. No public application files or existing application tables were changed.

Owner-reported run `h0_20261012_135502_483486` at `2026-10-12T13:55:02Z`:
- CLI PHP 8.5.11; all 10 required extensions; Argon2id: PASS.
- MySQL 8.4/InnoDB capability group, CHECK enforcement, concurrency/locks and owned-table cleanup: PASS.
- Private filesystem staging: PASS.
- SMTP preparation: WARNING; no real email sent. SMTP delivery remains unconfigured/unverified.
- API preparation: PREPARED_OFFLINE; operational Apache/Laravel HTTP routing remains UNVERIFIED.
- Overall: UNVERIFIED_PENDING_OWNER_EVIDENCE; this is not full H0/application/deployment acceptance.

Evidence attribution: this final summary was supplied by the owner; final detailed receipt bytes have not yet been downloaded/hash-verified by Codex. Codex directly inspected the two previous detailed reports: run `h0_20261012_134201_5d3a12` connected successfully but failed because the probe used unsupported prepared SHOW placeholders; run `h0_20261012_135001_b4b20a` connected successfully but collided with a constraint retained from that failed run. These were canary defects, preserved as failed evidence. Corrective source commits: `ab47c806bb578ed979695d43b85f232c14b3dc00`, `4263f9c` and `4625dc2`. Locally tested corrected SQL against disposable MySQL 8.4.11, including pre-existing constraint names; all canary DB checks and owned-container cleanup passed.

Next engineering step: complete MySQL application persistence/coordinator conversion and shared cron/runtime packaging. Live HTTP routing, exact locked Composer platform validation, actual application migrations, private release deployment/rollback, and configured mailbox delivery remain separate gates. Remove the temporary canary cron after its one-shot run; preserve all failed/passing reports. Production MySQL tables must specify ENGINE=InnoDB explicitly (the inspected server default was MyISAM).

## Owner-completed mailbox and protected HTTP checks — 2026-10-12

- Dedicated application mailbox: `notifications@gazaairport.com`.
- Owner supplied cPanel secure client settings: SMTP `mail.gazaairport.com`, port `465` (implicit TLS); authentication username is the full mailbox address. No password is recorded here.
- Owner verified a Webmail message reached an external inbox and its reply reached the hosted mailbox. This proves that mailbox exchange, not Laravel SMTP authentication or application ticket/identity delivery.
- Owner reported DMARC `v=DMARC1; p=none;`. SPF/DKIM status and received-message authentication headers have not been supplied; no DNS modifications performed.
- Owner returned protected canary JSON at `2026-10-12T14:36:24Z`: `status=PASS`, `authenticated=true`, `auth_type=Basic`, `directory_privacy_verified=true`, `mod_rewrite_verified=true`, `route_tested=probe`.
- Attribution: owner-supplied test result. This establishes the isolated PHP/Apache routing check; it does not establish locked Laravel runtime deployment or the application API's cookie/CSRF behavior.

H0 now has positive evidence for core CLI runtime, Argon2id, MySQL/InnoDB constraints and locks, bounded cron invocation, private filesystem writes, protected Apache rewrite routing, and mailbox exchange. Remaining checks include exact Laravel/Composer platform compatibility on host, runtime-versus-migration privilege separation, application SMTP authentication/TLS and actual identity/ticket email, allowed cron cadence/resource budget, and the isolated complete application/rollback gate. The live site, DNS and existing application databases remain outside these canary operations.
