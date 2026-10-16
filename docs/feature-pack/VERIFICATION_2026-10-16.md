# Focused verification — 2026-10-16

Source review candidate on `feature/booking-guest-search-ticket-travel-experience`,
based on main `743741fd93f03bb88b4754f2558cf814e83c5147`. The PR records the
exact committed source SHA. Main and production are unchanged.

## Evidence collected

| Area | Focused evidence |
| --- | --- |
| Search availability | Independent MySQL/PHP endpoint gate: 5 tests, 44 assertions. Receipt `mysql_mvp_8335b0f33e10`, PASS; owned resources removed. Frontend search/time contract: 11 tests pass. |
| Symbolic network curation | 14 focused tests pass. Offline plan: 20 destination pairs, 40 schedules; 6,798 generated legs in the prepared period, preserving existing core turnaround checks and unmanaged staff schedules. No live publication. |
| Destination images | All 13 source hashes and 65 responsive WebP dimensions verified independently. EXIF removed, no upscaling. 46,944,841 source bytes → 9,130,952 WebP bytes, 80.55% savings. Exact manifest in `DESTINATION_IMAGE_HASHES.json`. |
| Media/content/travel/ticket policies | 64 focused frontend tests pass. Actual PHP ticket email and editorial validator: 21 tests, 86 assertions, pass (one PHPUnit deprecation notice). |
| Guest/trip client contracts | 22 focused tests pass before integration; independent integrated client/travel run: 41 pass. Added nullable guest-owner/Admin audit variant test: 8 reservation-client tests pass. |
| Atomic round trips + existing accounts | AGY disposable MySQL/PHP gate: 17 tests, 179 assertions pass. Receipt `mysql_mvp_a4004d625fdf`, PASS, cleanup verified. Independently inspected actual PHPUnit output; final integrated gate below also passes. |
| Types/lint | Integrated `tsc --noEmit` and focused ESLint pass. No production build or Actions. |

Independent final integrated MySQL/PHP gate: **43 tests, 445 assertions PASS**, receipt
`mysql_mvp_806e79e1628d`. All owned containers/network were removed and verified
absent. This includes 16 guest access, 8 guest mail, 2 migration, 14 trip and
3 existing account tests. The separate post-SMTP finalizer fence test also passes:
**1 test, 26 assertions**, receipt `mysql_mvp_05a268296c55`, with cleanup verified.
It changes proof state, lease expiry and claim nonce after SMTP admission and confirms
that stale finalizers cannot mark success. Total for these final two runs: 44 tests,
471 assertions. No full suite was run.

## Browser evidence

Real Edge extension screenshots are in `evidence/`. Travel was inspected in EN/AR,
including 390px and 320px viewport overrides and desktop. No horizontal page
overspill was observed at the narrow widths. RTL arrow navigation and Home/End
move focus; the tab rail was corrected to reveal the selected item immediately.

Ticket screenshots are explicitly synthetic component fixtures, using the actual
production component and strict canonical reservation schema. They demonstrate
EN desktop, AR mobile and cancelled AR desktop composition; they do not prove a
completed backend booking. The status badge/cancel banner and full date wrapping
were corrected. Every passenger ticket retains a visible commemorative validity
notice for print; cancelled seats are labelled released.

The full-stack HTTPS loopback preview returns HTTP 200 for `/book` and API health.
The owner reported that Edge and Chrome stall after the self-signed certificate
warning. Browser automation cannot bypass that warning. HTTP/2 probes also succeed,
so a server-wide outage was not reproduced. The exact browser-side cause remains
unconfirmed; certificate metadata/cache adjustments are confined to ignored local
preview tooling. No production auth, TLS, cookie or CSRF requirement is relaxed.

## Acceptance boundaries

- No physical iPhone/Android check or live SMTP delivery is claimed here.
- No build, ZIP, deployment, cron change, production migration or data publication.
- Installed application remains owner-recorded `96538d9`; Issue #15 preservation
  certification remains separate and outstanding.
- Schedule population is prepared through the existing audited Admin curation
  workflow. Future production publication needs the release/owner gate; the owner
  does not need to type forty schedule records manually.

## Final ticket/copy correction verification and acceptance limits

The owner accepted the final ticket design and stopped further visual/PDF checks.
The accepted artifact preserves 32:13 geometry, 78/22 main/stub split and a fixed
print canvas scaled to 203.2 × 82.55 mm. Actual Edge measurements were 960 × 390px
at desktop and 343 × 139.34375px in the 390px mobile viewport. Captures and the
owner-supplied PDF are indexed in evidence/README.md; no further PDF certification
is claimed. Visible language suffixes, confirmed artwork badge and repeated
AI/commemorative/not-valid-for-travel copy are removed per later owner direction.

Independent updated PHP 8.4 email presentation test: 12 tests / 111 assertions,
PASS, one PHPUnit deprecation, exit 0. Its synthetic nine-passenger email is 38,570
HTML bytes, below the existing 128KiB worker boundary. Canonical values, escaping,
cancelled/released seats, missing assignments, secure untokenized management link
and text fallback remain covered. No private booking-management credential is
embedded in artwork or email links.

A fresh HTTPS disposable preview with corrected SAN/end-entity certificate,
separate Vite cache and HTTP/1.1 ALPN still leaves the owner at the browser warning.
The owner reported that failure again. Therefore the HTTP/2 hypothesis is unproven
and the full guest browser flow remains uncertified. No browser security bypass,
trust-store change, production TLS weakening or fallback authority was introduced.
The source PR is a review candidate with this acceptance gap, not release GO.

## Final correction to preview status and source gates

The owner subsequently opened the actual booking page in Chrome and confirmed
Amman plus round-trip date options load after restart. The visible destinations
error occurred after coordinator cleanup stopped the disposable local backend.
Independent certificate-validated loopback HTTPS checks returned 200/success for
network airports and GZA-AMM / AMM-GZA availability. Edge automation remains the
only connected browser; full guest booking-to-management acceptance is still open.

Final targeted checks after owner copy cleanup: 43 ticket/travel tests and 23
search/cinematic/media policy tests pass; TypeScript passes; changed TS/TSX lint
has zero errors and one existing fast-refresh warning. The final copy review
restored two imports/bindings that AGY incorrectly considered unused. No further
backend changes were made after the accepted MySQL and email gates.
