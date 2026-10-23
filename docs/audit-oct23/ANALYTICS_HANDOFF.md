# Analytics and monthly report handoff

Branch: `improvement/oct23-audit-analytics`, based on main `6f52044b88e56b005bf11ee96b274580fd6d8a11`. Production remains `0aacf145`, 25 migrations. No production writes, cron changes, dependency installation, ZIP preparation or Actions.

## Implemented

- Replaced prototype Admin Analytics with Laravel/MySQL data: 7/30/90 days and previous month, UTC daily trend, canonical EN/AR pages, estimated active foreground time, referrer domains, searches/routes, confirmed reservations/routes and persisted archive submissions.
- Optional browser events use session-only opaque IDs, respect DNT/GPC, exclude staff/private/preview paths and strip queries/fragments. No names, emails, PNRs, raw IP or user-agent dimensions. Failures never block booking. Transient keyed IP rate limits are separate from event storage; server access logs have their own policy.
- Collector body is bounded to 16 KiB before Laravel JSON normalization. Closed types/paths, validated airport-code pairs, 120 requests/minute per transient source key, 200 events/session and elapsed-time/session engagement caps bound collection. Locked visitor anchors and unique event IDs prevent replay inflation. Thirty-minute idle rotation preserves earlier event/session history.
- One additive migration `2026_10_23_000001_create_analytics_and_monthly_reports_tables.php` adds four tables and atomically extends the installed outbox purpose CHECK. Prior 25 migration files remain unchanged. DOWN refuses to destroy events, sessions, reports, previews or custom settings.
- Monthly reporting is disabled by default. Recipient defaults to `notifications@gazaairport.com`, configurable in Analytics → Report Settings by `admin.manage` with recent password/MFA step-up. Existing encrypted archive outbox, SMTP settings, leases/retries/uncertain semantics and bounded dispatcher are reused. No new cron or SMTP worker. Report routing never becomes OTP/ticket/contact CC.
- Closed-month claims serialize on the settings singleton and have a unique month record. Preview requests are scoped by staff/UUID, retain their identity across UI retries and allow five new claims/hour. Replays return the existing receipt. Queued or SMTP-accepted does not establish inbox delivery.

## Definitions and limits

Visits/IDs are opt-in browser/session estimates, not verified humans or cross-device people. Active time counts visible, recently active intervals; lost beacons and quiet reading can undercount. Country stays Unknown because no verified geo source exists. AWStats remains a separate historical log estimate.

Confirmed bookings count currently confirmed reservation rows created in the window; round-trip segments are separate reservations and later cancellations reduce the count. Contributions count persisted submissions, not curator verification/publication. Neither is divided by opt-in visits: no valid cross-authority conversion rate exists. Daily buckets are UTC; monthly boundaries use Asia/Hebron and half-open UTC intervals.

Raw events/anchors become eligible for bounded deletion after 90 days; monthly aggregates remain separate. There is no fabricated pre-install traffic history. Capture-since means earliest retained event, not complete coverage. Earlier months can honestly show no captured traffic. Percentage comparisons are not invented without comparable coverage. No external email was sent during this mission.

## Focused evidence

- Fresh isolated MySQL 8.4: all 25 baseline migrations plus the additive migration applied. Earlier disposable failures were retained and corrected; production was not used or reset.
- `analytics-php-receipt.txt`: **23 tests, 198 assertions**, PHP 8.4.26. Real HTTP stack/router admission, invalid Origin/types/body/private paths, spoofed success rejection, privacy/staff exclusion, duplicate counters, elapsed cap, idle rotation, authenticated preview retry, lower-role denial, monthly enqueue, guarded DOWN and actual report MIME/CC isolation. No concurrent load benchmark or external SMTP delivery claim.
- A subsequent focused settings/preview HTTP test passed **1 test, 15 assertions**, adding optimistic revision-conflict and expired step-up rejection checks without repeating the suite. The final UI also uses the existing MFA/authenticator/recovery contract for staff reauthentication.
- TypeScript passed; **30 focused Node tests passed** (19 analytics, 11 dictionary parity). The integrator did not rerun the old booking/archive/ticket suites.
- Actual Edge screenshots: EN/AR desktop and mobile. Mobile client and scroll widths both measured 390 CSS pixels. Existing 90% browser zoom required a viewport override adjustment; the override was reset afterward.
- Visual-only local adapters read aggregates exported from disposable MySQL. Ignored `scratch/visual-fixture` replaces local auth/data providers solely for visuals and is excluded from source/packages. Screenshots establish layout/schema rendering, **not authenticated browser login**. Security evidence comes from real guarded HTTP tests. No certificate or production auth protection was weakened. Extension-injected attributes caused development hydration warnings; no corresponding source defect was established.
- `monthly-report-disposable.html` is actual renderer output with honest no-history values. Browser screenshots do not certify every email client.

## Preservation and release gates

Approved ticket art/proportions, bookings/OTP, private archive access and existing SMTP/CC remain intact. All Rights Reserved LICENSE, copyright/third-party notices, frontend UNLICENSED/private and Composer proprietary metadata are preserved. No dependency lock changes.

Independent review precedes integration. PR23 is separate; neither branch is merged. A future release needs an operator targeting installed `0aacf145`, prior timeout/recovery limitations addressed, exact-source packaging, preservation rehearsal, backups, read-only host preflight and owner GO. Dependency alerts and the qualified Issue15 disposition remain tracked. Never rerun old installers or clear failed markers. Live CMS text needs a separate authorized editorial update; source defaults do not rewrite published records.
