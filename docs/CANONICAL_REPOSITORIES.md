# Canonical Mock Domain & Repository Architecture

> **Document Status**: Active Reference (Phase 4 — Canonical Mock Domain & Repository Layer)
> **Product**: Gaza Airport & Palestinian Airlines ([gazaairport.com](https://www.gazaairport.com))
> **Phase 4 starting commits**: `9e36b869274830f84c97cbbefe3b3fb0a98c6d2e` (`main`); `92ad935f8477e1663eefa8282d2770c66b64b8b2` (`hostpapa-deploy`)
> **Pre-operational Prototype Notice**: Gaza Gateway is an authentic, browser-local client-side prototype. It does not connect to a live backend database, payment gateway, GDS, or external server.

---

## 1. Executive Summary & Problem Statement

Prior to Phase 4, Gaza Gateway had a fragmented data architecture with two critical defects:
1. **Public vs. Admin PNR Disconnect**: Public booking operations (`useStore()`) wrote booking records into `localStorage["gza.store.v1"]`. Meanwhile, the Admin Bookings list and detail screens read exclusively from static synthetic mock arrays in `src/lib/admin-mock.ts` (`mockBookings`, `mockBookingByRef`). As a consequence, a booking created by a passenger on the public site never appeared in the Admin Bookings table or search, and following a booking reference from the Admin Dashboard led to a false 404 "Booking not found".
2. **Flight Operations Disconnect**: The public flight board and booking wizard read raw deterministic flight schedules from `src/lib/data.ts`. Meanwhile, the Admin workspace allowed operational flight overrides (status, gate, revised departure) saved in `localStorage["gza.admin.v1"]`, but those overrides were only applied to admin components using `withOverride()`. Public visitors never saw operational delays, cancellations, or gate changes.
3. **Absence of Query Layer**: Although `@tanstack/react-query` was mounted at the application root, the app possessed zero application `useQuery` or `useMutation` hooks, relying entirely on ad-hoc storage singletons and React Context state.

Phase 4 resolves these defects by introducing **two bounded aggregates** with asynchronous, backend-ready contracts: `BookingRepository` and `FlightRepository`, backed by a versioned persistence schema (`gza.repo.v1`), centralized TanStack React Query keys and hooks, and strict single-writer mutation boundaries.

---

## 2. Post-Phase-4 Ownership Matrix

| Aggregate / Entity | Primary Writer | Primary Storage Key | Consumers (Public & Admin) | Phase 4 State | Future Migration Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Booking** | `BookingRepository` (`LocalBookingRepository`) | `gza.repo.v1` (`bookings[]`) | Public Confirmation (`/booking-confirmation/$ref`), Manage Booking (`/manage`), Admin Dashboard, Admin Bookings (`/admin/bookings`), Admin Booking Detail (`/admin/bookings/$ref`), Admin Global Search (`AdminSearch`) | **Migrated** to canonical repository with single-writer pattern and React Query invalidation | Phase 5 (Public workflows), Phase 6 (Admin workflows) |
| **Flight Operations (Overrides)** | `FlightRepository` (`LocalFlightRepository`) | `gza.repo.v1` (`flightOverrides{}`) | Public Flights Board (`/flights`), Public Flight Detail (`/flight/$flightId`), Admin Dashboard, Admin Flights (`/admin/flights`), Flight Operations Quick-Edit | **Migrated** to canonical repository with pure `getEffectiveFlight()` composition | Phase 6 (Admin dispatch & schedules) |
| **Flight Schedules & Reference** | `src/lib/data.ts` (deterministic generator) | Static / In-memory | `FlightRepository`, flight search, route generation | **Preserved** as immutable baseline timetable and schedule generator | Phase 6 (Mutable schedules) |
| **Booking Draft** | `src/lib/store.tsx` (`useStore`) | `gza.store.v1` (`draft`) | Public Booking Wizard (`/book`) | **Preserved** in legacy key with bookability sanitization and step gating | Phase 5 (Wizard convergence) |
| **Customer Account & Travelers** | `src/lib/store.tsx` (`useStore`) | `gza.store.v1` (`account`, `travelers`) | Passenger Account (`/account/*`), Manage Booking | **Preserved** in legacy key pending Phase 5 | Phase 5 (Account & travelers) |
| **Admin Staff Session** | `src/lib/admin-store.tsx` (`useAdmin`) | `gza.admin.v1` (`staffId`) | Admin Shell, permission guards, role switcher | **Preserved** in legacy key for local session simulation | Phase 6 (Staff & RBAC) |
| **Admin Ops State (Simulation)** | `src/lib/admin-store.tsx` (`ops`, `patchOps`) | In-memory React state (`OpsState`) | Admin Operations Dashboard, Dispatch timers | **Preserved** as ephemeral session simulation | Phase 6 (Operational state) |
| **CMS & Story Content** | `src/lib/admin-mock.ts` | Static in-memory fixtures | Public homepage, About, Airport history chapters, Travel info, Gallery | **Preserved** in mock fixtures pending Phase 4B | Phase 4B (Typed Content & CMS Schema) |
| **Appearance & Skin Preview** | `src/lib/skin.ts` | `gza.skin.preview.v1` | Appearance Studio (`/admin/settings?tab=appearance`), Studio frame listener | **Preserved** in isolated preview key pending Phase 4C | Phase 4C (Settings & Appearance) |

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
  inbound?: Flight | null;                 // Optional return flight instance
  fareId: "essential" | "classic" | "flex";// Selected fare category
  passengers: BookingPassenger[];          // Passenger party with stable IDs
  seats: Record<string, string>;           // Map of "out-0", "in-0" to seat codes (e.g. "12A")
  extras: Extras;                          // Per-passenger baggage, meal, and assistance
  contact: Contact;                        // Passenger contact email and telephone
  total: number;                           // Total price in USD
  checkedIn: CheckedIn;                    // Leg check-in indexes { out: number[], in: number[] }
  ownerEmail?: string | null;              // Associated account email if claimed
  account?: boolean;                       // Backward-compatibility flag
}
```

#### Key Architecture Decisions:
1. **Stable Passenger IDs**: Every passenger receives a deterministic identifier formatted as `pax-${ref}-${index}` (e.g. `pax-GZA4TQ-0`), preserving pre-existing IDs if already assigned. This guarantees stable React keys, table row rendering, and seamless check-in tracking.
2. **`outbound` / `inbound` Structure**: The model preserves explicit `outbound` and optional `inbound` flight instances rather than a generic array, directly matching aviation point-to-point and return trip semantics. The helper `bookingLegs(booking)` yields `["out"]` or `["out", "in"]`.
3. **Lossless Bidirectional Adapter (`bookingToMockBooking`)**: Converts canonical `Booking` entities into `AdaptedAdminBooking` objects expected by legacy admin tables and detail views without data loss, computing derived properties (`lead`, `route`, `paxCount`, `cabin`, `fare`, `channel`, `status`).

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
```ts
export function getEffectiveFlight(base: Flight, override?: FlightOverride | null): Flight {
  if (!override) return base;
  return {
    ...base,
    status: override.status ?? base.status,
    gate: override.gate !== undefined && override.gate !== "" ? override.gate : base.gate,
    terminal: override.terminal !== undefined && override.terminal !== "" ? override.terminal : base.terminal,
    aircraft: override.aircraft !== undefined && override.aircraft !== "" ? override.aircraft : base.aircraft,
    ...(override.revisedDepart ? { revisedDepart: override.revisedDepart } : {}),
    ...(override.note ? { note: override.note } : {}),
  };
}
```

- **Synthetic Flight Isolation**: `isSyntheticFlightId(id)` detects Studio scenario IDs (`CAP-PROOF-*`, `SCENARIO-*`, `TEST-*`), strictly forbidding them from persisting into canonical storage or overriding live flights.

---

## 4. Repository Contracts & Storage Layer

### 4.1 Asynchronous Repository Interfaces (`src/lib/repositories/types.ts`)

```ts
export interface BookingRepository {
  list(filter?: BookingFilter): Promise<Booking[]>;
  getByRef(ref: string): Promise<Booking | null>;
  create(input: BookingCreateInput): Promise<Booking>;
  update(ref: string, patch: Partial<Booking>): Promise<Booking | null>;
  checkIn(ref: string, leg: Leg, paxIndexes: number[]): Promise<Booking | null>;
  claim(ref: string, accountEmail: string): Promise<Booking | null>;
  delete(ref: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export interface FlightRepository {
  getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]>;
  getFlightById(id: string): Promise<Flight | null>;
  getOverrides(): Promise<Record<string, FlightOverride>>;
  getOverride(flightId: string): Promise<FlightOverride | null>;
  setOverride(flightId: string, patch: FlightOverride): Promise<void>;
  clearOverride(flightId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
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

---

## 5. React Query Hooks & Cache Invalidation

Centralized hierarchical query keys in `src/lib/repositories/queries.ts`:

- `bookingKeys.all`: `["bookings"]`
- `bookingKeys.lists()`: `["bookings", "list"]`
- `bookingKeys.detail(ref)`: `["bookings", "detail", PNR]`
- `flightKeys.all`: `["flights"]`
- `flightKeys.lists()`: `["flights", "list"]`
- `flightKeys.list(date, dir)`: `["flights", "list", { date, dir }]`
- `flightKeys.details()`: `["flights", "detail"]`
- `flightKeys.detail(id)`: `["flights", "detail", id]`
- `flightKeys.overrides()`: `["flights", "overrides"]`

### Cache Invalidation Semantics:
1. **Repository Subscription Binding**: `useBookingsQuery`, `useBookingQuery`, `useFlightsQuery`, `useFlightQuery`, and `useFlightOverridesQuery` subscribe to their respective repository listeners. Any mutation through the repository automatically triggers `queryClient.invalidateQueries(...)`.
2. **Targeted Invalidation**: Mutations invalidate only their affected domain hierarchy (`bookingKeys.all` and specific `bookingKeys.detail(ref)`).
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
   - Public Booking Confirmation (`/booking-confirmation/$ref`): Consumes `useBookingQuery(ref)` with fallback.
   - Admin Bookings Table (`/admin/bookings`): Consumes `useBookingsQuery()` adapted via `bookingToMockBooking()`.
   - Admin Booking Detail (`/admin/bookings/$ref`): Consumes `useBookingQuery(ref)` and `useUpdateBookingMutation()`.
   - Admin Global Search (`AdminSearch`): Consumes `useBookingsQuery()` to resolve matching PNRs and passenger names across both public and admin records.

---

## 7. Fixture Inventory & Bundle Isolation

To guarantee that heavy admin fixtures and editor metadata do not leak into public startup chunks:
- **`src/lib/domain/booking-seeds.ts`**: Contains clean, deterministic seeds for 6 demo bookings (`GZA4TQ`, `GZA9MK`, `GZA7RD`, `GZA2BX`, `GZA5ZN`, `GZA8LP`). Does not import CMS, analytics, or story collections.
- **Bundle Measurement**: The public startup bundle excludes `admin-mock.ts`, Appearance Studio scenario registry, and heavy visual motifs. The public root script remains under 415 kB uncompressed (~111 kB gzipped), well within performance budgets.
