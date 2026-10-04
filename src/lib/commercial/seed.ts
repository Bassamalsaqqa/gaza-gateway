/** Frozen pre-6B2A compiled baseline: seed/migration only, never live authority. */
import { fares, cabins, mealOptions, assistanceOptions, EXTRA_BAG_PRICE } from "../data.ts";
import type { CommercialCatalog, BookingPricingSnapshotV1, FareId, CabinId } from "./types.ts";
export function seedCommercialCatalog(): CommercialCatalog {
  return structuredClone({
    fares: fares.map((f, order) => ({
      ...f,
      active: true,
      allowedCabins: ["economy", "premium", "business"] as CabinId[],
      order,
    })),
    cabins: cabins.map(({ id, multiplier }) => ({ id, multiplier })),
    baggage: {
      cabinKg: 7,
      cabinDims: "55 × 40 × 20 cm",
      checkedKg: 23,
      extraBagPrice: EXTRA_BAG_PRICE,
      note: {
        en: "Every fare includes one cabin bag. Checked allowance depends on the fare chosen.",
        ar: "تشمل كل أجرة حقيبة كابينة واحدة. يعتمد وزن الأمتعة المسجلة على الأجرة المختارة.",
      },
    },
    meals: mealOptions.map((m, order) => ({ ...m, active: true, order })),
    defaultMealId: "standard",
    assistance: assistanceOptions.map((a, order) => ({ ...a, active: true, order })),
  });
}
/** Literal frozen pricing facts: future data.ts/catalog edits cannot alter old PNRs. */
export function legacyPricingBasis(fareId: FareId, cabinId: string): BookingPricingSnapshotV1 {
  const fare = {
    essential: { multiplier: 1, bags: 0 },
    classic: { multiplier: 1.35, bags: 1 },
    flex: { multiplier: 1.85, bags: 2 },
  }[fareId];
  const cabin: CabinId = cabinId === "premium" || cabinId === "business" ? cabinId : "economy";
  return {
    version: 1,
    catalogRevision: 0,
    basis: "legacy",
    fareId,
    fareMultiplier: fare.multiplier,
    cabinId: cabin,
    cabinMultiplier: { economy: 1, premium: 1.6, business: 2.6 }[cabin],
    checkedBags: fare.bags,
    checkedBagKg: 23,
    cabinBagKg: 7,
    cabinBagDims: "55 × 40 × 20 cm",
    extraBagPrice: 35,
    taxRate: 0.14,
    seatPricing: {
      policy: "legacy-row-v1",
      standardSeatPrice: 0,
      extraLegroomPrice: 18,
      extraLegroomRows: [5, 11, 12],
    },
  };
}
