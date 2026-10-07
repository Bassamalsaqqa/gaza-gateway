# Activity Domain & Administrative Audit Trail Model (Phase 6C)

> **Document Status**: Active Architecture Specification (Phase 6C Implemented / Awaiting Independent Review)
> **Product**: Gaza Airport (`GZA`) & Palestinian Airlines (`PS`) — [gazaairport.com](https://www.gazaairport.com)
> **Domain Aggregate**: Operational Activity Events (`ActivityEvent`), Central Admin Audit Orchestration
> **Canonical Storage Key**: `localStorage["gza.activity.v1"]`
> **Repository Interface**: `ActivityRepository` (`src/lib/activity/types.ts`)
> **Primary Implementation**: `LocalActivityRepository` (`src/lib/activity/repository.ts`)
> **Coordinator**: `ActivityStorageCoordinator` (`src/lib/activity/storage.ts`)

---

## 1. Executive Summary & Architecture Boundary

Prior to Phase 6C, administrative activity tracking was completely synthetic:
1. `/admin/activity` rendered static mock fixtures (`activityEntries` in `src/lib/admin-mock.ts`).
2. Performing administrative operations across desk bookings, check-in, flight overrides, schedules, fleet configuration, commercial catalog, network destination basics, or staff management generated no persistent log. Operators had no visibility into previous actions or changes made in their browser session.

Phase 6C establishes the canonical, bounded, typed `ActivityRepository` and orchestrates real audit logging across all enabled administrative mutation commands.

---

## 2. Storage Schema & Envelope (`gza.activity.v1`)

The storage coordinator serializes an envelope conforming to schema version 1:

```typescript
export interface ActivityActorSnapshot {
  id: string;                               // Staff ID, e.g. "adm-1"
  name: { en: string; ar: string };         // Immutable bilingual name snapshot
  email: string;                            // Staff email snapshot
  role: AdminRole;                          // Staff role at time of action
}

export interface ActivityEvent {
  id: string;                               // Unique event ID, e.g. "act_..."
  timestamp: string;                        // ISO 8601 creation timestamp
  actor: ActivityActorSnapshot;             // Safe snapshot of acting operator
  module: ActivityModule;                   // "bookings" | "flights" | "schedules" | ...
  action: ActivityAction;                   // "created" | "updated" | "cancelled" | ...
  targetType: string;                       // e.g. "booking", "flight_override", "staff"
  targetId: string;                         // Technical identifier (LTR)
  descriptionKey?: string;                 // Optional semantic formatting key
  before?: string | null;                  // Bounded safe delta
  after?: string | null;
  metadata?: Record<string, string | number | boolean>;
}

export interface ActivityEnvelopeV1 {
  schemaVersion: 1;
  revision: number;
  events: ActivityEvent[];
}
```

---

## 3. Engineering Invariants & Guarantees

### 3.1 Newest 500 Events Retention
- To avoid unbounded `localStorage` quota consumption, `gza.activity.v1` enforces a strict **500 newest events retention bound**.
- On mutation, events sort by parsed chronological instant descending, then ID descending for ties, before trimming to 500. Timestamps require a valid calendar date and explicit timezone. This is not append-order FIFO.

### 3.2 Anti-Resurrection & Fail-Closed
- **Missing Storage Key**: Returns `{ schemaVersion: 1, revision: 0, events: [] }` without writing to storage on read.
- **Empty Activity Log**: An empty event array is authoritative and will **never resurrect synthetic mock entries**.
- **Corrupt Storage**: Corrupted JSON or invalid schema fails closed (`ActivityStorageError("corrupt_store")`). Raw bytes are preserved; persistent mode without usable storage throws `storage_unavailable`. Lazy activity access does not break construction of unrelated repositories.

### 3.3 Safe Actor Snapshot
- The acting operator's identity is snapshot at action time.
- The snapshot stores only safe public fields: ID, bilingual name, email, and active role. It never references authentication tokens, passwords, or transient session states.
- If an operator's role is subsequently changed in the staff directory, historical activity records preserve the exact role held at the moment of execution.

### 3.4 Bounded Metadata Constraints
- Activity metadata is validated via Zod schema:
  - Max 20 keys per event.
  - Primitive values only (`string`, finite `number`, `boolean`).
  - Max metadata string length 1000 characters per field; before/after deltas are at most 500 characters. Keys must belong to the explicit allowlist; sensitive keys and nested aggregates are rejected.
  - Nested objects and arrays are rejected.

### 3.5 Render-Time Localization & Technical LTR
- Activity events store semantic module/action/object facts and safe deltas, not localized prose.
- Formatting via `formatActivitySummary(event, locale)` ensures:
  - English summaries render in English LTR.
  - Arabic summaries render in Arabic RTL.
  - All embedded technical identifiers (flight numbers like `PS 204`, booking references like `GZA-7K8P`, dates, and times) remain strictly LTR.

---

## 4. Central Admin Audit Orchestration

Audit recording is orchestrated through `executeAuditedAdminCommand` and `recordAdminAudit` (`src/lib/activity/audit-recorder.ts`).

### 4.1 Orchestration Sequence & Non-ACID Separation
1. **Domain Command Commits First**: The business mutation (e.g. updating a booking, creating a schedule, overriding a flight) executes and commits to its authoritative repository.
2. **Audit Append Second**: Upon successful completion of the domain command, the corresponding audit event is appended to `ActivityRepository`.
3. **Failure Isolation**: If audit append fails (e.g. browser storage quota exceeded), the domain commit **remains valid and is NOT rolled back**. A truthful operator warning is emitted (`onAuditWarning`, rendering toast `a2.ac.auditWarning`: *"Changes saved, but activity log could not be recorded in this browser."*).
4. **No-Op Suppression**: If the domain command returns early without altering state (transaction receipt `changed === false`, exposed through the orchestration `isNoOp(result)` predicate), no duplicate audit event is recorded.
5. **Domain Failure**: If the domain command throws an error, no audit event is appended.
6. **Actor Guard**: If the action was performed by an unauthenticated passenger or outside an active staff session (`actor === null`), no administrative audit event is created.

### 4.2 Audited Admin Mutation Coverage
| Administrative Module | Route / Component | Action | Target Identifier |
| :--- | :--- | :--- | :--- |
| **Session** | `src/lib/staff/session.ts` | `signin` | Staff ID |
| **Staff Directory** | `admin.staff.tsx` | `created`, `role_changed`, `status_changed` | Staff ID |
| **Desk Bookings** | `admin.bookings.new.tsx` | `created` | PNR (`GZA-...`) |
| **Booking Management** | `admin.bookings.$ref.tsx` | `updated`, `cancelled` | PNR |
| **Check-in Desk** | `admin.check-in.tsx` | `checked_in`, `undo_check_in` | Passenger ID / PNR |
| **Flight Overrides** | `flight-quick-edit.tsx` | `updated`, `cleared` | Stable Flight ID |
| **Schedule Operations** | `admin.schedules.tsx` | `created`, `updated` | Schedule ID |
| **Fleet & Seat Maps** | `admin.products.tsx` | `created`, `updated` | Aircraft ID |
| **Commercial Catalog** | `commercial-catalog-editor.tsx` | `created`, `updated`, `status_changed` | Catalog Item ID |
| **Network Basics** | `network-basics.tsx` | `updated` | Airport IATA (`AMM`, etc.) |
| **Contact Inbox** | `admin.inbox.tsx` | `status_changed`, `assigned` | Message ID |

---

## 5. Studio Isolation & React Query Integration

### Studio Isolation
- When `isStudioPreviewActive()` is true, `getIsolatedStudioRepositories()` provides an in-memory `LocalActivityRepository`.
- Studio preview actions never append events to `localStorage["gza.activity.v1"]`.

### Query Integration
- UI surfaces consume activity logs via `useActivityQuery(filter)` with TanStack Query key `activityKeys.all`.
- `RepositoryProvider` automatically invalidates the query cache when `ActivityRepository.subscribe()` signals a canonical change.
