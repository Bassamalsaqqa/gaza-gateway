# Optional initial staff MFA contract

This is the current owner-authorized amendment to the initial staff MFA policy. Historical Phase 13B acceptance evidence remains historical. See the [production ADR](../production/ADR_OPTIONAL_INITIAL_STAFF_MFA_2026-10-13.md).

| Operation | Success branch | Authority |
| --- | --- | --- |
| `postStaffInvitationAccept` | 200 `{status: "authenticated", expiresAt}` | Single-use invitation plus newly created password; rotates anonymous session into password authority |
| `postStaffLogin` | 200 `{status: "authenticated", expiresAt}` | Verified active never-enrolled staff and actual password; rotates session |
| `postStaffLogin` | 200 `{status: "mfa_required", expiresAt}` | Enrolled staff password; only pending cookie, no Admin identity |
| `postStaffMfaChallenge` | 200 `{status: "mfa_required", expiresAt}` | Exact bound anonymous session and login-MFA pending cookie |
| `postStaffMfaEnrollmentSetup` | 200 `{secret, qrCodeUri, expiresAt}` | Full own password session, staff CSRF, body `{currentPassword}`; replaces staged enrollment token only |
| `postStaffMfaEnrollmentConfirm` | 200 `{enrolled: true, recoveryCodes, user}` | Same full own session, current epoch, canonical enrollment pending cookie, five-minute password verification and unused valid TOTP; rotates to MFA authority |
| `postStaffStepUp` | 200 `{verified: true, expiresAt}` | Never-enrolled: exact `{currentPassword}`; enrolled: exact `{totpCode}` or `{recoveryCode}` |

`StaffLoginResponse` and pending-only `StaffPendingAuthResponse` are separate schemas. The pending challenge schema cannot report `authenticated`. Invitation acceptance cannot report a pending enrollment state. Client schema gates, closed validators and generation pins use these same branches.

Password-only sessions have null `mfa_version` and `mfa_verified_at`. Existing confirmed MFA, including revoked history or a broken current pointer, never silently becomes password-only. Full-session checks share `StaffSessionAuthority`; fresh password or factor authority is required for directory writes and password changes. `StaffEligibilityPredicate` includes active verified administrators with a usable Argon2id hash and either no confirmed MFA history or a valid current confirmed/unrevoked credential. Sentinel-first transactional locking remains unchanged for eligibility mutations.

Initial setup is no longer an anonymous pending-cookie endpoint. Anonymous and pending-login sessions are rejected. Setup always verifies the current password and starts a new bounded staged secret; it cannot replace or disable enrolled MFA. Five failed confirmation attempts exhaust and erase the staged secret. Once enrollment succeeds, prior password sessions are revoked; every later login must pass the existing factor challenge. Recovery codes are returned once and never persisted in plaintext by these UI paths.

No production UI mode, provider configuration, dependency, deployment or mail behavior is activated by this source amendment. Disabling enrolled MFA is unavailable. The standalone MySQL probe uses synthetic data and a PDO facade solely to execute the actual migration SQL; it does not substitute for Laravel feature tests.

Focused actual Laravel evidence: the four approved staff lifecycle/RBAC/eligibility files passed 28 tests / 225 assertions; the changed optional-MFA file then passed 5 tests / 78 assertions including the mixed password/MFA last-admin subprocess race on fresh MySQL. Additive migration up/rollback/reapply passed through Laravel. See the worker report for exact commands, preserved initial test-helper failure and remaining browser/build/deployment limits.
