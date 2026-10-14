# Admin dashboard, directory and aircraft layout correction

Source baseline: deployed `b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87`. Changes are on a review feature branch only. The owner explicitly requested commit/push without another production package, deployment or merge while further notes are collected.

## What changed

- Replace the live-mode fleet-only preview dashboard with actual MySQL totals for confirmed bookings/passengers, cancellations, passenger accounts, active destinations/aircraft and recurring schedules. No simulated revenue, airline operations, check-in or invented trends.
- Connect Customers to paginated server passenger/profile and booking-count projections. Account passwords, documents, traveler details and tokens are never selected or returned. Customer detail/edit remains outside this bounded read-only correction; the list contains no pretend edit/view links.
- Connect Activity to nine durable server audit sources: identity, fleet, network, meals, schedules, content, gallery, reservations and contact. Return explicit safe columns only, never audit metadata/details, credentials or proof payloads. Timestamps are UTC; pagination is 25 items with stable ordering.
- Connect Staff and roles to the existing authenticated staff workspace, reusing invitations, directory, role changes, session controls and step-up. Server RBAC, last-admin protection and MFA lifecycle remain unchanged. The disconnected mock staff page remains isolated in mock mode.
- Make aircraft-layout columns respond to the available container width rather than viewport alone. The read-only airplane fits its panel using observed width and corresponding scaled height, including EN/AR and expanded/collapsed sidebar. Interactive passenger seat maps retain their existing targets, keyboard navigation and horizontal scrolling. Free live previews no longer display the mock extra-legroom price.
- Remove the obsolete Server Preview (W1) header. Hide unsupported production navigation entries instead of displaying disabled mock-only controls. Enabled entries still require authoritative permissions; no guard was removed to expose browser-local data.

## API and security

Normative additive read contract: `docs/backend/mvp-admin-read.openapi.json`.

| GET operation | Permission |
| --- | --- |
| `/api/v1/admin/dashboard` | `dashboard.view` |
| `/api/v1/admin/customers?page=1` | `commercial.view` |
| `/api/v1/admin/activity?page=1` | `admin.manage` |

All require HTTPS and a current full staff session. Pending staff and passenger cookies do not authorize them. Authentication precedes the existing principal/IP rate limiter in Laravel's middleware priority list. No migrations, production credentials, new framework or dependencies. Existing no-store/security/error envelopes apply.

## Focused evidence

- Real disposable MySQL/PHP gate with `MYSQL_MVP_TEST_FILTER=test_live_admin_`: 4 tests / 35 assertions PASS; booking/cancellation changes actual statistics, safe customer projections, invalid pagination, editor/viewer/anonymous/passenger realm decisions, immutable audit rows without metadata. Actual captured responses: 10 positives and 6 negative schema controls PASS. Evidence `scratch/mysql_mvp_48823e66f873`, receipt alongside it. Migrations/engine and owned contention checks performed by the existing bounded gate; owned resources removed. No broad identity or frontend suite rerun.
- Initial `mysql_mvp_5529d1e7ab35` failures retained: the limiter ran ahead of the new authentication middleware. Priority was corrected; no rate or authentication check was weakened.
- Browser-only EN/AR transport fixtures: 18 checks PASS for dashboard counts, customer list, activity, staff directory and aircraft bounds at 1440/1280 with both sidebar states and 390 mobile. `scratch/admin-ui-evidence/receipt.json` and screenshots retained. These exercise real frontend components with synthetic API fixtures; they are not a new live-provider or joined production certification. Real backend authorization/contracts are separately tested above.
- Initial browser fixture failures retained: cold Vite load deadline, missing correlation response header, and seed functions mistakenly used without invocation. The fixture was repaired rather than loosening actual application protocol checks.
- Typecheck, focused ESLint, normal build and whitespace checks passed. Generated route tree was produced by Vite, never hand-edited. No release ZIP was built.
- After visual review exposed the old mock price, one additional focused free-preview browser check passed (no currency label and full mobile fit); the 18-check matrix was not repeated for this text/price-only correction.
- AGY authenticated and models were available, but its bounded task timed out without a final report or edits; no worker output was accepted. The controller preparation stalled and was stopped; an isolated relay worktree was used as fallback. Codex completed and reviewed the source directly. No formal controller Accept is claimed.

## Remaining boundaries

The live b3 site does not contain these feature-branch changes yet. Collect remaining owner notes and review the branch before preparing the next exact-source full-stack upgrade. Its installed baseline will be b3/21 migrations, not the old 7a8/19 baseline; never rerun the previous installer or old ZIP as an update. Preserve accounts, settings, bookings and backups. No GitHub Actions, merge, deployment, mail-provider configuration or live writes were performed.

The separate deployment-evidence correction remains PR #6. Admin password-recovery UX/reset links remain a separately identified note, not silently claimed fixed here. Real flight operations/check-in/payment controls stay outside the free memorial MVP.
