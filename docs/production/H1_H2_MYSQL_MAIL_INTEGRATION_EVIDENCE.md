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
