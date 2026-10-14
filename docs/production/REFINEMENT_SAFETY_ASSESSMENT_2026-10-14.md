# Refinement safety assessment — 2026-10-14

Source baseline: main fba490b8b78544b0be3217d6eeaf824af9c20bcc. This is local source work, not an installed release. No migrations, credentials, production records, SMTP settings or cron cadence changed.

## Issue #10

Rollback compatibility is read after the inherited installer file lock, real cron exclusion lease and exclusively created maintenance file. Pre-existing maintenance.php or Laravel down refuses rollback. A bounded READ COMMITTED transaction locks the fleet, network and schedules control rows in the same order as schedule mutations; missing rows fail closed. The runner then checks the active pointer, backend source pin and exact candidate migration names before the existing airport-code/block-duration compatibility predicate. It holds these locks through the existing installer and pointer verification, commits before removing maintenance, and retains owned maintenance on failure.

Fleet, Network and Schedule coordinators revalidate maintenance and the executing release under their domain lock. The shared guard clears PHP stat caches, checks the immutable /releases/<id>/backend path against current-release.txt, refuses missing/malformed/symlink pointers and returns sanitized HTTP 503 on configuration or filesystem errors. A request admitted before maintenance cannot write through obsolete code after the lock is released and maintenance has cleared.

`node --test tests/tooling/production-upgrade-safety.test.mjs` passed with cached PHP 8.4/MySQL 8.4 images and existing Composer dependencies. The test extracts the actual three named runner helpers with PHP tokenization and executes the actual Laravel writer guard. It observes real InnoDB lock waits, proves a committed in-flight BEY insertion is visible to compatibility and refused without losing that row, and proves a waiting request is refused after a source switch with maintenance removed. Compatible authority, same-count wrong migration names, missing control rows, expanded block duration and invalid pointers are covered. Task-owned containers/network are removed in finally.

This is helper-level concurrency proof, not a full installer or production rehearsal. The historical 7a8f0fa/19-migration installed pins and builder remain unchanged. Rebinding tooling to the observed b3afa9c/21-migration installation and exact next source remains release preparation, which the owner has not authorized. The installed old application does not gain these guards until an approved full-stack update. Do not reuse a historical package.

## Issue #11

AGY assessed the identifier query against a copied staff schema with 50 synthetic rows and 1,000 sequential queries per known/unknown username/email case. Username uses a const unique-index lookup; email uses an index merge over username and normalized_email. Recorded means were 0.0689–0.0929 ms; p95 0.1149–0.1475 ms. A separate wrong-password Argon2id verification averaged 140.68 ms, and a synthetic limiter-table write 0.1895 ms.

These are local microbenchmarks, not an HTTP login test or HostPapa load/timing certification. They support retaining the current bounded indexed lookup rather than changing the staff lock/limiter ordering during this mission. The pre-throttle lookup remains a lower-priority hardening issue; this assessment does not close it or prove resistance to concurrent exhaustion. Cleanup of that earlier evaluation environment was not independently verified. No production authentication policy was changed.

## Release gates

The owner authorized source commit/push and PR creation after accepting the local preview. No build, package, merge or deployment has occurred. Production media headers, exact-source rehearsal, backup/rollback package and independent release review remain gated by the owner's release-preparation authorization. The concurrency test uses existing backend/vendor dependencies, or an explicit IDENTITY_GATE_VENDOR path, plus cached PHP/MySQL images; it does not install dependencies or build images automatically.
