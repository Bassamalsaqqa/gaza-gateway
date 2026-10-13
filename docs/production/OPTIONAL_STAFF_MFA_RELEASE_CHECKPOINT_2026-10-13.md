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

Passenger registration is prepared for owner password entry under the browser credential handoff rule. Email verification, seat booking, printed ticket, confirmation email and cancellation remain unfinished online gates. Production, main, hostpapa-deploy and DNS are unchanged.
