# Analytics browser acceptance — 2026-10-23

Candidate: accepted PR25 base `1ec728af7e6bb57039e8c56398aaeaf4b59cc92f` plus this focused correction. This closes the outstanding PR24 **local browser** acceptance; it is not HostPapa certification, integration approval or a production release.

## Actual environment and method

Normal Playwright-controlled Chromium, HTTPS `https://127.0.0.1:5230`, real Laravel/PHP 8.4.26 and disposable MySQL 8.4, all 27 candidate migrations already present. Backend identity/production profile with explicit loopback development opt-in; no browser mocks, injected sessions or fabricated API responses. One new uniquely named synthetic Admin was created using the existing password hasher, then signed in through the actual staff form. Existing accounts were not reset. Optional MFA follows the installed authentication policy. Test report recipient is `analytics-browser@example.invalid`; no external SMTP was invoked.

HTTPS used one temporary, one-day, CA:FALSE leaf with loopback SANs trusted narrowly in CurrentUser. No ignore-certificate browser flags or production TLS changes. Its exact trust entry and runtime processes are removed/stopped after acceptance; data volumes and evidence are retained.

## Acceptance matrix

| Check | Observed result |
| --- | --- |
| No consent / English Keep off | No collection requests; database stayed at 17 existing synthetic events and 11 sessions. |
| Arabic explicit opt-in | Actual consent control enabled collection; POST `/api/v1/analytics/events` returned 204 and a new `/ar/privacy` page view persisted (18 events / 12 sessions). |
| Active engagement / canonical paths | Foreground activity persisted engagement; navigation containing a query and fragment stored `/about` only. Later collector receipt also contains canonical paths only, not the supplied query marker. |
| Duplicate callback correction | Browser initially persisted two `/about` page views milliseconds apart for one navigation. After correction a new `/contact?qa_marker=must-not-store` navigation added exactly one page view (14 to 15); query absent. |
| Revocation | Actual Disable control then public navigation added no events. Database remained 26 events / 12 sessions. |
| Real staff sign-in and Analytics | Password form authenticated normally; staff/me, summary and report settings returned 200. Overview displayed database totals: 16 page views, 12 visitors (14 sessions in the period-specific summary). |
| Settings persistence | Actual UI changed only disposable report settings: recipient, enabled, revision 2 to 3; PUT returned 200 and server success notice. |
| Report preview | Actual Send Preview action returned 202; success notice and one `analytics_preview` outbox row, pending/generation 1/attempts 0. Queue acceptance is proven; inbox delivery is not claimed. |
| Staff excluded even after opt-in | Enabled consent using public Privacy controls while signed in, then navigated AR About/Admin. Events stayed at 26; no staff page view persisted. |
| Sign-out / access denial | Normal Sign out; Analytics UI displayed Sign in to continue. Direct browser navigation to summary API returned 401. |
| Collector outage isolated | Local proxy returned 503 for collector only. Real airports and outbound/return availability requests returned 200; user could change date, select Round trip and run search, with truthful no-scheduled-flight results in this fixture. No new booking or complete booking acceptance is claimed by this check. |
| EN/AR visual | Actual English desktop Admin/settings, Arabic desktop settings and 390px Arabic overview/Privacy, plus 390px booking during outage. Screenshots listed below. |

Browser network traces contain expected development-only HMR websocket failures, aborted StrictMode/query cleanup requests, anonymous identity 401s, and the deliberately injected collector 503s. Later real API requests succeeded; no zero-console-error claim. This runtime is a Vite/source browser acceptance, not a final compiled production build or physical-device benchmark.

## Focused correction and checks

- Remember the last recorded canonical view to deduplicate hydration/remount callbacks without resetting accumulated engagement. Clear that marker on revocation/staff entry; preserve legitimate navigation away/back.
- Pass excluded routes through the existing fail-closed canonicalizer so entering Admin clears the previous public location; Admin routes still start no collection and produce no page view.
- Regression covers repeated callbacks, query/hash variants, stop/start remount, away/back and excluded-route return. Existing privacy, staff, engagement and preview checks remain intact.
- `node --test --experimental-strip-types tests/unit/analytics-canonical-privacy.test.ts`: **20 passed, 0 failed**.
- `npm.cmd run typecheck`: **passed**.
- AGY Gemini 3.8 Flash High supplied the bounded auth/report-contract helper and independently reviewed the two-file dedup delta. Coordinator verified actual browser/database behavior and separately tightened the excluded-route transition. No broad suites/build/package performed.
- No migration, backend, ticket, archive permission, licensing or dependency change.

## Evidence

[Database aggregate/outbox receipt](analytics-browser-database.json), [sanitized local collector receipt](analytics-browser-collector.jsonl), [outage network requests](analytics-offline-network.txt).

[Correction file fingerprints](analytics-correction-fingerprints.json), [runtime/trust cleanup receipt](analytics-runtime-cleanup.json). Later database totals include the deliberately repeated consent/regrant and public-navigation checks; the staff-exclusion checkpoint above was taken before those later anonymous visits.

[EN Admin](analytics-admin-en.png), [EN settings](analytics-preview-en.png), [AR settings](analytics-preview-ar.png), [AR mobile Admin](analytics-admin-ar-mobile.png), [AR mobile consent](analytics-consent-ar-mobile.png), [booking during collection outage](analytics-offline-booking-en-mobile.png).

Settings screenshots were refreshed after normal reauthentication; they show persisted revision 3 rather than replaying the preview action to recreate its transient notice. The pending outbox receipt records the actual earlier dispatch.

Remaining gates: separately authorized sequential #23 → #24 → #25 integration, owner Arabic/legal acceptance and revision-safe CMS publication, fresh exact-main build/new operator for installed `0aacf145` / 25 → 27 migrations, preservation rehearsal/read-only HostPapa preflight and explicit exact-package deployment GO. Main and production remain unchanged.
