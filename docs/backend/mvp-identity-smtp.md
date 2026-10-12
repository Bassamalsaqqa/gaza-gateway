# Gaza Gateway — MVP Identity SMTP Dispatch Architecture

## Overview

This subsystem bridges Gaza Gateway's Phase 13B identity proof outbox records (`user_email_verifications`, `user_password_resets`, `staff_invitations`, `staff_password_resets`) with the operator-configured encrypted SMTP transport (`MailSettings`) for essential identity proof emails, tested via local synthetic SMTP verification.

The subsystem preserves:
1. The canonical Phase 13B local file capture path via `OutboxDispatcher` and `LocalProofCaptureCoordinator`.
2. Encrypted Admin SMTP credentials (`MailSettings`), operator host allowlist (`config('mvp-mail.allowed_hosts')`), and TLS validation.
3. Strict fail-closed semantics in all unconfigured, invalid, or ambiguous conditions.

## Scope Bounds

- **Included**:
  - Passenger Email Verification (`user_email_verifications`, `user_verification_id`)
  - Passenger Password Reset (`user_password_resets`, `user_reset_id`)
  - Staff Invitation (`staff_invitations`, `staff_invitation_id`)
  - Staff Password Reset (`staff_password_resets`, `staff_reset_id`)
- **Excluded**:
  - Guest Challenges (`booking_guest_challenges` / `booking_challenge_id`): MVP booking is authenticated; guest challenge outbox dispatches remain excluded from SMTP dispatch.

## Core Architectural Invariants

### 1. Canonical Lock Hierarchy and Clock Sampling
To prevent deadlocks and race conditions with concurrent proof issuers, reissuers, and authenticators, `IdentitySmtpDispatcher` enforces the deterministic lock ordering:
```
Principal (users / staff_users) -> Proof (user_verifications / resets / staff_invitations / resets) -> Outbox (security_dispatch_outbox) -> SMTP attempt marker
```
- Row locks are acquired with `FOR UPDATE` under strict PostgreSQL timeouts (`statement_timeout = '5s'`, `lock_timeout = '3s'`).
- Live database clock (`SELECT clock_timestamp() AS now`) is sampled strictly **after** all locks are held.

### 2. Live Proof Authority Revalidation
Before any submission, while holding authority locks, the dispatcher verifies:
- Proof record exists and is in state `issued`.
- Live clock is strictly before proof expiration (`expires_at`) and outbox expiration (`expires_at`).
- Credential epoch on the principal matches the proof's credential epoch (`principal.credential_epoch === proof.credential_epoch`).
- Principal email matches the proof's email snapshot (`principal.email === proof.email_snapshot`).
- Principal status is eligible:
  - Passenger Verification: `unverified` or `active`
  - Passenger Reset: `active`
  - Staff Invitation: `invited`
  - Staff Reset: `active`
- Outbox payload is decrypted and validated:
  - Recipient derived strictly from persisted proof (`proof.email_snapshot`).
  - Decrypted payload recipient must match derived recipient (`payload.recipient === proof.email_snapshot`). Caller overrides are forbidden.
  - Payload purpose and canonical raw-token digest must match the persisted proof. The committed marker must remain processing, match the attempt, and have a live deadline after locks.

If any check fails, the record is scrubbed or expired immediately, erasing ciphertext (`encrypted_payload = NULL`), and never submitted.

### 3. Durable SMTP Attempt Accounting (Migration `2026_10_11_000011`)
The additive migration `2026_10_11_000011_create_security_smtp_attempts_table.php` introduces:
```sql
CREATE TABLE security_smtp_attempts (
    id UUID PRIMARY KEY,
    outbox_id UUID NOT NULL UNIQUE REFERENCES security_dispatch_outbox(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('processing', 'accepted', 'failed', 'uncertain', 'scrubbed')),
    attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 5),
    deadline TIMESTAMPTZ NOT NULL,
    next_attempt_at TIMESTAMPTZ,
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_security_smtp_attempts_status ON security_smtp_attempts(status, next_attempt_at);
```

### 4. Processing Marker and Concurrency Control
- **Pre-I/O Commit**: A `processing` marker with bounded lease deadline (`now + 120s`) MUST commit in PostgreSQL before any external I/O or SMTP connection.
- **Outer Transaction Refusal**: Outer caller transactions are strictly refused (`DB::transactionLevel() === 0`).
- **Suppression of Duplicates**: A second worker cannot claim or send an outbox record while its marker has status `processing`, `accepted`, or `uncertain`.
- **Definite Pre-Submit Failure**: Failures occurring before SMTP DATA transmission (e.g. connection refused, network timeout) are marked `failed` with fixed bounded backoff (`next_attempt_at = now + 60s`), allowing retry up to 5 attempts.
- **Ambiguous DATA Submission Failure**: Failures during or after DATA transmission are marked `uncertain` and are **never** automatically retried.
- **Post-Acceptance DB Finalization Failure**: If SMTP accepts the message but database finalization fails (transaction rollback), the committed processing marker remains in the database. When its lease expires, it ages to `uncertain` (never reverting to `queued`).
- **Provider Acceptance Invariant**: SMTP acceptance records `provider_message_id` and `accepted_at`, but is never labeled as user mailbox delivery.

### 5. Information Hiding and Data Scrubbing
- Invalid authority erases ciphertext immediately. Accepted/uncertain payloads are erased at the persisted deadline by bounded cleanup; acceptance metadata remains.
- Raw tokens, passwords, MFA secrets, SMTP credentials, message bodies, and SMTP protocol error details are never persisted in attempt status, logs, or error responses.

## Configuration & CLI Commands

In `backend/config/mvp-mail.php`:
```php
'identity_smtp_enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true) && (bool) env('MVP_IDENTITY_SMTP_ENABLED', false),
```

CLI worker command:
```bash
php artisan mvp:identity-smtp:work {--limit=25}
```
- Available and executable only when `MVP_MAIL_ENABLED=true` and `MVP_IDENTITY_SMTP_ENABLED=true` in local/testing environments.
- Automatically registered in the Laravel scheduler with `--withoutOverlapping()` when enabled.

## Independent integration review

The worker passed nine focused PHP/PostgreSQL tests (88 assertions) after preserving earlier failures. Codex subsequently moved marker locks after canonical authority/outbox locks to prevent an expiry-cleanup lock inversion, checked marker deadline and canonical token digest, bounded stale-marker cleanup, and bounded/cleaned concurrent test subprocesses. The integrated rerun is recorded separately; the worker pass does not certify these later bytes. External delivery remains unverified.

Independent integrated evidence: `scratch/gaza_reservations_gate_65ba300a7a27710335fb5bb32a46edd5` passed 10 tests / 92 assertions with real PostgreSQL, migration rollback/reapply and owned cleanup. The later bounded parent-read change is exercised by the final consolidated gate. `scratch/gaza_mvp_browser_bd40a86b912901eea521908b` passed actual passenger UI registration, verification using a token received by synthetic SMTP, recovery using a separately received token, and sign-in with the replacement password. Raw proof tokens stay in process memory and the disposable sink; no tokens are written to browser evidence logs. Earlier failed browser hydration evidence remains preserved at `gaza_mvp_browser_e7fb5675e89e3e8e9dfeccf4`.
