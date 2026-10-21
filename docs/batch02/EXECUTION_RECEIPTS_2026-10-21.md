# Historical execution receipts ? retained chronology

Earlier pending/publication statements below are superseded by the final integration handoff. No evidence has been deleted.

﻿# Batch 02 integration handoff — 21 October 2026

Worktree: `scratch/batch02-20261021`; branch: `feature/ux-tickets-archive-batch-02`.
Source baseline: `55dfa645e59e66c2da03744673fbb212a5077d51`. Changes remain uncommitted. Main and production untouched.

## Implemented

- Approved 1774×887 ticket art, actual reservation/passenger/leg overlays, shared licensed Arabic/Latin fonts, transparent PNG export, accessible mobile viewer and A4 portrait/landscape printing. Original template hash and before/after evidence are recorded in `TICKET_AND_TRAVEL_FOCUSED_EVIDENCE.md`. No artwork redesign.
- Guided booking with compact desktop seat map, leg completion status, optional guest fields, field-specific focus/validation and explicit OTP dialog verification/finalization. Existing 12-hour challenges, ten attempts, server validation and atomic/idempotent reservation authority preserved.
- OSL/ARN photography derivatives, public metadata, validators and additive two-way schedules. Migration expands admission, preserves existing rows, uses explicit active aircraft, records canonical reference snapshots and refuses destructive down migration.
- Private archive contribution uploads, staff-only review/download, consent, idempotency, outbox acknowledgments and scoped admin CC. Actual GD/Arabic-capable shared renderer is bound to archive delivery. Current-attempt file cleanup only; no broad orphan deletion. Uncertain deliveries remain unreplayed.
- Bilingual thank-you tag with font/image readiness, actual downloadable PNG and accessible text details.
- Solid travel cards, scroll-preserving tabs/history and six-city heritage-inspired conceptual shuttle explorer.
- Cleanup inventory only; no production records, evidence, assets or unrelated checkout changes deleted.

## Independent local verification

- Ticket/travel source checks: 65 focused tests passed; booking/trip/draft: 42; destination/media/curation: 32 (recorded earlier in this mission).
- Integrated archive + additive Nordic migration: **17 tests / 228 assertions passed**, real disposable MySQL with target guard. Covers upload/private file/outbox, replay/conflict, denied file types, staff authorization and controlled download, scoped CC, mail lifecycle, canonical migration snapshots, preservation and bookability.
- Real archive PNG → archive and booking private MIME capture: **1 test / 6 assertions passed**, actual 1122×1402 image, exact MIME bytes and 0600 permissions.
- Document renderer / ticket email presentation: **29 tests / 199 assertions passed**. Subsequent bounded attachment changes also passed those document tests in a combined run whose separate cron tests initially failed; do not label that combined run a full pass.
- Cron regression after correcting AGY's incompatible lease-call change: **18 tests / 66 assertions passed**. Existing owner-aware 60-second lease API and overlap response restored. Document dispatch admission reserves 13 seconds (rendering plus existing 8-second SMTP deadline); identity proof remains prioritized. No installed cron cadence changed.
- Final email bounds: **4 tests / 52 assertions passed**, real TicketEmail/renderer, all-or-none attachment cap, management link, actual EN/AR image difference and cancelled semantics. AGY's initial expectation that nine large PNGs always fit was corrected to honor the aggregate byte cap.
- Nine-passenger actual measurement: 2.754 seconds; 35,651,584-byte peak PHP memory; aggregate cap caused zero attachments with complete online summary/link; MIME 50,698 bytes. Optional attachments limited to 10 MiB raw / nine passengers / four-second render budget; capture 16 MiB. Global hard timeout propagates instead of being swallowed by attachment fallback.
- Real loopback HTTPS API acceptance: **14/14 checkpoints passed** using process-local CA and standard hostname verification. Actual OTP SMTP sink, Oslo PS241/242 round trip, same submission retry, both actual tickets, management OTP/detail, cancellation/retry and one-way create/retry/ticket/cancel/retry. No TLS bypass, OS trust changes, external email or production data. Earlier helper failures selected an old verification email for management; fixed purpose/reference filtering. This is API acceptance, not a browser-journey claim.
- Integrated TypeScript and all changed TS/TSX scoped ESLint passed.
- **One local HostPapa Vite build passed**, including 46 prerendered pages. No production ZIP created.

## Evidence and remaining gates

Ticket EN/AR desktop/mobile/viewer screenshots, owner actual PNG, measured A4 PDFs and travel screenshot are in `evidence/`. Approved ticket dimensions/artwork remain intact.

The Edge archive preview DOM showed the contributor tag and enabled PNG action. Further screenshot capture was blocked when automatic approval review reached its usage limit; no alternate method was used to bypass that block. Fresh archive/booking visual screenshots and a real UI-driven guest journey are therefore not claimed complete. HTTPS browser warning remains owner-handled; API TLS was verified narrowly without changing trust globally.

Before release: independent source review, owner-authorized integration, actual installed baseline verification, HostPapa GD/FreeType/Arabic shaping and upload-limit capability checks, exact-source guarded package/rehearsal/read-only preflight and separate final deployment GO. Production remains at the recorded 55dfa64 baseline; never use an earlier installer.

AGY's returned code was independently reviewed. Corrections included the real archive renderer binding, locale propagation, cleanup paths, mail capture/byte/time bounds, preserving Nordic ticket metadata and restoring the existing cron lease contract. AGY worker reports are not substitutes for the executed evidence above.

## Final local mail-delivery follow-up

The historical disposable SMTP sink imposed a 512 KiB DATA limit. New PNG emails exceeded that fixture limit; genuine delivery outcomes became `uncertain`, and those records were preserved without retry. Only the owned local sink was restarted with a 16 MiB bound. A fresh guest identity then passed the same 14/14 API journey; actual delivered email for return reservation `GZA-65SS` contained `image/png`. No production SMTP or data was used. A startup-race attempt during sink restart timed out waiting for OTP and is not counted as application failure or acceptance evidence.

Archive pre-claim budget/capture test: 1 test / 13 assertions passed, including zero attempts when only 12.9 seconds remain. Existing global 25-second hard deadline, eight-second SMTP deadline, owner-aware lock and uncertain-delivery behavior preserved.

`git diff --check` passed. The generated route-tree change is line-ending-only; it was produced by Vite, never hand-edited. No new source SHA exists until the owner-authorized commit transaction.

## AGY review disposition

Owner explicitly authorized migration-source transfer. The final read-only Flash High integration review reached its four-minute timeout with no final findings report. It is **not** counted as an independent review pass. Earlier worker corrections and tests were collected; Codex independently inspected/integrated them and executed the focused gates above. Publication/source acceptance and remaining visual review are still pending.

## Preservation correction (17:13)

The archive migration's original `down()` dropped all new archive tables. It now refuses destructive contraction, preserving contributions, private file records and delivery evidence under the same guarded-backup rollback policy as the Nordic migration. Focused test: **1 test / 5 assertions passed**, confirming the tables remain accessible with unchanged row counts. No installed migration or production schema was changed.

## Final archive acceptance and AGY follow-up (17:16)

Fresh strict-HTTPS submission `GZA-ARC-X29ZENUG`: real JSON upload with inspected PNG, locale `ar`, replay returns the same reference, anonymous Admin listing denied. Existing real ArchiveMailWorker processed exactly two queued messages to the disposable SMTP sink; both became `accepted`. Raw retained MIME confirmed staff notification has CC and no artwork attachment (855 bytes), while contributor acknowledgment has the actual PNG and no CC (2,086,521 bytes). No real recipients or production transport.

The bounded `migration-final-small-run` using `gemini-3.8-flash-high` completed with no blocking data-preservation findings. This is a narrow migration review, not a replacement for independent whole-source acceptance. The later archive destructive-down refusal was also independently checked by the dedicated test noted above. Earlier broad AGY timeouts remain recorded honestly.

The supplied ticket template remains SHA-256 `755265480b37f332b0a102a4120a8c504049330fb46573bffbc227dd0e13dec4`; archive artwork remains SHA-256 `dabe1d812d5c72e6f8d45d6cd5fe67ad237779eea657c68efc4db16c610fff52`. Both are unchanged.

Implementation source remains on `feature/ux-tickets-archive-batch-02`, uncommitted; no publication, merge, package or deployment has taken place. Main remains `55dfa645e59e66c2da03744673fbb212a5077d51`.
