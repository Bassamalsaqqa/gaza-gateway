import type { DatedOffering } from "./schema.ts";

export interface RankedDateAlternative {
  date: string;
  differenceDays: number;
  relative: "previous" | "next";
  offerings: DatedOffering[];
}

/**
 * Authoritative check whether an offering has physical seats remaining for a party size.
 * Fails closed on absent, malformed, non-integer, or insufficient capacity, or bookable !== true.
 */
export function isOfferingBookable(offering: DatedOffering, partySize = 1): boolean {
  if (offering.bookable !== true) return false;
  if (typeof offering.seatsRemaining !== "number" || !Number.isInteger(offering.seatsRemaining)) {
    return false;
  }
  if (offering.seatsRemaining < 1 || offering.seatsRemaining < partySize) {
    return false;
  }
  return true;
}

/**
 * Filters offerings for exact calendar date matching with sufficient bookable capacity.
 */
export function getExactOfferings(
  offerings: readonly DatedOffering[],
  targetDate: string,
  partySize = 1
): DatedOffering[] {
  return offerings.filter((o) => o.date === targetDate && isOfferingBookable(o, partySize));
}

/**
 * Finds available dates prior to targetDate, sorted closest first (descending).
 */
export function getNearestPreviousDates(availableDates: readonly string[], targetDate: string, limit = 3): string[] {
  return availableDates
    .filter((d) => d < targetDate)
    .sort()
    .reverse()
    .slice(0, limit);
}

/**
 * Finds available dates after targetDate, sorted closest first (ascending).
 */
export function getNearestNextDates(availableDates: readonly string[], targetDate: string, limit = 3): string[] {
  return availableDates
    .filter((d) => d > targetDate)
    .sort()
    .slice(0, limit);
}

/**
 * Calculates absolute calendar days between two ISO dates YYYY-MM-DD.
 */
export function calendarDayDifference(dateA: string, dateB: string): number {
  const msA = Date.UTC(Number(dateA.slice(0, 4)), Number(dateA.slice(5, 7)) - 1, Number(dateA.slice(8, 10)));
  const msB = Date.UTC(Number(dateB.slice(0, 4)), Number(dateB.slice(5, 7)) - 1, Number(dateB.slice(8, 10)));
  return Math.round((msB - msA) / 86400000);
}

/**
 * Returns alternative flight dates ranked by proximity to the searched target date.
 * Fully booked offerings or offerings with insufficient capacity for partySize
 * are never recommended or ranked as bookable.
 */
export function getRankedAlternatives(
  offerings: readonly DatedOffering[],
  availableDates: readonly string[],
  targetDate: string,
  limitPerDirection = 3,
  partySize = 1
): RankedDateAlternative[] {
  const previousDates = getNearestPreviousDates(availableDates, targetDate, limitPerDirection);
  const nextDates = getNearestNextDates(availableDates, targetDate, limitPerDirection);

  const results: RankedDateAlternative[] = [];

  for (const date of nextDates) {
    const matching = offerings.filter((o) => o.date === date && isOfferingBookable(o, partySize));
    if (matching.length > 0) {
      results.push({
        date,
        differenceDays: calendarDayDifference(targetDate, date),
        relative: "next",
        offerings: matching,
      });
    }
  }

  for (const date of previousDates) {
    const matching = offerings.filter((o) => o.date === date && isOfferingBookable(o, partySize));
    if (matching.length > 0) {
      results.push({
        date,
        differenceDays: Math.abs(calendarDayDifference(targetDate, date)),
        relative: "previous",
        offerings: matching,
      });
    }
  }

  return results.sort((a, b) => a.differenceDays - b.differenceDays || (a.relative === "next" ? -1 : 1));
}

/**
 * Verifies that a return flight is authentically valid relative to an outbound flight:
 * - Must be different offerings (outbound.id !== returnOffering.id)
 * - Must have exactly reversed route endpoints (outbound.origin === return.destination && outbound.destination === return.origin)
 * - Must have authoritative projected timestamps (departAt and arriveAt)
 * - Return departure timestamp must be strictly greater than outbound arrival timestamp (as UTC instants)
 * Fails closed on missing/invalid timestamps or mismatched routes.
 */
export function isReturnChronologyValid(outbound: DatedOffering, returnOffering: DatedOffering): boolean {
  if (!outbound?.id || !returnOffering?.id || outbound.id === returnOffering.id) {
    return false;
  }

  if (
    !outbound.originCode ||
    !outbound.destinationCode ||
    !returnOffering.originCode ||
    !returnOffering.destinationCode ||
    outbound.originCode !== returnOffering.destinationCode ||
    outbound.destinationCode !== returnOffering.originCode
  ) {
    return false;
  }

  if (!outbound.arriveAt || !returnOffering.departAt) {
    return false;
  }

  const outboundArrivalEpoch = Date.parse(outbound.arriveAt);
  const returnDepartureEpoch = Date.parse(returnOffering.departAt);

  if (Number.isNaN(outboundArrivalEpoch) || Number.isNaN(returnDepartureEpoch)) {
    return false;
  }

  return returnDepartureEpoch > outboundArrivalEpoch;
}

/**
 * Filters return offerings to only those departing after outbound arrival and having bookable capacity.
 */
export function filterValidReturnOfferings(
  returnOfferings: readonly DatedOffering[],
  outbound: DatedOffering | null,
  partySize = 1
): DatedOffering[] {
  if (!outbound) return returnOfferings.filter((ret) => isOfferingBookable(ret, partySize));
  return returnOfferings.filter((ret) => isReturnChronologyValid(outbound, ret) && isOfferingBookable(ret, partySize));
}
