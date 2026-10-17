# PR18 final release corrections ? 17 October 2026

Reviewed application correction commit: `3d3f187`. Reviewed operator correction commit: `d1139c5`. The exact final PR head, including this evidence, is reported in the GitHub handback. Main remains `743741fd93f03bb88b4754f2558cf814e83c5147`; installed application remains recorded at `96538d9affdc843d08ef3c801f15c7f92dfd46b3`. No merge, production package, deployment, host mutation or GitHub Actions was performed in this correction.

## Owner decisions and resulting behavior

Keep the existing six-digit email code with no additional user-facing challenge. Guest booking and management proofs last **43,200 seconds (12 hours from issuance)**, including delayed dispatch and redemption with a fresh anonymous session. The existing random UUID is the high-entropy locator; code alone is insufficient. Email links carry the locator and recovery context in their fragment, never the code. Fragments are removed after form hydration. Verification remains explicit same-origin/CSRF-protected POST.

Exactly **10 incorrect attempts total per proof**, shared across sessions, exhaust it permanently. Existing per-minute rates remain **15/IP and 10/session** for verification; creation and global anonymous/account/staff lifetimes are unchanged. Valid redemption consumes the proof under a row lock and creates a short grant bound to the current session. Original issuer expiry is allowed; explicit issuer revocation is rejected. Cleanup retains pending proofs and active fresh-session grants without making an expired session usable. HMAC domains are guest-specific v2; guest code subjects contain no code. EN/AR messages state remaining time and the absolute UTC expiry.

The unreleased guest migration's constraint changes from 5 to 10 attempts; production currently has neither guest migration. The migration inventory remains **23**, including the accepted optional-guest-details migration. No passport values or seats are invented. Approved ticket artwork/proportions, account validation, capacity-aware search and travel improvements are unchanged.

## Focused independent evidence

- Guest HTTP/SMTP and selected guest round-trip/retry checks: **38 tests, 477 assertions**, PHP 8.4.26/MySQL 8.4.11, receipt run `mysql_mvp_9682602b13b5`. Covers queue after original session expiry, near-12-hour email expiry, fresh-session redemption, exhaustion across sessions, expired/replayed proofs, atomic round trips and idempotency.
- Additional concrete cleanup/revocation regressions: **2 tests, 9 assertions**, run `mysql_mvp_d594e94a1b9d`. Confirms the old issuer cannot cascade-delete a fresh session's active grant, can be cleaned after grant expiry, and explicit revocation rejects redemption. Both disposable gates cleaned their owned containers/networks.
- Guest client/recovery: **14 tests passed**; TypeScript and changed-file ESLint passed. Recovery tests exercise parsing, real client transport and grant state; they are not mounted React tests. The proof replay test uses sequential requests, not a claimed parallel verification test.
- Operator profile/core tests: **52 passed, 1 Windows symlink skip**. PHP 8.4 permission checks **23/23**; verifier/maintenance checks **71/71**. No broad suites or Actions.
- AGY performed implementation and focused initial checks. Codex reviewed its diffs, corrected the recovery/syntax, retained original rate limits, added the cascade/revocation regressions and independently verified final results. A timed-out AGY correction is not counted as verification.

## Completed real Chrome HTTPS acceptance

Playwright MCP used the owner-opened Chrome localhost preview after the owner handled its certificate warning. No TLS bypass flags or OS/browser trust-store changes were used. Backend was real disposable MySQL/PHP; SMTP was a local sink, not production SMTP.

1. Chose GZA?AMM on 18 October and AMM?GZA on 20 October through the real search UI; selected distinct seats 2A/2B, entered only name/email and verified the actual delivered six-digit email code.
2. Confirmed the round trip: HTTP **201**, references **GZA-WE5E / GZA-37BC**, two saved tickets, two reservation rows, two booking-mail intents/messages. Actual synthetic delivery count was **3**: one verification and two booking confirmations.
3. Replayed the exact observed command and submission UUID from the same browser session: HTTP **200**, same two references, no additional reservations or booking mail.
4. Cleared **only localhost** cookies; requested management code, cleared localhost again, reloaded the recovery fragment in `/ar/manage`, verified that same delivered code in the fresh session and retrieved the real saved ticket. Fragment was removed after hydration.
5. Cancelled only the outbound booking through the real confirmation dialog. Database/browser showed one cancelled and one confirmed reservation. Retrieved the return ticket separately in EN and confirmed it remains available.

Only the necessary actual EN return-ticket and AR fresh-session management screenshots are committed; their exact hashes are in `evidence/PR18_FINAL_BROWSER_HASHES_20261017.json`. Screenshots were opened and inspected. The earlier EN capture with a sticky-header screenshot artifact is retained only in ignored scratch, not presented as final evidence. No redesign was performed.

The disposable preview needed one synthetic fixture repair: its meal control pointed to revision 1 but omitted the immutable revision record. Inserting the corresponding snapshot fixed the local `/meals` 500; product source and production meal records were unchanged.

## Issue15 and current-baseline operator

See [bounded preservation reconciliation](../production/ISSUE_15_PRESERVATION_RECONCILIATION_2026-10-17.md). Retained SQL/archive/environment digests and 6,694 archive files were independently rechecked. The observed 15 October snapshot preserves all durable baseline records across 74 tables: 1,009 baseline rows, 1,008 exact full-row matches, 1,014 observed live rows. One session differs only within excluded activity/expiry/revocation fields; attribution is limited. Original FAIL and attempt/backup evidence are unchanged. This is historical reconciliation, not a present-state rescan or fabricated success receipt. Independent acceptance of that disposition remains required.

The only current production CLI profile is **`installed_965_21`**, explicitly selected; no default or historical b3 reuse. It binds source `96538d9affdc843d08ef3c801f15c7f92dfd46b3`, release `rel_20261015T042635_96538d9_clean`, immutable manifest `fbfc743a37956f138ec1ecffbb9c92305bbbf73bb4f4aca3e6c10899d7fd85ed`, and 21 installed migrations; target requires 23 migrations. Historical profiles remain explicit archival API paths only.

Final preservation verification opens a fresh identity-checked runtime PDO after long backup/copy phases and refuses replacing an active transaction. No mutating retry. Outer maintenance survives nested installer execution; exclusive upgrade maintenance refuses existing owner maintenance and checks full writes/permissions. Public ancestors are 0755 under umask0077; private directories remain 0700 and an existing webroot is preserved. One-shot markers, backups, manifests, protected paths and rollback barrier are retained. Old-code rollback refuses real guest/nullable passenger data and requires forward repair.

## Remaining owner/reviewer release sequence

1. Independently accept this PR correction and the Issue15 bounded certification disposition, then separately authorize integration to main. No merge was performed.
2. Build **one** final clean exact-main full-stack production artifact and current965 kit; verify application/operator source pins, manifest, runner/ZIP hashes, 23 migrations, public/private permissions and the exact local rehearsal.
3. Perform fresh installed965 **read-only host preflight**, including current pointer/immutable bytes, 21 migration identities, backups/rollback readiness, protected files and cPanel file/disk headroom. No host preflight or production backup was claimed here.
4. Supply the exact cPanel steps and hashes for separate explicit owner deployment GO. Preserve the single existing dispatcher; no cron cadence change or duplicate jobs. Do not run old installers or clear attempt markers.

The old **87.4 MiB PREPARATION-ONLY ZIP is superseded** and must not be deployed or relabelled. No new production ZIP is claimed before integration/certification. The 40-schedule offline proposal remains unpublished; deployment will not silently populate live schedules.
