import type { Extras } from "../booking-draft/types.ts";
import type { BookingTotalInput, BookingTotalResult } from "../domain/pricing.ts";
import { legacyPricingBasis } from "./seed.ts";
import {
  CommercialCatalogError,
  type CommercialCatalog,
  type CommercialCatalogSnapshot,
  type BookingPricingSnapshotV1,
  type FareId,
} from "./types.ts";
export function pricingSnapshot(
  snapshot: CommercialCatalogSnapshot,
  fareId: FareId,
  cabinId: string,
): BookingPricingSnapshotV1 {
  const fare = snapshot.catalog.fares.find((f) => f.id === fareId);
  const cabin = snapshot.catalog.cabins.find((c) => c.id === cabinId);
  if (!fare?.active || !cabin || !fare.allowedCabins.includes(cabin.id))
    throw new CommercialCatalogError("fare_unavailable");
  return {
    ...legacyPricingBasis(fareId, cabinId),
    basis: "catalog",
    catalogRevision: snapshot.revision,
    fareMultiplier: fare.multiplier,
    cabinMultiplier: cabin.multiplier,
    checkedBags: fare.checkedBags,
    checkedBagKg: snapshot.catalog.baggage.checkedKg,
    cabinBagKg: snapshot.catalog.baggage.cabinKg,
    cabinBagDims: snapshot.catalog.baggage.cabinDims,
    extraBagPrice: snapshot.catalog.baggage.extraBagPrice,
  };
}
export function resolveBookingPricing(booking: {
  fareId: FareId;
  criteria: { cabin: string };
  pricingSnapshot?: BookingPricingSnapshotV1 | undefined;
}): BookingPricingSnapshotV1 {
  return structuredClone(
    booking.pricingSnapshot ?? legacyPricingBasis(booking.fareId, booking.criteria.cabin),
  );
}
export function pricePerPassenger(base: number, basis: BookingPricingSnapshotV1): number {
  return Math.round(base * basis.fareMultiplier * basis.cabinMultiplier);
}
export function calculateBookingTotal(
  facts: BookingTotalInput,
  basis: BookingPricingSnapshotV1,
): BookingTotalResult {
  const pax = Math.max(1, (facts.criteria.adults ?? 1) + (facts.criteria.children ?? 0));
  const fare = [facts.outbound, facts.inbound].reduce(
    (sum, f) => sum + (f ? pricePerPassenger(f.basePrice, basis) * pax : 0),
    0,
  );
  const taxes = Math.round(fare * basis.taxRate);
  const seats = Object.values(facts.seats ?? {}).reduce(
    (sum, seat) => sum + (seat ? snapshotSeatFee(seat, basis) : 0),
    0,
  );
  const extras =
    seats + facts.extras.pax.reduce((sum, p) => sum + (p?.extraBags ?? 0) * basis.extraBagPrice, 0);
  return { fare, taxes, extras, total: fare + taxes + extras };
}
/** Retired/unknown historical IDs may remain on the same passenger, never be newly introduced. */
export function validateServiceSelections(
  extras: Extras,
  catalog: CommercialCatalog,
  previous?: Extras,
): void {
  extras.pax.forEach((p, i) => {
    const old = previous?.pax[i];
    const meal = catalog.meals.find((m) => m.id === p.meal);
    if ((!meal || !meal.active) && old?.meal !== p.meal)
      throw new CommercialCatalogError("service_unavailable", {
        [`pax.${i}.meal`]: "commercial.error.service_unavailable",
      });
    p.assistance.forEach((id) => {
      const a = catalog.assistance.find((a) => a.id === id);
      if ((!a || !a.active) && !old?.assistance.includes(id))
        throw new CommercialCatalogError("service_unavailable", {
          [`pax.${i}.assistance`]: "commercial.error.service_unavailable",
        });
    });
  });
}
export function serviceOptions(options: CommercialCatalog["meals"], retained: string[] = []) {
  const known = new Set(options.map((o) => o.id));
  const unknown = retained
    .filter((id) => id && !known.has(id))
    .map((id) => ({ id, label: { en: id, ar: id }, active: false, order: 1000 }));
  return [...options.filter((o) => o.active || retained.includes(o.id)), ...unknown].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

/** Current-catalog previews are never persisted as authority. */
export function commercialFarePrice(
  snapshot: CommercialCatalogSnapshot,
  base: number,
  fareId: FareId,
  cabinId: string,
): number {
  const fare = snapshot.catalog.fares.find((f) => f.id === fareId);
  const cabin = snapshot.catalog.cabins.find((c) => c.id === cabinId);
  if (!fare || !cabin) throw new CommercialCatalogError("fare_unavailable");
  return Math.round(base * fare.multiplier * cabin.multiplier);
}
export function previewBookingTotal(
  facts: BookingTotalInput,
  snapshot: CommercialCatalogSnapshot | undefined,
): BookingTotalResult | null {
  if (!snapshot) return null;
  try {
    return calculateBookingTotal(
      facts,
      pricingSnapshot(snapshot, facts.fareId, facts.criteria.cabin),
    );
  } catch {
    return null;
  }
}

export function snapshotSeatFee(seat: string, basis: BookingPricingSnapshotV1): number {
  return basis.seatPricing.extraLegroomRows.includes(Number(seat.replace(/\D/g, "")))
    ? basis.seatPricing.extraLegroomPrice
    : basis.seatPricing.standardSeatPrice;
}
