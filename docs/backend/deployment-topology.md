# Deployment topology, isolation and publication

Status: Phase 12 design complete / awaiting independent GitHub review. No service, DNS change, live deployment or backend provisioning occurred.

## Services and boundaries

| Environment | Frontend / API                                           | Data and external services                                                                      |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Local       | Existing development frontend / future local HTTPS API   | Disposable Postgres 17; mail sink; sandbox provider fixtures                                    |
| Test        | Isolated HTTP/DB test processes                          | Disposable DB; no production credentials or dispatch                                            |
| Staging     | staging.gazaairport.com / staging-api.gazaairport.com    | Separate Render workspace/DB/queue/bucket/keys; mail sink/verified recipients, sandbox payments |
| Production  | www.gazaairport.com (apex allowed) / api.gazaairport.com | Dedicated Render workspace; approved paid services; owner-authorized merchant/mail/storage      |

HostPapa serves prebuilt static assets only. Render hosts the future PHP 8.4 Docker web API, continuous worker, minute scheduler and managed Postgres 17, sharing an accepted container image. Database jobs, sessions, cache locks, idempotency and outbox use PostgreSQL initially. Service disks are not authoritative asset/PII storage.

Same-region, same-workspace Render services share the private network. Separate staging and production workspaces are therefore the chosen boundary; names and different DB passwords alone do not establish network isolation. No shared secrets, queues, buckets or prod PII in staging. Disable external DB ingress explicitly; the private URL alone does not disable the external URL. Internal connections use TLS sslmode=require per the provider's certificate model. [Render private networking](https://render.com/docs/private-network), [Postgres connection/access documentation](https://render.com/docs/postgresql-creating-connecting)

## Browser, proxy and secret protocol

Host-only Secure/HttpOnly/SameSite=Lax cookies at Path=/api/v1 use separate gza_session, gza_staff_session and gza_staff_pending names and guards. The HTTPS frontend/API domains are same-site but cross-origin. Use credentialed requests, exact Origin allowlists and Vary: Origin; never wildcard or reflect arbitrary origins.

Production allowed origins: https://www.gazaairport.com and https://gazaairport.com only. Staging allows its staging frontend only. Local origins are local configuration, never production. CORS methods GET/POST/PUT/PATCH/DELETE/OPTIONS; headers Content-Type, X-CSRF-TOKEN, X-Request-Id, X-Booking-Token, X-Booking-Receipt, Idempotency-Key, If-Match. Expose X-Request-Id, ETag, Idempotency-Replay, Retry-After. All sensitive JSON is Cache-Control: no-store. Preflight is not authorization.

GET /auth/csrf and /staff/csrf initialize realm sessions and return raw csrfToken. Unconditional application middleware checks actual raw X-CSRF-TOKEN plus exact Origin on cookie/public unsafe writes, even if Laravel's default same-origin shortcut would pass. Protected header grant branches require Origin and exact live grant; webhooks require native signature instead. Every operation has pinned x-protocol. See auth-rbac.md.

TrustProxies/TrustHosts configuration is a Phase 13A measured deployment gate: inspect actual Render edge behavior and whether it strips/appends each forwarded header; prove forged X-Forwarded-For/Proto/Host cannot alter authority, scheme, URLs or rate identity. Pin the observed trusted chain at the ingress boundary. Do not guess a universal Render proxy IP list or broadly trust RFC1918 peers. Reject forwarded host; accept only the configured environment API host. Apply rate limiting before trusting arbitrary supplied IPs. TLS/custom-domain availability does not establish these application guarantees. [Render custom domains](https://render.com/docs/custom-domains)

Keep runtime keys in restricted environment configuration; different keys by realm purpose/environment, rotated with tracked key versions. No frontend bundle/build artifact includes secrets. Encrypt token dispatch payloads and PII; digest sessions/grants. Log request ID, safe action/outcome and bounded actor/target IDs, excluding tokens, documents, passwords, card data and contact bodies.

## Immutable static release protocol

publication-lifecycle.v1.json defines the protocol and required DB constraints. Canonical document IDs preserve ContentMap: home, travel, airport.past, airport.present, airport.future, destinations.presentation, destinations.editorial, pages.information.

1. Staff with content.edit calls POST /cms/publish with expected revisions for all eight documents plus contact, appearance and archive. Seal a repeatable-read public snapshot, source SHA and canonical SHA-256; preserve rights/evidence classifications and owner-directed publication basis. New restricted intake stays held. Snapshot includes approved public assets/variant hashes and retains documentary uncertainty/illustration labels.
2. GET /cms/publications/{releaseId}/snapshot (content.view) supplies sealed data to the future authenticated/offline builder. Public GET /publication-snapshots/{releaseId} exposes the same public projection. Never read current drafts during a pinned build. GET /archive/records and /archive/sources require releaseId query pins; missing pin 400, unknown pin 404.
3. Build against that snapshot and accepted source SHA. Produce prebuilt static files and release.json carrying releaseId, environment, sourceSha and snapshotHash. Artifact hash is the canonical sorted file manifest's SHA-256. Avoid self-reference: release.json does not contain its own artifact hash; that digest belongs to the separate receipt.
4. POST /cms/publications/{releaseId}/build-receipts (admin.manage + recent step-up) records exact file paths, byte lengths and hashes. Reject traversal, duplicate paths, symlinks, PHP/executable artifacts and private/secret material. Freeze successful build/files; failed build evidence cannot activate.
5. Bassam reviews and manually deploys the accepted artifact through the existing Git/cPanel workflow. No automatic HostPapa publication is added. POST /cms/publications/{releaseId}/deployment-receipts records owner approval and triggers a server-side bounded verification against the fixed environment frontend origin. Never accept an arbitrary fetch URL. Verify release.json, source/snapshot pin and critical deployed file hashes; record actual time/results.
6. POST /cms/publications/{releaseId}/activate requires matching build/deployment receipts, verified live probe, admin.manage, recent MFA and expected active revision. CAS publication_control and append activation event. Sealed content and receipts stay immutable.
7. Rollback uses POST /cms/publications/{releaseId}/rollback to a retained prior release with the same verified evidence/probe requirements and a new pointer revision/event. Owner restores its corresponding static files first. Never rewrite Git history or change immutable snapshots.

A known sealed release remains readable even if not active, supporting build preview and deployment overlap. Content-addressed assets and old deployed pins remain retained until an owner-approved retirement policy. Activation is a server publication pointer, not proof that a provider deployed anything. Owner receipt alone cannot replace a verified probe.

## Recovery and production gates

Proposed objectives: RPO <=15 minutes and RTO <=60 minutes. Paid Render Postgres PITR is available, but its most recent ten minutes are not restorable targets. Retention varies by tier; no free-tier production database. Measure export/restore, queue replay, key recovery, DNS/API reconnect and integrity reconciliation in staging before making guarantees. [Render recovery limits](https://render.com/docs/postgresql-backups)

Release backend with backward-compatible migrations and API contracts; use expand/backfill/verify/contract sequencing. Disable automatic production migrations/deploy until owner acceptance; migrations run once with controlled lock and rollback/restore evidence. A rollback of application code must remain compatible with the migrated schema.

External gates remain budget/region/residency, merchant onboarding, mail/storage credentials, DNS/proxy evidence, offline first-admin bootstrap, backup retention/restore drills and irreversible production cutover approval. Phase 11 accepted source is e1b4e3c62238357209990e80b00cc4635f621b76; consolidated release ref a47afded49e900b75c907e7230ca4dfef5b3f91e is published. Owner's live cPanel deployment is unverified and handled separately.
