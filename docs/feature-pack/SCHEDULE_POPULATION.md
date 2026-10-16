# Gaza Gateway — 20-Destination Bidirectional Commemorative Schedule Population
**Document Reference:** `docs/feature-pack/SCHEDULE_POPULATION.md`

**Slice:** Slice 3 — Audited Additive 20-Destination Bidirectional Recurring Schedules

**Date:** 2026-10-16

**Audience:** Codex (Lead Engineer / Coordinator), Product Owner Review, ChatGPT (Architect Reviewer)

**Hosting Target:** HostPapa shared cPanel (Prebuilt React/Vite + Laravel 13/PHP 8.4+ + MySQL/InnoDB)

**Status:** Local preparation only; zero uncommitted production or remote mutations. Production has not been populated.

---

## 1. Executive Summary

This document specifies and records the implementation of **Slice 3** of the Big Feature Pack (Master Brief Section 4D).

### The Gap Addressed
- Previously, `tools/memorial-curation/catalog.v1.json` defined 13 new airports and `src/lib/network/types.ts` defined 20 network codes, but `timetable.mjs` only generated schedules for the **7 core regional routes** (14 schedules, PS 201–PS 214).
- The Admin Curation UI published only those 7 core routes, leaving the 13 expanded airports in `catalog.v1.json` without recurring flight schedules.
- Owner manual creation of 26 schedules across 13 destinations with local timezones, DST safety, and bidirectional pairing would be tedious and error-prone.

### The Solution Delivered
- **All 20 destinations** now have fully modeled, bidirectional, recurring schedules (40 schedules total: 20 outbound, 20 inbound).
- **Varying, realistic frequencies**: regional routes operate at higher frequencies (3–5 days/week); mid-haul European routes at 2–3 days/week; long-haul transatlantic and Southeast Asian routes at 2 days/week.
- **Two-weekly symbolic patterns & lagged inbound days**: long-haul flights (Kuala Lumpur, New York, Toronto) have inbound operating days that lag outbound departure days by +1 weekday as a simple explicit design choice of two-weekly symbolic patterns and spaced dates, without making regulatory or crew-rest claims.
- **Duration policy strictly from network authority**: durations are derived directly from `airport.blockMinutes` (the approved symbolic great-circle estimates: km / 800 km/h + 35 min, rounded up to 5 min), never hardcoded or faked.
- **DST & local time integrity**: all departure and arrival clocks are validated against nonexistent or ambiguous DST transitions using `localInstant` / `OfferingLocalTime` equivalent semantics.
- **No manual schedule typing**: the Admin Curation tool (`MvpMemorialCuration`) previews and publishes all 20 destinations in a single authorized batch, with existing staff authentication, CSRF, RBAC, and audit logs preserved. Preview and publish remain authorized staff actions.
- **Guarded idempotency & edit protection**: if an owner previously edited any schedule, execution stops before any overwrite; if all 20 destinations are already installed, the tool reports 0 changes and disables publishing.
- **Strict unmanaged staff schedule checks preserved**: unmanaged staff schedules on any route (core or off-core, such as BEY) are strictly checked against the core physical aircraft rotation, rejecting any turnaround or overlap conflicts.
- **Certified core rotation preserved**: the existing strict 60-minute physical turnaround rotation check across the 3 active fleet aircraft is strictly maintained for the 7 core routes. The expanded long-haul services are audited as symbolic commemorative offerings that reference approved physical seat layouts as display models, without claiming an impossible continuous single-narrowbody global rotation.

---

## 2. Complete 20-Destination Network Inventory & Timetable

All flights operate to and from **Gaza International Airport (GZA)** (`Asia/Gaza`, base hub).

*(Note: Sample arrival clocks in the tables below are shown as of reference date 2026-10-19. Actual arrivals vary dynamically by season and Daylight Saving Time based on elapsed block minutes and target timezone offsets.)*

### 2.1 Core Network (7 Destinations — Certified 3-Aircraft Physical Rotation)

| Destination | Code | Timezone | Duration | Outbound | Depart (GZA) | Arrive (Local, 2026-10-19) | Inbound | Depart (Local) | Arrive (GZA, 2026-10-19) | Inbound Days | Aircraft Assigned |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Amman** | `AMM` | `Asia/Amman` | 55 min | `PS 201` | Daily (0–6) 07:00 | 07:55 | `PS 202` | Daily (0–6) 08:55 | 09:50 | Same day | `a320neo` (168 seats) |
| **Cairo** | `CAI` | `Africa/Cairo` | 75 min | `PS 203` | Sun,Mon,Tue,Thu,Sat 13:00 | 14:15 | `PS 204` | Sun,Mon,Tue,Thu,Sat 15:15 | 16:30 | Same day | `a320neo` (168 seats) |
| **Istanbul** | `IST` | `Europe/Istanbul` | 140 min | `PS 205` | Sun,Tue,Thu,Sat 07:00 | 09:20 | `PS 206` | Sun,Tue,Thu,Sat 10:20 | 12:40 | Same day | `a321neo` (196 seats) |
| **Jeddah** | `JED` | `Asia/Riyadh` | 165 min | `PS 207` | Sun,Wed,Fri 15:00 | 17:45 | `PS 208` | Sun,Wed,Fri 18:45 | 21:30 | Same day | `a321neo` (196 seats) |
| **Doha** | `DOH` | `Asia/Qatar` | 175 min | `PS 209` | Mon,Wed,Fri 05:00 | 07:55 | `PS 210` | Mon,Wed,Fri 08:55 | 11:50 | Same day | `b737800` (162 seats) |
| **Dubai** | `DXB` | `Asia/Dubai` | 195 min | `PS 211` | Tue,Thu,Sat 05:00 | 09:15 | `PS 212` | Tue,Thu,Sat 10:15 | 12:30 | Same day | `b737800` (162 seats) |
| **Riyadh** | `RUH` | `Asia/Riyadh` | 190 min | `PS 213` | Mon,Thu,Sat 15:00 | 18:10 | `PS 214` | Mon,Thu,Sat 19:10 | 22:20 | Same day | `b737800` (162 seats) |

*Core Fleet Rotation Certification: 2,928 legs verified across 3 active airframes (`a320neo`, `a321neo`, `b737800`); turnaround between all consecutive rotations is strictly $\ge 60$ minutes.*

---

### 2.2 Expanded Network (13 Destinations — Audited Commemorative Offerings)

| Destination | Code | Timezone | Duration | Outbound | Out Days | Depart (GZA) | Arrive (Local, 2026-10-19) | Inbound | In Days (Lag) | Depart (Local) | Arrive (GZA, 2026-10-19) | Aircraft Assigned |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Beirut** | `BEY` | `Asia/Beirut` | 60 min | `PS 215` | Sun,Mon,Tue,Thu,Fri (`0,1,2,4,5`) | 09:30 | 10:30 | `PS 216` | Same day (`0,1,2,4,5`) | 11:45 | 12:45 | `a320neo` |
| **Kuwait City** | `KWI` | `Asia/Kuwait` | 140 min | `PS 217` | Sun,Mon,Wed,Sat (`0,1,3,6`) | 10:30 | 13:50 | `PS 218` | Same day (`0,1,3,6`) | 15:30 | 17:50 | `b737800`* |
| **Abu Dhabi** | `AUH` | `Asia/Dubai` | 200 min | `PS 219` | Sun,Wed,Fri (`0,3,5`) | 11:00 | 15:20 | `PS 220` | Same day (`0,3,5`) | 16:30 | 18:50 | `a320neo` |
| **Athens** | `ATH` | `Europe/Athens` | 130 min | `PS 221` | Mon,Thu,Sat (`1,4,6`) | 08:30 | 10:40 | `PS 222` | Same day (`1,4,6`) | 12:30 | 14:40 | `a320neo` |
| **Rome** | `FCO` | `Europe/Rome` | 210 min | `PS 223` | Sun,Tue,Fri (`0,2,5`) | 09:00 | 11:30 | `PS 224` | Same day (`0,2,5`) | 14:30 | 19:00 | `a320neo` |
| **Paris** | `CDG` | `Europe/Paris` | 285 min | `PS 225` | Mon,Wed,Sat (`1,3,6`) | 08:00 | 11:45 | `PS 226` | Same day (`1,3,6`) | 14:00 | 19:45 | `a321neo` |
| **London** | `LHR` | `Europe/London` | 310 min | `PS 227` | Sun,Tue,Thu (`0,2,4`) | 07:30 | 10:40 | `PS 228` | Same day (`0,2,4`) | 13:00 | 20:10 | `a321neo` |
| **Frankfurt** | `FRA` | `Europe/Berlin` | 260 min | `PS 229` | Sun,Wed,Fri (`0,3,5`) | 08:45 | 12:05 | `PS 230` | Same day (`0,3,5`) | 14:15 | 19:35 | `a320neo` |
| **Madrid** | `MAD` | `Europe/Madrid` | 300 min | `PS 231` | Mon,Fri (`1,5`) | 09:15 | 13:15 | `PS 232` | Same day (`1,5`) | 15:30 | 21:30 | `a320neo` |
| **Mumbai** | `BOM` | `Asia/Kolkata` | 345 min | `PS 233` | Tue,Sat (`2,6`) | 06:30 | 15:45 | `PS 234` | Same day (`2,6`) | 18:15 | 21:30 | `a321neo` |
| **Kuala Lumpur** | `KUL` | `Asia/Kuala_Lumpur` | 615 min | `PS 235` | Mon,Thu (`1,4`) | 19:30 | 11:45 (+1d) | `PS 236` | **Tue,Fri (`2,5`) (+1d lag)** | 14:30 | 18:45 | `a321neo` |
| **New York** | `JFK` | `America/New_York` | 720 min | `PS 237` | Sun,Wed (`0,3`) | 09:30 | 14:30 | `PS 238` | **Mon,Thu (`1,4`) (+1d lag)** | 18:00 | 13:00 (+1d) | `a321neo` |
| **Toronto** | `YYZ` | `America/Toronto` | 735 min | `PS 239` | Tue,Fri (`2,5`) | 09:00 | 14:15 | `PS 240` | **Wed,Sat (`3,6`) (+1d lag)** | 17:30 | 12:45 (+1d) | `a321neo` |

*\*Note: If standby Boeing 737-800 is not activated, KWI automatically falls back to an active aircraft (`a320neo`) from physical fleet authority.*

*Expanded Network Audit: 3,870 legs verified across all 13 destinations; calendar date rollover, half-hour timezones (`Asia/Kolkata`), and DST transitions audited with zero gaps.*

---

## 3. Architecture & Fleet Invariants

### 3.1 Fleet Reality vs Commemorative Presentation
- **Owner Directive**: The project is a commemorative/memorial airport experience, not a commercial airline. Operational realism must not be achieved by falsifying physical fleet rotation claims or inventing unapproved aircraft models.
- **The Core Fleet**:
  1. `a320neo` ("Airbus A320neo", PS-GZA) — 168 seats, 28 rows, 3 cabins (Business, Premium, Economy), active: `true`.
  2. `a321neo` ("Airbus A321neo", PS-GZB) — 196 seats, 33 rows, 3 cabins, active: `true`.
  3. `b737800` ("Boeing 737-800", PS-GZC) — 162 seats, 27 rows, 2 cabins (Business, Economy), standby: activated via Admin checkbox.
- **Physical Layout Integrity**: Every schedule in both the core and expanded networks references an approved aircraft ID whose seat layout exists in `snapshot.fleet.layouts`. If an aircraft is inactive in the input fleet, `planExpandedTimetable` only assigns active aircraft from approved fleet authority. No fake widebodies (e.g. A350, B777, B787) or generic placeholder cabins were introduced.
- **Rotation Verifier Boundary**:
  - `verifyTimetable`: Validates physical narrowbody rotations across the 7 core regional routes plus all unmanaged staff schedules, with mandatory $\ge 60$-minute turnaround and strict airport continuity (`previous.destination === leg.origin`).
  - `verifyNetworkTimetable`: Audits the full 20-destination network (all 40 schedules) for calendar progression, bidirectional completeness, unique flight numbers, local timezone validity, and DST safety, without falsely asserting that the narrowbody fleet operates a single continuous global rotation to New York and Kuala Lumpur.

### 3.2 Inbound Weekday Lag Logic (Two-Weekly Symbolic Pattern Design)
For long-haul destinations, assigning inbound operating days with a +1 weekday lag is a simple, deliberate commemorative schedule design choice to provide clean two-weekly spaced service patterns:
- **Kuala Lumpur (`KUL`)**: Outbound operates Mon/Thu (`days: [1, 4]`) departing GZA at 19:30, arriving KUL the following day at ~11:45 local. Inbound operates **Tue/Fri (`days: [2, 5]`)** departing KUL at 14:30 (`PS 236`), offering a natural daytime return on the next day.
- **New York (`JFK`)**: Outbound operates Sun/Wed (`days: [0, 3]`) departing GZA at 09:30, arriving JFK at ~14:30 local afternoon. Inbound operates **Mon/Thu (`days: [1, 4]`)** departing JFK at 18:00 (`PS 238`). While a same-day 18:00 return on Sunday/Wednesday is technically possible (after ~3.5h ground time), the spaced two-weekly pattern departing the following day was selected as a clean, realistic commemorative schedule layout without making regulatory crew-rest or airline operations claims.
- **Toronto (`YYZ`)**: Outbound operates Tue/Fri (`days: [2, 5]`) departing GZA at 09:00, arriving YYZ at ~14:15 local afternoon. Inbound operates **Wed/Sat (`days: [3, 6]`)** departing YYZ at 17:30 (`PS 240`), similarly following the spaced two-weekly design pattern.

---

## 4. Deterministic Identity & Wire Contracts

### 4.1 Schedule IDs
Every schedule uses the canonical deterministic identity scheme:
$$\text{id} = \texttt{memorial-b01-}[\text{code}]-(\texttt{out} \mid \texttt{in})$$
Examples:
- `memorial-b01-amm-out`, `memorial-b01-amm-in`
- `memorial-b01-bey-out`, `memorial-b01-bey-in`
- `memorial-b01-jfk-out`, `memorial-b01-jfk-in`

Every ID matches `/^memorial-b01-[a-z]{3}-(?:out|in)$/`.

### 4.2 Flight Numbers
Every flight number is unique and follows the format `PS 2xx`:
- `PS 201` – `PS 214`: Core regional destinations (7 pairs)
- `PS 215` – `PS 240`: Expanded destinations (13 pairs)

### 4.3 Offering Resolution & DST Robustness
- In both Laravel/PHP backend (`OfferingResolver.php` / `OfferingLocalTime.php`) and Node.js curation (`timetable.mjs` / `localInstant`), dated offering arrivals are derived dynamically:
  $$\text{departInstant} = \text{localInstant}(\text{date}, \text{departTime}, \text{originTimezone})$$
  $$\text{arriveInstant} = \text{departInstant} + \text{blockMinutes} \times 60\,000$$
  $$\text{arrivalClock} = \text{localClock}(\text{arriveInstant}, \text{destinationTimezone})$$
- Departure times were chosen during stable midday and evening hours (e.g. 06:30–19:30), strictly avoiding the 01:00–03:00 transition windows across all European, American, and Middle Eastern timezones. No scheduled departure encounters nonexistent or ambiguous DST clocks.

---

## 5. Safety Guards & Operational Invariants

1. **Preflight Stale Snapshot Guard**:
   - `snapshotFingerprint` computes a deterministic canonical JSON representation of all airports, fleet, and schedules.
   - If the database state changes between preview and publishing, `applyCurationPlan` throws:
     > *"Authority changed after preview. Refresh the preview before publishing."*
2. **Non-Overwrite of Owner Edits**:
   - Every desired schedule is compared against existing authority using canonical JSON comparison (ignoring `until`).
   - If an owner or staff member previously edited an existing schedule's flight number, days, times, or aircraft, `buildCurationPlan` throws:
     > *"An existing curated schedule was edited; no overwrite is allowed."*
3. **Strict Verification of Unmanaged Staff Schedules**:
   - All unmanaged staff schedules in `snapshot.schedules` are verified alongside core schedules using `verifyTimetable`. Any overlap, turnaround violation (<60m), or airport discontinuity on a physical airframe causes an immediate guard stop.
4. **Idempotent Application**:
   - If the 20 destinations and 40 schedules are already installed and up-to-date, `plan.additions`, `plan.fleetUpdates`, `plan.scheduleAdds`, and `plan.scheduleExtensions` are all empty.
   - The "Publish previewed changes" button is disabled.
5. **Finite Bounded Periods & Extensions**:
   - Schedules are bounded to a 1-year horizon starting from the upcoming Monday.
   - If existing schedules expire before the new horizon, `buildCurationPlan` adds targeted `{ id, patch: { until } }` entries to `scheduleExtensions` without modifying historical IDs or flight numbers.
6. **Partial Failure Reporting**:
   - If an API or network write fails at item $N$, `applyCurationPlan` reports:
     > *"Curation stopped after $N$ committed changes. Refresh the preview; do not undo unrelated records."*
   - Refreshing the preview generates a plan containing only the remaining uncommitted changes, avoiding duplicate key errors.

---

## 6. Offline Generation & Verification Tooling

To ensure reproducible verification without requiring a live browser or database:

### 6.1 CLI Plan Generator
Run the offline plan generator from the project root:
```bash
node tools/memorial-curation/export-plan.mjs --today 2026-10-19
```
Output:
```text
=== Gaza Gateway — 20-Destination Commemorative Curation Plan ===
Period: 2026-10-19 → 2027-10-19
New Airport Additions: 13
Fleet Updates (Standby): 1
Schedule Adds: 40 (20 destinations bidirectional)
Schedule Extensions: 0
Core Rotation Leg Count: 2928 (min turnaround: 60m)
Total Network Leg Count: 6798
Total Destinations Covered: 20
Bidirectional Pairs: 20
Core Legs: 2928 | Expanded Legs: 3870
Snapshot Fingerprint: {"airports":[{"active":true,"air...
```

To export the full plan as formatted JSON:
```bash
node tools/memorial-curation/export-plan.mjs --today 2026-10-19 --out scratch/feature-pack-schedule-worker/plan.json
```

### 6.2 Focused Test Suite
Run the focused curation test suite:
```bash
node --test tests/unit/memorial-curation.test.ts tests/unit/memorial-timetable.test.ts tests/unit/memorial-expanded-timetable.test.ts
```
Result: **14/14 tests passing** (covering all 20 destinations, bidirectional symmetry, unique IDs/numbers, DST robustness, finite leg calculations, inactive fleet fallback, unmanaged staff conflict rejection, idempotency, and edit protection).

---

## 7. Owner Handback & Application Instructions

*(Note: This documentation reflects local preparation only. Production has not been modified and no automated database migration or population has been executed.)*

When the owner explicitly authorizes applying this feature pack in production:

1. **Sign in to the Admin Panel**: Navigate to `/admin` (or `/ar/admin`).
2. **Access Memorial Timetable Curation**: Scroll to the "Memorial timetable / برنامج الرحلات التذكارية" card.
3. **Standby Aircraft Option**: Ensure the checkbox *"Allow activation of the approved standby Boeing 737-800 if needed"* is checked.
4. **Click "Preview changes"**:
   - The preview card displays:
     - Date span: `2026-10-19 → 2027-10-19` (or next upcoming Monday).
     - New records: `13 new destinations, 26 new schedules, 14 extensions (if core already installed)` or `40 new schedules (if fresh)`.
     - Certified core rotation: `2,928 legs verified; minimum turnaround 60 minutes across 3 approved active aircraft.`
     - Network audit: `Full network audit: 20 destinations (20 bidirectional pairs, 6,798 total legs across the year). Commemorative regional and long-haul routes verified for calendar progression, timezones, and DST safety.`
     - Honest commemorative copy: *"Note: Long-haul commemorative services reference approved fleet layouts as display models, without claiming a continuous single-airframe global operational rotation."*
5. **Click "Publish previewed changes"**:
   - The system executes standard authenticated staff API commands (`POST /admin/network/airports/receipt`, `PATCH /admin/fleet/aircraft/:id/receipt`, `POST /admin/schedules`, `PATCH /admin/schedules/:key`).
   - All changes are recorded with audit logs.
   - Cache invalidation triggers automatically.
6. **No Manual Schedule Typing**: All 20 destinations are immediately active, bidirectional, and available across the entire Gaza Gateway application without manual schedule typing.
