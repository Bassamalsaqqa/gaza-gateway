# Canonical Mock Domain & Repository Architecture

> **Document Status**: Active Reference (Phase 5 in progress — Phase 5B implemented on feature branch; correction candidate awaiting independent engineering acceptance)
> **Product**: Gaza Airport & Palestinian Airlines ([gazaairport.com](https://www.gazaairport.com))
> **Phase 4 starting commits**: `9e36b869274830f84c97cbbefe3b3fb0a98c6d2e` (`main`); `92ad935f8477e1663eefa8282d2770c66b64b8b2` (`hostpapa-deploy`)
> **Pre-operational Prototype Notice**: Gaza Gateway is an authentic, browser-local client-side prototype. It does not connect to a live backend database, payment gateway, GDS, or external server.

---

## 1. Executive Summary & Problem Statement

Prior to Phase 4, Gaza Gateway had a fragmented data architecture with two critical defects:
1. **Public vs. Admin PNR Disconnect**: Public booking operations (`useStore()`) wrote booking records into `localStorage["gza.store.v1"]`. Meanwhile, the Admin Bookings list and detail screens read exclusively from static synthetic mock arrays in `src/lib/admin-mock.ts` (`mockBookings`, `mockBookingByRef`). As a consequence, a booking created by a passenger on the public site never appeared in the Admin Bookings table or search, and following a booking reference from the Admin Dashboard led to a false 404 "Booking not found".
2. **Flight Operations Disconnect**: The public flight board and booking wizard read raw deterministic flight schedules from `src/lib/data.ts`. Meanwhile, the Admin workspace allowed operational flight overrides (status, gate, revised departure) saved in `localStorage["gza.admin.v1"]`, but those overrides were only applied to admin components using `withOverride()`. Public visitors never saw operational delays, cancellations, or gate changes.
3. **Absence of Query Layer**: Although `@tanstack/react-query` was mounted at the application root, the app possessed zero application `useQuery` or `useMutation` hooks, relying entirely on ad-hoc storage singletons and React Context state.

Phase 4 resolved these defects by introducing **two bounded aggregates** with asynchronous, backend-ready contracts: `BookingRepository` and `FlightRepository`, backed by a versioned persistence schema (`gza.repo.v1`), centralized TanStack React Query keys and hooks, and strict single-writer mutation boundaries.

Phase 5B extends this architecture to the public booking funnel:
- Canonical **`BookingDraftRepository`** (`src/lib/booking-draft/`) backed by `gza.booking.draft.v1` (`schemaVersion: 1`), removing booking draft ownership from `StoreProvider` and establishing 5 distinct storage states with tombstone anti-resurrection.
- Canonical **Effective Flight Discovery & Calendar Availability** through `FlightRepository.searchFlights` and `FlightRepository.getMonthlyServiceMap`, resolving operational overrides and capacity across both Gaza departures and arrivals.
- **Dynamic Selection Reconciliation** in `/book` that refreshes operational snapshots, invalidates cancelled or unbookable legs, evicts affected seats via prefix deletion (`out-*` / `in-*`), clamps wizard progression back to Results, and provides localized alerts.
- **Fresh Transactional Booking Authority** in `BookingRepository.create` that re-resolves effective flights against shared coordinator overrides inside the transaction and enforces idempotency via `submissionId`.

---

## 2. Post-Phase-5B Ownership Matrix

| Aggregate / Entity | Primary Writer | Primary Storage Key | Consumers (Public & Admin) | Current State | Future Migration Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Booking Draft** | `BookingDraftRepository` (`src/lib/booking-draft/`) | `gza.booking.draft.v1` (`schemaVersion: 1`) | Public Booking Wizard (`/book`), Flight Detail CTA (`/flight/$flightId`), Flight Search Form (`FlightSearchForm`) | **Implemented on Feature Branch (Phase 5B)** with 5 storage states, serialized mutation queue, tombstone anti-resurrection, and multi-tab synchronization | Phase 13 (Backend Cart/Session) |
| **Passenger State (Account & Travelers)** | `PassengerRepository` (`src/lib/passenger/`) | `gza.passenger.v1` (`account`, `travelers`) | Site Header, `/account/*`, `/book` (saved traveler pickers), `/signin`, `/register`, `/verify-email`, `/account/security` | **Migrated (Phase 5A)** to canonical `PassengerRepository` with transactional coordinator and zero password persistence | Phase 13 (Backend Auth & Database) |
| **Booking** | `BookingRepository` (`LocalBookingRepository`) | `gza.repo.v1` (`bookings[]`) | Public Confirmation (`/booking-confirmation/$ref`), Manage Booking (`/manage`), Admin Dashboard, Admin Bookings (`/admin/bookings`), Admin Booking Detail (`/admin/bookings/$ref`), Admin Global Search (`AdminSearch`), Account Trips (`/account/trips`) | **Migrated (Phase 4 & 5B)** with single-writer pattern, React Query invalidation, hardened `claim()`, and fresh transaction re-resolution with `submissionId` idempotency | Phase 5C / 6 |
| **Flight Operations (Overrides)** | `FlightRepository` (`LocalFlightRepository`) | `gza.repo.v1` (`flightOverrides{}`) | Public Flights Board (`/flights`), Public Flight Detail (`/flight/$flightId`), Public Booking Discovery (`/book`), Calendar Date Picker (`AirlineDatePicker`), Admin Dashboard, Admin Flights (`/admin/flights`), Flight Operations Quick-Edit | **Migrated (Phase 4 & 5B)** with pure `getEffectiveFlight()` composition, bidirectional search, and batched monthly service map | Phase 6 (Admin dispatch & schedules) |
| **Flight Schedules & Reference** | `src/lib/data.ts` (deterministic generator) | Static / In-memory | `FlightRepository`, flight search, route generation | **Preserved** as immutable baseline timetable and schedule generator | Phase 6 (Mutable schedules) |
| **Legacy Store Key** | Preserved read-only migration source | `gza.store.v1` | One-time migration to `gza.booking.draft.v1` when draft key is missing | **Closed Legacy Key**: ZERO active draft writers; original string preserved byte-for-byte; never resurrected once cleared | Fully Deprecated |
| **Admin Staff Session** | `src/lib/admin-store.tsx` (`useAdmin`) | `gza.admin.v1` (`staffId`) | Admin Shell, permission guards, role switcher | **Preserved** in legacy key for local session simulation | Phase 6 (Staff & RBAC) |
| **Admin Ops State (Simulation)** | `src/lib/admin-store.tsx` (`ops`, `patchOps`) | In-memory React state (`OpsState`) | Admin Operations Dashboard, Dispatch timers | **Preserved** as ephemeral session simulation | Phase 6 (Operational state) |
| **CMS & Story Content** | `src/content/` & `src/lib/admin-mock.ts` | Compiled published source & draft store | Public homepage, About, Airport history chapters, Travel info, Gallery | **Partially Migrated (Phase 4B)** for Home, Travel, Past | Phase 7 (Complete CMS Admin) |
| **Appearance & Settings Draft** | `src/lib/settings/` | `gza.settings.draft.v1` | Admin Settings (`/admin/settings`), Appearance Studio, Public Contact (`?settingsPreview=1`), Skin Preview (`?skinPreview=1`) | **Migrated (Phase 4C)** to multi-document SettingsRepository; legacy key is dormant | Complete (Phase 4C) |

---

## 3. Aggregate Boundaries & Domain Models

### 3.1 Booking Aggregate (`src/lib/domain/booking.ts`)

The canonical `Booking` entity represents a completed or confirmed passenger booking:

```ts
export interface Booking {
  ref: string;                             // e.g. "GZA-4TQ8" (normalized uppercase PNR)
  createdAt: string;                       // ISO 8601 timestamp
  status: "confirmed" | "cancelled";       // Lifecycle status
  criteria: SearchCriteria;                // Original search parameters
  outbound: Flight;                        // Primary outbound flight instance
  inbound: Flight | null;                  // Optional return flight instance
  fareId: "essential" | "classic" | "flex";// Selected fare category
  passengers: BookingPassenger[];          // Passenger party with stable IDs
  seats: Record<string, string>;           // Map of "out-0", "in-0" to seat codes (e.g. "12A")
  extras: Extras;                          // Per-passenger baggage, meal, and assistance
  contact: Contact;                        // Passenger contact email and telephone
  total: number;                           // Total price in USD
  checkedIn: CheckedIn;                    // Leg check-in indexes { out: number[], in: number[] }
  ownerEmail: string | null;               // Associated account email if claimed
  account?: boolean;                       // Backward-compatibility flag
}
```

#### Key Architecture Decisions:
1. **Stable Passenger IDs**: Every passenger receives a deterministic identifier formatted as `pax-${ref}-${index}` (e.g. `pax-GZA4TQ-0`), preserving pre-existing IDs if already assigned. This guarantees stable React keys, table row rendering, and seamless check-in tracking.
2. **`outbound` / `inbound` Structure**: The model preserves explicit `outbound` and optional `inbound` flight instances rather than a generic array, directly matching aviation point-to-point and return trip semantics. The helper `bookingLegs(booking)` yields `["out"]` or `["out", "in"]`.
3. **Presentation Adapter (`bookingToMockBooking`)**: Derives an `AdaptedAdminBooking` view for legacy admin tables and detail views, including lead passenger, route, cabin, fare, channel, and display status. Mutations use the canonical booking reference and repository rather than writing this view model.

### 3.2 Flight Aggregate & Overrides (`src/lib/domain/flight.ts`)

The Flight aggregate separates deterministic schedule generation from mutable operational state:

```ts
export interface FlightOverride {
  flightId?: string;                       // Flight identifier
  status?: FlightStatus;                   // "Scheduled" | "OnTime" | "Boarding" | "Delayed" | "Departed" | "Landed" | "Cancelled"
  gate?: string;                           // e.g. "B2"
  terminal?: string;                       // e.g. "1"
  revisedDepart?: string;                  // Revised local departure time (HH:MM)
  aircraft?: string;                       // Tail / equipment assignment
  note?: string;                           // Operational dispatch remark
  updatedAt?: string;                      // ISO timestamp of last update
  updatedBy?: string;                      // Staff ID or system agent
}
```

#### Pure Composition Rule (`getEffectiveFlight`):

`getEffectiveFlight(flight: Flight, override?: FlightOverride | null)` returns the base flight with valid operational status, gate, terminal, aircraft, revised departure, and note overrides applied. It returns `Flight & { note?: string; revisedDepart?: string }`. Empty gate/terminal strings are intentional clears; empty aircraft strings retain the base aircraft. The pure function lives in `src/lib/domain/flight.ts` and is used by `FlightRepository` when materializing effective flights.

- **Synthetic Flight Isolation**: `isSyntheticFlightId(id)` detects Studio scenario IDs (`CAP-PROOF-*`, `SCENARIO-*`, `TEST-*`), strictly forbidding them from persisting into canonical storage or overriding live flights.

---

## 4. Repository Contracts & Storage Layer

### 4.1 Asynchronous Repository Interfaces (`src/lib/repositories/types.ts`)

```ts
export interface BookingRepository {
  list(): Promise<Booking[]>;
  getByRef(ref: string): Promise<Booking | null>;
  create(input: BookingCreateInput): Promise<Booking>;
  update(ref: string, patch: Partial<Booking>): Promise<Booking | null>;
  checkIn(ref: string, leg: Leg, paxIndexes: number[]): Promise<Booking | null>;
  claim(ref: string, accountEmail: string): Promise<ClaimResult>;
  delete(ref: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export interface FlightRepository {
  getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]>;
  getFlightById(id: string): Promise<Flight | null>;
  getOverrides(): Promise<Record<string, FlightOverride>>;
  getOverride(flightId: string): Promise<FlightOverride | null>;
  setOverride(flightId: string, override: FlightOverride): Promise<void>;
  clearOverride(flightId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface PassengerRepository {
  getAccount(): Promise<PassengerAccount | null>;
  listTravelers(): Promise<Traveler[]>;
  signIn(email: string, firstName?: string, lastName?: string): Promise<PassengerAccount>;
  signOut(): Promise<void>;
  updateAccount(patch: Partial<Omit<PassengerAccount, "email">>): Promise<PassengerAccount>;
  addTraveler(traveler: Omit<Traveler, "id">): Promise<Traveler>;
  updateTraveler(id: string, patch: Partial<Omit<Traveler, "id">>): Promise<Traveler>;
  removeTraveler(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface BookingDraftRepository {
  getDraft(): BookingDraft;
  getState(): BookingDraftStorageState;
  updateDraft(updater: Partial<BookingDraft> | ((prev: BookingDraft) => BookingDraft)): Promise<BookingDraft>;
  resetDraft(criteria?: SearchCriteria): Promise<BookingDraft>;
  clearDraft(reason?: "completed" | "discarded" | "reset"): Promise<void>;
  reconcile(effectiveOutbound: Flight | null, effectiveInbound: Flight | null): Promise<DraftReconciliationResult>;
  subscribe(listener: (draft: BookingDraft) => void): () => void;
  handleExternalStorageEvent(event: StorageEvent): void;
}
```

### 4.2 Storage Schema (`gza.repo.v1`) & Idempotent Migrations

- **Storage Key**: `localStorage["gza.repo.v1"]`
- **Schema Version**: `1`
- **Shape**:
  ```json
  {
    "schemaVersion": 1,
    "bookings": [ /* canonical Booking[] */ ],
    "flightOverrides": { /* Record<flightId, FlightOverride> */ }
  }
  ```
- **SSR & Hydration Safety**: Safe against Node/SSR environments via `getStorage()`; zero `window` or `localStorage` reads occur at module import time.
- **Idempotent Migration**: On first boot or corrupted storage recovery, `migrateFromLegacyStores()` reads legacy bookings from `gza.store.v1` and flight overrides from `gza.admin.v1`, seeds deterministic demo bookings (`INITIAL_BOOKING_SEEDS`), and writes the consolidated state to `gza.repo.v1` while leaving the legacy keys completely intact.
- **Cross-Tab Synchronization**: `subscribeToStorage()` listens for browser `StorageEvent` on `gza.repo.v1`, synchronizing repository in-memory cache across separate browser tabs.

### 4.3 Booking Draft Storage Schema (`gza.booking.draft.v1`) & 5 Storage States

- **Storage Key**: `localStorage["gza.booking.draft.v1"]`
- **Schema Version**: `1`
- **Shape**:
  ```json
  {
    "schemaVersion": 1,
    "status": "active",
    "revision": 1,
    "updatedAt": "2026-10-01T12:00:00.000Z",
    "source": "direct",
    "draft": {
      "criteria": { /* SearchCriteria */ },
      "outbound": /* Flight snapshot or null */,
      "inbound": /* Flight snapshot or null */,
      "fareId": "essential",
      "passengers": [ /* BookingPassenger[] */ ],
      "seats": { /* Record<"out-0" | "in-0", seatCode> */ },
      "extras": { /* Extras */ },
      "contact": { /* Contact */ },
      "entry": "search",
      "submissionId": "sub-1727784000000-abc123xyz"
    }
  }
  ```
- **Five Distinct Storage States**:
  1. **`missing` (`getItem === null`)**: The ONLY state that triggers a one-time migration from `gza.store.v1.draft`. The raw legacy store is preserved byte-for-byte.
  2. **`active`**: Authoritative canonical draft (including valid empty draft). Legacy store is ignored.
  3. **`cleared` (Tombstone)**: Written on successful booking creation or user discard (`{ status: "cleared", draft: null, clearedReason: "completed" | "discarded" | "reset" }`). Authoritative tombstone prevents legacy resurrection.
  4. **`malformed`**: Corrupted JSON or invalid schema is sanitized and recovered into fresh runtime state; legacy store is never re-imported.
  5. **`unavailable`**: Browser storage error (e.g. `SecurityError` in private browsing or partitioned iframe); falls back to in-memory mode without overwriting unread storage data.
- **Mutation Queue & Isolation**: All asynchronous updates are serialized through an atomic promise queue (`mutationQueue`), ensuring mutations always evaluate against the latest committed state without lost updates.
- **Tombstone Anti-Resurrection**: Once a draft is cleared or completed, any legacy draft in `gza.store.v1` remains permanently ignored.

### 4.4 Effective Discovery & Dynamic Selection Reconciliation

- **Discovery Contracts**:
  - `FlightRepository.searchFlights(origin, destination, date, options)` queries base schedules in both directions, merges active operational overrides (`flightOverrides`), checks departure clock cutoff in origin station timezone (`Asia/Gaza`), and enforces party seat requirements against `Flight.seatsLeft`.
  - `FlightRepository.getMonthlyServiceMap(origin, destination, yearMonth, paxCount)` batches monthly dates into a dictionary of day service indicators and lowest fares, excluding unbookable and cancelled flights.
- **Reconciliation Engine (`src/lib/booking-draft/reconciliation.ts`)**:
  - Reconciles selected outbound and inbound flights against real effective flight instances by ID.
  - Refreshes operational snapshot changes (status, gate, terminal, aircraft, revised departure time) without invalidating valid bookings.
  - Invalidates legs if cancelled, departed, landed, boarding, past departure cutoff, sold out, or lacking sufficient seats for the passenger party.
  - **Prefix-Based Seat Eviction**: When a leg is invalidated, all seats for that leg (`out-*` or `in-*`) are evicted via key iteration, while surviving legs, passenger records, documents, contact details, and surviving seats are preserved intact.
  - Clamps wizard navigation back to the `results` milestone and displays localized bilingual alert notices.

---

## 5. React Query Hooks & Cache Invalidation

Centralized hierarchical query keys in `src/lib/repositories/keys.ts`:

- `bookingKeys.all`: `["bookings"]`
- `bookingKeys.lists()`: `["bookings", "list"]`
- `bookingKeys.list(filters?)`: `["bookings", "list", filters]`
- `bookingKeys.detail(ref)`: `["bookings", "detail", PNR]`
- `flightKeys.all`: `["flights"]`
- `flightKeys.lists()`: `["flights", "list"]`
- `flightKeys.list(date, direction)`: `["flights", "list", { date, direction }]`
- `flightKeys.details()`: `["flights", "detail"]`
- `flightKeys.detail(id)`: `["flights", "detail", id]`
- `flightKeys.overrides()`: `["flights", "overrides"]`

### Cache Invalidation Semantics:
1. **Repository Subscription Binding**: `useBookingsQuery`, `useBookingQuery`, `useFlightsQuery`, `useFlightQuery`, and `useFlightOverridesQuery` subscribe to their respective repository listeners. Any mutation through the repository automatically triggers `queryClient.invalidateQueries(...)`.
2. **Invalidation Scope**: Repository and mutation subscriptions invalidate the affected booking or flight query hierarchy. Several paths currently overlap; this is a bounded efficiency debt rather than a data-authority split.
3. **Optimistic Updates**: `useCreateBookingMutation` seeds the detail query cache (`queryClient.setQueryData`) immediately upon creation.

---

## 6. Single-Writer Façades & Wired Views

To prevent dual-write bugs, legacy store providers act as single-writer façades:

1. **`StoreProvider` (`src/lib/store.tsx`)**:
   - Delegates all booking mutations (`addBooking`, `claimBooking`, `checkInLeg`, `updateBooking`) to `bookingRepo`.
   - Listens to `bookingRepo.subscribe()` to maintain backward-compatible `bookings` state.
   - Manages non-migrated entities (`draft`, `account`, `travelers`) in `gza.store.v1`.
2. **`AdminProvider` (`src/lib/admin-store.tsx`)**:
   - Delegates `applyOverride()` directly to `flightRepo.setOverride()`.
   - Listens to `flightRepo.subscribe()` to keep local `overrides` state synchronized.
   - Manages staff session (`staffId`) and in-memory `OpsState`.
3. **Wired Views**:
   - Public Flight Status (`/flights`): Consumes `useFlightsQuery(date, dir)`.
   - Public Flight Detail (`/flight/$flightId`): Consumes `useFlightQuery(flightId)`.
   - Public Booking Confirmation (`/booking-confirmation/$ref`): Consumes `useBookingQuery(ref)`; successful `null` remains Not Found, while query failures have a distinct error state.
   - Admin Bookings Table (`/admin/bookings`): Consumes `useBookingsQuery()` adapted via `bookingToMockBooking()`.
   - Admin Booking Detail (`/admin/bookings/$ref`): Consumes `useBookingQuery(ref)` and `useUpdateBookingMutation()`.
   - Admin Global Search (`AdminSearch`): Consumes `useBookingsQuery()` to resolve matching PNRs and passenger names across both public and admin records.

---

## 7. Fixture Inventory & Bundle Isolation

To guarantee that heavy admin fixtures and editor metadata do not leak into public startup chunks:
- **`src/lib/domain/booking-seeds.ts`**: Contains clean, deterministic seeds for 6 demo bookings (`GZA4TQ`, `GZA9MK`, `GZA7RD`, `GZA2BX`, `GZA5ZN`, `GZA8LP`). Does not import CMS, analytics, or story collections.
- **Bundle Measurement**: The Phase 4 measured public entry script was about 414 kB uncompressed. Verify each later release independently; the public startup graph should exclude `admin-mock.ts`, Appearance Studio scenario registry, and heavy visual motifs.

## 8. Boarding-Pass Data Boundary (Phase 4.0.1)

`getBoardingPassData(booking, leg, passengerIndex, effectiveFlight?)` in `src/lib/domain/boarding-pass.ts` is a pure selector for supported pass facts. It returns a stable passenger ID, PNR, route, flight/date/times, optional current operational gate/terminal/revised departure, assigned seat when present, fare, and cabin. It returns `null` for an invalid passenger or leg, an unchecked passenger, an infant traveling on an adult's lap, or a mismatched effective flight. It does not invent a barcode standard, boarding time, zone, or sequence. The existing pass UI retains prototype presentation fields until the owner's artwork arrives.

The admin booking list, detail, and search use repository results as authority after query resolution. An empty list and a `null` detail result never fall back to static `mockBookings`. The latter remains in non-migrated customer detail fixtures pending Phase 6.

**Current hardening notes:** `RepositoryProvider`, individual query hooks, and mutation success handlers can invalidate overlapping query keys after one write. This has not produced an observed query storm in the local proof flows; consolidation can follow when broader workflows migrate. `BookingRepository.list()` returns a new array and `getByRef()` a shallow object copy, so nested passenger/seat/extras values are not deeply immutable. Current migrated readers do not intentionally mutate those values; future API adapters should formalize readonly data or defensive cloning at the boundary.
