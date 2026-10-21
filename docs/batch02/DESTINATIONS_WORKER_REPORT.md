# Gaza Gateway — Batch 02 Additive Destinations (OSL & ARN) Implementation Report

**Date:** 2026-10-21
**Scope:** Additive support for Oslo Gardermoen (`OSL`) and Stockholm Arlanda (`ARN`), expanding network from 20 to 22 commemorative destinations.
**Target:** HostPapa Shared cPanel (Prebuilt React/Vite + Laravel 13/PHP 8.4+ + MySQL/InnoDB).
**Workspace:** `C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/batch02-destinations-worker`

---

## 1. Executive Summary

Batch 02 extends the Gaza Gateway commemorative network with two authentic Nordic destinations:
- **Oslo Airport, Gardermoen (`OSL`)** — Norway (`Europe/Oslo`, 310 block minutes)
- **Stockholm Arlanda Airport (`ARN`)** — Sweden (`Europe/Stockholm`, 290 block minutes)

The implementation fulfills all architectural invariants:
1. **Additive idempotent database migration** (`2026_10_21_000001_add_osl_arn_destinations.php`):
   - Dynamically inspects and safely expands MySQL CHECK constraints on `airports`: `chk_airports_code` to 23 codes (`GZA` + 22 destinations) and `chk_airports_block_minutes` between 20 and 1440 minutes.
   - Inserts missing rows for `OSL` and `ARN` only, preserving existing database rows.
   - Relies on the existing `routes` SQL VIEW, which automatically derives all 4 bidirectional route legs (`GZA-OSL-out`, `OSL-GZA-in`, `GZA-ARN-out`, `ARN-GZA-in`).
   - Inserts 4 published recurring two-way schedules (`PS 241`/`PS 242` for OSL, `PS 243`/`PS 244` for ARN), referencing existing approved physical fleet (`a321neo` and `a320neo`).
   - Dynamically synchronizes active date boundaries (`from_date` / `until_date`) with existing published schedules.
   - Safely invalidates reference revision counters (`network_revision_control`, `schedule_revision_control`).
   - Safe rollback guard in `down()`: refuses rollback if passenger bookings exist for OSL/ARN; cleanly cleans up new records and restores CHECK constraints if unbooked.
2. **Media processing & responsive derivative inventory**:
   - Both owner-supplied authentic city photographs (`Oslo.jpg` and `Stockholm.jpg`) normalized into 10 responsive WebP derivatives (5 widths per city: 480, 800, 1200, 1600, 1920px) under `src/assets/media/destinations/`.
   - All 10 derivatives and source files hashed (SHA-256) and recorded in `scratch/batch02_destinations_manifest.json` and below.
3. **Backend & frontend validators**:
   - `NetworkCoordinator`, `NetworkValidator`, `EditorialValidator`, and `TicketEmail` updated with exact English/Arabic labels and accepted code sets.
   - All tests passing without regressions.
   - Accidental `backend/tests/bootstrap.php` removed; test execution harness kept strictly in `scratch/`.

---

## 2. Source and Derivative Media Manifest

### 2.1 Owner Source Images (`scratch/owner-input/Cities/`)

| File | Raw Dimensions | Size (bytes) | SHA-256 Digest |
| :--- | :---: | :---: | :--- |
| `Oslo.jpg` | 6048 × 3402 | 2,920,630 | `053a2de501aa04125e63d8040f979737dbb9c07a2522bf84de3439ae12fb2efa` |
| `Stockholm.jpg` | 4096 × 2731 | 1,857,384 | `d732b00a33c15874ef6ccd3e2da9617a883e132eabfe4e9bec1067763a90b529` |

### 2.2 Responsive WebP Derivatives (`src/assets/media/destinations/`)

| Derivative File | Dimensions | Aspect Ratio | Size (bytes) | SHA-256 Digest |
| :--- | :---: | :---: | :---: | :--- |
| `oslo-480.webp` | 480 × 270 | 16:9 | 25,866 | `68cca196fb6a76cdb1ba484d8e0a324b3109017f9b29f757f52aaab1684a3e35` |
| `oslo-800.webp` | 800 × 450 | 16:9 | 69,614 | `a66fa5c384cb5b60b817c0b9a616ef008b46e70810060b007bfa51e5158d2143` |
| `oslo-1200.webp` | 1200 × 675 | 16:9 | 147,316 | `fd8ab75992770a27924d64ecab70e7b69d60c287df039ef6185a8ff1d4ed56a3` |
| `oslo-1600.webp` | 1600 × 900 | 16:9 | 251,448 | `95dd763a74ee77834eb83b20fb013b54e777c376e5b089294ec2f60afab353fe` |
| `oslo-1920.webp` | 1920 × 1080 | 16:9 | 349,374 | `bde3b6e8643c3a139f8d0c9988db1449143be46f7eb4c4808dd434283c897b87` |
| `stockholm-480.webp` | 480 × 320 | 3:2 | 34,004 | `2e0899561766b638d36c1358aa1a593fdaf82e69b4d2f323bf7820c6c294c4c4` |
| `stockholm-800.webp` | 800 × 533 | 3:2 | 85,054 | `ce6ea7e53232c748e7f711a689cb5f31a05c6021aa48367e729726116bfdb1d2` |
| `stockholm-1200.webp` | 1200 × 800 | 3:2 | 173,456 | `c646a86da6be35b1f234db865da8b21c798526a5ad45e7c5dd20655554dd7f8d` |
| `stockholm-1600.webp` | 1600 × 1067 | 3:2 | 291,434 | `a675c12d3d40420987fddbb478eeff777b8984096fe70fc6f3d269f08913e184` |
| `stockholm-1920.webp` | 1920 × 1280 | 3:2 | 395,390 | `28341255bc0488e8e24ed874e1c06dbe456ad821137ea3e21352401ebc5e9b3d` |

---

## 3. Recurring Timetable & Operational Rotation

### 3.1 Flight Details

| Route ID | Flight Number | Direction | Destination | Days of Week | Departure (Local) | Arrival (Local, Reference) | Block Duration | Equipment |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `memorial-b01-osl-out` | `PS 241` | Outbound | `OSL` | Mon, Thu (`[1, 4]`) | `08:15` (GZA) | `12:25` (OSL) | 310 min | Airbus A321neo (`a321neo`) |
| `memorial-b01-osl-in` | `PS 242` | Inbound | `OSL` | Mon, Thu (`[1, 4]`) | `14:00` (OSL) | `20:10` (GZA) | 310 min | Airbus A321neo (`a321neo`) |
| `memorial-b01-arn-out` | `PS 243` | Outbound | `ARN` | Tue, Fri (`[2, 5]`) | `08:30` (GZA) | `12:20` (ARN) | 290 min | Airbus A320neo (`a320neo`) |
| `memorial-b01-arn-in` | `PS 244` | Inbound | `ARN` | Tue, Fri (`[2, 5]`) | `14:00` (ARN) | `19:50` (GZA) | 290 min | Airbus A320neo (`a320neo`) |

### 3.2 Timezone & DST Safety
- Turnaround time at Oslo: 95 minutes (`12:25` arrival to `14:00` departure) $\ge 60$ min minimum.
- Turnaround time at Stockholm: 100 minutes (`12:20` arrival to `14:00` departure) $\ge 60$ min minimum.
- Departures at 08:15, 08:30, and 14:00 local avoid the 01:00–03:00 transition windows. Tested and verified across 400 continuous days with 0 nonexistent or ambiguous clock instances.
- Zero schedule collisions with certified core 3-aircraft narrowbody rotation or other expanded commemorative flights.

---

## 4. Verification Results Summary

1. **Node.js Test Suite**:
   - `node --test tests/unit/destination-media.test.ts tests/unit/memorial-curation.test.ts tests/unit/memorial-expanded-timetable.test.ts tests/unit/network-frontend-expansion.test.ts`
   - **Result**: **32 passed**, 0 failed (3.14s).
2. **Curation Plan Offline Verification**:
   - `node tools/memorial-curation/export-plan.mjs --today 2026-10-19`
   - **Result**: 22 destinations covered, 44 bidirectional schedules, 7,218 total network legs verified, 100% bidirectional symmetry.
3. **Backend PHPUnit Test Suite (PHP 8.4)**:
   - `vendor/bin/phpunit tests/Unit/Editorial/EditorialValidatorTest.php tests/Unit/Mvp/TicketEmailPresentationTest.php tests/Unit/ReferenceSchedules/OfferingLocalTimeTest.php`
   - **Result**: **27 passed**, 143 assertions, 0 failed.
4. **Backend Contracts & Migration Verification**:
   - Verified `NetworkValidator`, `NetworkCoordinator`, `EditorialValidator`, and migration instantiation.
   - **Result**: 100% PASS.

---

## 5. Invariants & Deployment Boundaries

- **No mutations to external vendor/node_modules junctions**: unmutated and clean.
- **Accidental `backend/tests/bootstrap.php` removed**: verified removed from repository tree.
- **No git commit/push or production access**: workspace changes remain uncommitted and unstaged, awaiting authorized review.
