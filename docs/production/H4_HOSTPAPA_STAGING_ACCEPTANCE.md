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
