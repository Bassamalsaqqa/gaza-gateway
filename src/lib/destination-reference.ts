import { destinations, destinationByCode } from "./data.ts";

/** Frozen operational seed facts only. Runtime Network edits use NetworkRepository. */
export const compiledNetworkReference = destinations.map(({ code, name, city, country, tz, flightMinutes }) => ({
  code, airportName: { ...name }, city: { ...city }, country: { ...country },
  timezone: tz, blockMinutes: flightMinutes, active: true,
}));

/** Read-only legacy merchandising/editorial facts; never a Network mutation input. */
export function legacyDestinationPresentationByCode(code: string) {
  const d = destinationByCode(code);
  if (!d) return null;
  return {
    priceFrom: d.priceFrom, blurb: d.blurb, goodToKnow: d.goodToKnow,
    // Exact existing compiled public head metadata; that route remains unchanged in C1.
    seoTitle: `${d.city.en} (${d.code}) from Gaza — Palestinian Airlines`,
    seoDescription: `Palestinian Airlines flies from Gaza International Airport to ${d.city.en}. Flight time, weekly schedule, fares and booking.`,
  };
}

/** Read-only merchandising fixture; Network and Schedule never persist route prices. */
export function routeBasePriceByCode(code: string): number | null {
  return destinationByCode(code)?.priceFrom ?? null;
}
