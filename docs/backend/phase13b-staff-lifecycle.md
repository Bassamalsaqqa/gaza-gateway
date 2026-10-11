# Phase 13B — staff credentials, directory and MFA lifecycle

Status: locally implemented bounded package; Phase 13B remains In Progress / Awaiting Independent Review. This extends the staff HTTP checkpoint at `7570768514a5cecc4c591922cf9b76e3768e9290`. Guest access/ownership, opt-in EN/AR UI and final integrated certification remain unfinished. Remote staging gates remain deferred and unmet.

## Implemented operations

The six credential/enrollment operations are staff password forgot/reset/change, invitation acceptance and initial MFA setup/confirm. The six directory operations are list, invite, patch, deactivate, invitation reissue and invitation revocation. Three self-service operations implement MFA replacement setup/confirm and recovery-code regeneration. Together with the existing login/session operations and realm bootstraps, all 41 accepted passenger/staff identity routes now have local handlers. This route count does not claim that guest booking operations or the frontend cutover are complete.

`StaffLifecycleCoordinator` owns the credential/enrollment transactions. `StaffDirectoryCoordinator` owns closed directory and confirmed-MFA transitions; no caller-supplied transaction callback can bypass its authority checks. Controllers validate the accepted command schemas and retain canonical response envelopes. Directory writes require `admin.manage` and a same-session step-up strictly younger than 300 seconds; directory reads require `admin.manage` without forcing a new step-up. MFA self-service requires full staff authority and recent step-up, including for viewer/editor staff.

## Security and persistence

- PostgreSQL sentinel `staff_directory_control(id=1)` serializes eligibility-changing operations, followed by ascending staff and session locks. Action-time checks revalidate cookie digest, realm/auth level, revocation, deadlines, credential epoch, confirmed current MFA and raw CSRF authority. Middleware snapshots alone cannot authorize a mutation.
- Password recovery performs common native Argon2id work for known/unknown accounts and returns the same 202 acknowledgement. Proof consumption, epoch changes, session/pending/proof revocation, audit and outbox effects participate in the same transaction. Staff passwords retain the accepted 12–128 code-point policy and configured Argon2id profile. No prototype credentials are imported.
- Invitations have the exact 24-hour absolute lifetime. Reissue/revoke invalidates prior authority and increments the target epoch. Acceptance only grants a five-minute, anonymous-session-bound `enroll_mfa` pending state; full staff authority follows confirmed MFA. Setup retries preserve the same encrypted staged secret and original deadline. Five failed confirmation attempts exhaust the pending proof and erase its staged secret.
- Directory role/status changes increment epoch and revoke target sessions, pending challenges and proofs. Names-only updates preserve sessions. Activation cannot bypass verified email, usable password or confirmed MFA. Deletion is durable deactivation, retaining immutable audit/FK provenance.
- An eligible administrator must survive a mutation when one existed before it. Eligibility is active admin, verified email, usable native Argon2id hash, and confirmed/unrevoked current MFA. No first administrator is silently created; offline owner-controlled bootstrap remains an external operational requirement.
- MFA replacement stages a higher encrypted credential version bound to the exact full session and its step-up timestamp; the candidate deadline cannot outlive that authority. The old confirmed factor remains usable until successful confirmation. Confirmation consumes all matching TOTP counters, switches version, increments epoch, revokes old sessions/proofs/recovery codes and requires fresh login. Candidate failure/expiry cannot revoke the confirmed factor. Recovery regeneration replaces the ten hashed recovery codes without changing the current factor.
- `StaffTransientCleanup::expire(1..100)` follows the sentinel/principal/session/credential hierarchy and erases expired staged enrollment/replacement secrets. It never revokes a confirmed credential. The existing guarded `identity:maintain-local` command invokes this bounded cleanup and reports aggregate counts only. No automatic scheduler or remote dispatch is activated.

## Focused local evidence

Real PHP 8.4.26 and PostgreSQL 17; testing environment, default `pgsql_test`, and live database `gaza_gateway_test` asserted before fixture mutation. Owned synthetic principals and immutable audits are retained; sessions/proofs are revoked without resetting shared rate counters.

| Gate | New cases | Result |
| --- | --- | --- |
| Credential/enrollment HTTP | 4 tests / 42 assertions | Pass |
| Invitation/reset separate-process replay; enrollment exhaustion | 3 tests / 20 assertions | Pass |
| Directory HTTP, last-admin race, audit failure | 4 tests / 40 assertions | Pass |
| MFA replacement, expiry/exhaustion, recovery regeneration, confirmation race | 4 tests / 50 assertions | Pass |
| MFA audit rollback, stale admission, bounded expiry erasure | 3 tests / 19 assertions | Pass |

Each passing case was run once in its bounded package, without broad regression repetition. The real directory race produced one accepted self-demotion and one `last_admin_conflict`, leaving exactly one eligible owned administrator. Invitation/reset and MFA confirmation races each produced exactly one successful transition. Injected audit failures rolled back associated credential, session, invitation, proof and outbox changes.

Reproduce the focused files in the guarded local test container with `php vendor/bin/phpunit tests/Feature/IdentityStaff/StaffLifecycleTest.php` and `php vendor/bin/phpunit tests/Feature/IdentityStaff/StaffDirectoryTest.php`. These commands describe reproducibility; they were not unnecessarily rerun as full files after incremental checks. Raw MFA secrets and recovery codes are not persisted as HTTP capture artifacts. All-operation response-schema checks and cross-package HTTPS/browser evidence remain part of the final integrated gate, rather than being claimed from these feature tests alone.

No frontend authority cutover, paid services, production credentials, provisioning, deployment, Actions execution or merge is authorized by this package.
