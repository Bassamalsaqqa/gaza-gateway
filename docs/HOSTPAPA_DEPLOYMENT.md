# HostPapa Full-Stack Deployment & Operations Runbook

This runbook defines the operative deployment protocol, production baseline, safety gates, operational procedures, and recovery workflows for the Gaza Gateway platform on HostPapa shared hosting.

---

## 1. Installed Production Baseline

The live production application is installed at `rel_20261024T045400_26e3155_clean` (application commit `26e3155`, Git tree `ff4a194`, 27 migrations applied). Full verified baseline identities, SHA-256 release package digests, and active backup paths are maintained in [docs/STATUS.md](STATUS.md).

> [!IMPORTANT]
> **Baseline Separation & Upgrade Kits:** The 25→27 upgrade kit used on October 24 is historical and must **never** be rerun for future updates. Any subsequent release requires a freshly authored, independently reviewed upgrade operator bound strictly to the active `26e3155` / 27-migration baseline.

---

## 2. Production Environment & Hosting Invariants

- **Sole Production Host:** HostPapa shared cPanel (`gaza5045`). Strictly no external backends, cloud databases, Docker containers, Node daemons, or GitHub Actions deployment pipelines.
- **Observed Runtime:** PHP 8.5.12 (CLI and LiteSpeed web SAPI); CloudLinux MySQL 8.4 (InnoDB default engine).
- **Filesystem Boundaries:**
  - `public_html/`: Prebuilt static frontend assets, favicon, video streams, and public entrypoint `.htaccess`.
  - `/home/gaza5045/gaza-gateway/`: Private Laravel application, shared storage, environment configuration (`.env`), private archive uploads, and release directory tree.
  - Active pointer: `/home/gaza5045/gaza-gateway/current-release.txt` identifies the active release directory.
- **Request Boundaries:**
  - Apache `.htaccess`: `LimitRequestBody 41943040` (40 MiB bound).
  - Application layer: 10 MiB per file, 25 MiB total per archive contribution submission.
- **Cron Dependency:** Single `*/10` cPanel cron job invokes the October 13 wrapper script. Never modify or delete the wrapper while the cron job references it.

---

## 3. Pre-Release Protocol & Required Gates

Every production update must pass four independent gates in strict sequence:

### Gate 1: Source Acceptance & Separate Provenance
- Application source changes must be merged into `main` after independent review.
- Application commit and upgrade operator code must maintain separate provenance. Documentation changes do not alter application binaries.

### Gate 2: Read-Only Production Preflight
Before uploading release packages, perform read-only preflight verification:
1. Verify the installed pointer (`rel_20261024T045400_26e3155_clean`) and manifest bytes.
2. Confirm exactly 27 migrations in the database ledger.
3. Validate available disk space and inode headroom.
4. Verify database connectivity and current environment hash.
5. If preflight detects any discrepancy, **stop immediately**. Do not proceed with deployment.

### Gate 3: Local Exact-Kit Rehearsal
1. Use `node scripts/build-hostpapa-update.mjs --help` and the reviewed release tooling to build one clean, exact-source full-stack candidate with explicit mode, approved HTTPS origin, output directory and locked production dependencies. This builder alone does not produce a baseline-certified upgrade operator.
2. Generate the immutable release manifest.
3. Rehearse the full upgrade flow locally against a disposable database populated with the production schema and fixture data.
4. Verify that pre-switch backups, one-shot markers, and maintenance mode engage and disengage cleanly.

### Gate 4: Owner GO
Deployment requires explicit, written owner authorization identifying the specific package hash. Past release approvals do not authorize future releases.

---

## 4. Execution & Safety Gates

When owner authorization is received, the upgrade operator executes under strict safety controls:

```
[Start Upgrade]
       |
       v
[1. Acquire Locks] --------> Installer flock(LOCK_EX | LOCK_NB) + Cron Lease
       |
       v
[2. Set One-Shot Marker] --> Record attempt ID; prevent concurrent executions
       |
       v
[3. Enter Maintenance] ----> Write maintenance.php (HTTP 503 JSON)
       |
       v
[4. Verified Consistent Backups] ---> Dump MySQL DB, backup public assets, shared configuration & private files
       |
       v
[5. Run Migrations UP] ----> Execute new migrations (Careful: MySQL DDL autocommits!)
       |
       v
[6. Atomic Pointer Switch]-> Point current-release.txt to new release directory
       |
       v
[7. Fresh PDO Check] ------> Re-establish NEW database connection (avoid timeout 4031)
       |
       v
[8. Post-Verification] ----> Verify complete migration identities/hashes, preservation, private files, manifest and health
       |
       v
[9. Release Maintenance] --> Unlink maintenance.php, release cron lease & lock
```

### Critical Operational Safeguards:
- **MySQL DDL Autocommit:** In MySQL, DDL statements (`CREATE TABLE`, `ALTER TABLE`) cause an implicit transaction commit. DDL changes cannot be rolled back via SQL transactions. If a migration fails partway through DDL execution, automatic rollback is impossible; forward recovery using a reviewed repair script is mandatory.
- **Fresh Final PDO Connection:** Backing up and copying large application files may take several minutes. To prevent MySQL inactivity disconnects (`MySQL server has gone away` / error 4031), the operator must discard stale preflight connections and open a fresh, identity-verified PDO connection for final post-switch checks.
- **Installer Lock & Cron Lease:** Upgrades must run with an exclusive flock on `/home/gaza5045/gaza-gateway/shared/installer.lock`. The cron dispatcher checks this lease and pauses scheduled tasks while maintenance is active.

---

## 5. Rollback & Forward Recovery Protocols

### Scenario A: Failure Prior to Schema Mutation
If file staging, permission checks, or backup steps fail before database migrations are applied:
1. Inspect actual pointer, public files and receipts. If recovery is required, use the reviewed operator procedure to restore a compatible previous release; do not improvise a pointer edit.
2. Restore any replaced static files from the pre-switch backup.
3. Release maintenance only after the previous application, public assets, preserved data and health checks are verified.
4. Release the installer lock and cron lease.
5. Retain all failure logs and attempt markers for post-incident analysis.

### Scenario B: Failure During or After Database Migrations
If an error occurs after migrations begin:
1. **Do not attempt an automatic database restore or run `migrate:rollback` blindly.**
2. Keep maintenance mode engaged (`HTTP 503`).
3. Inspect the migration ledger to determine exactly which migrations succeeded and which failed.
4. Prepare an independently reviewed forward-repair patch.
5. Execute the forward repair under owner supervision.
6. Once verification passes, release maintenance and resume normal cron dispatch.

---

## 6. Day-to-Day Operations & Administration

### 6.1 Admin Portal & Access Control
- English Admin: `https://www.gazaairport.com/admin`
- Arabic Admin: `https://www.gazaairport.com/ar/admin`
- Sign-in Entrypoint: `https://www.gazaairport.com/admin/signin`
- Staff accounts use cookie-based sessions with CSRF protection and 10 canonical permissions.
- Inactive sessions expire automatically according to configured session timeouts.

### 6.2 Safe CMS Publication Workflow
Editorial content for Homepage, Informational dossiers, Destinations, and Travel Guides is managed with optimistic revision locking:

```
[Draft Created / Edited]
         |
         v
[Draft Saved (currentRevision increments)] ----> Stored in CMS database; unexposed to public
         |
         v
[Bilingual Preview (EN & AR)] -----------------> Verified on preview surface
         |
         v
[Publish Request with expectedRevision] -------> Verified against current revision
         |
         v
[Published (publishedRevision updated)] -------> Immediately served to public visitors
```

1. **Public vs. Draft Separation:** Public endpoints serve exclusively records matching `publishedRevision`. Saving a draft (`currentRevision`) does not alter public pages until an explicit publish action occurs.
2. **Conflict Prevention (`expectedRevision`):** Every publication request must submit an `expectedRevision` payload field matching the current database revision. If another staff member published in the interim, the request is rejected with a conflict error (`draft_conflict`).
3. **Bilingual Verification:** Before publishing, preview both English and Arabic views to confirm layout, typography, and text flow.
4. **Preserve Custom Fields:** Editorial writes must preserve contact details, artist statement blocks, and owner SEO titles.

### 6.3 Archive Contribution Intake & Moderation
- **Private Storage:** Uploaded visitor contributions are written to private storage outside `public_html` at:
  `/home/gaza5045/gaza-gateway/shared/storage/app/private/archive_contributions/`
- **Request Boundaries:** 10 MiB per file, 25 MiB total per submission envelope, 40 MiB web-server bound.
- **Staff Moderation:** Contributions remain in private quarantine until an authorized staff member reviews rights/provenance. Intake moderation does not automatically publish uploaded files to the gallery.

### 6.4 Mail Subsystem & Outbox Management
- **Transactional Ledger:** Outbound messages are recorded with statuses: `pending`, `accepted`, `failed`, or `uncertain`.
- **No Blind Resends:** Never execute blanket resends on `uncertain` or `failed` records. Historical uncertain messages must remain logged for audit rather than resent blindly.
- **Monthly Analytics Reporting:** Automated monthly analytics reporting is opt-in and currently **turned off** (`notifications@gazaairport.com`). Do not enable automated reporting without explicit owner instruction.

### 6.5 Cron Dispatcher & Scheduled Tasks
- Single cPanel cron job configured every 10 minutes (`*/10`). Its live dependency is `/home/gaza5045/gaza-gateway/releases/rel_20261013T082656_7a8f0fa_clean/bin/hostpapa-cli`, invoked through `/usr/local/bin/php` with `shared-hosting:cron --max-seconds=25 --batch-limit=25`. Do not recreate the job from abbreviated documentation; re-read and preserve its complete installed command and log redirection.
- Preserve the actual installed cron command and its log redirection; the dated command above identifies the live wrapper dependency. Cron runs acquire an exclusive database lease. If an execution takes longer than expected, the lease prevents concurrent job execution and duplicate email dispatch.

---

## 7. Common Incident Triage & Troubleshooting

| Symptom | Likely Cause | Recommended Action |
|---|---|---|
| **HTTP 503 "Service Unavailable"** | Canonical maintenance file remains active. | Check for `/home/gaza5045/gaza-gateway/shared/storage/framework/maintenance.php`. Do not remove it merely because a process exited: verify the reviewed recovery/cutover conditions and preservation receipts first. |
| **HTTP 413 "Payload Too Large"** | Archive upload exceeds 10 MiB or Apache 40 MiB limit. | Verify file sizes; confirm `.htaccess` contains `LimitRequestBody 41943040`. |
| **Database Error 4031 ("Inactivity Timeout")** | Long-running task kept connection idle over MySQL wait timeout. | Ensure maintenance scripts close stale connections and re-open a fresh PDO connection before final verification. |
| **Cron tasks not processing queue** | Installer lock or stale database lease present. | Check if `/home/gaza5045/gaza-gateway/shared/installer.lock` is held by an abandoned process. Inspect the implemented lease storage read-only; never clear locks or attempt markers blindly. |
| **CMS Edit Conflict (`draft_conflict`)** | Concurrent edit or stale client revision token. | Reload the editorial document in the admin workspace to fetch latest `currentRevision`, re-apply changes, and publish. |
