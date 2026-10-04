# Commercial catalog and booking pricing — Phase 6B2A

**Complete / Accepted Source / Accepted Release / Deployed by Owner**, the current production checkpoint (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`). Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

## Authority and persistence

`gza.commercial.v1` contains `{schemaVersion:1, revision, catalog}`. Catalog contains `fares`, `cabins`, `baggage`, `meals`, `defaultMealId`, `assistance`. Missing storage exposes deterministic compiled seeds without writing. Valid storage is authoritative. A corrupt, unsupported or unavailable present store surfaces a typed query failure and blocks mutation; there is no healthy-looking seed fallback or automatic destructive repair. Deliberate browser-store repair/removal is required.

CommercialStorageCoordinator serializes each instance, obtains an origin-wide Web Lock when supported, rereads inside that lock, validates the entire prospective catalog, persists before adoption, and only then notifies subscribers. Failure leaves prior state/revision intact with no success event. Unsupported browser write coordination fails safely. Identical mutations avoid persistence. Reads are detached copies. Storage events invalidate mounted same-origin consumers; RepositoryProvider centrally invalidates commercial query keys. Studio uses an isolated in-memory catalog. This is same-browser/origin persistence, not organization-wide or cross-device synchronization.

## Contract and lifecycle

Async get, updateFare, updateCabinPricing, updateBaggage, createMeal, updateMeal, reorderMeals, setDefaultMeal, createAssistance, updateAssistance, reorderAssistance and subscribe. Zod validates the entire prospective catalog. Fixed fares: essential/classic/flex; fixed cabins: economy/premium/business. Essential and Economy multipliers are exactly 1. Classic/Flex and Premium/Business multipliers are 1–8. Active fare coverage is required for every structural cabin. IDs are immutable and not deleted. Orders are integers 0–1000. Bilingual copy is trimmed, required and bounded. Bag weights/prices are bounded.

Meals and assistance have immutable UUID-based identities, bilingual labels, active/retired status and display order. The single default meal must exist and be active; it cannot be retired before selecting another default. Retired or unknown historical IDs remain readable and may remain unchanged on their original passenger. Newly introducing an inactive/unknown ID is rejected, including moving it to another passenger. Active replacements are supported. Preferences retain stored retired IDs; new choices must be active.

## Snapshot and pure pricing

BookingPricingSnapshotV1 contains version, catalogRevision, basis (catalog/legacy), fareId/multiplier, cabinId/multiplier, checkedBags/checkedBagKg, cabinBagKg/cabinBagDims, extraBagPrice, taxRate and seatPricing. Seat pricing contains policy legacy-row-v1, standardSeatPrice 0, extraLegroomPrice 18 and extraLegroomRows [5,11,12]. Tax remains fixed at 14%; no tax editor. The snapshot contains relevant pricing facts rather than the whole catalog.

New creation samples the canonical catalog independently of UI previews, validates sellability, and commits the calculated total and snapshot together. Client total, revision and snapshot cannot override this. Because catalog and booking persistence are separate stores, catalog selection is snapshot-at-command-time rather than multi-store ACID. The resulting booking is internally consistent.

Existing updateSeats, updateExtras and completeCheckIn calculate using stored historical pricing. Extras sellability checks use the current catalog, while extra-bag charges and original airfare use the booking snapshot. Catalog changes never retroactively reprice a PNR. Snapshotless legacy bookings use literal frozen pre-6B2A values (fare 1/1.35/1.85; cabin 1/1.6/2.6; extra bag 35; original weights; tax .14; seat fees 0/18). Reads do not reprice, write or migrate. A real rewrite seals that legacy basis; a genuine Extras no-op avoids writing.

Names and service labels resolve through the current catalog including retired records; unknown historical IDs display the raw ID. Included baggage and price breakdowns use the historical snapshot. Public/Counter stale choices are preserved and directed back to Fare/Extras instead of silently substituted.

## Boundaries

Admin Products Fares/Baggage/Meals/Assistance and cabin pricing are commercial.edit mutations; commercial.view can inspect. Field validation is localized/associated; storage failure is a general alert and preserves editor input. Aircraft and seat maps remain session-only OpsState, with disclosure that they reset on reload and do not govern passenger geometry. Destinations remain session-only. No gza.ops.v1, backend, network changes, schedule materialization or flight-ID changes; deployment is owner-confirmed. Phase 6B2B is Planned / Unstarted / Next Engineering Lane; Phase 6B2C/6C/7/7B remain Planned / Unstarted.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Planned / Unstarted / Next Engineering Lane). Phase 6B2C — Network & Dated-Service Materialization (Planned / Unstarted).

## Correction 01 command boundaries

Committed submission replay is checked against canonical booking state before any catalog dependency, and repeated inside the conditional transaction. Both replay paths avoid writes and notifications. First-time submissions still require a healthy current catalog.

Booking exposes typed product commands; the generic Partial<Booking> update, React Query hook and StoreProvider writer are removed. Account Trip cancellation uses cancel() while preserving account ownership checks. A successful legacy claim seals its frozen pricing basis; rejected/idempotent claims remain no-write.

Existing normalized passenger identity adoption preserves meal preference without requiring the commercial catalog. New account creation still requires its active default meal. Home/standard flight search catches draft-reset failures, preserves criteria and prior draft, shows localized catalog/storage retry feedback and navigates only after success. No compiled default is substituted.
