# ADR: Existing HostPapa shared cPanel only

Status: product-owner decision, 2026-10-12. Implementation and account compatibility are not yet accepted.

The complete commemorative product must run under the existing HostPapa shared account: prebuilt React/Vite frontend, Laravel 13/PHP 8.4+, MySQL 8.4/InnoDB, HostPapa SMTP, private local files and bounded cPanel cron. Prefer same-origin `/api/v1` ahead of static SPA rewrites. Production needs neither Docker nor a persistent worker/Node server. Local disposable containers may test MySQL; they are never a hosting dependency.

The [controlling plan](../production/GAZA_GATEWAY_HOSTPAPA_SHARED_HOSTING_MASTER_EXECUTION_PLAN_2026-10-12.md) supersedes previous Render/PostgreSQL production decisions. Preserve those documents and tests as historical evidence, not active deployment instructions. No external host/database/provider substitution, payments or real airline operations are authorized.

H0 proves the actual account with an isolated, protected, non-destructive canary. Until then its capabilities are UNVERIFIED. Safe offline MySQL conversion may proceed. Unsupported capabilities must first be diagnosed within HostPapa shared hosting; only the owner may approve a measured scope/architecture change.

MySQL conversion must retain durable seat uniqueness, idempotency, authorization, proof/MFA replay suppression, immutable revisions/audit, transactional cancellation and honest mail status. Do not port by changing only DB_CONNECTION or by weakening constraints. Record equivalent constraints/lock protocols and test them against real MySQL.

No merge, live migration/content import, cPanel deployment, DNS change, paid purchase or live credential configuration without owner GO. Actions stay disabled. Each major handback must state `HostPapa shared-only architecture preserved: YES/NO` and identify evidence versus assumptions.
