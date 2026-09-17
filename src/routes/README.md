# Routes Directory — Gaza Airport & Palestinian Airlines

This application uses **TanStack Start file-based routing** with a **flat directory structure** under `src/routes/`. Route definitions are compiled automatically into `src/routeTree.gen.ts`. Never edit `src/routeTree.gen.ts` by hand.

## Route Topology & File Counts

The directory contains **68 `.tsx` files** (+ `README.md`):
- **1 Root Route**: `__root.tsx` (app shell, HTML `lang`/`dir`, head metadata, global providers).
- **1 Locale Layout Wrapper**: `{-$locale}.tsx` (matches `/` or `/ar`).
- **43 Public Feature Routes**:
  - Home & Information: `{-$locale}.index.tsx`, `{-$locale}.about.tsx`, `{-$locale}.travel.tsx`, `{-$locale}.contact.tsx`, `{-$locale}.privacy.tsx`, `{-$locale}.terms.tsx`, `{-$locale}.access-denied.tsx`.
  - Flights & Destinations: `{-$locale}.flights.tsx`, `{-$locale}.flight.$flightId.tsx`, `{-$locale}.destinations.tsx`, `{-$locale}.destinations.$code.tsx`.
  - Booking & Boarding: `{-$locale}.book.tsx`, `{-$locale}.booking-confirmation.$ref.tsx`, `{-$locale}.check-in.tsx`, `{-$locale}.boarding-pass.$ref.$leg.$pax.tsx`.
  - Manage Booking Hub & Leaf Routes: `{-$locale}.manage.tsx`, `{-$locale}.manage.index.tsx`, `{-$locale}.manage.$ref.tsx`, `{-$locale}.manage.$ref_.seats.tsx`, `{-$locale}.manage.$ref_.extras.tsx`, `{-$locale}.manage.$ref_.contact.tsx`, `{-$locale}.manage.$ref_.check-in.tsx`.
  - Passenger Account & Auth: `{-$locale}.signin.tsx`, `{-$locale}.register.tsx`, `{-$locale}.forgot-password.tsx`, `{-$locale}.reset-password.tsx`, `{-$locale}.verify-email.tsx`, `{-$locale}.account.tsx`, `{-$locale}.account.index.tsx`, `{-$locale}.account.profile.tsx`, `{-$locale}.account.preferences.tsx`, `{-$locale}.account.security.tsx`, `{-$locale}.account.travelers.tsx`, `{-$locale}.account.trips.tsx`, `{-$locale}.account.trips.index.tsx`, `{-$locale}.account.trips.$ref.tsx`, `{-$locale}.account.boarding-passes.tsx`.
  - Airport History & Storytelling: `{-$locale}.airport.tsx`, `{-$locale}.airport.index.tsx`, `{-$locale}.airport.past.tsx`, `{-$locale}.airport.present.tsx`, `{-$locale}.airport.future.tsx`, `{-$locale}.gallery.tsx`.
- **23 Admin Workspace Routes**:
  - Admin Shell Layout: `{-$locale}.admin.tsx` (renders `<AdminShell />`).
  - Auth: `{-$locale}.admin_.signin.tsx` (the trailing `_` in `admin_` opts out of the `admin.tsx` layout).
  - Operations Dashboard: `{-$locale}.admin.index.tsx`, `{-$locale}.admin.access-denied.tsx`.
  - Core Modules: `{-$locale}.admin.flights.index.tsx`, `{-$locale}.admin.flights.$flightId.tsx`, `{-$locale}.admin.schedules.tsx`, `{-$locale}.admin.destinations.index.tsx`, `{-$locale}.admin.destinations.$code.tsx`, `{-$locale}.admin.products.tsx`, `{-$locale}.admin.bookings.index.tsx`, `{-$locale}.admin.bookings.$ref.tsx`, `{-$locale}.admin.bookings.new.tsx`, `{-$locale}.admin.check-in.tsx`, `{-$locale}.admin.customers.index.tsx`, `{-$locale}.admin.customers.$id.tsx`, `{-$locale}.admin.website.tsx`, `{-$locale}.admin.airport.index.tsx`, `{-$locale}.admin.staff.tsx`, `{-$locale}.admin.activity.tsx`, `{-$locale}.admin.analytics.tsx`, `{-$locale}.admin.settings.tsx`, `{-$locale}.admin.inbox.tsx`.

## TanStack Naming Conventions

| Token | Meaning | Example | Resolved URL |
| :--- | :--- | :--- | :--- |
| `{-$param}` | Optional path segment | `{-$locale}.flights.tsx` | `/flights` and `/ar/flights` |
| `.$param` | Dynamic path parameter | `{-$locale}.flight.$flightId.tsx` | `/flight/:flightId` |
| `.` | Path separator (flat naming) | `{-$locale}.admin.flights.tsx` | `/admin/flights` |
| `segment_` | Trailing underscore (layout bypass) | `{-$locale}.admin_.signin.tsx` | `/admin/signin` without Admin layout |
| `__root` | Root layout shell | `__root.tsx` | Wraps all routes |
