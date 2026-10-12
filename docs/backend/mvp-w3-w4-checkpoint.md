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
