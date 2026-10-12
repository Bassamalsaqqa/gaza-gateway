# H1/H2 native MySQL and mail integration evidence ? 2026-10-12

Status: local persistence and bounded mail checkpoints verified; **not a deployment or whole-release acceptance**. Integration branch is `hostpapa/shared-mysql-convergence`; parent published checkpoint is `72345b0e95cedcf1690d03314910d06ccaad0575`. Main and HostPapa deployment branch remain unchanged.

## Independently executed native persistence gate

Command: `node backend/scripts/run-mysql-mvp-gate.mjs` with no `MYSQL_MVP_TEST_FILTER`, in the isolated native H1 worktree. PHP 8.4.26 / MySQL 8.4.11; owned disposable database `gaza_gateway_mysql_test`, no host database port.

- 184 tests, 3,021 assertions; no failures, errors or skips. This is the registered MySQL/MVP gate, not the complete historical PostgreSQL or frontend suite.
- All 18 migrations up, rollback to zero, reapply to 18.
- All 78 base tables explicitly InnoDB; physical aircraft geometry and generated capacity, compatible `seat_layouts` read view, exact string/UUID constraints, immutable revisions/audit, IANA reference validation and UTF-16 schedule bounds.
- Two-process directory sentinel serialization measured 839 ms; current committed state observed after waiting. Application tests cover MFA replay, staff directory/last-admin behavior, real reference/editorial/gallery routes, concurrent same-seat booking, cancellation, owner-scoped idempotency and local mail/site workflows.
- Codex independently matched all 506 recorded source hashes and JUnit SHA-256. Owned PHP/MySQL containers and network verified absent.

Receipt retained privately at `scratch/hostpapa-h1-full-worker/scratch/receipt-mysql-mvp-gate-1791834981217-mysql_mvp_a6b060be08e6.json` relative to the original repository. Its baseline HEAD was `45ef6ea97b19368cd53e60e459d67e13ff1f91aa` with proposed source changes; it is not falsely relabeled as a test executed at the later integration commit. Copied native changed source was hash-matched before integration. Subsequent SMTP files and H2 deployment configuration have separate evidence below.

The seven-only historical identity migration test is excluded from this joined runner because its isolated path does not exist here; the runner itself verifies the full 18-migration lifecycle. Focused runs require only migration-up and explicitly report rollback/reapply as not repeated. Failed JUnit is retained before cleanup; strict risky/warning failure behavior was restored after rejecting worker suppression.

## Bounded SMTP on the genuine application schema

Command: `node backend/scripts/run-shared-hosting-mail-gate.mjs` in the isolated mail worktree, using all 18 genuine migrations. **25 tests / 133 assertions passed** on PHP 8.4.26 with pcntl and MySQL 8.4.11. The former substitute mail tables were removed from the tests; reservation fixtures satisfy real identity/reference/service foreign keys.

Receipt: `scratch/hostpapa-mail-runtime-worker/scratch/receipt-shared-hosting-mail-1791834855983-mail_h2_6f919dbae2a2.json`. Source hashes, synthetic SMTP logs and JUnit are retained there. It remains attributed to that proposed worker source, not to an unexecuted final release SHA.

Verified: committed delivery admission before SMTP; another principal writer progresses during network I/O; proof/contact/credential authority and terminal revocation cannot be resurrected; bounded definite pre-submit retries; uncertain delivery never automatically replays; reservation remains confirmed on mail failure; encrypted write-only settings; 465 implicit TLS / 587 required STARTTLS; socket/wall deadlines and nonblocking transport shutdown. Corrected helper uses the canonical cron timeout exception and preserves/propagates its outer deadline.

This is local synthetic provider acceptance. It does **not** certify actual HostPapa SMTP delivery to an external mailbox. The owner's earlier webmail exchange is separate evidence.

## Focused joined source checks

`MYSQL_MVP_TEST_FILTER` selects only mail/site mutations, CMS expiry after a waited lock, and staff recovery with locked history. The first integrated run: eight tests / 110 assertions with one failure, retained at `scratch/mysql_mvp_294c0c6f51ce` in the integration worktree. It exposed worker output changing explicit outer-transaction rejection into a silent false result. Codex restored the accepted `LogicException` refusal; only that failing case was rerun: **one test / three assertions passed** (`scratch/mysql_mvp_0a16800866f3`). Its 529 source hashes and JUnit hash were independently matched. No broad suite was repeated for this small correction.

Other focused corrections retained their own runs: publication/reservation 3/89; schedule plus real MFA races 4/76; staff history recovery 1/7; the final failing CMS/schedule/mail/site group 9/128. These counts are not summed into a fictional final-head whole-application gate.

## Preserved failures and source corrections

Earlier native runs retained: 184 tests with 69 errors/57 failures; 185 with 97 errors/25 failures; 185 with 48 errors/22 failures; Codex joined 184 with four errors/12 failures; subsequent joined 184 with only a shared throttle-test cache key collision. No failed evidence was removed. The final green run preserves the real two-success-then-429 assertion with a network-test-specific key.

Concrete fixes include native UTC database time after waited locks, strict MySQL error mapping, bounded owned-transaction retries, exclusive upserts for rate buckets, atomic mandatory aircraft geometry, immediate FK-compatible document/revision insertion, CMS/gallery authority rechecks after every waited aggregate lock, bounded primary-key staff session locking instead of locking expired history, exact invitation audit allowlist, actual source fixtures, and MySQL-aware negative/corruption probes. Privileged lock observation is confined to an owned test-only observer; no production PROCESS privilege is required by the application.

## Remaining release gates

H3 installer/static/private Composer bundle remains excluded pending independent inspection and an actual bundled install/rollback gate. First-admin bootstrap business transaction is not accepted yet. Real HostPapa DDL/runtime grants, Laravel HTTP platform, cron cadence/quotas, actual application mail delivery, restore/rollback and joined EN/AR browser workflow remain unverified. No cPanel upload, production write, paid provisioning, DNS change, GitHub Actions, merge or deployment occurred.

## Owner bootstrap and enrollment continuation follow-up

The private `hostpapa:bootstrap-owner` command binds the exact release SHA and live database to a closed owner JSON file outside public_html (0600, owner-bound, bounded read). It creates only an invited administrator, encrypted SMTP settings, a 24-hour single-use invitation and durable outbox within one sentinel-serialized transaction. No password, MFA credential or full session is created. No email is sent while locks are held. Success erases the private input; failure retains it for operator correction with fixed secret-free output. Normal invitation acceptance and MFA enrollment remain mandatory.

Real MySQL focused owner gate: `MYSQL_MVP_TEST_FILTER=BootstrapOwnerTest node backend/scripts/run-mysql-mvp-gate.mjs`; **2 tests / 28 assertions passed**. An injected audit trigger failure rolls back staff, settings, invitation and outbox; private input is retained. Success persists exactly one invited administrator with no password/MFA, encrypted settings and one 24-hour proof; repeat bootstrap refuses. These tests boot the app under testing and explicitly exercise the command under a synthetic production environment after boot. They do not certify a complete production-profile installer or real SMTP. Receipt: `scratch/receipt-mysql-mvp-gate-1791836699677-mysql_mvp_0b831af83827.json` in the integration worktree. All source hashes and JUnit match current tested bytes.

Staff login now supports the existing `enrollment_required` response for verified, password-authenticated `pending_enrollment` accounts whose five-minute enrollment challenge expired. It issues only a session-bound `enroll_mfa` pending cookie, never full staff authority or login-MFA authority. Unknown, suspended, unverified and wrong-password accounts retain rejection. Confirmation still requires a fresh TOTP and rotates to full authority only afterward; superseded pending secrets are erased.

Focused enrollment command: `MYSQL_MVP_TEST_FILTER='StaffLifecycleTest::test_verified_password_resumes_expired_enrollment_without_granting_staff_authority|StaffLifecycleTest::test_invitation_then_enrollment_grants_full_authority_only_after_fresh_totp|StaffAuthenticationTest::test_eight_operation_http_chain_and_contract_captures' node backend/scripts/run-mysql-mvp-gate.mjs`; **3 tests / 61 assertions passed**. Receipt: `scratch/receipt-mysql-mvp-gate-1791836635412-mysql_mvp_195d83ab7065.json`. JUnit and application/test hashes match. The runner subsequently moved the owner-only suite before identity fixtures so its empty-database prerequisite holds in a later integrated gate; this runner-only ordering change is disclosed, not attributed to the prior execution.

The earlier failed expired-enrollment fixture violated the database's issued-before-expiry constraint; it was corrected by moving both timestamps into the past, preserving the constraint. Its failed evidence remains retained. No broad suites were repeated for this follow-up.

## Exact-source static build preparation

`node scripts/build-hostpapa-shared-client.mjs --origin=https://www.gazaairport.com` prepares only a static artifact. It requires clean committed source, explicitly enables the existing backend UI through the accepted production opt-in, uses same-origin `/api/v1`, runs the existing HostPapa Vite build and writes `dist/client/build-receipt.json` only after success and an unchanged Git source check. The receipt includes exact HEAD, actual build flags, origin, timestamp and every static artifact SHA-256. Symlink artifacts, wrong origins, failed builds or build-generated source changes cannot produce a passing receipt. It performs no upload or deployment and does not update hostpapa-deploy.

Checks performed so far: Node syntax/help; both approved origins validated with the actual client configuration; three subprocess negative origin controls (HTTP, forbidden api subdomain and custom port) rejected before build. A full shared-backend static build is deliberately deferred until H3 source integration so the eventual package is built once from the exact release candidate. No claim of built artifact or release acceptance is made from these guard checks.
