# Batch 02 owner read-only HostPapa preflight

Authorized scope: inspect only. No deployment, migration UP/DOWN, database edits, cron changes, marker clearing, public diagnostics or historical cleanup. Do not reuse the historical697 installer. Respect browser approval limits; wait for restored access or have the owner perform these reads manually.

Record each value privately with UTC time and PASS/FAIL. Redact credentials, cookies, personal data and database contents before sharing the summary. A missing value is PENDING, never PASS.

## 1. Installed identity and evidence

In cPanel File Manager, **view**, do not edit:

- `/home/gaza5045/gaza-gateway/current-release.txt`: must be `rel_20261020T043444_55dfa64_clean`.
- That release's immutable manifest: source `55dfa645e59e66c2da03744673fbb212a5077d51`; SHA256 must be `c9275e79156c4e5c08e267c429fd9034b337e69e71bafad7dc6e021609c89420`.
- phpMyAdmin on the actual application database: `SELECT migration FROM migrations ORDER BY migration;` must show the exact23 expected identities. Operator `--check` must also verify installed migration bytes against the manifest. Do not paste production rows or credentials.
- Retain original failed-attempt evidence and all backup receipts. Confirm private backup location, space/inode headroom and readable prior backup metadata. Consistent fresh SQL/public/private backups are made only by a later separately authorized upgrade; preflight cannot certify future backups in advance.

## 2. Effective web PHP and request limits

Use cPanel MultiPHP INI Editor's **view** for the real gazaairport.com domain/handler. Do not press Save or change options. Confirm the actual web SAPI uses those values (ask HostPapa for a read-only effective-values report if cPanel only shows configured values). CLI `php -i` alone is insufficient.

| Setting | Required bounded value |
|---|---|
| `file_uploads` | On |
| `upload_max_filesize` | 10M or compatible >=10MiB; application still caps10MiB |
| `post_max_size` | 40M, finite |
| `max_file_uploads` | >=5 |
| `memory_limit` | >=256M, finite and within hosting allowance |
| Actual Apache/FastCGI/proxy request-body cap | 41,943,040bytes, finite; permit valid JSON25MiB raw plus base64 overhead |

Ask HostPapa to confirm the **effective** body cap and allowed mechanism (`LimitRequestBody` or supported equivalent). Do not blindly add Apache directives, enable unlimited bodies, expose phpinfo or weaken TLS. PHP `.user.ini` applies to CGI/FastCGI only; verify handler and effective configuration. A setting requiring change is a release blocker until separately authorized.

## 3. MySQL and reference state ? SELECT/SHOW only

In phpMyAdmin run:

```sql
SELECT VERSION(), @@version_comment, @@sql_mode;
SELECT REGEXP_LIKE('OSL', '^[A-Z]{3}$', 'c') AS regexp_supported;
SELECT code, timezone, block_minutes, active FROM airports WHERE code IN ('OSL','ARN');
SELECT id, model, active FROM aircraft WHERE id IN ('a320neo','a321neo');
SELECT id, from_date, until_date FROM schedules WHERE id LIKE 'memorial-b01-%' ORDER BY from_date;
SHOW CREATE TABLE airports;
SHOW CREATE TABLE schedules;
```

Confirm MySQL/InnoDB, enforced CHECK support and REGEXP_LIKE capability compatible with the accepted migration. Inspect existing constraints/triggers through SHOW/Information Schema. Do not run test DDL or write probe rows in production. Local exact-kit rehearsal proves migration execution on its recorded MySQL version; if the host differs materially, stop for a matching disposable compatibility check. Both required existing aircraft must be active with their approved models. Existing Nordic rows are permitted and must be preserved, not overwritten. Schedule date source is baseline-dependent.

## 4. Private storage and rendering

View the active private Laravel storage paths and public-root routing permissions. Uploaded originals must stay outside `public_html`; no symlink/public alias may expose them. Check private roots0700 and files0600, owner/read-write ability of the actual PHP user, no world access, no broad chmod. Do not create/delete uploaded files as a probe. If proving writes is necessary, request a separately authorized private disposable probe.

Check effective PHP8.4+ in **both web and CLI**: GD, PNG, FreeType, calendar, mbstring, fileinfo, PDO MySQL and required Intl/JSON functionality. Verify the candidate's locked ar-php package and font/template hashes offline. A render capability check must produce correctly shaped Arabic through the actual PHP/GD/font path; extension names alone are insufficient. Use a reviewed private in-memory probe via an authorized execution channel; never publish a diagnostic endpoint. If that channel is unavailable, mark PENDING and do not deploy.

## 5. Cron, backup execution and exact kit

View cPanel Cron Jobs without saving. Record the original single bounded dispatcher command and `*/10` cadence; preserve it exactly. Do not add a temporary job under this authorization. Confirm current installer/cron lock state read-only; do not remove locks or attempt markers. Confirm PHPCLI, tar and mysqldump availability and backup filesystem capacity without running an upgrade.

After operator source acceptance, verify the revised kit's exact hashes against its final receipt. The application source remains `0aacf1452d47bbf5660f060a718409dfff32a54c`; operator SHA is a separate pin. The old combined candidate ZIP is superseded by a helper correction; the immutable application payload/manifest can be reused only after byte/hash verification.

If the exact revised kit is privately transferred through a separately authorized method and cPanel provides Terminal (or another specifically authorized execution channel), run **only**:

```text
<verified-php> /home/gaza5045/gaza-upgrade-package-55-batch02/production-upgrade-runner.php --check
```

`--check` may record its reviewed private diagnostic receipt; it must not stage a release or change application/database state. No Terminal is not permission to change cron or install a public web runner. Report the genuine checkpoint/reason code on failure. Never clear a marker or retry blindly.

## Decision

Return installed source/release/manifest23; effective web/body limits; MySQL/constraint evidence; private storage permissions; actual Arabic render evidence; backup/headroom and original cron; exact revised application/operator/runner/kit pins; and genuine `--check` receipt. Any FAIL/PENDING => **NO-GO**. Even all PASS requires independent source acceptance and a separate final owner GO for the exact package. No production upgrade is authorized by this document.
