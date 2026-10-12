# HostPapa H0 Capability Canary — Operator Runbook

**Milestone:** H0 Capability Verification
**Platform:** HostPapa Shared cPanel Hosting (Existing account only)
**Safety Classification:** NON-DESTRUCTIVE, OFFLINE-READY, OWNER-OPERATED

---

## 1. Overview & Architectural Invariants

As mandated by `AGENTS.md` and `GAZA_GATEWAY_HOSTPAPA_SHARED_HOSTING_MASTER_EXECUTION_PLAN_2026-10-12.md`:
- **Shared-Hosting Target Only:** The entire commemorative product (frontend, Laravel 13 API, MySQL 8.4, SMTP, bounded cron) runs on the owner's existing HostPapa shared cPanel hosting account.
- **Zero External Infrastructure:** No Render, no VPS, no external PostgreSQL, no Docker runtime on production, no Node daemon, no external queue workers.
- **Strict Database Isolation:** The canary must **NEVER** run on production databases or touch real application tables. It strictly requires an explicitly designated, disposable database (e.g. `<cpaneluser>_canary_test`) with dual confirmation (`CONFIRMED_DISPOSABLE_DATABASE_NAME`) and only touches tables prefixed with `canary_h0_tmp_`.
- **No Broad Deletion:** The canary executes scoped cleanup of its own tables only. It is strictly prohibited from executing `DROP DATABASE`. If any table fails to drop during cleanup, the receipt is marked `FAIL`.
- **True Multi-Connection Concurrency:** Row-level locking and `SKIP LOCKED` are verified using two independent PDO connections to prove true concurrency, lock wait timeouts, and skipped locked rows.
- **No Real Email Sends:** The SMTP probe audits socket connectivity and TLS negotiation only. Outbound message transmission (`MAIL FROM`/`RCPT TO`) is disabled by default.
- **No SSH Required:** All actions can be performed directly through standard cPanel graphical interfaces (File Manager, MySQL Databases, Cron Jobs, Directory Privacy).
- **Sanitized Output:** All reports and logs automatically redact passwords, tokens, credentials, PII, and filesystem usernames with strict `0700`/`0600` permissions outside `public_html`.

---

## 2. Host Observations vs Target Specifications

Based on preliminary cPanel UI inspection of the HostPapa shared account:
- **Web Server:** Apache 2.4.69
- **PHP Web & CLI:** Selector displays PHP 8.5. Actual web/CLI execution and a PHP 8.4 executable remain UNVERIFIED. Target is PHP >= 8.4 for Laravel 13.
- **Database Server:** MySQL 8.4.11-cll-lve (CloudLinux LVE MySQL 8.4).
- **PHP Limits:** Selector displays `max_execution_time = 30s`, `memory_limit = 128M`, timezone `UTC`. Higher limits and actual runtime settings remain UNVERIFIED.
- **PHP Extensions:** `pdo_mysql`, `gmp`, `openssl`, `mbstring`, `intl`, `fileinfo`, `curl` active; `sodium` extension optional (app calls core `password_hash` with Argon2id).
- **Cron Intervals:** cPanel menus show 15/30 minute common intervals; UI menus are not a policy guarantee and will be validated in H2.
- **Statement / CPU Quotas:** Untested at host level; requires owner benchmarking under CloudLinux LVE.

---

## 3. Owner Execution Runbook (cPanel UI & Cron — No SSH Required)

### Step 1: Create Disposable Test Database in cPanel
1. Log into your HostPapa cPanel.
2. In the **Databases** section, click **MySQL® Databases**.
3. Under **Create New Database**:
   - In the "New Database" box, enter `canary_test` (the full database name will be formatted like `youruser_canary_test`).
   - Click **Create Database**.
   - *Safety Note: The database name MUST contain `canary`, `test`, or `disposable`. The runner will refuse to run on names that resemble production.*
4. Under **MySQL Users — Add New User**:
   - Username: `canary` (full username will be `youruser_canary`).
   - Password: Click "Password Generator" to generate a strong password. Note this password.
   - Click **Create User**.
5. Under **Add User To Database**:
   - Select User: `youruser_canary`.
   - Select Database: `youruser_canary_test`.
   - Click **Add**.
   - Check **ALL PRIVILEGES** and click **Make Changes**.

---

### Step 2: Upload Canary Files via File Manager
1. In cPanel, navigate to **Files** > **File Manager**.
2. Navigate to your user's home root directory: `/home/youruser/` (ensure you are **outside** `public_html`).
3. Click **+ Folder** and create a directory named `canary` (path: `/home/youruser/canary/`).
4. Enter the `canary` folder and upload the contents of `tools/hostpapa-canary/`:
   - `canary_runner.php`
   - `canary_config.sample.php`
   - `src/` (folder containing all probe classes)
   - `web-api-canary/` (optional, for HTTP test)

---

### Step 3: Configure the Canary
1. In File Manager inside `/home/youruser/canary/`:
2. Select `canary_config.sample.php` and click **Copy**.
3. Name the new file `canary_config.php`.
4. Right-click `canary_config.php` and select **Edit**.
5. Update the values with your disposable database credentials:
   ```php
   return [
       'CANARY_EXECUTION_AUTHORIZED' => true,
       'CANARY_DB_HOST' => '127.0.0.1',
       'CANARY_DB_PORT' => 3306,
       'CANARY_DATABASE' => 'youruser_canary_test',
       'CANARY_DB_USER' => 'youruser_canary',
       'CANARY_DB_PASS' => 'your_generated_password',
       // Must exactly match CANARY_DATABASE to prove owner consent
       'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'youruser_canary_test',
       'CANARY_TABLE_PREFIX' => 'canary_h0_tmp_',
       'CANARY_OUTPUT_DIR' => '/home/youruser/canary-artifacts',
       'SMTP_HOST' => 'mail.gazaairport.com',
       'SMTP_PORT' => 587,
       'SMTP_ENCRYPTION' => 'tls',
       'SMTP_ALLOW_SEND' => false, // STRICT: Keep false
   ];
   ```
6. Click **Save Changes** and close the editor.

---

### Step 4: Execute via cPanel Cron Jobs (Single-Shot)
1. In cPanel, navigate to **Advanced** > **Cron Jobs**.
2. Under **Cron Email**:
   - Ensure an administrative email is entered if you wish to receive output, or rely on file redirection.
3. Under **Add New Cron Job**:
   - **Common Settings:** Choose `Once Per Minute (* * * * *)` (temporary for single-shot).
   - **Command:** Enter:
     ```bash
     /usr/local/bin/php /home/youruser/canary/canary_runner.php --config=/home/youruser/canary/canary_config.php > /home/youruser/canary-artifacts/cron_run.log 2>&1
     ```
     *(Note: If HostPapa PHP 8.4/8.5 is at a different path, check MultiPHP Manager or use `/opt/cpanel/ea-php84/root/usr/bin/php`)*
   - Click **Add New Cron Job**.
4. Wait 60–90 seconds for the scheduled job to fire.
5. **CRITICAL:** Immediately scroll down to **Current Cron Jobs** and click **Delete** next to the canary cron job to prevent it from repeating.

---

### Step 5: Review Sanitized Evidence
1. In File Manager, navigate to `/home/youruser/canary-artifacts/`.
2. Inspect the generated report files:
   - `cron_run.log` (terminal output)
   - `canary_report_<run_id>.md` (markdown summary)
   - `canary_report_<run_id>.json` (full structured data)
3. Download these files to provide evidence for the H0 milestone.
4. Verify that the overall verdict is `PASS` or note any specific warnings.

---

### Step 6: (Optional) Test Isolated API Routing with Directory Privacy
If you wish to verify Apache URL rewriting and HTTP entry without affecting the live website:
1. In File Manager, copy `/home/youruser/canary/web-api-canary/` to `/home/youruser/public_html/canary-api/`.
2. In cPanel, navigate to **Files** > **Directory Privacy**.
3. Click to expand `public_html`, then click **Edit** next to `canary-api`.
4. Check **Password protect this directory**.
   - Name: `Gaza Gateway Canary Test`.
   - Click **Save**.
5. Under **Create User**:
   - Username: `canaryadmin`
   - Enter a password and click **Save**.
6. In a browser over HTTPS, open:
   `https://www.gazaairport.com/canary-api/v1/test-route`
7. When prompted, enter the `canaryadmin` credentials.
8. Confirm that the browser displays JSON output with:
   ```json
   {
     "status": "PASS",
     "canary": "H0_ISOLATED_API_ROUTING",
     "authenticated": true,
     "auth_type": "Basic",
     "directory_privacy_verified": true,
     "mod_rewrite_verified": true,
     "route_tested": "v1/test-route"
   }
   ```
9. In File Manager, delete the `/home/youruser/public_html/canary-api/` directory when finished.

---

### Step 7: Clean Up Test Resources
1. In cPanel **MySQL® Databases**:
   - Under "Current Users", delete `youruser_canary`.
   - Under "Current Databases", delete `youruser_canary_test`.
2. In File Manager:
   - Delete `/home/youruser/canary/canary_config.php` and the `/home/youruser/canary/` folder.
   - Retain the sanitized reports in `/home/youruser/canary-artifacts/` or download them.

Actual cPanel UI only confirms the selector PHP8.5 and a generic `/usr/local/bin/php` cron example. Verify the CLI version from the canary output; no exact PHP executable is certified yet. Reports are stored in unique `run-*` children of the configured private artifact directory. Full cPanel Git/private Laravel HTTP execution and SMTP delivery remain separate unverified gates.
