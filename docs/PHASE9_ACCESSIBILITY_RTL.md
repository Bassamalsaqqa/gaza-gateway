# Phase 9 — Arabic, RTL, Accessibility & Responsive Certification

Status: Implemented / Awaiting Independent Review on `phase9/arabic-rtl-accessibility-responsive`.

Accepted baseline and unchanged main: `55981908a75a38de31538c387d103e548c04f91d` (Phase 8, independently accepted and published). No separate Phase 8 release was created. Production remains the combined editorial release `f68adcc60ec195f8099252b0d2d78da9a7c5ef4e`, source `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`, with deployment recorded on the owner's instruction. Codex performed no cPanel deployment or independent live verification.

## Scope and method

This phase corrects demonstrated defects in the existing interface. It preserves the accepted olive/sand/ink/clay visual system, fonts, physical aircraft geometry, canonical repositories, documentary rights/provenance, and illustrative Future classification. It adds no product feature, storage authority, backend, dependency or media asset.

Codex read the Phase 9 completion plan and reconciled its older Phase 6 checkpoint with actual Git truth. AGY received two bounded implementation tasks with disjoint ownership: public/shared interactions, and administration components/routes. Codex owned status documentation, translation parity coverage, independent source review, and the compact final certification. Worker reports are local evidence, not acceptance.

The initial independent admin inspection found missing real tabpanels behind Radix triggers, unnamed Schedule toolbar controls, and unnamed Travel checklist inputs. Initial PNR inspection found Arabic email direction and missing contact validation association. Existing PNR pages, printed boarding passes and LTR seat geometry already fit narrow screens and were retained.

## Certification boundaries

- English and Arabic are checked as separate routes, including root `lang`/`dir`, technical LTR strings and contextual labels.
- Keyboard checks exercise actual controls and focus; DOM inspection alone is not treated as proof of interaction correctness.
- Responsive inspection samples 320, 390, 768, 1024, 1440 and 1920px, concentrating narrow-screen checks on booking/admin/editorial controls. It does not assert that every possible state was visited at every width.
- Text contrast sampling checks representative rendered text on flat backgrounds, excluding disabled/hidden content and photographic/gradient backgrounds. Existing tokens were retained; this sampling is not a universal contrast guarantee.
- Chromium through installed Microsoft Edge is the reliable browser baseline. No claim of additional-engine, physical-device or assistive-technology certification is made.
- Historical pricing/layout snapshots, current service authority, Studio isolation and local editorial draft/publication boundaries remain unchanged.
- Phases 10 and 11 remain Planned / Unstarted until Phase 9 independent acceptance. The consolidated frontend release remains scheduled at that later checkpoint.

## Evidence

Focused durable checks live in `tests/unit/phase9-translations.test.ts` and the Phase 9 smoke scripts. Browser contexts use private deterministic local fixtures; they never modify owner browser data. Screenshots, worker transcripts and exploratory inspection logs remain under ignored `scratch/` directories and are excluded from release output.

## Implemented corrections

- Home's operational board and all nine `AdminTabs` consumers now connect triggers to real, named tabpanels containing their existing bodies. Inactive admin panels are empty and hidden; no duplicate forms are mounted. Active panels retain a visible keyboard focus ring. CMS dirty guards, permissions and commands are unchanged.
- Schedule search/destination filters and Travel checklist items have contextual localized accessible names. The open airport combobox's generated label is no longer empty, and its search text uses automatic direction for Arabic names and Latin codes.
- Manage and check-in lookup errors describe and focus the missing identifier. PNR inputs are explicitly LTR; mixed email/surname inputs use automatic direction. Contact email/phone remain LTR. Invalid email uses a specific localized field error; persistence failure remains a general alert and retains valid input.
- Passenger sign-in/register persistence alerts describe the form without falsely marking valid email/password values invalid. No authentication behavior was added.
- The mobile booking breakdown uses a real Radix trigger, restores focus on dismissal and has a localized close control with a 44px target and logical placement.
- Seat-grid row counts/indices include the header row. Physical seat geometry and arrow navigation remain LTR in both languages.
- Missing literal translation keys were resolved in pending booking/search/claim states, customer labels/loading, archive errors/source status, Schedule filters/actions, activity module names and placeholder-record classification. No documentary evidence, source citation or rights state changed. A durable guard detects unresolved literal translation calls; dynamic families retain domain validation.

## AGY review and disposition

Both bounded tasks completed against baseline `55981908a75a38de31538c387d103e548c04f91d`, leaving changes uncommitted for Codex review. Codex inspected all runtime diffs and independently exercised the final candidate.

The public task's proposed gallery change was rejected: it would move focus to the last viewed image rather than the thumbnail that invoked the lightbox. The accepted Gallery implementation is byte-unchanged; its regression check now preserves invoking-trigger restoration after cycling. The task's field-invalid flags for passenger storage failures were corrected to form-level error semantics. Codex also separated contact validation from storage failure, completed the mobile sheet correction and corrected the seat-grid indices.

The admin task's panel/label implementation was retained, with required panel children, removal of unused styling props and restoration of visible panel focus. Its smoke harness was tightened to mandatory canonical fixtures and real EN/AR interactions, removing optional checks that could silently skip a surface. The worker report's statement that FlightOverrides are in-memory only was inaccurate; Phase 6B's browser-local persistence remains unchanged.

## Local verification results

| Check | Actual result |
| --- | --- |
| Focused unit/domain/status/translation tests | 36 passed, 0 failed, 0 skipped (five test files; four Node test suites) |
| Typecheck | Passed |
| Scoped lint on changed TS/TSX and new checks | 0 errors; two existing Fast Refresh warnings in `airport-combobox.tsx`, whose utility exports are unchanged |
| Application build | Passed; repeated only after the final functional corrections |
| Focused public browser suite | Passed EN/AR: narrow routes, drawer, airport search, travellers dialog, lookup/contact validation and quota failure, passenger form quota failure, gallery, seats and print |
| Focused admin browser suite | 44 cases passed: nine panel consumers per locale, keyboard/forms/overlays, and Flight/Schedule responsive views at six widths |
| Compact final browser pass | 40 cases passed: 18 representative routes per locale plus mobile price-sheet/calendar and PNR keyboard/contact/print/history groups |
| Runtime/console/hydration errors in successful final runs | 0 |
| Document overflow in exercised final cases | 0 |

Earlier focused unit checks passed 11 and then 35 tests while coverage was being completed; the final focused count is 36, not a full application-suite result. Browser evidence includes meaningful Arabic admin, mobile sheet, seat-map and printed-pass screenshots inspected by Codex. Contrast sampling found no failures in the sampled flat-background text on seven representative pages; imagery/gradients and assistive-technology speech output were not certified.

### Failures and harness corrections

- The initial exploratory PNR inspector waited for `h1` on a legitimate already-checked-in empty state using `h3`; it was corrected to wait for the actual state. A contact exploration initially used the wrong localized Save label; the exact dictionary value corrected that selector.
- AGY's admin transcript reports booking-route selector corrections/retries. Codex replaced guessed fallback URLs and conditional skip checks with canonical fixture IDs and mandatory assertions.
- Codex's first public interaction run reached the final console assertion but failed on sandbox-denied resource requests (`ERR_NETWORK_ACCESS_DENIED`). The same checks passed with network access; no resource-error assertion was suppressed and no timeout was raised.
- Codex's first revised admin run timed out waiting for a desktop table row hidden at mobile widths. It was changed to wait for the visible route-specific Edit/Quick Edit control, then all 44 cases passed. This was a harness correction, not a responsive product defect.
- Review exposed real defects omitted by the initial worker pass: mobile price-sheet focus/localization, empty airport-search label, false field-invalid storage errors, seat-grid row indices and unresolved translation keys. These were corrected and the affected groups rerun. The compact pass was repeated after functional source changes; unrelated full suites were not run.

No full unit suite, full committed smoke, release matrix, HostPapa package or deployment was run in Phase 9. These local checks are not GitHub CI. Main remains the accepted Phase 8 SHA and HostPapa remains `f68adcc60ec195f8099252b0d2d78da9a7c5ef4e`; no Phase 9 release, backend work or Phase 10/11 implementation is included.
