# Feature pack integration handoff — 2026-10-16

## Source state

- Branch: `feature/booking-guest-search-ticket-travel-experience`.
- Base/main: `743741fd93f03bb88b4754f2558cf814e83c5147`.
- Source publication is owner-authorized; the PR records its exact source SHA.
  No merge, production build, ZIP, Actions or deployment is authorized.
- The original dirty checkout and incident tooling remain separate and preserved.
- Owner-authorized AGY tasks handled the implementation slices and corrections;
  Codex independently reviewed diffs, corrected defects and reran focused gates.

## Implemented scope

1. Genuine guest reservations, verified email codes and secure reference/email
   booking retrieval, ticket viewing and cancellation, preserving account paths.
2. Shared real availability/search recovery, one-way and round-trip selection.
3. Atomic two-leg confirmation, separate seat/meal choices, canonical timing,
   immutable tickets, scoped idempotent retries and per-leg cancellation.
4. Additive Admin curation for twenty bidirectional destination pairs, using the
   existing audited publication workflow. Local plans are prepared; no live writes.
5. Thirteen owner city photos converted into sixty-five responsive WebP assets,
   integrated with public destination/CMS choices and legacy override compatibility.
6. Bilingual interactive travel guide preserving CMS visibility and preview.
7. Dynamic approved ticket art direction for web/print and email-safe confirmations.

## Independent evidence

`VERIFICATION_2026-10-16.md` records focused tests and actual screenshots. Final
integrated persistence checks: 43 tests / 445 assertions, plus one new finalizer
fence test / 26 assertions; all pass against disposable PHP 8.4.26 / MySQL 8.4.11.
Search endpoint gate, frontend contract/policy tests, actual email/editorial PHP
unit tests, typecheck, focused lint and asset hashes are recorded separately.

Review corrections include committed OTP exhaustion, current grant checks after
locks, nullable owner/Admin decoding, audit UUID compatibility, fenced queued mail,
MySQL foreign-key restoration during safe migration rollback, retry preservation,
async email edit invalidation, truthful ticket states and narrow/RTL navigation.

## Remaining acceptance gap

The full-stack guest booking/manage journey is **not yet certified**. The owner
successfully opened the actual HTTPS booking page in Chrome and confirmed Amman
and outbound/return date options load after the disposable preview was restarted.
The earlier destinations error followed coordinator cleanup of the local backend;
it was not evidence of a production destination failure. Independent HTTPS checks,
trusting only this preview certificate, returned 200/success for network airports
and both directions of availability. The connected automation surface exposes
Edge only; Chrome owner access does not certify the complete guest journey.
No application TLS, cookie, session or CSRF protection was weakened.

Working local views left available:

- `http://127.0.0.1:5187/travel` (public frontend development preview).
- `http://127.0.0.1:5188/scratch/ticket-visual.html` (explicit synthetic component
  fixture; no booking, mail or production data). Its EN/AR and cancelled states
  exercise the actual shared ticket component and strict data mapper.

These are local development views, not production builds or releases. Public
preview mock authority must never be described as production/backend certification.
Physical-device and live HostPapa SMTP acceptance also remain separate.

## Review/release boundaries

Source commit/push and review PR publication are owner-authorized. Independent source/UX review should
retain the browser acceptance gap explicitly. A final clean production build and
any package preparation/integration/release are separate owner decisions.
Production remains owner-recorded application `96538d9`; Issue #15 database
preservation certification is still outstanding. Never use a historical b3-based
installer. See `NEXT_RELEASE_BOUNDARIES.md` for the proposed later update path.

## Final owner direction and publication scope

The owner approved the physical ticket artwork and stopped additional design
verification. The 8 × 3.25-inch canvas, complete detachable stub, continuous paper
gradient, enlarged extra-bold Arabic/English mottos, fuller footer and stronger
architectural illustration are locked. Confirmed state lives in the detail summary;
cancelled status and released seats remain accurate. See TICKET_DESIGN_HANDOFF.md,
TICKET_ASSET_HASHES.json and evidence/README.md for the final authority and captures.

Later explicit owner direction supersedes earlier display-copy requirements:
remove AI/future-concept warnings, not-valid-for-travel statements and commemorative
or symbolic labels across public UI/email and corresponding Admin guidance. Use
neutral labels without inventing operational capabilities, payment/tax claims,
gate assignments, check-in credentials or documentary provenance. Internal booking
classification, media truth restrictions and security checks remain unchanged.
Visible LTR/RTL suffixes are removed; actual directionality is preserved.

Existing CMS database records may retain older copy because saved publications are
canonical. No production content or data is changed by source publication. Any
remaining saved copy must be reviewed/edited through the existing Admin publication
workflow after a separately authorized release; no blanket data rewrite is included.

Source commit/push and a PR are owner-authorized. Integration, clean production build,
ZIP preparation, deployment, cron changes and Issue #15 certification remain separate.
The complete guest browser flow remains uncertified, although owner Chrome access
and real API-backed destination/date loading are now confirmed. Source review can proceed with this explicit acceptance gap.

## Final focused source checks

TypeScript passes. Changed TS/TSX lint has zero errors (one existing fast-refresh
warning). Ticket/travel tests: 43/43 pass. Search availability, cinematic pinned
media and documentary restrictions: 23/23 pass. These targeted checks follow the
earlier integrated MySQL/security gates; no broad suite or production build ran.
The review PR remains a draft pending the complete guest browser acceptance flow.

## PR #18 independent review corrections (2026-10-17)

See [the correction handback](PR18_REVIEW_CORRECTIONS_2026-10-17.md) for the
minimal guest contract, nullable-data migration/rollback boundary, seat-aware
capacity semantics, final focused gates and fresh EN/AR captures. It supersedes
earlier guest-field requirements and schedule-only availability descriptions.
Ticket source/assets remain unchanged; complete HTTPS browser acceptance is still
pending the owner-handled local certificate warning. Main and production unchanged.
