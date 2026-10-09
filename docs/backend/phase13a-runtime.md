# Phase 13A: Immutable Runtime Architecture & Bounded Outage Verification

## 1. Overview & Architecture

Phase 13A Foundation02 delivers an immutable container image candidate and local runtime proof using Laravel 13, PHP 8.4, and PostgreSQL 17 on loopback `127.0.0.1:18086`. The design eliminates reliance on development servers (`artisan serve`), enforcing least-privilege runtime security, fail-closed configuration validation, and bounded database outage deadlines (<= 8s).

> [!IMPORTANT]
> **Status**: Local immutable-image candidate proof only. Live cloud production services are NOT ready, and Phase 13A is NOT independently accepted. Reachable external staging, remote DNS/TLS, edge proxy trust, and automatic backend CI pipelines remain deferred owner gates. Phase 13B (Authentication) remains strictly unstarted.

### Primary References
- [Laravel Deployment Documentation](https://laravel.com/framework/docs/deployment) (FrankenPHP, document root, directory permissions, runtime configuration)
- [FrankenPHP Docker Guidance](https://frankenphp.dev/docs/docker/) (PHP 8.4 Debian variants, non-root `www-data` UID 33, unprivileged ports)
- [FrankenPHP Caddy Configuration](https://frankenphp.dev/docs/config/) (Explicit Caddyfile, classic request mode without Octane)
- [Render Web Services Specification](https://render.com/docs/web-services) (`0.0.0.0:$PORT`, default 10000, edge TLS termination)
- [Render Deploys & Graceful Shutdown](https://render.com/docs/deploys) (SIGTERM propagation, 30s shutdown window)
- [PHP PDO pgsql Driver Source](https://raw.githubusercontent.com/php/php-src/PHP-8.4/ext/pdo_pgsql/pgsql_driver.c) (`PDO::ATTR_TIMEOUT` mapping to libpq `connect_timeout`)
- [PostgreSQL 17 Connection Parameters](https://www.postgresql.org/docs/17/libpq-connect.html) (`connect_timeout`, `sslmode`)

---

## 2. Immutable Image Architecture & Environment Audit

The production image (`backend/Dockerfile.production`) uses a multi-stage build:

1. **Builder Stage (`dunglas/frankenphp:1-php8.4`)**:
   - Pinned digest: `sha256:e9a56d27e7f0c30bb1ad122dfee024a014081c4501782be65424b57016f3104a`
   - Official pinned Composer 2: `composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac` (Composer 2.8.x)
   - Production install: `composer install --no-dev --optimize-autoloader --no-scripts`
   - Excludes developer dependencies, test suites, and dev tooling from final image.

2. **Runtime Stage**:
   - PHP Platform Audit: PHP 8.4.26 (cli) (ZTS), Zend Engine v4.4.26, Zend OPcache v8.4.26.
   - Web Server: FrankenPHP v1.13.0, Caddy v2.11.7.
   - Installed extensions: `pdo_pgsql`, `pgsql`, `intl`, `bcmath`, `zip`, `pcntl`, `opcache`.
   - Explicit Caddy configuration (`/etc/caddy/Caddyfile`):
     - `admin off`: disables internal administrative API on port 2019.
     - `auto_https off`: relies on edge TLS termination (Render).
     - `:{$PORT:10000}`: listens on configurable unprivileged port (default 10000).
     - `root * /var/www/html/public`: restricts web document root strictly to public directory.
     - `php_server`: classic request mode (standard PHP request life cycle, avoiding persistent state leakages).
     - `log { output discard }`: prevents unredacted URI, query parameter, and header logging.
   - Filesystem security invariants:
     - Root-owned application code (`chown -R root:root /var/www/html`, `chmod 755`).
     - Non-root runtime user: `USER www-data` (UID 33, GID 33).
     - Ephemeral writable directories only: `/var/www/html/storage`, `/var/www/html/bootstrap/cache`, `/config`, `/data`.
     - Build context hygiene: `.dockerignore` excludes `.git`, `.env*`, `vendor`, `tests`, `phpunit.xml`, `bootstrap/cache/*.php`, `scratch`, and private certificates.
     - Base image healthcheck disabled: `HEALTHCHECK NONE` prevents bogus Caddy admin port 2019 failures.

---

## 3. Container Roles & Process Lifecycle

A single immutable image serves multiple roles selected via `/usr/local/bin/docker-entrypoint.sh`:

| Role | Command / Invocation | Description |
| :--- | :--- | :--- |
| `web` | `docker-entrypoint.sh web` | Validates PORT (1..65535) with fixed non-reflective error, boots Laravel Kernel to validate configuration fail-closed before opening socket, then `exec`s FrankenPHP/Caddy. |
| `worker` | `docker-entrypoint.sh worker` | Performs bounded preflight check avoiding crash loops when migrations are pending, then executes `exec php artisan queue:work --sleep=1 --tries=3 --timeout=20`. Bounded job timeout (20s) strictly below Render's 30s shutdown window and DB queue `retry_after` (90s). |
| `migrate` | `docker-entrypoint.sh migrate` | Runs `exec php artisan migrate --force`. Executed during dedicated deployment migration steps via one-shot migrator service (`gza_migrator` credentials). |
| `artisan` | `docker-entrypoint.sh artisan <args>` | Executes explicit administrative or diagnostic CLI commands. |

### Startup Diagnostics & Signal Propagation
- **Non-Reflective Diagnostics**: `entrypoint.sh` logs fixed safe errors for invalid `PORT` and unknown `ROLE`; arbitrary shell/env values are never echoed to stderr.
- **Fail-Closed Configuration Validation**: Web role boots Laravel in-memory (`php artisan --version`) prior to opening its listening socket; missing or invalid `APP_KEY` fails startup immediately (exit code 1) before accepting connections.
- **Worker Signal Reception**: Worker runs as PID 1 directly (`/proc/1/cmdline: php artisan queue:work --sleep=1 --tries=3 --timeout=20`), ensuring immediate reception of `SIGTERM` signals from Render orchestrator.
- **Zero Automatic Migrations**: No migrations run automatically on container boot; migrations require explicit invocation via the one-shot `migrator` service.

---

## 4. PostgreSQL 17 Least-Privilege & TLS Configuration

Local deployment simulation (`backend/docker-compose.runtime.yml`) enforces PostgreSQL 17 least-privilege role separation over TLS:

```
[ docker-compose.runtime.yml ]
  ├── postgres-runtime (internal alias: db.gazaairport.internal, no published host port)
  │     ├── SSL enabled with test certificates in $PGDATA (ssl = on)
  │     ├── gza_migrator: DDL owner role (CREATE/DROP/ALTER tables and migrations)
  │     └── gza_runtime:  DML least-privilege role (SELECT, INSERT, UPDATE, DELETE on cache/jobs)
  │                       (CREATE, DROP, ALTER revoked on schema public)
  ├── migrator (one-shot migration profile, connects as gza_migrator, exits on completion)
  ├── web (published locally to 127.0.0.1:18086 only, Host: api.gazaairport.com, connects as gza_runtime)
  └── worker (same image, runs queue:work as gza_runtime)
```

### Verified Role Boundaries
- `gza_runtime` attempting `CREATE TABLE`: fails with `ERROR: permission denied for schema public` (SQLSTATE `42501`).
- `gza_runtime` attempting `DROP TABLE cache`: fails with `ERROR: must be owner of table cache`.
- `gza_runtime` performing `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `cache` and `jobs`: succeeds.
- `gza_migrator` executing migrations: succeeds.

---

## 5. Outage Deadlines & Bounded Failure Modes

### Driver-Level Validation Rules (`ConfigurationValidator::validateTimeouts`)
1. **Connect Timeout**: Inspects `$config['options'][\PDO::ATTR_TIMEOUT]`. Must be an integer between 1 and 5 seconds. Mandatory in deployment (`APP_ENV=production` or `staging`).
2. **Statement Timeout**: Inspects `$config['server_options']['statement_timeout']`. Must be an integer between 100 and 5000 milliseconds. Mandatory in deployment.
3. **Lock Timeout**: Inspects `$config['server_options']['lock_timeout']`. Must be an integer between 100 and 5000 milliseconds. Mandatory in deployment.
4. **Contradiction Guard**: Any top-level aliases or URL query parameters (e.g. `connect_timeout=...`) parsed by `ConfigurationUrlParser` are validated against actual driver options; mismatched or unbounded values trigger fail-closed configuration exceptions.

### Historical Context & Measured Fault Scenarios (`test-runtime-outage-deadlines.mjs`)

> [!NOTE]
> **Historical Evidence**: In Foundation01, during database outage, `/api/v1/version` failed with an outage deadline violation (>8s, measured ~30s) because PHP's default libpq `connect_timeout` was 30s. Foundation02 resolved this by configuring `PDO::ATTR_TIMEOUT = 3` and `server_options.statement_timeout = 3000ms`, bounding all database outage failure modes to strictly <= 8s.

| Scenario | Injected Condition | Measured Behavior | Status |
| :--- | :--- | :--- | :--- |
| **Scenario A: Port Refusal** | `postgres-runtime` container stopped (TCP RST) | Liveness: **200 OK (13ms)**<br>Readiness: **503 Service Unavailable (12ms)**<br>Version: **503 Service Unavailable (15ms)**<br>Recovery: **200 OK in 1s** | **PASS** |
| **Scenario B: Real TCP Timeout** | Ephemeral TCP listener accepting socket and hanging | PDO connect timeout (derived from loaded config): **Enforced at 3.003s** (strictly <= 8.0s deadline)<br>Error: `SQLSTATE[08006] timeout expired` (safe code: 7) | **PASS** |
| **Scenario C: Statement Cancellation** | `SELECT pg_sleep(5);` with statement_timeout=3000ms | PostgreSQL statement cancellation: **Enforced at 3.014s** (strictly <= 8.0s deadline)<br>Error: `SQLSTATE[57014]` canceled | **PASS** |

Harness containment invariants:
- Rejects non-loopback URLs and unsupported project names prior to any Docker/HTTP action.
- Total HTTP request deadline (8000ms) with 64 KiB buffer cap and clean timer clearance on all paths.
- Guaranteed recovery gate in `finally` verifying `/api/v1/health/ready` returns 200 OK before printing PASS.

---

## 6. Architectural Conventions & Invariants

- **Timestamps**: RFC 3339 / ISO 8601 UTC format strictly (`gmdate('Y-m-d\TH:i:s\Z')`).
- **Identifiers**: Generated request correlation IDs are generated UUIDv4 (`X-Request-Id`). Accepted entity identifiers follow RFC 4122. Domain identity conventions remain Phase 12 codecs (flight numbers e.g. `PS 204`, PNR references e.g. `GZA-7K8P`, IATA airport codes e.g. `GZA`), NOT universal UUIDv4.
- **Database Migrations**: Expand/contract design pattern. Migrations must be non-breaking and additive. Table/column drops require multi-phase migration steps.
- **Domain Seeds Boundary**: Phase 13A establishes infrastructure tables (`cache`, `cache_locks`, `jobs`, `failed_jobs`, `job_batches`) only. Domain seeds, booking data, user accounts, and authentication remain deferred to later phases. Phase 13B authentication remains strictly unstarted.

---

## 7. Local Reproducible Recipe

### 1. Build Production Image
```bash
docker build -f backend/Dockerfile.production -t gaza-gateway-backend:phase13a-runtime backend
```

### 2. Generate Fresh Disposable Application Key
Generate a 32-byte base64 application key and place it into an ignored `.env.runtime` file (or set `$env:APP_KEY` in shell):
```powershell
# PowerShell
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");fs.writeFileSync("backend/.env.runtime","APP_KEY=base64:"+crypto.randomBytes(32).toString("base64")+"\n",{flag:"wx"});'
```
Or with Node.js:
```bash
APP_KEY="base64:$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
echo "APP_KEY=$APP_KEY" > backend/.env.runtime
```

### 3. Launch PostgreSQL Runtime Service
```bash
docker compose --env-file backend/.env.runtime -f backend/docker-compose.runtime.yml up -d postgres-runtime
```

### 4. Run One-Shot Migrations as Migrator Role
```bash
docker compose --env-file backend/.env.runtime -f backend/docker-compose.runtime.yml run --rm migrator
```

### 5. Start Web and Worker Services
```bash
docker compose --env-file backend/.env.runtime -f backend/docker-compose.runtime.yml up -d web worker
```

### 6. Verify OpenAPI Contracts & Generate Fresh Captures
```bash
node backend/scripts/verify-runtime-openapi.mjs --run-id local_runtime_review_001
```

### 7. Execute Verifier Subprocess Controls (Negative & Positive)
```bash
node backend/scripts/test-runtime-verifier-negative-controls.mjs
```

### 8. Execute Fault Injection & Outage Deadlines Suite
```bash
node backend/scripts/test-runtime-outage-deadlines.mjs
```

### 9. Run Committed Feature Test Suite

First follow the separate development bootstrap in [phase13a-foundation.md](phase13a-foundation.md). The immutable image omits development dependencies and tests.
```bash
docker compose -f backend/docker-compose.yml exec -e APP_ENV=testing -e DB_CONNECTION=pgsql_test -T app ./vendor/bin/phpunit
```

---

## 8. External Production Gates & Manual Checklist

Local proof exercises simulated production settings on loopback. The following external infrastructure prerequisites remain owner-gated and must be satisfied prior to live cloud deployment:

- [ ] **Hosting Plan & Region**: Approved paid Render Web Service and Private Service (worker) in target region (e.g. Frankfurt `fra`).
- [ ] **PostgreSQL Provisioning**: Managed PostgreSQL 17 instance on Render with TLS, private networking, and automated backups.
- [ ] **Network Isolation**: Strict firewall rules ensuring PostgreSQL accepts traffic only from application private VPC/bridge, with public ingress disabled.
- [ ] **Role Separation Setup**: Production DDL owner (`gza_migrator`) and runtime DML user (`gza_runtime`) provisioned in production DB.
- [ ] **Secret Management**: High-entropy 32-byte production `APP_KEY` and database credentials stored in Render Environment Secrets. Never commit or bake into images.
- [ ] **Edge Proxy & Header Trust**: Verify Render edge proxy chain before configuring trusted proxies. Keep `TrustProxies` restrictive until exact edge IP ranges are confirmed.
- [ ] **Custom Domain & TLS**: DNS CNAME records configured for `api.gazaairport.com` with managed edge TLS certificates.
- [ ] **Mail & Storage Provider Configuration**: Transactional mail and secure object storage credentials configured for production (Phase 13A uses fail-closed local stubs).
- [ ] **Backup & Disaster Recovery**: Verified automated snapshot schedules and point-in-time restore drill.

Codex final review clarification: the worker reported 39 PHP tests from the older running Foundation01 checkout. That does not verify the 14 new timeout cases in this source. The integrated test run in [phase13a-review.md](phase13a-review.md) is authoritative. Codex removed the startup job-consuming one-second probe; complete migrations before starting the worker. The key recipe uses cryptographic Node randomBytes, never PowerShell Get-Random. Runtime captures reject existing output directories, invalid CLI flags and ambiguous targets; port 18099 is reserved for isolated fake-server controls.
