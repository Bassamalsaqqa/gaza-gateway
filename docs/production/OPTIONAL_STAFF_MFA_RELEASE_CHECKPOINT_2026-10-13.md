# Optional initial staff MFA release checkpoint ? 2026-10-13

The owner explicitly requested optional initial staff MFA, with enrollment in Admin Settings. This is a source amendment on PR #4, based on b83c2b4c3ed16304a3115cc86a8e78142a67ef64. It is not an online or production acceptance receipt. See [policy decision](ADR_OPTIONAL_INITIAL_STAFF_MFA_2026-10-13.md) and [operation contract](../backend/optional-staff-mfa.md).

## Source and independent review

Never-enrolled verified staff obtain honest password-assurance sessions after actual password verification; enrolled accounts still require their confirmed current factor. Enrollment requires own authenticated authority/current password and an actual unused TOTP; confirmation revokes earlier sessions. Epoch/revocation/CSRF/RBAC and last-administrator checks remain enforced. The additive MySQL migration runs before new code and refuses unsafe rollback when password authority exists.

AGY's bounded headless run timed out without usable changes. A Codex implementation agent supplied the isolated diff; Codex inspected source and retained actual logs rather than accepting the report alone. Independent review corrected (1) own-account enrollment authorization in OpenAPI, generated policies/client pins and the closed validator and (2) existing directory error-code fidelity plus truthful raw-session test fixtures. Existing assertions were preserved. The original incomplete worker receipt is retained separately and does not attest to these later corrections.

## Focused evidence

| Check | Result and attribution |
| --- | --- |
| Actual Laravel identity migration prerequisites + additive up/rollback/reapply | Exit 0; six migrations on disposable MySQL 8.4.11 / PHP 8.4.26 |
| Four bounded staff lifecycle/RBAC/eligibility PHP files | 28 tests / 225 assertions, exit 0; retained log independently inspected |
| Changed optional-MFA file after adding mixed-assurance subprocess race | 5 tests / 78 assertions, exit 0; one ACCEPTED + one CONFLICT, exactly one eligible admin |
| Directory error categories after independent correction | 5 focused tests / 12 assertions, exit 0; expired/future/revoked cases preserved |
| Actual invitation/enrollment HTTP case after final policy regeneration | 1 test / 21 assertions, exit 0; only this affected case rerun |
| Identity client and identity-contract Node files | 108 tests / 23 suites, exit 0, before independent authorization metadata correction |
| New complete-graph own-account authorization regression | 1 test, exit 0, after correction |
| Complete backend contract CLI | Exit 0 after correction: 140 operations / 132 paths / 1217 internal references |
| Generated client parity | Exit 0 after final policy pin correction |
| TypeScript / PHP syntax | Worker focused checks passed; no dependency changes |

These are scoped results with overlapping test selections, not a summed unique-test total. Initial stale client specimens, a PHP test helper collision, the independent four-error contract failure, and generator pin mismatch remain in worker/tool evidence. No broad legacy or full identity/browser campaign was repeated. Retained private local evidence is under scratch/optional-staff-mfa-review; it is not published as credential-bearing release content.

## Actual hosting state and remaining gates

Staging remains at b83c2b4c3ed16304a3115cc86a8e78142a67ef64 until explicitly activated. Actual HTTPS readiness returned database connected, migrations up-to-date and queue healthy. The owner confirmed receipt of the first HostPapa SMTP staff invitation; this establishes that message's delivery, not all mail flows. Its accepted account remains pending initial enrollment under the older deployed code. No synthetic MFA proof was inserted.

Fresh staging reference tables are empty. Offline source-derived initialization data contains only the existing eight airport references, three memorial aircraft/layout definitions, four meals and eight approved CMS documents. It excludes prototype bookings, accounts, prices and schedules; no import or publication is claimed. GZA's existing 20-minute API-minimum placeholder is unused by routes, whose duration comes from destination references.

Outstanding: activate the reviewed optional-MFA build/migration on staging, initialize approved reference/content through real staff authority, complete a joined Admin/public booking-seat-ticket-email-cancellation workflow, and prepare a separate production database/configuration and backed-up cutover. Public staging was owner-authorized without Directory Privacy and remains noindex; it is not access-protected. Production has not changed. main, hostpapa-deploy, review history and disabled GitHub Actions remain unchanged.

## Owner-confirmed online staging follow-up

The owner confirmed password sign-in without mandatory initial MFA at action time. Release rel_20261013T074456_01ff131_clean (source 01ff1315052c5c112f881569699a011802685c00, manifest 2a1fffcadf660e3fb677857eec78deb1589f37d790650259c8a4a635a080d759) installed on isolated HostPapa staging. Actual installer log confirms migration UP and a private static backup static_c7c5e2f1aa773d38. Real browser stageowner login entered Admin without MFA; no fabricated credential was inserted. The one-time install cron was removed; the bounded recurring cron remains.

Real authenticated staff Origin/CSRF/RBAC requests initialized only the approved compiled reference/content set. Subsequent public reads verified 8 airports, 14 derived routes, 3 aircraft, 4 meals and exact publication payloads for all 8 CMS documents. A fresh public browser rendered all seven destinations; Admin showed 2 active aircraft out of 3. One disposable PS 901 staging test schedule was created through Admin and then explicitly restricted through the API to 2026-10-20. It is not a real or historical flight and is not production seed data. Browser automation date fill initially left the default range; the bounded correction and exact persisted/public date evidence are retained, with no claim of a proven product date-input defect.

The added migration required updating the existing release test's exact migration/probe inventory. The first tool amendment used an incorrect variable and the second retained a stale probe-total assertion; both failed receipts remain h3_release_51d440d1eb2e and h3_release_d7c6a7a75e17. After fixing those test-only defects, h3_release_fa950aa93d67 passed all 19 actual installer/runtime/rollback probes and a genuine MySQL backup restore: 19 migrations, 78 InnoDB tables, zero non-InnoDB tables. Package source is exactly 01ff131; gate-tool hashes are recorded in that receipt and committed separately. No application suite was repeated for these tool corrections.

The registration handoff was subsequently completed by the owner. Actual passenger verification email arrived through HostPapa SMTP; verification and sign-in succeeded. The joined browser workflow confirmed free booking GZA-Y7KZ / TKT-GZA-Y7KZ-1 for the synthetic PS 901 offering on 2026-10-20, with seat 12A and the Vegetarian meal. The English and Arabic ticket views matched the Admin reservation. The branded bilingual ticket email was independently observed in the actual mailbox. Passenger cancellation then appeared as Cancelled in Admin, and a public API read showed seat 12A available again. These are disposable staging records, not production seed or evidence of real flight operations.

All one-time installation/dispatch cron tasks were removed; the approved bounded recurring task remains. The verification message was delivered by the recurring task, not the overlapping one-shot that correctly skipped an active lease. The successful ticket dispatch processed one message with zero errors. No external delivery claim is inferred solely from provider acceptance: the two message bodies were actually observed in the mailbox.

Remaining H4 limits: printable ticket rendering passed, but saving an actual PDF was not completed; attempted mobile viewport control did not produce a certified mobile screenshot; no new simultaneous conflicting-seat race or failed-mail retry was run on HostPapa. Earlier genuine MySQL concurrency and synthetic SMTP failure/retry evidence remains retained with its original source attribution. These limitations keep full H4/H5 acceptance open. Production, main, hostpapa-deploy and DNS are unchanged.

Focused follow-up corrected the screenshot method, without rerunning the booking workflow: actual browser DOM dimensions were 390 by 844, document width 375, and Arabic direction rtl. Browser page screenshots now certify the English public homepage and Arabic booking/ticket management at that viewport with no horizontal document overflow. Viewport override was reset. The earlier native desktop capture remains excluded; this is a two-screen mobile check, not a complete mobile workflow or device matrix.

## Production artifact handback, without activation

Final packaged source is 7a8f0fa2f25851c4f75422f86139e0bb020ea4de, release rel_20261013T082656_7a8f0fa_clean, manifest SHA-256 f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf. Its production-origin frontend build and strict complete artifact verification passed: 546 public files and 6679 private files. It remains UNREVIEWED_RELEASE_CANDIDATE and has not been uploaded or activated in production.

The actual production-profile installer/rollback/backup-restore gate passed at 84cedc6cc8ef1f5b5544a3cc4468a58e963d9014 (receipt h3_release_61fcd563f632): 19 runtime probes, 19 migrations, 78 InnoDB tables, zero non-InnoDB tables. The following 7a8f0fa commit only corrects two bootstrap explanation lines; its PHP 8.4 syntax and final artifact checks passed. The 84cedc6 runtime receipt is not relabelled as execution at 7a8f0fa. Local test binary logging was disabled, as disclosed in the receipt; actual HostPapa installation and application execution provide separate remote evidence at 01ff131.

Ignored private owner-ready inputs are prepared under scratch/h4-private-inputs/production-owner-ready. Fresh production app secrets are separate from staging; database and SMTP password placeholders remain empty. The owner must create a separate empty production database and isolated DDL/runtime users, complete the private inputs, and clear the remaining acceptance/cutover gates. The instructions include source-bound installation and backup/rollback; no SSH or Composer/npm execution is required on hosting. Subsequent documentation-only commits do not change the artifact source or retrospective test attribution.

The owner subsequently created gaza5045_gateway_live, gaza5045_liveadmin and gaza5045_liveruntime. Read-only cPanel inspection confirmed the new database and both assignments; migration user has all privileges on that database, runtime has only SELECT/INSERT/UPDATE/DELETE. No grants were changed by Codex. Credentials are still required in the private inputs before installation; observing the names/grants is not a successful connection test or production activation.

The owner subsequently supplied both existing database credentials. They were bound only to the ignored private runtime/installer inputs; the existing approved mailbox credential was copied privately to the production owner bootstrap input. No credentials are published in Git, reports or artifact manifests. The inputs are now filled, but no production connection, migration, upload or activation is claimed. Independent release review and the backed-up owner-controlled cutover remain pending.
