<!-- BEGIN AGY-MANUAL-ONLY (2026-10-24) -->
AGY delegation is OPT-IN ONLY. Codex does engineering work directly by default.
Never invoke AGY, agy-delegate, Google Worker, headless dispatch, or any delegation workflow automatically because a task is complex or because an older instruction suggests delegation.
Only the user's explicit invocation of $agy-manual enables a manual handoff. Use the EXISTING repository checkout; no new worktrees, detached sessions, relay/controller or automatic retries.
Codex ends its turn while the interactive AGY session edits; after the user returns, Codex independently checks the actual Git diff and untracked files and handles acceptance/finalization.
Preserve all unrelated repository, security, test and release instructions; never infer permission to reset, delete, merge or deploy.
<!-- END AGY-MANUAL-ONLY -->

# Gaza Gateway — Engineering Instructions

## Scope and authority

- Maintain Gaza Gateway at https://www.gazaairport.com: a bilingual Arabic/English airport archive and Ayman Alazraq's internet-based art project, including symbolic free bookings, tickets, Admin and CMS. Historical Palestinian Airlines and the Palestine Airways Limited art installation are distinct. Do not introduce real airline operations, payments or check-in.
- Current source and installed application, verified 2026-10-24: `26e31557f894c5a744da47d7abb9b25172c21e8c`; Git tree `ff4a194a9f68e4bbc8b7cd1c1449327bd67ee6bd`; 27 migrations; active release `rel_20261024T045400_26e3155_clean`.
- Deployed ZIP SHA-256: `d9d7c56a718b1e9665639bd50147f01f093aeb8a90b75a15e4440dedd37b1e8b`. Separate release operator PR #27 source: `bcf8f809bd91d5b64f4026790f06cf491e178f42`. Application and operator provenance are separate. Never rerun this installed release's upgrade kit for a subsequent update.
- These are dated observations, not permanent assumptions. Re-read the actual installed pointer, immutable manifest and complete migration ledger before any future release. Older 7a8/b3/965/697/55/0aac baselines are historical.
- `main` is source authority. Preserve published commits and branches; no force-push, published rebase/squash/amend or destructive checkout. Source publication does not deploy. Keep main buildable and preserve unrelated local work.

## Development invariants

- React 19, TypeScript, Tailwind 4, Radix and TanStack routing; Laravel 13/PHP 8.4+ and MySQL/InnoDB are production authority. Every enabled action uses real backend functionality. No production mocks, fake buttons or silent mock fallback.
- Flat route files under `src/routes/` use TanStack dot notation and optional `{-$locale}` for English `/` and Arabic `/ar`; Admin routes follow the same locale convention. Never hand-edit `src/routeTree.gen.ts`; generate it only when authorized route changes require the normal build.
- Render each locale separately through the existing i18n system. Keep technical identifiers LTR in Arabic: flight numbers, booking references, IATA codes, ISO dates, times, phones and emails. Preserve Arabic shaping and the approved ticket art and 8 × 3.25-inch landscape proportions.
- Use existing design tokens in `src/styles.css`: limestone/sand, deep olive, clay and ink. Preserve responsive layouts from 320px to 1920px, semantic markup, keyboard navigation, visible focus and WCAG 2.2 AA contrast. Do not introduce unnecessary frameworks.
- Preserve historical accuracy, archive provenance and rights. Conceptual/AI future imagery must not be presented as historical or present-day documentary evidence. Respect the approved artist statement and distinguish quotations from factual historical context.
- Preserve `LICENSE`, copyright notices, `THIRD_PARTY_NOTICES.md`, third-party/font licenses, frontend `private: true` / `license: UNLICENSED` and backend Composer proprietary licensing. Original work is All Rights Reserved; third-party material retains its own license.
- Use focused checks appropriate to actual changes. Avoid repeated broad suites, unnecessary builds, dependency migrations and generated artifacts. For prose-only work, check links, referenced contracts and `git diff --check`; do not build the application.

## Production and data safety

- HostPapa shared cPanel is the only production host: prebuilt frontend, private Laravel application, MySQL, SMTP and bounded cron. No production Docker/Node daemon, external backend/database, DNS changes or GitHub Actions. Never deploy the obsolete static-only `hostpapa-deploy` branch.
- Deployment, hosting changes and CMS publication require explicit owner authorization for the applicable operation. Past release GO does not authorize future releases. Follow `docs/HOSTPAPA_DEPLOYMENT.md`; stale prose never overrides current source, fresh host evidence or the owner's explicit scope.
- Preserve accounts, bookings, passengers, schedules, staff, CMS revisions/drafts, settings, SMTP configuration, private archive uploads, ticket assets, backups and incident evidence. No data reset, direct-SQL CMS edits, automatic destructive restore or blind migration DOWN.
- Preserve the existing single `*/10` dispatcher and its October 13 wrapper dependency. Owner-reported permission for one-minute cron is not authorization to alter the installed cadence. Never delete the wrapper while cron references it.
- Future upgrades require an exact-source package, separate application/operator pins, checksums/manifests, focused exact-kit rehearsal, read-only installed-baseline preflight, sufficient bytes/inodes, verified backups, installer lock, cron lease, one-shot markers and guarded maintenance/cutover. Use a fresh DB connection for final verification; account for MySQL DDL autocommit and inactivity disconnects.
- Preserve original failure receipts and attempt markers. After interruption, investigate and use reviewed forward recovery; never retry blindly or manufacture success. Verify actual installed source, migration identities, durable data, private files and live behavior before claiming release success.
- Keep private credentials, customer data, SQL/backups and deployment packages out of Git, public diagnostics and external agent services. Agent source transfers need applicable owner permission; do not bypass approval restrictions.
- CMS writes use existing authenticated APIs and `expectedRevision`; freshly read editorial/published records, preserve drafts, contacts, stable IDs and owner SEO fields, preview EN/AR and verify actual published revisions. Do not replace whole documents with defaults merely because source copy changed.
- Analytics is optional and consent-based, honors DNT/GPC and excludes staff. Confirmed booking/contribution counts come from backend records, not client-claimed conversion events. Monthly reporting remains opt-in; do not silently enable it or resend uncertain mail.

## Current state and known qualifications

- PRs #23 and #24 were integrated; original #25 was superseded by merged #26. The October 24 application and approved EN/AR CMS content are live. `home` and `pages.information`: public revision 2, editorial currentRevision 4, no pending draft at publication. `airport.future` remained public revision 1. Re-read before future writes.
- October 24 live checks covered EN/AR content, complete artist statement, archive form, round-trip search/seat workflow, Admin/Analytics, cinematic decoding/seeking and MP4 Range responses; DB/migration/cron readiness passed. A new complete production guest OTP/booking/ticket/cancellation transaction and fresh mailbox delivery were not certified. Seven historical mail messages were uncertain; do not blindly resend. Physical iOS/Android acceptance remains separate.
- Current verified backups: `/home/gaza5045/gaza-gateway/shared/backups/upgrade_20261024_080605_db853c6b`. Preserve the previous release and historical October 15/22 recovery evidence. Issue #15 has qualified historical preservation evidence, not a universal acceptance guarantee; staff pre-throttle hardening (#11) remains deferred unless separately scoped.
- Owner-requested documentation consolidation is a docs-only mission. AGY must not edit this file. Keep application code, contracts, legal/artist source material and historical evidence unchanged unless explicitly authorized. Current tasks do not authorize production writes.
- The primary checkout contains unrelated local operator edits; never reset or overwrite them. The retained current source/development checkout is `scratch/mobile-cinematic-16`. Avoid recreating large fleets of agent worktrees, repeated dependency installs or delegation archives.