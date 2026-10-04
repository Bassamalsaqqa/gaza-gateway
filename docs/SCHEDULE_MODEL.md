# Schedule Model — Phase 6B1

Status: **Implemented / Awaiting Independent Review** on `phase6b1/flight-ops-schedule-persistence`.

## Planning authority

ScheduleRepository owns recurring browser-local planning entries. It does not generate dated flights, publish website schedules, alter booking search or change existing booking flight IDs. FlightRepository retains compiled departuresOn/arrivalsOn generation plus canonical overrides in `gza.repo.v1`. Exception kinds cancelled/time/aircraft/extra and their details are planning annotations only.

Admin Schedule Manager and destination-related panels share central repository queries. Admin Flights/Detail/Dashboard read effective FlightRepository records and canonical BookingRepository metrics. AdminProvider no longer holds a flight-override facade. Successful empty flight queries are authoritative; public UI never falls back to raw generated flights.

## Storage and transactions

Dedicated `gza.schedule.v1` envelope: `{ schemaVersion: 1, revision: number, schedules: Schedule[] }`. Missing key exposes deterministic compiled seeds without writing. Valid empty arrays are authoritative. An omitted revision normalizes to zero; negative, fractional or unsafe revisions are rejected. Every stored record and exception is validated; duplicate schedule/exception IDs and invalid calendar dates are rejected.

Malformed/unsupported or unreadable present storage yields an empty safe read and remains untouched. Writes fail with ScheduleStorageWriteError until deliberately repaired/removed; no implicit reset is provided. Mutations queue per coordinator, acquire an origin-wide Web Lock in browsers and reread canonical storage inside the lock. Browser writes fail safely without Web Locks. Explicit in-memory/Studio repositories work without browser storage or locks.

Candidates are validated and persisted before adoption/notification/success. Failed commits preserve canonical data, revision, user input and subscriber state. Identical create replay with the same draft ID returns the existing record without writing; conflicting reuse rejects. Identical updates and absent removals avoid writes/notifications. IDs are created once per new draft; retries retain identity. Same-tab subscribers invalidate scheduleKeys through RepositoryProvider; storage events refresh other same-origin tabs, including clear/removal. No server/cross-device synchronization.

## Contract and validation

Async list/getById/create/update/remove/subscribe. Reads return detached snapshots. Stable identities survive edits. Known compiled destination codes, unique weekdays, valid HH:mm times, from <= until, bounded aircraft/exception detail, boolean active, known exception kinds and unique IDs are domain rules. UI field errors are localized/associated/focused; storage errors are general alerts. ops.view reads and ops.edit mutates; no RBAC expansion.

## Remaining boundaries

Only Schedules were extracted from mixed OpsState. Aircraft/seat maps/fares/baggage/meals/assistance/destinations remain session-only. Public product/destination data remain compiled reference authority. No gza.ops.v1, backend, database, SMTP, payment or GDS. No booking migration or flight-ID change.

Phase 6B2 — Network, Fleet & Sellable Product Authority — Planned / Unstarted. Phase 6C/7/7B — Planned / Unstarted. Owner-deployed Phase 6A release remains `b5cff4db4b6e087907a9733ffd841880439fbfdb`, runtime source `2ae1a876018992649074cbed1ebf0560e4da03ff`.
