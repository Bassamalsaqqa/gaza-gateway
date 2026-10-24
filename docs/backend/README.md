# Gaza Gateway — Backend API, Data Model & Contract Authority

This document is the authoritative contract and architecture guide for the Gaza Gateway backend API, relational data model, authentication, role-based access control (RBAC), security boundaries, and client-to-server migration map.

Machine-executable specifications and schema files are maintained alongside this document:
- **`openapi.v1.json`**: Complete OpenAPI 3.1.0 specification (140 operations across 132 paths, 14 Phase 13A–G domain tags).
- **`operation-policies.v1.json`**: Machine authorization rules, security schemes, and rate-limiting policies for all 140 operations.
- **`identity-lifecycle.v1.json`**: State machine transitions for passenger and staff authentication lifecycles.
- **`inventory-payment.v1.json`**: Invariant rules for free commemorative seat holds, booking integrity, and ticket dispatch.
- **`publication-lifecycle.v1.json`**: Release snapshotting, content hash verification, and atomic publication workflow.

---

## 1. Platform & Hosting Architecture

The backend operates under strict hosting and runtime invariants defined in [docs/HOSTPAPA_DEPLOYMENT.md](../HOSTPAPA_DEPLOYMENT.md) and [AGENTS.md](../../AGENTS.md):

- **Production Host:** HostPapa shared cPanel hosting account exclusively (`gaza5045`). Strictly zero external cloud databases, VPS instances, container daemons (Docker), or Node.js background processes in production.
- **Application Runtime:** Modular Laravel 13 running on PHP 8.4+ (production LiteSpeed web SAPI observes PHP 8.5+).
- **Database Authority:** MySQL 8.4+ with InnoDB storage engine (`utf8mb4_unicode_ci`).
- **Filesystem Boundaries:**
  - Public web root: `/home/gaza5045/public_html/` contains the prebuilt static React 19 frontend and the Laravel `/api` public entrypoint (`index.php` and `.htaccess`).
  - Private application root: `/home/gaza5045/gaza-gateway/` contains private application code, environment configuration (`.env`), framework cache, logs, and private archive uploads.
- **Scheduled Tasks:** Single cPanel cron job executing every 10 minutes (`*/10 * * * *`) through the verified wrapper script to process queued ticket emails, flight schedule generation, and expired hold pruning.

---

## 2. API Wire Protocols & Envelope Invariants

The OpenAPI specification records the broad domain contract, including planned payment/check-in surfaces. It is not an inventory of deployed routes. Actual enabled operations are defined by `backend/routes/` and their controllers; the application has no real airline operations or payments.

### A. Envelope Standards
Normal API responses use canonical envelopes (bootstrap and file responses are exceptions):

1. **Standard Success Envelope (`200 OK`, `201 Created`):**
   ```json
   {
     "success": true,
     "data": { ... },
     "meta": {
       "timestamp": "2026-10-24T12:00:00Z",
       "requestId": "req_01h7x..."
     }
   }
   ```
2. **Standard Error Envelope (`400`, `401`, `403`, `404`, `409`, `422`, `500`):**
   ```json
   {
     "success": false,
     "error": {
       "code": "VALIDATION_FAILED",
       "message": "Human-readable explanation of error.",
       "details": { ... }
     }
   }
   ```
3. **Explicit Bootstrap Exceptions:**
   The two CSRF bootstrap endpoints return raw JSON; attachment/ticket downloads return file responses:
   - `GET /api/v1/auth/csrf`: Returns `{ "csrfToken": "..." }`
   - `GET /api/v1/staff/csrf`: Returns `{ "csrfToken": "..." }`
   Both endpoints establish the initial session cookie and CSRF token.

### B. Request Invariants & Validation
- **Closed Schemas:** All command payload schemas enforce `additionalProperties: false`. Undeclared properties are rejected with `422 Unprocessable Entity`.
- **Unicode Code Point Counting:** String length constraints (`minLength`, `maxLength`) count Unicode code points, not UTF-16 code units or raw bytes.
- **Monetary Values:** All prices and charges are represented as integer USD minor units (cents) in internal schemas and API responses, preventing floating-point rounding errors.

---

## 3. Authentication, RBAC & Security Boundaries

### A. Authentication Realms
The platform isolates three distinct authentication domains:
1. **Public & Guest:** Anonymous visitors and guest bookers. Guest bookings use cryptographic verification tokens (`X-Booking-Token`) for self-service lookup and cancellation.
2. **Passenger Realm:** Authenticated traveler accounts via session cookie (`PassengerCookieAuth`, cookie name `gza_session`). Account authentication and email verification follow the identity routes; guest booking uses a separate email-code flow.
3. **Staff Realm:** Administrative operators via dedicated session cookie (`StaffCookieAuth`, cookie name `gza_staff_session`) and server-enforced role permissions.

### B. Canonical Staff Permissions
Staff access is strictly governed by the 10 canonical permissions defined in `operation-policies.v1.json` and `CANONICAL_PERMISSIONS`:

| Canonical Permission | Scope & Protected Operations |
|---|---|
| `dashboard.view` | Access to operational administrative dashboard and aggregate activity metrics |
| `ops.view` | Read-only inspection of flight schedules, aircraft assignments, and operational gates |
| `ops.edit` | Operational modifications, manual flight status overrides, delays, and gate changes |
| `content.view` | Read-only access to CMS drafts, revision history, and page previews |
| `content.edit` | Authoring, updating, discarding, and publishing CMS documents and page revisions |
| `commercial.view` | Read-only inspection of commercial catalog options, fare rules, and pricing |
| `commercial.edit` | Management of fare tiers, ancillary catalog options, baggage tiers, and meals |
| `engagement.view` | Read-only inspection of public contact enquiries and community archive submissions |
| `engagement.edit` | Moderation, response status, and publication of archive submissions and enquiries |
| `admin.manage` | Administrative staff directory management, role provisioning, and system settings |

### C. Directory Sentinel Locking
To eliminate race conditions during staff provisioning and permission updates, the database enforces single-row sentinel locking via the `staff_directory_control` table. Administrative mutations must acquire an optimistic or pessimistic lock on `staff_directory_control` before committing changes to `staff` or `staff_roles`.

### D. CSRF & Transport Security
- **SameSite Cookies:** Cookies use `SameSite=Lax`, `Secure`, and `HttpOnly` flags.
- **Session-Bound Token:** Unsafe HTTP writes (`POST`, `PUT`, `PATCH`, `DELETE`) require the `X-CSRF-TOKEN` header matching the active session token.
- **Origin Verification:** Production API requests reject origins other than `https://www.gazaairport.com` and `https://gazaairport.com`.
- **PII Isolation:** Passenger email addresses and phone numbers are excluded from general operational feeds and accessible only to authorized staff (the applicable server-side permission) or verified booking holders.

---

## 4. Implemented Persistence

The authoritative physical schema is `backend/database/migrations/`; do not infer SQL table or column names from frontend domain types or the planned API contract.

- Identity: `users`, `staff_users`, `passenger_sessions`, `staff_sessions`, verification/recovery tables and `staff_directory_control`.
- Reference data: `aircraft`, `airports`, `schedules`, their revision controls, revision records and audit events.
- Symbolic reservations: `mvp_services`, `mvp_reservations`, `mvp_reservation_passengers`, seat claims, submission records and the guest challenge/grant tables. Preserve existing reservation snapshots and idempotency records; catalog changes must not reprice historical bookings.
- CMS: `editorial_documents`, `editorial_revisions`, `editorial_published_revisions` and `editorial_audit_events`; draft and public revisions are separate.
- Archive intake: `archive_contributions`, `archive_contribution_files`, `archive_contribution_audits` and `archive_mail_outbox`. Uploaded files stay private; accepting an intake record does not itself publish a gallery asset.
- Mail and analytics: `mvp_mail_messages` and related dispatch tables; `analytics_sessions`, `analytics_events`, report settings and monthly-report records.

Read the actual migration and controller before writing a query or planning a schema change. Do not reset data or run blind migration DOWN in production.

---

## 5. Client Storage Key Classification

The following registered browser keys are principally local/development repository and UI contracts, not production database authority. Production sessions use protected cookies; these keys must never be treated as authentication proof. The 17 documented keys are:

| Domain | Storage Key | Description & Scope |
|---|---|---|
| **Repository Root** | `gza.repo.v1` | Root registry configuration and feature toggles |
| **Passenger Auth** | `gza.passenger.v1` | Client-side passenger session state and profile cache |
| **Contact Data** | `gza.contact.v1` | Public contact inquiry form state |
| **Commercial** | `gza.commercial.v1` | Cached commercial catalog and fare selections |
| **Fleet** | `gza.fleet.v1` | Aircraft layout and seat map metadata cache |
| **Network** | `gza.network.v1` | Airport destination list and route metadata cache |
| **Schedule** | `gza.schedule.v1` | Timetable search and flight schedule cache |
| **Staff Auth** | `gza.staff.v1` | Administrative staff session cache |
| **Activity Log** | `gza.activity.v1` | Local operational audit trace |
| **CMS Content Draft** | `gza.content.draft.v1` | Studio draft for CMS website pages |
| **Settings Draft** | `gza.settings.draft.v1` | Studio draft for site settings |
| **Archive Draft** | `gza.archive.draft.v1` | Studio draft for archive records |
| **Booking Draft** | `gza.booking.draft.v1` | Active checkout workflow draft |
| **Skin Preview** | `gza.skin.preview.v1` | Theme and skin customization preview |
| **Admin UI State** | `gza.admin.v1` | Admin workspace filters and table layouts |
| **General Store** | `gza.store.v1` | Persistent UI preferences |
| **Locale** | `gza.lang` | User-selected language preference (`en` or `ar`) |

> [!IMPORTANT]
> **No Fabricated Keys:** The application strictly forbids un-scoped or fabricated storage keys (such as gza.repo.network.v1, gza.repo.fleet.v1, gza.repo.schedules.v1, gza.repo.commercial.v1, gza.repo.bookings.v1, gza.repo.flights.v1, or gza.theme).

---

## 6. Verification & Quality Gates

Run contract verification commands from the project root:

```bash
# Validate OpenAPI 3.1 specification, operation policies, schemas, and required docs:
node scripts/validate-backend-contracts.mjs

# Run backend unit contract tests:
node --experimental-strip-types --test tests/unit/commercial-catalog.test.ts
node --experimental-strip-types --test tests/unit/fleet-source-guards.test.ts
node --experimental-strip-types --test tests/unit/network-status.test.ts
```

For full release and deployment procedures, consult [docs/HOSTPAPA_DEPLOYMENT.md](../HOSTPAPA_DEPLOYMENT.md). For current live system status, refer to [docs/STATUS.md](../STATUS.md).
