# Staff Domain & Administrative Identity Model (Phase 6C)

> **Document Status**: Active Architecture Specification (Phase 6C Implemented / Awaiting Independent Review)
> **Product**: Gaza Airport (`GZA`) & Palestinian Airlines (`PS`) — [gazaairport.com](https://www.gazaairport.com)
> **Domain Aggregate**: Administrative Staff Directory (`StaffMember`), Roles & Permissions (`AdminRole`), Session Resolution
> **Canonical Storage Key**: `localStorage["gza.staff.v1"]`
> **Session State Key**: `localStorage["gza.admin.v1"]` (holds `{ staffId: string | null }`, dynamically resolved)
> **Repository Interface**: `StaffRepository` (`src/lib/staff/types.ts`)
> **Primary Implementation**: `LocalStaffRepository` (`src/lib/staff/repository.ts`)
> **Coordinator**: `StaffStorageCoordinator` (`src/lib/staff/storage.ts`)

---

## 1. Executive Summary & Architecture Boundary

Prior to Phase 6C, administrative identities and session authorities operated under prototype-stage compromises:
1. **Static Mock Staff Fixtures**: `/admin/staff`, `/admin/inbox`, and `/admin_/signin` imported static in-memory fixtures (`staffAccounts` in `src/lib/admin.ts`, `staffRows` in `src/lib/admin-mock.ts`). Mutations (invitations, role edits, disabling profiles) were toast-only notifications that discarded state on reload.
2. **Disconnected Session Authority**: `AdminProvider` persisted a static JSON blob with hardcoded roles and permissions to `gza.admin.v1`. Modifying staff status or role in the directory did not alter session privileges, and disabled staff could continue executing privileged administrative operations.

Phase 6C converges administrative staff identities, role-based access control (RBAC), and session resolution into the canonical, typed, asynchronous `StaffRepository`.

### Strict Domain Separation
- **Staff Profiles & Directory (`gza.staff.v1`)**: Canonical storage of administrative staff identities, bilingual names, normalized emails, operational roles (`admin`, `editor`, `viewer`), lifecycle status (`active`, `disabled`), titles, creation dates, and last active timestamps.
- **Session Resolution (`gza.admin.v1`)**: Stores active session metadata containing `{ staffId: string | null }`. The session dynamically resolves privileges against `StaffRepository` at runtime; session authority is revoked if the staff member is disabled or unavailable. A role change updates permissions to the canonical role; it does not fabricate a sign-out.
- **Public Passenger Accounts (`gza.passenger.v1`)**: Completely separate aggregate. Staff identities cannot authenticate as passenger accounts, and passenger accounts hold no administrative privileges.

---

## 2. Storage Schema & Envelope (`gza.staff.v1`)

The storage coordinator serializes an envelope conforming to schema version 1:

```typescript
export interface StaffMember {
  id: string;                               // e.g. "adm-1", "adm-2", "adm-5"
  name: { en: string; ar: string };         // Bilingual display name
  email: string;                            // Normalized lowercase email
  role: AdminRole;                          // "admin" | "editor" | "viewer"
  status: StaffStatus;                      // "active" | "disabled"
  title: { en: string; ar: string };        // Bilingual title / job role
  createdAt: string;                        // ISO 8601 timestamp
  lastActiveAt: string | null;              // ISO 8601 timestamp or null
}

export interface StaffEnvelopeV1 {
  schemaVersion: 1;
  revision: number;
  staff: StaffMember[];
}
```

Envelope validation is enforced via Zod (`src/lib/staff/schema.ts`). If stored JSON is corrupt or fails schema validation, the coordinator fails closed (`staff_unavailable`) rather than resurrecting seed data or executing unvalidated operations.

---

## 3. Engineering Invariants & Guarantees

### 3.1 Anti-Resurrection Guarantee
- **First Read**: When `localStorage["gza.staff.v1"]` is absent, reads return a deterministic seed envelope containing the seeded administrative team (`src/lib/staff/seed.ts`) **without writing to storage**.
- **Empty Directory Authority**: If all staff members are removed or an empty staff array is committed, the empty store `{ schemaVersion: 1, revision: N, staff: [] }` is authoritative and will **never resurrect seed data**.
- **Fail-Closed**: Corrupted JSON or unparseable envelopes fail closed.

### 3.2 Last Active Administrator Protection
A critical security and operational safety invariant:
- Attempting to **demote** the last active administrator (role `admin` with status `active`) throws `StaffError("last_admin_protected")`.
- Attempting to **disable** the last active administrator throws `StaffError("last_admin_protected")`.
- This protection is verified under simulated concurrent updates and prevents accidental administrative lockout.

### 3.3 Email Normalization & Unique Constraint
- All staff emails are trimmed and converted to lowercase upon creation and lookup.
- Email uniqueness is strictly enforced case-insensitively across all staff members (both active and disabled). Creating a profile with an existing email throws `StaffError("email_taken")`.

### 3.4 No-Op Detection
- Mutations that result in no material state change (e.g. updating a role to its existing role, or setting status to its current status) are detected from the locked canonical mutation outcome.
- No-op mutations do not bump the revision counter, do not execute a storage write, and do not fire subscriber notifications.

### 3.5 Dynamic Session Authority & Revocation
- `AdminProvider` in `src/lib/admin-store.tsx` monitors active sessions.
- On initialization and on `StaffRepository` subscription updates, the current `staffId` is resolved against `StaffRepository.getById(staffId)`.
- If the resolved staff member is missing or `status !== "active"`, session authority is immediately revoked in memory (`staff = null`), and permissions collapse to unauthenticated.
- Role changes (e.g. from `admin` to `viewer`) propagate to active permissions in the current tab and across other open browser tabs via native `StorageEvent` listeners.
- Epoch ownership prevents obsolete sign-in completion from clearing a newer session. Refresh sequence tokens prevent delayed directory reads from restoring older permissions. Runtime role switching is removed; Studio demo role selection stays in memory.
- Shared-passphrase sign-in remains a browser-local simulation. It does not provide server authentication, email delivery or password storage.

---

## 4. Repository Contract & Operations

```typescript
export interface StaffRepository {
  list(): Promise<StaffMember[]>;
  getById(id: string): Promise<StaffMember | null>;
  getByEmail(email: string): Promise<StaffMember | null>;
  create(input: CreateStaffInput): Promise<StaffMember>;
  updateRole(id: string, role: AdminRole): Promise<StaffMember>;
  setStatus(id: string, status: StaffStatus): Promise<StaffMember>;
  updateProfile(id: string, input: UpdateStaffProfileInput): Promise<StaffMember>;
  touchLastActive(id: string, timestamp?: string): Promise<StaffMember>;
  subscribe(listener: () => void): () => void;
}
```

### React Query Hooks (`src/lib/staff/queries.ts`)
- `useStaffQuery()`: TanStack Query hook caching staff directory with key `staffKeys.all`. Automatically invalidated by repository subscriptions.
- `useCreateStaffMutation()`: Creates new staff member profile.
- `useUpdateStaffRoleMutation()`: Changes role with last-admin guard.
- `useSetStaffStatusMutation()`: Toggles active/disabled with last-admin guard.
- `useUpdateStaffProfileMutation()`: Updates bilingual display names and titles.

---

## 5. Multi-Tab Synchronization & Studio Isolation

### Cross-Tab Synchronization
- `StaffStorageCoordinator` attaches a `storage` listener to `window`.
- Mutations executed in Tab A emit a `StorageEvent`, prompting Tab B to re-read `gza.staff.v1` and notify subscribers.
- `RepositoryProvider` propagates subscription notifications to `queryClient.invalidateQueries({ queryKey: staffKeys.all })`.

### Appearance Studio Isolation
- When running in Appearance Studio preview mode (`isStudioPreviewActive()`):
  - `getIsolatedStudioRepositories()` provides an in-memory `LocalStaffRepository` (`inMemoryOnly: true`).
  - Studio preview staff mutations never write to `localStorage["gza.staff.v1"]`.
  - Admin sign-in and session operations in Studio never write to `localStorage["gza.admin.v1"]`.
