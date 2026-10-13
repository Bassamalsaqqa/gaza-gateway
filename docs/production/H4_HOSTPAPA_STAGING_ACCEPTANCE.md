# H4 isolated HostPapa staging — setup checkpoint

Owner confirmed staging.gazaairport.com exists on this cPanel account. Codex observed its document root as `/home/gaza5045/staging.gazaairport.com`, empty in File Manager; HTTPS returns Apache 403 with no certificate interstitial because no site is installed.

Owner explicitly authorized publishing the isolated candidate and declined Directory Privacy. Staging is public with noindex controls, not access-restricted. Do not describe it as protected. No production data is imported. Main/public_html/hostpapa-deploy stay unchanged.

Boundaries:
- Staging frontend API: `https://staging.gazaairport.com/api/v1`, explicit staging destination; production-optimized Vite is retained.
- Private backend: `/home/gaza5045/gaza-gateway-staging`, separate active pointer, private .env, storage and cron.
- Database: `gaza5045_gateway_staging`; separate owner-created migration and DML-only runtime users. Credentials remain private and outside Git/artifact manifests.
- Proper `APP_ENV=staging`, debug false, exact staging hosts/origin, ordinary CSRF/MFA/RBAC and HTTPS controls remain.
- Package installation rejects a profile/root mismatch, including trying a staging build against production hosts/root.

Four focused staging configuration tests passed. Typecheck required an exact-optional fix; the corrected compiler check passed. Broad legacy suites were not repeated. A source-pinned staging build and affected local release gate follow before remote activation.

Actual app migrations, cron, registration/invitations, mailbox delivery and joined browser workflow remain unverified until executed on this account. Owner mailbox credentials and initial administrator identity are separate inputs; do not invent a default password or bypass MFA to obtain a test login.

## 2026-10-13 exact-source local gate and remote setup

Candidate source: `de46da42e965c8e2dca38230df985d73ac07c880`. Release: `rel_20261013T033258_de46da4_clean`. Manifest SHA-256: `417ddafe202d8be2e52ff7cecc5a0d0c5383c1b10b83f0a6acdf7d60c5016c3f`.

Disposable PHP 8.4/MySQL 8.4 staging package gate `h3_release_24e4236aa6cb` passed 18 affected runtime probes, all 18 migrations, code/static rollback, failed-copy recovery and actual schema backup/restore (78 InnoDB tables; zero non-InnoDB). Test MySQL disabled binary logging; this does not independently certify remote trigger privileges. No broad legacy suite was repeated.

Codex uploaded the archive through cPanel to `/home/gaza5045/gaza-stage-package`, extracted and moved only the manifested files into its `release/` subdirectory. Private runtime and source-bound approval inputs are outside webroot, mode 0600. A marker-guarded one-shot cron invoked the installer using the cPanel-documented `/usr/local/bin/php`; actual result is pending. No production webroot, DNS, main or deployment branch changes occurred.

AGY Hello passed, but the bounded first-owner run timed out without a final message or observable worktree changes. Its relay evidence is retained; no worker output was accepted. Codex continues directly. Initial owner identity and private SMTP password remain required before a real invitation and mailbox workflow. H4 and production readiness remain unverified.
