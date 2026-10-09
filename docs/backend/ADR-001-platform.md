# ADR-001: Backend platform and database

Decision date: 2026-10-09. Status: accepted Phase 12 design baseline (independently accepted at 7dab821d7d205b41ae925e013fe9c69a97a7e875). Services remain unprovisioned.

Adopt a modular Laravel 13 / PHP 8.4 API in Docker on paid Render services with managed PostgreSQL 17. Keep the existing static React frontend on HostPapa. Use PostgreSQL for sessions, transactional jobs, idempotency and outbox initially; no Redis requirement. Domains: Identity, Aviation, Commercial, Booking/Inventory, Editorial/Archive, Engagement, Payments and Audit. Controllers validate DTOs and policies; domain services own transactions; provider adapters own external protocols.

This decision follows the project's static-host boundary and need for durable multi-user inventory, background delivery, controlled releases and low owner maintenance. It does not assert that HostPapa cannot run PHP or that MySQL cannot enforce transactions. The purchased account's runtime/extensions/process limits, database isolation and recovery capabilities have not been demonstrated.

## Alternatives and twelve-dimensional assessment

| Dimension     | Shared HostPapa PHP/MySQL                                          | Paid Render Laravel/Postgres (selected)                                         | Self-managed VPS                                  | Managed Node/container                                 |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Runtime       | PHP selection available; exact account capabilities unverified     | PHP 8.4 pinned Docker image                                                     | Full runtime control, owner patches               | Mature TypeScript runtime, provider dependent          |
| Database      | MySQL tools available; account isolation/backups unverified        | Explicit Postgres 17, row locks/constraints                                     | Postgres possible, owner operates it              | Managed Postgres possible                              |
| TLS           | Current static hosting/cPanel workflow                             | Custom-domain managed TLS                                                       | Owner reverse proxy/cert lifecycle                | Provider dependent                                     |
| Jobs          | Durable supervised workers not established for this account        | Continuous paid background worker                                               | Owner supervisor and monitoring                   | Worker/queue assembly                                  |
| Cron          | cPanel cron exists; account limits unverified                      | Separate scheduled service                                                      | Owner scheduling/alerts                           | Provider scheduler                                     |
| Email         | No production delivery contract established                        | Dedicated external provider adapter                                             | Same external provider need                       | Same external provider need                            |
| Storage       | Shared webroot is not suitable for private PII/media originals     | Separate private object bucket/derivatives                                      | Same bucket or owner-managed storage              | Same bucket option                                     |
| Secrets       | Account configuration must be inspected                            | Service-scoped configuration plus restricted access                             | Owner secret lifecycle                            | Provider secret lifecycle                              |
| Deploys       | Accepted prebuilt static Git/cPanel workflow                       | Pinned container, controlled migrations and rollout                             | Owner CI/rollback work                            | Provider container rollout                             |
| Backups       | Purchased backup guarantees unverified                             | Paid Postgres PITR; independent restore/export drills                           | Owner WAL/backups/restore                         | Managed DB plan dependent                              |
| Logs          | Account-level evidence unverified                                  | Structured service logs, redact and export under retention policy               | Owner collection/alerts                           | Provider dependent                                     |
| Cost / burden | Lowest incremental bill; backend capability investigation required | Web + worker + cron + paid DB + storage/mail; moderate cost, managed operations | Potentially low compute cost, highest maintenance | Credible alternative, additional integration decisions |

HostPapa documents [PHP version selection and MySQL backup tools](https://www.hostpapa.com/knowledgebase/article-categories/cpanel/) and [cPanel cron](https://www.hostpapa.com/knowledgebase/app/uploads/2023/04/Getting-Started-with-HostPapa-full.pdf). Those features establish possible PHP hosting, not the purchased account's suitability for this worker/inventory/recovery design. Reject this option for the current backend because required operational evidence is missing and the accepted deployment boundary is static.

Laravel's first-party validation, policies, migrations, queues, mail and scheduling provide a cohesive modular API foundation. A mature managed Node stack could meet the same invariants; language symmetry alone does not outweigh the selected integrated toolkit. A VPS could meet them too, but patching, supervision and recovery would be owner responsibilities. These are architectural judgments, not claims that alternatives are intrinsically insecure.

## Primary-source feasibility

Laravel 13 supports PHP 8.3–8.5; PHP 8.4 is inside that range. Pin supported patch versions and Composer lock in Phase 13A, with planned security updates. [Laravel support policy](https://laravel.com/framework/docs/13.x/releases)

Render explicitly supports PHP through Docker; its native runtimes do not include PHP. The container requires PostgreSQL PDO, intl, mbstring, OpenSSL and the chosen mail/storage extensions. Build and boot tests must confirm them. [Render Docker support](https://render.com/docs/docker)

Render has web, continuous worker and scheduled service types; use distinct services from the same accepted image. Laravel's database queue is the initial design choice, not a claim about Render queue management. [Render service types](https://render.com/docs/service-types), [background workers](https://render.com/docs/background-workers)

Postgres 17 is selectable among Render's supported major versions. Internal connectivity requires matching account/region; external ingress must be explicitly disabled. Internal TLS requires sslmode=require rather than unsupported internal verify-full. [Database creation, connection and access rules](https://render.com/docs/postgresql-creating-connecting)

Paid Postgres provides PITR; recovery-window availability depends on workspace tier. Recovery creates a new database, and the most recent ten minutes are unavailable as PITR targets. RPO <=15 minutes and RTO <=60 minutes are proposed measurable objectives, not service guarantees or achieved results. [Render recovery documentation](https://render.com/docs/postgresql-backups)

Services in the same workspace/region share a private network; environment labels alone do not isolate it. Select separate staging and production workspaces. Pro-tier environment network controls are an alternative only after explicit isolation verification. [Render private network](https://render.com/docs/private-network)

## Consequences and reopening triggers

The monorepo will contain a future backend/ Laravel application beside the existing frontend. No PHP runtime, migrations, new dependencies, generated client or frontend cutover is introduced in Phase 12. OpenAPI and closed lifecycle manifests guide Phase 13; generated TypeScript clients are future checked artifacts. PostgreSQL transaction models require real concurrency tests.

Framework defaults do not implement the application's security policy automatically. Configure guards, hashed session lookup, encrypted payloads, cookie flags, Argon2id and mandatory application Origin/CSRF explicitly. Backend transactions and DB constraints, verified by competing connections, are required before any inventory claim is production-safe.

Owner gates before provisioning/production: approve aggregate paid-service budget and region/data residency; obtain mail/object-storage credentials; select/onboard a permitted payment merchant; configure DNS/secrets; authorize offline administrator bootstrap, legal retention, live restore drill and data cutover. No merchant suitability or live aviation feed is implied.

Reopen the platform choice only for demonstrated budget/residency rejection, unavailable required service/version, measured reliability incompatibility, an independently proven framework blocker, or an explicit owner direction. Routine feature work must not reconsider the stack.
