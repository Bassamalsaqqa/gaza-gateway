# Guest backend implementation

Guest bookings use genuine nullable `mvp_reservations.owner_user_id`; no synthetic
user accounts are created. Existing account submissions and authenticated ownership
remain intact. The additive migration introduces session-bound guest submissions,
email challenges/grants, reservation access challenges/grants and an encrypted
mail outbox. It preserves frozen reservation snapshots and seat constraints.

## Authority and persistence

- Anonymous passenger session, HTTPS, allowed Origin and CSRF are required for
  writes. Guest middleware runs before throttles needing the session principal.
- Email codes are HMAC-bound to the challenge, normalized email and session.
  Management codes additionally bind the reference. Five wrong codes exhaust a
  challenge; failure counts commit before validation errors are returned. Codes
  are single-use. Management requests use generic real/decoy acknowledgements.
- Creation checks verified contact proof and rechecks current session/grant time
  after blocking domain/service/meal locks. Missing or expired contact proof is
  HTTP 403, so the UI retains an uncertain confirmation's original submission UUID.
- Guest submissions are keyed by session and UUID. Replays compare the canonical
  command fingerprint, return the existing reservation and enqueue no duplicate
  confirmation. Account list/detail/ticket methods reject null principals before
  querying; they cannot accidentally select all guest-owned rows.
- Cancellation locks session, reference revisions, service and reservation in the
  canonical order, then requires fresh session authorization and a reservation
  grant permitting cancellation. It releases real claims, retains history and
  records the cancelled status. Expired/foreign grants fail closed.
- Admin projections return a null owner for guests, with strict nullable UUID
  decoding. Guest audit actors use the real session UUID in the existing passenger
  actor category and closed guest metadata; existing account audits are unchanged.

## Mail and migration safeguards

The existing dispatcher also handles the encrypted guest outbox. Admission commits
before SMTP. Session/challenge/outbox locks, a claim nonce, attempt counter and
lease fence prevent stale finalizers and overlapping send admission. Expired or
consumed proof is rejected; accepted, uncertain and terminal failed payloads are
scrubbed. Uncertain delivery is never blindly retried. Definite pre-send failures
use bounded retries/backoff. Existing identity mail retains its protections; the
shared-host hard timeout propagates. No daemon, new cron or external service is
introduced.

Migration rollback refuses when genuine guest reservations exist. With account-only
records, restoring the non-null owner column temporarily drops and re-adds the same
`ON DELETE RESTRICT` foreign key (required by MySQL), then restores the original
owner check and trigger. Foreign-key checking is never disabled. Any production
migration/release remains separately guarded and owner-authorized.

Challenges/grants have bounded authorization lifetimes and session cascades. These
lifetimes do not claim that all expired metadata is immediately deleted. Encrypted
pending mail is erased by the existing dispatch maintenance path.

See `VERIFICATION_2026-10-16.md` for actual final focused test evidence. Real HostPapa
SMTP delivery, physical-device acceptance and Issue #15 production preservation
certification are separate; local synthetic fixtures do not certify them.
