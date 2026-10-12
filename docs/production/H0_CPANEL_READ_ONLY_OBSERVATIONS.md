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
