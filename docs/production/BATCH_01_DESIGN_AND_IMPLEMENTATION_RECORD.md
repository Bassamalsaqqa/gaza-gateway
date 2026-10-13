# Batch 01 implementation record

Status: in progress, not deployed. Integration branch: refinement/post-launch-batch-01, based on PR #4 at 4d096e8. Owner brief committed at 22c0b4b. Installed application remains 7a8f0fa. No merge or production writes are authorized by this record.

## Direction contract

THESIS: one immediate task per passenger page and one operational section per settings view. Remove competing actions while retaining existing backend authority.

OWN-WORLD: preserve limestone surfaces, olive actions, clay accents, the existing auth shell, approved logo and unmirrored red ticket world-map asset. Reuse project fields, Radix navigation and existing layouts; no new visual framework.

STORY: a visitor signs in or creates an account, verifies their email, then books a real published commemorative offering. An administrator finds contact, mail and security controls without scrolling through unrelated forms.

FIRST VIEWPORT: sign-in presents its heading, email/password, show/hide and one primary action, with quiet recovery and registration links. Settings uses a narrow section navigation and one content pane, compact navigation on mobile. The homepage retains the slim red booking console even on empty dates.

FORM: incumbent extension, selected by the owner's pinned reference; no alternate-world randomization. One-way/single-passenger controls initially reflect the actual supported reservation flow. Unsupported cabin/round-trip controls are omitted.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. Existing imagery/provenance remains unchanged; no new raster is planned.

## Baseline evidence and limitations

After the PC restart, actual live Arabic sign-in, homepage and authenticated Settings were inspected through Edge. Credential-free screenshots are retained in scratch/baseline. Sign-in visibly exposes five competing actions and preview copy; Settings vertically stacks contact, SMTP and staff/security forms; home uses the plain date/direction offering board and has no offerings for the inspected date. A viewport override screenshot remained desktop-sized and is excluded from mobile evidence. Responsive acceptance must verify actual DOM dimensions.

## Passenger password exception

The owner explicitly confirmed a six-Unicode-codepoint passenger minimum on 2026-10-13. This is an ease-of-use exception, not NIST password-length compliance. Staff remains 12..128. Preserve exact password bytes, maximum 128 codepoints/4096 bytes, Argon2id 64 MiB/t=4/p=1, rate limits and local common-password rejection. No remote breached-password lookup is claimed. Existing long passwords remain valid. See [NIST password verifier guidance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#passwordver). Form direction follows [NN/g registration/login guidance](https://www.nngroup.com/articles/checklist-registration-login/), adapted to the existing bilingual brand.

## Restart, worker and housekeeping evidence

Initial AGY Hello succeeded, but two implementation runs timed out during network/DNS failure without product edits. The reduced retry also produced no edits; receipts are retained. After the restart Docker Desktop was restarted and AGY Hello answered again; the bounded network worker subsequently began editing real network files. All worker output requires independent review.

The three obsolete gaza_gateway_phase13b_protocol02 app/web/PostgreSQL containers were removed. Their named PostgreSQL and Caddy volumes were preserved. The unused stopped hostpapa-test-mysql container was subsequently removed without `-v`; its database volume was preserved. No global Docker prune or volume deletion occurred. Disposable gates clean only their own named resources.

The owner reports changing production cron to one minute. This batch does not change its cadence or assert provider-policy certification. Stable-wrapper command improvements may be prepared offline; no second recurring production dispatcher is added.

## Focused checks

Identity model tests: 30 passed after updating the independent password policy pin. The initial MySQL password gate stopped before PHPUnit because its stale harness asserted 18 migrations against the accepted 19. Failed receipt/log retained; harness corrected to the current migration inventory before a focused rerun. The old cross-language parity script also lacks a specimen for postStaffMfaEnrollmentSetup; no passing result is claimed for it. Generated artifact parity will use the dedicated generator checks plus actual PHP command validation.

### Implemented local slices (not deployed)

- Passenger registration/reset/change share a 6..128-codepoint policy in PHP, runtime client validators and generated contracts. Staff floor/hash settings unchanged. Focused PHP password suite: 21 tests / 112 assertions; this receipt precedes subsequent verification/network changes, not a final-batch pass.
- Verification emails contain English/Arabic HTTPS fragment links and a six-digit code in one encrypted outbox message. Codes use domain-separated HMAC with the application key, bound to proof ID/email/epoch; only the digest is stored in a forward-only child table. Both methods consume the same proof. Five failed code attempts persist and exhaust that proof across IPs. Existing per-subject/IP/source admission remains, supplemented by a three-issuance-per-principal/15-minute resend ceiling. Key rotation invalidates prior manual codes; the opaque link and fresh resend remain recovery paths. No SMTP runs while holding this transaction.
- Focused real PHP/MySQL verification: 5 tests / 58 assertions (`mysql_mvp_a485cfa0fa0b`), plus the separate concurrent link/code and network slice: 4 tests / 40 assertions (`mysql_mvp_3c8efb53fabf`). The latter applied all 21 migrations, checked InnoDB/session settings and real contention. Do not sum overlapping test suites as a final unique campaign.
- Failure provenance: the first verification HTTP fixture used a disallowed Origin (403); corrected to the gate's allowlisted loopback Origin. The first concurrency fixture bound the wrong disposable DB name and exited before verification; corrected to exact `gaza_gateway_mysql_test`. Both failure receipts remain in scratch. No security guard was weakened.
- Generated client and PHP command artifact checks passed. Identity client corrections: four affected tests passed; one additional link/code/unsupported-nested-schema test passed. Three initial client failures exposed the remaining old client password floor, obsolete opaque-token specimen and changed fail-closed error vocabulary; corrected with focused reruns. Network frontend compatibility: three tests passed. Final typecheck, affected-file ESLint and complete contract CLI passed after the route-leaving warning and network changes. No broad suite was repeated.
- Passenger pages have one task, password visibility/autocomplete, focused errors, link-token removal before POST, paste-friendly LTR numeric code input and resend wait feedback. Settings has section navigation, explicit SMTP editing and dirty-state/revision preservation; route-leaving/reload warnings prevent accidental draft loss. Local 390px Arabic sign-in screenshot is retained; no joined browser or staging claim yet.
- Homepage server mode renders the approved clay/world-map console and exact published offering IDs. API outage/empty results leave the form visible. No mock pricing, cabin, roundtrip or multiple-passenger authority is introduced.
- Twenty-code network admission is coordinated across backend, MySQL, OpenAPI and frontend. Codex replaced AGY's broad exception-swallowing migration with one atomic, fail-closed ALTER of the two identified airport checks. Unsafe narrowing refuses without deleting records; unrelated checks remain. The seven-photo provenance catalog is unchanged; new destinations use the existing neutral brand mark, never an Amman photo alias. Existing seven-destination mock storage remains valid and complete.

### Review/governance snapshot

GitHub read-only snapshot on 2026-10-13: PR3 head remains `cecd1c9158111c349ac63414cfcfff89db6d197f`; ten threads remain unresolved with source-correction replies and prior-source evidence. PR4 remains draft at `4d096e8d720ff6bfcec993a36adac84fafd89daf`, without review submissions. Both workflows remain `disabled_manually`. No reviewer approval or thread resolution is fabricated.

Issue1 remains open. Its five residual findings retain ownership: source/snapshot uniqueness and inactive-public snapshots (historical 13E publication obligations, now reconcile with authenticated dynamic CMS and source-pinned releases); refund evidence (13F, excluded from the payment-free MVP); infant/adult DB multiplicity (13D, excluded from the current single-adult MVP); owner deployment approval provenance (13G, explicit owner-bound installer approval and independent release review). Historical contract/model claims must not be treated as live capabilities or silently closed. CI-status finding was separately corrected historically; no new Actions are authorized.

### Remaining batch gates

No expanded references or schedules have been written to production. A joined final-source MySQL/frontend gate, disposable release installation/rollback and isolated HostPapa staging rehearsal remain required before a production release handoff. Actual mailbox timing and provider cron policy are unverified for the new batch; owner cadence is unchanged. Frontend-only release work is isolated until independently reviewed.

### Timetable and operator-release checkpoint

The Admin schedule page now offers an explicit preview/publish tool using existing staff APIs, CSRF, permissions and audit operations. It adds only missing references, requires an explicit choice to activate the approved standby Boeing 737-800, and creates fourteen recurring core schedules with stable identities and a full-year horizon. Preview checks the complete dated rotation, including existing extra/equipment/cancellation exceptions, at least sixty-minute ground turns and flight-number conflicts. Reruns add only missing commands; rolling extension preserves identities and refuses edited schedules. Concurrent changes detected during the initial authority re-read block all writes; later API failures can leave partial committed commands and require a fresh preview. No batch-wide transaction or automatic publication is claimed.

The thirteen added airports carry factual source coordinates and manually localized names in `tools/memorial-curation/catalog.v1.json`. GZA uses the closed-airport geographic record PS-0006; new block durations are explicitly curated distance-based estimates, not historical or airline timetables. The seven existing routes retain their approved durations. Long-haul catalog entries receive no invented aircraft or service. Nine pure Node curation/time-contract tests passed; their adapter is synthetic, not live API/browser evidence.

Actual PHP dated offerings now use departure-airport calendar dates, both IANA timezones and elapsed block minutes. Ambiguous/nonexistent DST departures fail closed. Arrival date/offsets survive into new reservation/ticket snapshots; historical untimed snapshots remain readable. New service reservations reject changed frozen timezone authority rather than reinterpret already booked tickets. Schedule arrival clocks are nominal editorial values; Admin explains dated derivation. PHP time unit evidence: five tests/fifteen assertions passed; the initial Mumbai example had an incorrect expected clock (03:15 instead of 02:15), corrected without changing runtime arithmetic. Three vendor/bootstrap attempts failed before tests and remain retained in scratch.

The combined installer now backs up and atomically installs the active private `bin/hostpapa-cli`, with rollback restoration. The recurring cron cadence is unchanged; the owner can update its command path after release. Immutable `private/SOURCE_COMMIT.txt` is hashed in the manifest and read by runtime configuration so retained shared `.env` cannot falsely report an old APP_COMMIT after upgrade/rollback. The disposable release gate adds actual version and stable-wrapper probes; this source checkpoint precedes execution of that gate.

AGY's earlier cron/timetable runs timed out without edits. On restart, its Hello availability probe completed, and a bounded frontend-only implementation was dispatched to an isolated worktree. Its output is not accepted by this record. Codex implemented and reviewed the curation/time/full-stack corrections directly; no claim of worker completion or live activation is made.
