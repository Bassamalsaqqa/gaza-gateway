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

Remote installer completed: correct staging profile/database, approved migration UP and release installed; private backup `static_2f72d9149616ce2e` retained. Temporary cron removed. Actual HTTPS smoke requests returned canonical 400 errors. A temporary boolean-only PHP diagnostic proved HostPapa supplies X-Forwarded-Host exactly equal to Host, HTTPS=on and forwarded-proto=https; diagnostic moved to cPanel Trash afterwards. The shared-hosting-only host correction does not trust forwarded authority and retains raw/canonical allowlists, rejects mismatches/chains/disabled or testing profiles. Nine actual PHP 8.4 middleware cases passed. Public hydration still requires initial published editorial content after API connectivity is repaired; joined H4 remains open.

Corrected HostPapa source `3cb1807beb34358c8176980fe8b657e1eadc9ce0` installed successfully, retaining backup `static_c8b98581bae57647`. Health/version returned 200 with the exact source SHA; readiness moved from truthful 503 (missing cron heartbeat) to 200 after a real bounded cron. CSRF bootstrap returned 200. Reference endpoints still returned 404 because reference/meals/schedules config was local/testing-only; the next correction adds explicit shared-hosting feature flags. Twenty-four actual PHP 8.4 configuration cases pass. The never-published CMS 404 uses the accepted compiled baseline without claiming server publication. SMTP owner input is now provided privately; actual dispatch remains unverified until exercised.
