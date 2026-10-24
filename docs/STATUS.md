# Gaza Gateway — Status, Provenance & Evidence Index

This document outlines the current operational status, verified live capabilities, known boundaries, actionable backlog, and a compact index of tracked historical evidence receipts for Gaza Gateway.

---

## 1. Current Operational Status

Gaza Gateway is live in production at [https://www.gazaairport.com](https://www.gazaairport.com).

| Dimension | Active Verified State (October 24, 2026) |
|---|---|
| **Production Domain** | `https://www.gazaairport.com` |
| **Installed Application Commit** | `26e31557f894c5a744da47d7abb9b25172c21e8c` |
| **Installed Git Tree** | `ff4a194a9f68e4bbc8b7cd1c1449327bd67ee6bd` |
| **Active Release Pointer** | `rel_20261024T045400_26e3155_clean` |
| **Database Migrations** | 27 migrations applied (ledger clean) |
| **Operator PR #27 Source** | `bcf8f809bd91d5b64f4026790f06cf491e178f42` |
| **Deployed Package SHA-256** | `d9d7c56a718b1e9665639bd50147f01f093aeb8a90b75a15e4440dedd37b1e8b` |
| **Deployment Timestamp** | `2026-10-24T08:14:25+00:00` |
| **Hosting Target** | HostPapa shared cPanel (`gaza5045`) |
| **Database Backups** | `/home/gaza5045/gaza-gateway/shared/backups/upgrade_20261024_080605_db853c6b` |

---

## 2. Verified Implemented Capabilities

The following features were independently verified in production during the October 24 release check:

### Bilingual Public Experience
- Full English (`/`) and Arabic (`/ar`) navigation with directional layout, Cairo/Amiri typography, and LTR technical identifiers.
- Airport storytelling: History & Past (`/airport/past`), Present memorial (`/airport/present`), and Future Vision (`/airport/future`).
- Cinematic hero video stream: Desktop and mobile MP4 playback with HTTP Range `206 Partial Content` streaming verified.
- Artist Statement: Ayman Alazraq's complete original English statement and approved Arabic translation rendered in full with proper attribution, clearly distinguished from factual Palestinian Airlines documentation.

### Flight Search & Commemorative Bookings
- Bidirectional search across regional destinations (Gaza `GZA` to Amman, Cairo, Istanbul, Doha, Dubai, Jeddah, Riyadh, etc.).
- Flight availability search returning authentic flight numbers (e.g., `PS 201`, `PS 202`).
- Interactive seat map selection for outbound and return legs.
- Guest reservation intake with email and passenger details.
- Dynamic ticket rendering adhering to calibrated 8 × 3.25-inch landscape proportions via PHP FreeType/GD.

### Editorial CMS & Content Management
- Authenticated editorial workspace.
- Revision-controlled updates with optimistic locking (`expectedRevision`).
- Verified live revisions:
  - `home`: public revision 2, editorial revision 4.
  - `pages.information`: public revision 2, editorial revision 4.
  - `airport.future`: public revision 1.
- Owner SEO metadata and contact settings preserved intact.

### Administrative Workspace & Analytics
- Authenticated admin sign-in and session management.
- Operational dashboard displaying preserved durable records: 9 confirmed bookings, 9 passengers, 4 user accounts.
- Analytics summary reporting 0 consented events and 9 authoritative bookings.
- Archive contribution intake form with private file quarantine and licensing disclosures.

---

## 3. Explicit Boundaries & Known Limitations

To maintain accurate engineering truth, the following qualifications are documented:

1. **Art & Commemoration Boundary:** Gaza Gateway is an internet-based art project and historical commemoration. It does **not** conduct real airline operations, commercial ticketing, card payments, or live airport check-in.
2. **Uncertified Production Guest Transaction:** During the October 24 release, live read-only verification was executed to confirm route health, CMS revisions, and UI flows. To avoid polluting production data, **no complete new guest OTP → booking → ticket issuance → cancellation transaction was created live**. Prior disposable browser testing provides separate evidence.
3. **Mail Delivery Uncertainty:** 7 historical email records in the outbox remain in an `uncertain` status. They will not be automatically resent. External SMTP delivery to arbitrary third-party mailboxes was not re-certified during this release.
4. **Monthly Analytics Reporting:** Automated monthly report delivery is intentionally opt-in and currently **disabled** (configured recipient: `notifications@gazaairport.com`).
5. **Physical Mobile Device Review:** While automated responsive viewport checks passed (320px through 1920px), physical iOS and Android browser acceptance remains a separate owner review item.
6. **Deferred Hardening:** Issue #11 (staff pre-throttle hardening) remains deferred unless explicitly scoped. Issue #15 (preservation reconciliation) carries qualified historical preservation evidence rather than an open certification.

---

## 4. Actionable Backlog & Next Steps

1. **Owner UX Review:** Ayman Alazraq's editorial review of the live English and Arabic artist statements at [https://www.gazaairport.com](https://www.gazaairport.com).
2. **Physical Device Walkthrough:** Hands-on verification on physical mobile devices (iOS Safari and Android Chrome).
3. **Future Upgrade Preparation:** When a subsequent software update is authorized by the owner:
   - Author a dedicated upgrade operator bound strictly to the active `26e3155` / 27-migration baseline.
   - Conduct clean-source package preparation and local rehearsal against a disposable database.
   - Execute under explicit owner GO with fresh PDO verification.

---

## 5. Tracked Historical Evidence Index

> [!NOTE]
> The records listed below preserve historical evidence and audit trails. Their parameters and baseline commits reflect dated observations and must not be used as operational instructions for the current baseline. Current operations are governed by [docs/HOSTPAPA_DEPLOYMENT.md](HOSTPAPA_DEPLOYMENT.md) and [AGENTS.md](../AGENTS.md).

### 5.1 Release & Verification Evidence
- **Batch 02 Execution Receipts (2026-10-21):** [docs/batch02/EXECUTION_RECEIPTS_2026-10-21.md](batch02/EXECUTION_RECEIPTS_2026-10-21.md) — Destination additions and forward-completion recovery receipts.
- **Production Stabilization Audit (2026-10-19):** [docs/stabilization/AUDIT_AND_STABILIZATION_REPORT_2026-10-19.md](stabilization/AUDIT_AND_STABILIZATION_REPORT_2026-10-19.md) — Flight search, ticket email formatting, and mobile cinematic verification.
- **Mobile Cinematic Evidence (2026-10-16):** [docs/review/issue-16/README.md](review/issue-16/README.md) — Hero video orientation benchmarks, captures, and media hashes.
- **Analytics Browser Acceptance (2026-10-23):** [docs/editorial-oct23/ANALYTICS_BROWSER_ACCEPTANCE.md](editorial-oct23/ANALYTICS_BROWSER_ACCEPTANCE.md) — Local browser telemetry acceptance captures.
- **Editorial Implementation Evidence (2026-10-23):** [docs/editorial-oct23/FOCUSED_EVIDENCE.md](editorial-oct23/FOCUSED_EVIDENCE.md) — Real Laravel HTTP test receipts against isolated MySQL.
- **Feature Pack Visual Evidence (2026-10-16):** [docs/feature-pack/evidence/README.md](feature-pack/evidence/README.md) — Ticket design and travel guide review captures.

### 5.2 Incident & Recovery Receipts
- **Upgrade Preflight Incident (2026-10-15):** [docs/production/UPGRADE_PREFLIGHT_INCIDENT_2026-10-15.md](production/UPGRADE_PREFLIGHT_INCIDENT_2026-10-15.md) — MySQL timeout preflight failure; establishes requirement for fresh PDO connections.
- **Batch 01 Upgrade Incident (2026-10-14):** [docs/production/BATCH01_UPGRADE_INCIDENT_2026-10-14.md](production/BATCH01_UPGRADE_INCIDENT_2026-10-14.md) — Initial migration cutover interruption and forward repair.
- **Issue #15 Preservation Reconciliation (2026-10-17):** [docs/production/ISSUE_15_PRESERVATION_RECONCILIATION_2026-10-17.md](production/ISSUE_15_PRESERVATION_RECONCILIATION_2026-10-17.md) — Historical preservation evidence reconciliation.
- **MySQL & Mail Integration Evidence (2026-10-13):** [docs/production/H1_H2_MYSQL_MAIL_INTEGRATION_EVIDENCE.md](production/H1_H2_MYSQL_MAIL_INTEGRATION_EVIDENCE.md) — Initial HostPapa MySQL connectivity and SMTP socket probes.
- **Cron Lease Evidence (2026-10-13):** [docs/production/H2_CRON_DATABASE_LEASE_EVIDENCE.md](production/H2_CRON_DATABASE_LEASE_EVIDENCE.md) — Database lease lock validation preventing concurrent cron dispatch.
- **Local Release Evidence (2026-10-13):** [docs/production/H3_LOCAL_RELEASE_EVIDENCE_2026_10_13.md](production/H3_LOCAL_RELEASE_EVIDENCE_2026_10_13.md) — Packaging and verification tool receipts.
- **Staff Access Refinement Evidence (2026-10-14):** [docs/production/STAFF_ACCESS_REFINEMENT_EVIDENCE_2026-10-14.md](production/STAFF_ACCESS_REFINEMENT_EVIDENCE_2026-10-14.md) — Staff credential hashing and authentication flow receipts.
