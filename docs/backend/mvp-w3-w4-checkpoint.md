# W3/W4 local integration checkpoint

Status: implementation in progress; no merge, deployment or production acceptance.

## Implemented shared authority

- Encrypted, revision-controlled SMTP configuration under `admin.manage` and recent staff MFA. Credentials are write-only over HTTP; destinations are constrained by the operator SMTP allowlist. Local capture and test-only `mailpit:1025` do not certify external delivery.
- Booking mail intents become unique durable outbox messages. A bounded worker claims with PostgreSQL row locks, retries definite pre-submission failures, records uncertain outcomes without automatic resending, and exposes truthful owner/Admin status and idempotent resends. EN/AR multipart tickets exclude identity documents and DOB. Run `php artisan mvp:mail:work --limit=25`; Laravel scheduler registers the bounded poll every minute. Scheduler deployment remains an exposure gate.
- Contact submissions, inbox status/assignment/notes/reply drafts, and contact settings use PostgreSQL. Site contact settings have CAS drafts, explicit publication and immutable revisions. Public acknowledgements omit private inbox data. Reply drafts are not emails sent.
- Review repairs: route-bound reservation occupancy/read/write budgets after authentication, cancelled replay presentation, recursive CMS closure on writes and published reads, and successful aircraft-create recovery after failed layout retrieval.
- Browser repairs: invoke native fetch without an arbitrary receiver; associate booking fields with labels; render the cookie-owned booking route in the browser in explicit backend preview. Mock mode remains the default.

## Focused evidence and limitations

Evidence directories are ignored local artifacts. Receipts bind proposed working-tree file hashes and baseline HEAD, not a clean final release commit.

- `scratch/gaza_reservations_gate_8a890b5dadbab78b4567a51948194bc9`: migration up/rollback/reapply; six mail/site PHP/PostgreSQL tests, 95 assertions; all seven mail operations / 14 actual contracts; all twelve site operations / 20 actual contracts. Passing receipt and owned resource cleanup.
- `scratch/gaza_mvp_browser_62a69cdbe10c800c7480fc3c`: real Edge/HTTPS/PostgreSQL joined workflow passed staff password/TOTP, authenticated offering/meal/Home publication, separate-browser published read, passenger sign-in, UI seat/meal booking, confirmed ticket, print invocation, Admin reservation detail, definite SMTP failure then retry accepted by a synthetic local sink, cancellation and seat release, cancelled idempotent replay, and AR mobile RTL publication.
- Browser fixtures create synthetic verified users and synthetic reference data. Registration/verification, external delivery, backup/restore, restart persistence, full EN/AR desktop/mobile booking and all Admin editor controls are not certified by this run. Admin reference/Home mutations in this first joined run use authenticated browser HTTP calls; it is not evidence of clicking every editor control. Print invocation is not a rendered PDF certification.
- Earlier failed browser, reservation, editorial and worker receipts remain preserved. They are not relabeled passes. Focused frontend lint: zero errors, 28 existing refresh-export warnings; compiler passed. Static HostPapa build passed with 46 prerendered pages.

## Remaining launch blockers

Gallery publication is now integrated with immutable revisions and a successful actual-editor/two-browser publication slice; see `mvp-gallery.md`. Identity verification/recovery provider delivery is still the accepted fail-closed/local-capture seam; booking SMTP does not certify that path. The expanded joined run `scratch/gaza_mvp_browser_d6ab81b1f74e7d4c57d93a5a` additionally passed the two-principal same-seat race (one 201, one 409) and Arabic mobile booking/ticket. Complete the remaining joined matrix and Admin editor actions, and one consolidated exact-final-SHA local gate before W5 acceptance. External HTTPS/proxy/scheduler/provider, owner credentials/content, backup restore and rollback, and owner launch approval remain deferred. No payments or operational flight truth are introduced.

## Subsequent focused editor and persistence evidence

- `scratch/gaza_mvp_browser_b187a7c3ef4c2d31559b670a`: actual Home editor, AMM destination narrative editor and contact-settings editor save/publish actions all passed; an independent browser saw each persisted publication. Contact form labels now identify their inputs. This working-tree slice does not certify every Admin control.
- `scratch/gaza_mvp_browser_294d6c57f3aec79061658476`: an owned disposable PostgreSQL backup was restored into a separate database; all public table row counts and canonical row digests matched. Restarting the owned application preserved those rows. This targeted fixture contained synthetic accounts/references; booked-row persistence will be checked in the final joined gate. The preceding failed receipt `gaza_mvp_browser_fa17eccb2db32492fc9dd0df` preserves the unordered UNION comparison defect, corrected by canonical table sorting.
- Backend opt-in `/verify-email` and `/reset-password` now use the accepted identity forms. Mock routes remain unchanged. The prepared identity browser slice awaits the reviewed SMTP dispatcher; no registration/recovery browser pass is claimed yet.
- `node backend/scripts/run-mvp-final-gate.mjs` is the prepared exact-commit consolidated local gate. It refuses dirty product source and partial filters, records source/log/child-receipt hashes, checks focused reference/editorial/reservation/mail/site contracts, account mail and joined browsers, restart/restore, and static build. It has not yet run and cannot establish remote delivery or production acceptance.

AGY's account SMTP attempt timed out with a partial implementation and a failed eight-test fixture run. Its files remain isolated pending correction and independent review. No completion is inferred from the relay's exit code.

## Account-mail integration and final-gate candidate

The isolated AGY correction completed with a passing nine-test worker receipt. Codex integrated its bounded files, corrected marker lock ordering, deadline/token binding and subprocess bounds, then independently passed ten SMTP PHP/PostgreSQL tests (92 assertions). The actual signup/verification/recovery/replacement-password browser slice also passed; see `mvp-identity-smtp.md` for evidence attribution and limitations. The accepted local-capture dispatcher remains unchanged; SMTP requires a separate disabled-by-default, local/testing-only opt-in.

The consolidated gate is now ready to run on a clean committed candidate. Its joined slice additionally checks the original schedule editor changing an offering, actual EN/AR browser PDF output, and backup/restore/restart after reservation activity. Those added assertions and the full consolidated outcome are not yet claimed green in this source record. The final result must be tied to the exact Git SHA in the PR handback. No external provider, paid services, deployment or production cutover is authorized.

## Final-gate loader and inbox correction

The first consolidated attempt at `1f4396d36ac70459904c9d542dc3b53853e36f24` stopped in the Node API group: 197 tests passed, one file could not load because a contact-adapter constructor parameter property is unsupported by Node strip-only mode. The equivalent explicit field fixes that loader incompatibility. Its focused rerun exposed obsolete W1 domain assertions; the guard now tests currently integrated booking/schedule/destination/editorial domains while retaining unsupported-domain rejection.

The implemented inbox was also still disabled in Admin navigation. It is now reachable with `engagement.view`, shows query failures rather than a false empty inbox, and does not query prototype staff in backend mode. `scratch/gaza_mvp_browser_388d53811fd623f661ab34af` passed actual Home/destination/contact publication plus public contact submission, original Admin inbox resolution and refresh persistence. Owned resources were cleaned. The new domain assertion, compiler and touched-file lint passed. The first consolidated failed receipt remains at `scratch/gaza_mvp_final_f37b8cc4af13604c81dcb559`; it is not a final pass. Full exact-candidate certification follows this correction.

The next consolidated attempt exposed a fleet test-only migration-order assumption: it rolled back two latest migrations rather than the fleet additions. The test now derives all applied additive migrations from the fleet baseline onward, verifies aircraft tables are removed while identity rows survive, then reapplies the joined schema. The failed 16-test/300-assertion receipt is preserved at `gaza_fleet_gate_66d5d3984b5f4453b04aeab0d554e6b4`. No runtime fleet behavior was changed. Set `REFERENCE_GATE_VENDOR` to the existing locked Composer install when running the consolidated gate from an isolated worktree.
