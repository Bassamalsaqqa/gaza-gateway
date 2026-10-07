# Canonical Mock Domain & Repository Architecture

> **Document Status**: Active Reference (Phase 6B Complete / Accepted Source / Accepted Release / Deployed by Owner [Phase 6B2C2B Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C1 Complete / Accepted Source]; Phase 6C Implemented / Awaiting Independent Review; Phase 7/7B Planned / Unstarted)
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

Phase 5B extended this architecture to the public booking funnel (`BookingDraftRepository` on `gza.booking.draft.v1` and effective flight discovery).

Phase 5C converges public Manage Trip, Check-in, and Boarding Pass surfaces onto canonical repositories and effective flights:
- Bounded, typed `BookingRepository` commands (`cancel`, `updateContact`, `updateSeats`, `updateExtras`, `completeCheckIn`) with canonical pricing recalculation (`bookingTotal`), checked-in seat protection, and full coordinator rollback on storage failure.
- Authoritative check-in eligibility engine (`getCheckInEligibility`) enforcing the 24h to 60m scheduled departure window in station timezone (with non-GZA inbound origin support) and operational status restrictions.
- Atomic check-in revalidation inside the mutation transaction closing TOCTOU races.
- Multi-query hook `useBookingEffectiveFlights(booking)` subscribing to `FlightRepository` invalidation to keep operational flight status, gates, terminals, and revised departure times reactive without polling.
- Pure boarding-pass view model (`buildBoardingPassViewModel`) with scheduled vs revised departure distinction, policy-derived `boardingOpensTime` ("Boarding opens"), and non-active operational treatments (Cancelled, Departed, Landed, Unavailable).

Phase 5D converges public contact submissions and administrative inbox workflows onto `ContactRepository` (`src/lib/contact/repository.ts`) backed by `gza.contact.v1`, with transactional coordinator serialization, seed anti-resurrection on empty storage, cross-tab synchronization, and central React Query hooks.

Phase 6A converges the Admin Commercial Desk surfaces (Admin Check-in Desk, Admin Booking Detail commercial mutations, and Counter Booking creation) onto canonical `BookingRepository` and `FlightRepository`:
- **Canonical Stored Total Recalculation**: `BookingRepository.create()` calculates the stored total inside the transaction via `bookingTotal(created).total`, discarding or overriding caller-supplied totals. Both public `/book` and desk counter share this authority; client totals are strictly preview only.
- **Channel Truth**: `BookingChannel = "web" | "desk"` on `Booking` and `BookingCreateInput`. Counter bookings supply `channel: "desk"` and `ownerEmail: null`; legacy unmigrated bookings safely normalize to `"web"`.
- **Typed `undoCheckIn` Command**: `BookingRepository.undoCheckIn({ ref, leg, selectedPaxIndexes, now? })` safely undoes check-in for non-cancelled bookings. Implemented via `coordinator.conditionalMutate()`: bounds-checked, preserves documents/seats/Extras, and genuine no-op (`commit: false`, no write/notification) if passengers are already not checked in.
- **Pure Desk Selectors & Zero Mock Fixtures**: Pure `buildAdminCheckInRows()` selector drives the desk monitor directly from canonical `FlightRepository` and `BookingRepository` with station gating (`originCode === "GZA"`), status precedence, and direct `/boarding-pass/$ref/$leg/$pax` links. Zero mock fixtures (`deskFlights`, `deskPassengers`, `mockFlights`, `GZA-NEW1`) in production runtime.
- **Capacity Snapshot Boundary**: Effective `seatsLeft` is checked at flight selection and transactionally rechecked at `BookingRepository.create()`; documented as a frontend snapshot limit (no decrement/new inventory ledger).


---


## 2. Post-Phase-6A Ownership Matrix

| Aggregate / Entity | Primary Writer | Primary Storage Key | Consumers (Public & Admin) | Current State | Future Migration Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Contact Enquiries & Inbox** | `ContactRepository` (`LocalContactRepository`) | `gza.contact.v1` (`schemaVersion: 1`) | Public Contact (`/contact`), Admin Inbox (`/admin/inbox`), Admin Shell badge, Dashboard attention items | **Converged (Phase 5D)** with serialized mutex coordinator, seed anti-resurrection on empty storage, truthful local save, and admin inbox workflow | Phase 13 (Backend Support Desk) |
| **Booking Draft** | `BookingDraftRepository` (`src/lib/booking-draft/`) | `gza.booking.draft.v1` (`schemaVersion: 1`) | Public Booking Wizard (`/book`), Flight Detail CTA (`/flight/$flightId`), Flight Search Form (`FlightSearchForm`) | **Complete (Phase 5B)** with 5 storage states, serialized mutation queue, tombstone anti-resurrection, and multi-tab synchronization | Phase 13 (Backend Cart/Session) |
| **Passenger State (Account & Travelers)** | `PassengerRepository` (`src/lib/passenger/`) | `gza.passenger.v1` (`account`, `travelers`) | Site Header, `/account/*`, `/book` (saved traveler pickers), `/signin`, `/register`, `/verify-email`, `/account/security` | **Migrated (Phase 5A)** to canonical `PassengerRepository` with transactional coordinator and zero password persistence | Phase 13 (Backend Auth & Database) |
| **Booking** | `BookingRepository` (`LocalBookingRepository`) | `gza.repo.v1` (`bookings[]`) | Public Confirmation (`/booking-confirmation/$ref`), Manage Booking (`/manage/*`), Check-in (`/check-in`, `/manage/:ref/check-in`), Boarding Pass (`/boarding-pass/*`), Account Trips (`/account/trips`), Admin Dashboard, Admin Bookings (`/admin/bookings`), Admin Booking Detail (`/admin/bookings/$ref`), Admin Check-in Desk (`/admin/check-in`), Admin Counter Booking (`/admin/bookings/new`), Admin Global Search (`AdminSearch`) | **Converged (Phase 4, 5B, 5C, 6A)** with single-writer pattern, React Query invalidation, typed commercial commands (`cancel`, `updateContact`, `updateSeats`, `updateExtras`, `completeCheckIn`, `undoCheckIn`), canonical stored total recalculation (`bookingTotal`), channel truth (`web`/`desk`), and checked-in seat protection | Phase 6A Complete / Accepted Source / Accepted Release / Deployed by Owner (Commercial Desk) |
| **Flight Operations (Overrides)** | `FlightRepository` (`LocalFlightRepository`) | `gza.repo.v1` (`flightOverrides{}`) | Public Flights Board (`/flights`), Public Flight Detail (`/flight/$flightId`), Public Booking Discovery (`/book`), Calendar Date Picker (`AirlineDatePicker`), Admin Dashboard, Admin Flights (`/admin/flights`), Flight Operations Quick-Edit | **Migrated (Phase 4 & 5B)** with pure `getEffectiveFlight()` composition, bidirectional search, and batched monthly service map | Phase 6B1 canonical Admin reads/writes; schedule materialization deferred to 6B2 |
| **Flight Schedules & Reference** | `src/lib/data.ts` (deterministic generator) | Static / In-memory | `FlightRepository`, flight search, route generation | **Preserved** as immutable baseline timetable and schedule generator | Phase 6B2C2 (stable-ID materialization design) |
| **Legacy Store Key** | Preserved read-only migration source | `gza.store.v1` | One-time migration to `gza.booking.draft.v1` when draft key is missing | **Closed Legacy Key**: ZERO active draft writers; original string preserved byte-for-byte; never resurrected once cleared | Fully Deprecated |
| **Staff Directory & Session** | `StaffRepository` (`LocalStaffRepository`) | `gza.staff.v1` (`schemaVersion: 1`), `gza.admin.v1` (`staffId`) | Admin Staff (`/admin/staff`), Sign-in (`/admin_/signin`), Admin Shell, Inbox assignees | **Converged (Phase 6C)** with last-admin protection, dynamic authority revocation, seed anti-resurrection, and Studio isolation | Complete (Phase 6C) |
| **Customer Directory** | `CustomerDirectoryService` (`LocalCustomerDirectoryService`) | Non-persistent derived projection (NO `gza.customer.v1`) | Admin Customers (`/admin/customers`, `/admin/customers/$id`), Admin Global Search | **Converged (Phase 6C)** projecting `PassengerRepository` and `BookingRepository`, bijective URL-safe route tokens (`cus_acc_*`, `cus_gst_*`), and real `claim()` actions | Complete (Phase 6C) |
| **Activity Log & Audit Trail** | `ActivityRepository` (`LocalActivityRepository`) | `gza.activity.v1` (`schemaVersion: 1`) | Admin Activity (`/admin/activity`), central audit recorder for all enabled admin mutations | **Converged (Phase 6C)** with retention of the newest 500 events ring buffer, safe actor snapshots, render-time localization, and non-ACID audit failure isolation | Complete (Phase 6C) |
| **Recurring Schedule Planning** | `ScheduleRepository` (`src/lib/schedules/`) | `gza.schedule.v1` | Admin Schedule Manager; destination related schedules | **Complete / Accepted Source (6B1)**; commit-before-success, Web Locks, authoritative empty/corrupt write protection | Planning only; materialization deferred |
| **Network reference** | `NetworkRepository` | `gza.network.v1` | Admin Destination operational fields and first-time Schedule route validation | **Complete / Accepted Source (6B2C1)** | Materialization deferred to C2; no pricing/CMS/SEO |
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
  total: number;                           // Total price in USD (canonical stored calculation)
  checkedIn: CheckedIn;                    // Leg check-in indexes { out: number[], in: number[] }
  ownerEmail: string | null;               // Associated account email if claimed
  channel: BookingChannel;                 // "web" | "desk" (channel truth)
  account?: boolean;                       // Backward-compatibility flag
}
```

#### Key Architecture Decisions:
1. **Stable Passenger IDs**: Every passenger receives a deterministic identifier formatted as `pax-${ref}-${index}` (e.g. `pax-GZA4TQ-0`), preserving pre-existing IDs if already assigned. This guarantees stable React keys, table row rendering, and seamless check-in tracking.
2. **`outbound` / `inbound` Structure**: The model preserves explicit `outbound` and optional `inbound` flight instances rather than a generic array, directly matching aviation point-to-point and return trip semantics. The helper `bookingLegs(booking)` yields `["out"]` or `["out", "in"]`.
3. **Presentation Adapter (`bookingToMockBooking`)**: Derives an `AdaptedAdminBooking` view for legacy admin tables and detail views, including lead passenger, route, cabin, fare, channel, and display status. It does not fabricate dates of birth, document numbers, or fake timestamps. Mutations use the canonical booking reference and repository rather than writing this view model.
4. **Channel Truth (`BookingChannel`)**: Declares whether a booking originated online (`web`) or at the Gaza terminal counter (`desk`). Counter bookings set `ownerEmail: null`.
5. **Canonical Stored Total Recalculation**: `BookingRepository.create()` transactionally calculates the final stored total via `bookingTotal(created).total`, ensuring that neither public callers nor staff desks can persist incorrect pricing.

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
  getOccupiedSeats(flightId: string, options?: { excludeRef?: string }): Promise<string[]>;
  create(input: BookingCreateInput): Promise<Booking>;
  cancel(ref: string): Promise<Booking>;
  updateContact(ref: string, contact: Contact): Promise<Booking>;
  updateSeats(ref: string, seats: Record<string, string>): Promise<Booking>;
  updateExtras(ref: string, extras: Extras): Promise<Booking>;
  completeCheckIn(input: CheckInCommandInput): Promise<Booking>;
  undoCheckIn(input: UndoCheckInCommandInput): Promise<Booking>;
  claim(ref: string, accountEmail: string): Promise<ClaimResult>;
  delete(ref: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export interface FlightRepository {
  getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]>;
  getFlightById(id: string): Promise<Flight | null>;
  getCurrentFlightById(id: string): Promise<Flight | null>;
  searchFlights(origin: string, destination: string, date: string): Promise<Flight[]>;
  getMonthlyServiceMap(year: number, month: number, origin: string, destination: string, options?: { paxCount?: number; now?: Date | string | number }): Promise<MonthlyServiceMap>;
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
  - `FlightRepository.searchFlights(origin, destination, date)` returns only current Schedule/Network materializations in either route direction and composes operational overrides. Booking consumers and the repository create command apply bookability, station-timezone departure cutoff and party requirements against `Flight.seatsLeft`; no legacy or Booking-only snapshot is offered for new sale.
  - `FlightRepository.getMonthlyServiceMap(year, month, origin, destination, { paxCount, now })` batches monthly dates into a dictionary of day service indicators and lowest fares, excluding unbookable and cancelled flights.
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
1. **Repository Subscription Binding**: RepositoryProvider subscribes centrally to Booking, Flight and Schedule repositories and invalidates their query hierarchies. List/flight hooks share this authority; older detail/mutation hooks retain bounded compatibility invalidations.
2. **Invalidation Scope**: Repository and mutation subscriptions invalidate the affected booking or flight query hierarchy. Several paths currently overlap; this is a bounded efficiency debt rather than a data-authority split.
3. **Optimistic Updates**: `useCreateBookingMutation` seeds the detail query cache (`queryClient.setQueryData`) immediately upon creation.


---


## 6. Canonical Writers & Wired Views

Canonical repositories own mutations. StoreProvider retains booking compatibility; AdminProvider is a staff/session and permission simulation boundary, not a flight writer or proxy.

1. **`StoreProvider` (`src/lib/store.tsx`)**:
   - Delegates all booking mutations (`addBooking`; check-in, claim and product edits use typed repository commands) to `bookingRepo`.
   - Listens to `bookingRepo.subscribe()` to maintain backward-compatible `bookings` state.
   - Draft, account and saved companion authority belongs to BookingDraftRepository and PassengerRepository; `gza.store.v1` is a read-only migration source.
2. **`AdminProvider` (`src/lib/admin-store.tsx`)**:
   - Flight operations use canonical FlightRepository queries and mutations directly.
   - RepositoryProvider centrally invalidates flight queries; AdminProvider has no local override state.
   - Owns staff session / RBAC simulation and toast/UI helpers only; product-domain OpsState is eliminated. It does not own or proxy canonical flight overrides or Network reference records.
3. **Wired Views**:
   - Public Flight Status (`/flights`): Consumes `useFlightsQuery(date, dir)`.
   - Public Flight Detail (`/flight/$flightId`): Consumes `useFlightQuery(flightId)`.
   - Public Booking Confirmation (`/booking-confirmation/$ref`): Consumes `useBookingQuery(ref)`; successful `null` remains Not Found, while query failures have a distinct error state.
   - Admin Bookings Table (`/admin/bookings`): Consumes `useBookingsQuery()` adapted via `bookingToMockBooking()`.
   - Admin Booking Detail (`/admin/bookings/$ref`): Consumes `useBookingQuery(ref)` and the accepted typed Contact/Seats/Extras/Cancel booking mutations.
   - Admin Global Search (`AdminSearch`): Consumes `useBookingsQuery()` to resolve matching PNRs and passenger names across both public and admin records.


---


## Phase 6A creation and desk validation

`BookingRepository.create()` validates canonical passenger composition, identity fields, contact, criteria, channel, effective flight bookability and capacity, leg-qualified seats, and Extras inside the coordinated mutation. Public and desk writers use the same transaction and `bookingTotal()`; any supplied total is only a preview. A missing legacy channel normalizes to `web`, while counter bookings use `desk` and null owner identity.

Extras use canonical meal/assistance IDs, unique assistance entries and integer extra-bag counts from 0 through 5. For compatibility with existing bookings, missing trailing passenger entries are filled with zero services; surplus entries are rejected. An empty Extras array clears additional services. Seats use the existing cabin, availability, duplicate and checked-in protection policy.

The Gaza desk derives rows for whichever booking leg matches the selected GZA-origin flight, including a GZA-origin return leg. It uses the canonical check-in eligibility policy. Undo preserves documents, seats, Extras, contact and pricing; a genuine no-op writes nothing and notifies nobody. No new operational Undo cutoff is introduced. Effective `seatsLeft` is a frontend snapshot, not an inventory ledger, and creation does not decrement a separate inventory store.

Booking Detail history shows only the evidenced creation timestamp. Current seat, check-in and cancellation state are not rendered as invented timestamped events. Activity persistence remains Phase 6C. Existing legacy storage remains readable; stricter validation applies to new writers and typed mutations. Incomplete creation fixtures in repository tests have been updated to supply the required canonical identity and composition fields rather than relaxing production validation.

## 7. Fixture Inventory & Bundle Isolation

To guarantee that heavy admin fixtures and editor metadata do not leak into public startup chunks:
- **`src/lib/domain/booking-seeds.ts`**: Contains clean, deterministic seeds for 6 demo bookings (`GZA4TQ`, `GZA9MK`, `GZA7RD`, `GZA2BX`, `GZA5ZN`, `GZA8LP`). Does not import CMS, analytics, or story collections.
- **Bundle Measurement**: The Phase 4 measured public entry script was about 414 kB uncompressed. Verify each later release independently; the public startup graph should exclude `admin-mock.ts`, Appearance Studio scenario registry, and heavy visual motifs.

## 8. Boarding-Pass & Check-in Architecture (Phase 4.0.1 & Phase 5C)

### 8.1 Boarding-Pass Data Model & Selector (`src/lib/domain/boarding-pass.ts`)

`getBoardingPassData(booking, leg, passengerIndex, effectiveFlight?)` and `buildBoardingPassViewModel(booking, leg, passengerIndex, effectiveFlight?)` are pure domain selectors:
- **Fact Integrity**: Derives PNR, passenger name, document number, fare class, cabin, booked origin/destination, and scheduled departure/arrival strictly from the canonical `Booking`.
- **Operational Reality**: Resolves current gate, terminal, aircraft equipment, revised departure time, and passenger notes from the effective `Flight` (composed via `FlightRepository`).
- **Time Semantics**: Preserves `scheduledDepartureTime` distinctly from `revisedDepartureTime`. Computes policy-derived `boardingOpensTime` (scheduled departure minus 45 minutes) and `boardingClosesTime` (scheduled departure minus 20 minutes) with station date/midnight rollover safety. Never treats revised departure as extending or replacing scheduled departure.
- **Operational Status Classification**: Maps flight status into five explicit pass operational states: `"active"`, `"cancelled"`, `"departed"`, `"landed"`, or `"unavailable"`. Cancelled, Departed, Landed, and Unavailable flights render explicit non-usable operational treatment banners rather than a deceptive valid-looking boarding pass.
- **Prototype Truth**: Preserves explicit non-scannable prototype disclosure (`bp.notReal`). Barcode blocks are decorative only and inaccessible to assistive tech; no fake BCBP, Aztec, or QR payloads are generated.

### 8.2 Check-in Eligibility & Atomic Transaction (`src/lib/domain/check-in.ts`)

- **Eligibility Engine (`getCheckInEligibility`)**:
  - Authoritative window: Opens **exactly 24 hours** prior to scheduled departure (inclusive); closes **exactly 60 minutes** prior (exclusive).
  - Timezone safety: Evaluated in the departure station timezone (including inbound origin stations).
  - Revision immunity: `revisedDepart` never extends the check-in eligibility window.
  - Allowed flight statuses: `Scheduled`, `OnTime`, `Delayed`.
  - Blocked statuses: `Cancelled`, `Boarding`, `Departed`, `Landed`, or missing/unresolved flights.
- **Atomic Command (`BookingRepository.completeCheckIn`)**:
  - Re-evaluates eligibility inside the coordinator transaction against latest canonical booking, current effective flight overrides, and station clock.
  - Validates passenger non-infant status, unique non-empty document input, and non-duplicate seat assignments.
  - Commits document updates, leg seats, and `checkedIn` indexes in a single atomic transaction.
  - Guarantees full rollback on storage quota or commit failure; UI never displays success unless persistence succeeds.
  - Repeated identical requests are idempotent.

### 8.3 Bounded Passenger Commands & Checked-in Seat Protection

`BookingRepository` commands (`cancel`, `updateContact`, `updateSeats`, `updateExtras`) enforce strict invariants:
- Rejected on cancelled bookings.
- **Checked-in Seat Protection**: `updateSeats` prohibits modifying the assigned seat of any passenger who has already checked in for that specific leg. Unchecked passengers and open legs remain fully editable.
- **Canonical Pricing Recalculation**: `updateSeats` and `updateExtras` recalculate the booking total price using the canonical domain pricing formula (`bookingTotal` in `src/lib/domain/pricing.ts`), completely preventing caller-supplied or divergent UI price tampering.

**Current hardening notes:** `RepositoryProvider`, individual query hooks, and mutation success handlers invalidate relevant query keys upon write. `BookingRepository.list()` returns a new array and `getByRef()` a shallow object copy. Current migrated readers do not mutate those values directly; mutations flow exclusively through typed repository commands.

## Current Phase 6B production checkpoint and earlier deployment history

Phase 6B — Operations Configuration Persistence — is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint (deployed production release: `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`; deployed runtime source: `2749c26714258871c32bd2b14a75fc4e87a68b62`). Deployment is confirmed by the product owner. Git/source/release provenance was independently checked after deployment; no independent live-browser verification from the ChatGPT/Codex environment is claimed. Historical completed production phases remain historical: Phase 6B2A (release `2751e22be91ad74eacc9213489a57a21baf04807`, source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, engineering `1c5e6b6259add7b59199725f6b23324e8d1c58eb`), Phase 6B1 (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`, engineering `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), Phase 6A (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`, source `2ae1a876018992649074cbed1ebf0560e4da03ff`, engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`), and Phase 5D (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`).

## Phase 6B1 accepted source (historical completed production phase)

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase reconciled onto main and deployed by Bassam (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. In accepted Phase 6B2B source, aircraft and seat layouts use `FleetRepository`; Network reference configuration now uses NetworkRepository in Phase 6B2C1; public editorial and merchandising fixtures remain compiled. Commercial product configuration uses `CommercialCatalogRepository`; there is no monolithic durable OpsState. See [Schedule model](SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (deployed production release: `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source: `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6B consolidated Phase 6B1, Phase 6B2A, Phase 6B2B, Phase 6B2C1, and Phase 6B2C2 (6B2C2A & 6B2C2B). Historical production releases include Phase 6B2A (release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, engineering `1c5e6b6259add7b59199725f6b23324e8d1c58eb`), Phase 6B1 (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`), Phase 6A (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`), and Phase 5D (release `898adc36701f138b54787fa14caecf55321b453f`).

Phase 6C — Admin Directory Staff & Activity Convergence is **Implemented / Awaiting Independent Review**; Phase 6 as a whole is Pending Phase 6C Independent Acceptance. Phase 7 and Phase 7B remain Planned / Unstarted. Deployment was owner-confirmed (HTTP 200 confirmed live; no independent live bundle verification claimed).

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner (historical checkpoint)**, accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`. Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`). Existing Flight IDs remain compatibility identities; current services use stable Schedule-derived IDs with canonical Network and Schedule facts, retaining additive `aircraftId` linkage. Phase 6B is Complete / Accepted Source: Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source). Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source). Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source).

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2A is **Complete / Accepted Source**; Phase 6B2C2B remains **Complete / Accepted Source**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Complete / Accepted Source.** Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; their release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [NETWORK_MODEL.md](NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.

## Phase 6B2C2A - Stable Dated-Service Materialization Foundation

**Complete / Accepted Source.** Establishes pure, deterministic projection of recurring schedules onto concrete calendar dates with structured operational effects (`cancelled`, `time`, `aircraft`, `extra`). Versioned URL-safe reversible codec `svc1-<base64url>-<date>` preserves exact Schedule identity without loss. Schedule lifecycle eliminates destructive `remove`; `active = false` is the sole retirement mechanism.

*Historical note (at time of Phase 6B2C2A)*: Prior production was Phase 6B2A (`2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`). Current production is the consolidated Phase 6B owner deployment (`8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, source `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B remain Planned / Unstarted. See [DATED_SERVICE_MODEL.md](DATED_SERVICE_MODEL.md).

## Phase 6B2C2A accepted-source checkpoint

**Phase 6B2C2A Complete / Accepted Source.** ChatGPT independently accepted engineering at `429ca82dfa3db0453feeab5b53bb45e9e14cf45a` (reviewed original implementation: `2e1a3e626c48836384cb22ed57a4d6c4a13e7be3`). Accepted C2A source is `412fc2b4f79e01da0607b5bca44e01d76156a634`; the source-finalization handback records its provenance. C2A has no Accepted Release and is not deployed.

Phase 6B2B and Phase 6B2C1 are Complete / Accepted Source; their release/deployment is intentionally pending. Production remains owner-deployed Phase 6B2A, Complete / Accepted Source / Accepted Release / Deployed by Owner: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2C2B remains Complete / Accepted Source; Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. The historical C2A finalization performed no public or Booking discovery cutover, stored identity migration, release or deployment. C2B current behavior is described below.

## Phase 6B2C2B - Canonical Dated-Service Discovery & Booking Cutover

**Complete / Accepted Source.** Baseline accepted source: `412fc2b4f79e01da0607b5bca44e01d76156a634`. Phase 6B2C2A remains Complete / Accepted Source (accepted engineering `429ca82dfa3db0453feeab5b53bb45e9e14cf45a`). Phase 6B as a whole is Complete / Accepted Source.

Current authority is NetworkRepository + ScheduleRepository + read-only compiled route merchandising price, projected by the shared DatedServiceResolver into `svc1-*` Flights, then composed with canonical FlightOverride. Current search, monthly sellability, Home/public boards, Admin search and new public/desk Booking creation use this chain. Valid empty Schedule storage produces zero current services; corrupt Schedule/Network authority fails truthfully without legacy discovery fallback.

New Booking commands resolve current service IDs only. Committed submission replay precedes every external authority read. Command-time Commercial/Fleet/Schedule/Network snapshots are composed with transaction-current FlightOverrides, and Flight/pricing/seat-layout snapshots plus total commit together in `gza.repo.v1`. This is browser command-time snapshot composition, not multi-store ACID.

Broad Flight lookup retains stored Booking Flight snapshots, including cancelled history. Operational boards retain only confirmed Booking Flight snapshots and relevant override-only legacy Flights. Current bases take precedence when available. Existing PNR mutations can fall back to their stored Flight plus current override during planning removal or authority corruption. Historical pricing and seat-layout snapshots remain authoritative. Planning deactivation is not retroactive cancellation: explicit structured cancellation or FlightOverride cancellation supplies operational truth.

The frozen legacy generator is compatibility-only. There is no generated Flight persistence store, hardcoded cutover date, PNR/draft/override identity migration, backend or cross-device claim. Browser-local `svc1-*` Flight Detail uses generic static metadata because prerender cannot read local Schedule/Network state. Booking route selectors use active Network routes; compiled destination information pages remain available.

Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1 and Phase 6B2C2A release/deployment remain intentionally pending. C2B engineering is accepted and source is finalized; C2B has no Accepted Release and is not deployed. Phase 6C / 7 / 7B remain Planned / Unstarted.


## Phase 6B2C2B accepted-source checkpoint

**Phase 6B2C2B Complete / Accepted Source. Phase 6B Complete / Accepted Source.** ChatGPT independently accepted engineering at `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4` (original implementation: `ff46f8e7ab606731be679eaedbada9e07d09e91a`; accepted C2A baseline: `412fc2b4f79e01da0607b5bca44e01d76156a634`). Acceptance is recorded in the owner-supplied 2026-10-06 master handoff. The accepted-source candidate is the docs/status-only finalization commit introducing this checkpoint; its exact SHA is recorded in the publication handback. Independent accepted-source verification precedes main fast-forward.

PNR-facing Flight reads use `(Booking reference, leg)`: current service when available, otherwise that exact leg's stored Flight, then current FlightOverride. Historical pricing and seat-layout snapshots remain unchanged. Admin Check-in can discover confirmed PNRs using their own snapshots during planning failure, with an explicit localized warning. Public/new-sale authority still fails truthfully. Cancelled PNRs preserve their own history without independently resurrecting retired operational board rows.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1, Phase 6B2C2A and Phase 6B2C2B release/deployment remain pending. Phase 6B has no consolidated Accepted Release and is not deployed as a consolidated milestone. No live production verification is claimed by this finalization.

**Next milestone:** independently verify accepted source, then construct/review the consolidated Phase 6B HostPapa release for owner deployment and production reconciliation. Phase 6C / 7 / 7B remain Planned / Unstarted. This finalization changes no runtime implementation. The immutable planning snapshot is [the 2026-10-06 master handoff](../GAZA_GATEWAY_MASTER_AI_AGENT_HANDOFF_ROADMAP_2026-10-06.md); its pre-finalization refs/status are historical snapshot facts, not moving current refs.

## Phase 6B2C2B Independent Review Correction 01

Status remains **Complete / Accepted Source**. Reviewed parent: `ff46f8e7ab606731be679eaedbada9e07d09e91a`.

PNR-facing operations use `FlightRepository.getBookingFlight(ref, leg)`: prefer a currently materializable service, otherwise use that exact canonical Booking leg's stored Flight, then compose the freshly read matching FlightOverride. Query cache identity includes Booking reference and leg. Multiple PNRs sharing a stable service ID may retain different historical times/equipment; broad public Flight detail is a separate compatibility contract. Read resolution does not migrate Bookings, prices or seat layouts.

`getCheckInFlights(date)` is a desk-only read. Healthy planning retains normal current/compatibility operational listings. Unavailable planning yields an explicit EN/AR warning and confirmed Gaza-departure PNR compatibility from their stored snapshots plus overrides. A Booking/leg map supplies each desk row's own operational timing and sheet Flight. Final check-in remains the canonical BookingRepository command. Public boards, sale search and new Booking creation still fail truthfully during current-authority corruption.

Board relevance uses current services, confirmed PNR snapshots and explicit legacy override-only compatibility. Cancelled PNRs retain history/detail snapshots but do not independently resurrect a retired service on Home/public/Admin boards. Cancelling the last confirmed PNR removes its compatibility-only board row; explicit valid legacy overrides remain operationally relevant.

*Historical note*: During Phase 6B2C2B correction 01, production was owner-deployed Phase 6B2A. Current production is the consolidated Phase 6B owner deployment (`8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, source `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B remain Planned / Unstarted.

## Phase 6B consolidated release & Phase 6C status

**Phase 6B — Operations Configuration Persistence: Complete / Accepted Source / Accepted Release / Deployed by Owner.** Deployed production release: `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, runtime source: `2749c26714258871c32bd2b14a75fc4e87a68b62`. Deployment is confirmed by the product owner (HTTP 200 confirmed live; no independent live bundle verification claimed). Phase 6B consolidated Phase 6B1, 6B2A, 6B2B, 6B2C1, 6B2C2A, and 6B2C2B.

Phase 6C — Admin Directory Staff & Activity Convergence is **Implemented / Awaiting Independent Review**; Phase 6 as a whole is Pending Phase 6C Independent Acceptance.

**Next milestone:** Independently verify and accept Phase 6C engineering, followed by authorized Phase 6 closeout. Phase 7 and Phase 7B remain Planned / Unstarted. This documentation reconciliation changes no runtime implementation. The immutable planning snapshot is [the 2026-10-06 master handoff](../GAZA_GATEWAY_MASTER_AI_AGENT_HANDOFF_ROADMAP_2026-10-06.md); its pre-finalization refs/status are historical snapshot facts, not moving current refs.
