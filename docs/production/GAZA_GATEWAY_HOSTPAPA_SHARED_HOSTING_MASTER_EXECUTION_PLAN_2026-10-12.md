# Gaza Gateway — HostPapa Shared-Hosting Recovery and Production Execution Plan

**Version:** 1.0 — 12 October 2026  
**Status:** Product-owner architecture directive; engineering execution authorized subject to non-destructive gates below  
**Repository:** <https://github.com/Bassamalsaqqa/gaza-gateway>  
**Product:** Gaza International Airport / Palestinian Airlines commemorative website  
**Owner:** Product owner (sole production authorization)  
**Engineering lead/agent coordinator:** Codex  
**Implementation agent:** AGY / Antigravity; additional delegated workers if needed  
**Independent architectural and acceptance reviewer:** ChatGPT, using direct source/Git/evidence review—not worker reports as proof

> ## IMMUTABLE ARCHITECTURE CONTRACT — READ FIRST
>
> **All production application components must run under the existing HostPapa shared cPanel account.** HostPapa shared hosting is the chosen deployment platform, not a candidate to be replaced. The target is a prebuilt React/Vite frontend, Laravel 13/PHP 8.4-compatible HTTP backend, HostPapa MySQL 8.4/InnoDB, HostPapa-hosted site/media/private files, HostPapa SMTP and permitted short-lived cPanel cron jobs. The current Git/cPanel owner deployment workflow remains authoritative.
>
> **Do not propose, provision, require or silently introduce Render, Railway, Laravel Cloud, a VPS, managed external PostgreSQL, external workers, container runtime, Node server, Redis, external object storage, or another application host.** No split hosting, no database service outside this cPanel account. A failure found on the specific account is a **blocking technical finding to diagnose within HostPapa first**, not authorization to migrate providers.
>
> This is a **historical/commemorative website**, not a functioning airport or airline. Its symbolic flight listings, free seat reservations, account management, downloadable tickets, email confirmations, CMS and media are genuine *website workflows*, **not actual flight operations**. No payments, real airline APIs, live departure/gate feeds, check-in machinery or operational integrations are in the launch scope.
>
> **Do not weaken security, consistency, the existing design, or truthful UI behavior to force an easy deployment.** If a shared-hosting limitation makes a specific feature unachievable with acceptable reliability, document the exact evidence, host-account options and minimal product-preserving solution; stop at that gate for owner decision, without changing provider or misrepresenting completion.
>
> Changes to the architecture contract require an explicit, separately recorded product-owner decision. A worker's recommendation, a repository document, or a newly chosen technical stack cannot override this contract.

---

## 1. Mission and finished product

Deliver the **entire working commemorative Gaza Gateway site on the owner's existing HostPapa shared cPanel hosting**:

1. Existing premium, responsive, bilingual EN/AR/RTL website, historical airport pages, archive, photos, video links, media, articles and SEO/performance work are preserved.
2. Existing Admin dashboard—not a substitute Admin shell—has real server-backed accounts, staff MFA/RBAC, curated symbolic destinations/aircraft/schedules/meals, content, gallery, contacts, reservations, and essential settings.
3. Visitors can create and verify an account, sign in, recover access, book a published **free symbolic** flight, choose unoccupied seats and optional meals, obtain a persistent reservation reference and polished printable/downloadable ticket, receive booking email, revisit and cancel reservations.
4. Admin publications appear on other browsers/devices without localStorage pretending to be shared authority or needing a developer rebuild for routine content edits.
5. Every visible enabled action works or is clearly/explicitly unavailable; no pretend payment, airline departure, flight status, gates, admin metrics or check-in.
6. Owner alone authorizes production deployment. Release has pinned provenance, checksums, backup and a tested recovery path.

**Scope precedence:** `docs/production/GAZA_GATEWAY_FINAL_MVP_DELIVERY_PLAN_v2.md` at the latest reviewed source is the *product scope* baseline. This document supersedes previous **hosting and database topology** decisions (Render/PostgreSQL, static-only HostPapa) for this recovery effort. Historical plans remain evidence, not active hosting authority. Resolve conflicts in favor of (1) explicit owner requirements, (2) the current MVP scope, (3) verified application behavior and security invariants, then (4) historical references.

### Out of scope / do not reintroduce

- Paid tickets, payment/refunds, payment provider integrations, pricing engines and merchant setup.
- Live/actual aircraft operations, gates, real check-in, baggage or airline operational systems.
- Nonessential UI redesign, a new frontend framework, separate admin frontend, replacing Laravel with a new PHP framework, switching to a server-rendered Node hosting architecture.
- New infrastructure vendors, GitHub Actions/CI consumption, or continuous background daemons.
- Importing browser-local demo bookings/fixtures as real production reservations.

---

## 2. Source and factual checkpoint (verified 12 October 2026)

| Reference | Value / state |
|---|---|
| Repository | `Bassamalsaqqa/gaza-gateway` |
| `main` | `c7be134bfa87ef58dcfae142b770da639863e4b3` (protected) |
| Feature branch | `phase13c/reference-authority` |
| PR #3 | <https://github.com/Bassamalsaqqa/gaza-gateway/pull/3>; **open, draft, unmerged** |
| PR #3 candidate | `cecd1c9158111c349ac63414cfcfff89db6d197f` (32 commits ahead of main, zero behind when checked) |
| `hostpapa-deploy` | `da08d452a9efbd6947e49f09a66c3f133c66240c` (protected) |
| Existing cPanel release | Prebuilt static site only; 46 prerendered HTML pages; deployment uses `.cpanel.yml` → `deploy-hostpapa.sh` to `$HOME/public_html/` |
| PR review | **10 review threads unresolved**; correction claims require independent confirmation |
| Phase 13A/B | Backend foundation and identity work locally implemented; 13B merged to main under owner-authorized local integration |
| Phase 13C | Free-booking MVP candidate includes real local PostgreSQL reference/booking/CMS/gallery/contact/email logic; **not production-accepted** |
| Current backend | Laravel 13, PHP `^8.4`, 18 migrations, PostgreSQL 17-oriented schema and queries, custom FrankenPHP container for previous design |
| Current frontend | React / TanStack / Vite prebuilt static HostPapa target; live identity/API is **nonproduction-only** |
| Known production gates | Backend routes and frontend live mode currently blocked in production by deliberate configuration; Docker deployment notes target Render; email scheduler assumes one-minute processing |

**Verify these live Git refs at task start.** If newer, record the exact fresh SHAs and reconcile, **do not blindly reset, overwrite or force push**. This is a source checkpoint, not a claim that server production deployment or local test evidence is accepted.

### Essential source entry points

- `docs/production/GAZA_GATEWAY_FINAL_MVP_DELIVERY_PLAN_v2.md` — current product objective and acceptance expectations.
- `AGENTS.md`, `README.md` — team/repo workflow; amend only conflicting hosting language.
- `backend/composer.json`, `backend/config/database.php`, `backend/app/Support/ConfigurationValidator.php` — PHP/Laravel and PostgreSQL enforcement.
- `backend/database/migrations/*` — 18 migrations, many PostgreSQL-specific SQL definitions.
- `backend/app/Mvp/Reservations/ReservationCoordinator.php` and `backend/database/migrations/2026_10_11_000007_create_mvp_reservation_tables.php` — booking/seat authority.
- `backend/app/Mvp/Mail/BookingMailWorker.php`, `backend/app/Mvp/Mail/IdentitySmtpDispatcher.php`, `backend/routes/console.php` — durable mail and scheduling.
- `backend/config/{reservations,mvp-mail,mvp-site,gallery}.php`, `backend/app/Providers/FoundationServicesProvider.php` — local/test-only production blocks.
- `src/lib/api/{identity-client-config,identity-ui-config,mvp-ui-runtime}.ts` — frontend production-live restrictions.
- `public/.htaccess`, `vite.config.hostpapa.ts` — static pages, locale/admin shells, Apache routing.
- `docs/HOSTPAPA_DEPLOYMENT.md`, `.cpanel.yml` and `deploy-hostpapa.sh` on `hostpapa-deploy` — existing safe owner deployment protocol.
- `docs/backend/deployment-topology.md` — **historical Render design to be superseded**, not followed.
- GitHub issue #1 and ten PR #3 review threads — tracked review obligations and applicability to free MVP.

### Source discipline

Before editing, collect `git status`, branch, local+remote HEADs, `git merge-base`, pending changes, and any worktrees. Protect owner/untracked artifacts. **Permanently encode this HostPapa-only architecture decision in repository governance:** add a versioned `docs/architecture/ADR_HOSTPAPA_SHARED_HOSTING_ONLY.md` and link it from root `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md` and the deployment guide; make it explicit to future agents that historical Render/PostgreSQL plans are superseded. Include a short no-drift check in each phase handback, without creating GitHub CI. Use a **new purpose-built branch** such as `hostpapa/shared-mysql-convergence` derived from the latest reviewed Phase 13C candidate (or document an equally safe topology if that branch has progressed). Do not rewrite PR #3 history or silently merge its unaccepted work into protected main. Keep one clear PR or a sequenced review stack with traceable ancestry. Leave `main`, `hostpapa-deploy`, live site and production database unchanged until owner-approved release actions.

---

## 3. Reality checks and open constraints

**HostPapa is a credible PHP/MySQL/cPanel destination, but exact account compatibility is NOT yet verified.** Do not claim it passed until actual non-destructive canary evidence exists. Previous cPanel inspection reportedly showed Apache 2.4.x, MySQL 8.4.x, PHP 8.5, cPanel Git, cron and generous PHP memory—but treat these as historical observations to recheck, not an authorization or production certification.

Known material constraints:

- Shared hosting may have **no SSH**, no root access, no Docker or long-running process supervision.
- Cron frequency is plan-dependent (possibly **10–30 minutes**), not an every-minute guarantee. Find the actual limit.
- Browser PHP and CLI PHP versions/extensions may differ; Laravel 13 must pass runtime checks.
- MySQL account database quotas, DDL privileges, connection limits, lock wait timeouts and request CPU/runtime limits matter.
- PostgreSQL `JSONB`, PL/pgSQL, deferrable FKs, SQL functions/regex/collations/timezones, clocks and error codes **do not port by simply editing `DB_CONNECTION`**.
- Existing SPA `.htaccess` intercepts dynamic routes and must explicitly route `/api/v1` before the SPA fallback; no private Laravel files may become web-accessible.
- Production mode is intentionally fail-closed today; enabling it requires explicit, reviewed production authorization and equivalent security—not `APP_ENV=local` on a live site.

### HostPapa feasibility fallback order (must stay on shared cPanel)

1. Use the **existing** HostPapa shared plan and cPanel features, with the least privilege required.
2. Ask HostPapa support to enable/confirm supported extensions, CLI PHP path, trigger permissions, database limit, cron quota or documented alternative within the **same account/plan**.
3. If necessary, assess only a **shared-hosting tier adjustment within HostPapa**, with actual documented capability improvement; never perform an upgrade without owner approval.
4. If a hard documented limitation remains, preserve evidence and propose a narrow feature or processing redesign that still meets the commemorative MVP requirements. **Stop for owner decision** if equivalence/safety cannot be demonstrated. Do not silently fall back to another provider, VPS or simulated functionality.

---

## 4. Milestones and implementation authority

### H0 — HostPapa shared-hosting capability canary (first; mandatory)

**Objective:** Prove the real account supports a secure Laravel + MySQL application and a controlled backend deployment *before* spending effort on full SQL migration.

Codex/AGY actions:

1. Offline inspect all runtime assumptions; prepare a **minimal, isolated, reversible canary** with no user/PII data, no existing table mutation, and no impact on the public site.
2. In cPanel, verify account plan, Apache/PHP web runtime, available PHP version switch, PHP CLI executable and version, Composer platform requirements, `pdo_mysql`, `openssl`, `mbstring`, `intl`, `fileinfo`, `curl`, `xml`, `ctype`, `tokenizer`, `json`, `sodium`, `zip` and Argon2id capability. Record actual required vs available extensions; do not guess.
3. Check `mysql` server version, collation, InnoDB transactions, `SELECT ... FOR UPDATE`, `SKIP LOCKED`, unique indexes, FK/`CHECK` semantics, trigger creation, JSON functions, transaction isolation, `GET_LOCK` if selected and time semantics. Validate DDL privileges on a **separate test database**, not production.
4. Check MySQL storage/database count limits, maximum connections, max allowed packet, statement/lock timeouts, file storage, real PHP execution/memory ceilings, outbound SMTP restrictions, and cron minimum interval.
5. Prove a **protected Laravel HTTP route**, same-account MySQL insert/read in a harmless test table, cron/CLI invocation, `.htaccess` API routing and cPanel Git package-copy capability (release staged outside `public_html`).
6. Prove safe cleanup/removal of the canary and its test data. No public phpinfo pages, diagnostic tokens, raw exception traces, database credentials or exposed `/vendor`, `.env`, `storage`, logs.
7. Capture a sanitized `H0_HOSTPAPA_CAPABILITY_MATRIX.md`, proof descriptions, constraints, exact versions, cPanel commands/UI steps, photos/screenshots only if sanitized, and a clear `PASS` / `BLOCKED` / `FAIL` conclusion. Explicitly classify assumptions separately from direct tests.

**H0 gate:** Proceed toward HostPapa production only when required runtime functions are demonstrated or a specific supported cPanel workaround is proven. If account access is unavailable to Codex, **prepare the canary and exact minimal owner-assisted cPanel steps, continue non-invasive local H1 work in parallel, and mark H0 UNVERIFIED**—do not fabricate results or block all offline engineering. No real credentials in chat, commits or evidence.

### H1 — PostgreSQL 17 → MySQL 8.4 source convergence

**Objective:** Preserve all required behaviors and security/consistency invariants; do not change product scope.

Tasks:

1. Inventory every SQL migration, raw `DB::statement/unprepared/select`, PG-only function, `::` cast, JSONB operation, case-insensitive unique index, `DEFERRABLE`, trigger, partial index, `RETURNING`, collation, timezone expression, conflict/upsert, lock and advisory lock. Produce exact module-by-module migration matrix.
2. Implement MySQL-compatible schema with InnoDB, utf8mb4 and explicit binary/case-sensitive identifiers where required; decide a consistent UUID representation (`CHAR(36)` acceptable) and UTC high-precision timestamps. Preserve normalized unique emails and case/Unicode invariants.
3. Rework immutable history, digest validation, revision compare-and-swap, cross-row authorization constraints, seat uniqueness, append-only audit and race-safe cancellation. Where MySQL lacks an exact PG construct, design **equivalent serializable transactional protocols with constraints and/or supported triggers**; record any weakened invariant as a blocker, not a silent compromise.
4. Replace PostgreSQL error/SQLSTATE mapping, database-clock operations and queries with proven MySQL equivalents. Protect against `CHECK`/`NULL` behavior differences, deadlocks, lock timeouts, retry exhaustion and data corruption.
5. Use `SELECT ... FOR UPDATE` and unique seat-claim keys in transactions so two users racing for the same seat cannot both succeed; protect idempotency/replay, cancellation/seat release, outbox single logical delivery and admin/public shared state.
6. Preserve password hashing, identity/session revocation, MFA, RBAC, CSRF, proof verification and expiry, no spoofed rate identities.
7. Update configuration/runtime preflight to accept **only explicitly approved MySQL production connection**, with test DB separate and placeholders rejected. Keep secure default failures; no unsafe SQLite/mock fallback.
8. Prefer direct in-place port on the **feature/convergence branch** rather than an unnecessary long-term dual-database abstraction. Preserve original source and tests in Git history and evidence.
9. Run focused MySQL HTTP/transaction tests. Critical cases: seat race, duplicate confirmation, rollback after failed write, two-editor CMS conflict, guest/other-account access denied, password reset replay, mail-worker lease race, cancellation vs email issuance, retry on deadlock, migrations up and restoration from a synthetic test backup.

**H1 gate:** Actual MySQL 8.4 tests demonstrate the same *behavioral* contract as accepted PG candidate. All migrations run on a fresh database with correct constraints; no known serious data integrity regressions. Local evidence pinned to exact tested SHA, not merely unit mocks.

### H2 — Secure PHP shared-hosting runtime and mail/cron redesign

**Objective:** Run Laravel behind Apache/PHP on shared hosting without Node, FrankenPHP, Docker, Redis or supervised daemon.

Tasks:

1. Remove **production runtime dependency** on Docker/Render/continuous `queue:work`. Historical Docker artifacts may remain if clearly not in active deployment.
2. Add deliberate, typed secure production activation to reservations, CMS/editorial, gallery, contact/site, admin and user identity, mail settings and SMTP; keep demo/mock fixtures strictly isolated. Do not bypass with `APP_ENV=local` or public debug settings.
3. Implement a shared account origin strategy, preferably same-origin `https://www.gazaairport.com/api/v1` with exact trailing-path behavior. Preserve secure HttpOnly cookies, CSRF/Origin, server-side RBAC, no-store private responses, correct HTTPS detection and safe rate-limit identity. Update frontend live client validation to support the production origin **only with explicit owner release flags and no mock fallback**. If host constraints require `api.gazaairport.com`, it must still resolve to the **same cPanel account**; verify its CORS/cookie consequences before choosing.
4. Replace continuous mail processing with **post-commit bounded immediate delivery attempt where safe** plus a **short-lived, lease-protected cron replay/cleanup worker** at the actual allowed cron cadence. Database commit must occur before mail I/O, and no sensitive identity row locks should be held across slow SMTP. Maintain durable issuance/revocation semantics; mark ambiguous SMTP outcomes as uncertain, not automatically resent. Use bounded deadlines, max-batch, overlap protection and backoff.
5. Clearly distinguish `reservation confirmed`, `email queued`, `SMTP accepted`, `delivered` (only if independently evidenced), `failed`, and `uncertain`. A failed email must not erase booking. User-initiated resend must not duplicate logical proof sends, bypass throttles or allow account enumeration.
6. Enable HostPapa authenticated SMTP with TLS, operator-approved host/port, write-only encrypted credentials and an SMTP delivery test to a real external inbox. Validate HostPapa sending quota and SPF/DKIM/DMARC; do not assume SMTP acceptance equals receipt. Protect sender credentials and mail secrets.
7. Use private writable directories outside web root for Laravel application, cache, logs, key/material, ephemeral storage; no uploaded executable code exposed. Historical public media may remain static under controlled public paths. If private file provider is necessary, adapt safe local private storage only after threat review.
8. Verify frontend API errors are actionable and do not degrade silently to localStorage. Do not misrepresent historical/symbolic flights as operational airline services.

**H2 gate:** Production-profile Laravel boots and handles real HTTP on Apache/PHP. Credentials/production secrets stay private; all enabled flows use MySQL shared state; no web/queue request requires an always-on server process; email and cleanup have explicit degraded-mode behavior.

### H3 — Full offline packaging and cPanel deployment path

**Objective:** Extend *existing* owner-controlled Git/cPanel delivery to deploy frontend + private PHP backend as one source-pinned release.

Tasks:

1. Preserve `vite.config.hostpapa.ts`, static prerendered public pages, EN/AR shells, Admin shells, media links, compiled assets and successful `hostpapa-deploy` history. Avoid broad redesign.
2. On a build machine, install pinned Composer prod dependencies with `--no-dev --optimize-autoloader` using a compatible PHP platform and locked `composer.lock`; build the exact frontend static release and verify asset references. Do not require `composer`, `npm`, Docker, build tools or SSH to run on HostPapa.
3. Define source SHA, release manifest, SHA-256 file hashes, artifact identity, permitted public/private paths, Composer platform check, protected configuration injection and **owner approval**. Keep secrets and `.env` out of the repository/build artifact.
4. Extend `.cpanel.yml` + `deploy-hostpapa.sh` to deploy private immutable application release under `$HOME/...` outside `public_html` and only `index.php`/safe public files plus static frontend into the document root. No recursive deletion of unrelated cPanel files. No symlinks or shell constructs unless H0 establishes compatibility and path safety; provide safe non-symlink fallback.
5. Route `/api/v1` **ahead of** all frontend SPA rewrites in Apache `.htaccess`; preserve real 404 for missing assets and static-page precedence. Prove API path/host schemes after internal rewrite and protect web-visible `api` location.
6. Design controlled database migration execution without SSH (one-time protected PHP/CLI bootstrap via approved cPanel cron, or approved control available in H0). It must authenticate, be non-public or time-scoped, require release/approval identity, be safely idempotent and leave no re-usable public migration endpoint. Never auto-run destructive migrations on page load.
7. Keep persistent uploads/storage/logs and configuration separate from immutable release code. Create readable operator deployment and rollback instructions; prevent half-updated frontend/backend and preserve DB schema compatibility across rollback. Include pre-deployment backup, maintenance handling, fail/rollback behavior and post-deploy smoke checks.
8. Use a **staging copy within the SAME HostPapa shared cPanel account**, separate DB, credentials and protected domain/path where supported. Do not treat staging as production or mix user data.

**H3 gate:** Exact-source package can be published and rolled back through cPanel Git + documented safe steps without Docker, SSH, server-side Composer/npm, cross-host dependencies or secret exposure. Existing static release process remains intact until owner authorizes replacement.

### H4 — Integrated HostPapa staging acceptance

**Objective:** Demonstrate every active MVP workflow *on the real HostPapa shared-hosting runtime* (isolated test data).

Minimum scenario matrix (EN and AR, desktop + representative mobile; independent browsers where relevant):

1. Frontend/Apache routes: homepage, historical Past/Present/Future, gallery, articles/video links, language switching, static assets, missing-asset 404, deep-linked Admin/login, `/api/v1` JSON/error codes.
2. Identity: register, verify email, login, logout, reset, profile/travelers, staff MFA, roles, CSRF failures, session expiry and guest/unauthorized protections.
3. Admin: actual existing UI creates/updates/publishes curated destinations, aircraft/layout, symbolic schedules/dates and meal options; public fresh browser sees results; no misleading demo counts.
4. Reservations: passenger sees published offerings and live occupancy, confirms a free reservation, receives persistent reference and printable PDF/ticket, My Bookings reflects it, Admin sees it; concurrent users race for same seat -> exactly one success; cancellation releases the correct seat; retries are safe.
5. CMS/gallery/contact: modify historic/editorial content and gallery metadata/source attribution, publish, verify independent browser sees it without cPanel redeploy; contact message persists in staff inbox; editor permission enforcement and revision restore checked.
6. Email: real external inbox receives verification/reset/booking test emails, with correct EN/AR content; test bounded cron recovery, mail failures and retries, uncertain-state management, explicit status truth.
7. Persistence: data survives refresh, new browser, process restart and a compatible redeploy; no accidental fallthrough to mock browser state.
8. Security: check dotfiles/private paths, cookies, CSRF, idempotency, origin/host spoofing, rate limits, known SQL-injection surfaces, log leaks, credentials, server headers and private documents.
9. Resilience: backup and **restore to a disposable isolated database**, validate data integrity after restore, demonstrate rollback of immutable code release and confirm no data loss from a routine restart.
10. Resource safety: check representative response time, memory, CPU/resource throttling, MySQL connection pressure and cron conflicts within actual shared plan.

Do focused regression tests on changed areas and **one consolidated critical-path** local + HostPapa staging verification, not repetitive legacy full suites or GitHub Actions. Require actual HTTP/DB evidence for each material invariant; a simulated unit test alone is insufficient.

**H4 gate:** No P0 broken functionality, incorrect shared state, security-critical exposure or unresolved double-booking. If hosting quotas are materially exceeded, investigate optimization/shared-tier limits first, without architecture drift.

### H5 — Independent acceptance, release governance, owner launch

**Objective:** Produce one defensible complete release and controlled cutover.

1. Codex integrates AGY output, pushes pinned reviewed commits/PRs with source + manifest + targeted test reports and a precise defect/exception register.
2. Independently revisit ten PR #3 review threads on the latest converted code; do not mechanically close them based on old PostgreSQL assertions. Reconcile GitHub Issue #1 only for still-applicable invariants; payment/refund and infant operations remain out of MVP. Preserve security and owner-authorized publication governance.
3. Request the independent reviewer to inspect actual source/diffs, MySQL SQL semantics, concurrency, deployment file layout, exposed endpoints, credential isolation, and acceptance evidence. No self-certification based solely on Codex/AGY reports.
4. Produce final user-visible P0 functional checklist and deployment packet. Owner approves any final PR merge, changes to `hostpapa-deploy`, cPanel deployment, real mailbox settings, production DB migration, or DNS/domain changes. No automatic deployment/merge.
5. After explicit owner GO, back up current site and database; execute documented controlled migration + cPanel Git deploy; validate `www`/apex HTTPS, real user journey, email, published CMS and rollback readiness. Track exactly which source SHA is deployed.
6. Log accepted source and deployment receipts; update canonical roadmap/README and retire previous Render/PostgreSQL topology as **historical** only.

**H5 gate:** Owner-deployed complete HostPapa site, production read/write and email flows proven, backup/restore and rollback evidence retained, no exposed fake controls. Do not claim live before the owner confirms actual cPanel action and independent smoke evidence exists.

---

## 5. Cross-cutting non-negotiable invariants

**Data integrity and concurrency**

- Seat allocation uniqueness at DB level + transactional capacity validation; cancellation cannot free another passenger's claim; idempotent retry means no duplicate reservations; no transaction prematurely committed on exception.
- CMS/gallery revision correctness, explicitly authorized Publish, append-only audit and trustworthy source attribution; no unpublished/private content leaked.
- Identity credentials, proofs, MFA and sessions remain protected with replay suppression, scoped ownership, bounded limits and database-backed authority.
- Database record timestamps are UTC consistently; IANA symbolic offering time zones are validated by a known ruleset, not accepted arbitrary strings.

**Operational integrity**

- No secret, raw PII, token or private document in Git, public frontend assets, log messages, release manifest, debug output or diagnostic pages.
- Preserve `APP_DEBUG=false`, HTTPS-only production, protected app key and strict host/origin rules; never use dev environment to make production features work.
- Short-lived cron must not overlap itself uncontrollably; bounded mail attempts, honest statuses and cleanup retention. Operator has a clear way to detect failures using actual evidence.
- No automatic production migrations, production content imports, PR merges, GitHub Actions, host account upgrades or paid purchases.
- Keep existing photos/videos/articles and owner-provided historical media correctly credited and discoverable. Do not silently delete imported content.

**Performance and UX**

- Static/public site remains performant with same locale-specific shell strategy. Shared CMS changes render at runtime in fresh browsers; identify and correct static SEO/content snapshot inconsistencies without rebuilding the entire frontend per content update.
- No regression of desktop/tablet/mobile booking card, gallery, Arabic, RTL, accessibility, keyboard use or Admin workflows.
- Clearly identify all symbolic offerings as commemorative context without cluttering every ticket with compulsory repeated disclaimers. No live airport operational claims.

---

## 6. Required evidence and acceptance artifacts

Codex maintains a small, current status file (e.g. `docs/production/HOSTPAPA_SHARED_HOSTING_EXECUTION_STATUS.md`) with:

| Field | Required content |
|---|---|
| Current phase | H0–H5, `NOT STARTED / IN PROGRESS / BLOCKED / READY FOR REVIEW / ACCEPTED` |
| Branch / HEAD | Full exact local/remote SHA, clean tracked worktree, PR link |
| Product/hosting guardrails | Explicit `HostPapa shared cPanel + PHP + MySQL`, no drift |
| Files / scope | Paths changed and functional effect; risk-level summary |
| Runtime evidence | Which tests truly executed, in what environment, database version, exact source SHA |
| Host evidence | H0 actual capabilities; staging release and requests, sanitized; no claims beyond direct verification |
| Security / data | Owner of secrets, backups, affected databases, isolation and rollback |
| Open issues | Repro, severity, owner, mitigation and gating disposition |
| Next action | Concrete task or acceptance request—not vague progress |

Artifacts expected at major gates:

- `docs/production/H0_HOSTPAPA_CAPABILITY_MATRIX.md` and sanitized canary proof.
- `docs/production/H1_MYSQL_CONVERSION_AND_INVARIANT_MATRIX.md` with old PG invariant → MySQL implementation → focused negative test.
- `docs/production/H2_SHARED_HOSTING_RUNTIME_MAIL_SECURITY.md` with cron quotas/SMTP status machine.
- `docs/production/H3_CPANEL_RELEASE_AND_ROLLBACK.md` plus verified package manifest.
- `docs/production/H4_HOSTPAPA_STAGING_ACCEPTANCE.md` with real HTTP+DB proof and restoration exercise.
- `docs/production/H5_PRODUCTION_GO_NO_GO.md` plus exact launch runbook.

Avoid bloated reports: these are **decision receipts** with traceable proof, not lengthy re-statements of the roadmap.

### Review cadence / no micromanagement

Codex delegates bounded work packages to AGY, reviews code and produces tested commits. Do not ask the owner about implementation details already decided here. Use the best minimal implementation preserving scope and invariants. Request independent architect review only at **H0 capability conclusion, H1 data-integrity completion, H3 deploy-package readiness, and H4/H5 launch acceptance**, plus any severe newly discovered risk. Normal H2 work can proceed without another conversation if gates permit. Keep implementation local until approved remote actions.

Do **not** repeatedly run the entire legacy suite. For code changes run relevant focused checks; at each major gate run one consolidated relevant integration set with exact SHA. Do not enable or depend on GitHub Actions—owner's CI quota policy remains in force.

---

## 7. Decision and blocking protocol (anti-drift)

When a worker encounters a problem:

1. State **observed evidence** (path, query, host capability, error, version) separately from hypotheses.
2. Find the smallest repair that preserves **existing HostPapa shared cPanel** and the commemorative MVP.
3. Test a narrow repro; retain expected success and failure evidence.
4. If correction alters public behavior, database invariants or security, record trade-off and get independent review. Require each PR/major handback to state `HostPapa shared-only architecture preserved: YES/NO` and identify any deviations.
5. If the account demonstrably cannot provide a required capability, present *HostPapa shared* remedies/support questions/possible authorized shared tier change. **Do not start a Render/VPS migration discussion as the default.** Stop and ask the owner only if no safe in-scope remedy exists.

No worker or agent may reinterpret the owner's original hosting commitment based on convenience. Likewise, do not promise that H0 passed when there is no real cPanel evidence.

**Immediate order:** Refresh refs and source inventory → H0 offline audit + safe canary → H1 MySQL proof work concurrently as useful → H0 pass → H1 gate → H2 runtime → H3 package → H4 actual HostPapa staging → H5 independent release and owner-controlled production cutover.

---

## 8. Single launch prompt for Codex (copy as-is)

> You are the engineering lead and agent coordinator for `Bassamalsaqqa/gaza-gateway`. Read and execute `GAZA_GATEWAY_HOSTPAPA_SHARED_HOSTING_MASTER_EXECUTION_PLAN_2026-10-12.md` **as the controlling product-owner architecture directive**. If the file is not yet in the repo, read the supplied local copy first and commit it to `docs/production/` on a safe feature branch (do not push to `main` without acceptance).
>
> **Absolute target:** complete Gaza Airport's commemorative free-booking MVP entirely on the owner's **existing HostPapa shared cPanel hosting**. Production stack: prebuilt React/Vite + Laravel 13/PHP 8.4+ + HostPapa MySQL/InnoDB + HostPapa SMTP + bounded cPanel cron + private files under the same cPanel account. **Never substitute Render, VPS, Railway, Laravel Cloud, PostgreSQL as a remote service, Docker hosting, a second application host, or a continuous worker.** Do not broaden to real airline operations/payments.
>
> Refresh `origin/main`, `origin/phase13c/reference-authority`, `origin/hostpapa-deploy`, PR #3, review threads, Issue #1 and the latest MVP v2 scope. Starting checkpoint: main `c7be134bfa87ef58dcfae142b770da639863e4b3`, PR #3 `cecd1c9158111c349ac63414cfcfff89db6d197f` (draft), HostPapa release `da08d452a9efbd6947e49f09a66c3f133c66240c`. Treat these as historical anchors if remote HEAD moved. Preserve all accepted code, UI/UX, gallery/archive content, admin design, booking flow, bilingual experience and manual cPanel Git deployment.
>
> Coordinate AGY as implementation worker. Begin with **H0 HostPapa shared-account compatibility canary and evidence**, then execute H1–H5 autonomously under the document's gates: MySQL conversion preserving race/integrity constraints; safe production-mode Laravel/React activation; short-lived cron + durable email-outbox semantics; reproducible private PHP/static artifact via cPanel Git; isolated HostPapa staging; real cross-browser/admin-to-passenger E2E; independent acceptance; final owner-controlled GO. If HostPapa account access is unavailable, prepare exact sanitized owner-assisted canary steps and proceed with non-destructive local engineering while marking host validation UNVERIFIED. No production mutation or fabricated verification.
>
> Create a purpose-built feature branch from the reviewed Phase 13C candidate, avoid force pushes, protect unrelated files and protected branches, and keep release identity exact. Update the canonical status/evidence files after major gates; supersede old Render/PostgreSQL production topology text only when implementation is proven. Use **focused tests, no GitHub Actions and no broad re-runs per correction**. Push reviewed working commits for independent review. Do not merge, deploy, provision/upsize hosting, change DNS, configure live secrets or modify production data without explicit owner authorization.
>
> Do not return repeatedly for microdecisions. At each major gate report: actual SHAs, implementation changes, focused tests, account evidence versus assumptions, security/data integrity status, open blockers, and a crisp pass/fail/next-step verdict. Start now with repo re-baseline and H0; continue directly into safe local H1 work where useful. **No architecture drift.**

---

## 9. Definition of done

The entire Gaza Gateway commemorative experience is working from the existing HostPapa shared cPanel account: public website, existing Admin, accounts, published content and media, symbolic flights, free seat-constrained reservations, printable tickets, real mailbox email and operational recovery. A fresh user and a fresh staff browser share durable MySQL state. The owner knows the exact deployed SHA, can recover from failure without secret leaks or losing unrelated cPanel content, and explicitly authorized the release. No outsourced app/db infrastructure. Any unverified item is identified rather than called complete.
