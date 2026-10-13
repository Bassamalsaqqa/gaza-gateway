# Gaza Gateway — Post-Launch Refinement Batch 01

**Master brief for Codex (design lead, architect, integrator and independent acceptance coordinator)**  
**Owner:** Product owner, Gaza Gateway / Gaza International Airport commemorative website  
**Date:** 2026-10-13  
**Repository:** https://github.com/Bassamalsaqqa/gaza-gateway  
**Observed latest PR #4 HEAD:** `4d096e8d720ff6bfcec993a36adac84fafd89daf`  
**Actual production application source recorded in repository:** `7a8f0fa2f25851c4f75422f86139e0bb020ea4de`  
**Git refs when verified:** `main=c7be134bfa87ef58dcfae142b770da639863e4b3`; `hostpapa-deploy=da08d452a9efbd6947e49f09a66c3f133c66240c`; PR #3 draft at `cecd1c9158111c349ac63414cfcfff89db6d197f`; PR #4 draft stacked on #3. **Refresh refs before changing anything.**

## 0. Binding owner decision / no drift

The permanent deployment target is the existing **HostPapa shared cPanel account**, containing the prebuilt React/Vite frontend, private Laravel 13/PHP backend, MySQL 8.4/InnoDB, HostPapa authenticated SMTP, private media storage and bounded cron. No Render, VPS, external DB, Docker on production, continuous worker, payments, check-in or real airline operations. The project is a commemorative website with symbolic, **free** flights. Preserve historical/illustrative classification and provenance. No GitHub Actions. Avoid wide redundant test reruns. Never overwrite actual passenger records, real content or production credentials.

**Owner-reported current state:** Admin login works; a new passenger registered with an unwieldy 15-character password requirement; production offers no carried-over dummy schedules; first refinement mission is approved. Production installation is real, but formal independent acceptance and permanent Git deployment reconciliation remain open. Never present documentation or a synthetic test as live proof.

**Authority:** Owner approves code/refactor and Git reconciliation, release-workflow preparation, UX changes and curation of a sensible commemorative network/schedule. Codex may prepare and independently review code, merge appropriate reviewed branches once fully accepted under repository policy, and prepare private release packages. **Do not mutate the public website or live database without an exact backup, preflight, non-destructive plan and owner-controlled deployment gate.** The owner expressly requests curated production schedules/destinations; execute them through normally authenticated, authorized Admin APIs with a dry-run, revision/duplicate checks and rollback documentation. Do not use database imports, hidden staff authority, or raw database edits to bypass governance.

## 1. Source-based findings — treat these as defects/constraints, not guesses

1. `src/routes/{-$locale}.index.tsx` explicitly renders `MvpOfferingBoard` when `identityUiRequested` is true and renders `FlightSearchForm context="home"` in mock mode. **Original beautiful red booking console is intentionally replaced in production; absence is not caused simply by empty schedules.** Preserve/reconnect its actual background/responsive owner-approved layouts and hook real offerings correctly. Avoid restoring mock state.
2. `src/components/identity/identity-forms.tsx` renders **every authentication flow as competing small buttons** (sign in, register, forgot, reset, verify, resend). This directly explains the overloaded `/ar/signin`. Both passenger and staff forms contain “preview” language despite a live server. Password fields use `autoComplete="off"` for most flows and do not offer show/hide. Fix.
3. `backend/app/Identity/Password/PasswordPolicy.php`: passenger minimum is 15; staff minimum is 12. The 15-character passenger copy is hard-coded in `identity-forms.tsx`. Passenger-only password policy needs coordinated backend, schema/spec, client, API and UI changes.
4. `src/routes/{-$locale}.admin.settings.tsx`: production `ServerStaffSettings` bypasses the older tabbed mock settings and vertically stacks `MvpContactSettings`, `MvpEmailSettings`, and `StaffIdentityWorkspace`. Redesign only the real persisted/authorized UI and retain working backend operations.
5. Expansion beyond seven destinations affects `backend/app/Reference/Network/NetworkValidator.php`, `NetworkCoordinator.php`, network MySQL migration CHECK constraints, schedules validators, generated contracts, `src/lib/network/types.ts`, `destination-media-base.ts`, mock/reference fixtures and map/list visual components. Current `airports.block_minutes` is constrained to **20..600**; revise correctly for genuine long-haul estimates, if those destinations are offered. Never rewrite an already executed migration in a production database: use a forward-only additive migration and properly tested backfill/rollback plan.
6. `OfferingResolver` currently represents an offering with HH:mm departure/arrival, a dated schedule ID and destination-wide `block_minutes`; date is resolved using UTC calendar weekday and time/date handling needs auditing for local departure/arrival timezones, DST, overnight flights and realistic durations. Do not publish inconsistent times.
7. `hostpapa-deploy` is an **old static-only** branch while the live full application was installed manually. The old cPanel Deploy HEAD path must NOT be used without upgrading its release semantics; it could overwrite the real frontend/API rewrite.
8. The current production SMTP cron is every 15 minutes. Existing HostPapa cPanel UI offering an every-minute cron option **does not prove the account permits a recurring minute job**; published HostPapa shared-plan policy generally says 10–30 minute minimum. Verify the actual plan and get explicit HostPapa support confirmation if unclear.
9. PR #3 still has ten unresolved historic review threads; PR #4 has no submitted independent review; issue #1 needs relevance triage. Do not delete review evidence or claim acceptance by merging.
10. External browser-tool access to the live pages was unavailable in this audit. Codex has working authenticated browser/cPanel workflows from earlier; verify actual page UI, not just source assumptions, and retain visual screenshots in private evidence.

## 2. Work ownership / division

**Codex — directly responsible, not delegated as a rubber-stamp:** UX architecture and visual design, wireframes/visual comparison, interaction model, client/server schema decision review, invariant assessment, release strategy, code-review corrections, merge/release governance, independent acceptance and owner handback. The owner explicitly requests Codex to do the design.

**AGY — implementation worker:** PHP/MySQL policy, challenge links/codes and SMTP changes; schedule/destination API, schema, fixtures, content migration and curation import tooling; UI implementation *from Codex-approved UX specification*; release packaging script corrections and automation. Give AGY bounded isolated packages, explicit acceptance criteria and no production secrets. Codex reviews actual diffs and targeted evidence before integration. If AGY exhausts its quota, Codex takes over instead of blocking the mission.

**Owner:** tests the product, supplies actual design preferences/content decisions if needed, accepts production risk, and carries out the few documented cPanel clicks. Already authorized initial network/schedule curation and Git reconciliation. Do not ask the owner to hand-enter dozens of flights or to run development commands.

**Optional UI UX Pro Max:** The community `nextlevelbuilder/ui-ux-pro-max-skill` supports Codex, but **it is not required**. Codex may use an already installed reviewed skill for heuristic references; do not auto-install global npm packages or alter project dependencies merely to design screens. Existing brand design tokens, owner-approved booking mockup and actual screenshots outrank generated styles. First deliver professional UX without skill churn.

## 3. B01-A — Passenger password and verification UX (high priority)

### Passenger password policy

- The owner's explicit preference is **minimum six Unicode characters with no upper/lowercase/digit/symbol composition requirements** for *passengers*, not staff. Preserve a generous maximum (>=64), existing secure Argon2id hashing, no truncation, no forced whitespace trimming, rate limits, replay protection, breached/common-password rejection and password-reset security. Test old >=15-character passwords still log in. Existing Admin/staff policy, optional MFA and step-up **remain unchanged**.
- Security disclosure: a 6-character minimum is less secure than current NIST guidance for password-only login (15) or multi-factor login (8). Codex should record this as an explicit owner-accepted ease-of-use exception with mitigations. Do not silently claim NIST compliance. A future owner-approved passwordless/passkey flow is a separate scope.
- Update all server rules, auth lifecycle validators, contracts, tests, client copy and EN/AR messages; registration, reset-password and password-change consistency are mandatory. Generic failure messages must not reveal account existence.

### Email verification — link **and** code

- Send ONE bilingual verification email with **both** (a) a full HTTPS same-origin clickable verification link and (b) a short human-enterable one-time numeric verification code (e.g. 6 digits), tied to the **same** verification challenge, expiry and account/email state.
- Link is a random, sufficiently long opaque secret; code is separately protected/hashed and strictly rate-limited on the *account, IP and challenge*. Both paths lead to one idempotent verified outcome and consume/invalidate the challenge. Resend issues bounded fresh proof and revokes prior proof as protocol permits; honor expiry and changes of email/account/identity epoch.
- Email link should open `/verify-email` (or `/ar/verify-email`) and finish securely by POST through the existing CSRF/auth flow. No state-changing GET, open redirects, token leaks to third-party analytics/referrers, localStorage or client logs. Clear link token from URL after verification. No enumeration via resend.
- Verification screen: friendly message + segmented numeric code entry (paste support), resend with truthful cooldown/status, and verified success/sign-in or redirect. Link users shouldn't need to copy tokens. Test link-only/code-only/resend/expired/reused/rate-limited/EN-AR/mobile cases.

### Auth page layout (Codex designs)

- `/signin`: one task only: email, password, show/hide, primary **Sign in**, quiet **Forgot password?**, and subordinate **Create account**. Do not show register, reset, verify, resend, guest and staff as competing tabs/buttons.
- Dedicated `/register`, `/forgot-password`, `/reset-password`, `/verify-email` pages with focused forms and contextual next steps. After registration, show the email-verification step automatically. Only display resend/recovery actions when relevant. Guest booking lives in booking context; staff sign-in is separate.
- Remove misleading “Account preview” language on production. Correct `autocomplete` (`current-password`, `new-password`, `one-time-code`), labels, inline errors, submit state, focus placement, progress messages, form-level data preservation without retaining plaintext passwords, `dir=ltr` for codes/email, Arabic/English natural copy.
- Preserve approved brand imagery and the page's generous/accessible layout. Work at mobile 375/390, tablet 768, desktop 1280/1440; keyboard and WCAG 2.2 AA focus/contrast. Screenshot before/after and benchmark against Nielsen Norman Group progressive disclosure and form conventions.

## 4. B01-B — Faster critical emails on shared hosting

- **First verify** the actual COM-WH account's permitted recurring cron interval by cPanel policy/support and a bounded harmless schedule probe if authorized. Do not use a one-minute recurring cron merely because the menu shows “Every Minute.” Never evade the provider's policy by overlapping jobs/HTTP self-pings.
- If HostPapa *explicitly permits* `* * * * *` for the account, switch to a guarded one-minute **high-priority bounded dispatcher** for registration verification, password reset/recovery, invitation, booking confirmation/ticket, and important account messages; ensure no overlap, finite <=25s wall-clock, locks, rate/volume limits and meaningful monitoring. Put low-priority cleanup on a separate permitted cadence if appropriate.
- If a one-minute recurring job is **not permitted**, keep an account-compliant cron as fallback and implement **prompt post-commit dispatch** for high-priority notifications if bounded and safe on the PHP request lifecycle. Never transmit SMTP while holding transaction/row locks; no false “sent” response until provider acceptance, and no booking rollback on mail errors. Measure real end-user delivery times and request latency. Avoid unsafe `fastcgi_finish_request` assumptions and process hacks that shared hosting may kill.
- In either case: clear pending/accepted/delivered distinctions, observability without tokens/PII in logs, errors surfaced to operations, exponential backoff, uncertainty handled without unsafe replay, verification resend, and test mailbox evidence. Do not mistake SMTP provider acceptance for actual inbox arrival.

## 5. B01-C — Twenty curated worldwide destinations + realistic recurring schedules

### Approved proposed worldwide network (20 destinations, plus GZA hub)

Retain existing: **AMM Amman, CAI Cairo, IST Istanbul, DOH Doha, DXB Dubai, JED Jeddah, RUH Riyadh**.  
Add: **BEY Beirut, KWI Kuwait City, AUH Abu Dhabi, ATH Athens, FCO Rome, CDG Paris, LHR London, FRA Frankfurt, MAD Madrid, BOM Mumbai, KUL Kuala Lumpur, JFK New York, YYZ Toronto**.

All are museum-style *symbolic* destinations. Verify real airport/city mappings, IATA codes, English/Arabic spellings, IANA timezones, and actual geographical distance. Do not misrepresent these as operational routes/historical services, and do not fabricate photo provenance or use unknown-rights city photography. This is **20 destination cities + GZA = 21 airport references**, with up to 40 derived directional routes if the GZA-hub model remains.

Implement expansion consistently from database/schema through backend validators, schedules, query contracts, frontend types, search, dropdowns, destinations pages, imagery/placeholder policy and Admin. Do not simply insert airport rows into a hard-coded seven-code schema. Use forward-only versioned MySQL migrations compatible with **existing production DB and current bookings**; respect immutable reference revisions/audits. For long-haul destinations, enlarge duration bounds where validated and distinguish date rollover with correct origin/destination timezones.

### Recurring memorial timetable

Create a curated **recurring** seven-route near-region/core timetable first so the owner and visitors can book immediately, rather than importing staging's one-day synthetic PS 901 offering. Suggested initial frequency, subject to owner-authorized API and technical/operational feasibility:

| Destination | Suggested days per week | Conceptual weekly pattern |
|---|---:|---|
| AMM Amman | 6–7 | Daily except one maintenance day if aircraft rotation requires |
| CAI Cairo | 5 | Sun, Mon, Tue, Thu, Sat |
| IST Istanbul | 4 | Sun, Tue, Thu, Sat |
| DOH Doha | 3 | Mon, Wed, Fri |
| DXB Dubai | 3 | Tue, Thu, Sat |
| JED Jeddah | 3 | Sun, Wed, Fri |
| RUH Riyadh | 2–3 | Mon, Thu, optional Sat |

For each core destination, aim for sensible outbound/inbound symmetry and time of day rather than fake exact “live airline” behavior. Draw aircraft IDs/models/layouts from actual approved fleet; verify aircraft capability, conflicts, realistic block times, ground turnarounds, timezones, DST and overnight arrivals before creating immutable schedule records. Use flight number pattern `PS ###` consistently, unique IDs and noncolliding instances; avoid assigning the same memorial aircraft to impossible overlapping rotations. Expand bookable weekly service to additional destinations after the range/time model and fleet assumptions are validated. Long-haul routes need a technically coherent symbolic aircraft and time model; avoid presenting impossible direct service as realistic.

**Date horizon:** starting at the first full upcoming publishing week, use a long and practical horizon (target >=9–12 months) and a safe rolling extension mechanism, rather than a one-day demo restriction. Keep legitimate no-past-date, uniqueness, capacity and authorization rules. Show clear empty states only where a chosen route/date genuinely lacks a published service.

**Content publication:** Use authenticated/Admin-authorized create/patch operations, first obtain all current revisions and existing records, prepare dry-run/diff of proposed additions, validate idempotent reruns, insert only missing records, do not overwrite owner edits, and verify actual public discovery/booking queries from an independent browser. No fake passengers/bookings. Preserve existing booking references and seat allocations. Future media sourcing should be editorially reviewed; graceful on-brand destination placeholder is preferable to AI or unsourced “documentary” imagery.

## 6. B01-D — Restore approved booking console with real data

Codex should inspect `src/components/flight-search-form.tsx` (the approved slim red world-map console) alongside `src/components/mvp-offering-board.tsx` and production homepage. Preserve the design intent for PC/tablet/mobile; do **not** revert React to mock repositories. Implement a production adapter/recomposition of the card that searches the **actual** network and published offerings, handles destination/date/trip mode/travellers only where supported, and sends selected offering IDs to the existing free booking flow. Avoid unsupported cabin/round-trip states if the backend cannot actually fulfill them; simplify controls rather than letting them lie. Handle zero-service dates gracefully while leaving the console visible.

Tests: original card visible on the production-backed homepage whether or not offerings exist; authorized saved schedule appears in search; selected booked offering remains exact through ticket/seat; EN/AR and responsive; no stale mock pricing/status/gates; no hydration/layout regressions.

## 7. B01-E — Codex-led Admin Settings redesign

Replace the production `ServerStaffSettings` stack with a deliberate enterprise-quality settings information architecture; **Codex owns the design and UX review**. Proposed structure (adjust to existing real permissions only):

1. **General / Contact** — airport/site identity only when real API exists, published contact details and social links, clear Draft/Published states.
2. **Email & notifications** — health and verified sender/SMTP summary on entry; advanced SMTP connection/credentials behind explicit “Edit configuration” and recent-auth step-up; safe test-mail workflow; delivery/retry view separated from credentials.
3. **Team & security** — account/security workspace, optional MFA, staff management when role-authorized; users without permission get correct boundaries.
4. **Appearance & localization** — only controls actually persisted/published by the live system; hide or label unavailable items honestly rather than restoring mock-only settings.

Keep the left-side section navigation on desktop, compact section navigation on mobile, breadcrumbs/section titles, consistent save/publish/discard affordances, unsaved-change warning, clear server truth/revision conflict handling and error recovery. Credentials must remain masked/write-only and never be displayed from API state. Do not surface disabled local-capture SMTP settings as viable production defaults. Keep “Schedules” and “Destinations” in operational Admin sections, not Settings.

Design comparative before/after at ~390/768/1440 pixels with AR RTL. Preserve Gaza brand typography, limestone/olive/clay palette and visual assets, focus/keyboard behaviors and WCAG AA contrast; no generic dashboards, unnecessary flashy gradients or auto-generated random UI. Codex performs final design review, AGY implements to the approved UX contract.

## 8. B01-F — Git reconciliation and least-friction HostPapa release process

**Immediate safety:** do not run the existing static-only `hostpapa-deploy` cPanel Deploy HEAD against the current live full-stack site. First audit its current `.cpanel.yml`, `.htaccess`, manifests, and deployment scripts for conflicts with the production Laravel `/api/v1` rewrite.

**Reconcile source:** pin the deployed `7a8f0fa` SHA, inspect PR #3's ten threads and issue #1 against current integrated MySQL/production source; resolve only evidence-supported findings, retain old reviews. Prefer **one complete reviewed integration PR** by retargeting existing stacked PR #4 to `main` if the resulting ancestry/diff can be certified, rather than merging intermediate PostgreSQL-only code and risking deployment. Preserve all published Git history (no force-push/rewrite). Owner has approved Git reconciliation; merge only after Codex's independent source review and focused product/security checks. Document exact source vs exact deployed artifact. No GitHub Actions.

**Two safe release modes, one unified release tool:**

- **Frontend-only (preferred shortest):** build exact-source optimized frontend, verify API compatibility and public file manifest, preserve PHP router/.htaccess and private app, publish a frontend-only artifact to a redesigned safe deployment branch, then owner uses **cPanel Git Update from Remote → Deploy HEAD Commit**. Goal: these same two cPanel actions after *one-time* correct setup, no upload/migrations, with preflight and safe failure behavior.
- **Backend-only or combined:** generate single source-pinned ZIP containing private Laravel + production `vendor` + optional frontend assets + necessary UP-only schema migration, exact manifest, safe installer, backup/rollback ledger. Codex prepares it, owner uploads one bundle in cPanel File Manager and invokes one authorized one-shot installer through supported cPanel mechanism; installer verifies, migrates safely, flips code pointer, removes temporary job and provides a receipt. If a one-click Git-only full-stack path is proven within cPanel/Git/package limits, adopt it; **do not assert it works until tested on isolated staging**. Target at most 2–3 owner cPanel actions for backend releases after one-time setup. Never rely on SSH, Composer/node on server, or new hosting.
- Distinguish code rollback from irreversible MySQL schema/data changes; forward-compatible expand/contract migrations, pre-migration DB backup, no destructive shortcuts, rehearsal on staging. Keep operational cron pointing at stable active-wrapper path, not a stale release-specific directory, if compatible.
- Add release labels and `deploy frontend` vs `deploy full-stack` commands/receipts, exact source/hash manifest, compatibility and postflight health checks; no confusion between `main`, deployed runtime and `hostpapa-deploy`. Maintain an up-to-date deployment README with **screenshots or exact UI click names**, no scripts owner must run locally.

## 9. B01-G — Loose ends and production hardening

- Production journeys: new account -> verification link + manual code -> sign in -> actual recurring service -> seat/meal -> ticket saved to PDF -> branded email observed -> My Bookings and Admin consistent -> cancel -> released seat. Compare EN/AR at mobile and desktop. Do not create unnecessary fake passengers in production; use a clearly identified owner-controlled test account and cleanup only if safe.
- Security: auth throttling, enumeration defenses, CSRF, same-origin, rate/IP attribution, admin RBAC/step-up and optional MFA, no query-string token leakage. Re-run original old PR3 findings against current merged source. Do not weaken security as side effect of UI improvements.
- SMTP: diagnose real send timings and failure/recovery cases without sending high volumes; alert on stale/failed cron and unresolved email status. Monitor account email send quotas.
- Data ops: verify off-webroot backups and sampled MySQL restore to isolated DB; preserve production records; confirm no orphaned secrets from original installer ZIP; staging has been public/noindex under owner waiver—recommend actual access controls before sensitive tests.
- Content and truth: distinguish airport Past/Present/Future materials, no bogus provenance, maintain rights and bilingual equivalence, avoid stale “Account preview” labels and fake "airline operational" claims.
- Contact submission form is **explicitly deferred** to a future owner batch. Do not implement it now.
- Trim stale docs / previous architecture claims; update `AGENTS.md`, source-of-truth project status and an operator-friendly runbook. Avoid unbounded testing; keep actual source/hash provenance and failed evidence.

## 10. Delivery sequencing and gates

1. **Pin current production and recovery readiness** (read-only evidence and backups). Baseline screenshots of live UX and actual no-flight booking console. Document observed, unknown, source-derived facts separately.
2. **Codex design pass**: login/register/verification flow, true booking card, settings page; approve own design specification and verify it against current brand/screens; no need for new tool installs.
3. **AGY implementation work packages** in isolation: (A) passenger passwords + link/code; (B) mail timing/cron; (C) network schema + scheduling curation tool + data; (D) booking console adapter; (E) settings UX; (F) unified releases. Codex reviews and integrates them, corrects false reports and ensures no competing changes.
4. **Focused local tests** per affected area, one joined private MySQL/Laravel/React acceptance run at the exact final source. No repeated full legacy campaigns or CI.
5. **Isolated HostPapa staging deployment** with separate DB and secrets, actual SMTP and EN/AR browser acceptance, before production. Verify 20 catalog destinations and recurring services, no overlap, correct booking card, real link/code and admin settings.
6. **Source and Git closure**: consolidate PRs/review findings, exact final integrated SHA, release artifact checksum and deployment/rollback instructions. Source merge may occur after accepted evidence per owner’s Git approval; **production deploy remains an owner controlled action**.
7. **Owner production release** by shortest proven deployment path. Protect live DB; use additive migrations and idempotent Admin seed operations only. Run small production smoke and return true completion status.

## 11. Acceptance checklist / Codex final handback

- [ ] HostPapa shared-only architecture preserved: YES.
- [ ] Updated password rule accepted/recorded **passenger-only** and existing accounts unaffected; staff unchanged.
- [ ] Verification link and 6-digit manual code both independently demonstrated, one-time, nonenumerating and secure.
- [ ] Critical emails timely; 1-minute cron only if explicitly permitted; otherwise compliant immediate dispatch + cron fallback with measured delivery time.
- [ ] 20 approved worldwide destination cities implemented in API/contracts/UI/images/DB; at least the core seven have real recurring offerings with correct dates and no staging test records copied.
- [ ] Original high-quality booking console restored to real production-backed homepage regardless of service availability; real selected offering leads to actual free reservation and ticket.
- [ ] Codex-designed `/ar/signin` and `/ar/admin/settings` pass EN/AR, mobile and desktop UX review with real working controls.
- [ ] PR #3/4/reviews and main/deployed SHA reconciliation complete without history rewrite or stale static redeployment.
- [ ] Frontend-only and full-stack release procedures tested on staging; cPanel owner actions minimized and described exactly.
- [ ] Live MySQL safe migration, backups, secret cleanup, no sensitive data in Git or artifacts, no fake transactional flight status.
- [ ] Contact form deferred.
- [ ] Final report includes accepted SHA, list of changed files, exact tested SHA, failed gates with corrective evidence, deployment package, verified source/data assertions, remaining owner actions and known limitations. No premature “production complete”.

**Start immediately, keep progress autonomous, and return at meaningful major review/owner deployment gates—not individual implementation questions.**

## External practice references used to scope the brief

- https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#passwordver
- https://www.nngroup.com/articles/checklist-registration-login/
- https://www.nngroup.com/articles/progressive-disclosure/
- https://www.hostpapa.com/knowledgebase/detailed-server-resource-usage-specification-chart-essentials-growth-premium-elite/
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
