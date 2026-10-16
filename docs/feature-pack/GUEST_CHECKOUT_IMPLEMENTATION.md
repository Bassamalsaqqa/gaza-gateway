# Guest checkout and booking access

Implemented in `mvp-free-booking.tsx`, `mvp-booking-access.tsx`, `guest-client.ts`
and `trip-client.ts`. The existing `/book`, `/manage` and `/check-in` routes
remain bilingual and use the backend authority when enabled.

- Guest checkout is the default; account holders can still sign in. The canonical
  passenger fields, real seat geometry, meals and account bookings are preserved.
- Guest email verification uses a six-digit code sent through the existing bounded
  dispatcher. Challenges last at most ten minutes; server grants last at most
  thirty minutes and never outlive the passenger session. Delivery is queued,
  with no one-minute delivery promise.
- The passenger API realm supplies the anonymous session cookie and CSRF token.
  Codes, references and contact details are kept out of browser persistent storage
  and URLs. In-memory verification state is a UX aid; the server enforces access.
- Changing the contact email invalidates pending async code requests, challenge
  state and client proof. Late responses after edits or unmount are ignored.
- Round trips select seats/meals separately for each leg and call the atomic trip
  endpoint. Return routes must be opposite and depart after outbound arrival in
  absolute time. Each leg retains its own ticket/reference and cancellation scope.
- An ambiguous confirmation freezes its exact command, principal scope and UUID.
  Network errors, 5xx, 401/403 and 429 retain it for the same-command retry. Only
  definitive 409/422 rejections unlock edits. Session/grant expiry allows email
  reverification without destroying the frozen submission.
- `/manage` requests a code using reference and email, gives the same acknowledgement
  for real and unmatched bookings, then permits verified viewing, printing and
  cancellation. Account trips remain linked from the lookup screen. Cancellation
  uses the existing accessible confirmation dialog and the real backend mutation.
- Confirmation displays actual confirmed/cancelled states. The round-trip screen
  previews and prints the selected leg; tickets use the shared dynamic component.

## API contracts

All writes use `realm: passenger`, HTTPS, same-origin policy and CSRF. Paths are
relative to `/api/v1`. Unknown response fields and mismatched reservation/ticket
snapshots fail closed in the existing strict client schemas.

| Path | Request | Success data |
| --- | --- | --- |
| POST `/guest-reservations/email-challenges` | `{email}` | `{challengeId,expiresInSeconds}` (202) |
| POST `/guest-reservations/email-verifications` | `{challengeId,code}` | `{verified:true}` |
| POST `/guest-reservations` | canonical reservation command | `{reservation,ticket}` (200 replay/201 new) |
| POST `/guest-reservations/access-challenges` | `{reference,email}` | same generic challenge shape (202) |
| POST `/guest-reservations/access-verifications` | `{challengeId,code}` | `{verified:true,reference}` |
| GET `/guest-reservations/{ref}` | session-scoped grant | `{reservation,ticket}` |
| GET `/guest-reservations/{ref}/ticket` | session-scoped grant | `{reference,status,tickets}` |
| POST `/guest-reservations/{ref}/cancel` | `{}` | `{reference,status,changed,cancelledAt}` |
| POST `/reservation-trips` or `/guest-reservation-trips` | `{submissionId,contact,legs:[outbound,return]}` | `{reservations:[detail,detail]}` |

See `VERIFICATION_2026-10-16.md` for final integration evidence and limitations.
The source lane does not authorize a production build, ZIP, migration or release.
