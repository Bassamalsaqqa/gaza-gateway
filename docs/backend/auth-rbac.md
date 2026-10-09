# Authentication, RBAC and identity lifecycle

Status: Phase 12 Complete / Accepted Source (independently accepted at 7dab821d7d205b41ae925e013fe9c69a97a7e875). No runtime authentication is implemented.
The closed, versioned identity-lifecycle.v1.json is normative. Its design and relational constraints are checked against independently authored architectural policy in scripts/lib/backend-identity-policy.mjs and backend-identity-relations.mjs. Tests are deterministic development models; they are not proof of real HTTP middleware, cryptography, mail delivery or concurrent database behavior.

## Realms and browser protocol

Passenger users and staff_users are distinct principals with separate Laravel guards and PostgreSQL session handlers. A passenger account never grants staff authority. Use opaque cryptographically random session identifiers, store only lookup digests, encrypt session payloads, and include principal ID, realm, credential epoch, absolute and idle expiry. An anonymous bootstrap session has no principal and no protected access.

| Cookie            | Realm                                                 | Absolute / idle expiry |
| ----------------- | ----------------------------------------------------- | ---------------------- |
| gza_session       | passenger                                             | 7 days / 24 hours      |
| gza_staff_session | staff                                                 | 8 hours / 60 minutes   |
| gza_staff_pending | pending staff proof, bound to anonymous staff session | 5 minutes, 5 failures  |

All cookies are host-only on the API domain, Secure, HttpOnly, SameSite=Lax, Path=/api/v1. No Domain attribute. Path is a routing filter; guards enforce isolation. Local HTTPS should retain these properties. Staging uses its own API host, secrets and sessions.

GET /auth/csrf and GET /staff/csrf return raw {csrfToken} in no-store JSON and initialize the appropriate anonymous session. Every other JSON success uses {success: true, data, meta}. Fetch uses credentials: include. Raw CSRF tokens live in browser memory; do not use the encrypted X-XSRF-TOKEN cookie protocol accidentally.

The exact x-protocol on every operation defines trusted branch selection, Origin and CSRF requirements. Public unsafe operations (registration, login, recovery, quotes, checkout and contact included) require their live anonymous/full realm session's raw X-CSRF-TOKEN and an exact configured frontend Origin. Protected cookie writes require their realm session token. Guest header grants require the exact Origin and verified grant, without cookie CSRF only on that selected header branch. Invalid authenticated cookies or conflicting principals fail; never fall back to guest authority. Webhooks require native provider signature verification and are exempt from browser Origin/CSRF.

Implement unconditional VerifyApplicationCsrfHeader before mutations. Laravel 13's default request-forgery middleware permits same-origin Sec-Fetch-Site requests before token comparison; that default does not satisfy this contract. HTTP tests must disable framework testing shortcuts. Production origins are exactly https://www.gazaairport.com and https://gazaairport.com; staging and localhost cannot enter that allowlist. See [Laravel 13 request forgery documentation](https://laravel.com/framework/docs/13.x/csrf).

## Passenger registration, verification and recovery

Registration creates an unverified account with unique normalized email, a server Argon2id password hash and epoch 1. Duplicate registration yields a generic receipt without changing an existing password, profile, status or ownership. No login until email verification and active status. Email normalization never changes password bytes; passwords are not trimmed.

Passenger passwords require 15..128 Unicode code points; staff passwords 12..128. Argon2id floor is 64 MiB, time cost 4, parallelism 1, benchmarked and bounded against denial of service before production. Never silently truncate. Common/compromised password checks and server-side rate limits supplement length.

Verification tokens use 32 random bytes, SHA-256 digests, exact purpose, principal, email snapshot and credential epoch; absolute TTL 24 hours. Resending revokes preceding active verification proofs. Consuming the proof once changes unverified to active; suspended remains suspended. It does not create a full session.

Forgot-password requests always return generic 202, including unknown emails. Passenger and staff reset proofs use separate FK-backed tables, 32 random bytes, digest-only storage and 30-minute expiry. They work across browsers; authorization comes from the delivered proof, not its issuing browser. Consumption requires a valid realm CSRF context, the exact stored proof and current principal/email/epoch. Lock principal and proof, update password, consume proof, increment epoch, revoke all old sessions, pending challenges and recovery proofs in one transaction. Do not auto-login or unsuspend. User email is immutable through profile updates.

Full login regenerates session ID and CSRF token. Password changes, logout, session revocation and account suspension invalidate persisted authority. Session-management operations always scope session UUIDs to the current principal and realm. Preserve single-name travelers, free-text nationality, stable IDs, valid calendar DOB, existing retired meal preferences on reads and active meal context on preference changes.

## Staff invitation, MFA and step-up

Staff directory operations require admin.manage and recent session-bound MFA. Invitations target a persisted staff UUID, role, normalized email snapshot and credential epoch; expire exactly 24 hours after issuance. Reissue/revoke invalidates earlier proofs. Acceptance consumes the token, sets a 12..128-code-point password and verified email, and enters pending_enrollment; it provides no full staff session.

A password-valid active staff member enters login_mfa, bound to the anonymous staff session and credential epoch. Only POST /staff/mfa/challenge and /staff/mfa/verify accept that purpose. Enrollment accepts only /staff/mfa/enrollment/setup and /staff/mfa/enrollment/confirm with enroll_mfa. Pending cookies cannot authorize /staff/me, session management or any admin domain. Purpose, binding, expiry, attempts, status and revocation are checked from maintained records.

TOTP: RFC 6238 HMAC-SHA1, six digits, 30-second steps, ±1 step window. Secrets are encrypted; versions are immutable. A unique (staff_id, mfa_version, counter_step) consumption prevents concurrent replay. Recovery codes: ten independently random codes with at least 128 bits each, hashed, displayed once, and atomically consumed. One code cannot serve two sessions. Successful enrollment/login consumes pending authority, revokes the anonymous session, rotates session/CSRF and creates full authority only with active status, verified email, usable password and confirmed current MFA version.

Staff password reset preserves suspension and does not bypass MFA. Recovery-code login still enforces the current credential version, pending session binding and attempts. Loss of password and MFA together requires an owner-controlled offline recovery procedure with audit and the directory sentinel; no public endpoint bypass.

POST /staff/step-up consumes a fresh current MFA proof and records mfa_verified_at on that exact session. Sensitive directory/invitation/password/MFA replacement, migration commit and publication evidence/activation operations require a step-up within 300 seconds. MFA replacement stages an encrypted candidate with a higher version while the old confirmed credential remains valid. Confirmation under the sentinel consumes the candidate proof/counter, switches the version, increments epoch and revokes all old sessions, recovery codes and pending proofs. Require fresh login. Expired or failed setup cannot revoke the current usable credential.

See [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238) and [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Booking access, receipt and ownership

A booking reference or surname is only a lookup candidate. POST /bookings/{ref}/challenge always returns generic 202. A mismatch creates an indistinguishable decoy with nullable booking FK and no deliverable authorization. Real matches dispatch a six-digit email OTP through a separate-pepper keyed HMAC digest, bound to challenge ID, exact booking, purpose, epoch and requesting session. Ten-minute expiry and five persisted failures; exhausted, consumed, revoked, undelivered or decoy challenges cannot mint grants.

Verification atomically consumes the OTP and issues a 32-byte opaque X-Booking-Token for 15 minutes. Store its digest, booking FK, security epoch, scope version and explicit approved operation IDs. Keep the token in browser memory. Permissions are exact operation scopes, not an unrestricted bearer login. Booking mutations by staff additionally require commercial.edit; reads require commercial.view. Passenger-cookie branches require current authenticated ownership.

Authenticated claiming has its own claim_booking challenge/verify flow, bound to the passenger and session. Verification issues a five-minute single-use claimProof. Claim locks booking and proof, validates current epoch, rejects foreign ownership with 409, consumes proof, sets ownership and increments booking security epoch. Self-claim can be an honest no-op; it still consumes the proof. It never transfers a foreign booking.

Booking creation returns a separate X-Booking-Receipt token, valid ten minutes solely for GET /bookings/{ref}/receipt. That endpoint exposes minimal reference/status/itinerary and authoritative money only; no contact, document, DOB, staff or card details. Every contact mutation, ownership change or security revocation increments booking security epoch and revokes all challenges, grants and receipt proofs immediately.

## Server permissions and eligible last administrator

| Role   | Canonical permissions                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| admin  | dashboard.view, ops.view, ops.edit, content.view, content.edit, commercial.view, commercial.edit, engagement.view, engagement.edit, admin.manage |
| editor | dashboard.view, content.view, content.edit                                                                                                       |
| viewer | dashboard.view, ops.view, content.view, commercial.view, engagement.view                                                                         |

This preserves src/lib/admin.ts. Operation-policies.v1.json pins exact security alternatives and closed context predicates. Site contact/appearance settings require admin.manage; engagement.edit grants inbox workflow only. Browser permission displays are not authorization.

Every mutation affecting administrator eligibility locks staff_directory_control(id = 1) FOR UPDATE, then staff rows in ascending ID order, then proof/session rows in ascending ID order. Count eligible admins in the proposed post-change directory: admin role, active, verified email, usable password, confirmed unrevoked current MFA. Reject fewer than one with 409 last_admin_conflict. Role, status, deletion, verification, password availability, initial confirmation, replacement and offline recovery all follow this protocol. Seed the sentinel and bootstrap the first eligible admin offline under owner control. Deletion is deactivation while historical audit/FKs refer to the principal. Real competing PostgreSQL transactions are required in Phase 13B; sequential models do not establish a concurrency guarantee.

## Persistence, delivery and throttling

identity-lifecycle.v1.json lists all identity columns, nullability, FK targets, unique constraints and SQL CHECK expressions. Four purpose/realm proof tables replace polymorphic identity tokens. Staff MFA counters/recovery codes use composite FKs to (staff_id, version). Current MFA pointer is nullable during invitation; initial confirmation sets it transactionally. Proof scopes are nonempty JSON arrays contained in exact approved operation-ID sets.

security_dispatch_outbox has five distinct nullable proof FKs and num_nonnulls(...) = 1. Never pretend a polymorphic proof_id has referential integrity. Only a short-lived encrypted delivery payload may contain raw OTP/token material; queue workers scrub it after provider acceptance, expiry or permanent failure. Provider acceptance is not delivery. Retries do not extend deadlines or mint new proof authority. No secrets or contact bodies in audit/logs.

Persist rate buckets with unique realm/operation/budget/key-digest/window boundaries. Limits are explicit in the manifest: login 5/minute per subject+IP and 30/5 minutes per IP; dispatch 3/15 minutes per subject+IP and 20/hour per IP; guest challenges 5/15 minutes per reference+session+IP and 30/hour per IP; proof checks 10/10 minutes per subject+IP; step-up 5/10 minutes per staff+session+IP. Charge all relevant budgets atomically; 429 includes Retry-After. Expiry cleanup uses bounded batches; failed authorization does not reset attempts.

No browser credential, prototype gza-admin principal, fake audit or production session is migrated. Phase 13 must prove real hashing, cookie handlers, delivery, negative HTTP middleware, revoked-epoch behavior, concurrent proof consumption and sentinel contention before production cutover.
