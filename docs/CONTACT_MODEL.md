# Contact Domain & Administrative Inbox Model (Phase 5D)

> **Document Status**: Active Architecture Specification (Phase 5D Complete / Accepted Source / Deployed by Owner; Phase 6A Complete / Accepted Source / Accepted Release / Deployed by Owner; Phase 6B1 Complete / Accepted Source / Accepted Release / Deployed by Owner; Phase 6B2A Complete / Accepted Source / Accepted Release / Deployed by Owner; Phase 6B2B Complete / Accepted Source; Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2/6C/7/7B Planned / Unstarted)
> **Product**: Gaza Airport (`GZA`) & Palestinian Airlines (`PS`) — [gazaairport.com](https://www.gazaairport.com)
> **Domain Aggregate**: Customer Contact Messages (`ContactMessage`) & Administrative Inbox Workflow
> **Canonical Storage Key**: `localStorage["gza.contact.v1"]`
> **Repository Interface**: `ContactRepository` (`src/lib/contact/types.ts`)
> **Primary Implementation**: `LocalContactRepository` (`src/lib/contact/repository.ts`)
> **Coordinator**: `ContactStorageCoordinator` (`src/lib/contact/storage.ts`)

---

## 1. Executive Summary & Architecture Boundary

Prior to Phase 5D, public contact submissions and administrative inbox workflows suffered from two critical prototype disconnects:
1. **Pretend Public Submission**: Submitting the public contact form at `/contact` updated a local component state flag (`setSent(true)`) to show an inline simulated success panel without writing data to any persistent store or performing domain validation.
2. **Disconnected Admin Inbox**: The administrative staff inbox at `/admin/inbox` rendered static mock fixtures (`inboxMessages` in `src/lib/admin-mock.ts`). Actions (changing status, replying, adding notes) triggered toast notifications without persisting state changes or reflecting real public enquiries.

Phase 5D converges both public submissions and administrative inbox management into a single, canonical, typed, asynchronous domain repository: `ContactRepository`.

### Strict Domain Separation: Contact Settings vs. Contact Messages
A vital invariant in Gaza Gateway's architecture is the strict separation between:
- **Contact Settings** (`src/lib/settings/`): Managed by `SettingsRepository` under `localStorage["gza.settings.draft.v1"]`. Controls published airport contact coordinates (official telephone numbers, support email address, physical terminal addresses in EN and AR, and verified social media links).
- **Contact Messages** (`src/lib/contact/`): Managed by `ContactRepository` under `localStorage["gza.contact.v1"]`. Stores customer enquiries, conversation language, operational topics, administrative lifecycle status, staff notes, and local reply drafts.

Messages are never stored in settings, booking, passenger, legacy, or admin-session keys.

---

## 2. Storage Schema & Envelope (`gza.contact.v1`)

The storage coordinator serializes an envelope conforming to schema version 1:

```typescript
export interface ContactEnvelope {
  schemaVersion: 1;
  revision: number;
  messages: ContactMessage[];
}
```

### Contact Message Aggregate (`ContactMessage`)
```typescript
export type ContactTopic =
  | "booking"
  | "baggage"
  | "accessibility"
  | "archive"
  | "media"
  | "other";

export type ContactStatus = "new" | "open" | "resolved" | "spam";

export type ContactLanguage = "en" | "ar";

export interface InternalNote {
  id: string;
  body: string;
  createdAt: string;       // ISO 8601
  staffId: string;
  staffName?: string | undefined;
}

export interface ContactMessage {
  id: string;              // Deterministic or UUID (e.g. "cmsg-...")
  submissionId: string;    // Client-generated idempotency key
  senderName: string;      // Trimmed name (2-120 chars)
  email: string;           // Normalized lowercase email
  topic: ContactTopic;     // Canonical topic
  message: string;         // Plain-text original body (10-5000 chars)
  language: ContactLanguage; // "en" | "ar" (derived from route locale at submission)
  bookingRef?: string | undefined; // Optional PNR reference (e.g. "GZA4TQ")
  status: ContactStatus;   // "new" | "open" | "resolved" | "spam"
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  source: "public-contact" | "seed";
  assignedStaffId?: string | undefined;
  replyDraft?: string | undefined;
  internalNotes: InternalNote[];
}
```

---

## 3. Storage Coordinator & Persistence Invariants

`ContactStorageCoordinator` manages read/write access to `localStorage["gza.contact.v1"]` with the following guarantees:

1. **Deterministic Seeds on Missing Key**: When `gza.contact.v1` is absent (`null`), the coordinator exposes 5 canonical deterministic demo seeds in memory:
   - `m1`: Arabic booking enquiry (raw Arabic message, no fake translation)
   - `m2`: English accessibility enquiry (wheelchair assistance)
   - `m3`: Arabic archive donation offer (photograph collection from 1999)
   - `m4`: English media interview request
   - `m5`: English promotional spam
2. **Authority of Present Valid State (Anti-Resurrection)**: A valid stored envelope—including an empty array `{ schemaVersion: 1, revision: N, messages: [] }`—is authoritative. Seeds are never resurrected after explicit clearing.
3. **Fail-Safe Malformed Handling**: If storage contains corrupt JSON or schema violations, the coordinator falls back to a clean in-memory state `{ schemaVersion: 1, revision: 0, messages: [] }` without clobbering or overwriting the disk. Reads never silently overwrite existing storage.
4. **Mutex Queue & Transactional Serialization**: All mutations queue sequentially behind in-flight writes (`this.mutationQueue`). Each mutation:
   - Acquires the origin-wide browser lock, reads current persisted state, then clones it and executes the mutator.
   - Validates the candidate envelope against Zod schema.
   - Persists to storage. If `setItem` throws (e.g., `QuotaExceededError`), rejects with `StorageCommitError`, rolls back memory, and emits no notification.
   - Adopts candidate into memory and notifies subscribers only on successful disk commit.
5. **Cross-Tab Synchronization**: Listens for window `storage` events on `gza.contact.v1`, validates the current stored envelope and updates subscribers. Reading foreign events does not write storage back. Mutations independently reread authority under the browser lock.

---

## 4. Submission Idempotency & Conflict Detection

To prevent accidental double-submissions while maintaining strict data integrity:
- Every public form mount generates a client-side `submissionId` (`sub_<timestamp>_<random>`).
- If an enquiry is submitted with an identical `submissionId` and identical payload (name, email, topic, message, language, bookingRef), `ContactRepository.create` returns the existing message without creating a duplicate.
- If a submission reuses an existing `submissionId` with conflicting data, the repository rejects with an explicit error: `"Conflicting submissionId: message exists with different content."`
- The public UI disables the submit button while pending.

---

## 5. Public Contact Form Experience (`/contact` & `/ar/contact`)

1. **Controlled Inputs & Bilingual Fields**: Controlled inputs for Name, Email, Subject/Topic select, optional Booking Reference, and Message Textarea. Labels and helper text follow the active route locale (`/contact` in English, `/ar/contact` in Arabic).
2. **Accessible Form Semantics**: Field-level validation errors render with `aria-describedby` error references. Form submission failures render a high-priority `role="alert"`.
3. **Storage Failure Resilience**: If local storage fails on submit (quota exceeded), the form retains all user-entered inputs and displays an error alert allowing immediate retry without losing data.
4. **Settings Preview Immunity (`?settingsPreview=1`)**: When visiting `/contact?settingsPreview=1` or `/ar/contact?settingsPreview=1` to preview Contact Settings drafts:
   - The form validates inputs normally.
   - Preview is labeled even when no settings draft exists. Submission renders “Enquiry preview” / “معاينة الاستفسار” and explicitly says no enquiry was saved or transmitted.
   - `gza.contact.v1` is **not mutated**; storage remains byte-for-byte identical.
5. **Truthful Success Disclosure**: After a successful normal-route persistence commit, the form displays a truthful panel:
   - EN: *"Enquiry saved. Your enquiry has been saved in this browser for workflow testing. This prototype does not transmit messages to an airport support team yet."*
   - AR: *"تم حفظ الاستفسار. تم حفظ استفسارك في هذا المتصفح لاختبار سير العمل. هذا النموذج التجريبي لا يرسل رسائل إلى فريق دعم المطار بعد."*
   - Offers a "Send another enquiry" button that generates a fresh `submissionId` and resets the form.

---

## 6. Administrative Inbox Workflow (`/admin/inbox` & `/ar/admin/inbox`)

1. **Direct Repository Binding**: Bound directly to `useContactMessages()` and mutations. Static fixture arrays have been completely removed.
2. **Language & Text Directionality**:
   - The message body renders in its stored original language (`message.language`) with `dir="rtl"` for Arabic messages and `dir="ltr"` for English messages, regardless of the admin UI locale.
   - Technical identifiers (email, booking ref, timestamp, message ID) always remain strictly LTR (`Ltr` component).
   - No fake automated translations are generated or stored.
3. **Workflow Mutations (Gated by `engagement.edit`)**:
   - **Status Transitions**: `new` -> `open`, `open` -> `resolved` or `spam`, `resolved`/`spam` -> `open`.
   - **Internal Staff Notes**: Append plain-text internal notes with staff attribution (`staffId`, `staffName`, `createdAt`). Internal notes are strictly administrative and never leaked to public surfaces.
   - **Staff Assignment**: Assign enquiry to current staff member (`setAssignee`) or unassign.
   - **Local Reply Draft**: Save and clear working reply drafts. Discloses explicitly that external email transport is not connected: *"Email delivery is not connected in this prototype. Saved drafts persist locally in this browser."*
4. **View-Only Permissions (`engagement.view`)**: Staff with viewer role (e.g. Layla Odeh) can inspect messages, search, and filter, but mutation controls are disabled with permission tooltips.
5. **Badge & Attention Convergence**:
   - Nav badge count derives from `useContactNewCount()` (`status === "new"`).
   - Admin Dashboard Attention item (`att-inbox`: *"Unresolved customer enquiries"*) renders dynamically only when `newCount > 0`, clearing completely when all messages are opened or resolved.

---

## 7. Quality Verification & Testing Matrix

- **Unit Test Suite** (`tests/unit/contact-repository.test.ts`): 30 comprehensive unit tests verifying storage missing/valid/empty/corrupt authority, seed non-resurrection, schema normalization, idempotency, mutex serialization, rollback on quota failure, status transitions, staff notes, and assignment.
- **Correction Regressions** (`tests/unit/contact-correction.test.ts`): 11 tests covering simultaneous identical/conflicting submission identities, independent stale coordinators, valid-empty replacement, unreadable/malformed write rejection, command rollback and retry, injected note IDs and persisted identity/date validation.
- **Browser Smoke Suite** (`tests/smoke/browser-smoke.mjs`):
  - Check 53: English public submission, truthful success, same-browser admin inbox workflow, mark open, note, assignment, reply draft persistence, and no public leak.
  - Check 54: Arabic public submission, RTL directionality, raw Arabic storage without translation, and bilingual Admin rendering.
  - Check 55: Settings Preview isolation and raw Contact storage immunity in both locales.
  - Check 56: Domain validation errors, storage failure retention, and retry idempotency.
  - Check 57: View-only role permissions, genuine empty inbox handling, and reactive dashboard attention convergence.
  - Check 58: Real two-tab concurrent submissions/status/notes, canonical badges, Admin command failure retention and rapid retry without duplicate notes.
  - Check 59: Arabic validation/save errors, focus and LTR inputs, no-draft preview immunity, and truthful preview results after returning to a normal URL.
- **Visual Matrix**: 18 viewport combinations (390px, 768px, 1440px across 6 public and admin contact routes) verified zero horizontal overflow (`scrollWidth === clientWidth`).


## Correction 01 — Transaction and failure guarantees

- Persistent browser mutations require an origin-wide Web Lock named `gza.contact.v1`. Lock acquisition has a 5-second timeout. Unsupported coordination, inaccessible storage, and failed writes reject with `StorageCommitError`; there is no unsafe browser fallback. HostPapa HTTPS and localhost support this browser capability. Injected Node test storage commits synchronously within the process; Studio uses isolated in-memory state.
- Every mutation reads and validates current storage inside the lock. Present valid empty state remains authoritative even for an old coordinator. This prevents stale tabs from overwriting other enquiries, notes or status changes.
- Missing storage alone permits seeds. Malformed/unsupported startup storage exposes an empty safe view without modifying disk. Mutations reject until the envelope is repaired or deliberately removed; unreadable storage also rejects writes. A later valid storage event restores the canonical view.
- Create replay/conflict decisions happen inside the transaction. Identical replay returns the existing record without a write, revision increment or subscriber notification. Conflicting identity reuse rejects. Note IDs use the injectable ID factory.
- Persisted messages require meaningful IDs, valid timestamps/email and bounded content. Duplicate message/submission identities and duplicate note IDs are invalid. Message bodies remain original plain text.
- Status commands accept canonical statuses; the Inbox presents the specified open/resolved/spam transitions. No additional domain transition policy is claimed.
- Admin command failures show localized alerts, retain note/reply buffers and canonical badges, and allow retry. Command controls are disabled while pending; clearing a reply buffer happens only after persistence succeeds.
- Public field errors and save failures are localized, technical inputs stay LTR, invalid fields carry `aria-invalid`, and keyboard focus moves to the first invalid field or the success/preview heading.
- Compiled seeds are synthetic. User-entered enquiries may contain real names/emails/text and remain local to that browser. No form payload is logged, transmitted, placed in URLs or baked into static output.

Phase 6B2A — Sellable Commercial Catalog & Pricing Authority — is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint. Current owner-deployed production release: `2751e22be91ad74eacc9213489a57a21baf04807`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`. Deployment is confirmed by the product owner. Git/source/release provenance was independently checked after deployment; no independent live-browser verification from the ChatGPT/Codex environment is claimed. Main may advance through accepted source engineering and documentation commits while the deployed runtime source remains unchanged. Phase 6B1 is a historical completed production phase: Complete / Accepted Source / Accepted Release / Deployed by Owner (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`, engineering `b2e37ba4f7d2b0ae66a444747340acfe818a3832`). Phase 6A is a historical completed production phase: Complete / Accepted Source / Accepted Release / Deployed by Owner (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`, source `2ae1a876018992649074cbed1ebf0560e4da03ff`, engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`). Phase 5D is a historical completed phase: Complete / Accepted Source / Deployed by Owner (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2 — Network & Dated-Service Materialization (Planned / Unstarted). Phase 6C — Admin Directory Staff & Activity Convergence, Phase 7 and Phase 7B remain Planned / Unstarted.

## Accepted Phase 5D boundary

`gza.contact.v1` stores enquiries only in browser-local storage. Public submissions do not transmit data to airport staff. Admin Inbox shares those records only within the same browser/storage origin, with no cross-device synchronization or server persistence. There is no backend Contact service, SMTP service or email reply delivery; replies are locally saved drafts. User-entered enquiries may contain real PII, which remains browser-local. Contact settings remain independent in `gza.settings.draft.v1`.

Phase 5D is Complete / Accepted Source / Deployed by Owner. Phase 6A is Complete / Accepted Source / Accepted Release / Deployed by Owner. Phase 6B — Operations Configuration Persistence and Phase 6C — Admin Directory Staff & Activity Convergence remain Planned / Unstarted. Phase 7 and Phase 7B remain Planned / Unstarted.

## Phase 6B1 accepted source (historical completed production phase)

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase reconciled onto main and deployed by Bassam (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. In accepted Phase 6B2B source, aircraft and seat layouts use `FleetRepository`; Network reference configuration now uses NetworkRepository in Phase 6B2C1; public editorial and merchandising fixtures remain compiled. Commercial product configuration uses `CommercialCatalogRepository`; there is no monolithic durable OpsState. See [Schedule model](SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B2 is incomplete: Phase 6B2A — Sellable Commercial Catalog & Pricing Authority is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority is Complete / Accepted Source; Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence is Complete / Accepted Source; Phase 6B2C2 - Network & Dated-Service Materialization is Planned / Unstarted. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is not complete. Deployment is owner-confirmed; Git/source/release provenance was independently checked after deployment. No independent ChatGPT/Codex live-browser verification is claimed. The earlier Phase 6B2A post-deployment documentation reconciliation performed no rebuild or deployment.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository is separate planning-only authority.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner**, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`). FlightRepository IDs, numbers, dates, routes, and ScheduleRepository planning-only semantics remain unchanged, with additive `aircraftId` linkage. Phase 6B is incomplete. Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2 — Network & Dated-Service Materialization, Phase 6C, Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source). Phase 6B2C2 — Network & Dated-Service Materialization (Planned / Unstarted).

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2 — Network & Dated-Service Materialization remains **Planned / Unstarted**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole remains incomplete.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Complete / Accepted Source.** Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; its release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: **Planned / Unstarted**. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole remains incomplete. See [NETWORK_MODEL.md](NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.
