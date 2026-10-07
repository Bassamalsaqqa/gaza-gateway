# Customer Directory Domain Model (Phase 6C)

> **Document Status**: Active Architecture Specification (Phase 6C Implemented / Awaiting Independent Review)
> **Product**: Gaza Airport (`GZA`) & Palestinian Airlines (`PS`) — [gazaairport.com](https://www.gazaairport.com)
> **Domain Aggregate**: Derived Customer Directory (`CustomerSummary`, `CustomerDetail`)
> **Storage Authority**: **Non-Persistent Derived Projection** (Zero duplicate storage; NO `gza.customer.v1`)
> **Underlying Authorities**: `PassengerRepository` (`gza.passenger.v1`) & `BookingRepository` (`gza.repo.v1`)
> **Service Interface**: `CustomerDirectoryService` (`src/lib/customer-directory/types.ts`)
> **Primary Implementation**: `LocalCustomerDirectoryService` (`src/lib/customer-directory/service.ts`)

---

## 1. Executive Summary & Non-Persistent Projection Guarantee

Prior to Phase 6C, the administrative customer screens at `/admin/customers` and `/admin/customers/$id` operated on disconnected mock data:
1. **Static Mock Fixtures**: UI imported `mockCustomers` and `mockCustomerById` from `src/lib/admin-mock.ts`.
2. **Pretend Actions**: Administrative buttons to "Suspend Customer", "Reset Password", or "Attach Booking" were visual toasts without backend persistence.
3. **Dual Storage Anti-Pattern Avoided**: Introducing a separate persistent customer store (`gza.customer.v1`) would duplicate profile and booking data, leading to state drift and split-brain truth.

Phase 6C establishes the **non-persistent derived customer directory**:
- **Zero Persistent Duplicate Storage**: There is no `gza.customer.v1` key.
- **On-The-Fly Projection**: Customer profiles and booking statistics are projected dynamically from canonical `PassengerRepository` (`gza.passenger.v1`) and `BookingRepository` (`gza.repo.v1`).
- **Reactive Cache Invalidation**: The directory projection subscribes to mutations in both underlying repositories, invalidating TanStack Query caches whenever passenger accounts or bookings change.

---

## 2. Projection Contract: Accounts vs. Guests

```typescript
export type CustomerType = "account" | "guest";

export interface CustomerSummary {
  id: string; // cus_acc_<base64url> or cus_gst_<base64url>
  type: "account" | "guest";
  name: string;
  email: string;
  phone: string;
  bookingCount: number;
  upcomingCount: number;
  travelerCount: number;
  refs: string[];
}

export interface CustomerDetail extends CustomerSummary {
  account: PassengerAccount | null;
  travelers: Traveler[];
  bookings: Booking[];
  seatPreference?: string | null;
  mealPreference?: string | null;
  newsletter?: boolean | null;
}
```

### 2.1 Account Customers
- Derived from canonical `PassengerAccount` in `PassengerRepository`.
- **Strict Ownership Invariant**: A booking is attributed to an account customer **if and only if** `booking.ownerEmail === account.email`. Contact email matching alone does not confer account ownership.
- Saved travelers and passenger preferences are loaded directly from the canonical passenger account.

### 2.2 Guest Customers
- Derived from canonical bookings in `BookingRepository` that have no account owner (`!booking.ownerEmail`).
- Grouped by normalized booking contact email.
- Never creates fabricated passenger accounts or synthetic passwords.
- Displays the derived guest type and contains no saved travelers or saved preferences. No security status or preferred language is invented.

---

## 3. URL-Safe Bijective Route Tokens

To avoid routing errors and leaking unencoded email symbols (`@`, `.`, `+`) into URL segments (e.g. `/admin/customers/$id`):

```typescript
// Token encoding
cus_acc_<base64url(normalizedEmail)>   // Registered passenger accounts
cus_gst_<base64url(normalizedEmail)>   // Unowned guest booking contacts
```

### Bijective Guarantees & Collision Resistance
- **Deterministic**: An email always maps to the exact same route ID for a given customer type.
- **Bijective & Reversible**: The service can reliably decode the route ID back to its customer type and email without storing an in-memory lookup map.
- **Collision Behavior**: Exact reversible encoding preserves distinct normalized identities; the projection also rejects duplicate route IDs. Malformed/noncanonical tokens return `null`. Base64url is encoding, not anonymization: the email can be decoded from the route token.

---

## 4. Deterministic Trip Lifecycle Derivation

`isBookingUpcoming(booking, clockDate)` counts a non-cancelled booking as upcoming when either leg's ISO date is on or after the injected clock date. This is a date-level directory summary, not time-of-day check-in eligibility. Cancelled bookings still count in total booking/history facts, but not upcoming counts.

---

## 5. Administrative Operations & Truthful Bounds

All administrative actions on customer detail surfaces execute real domain commands:
1. **Profile Updates**:
   - For account customers: Updates name or phone via `PassengerRepository.updateAccountWithReceipt(patch, { expectedEmail })`. The account email is an immutable identity key and cannot be modified.
   - For guest customers: Edits are booking-specific via `BookingRepository.updateContact()`. Global guest profile edits are not permitted because guest profiles are non-persistent.
2. **Attach Booking to Customer**:
   - Executes `PassengerRepository.withAccountIdentity(expectedEmail, () => BookingRepository.claim(pnr, accountEmail))`; the passenger command lock verifies the exact canonical account before booking ownership changes. No passenger write or migration occurs..
   - Returns and renders truthful domain outcomes:
     - `claimed`: Successfully attached booking to account.
     - `already-owned-by-user`: Booking is already owned by this account.
     - `owned-by-another`: Booking is owned by another account.
     - `contact-mismatch`: Booking contact email does not match the account identity.
     - `not-found`: Booking reference does not exist.
3. **Removed Pretend Actions**:
   - Fake "Suspend Guest", "Send Password Reset", and "Delete Customer" actions have been eliminated.

---

## 6. Query Integration & Invalidation

- `useCustomersQuery()`: Caches customer directory list under `customerKeys.all`.
- `useCustomerDetailQuery(id)`: Caches full customer details under `customerKeys.detail(id)`.
- `RepositoryProvider` ensures cache freshness by subscribing to both repositories:
  ```typescript
  unsubBooking = value.booking.subscribe(() => {
    queryClient.invalidateQueries({ queryKey: customerKeys.all });
  });
  unsubPassenger = value.passenger.subscribe(() => {
    queryClient.invalidateQueries({ queryKey: customerKeys.all });
  });
  ```
