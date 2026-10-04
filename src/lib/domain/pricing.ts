/**
 * Gaza Gateway — Booking Pricing Domain Calculations
 *
 * Canonical shared pricing calculation for bookings, drafts, and passenger commands.
 */

import type { Flight } from "../data.ts";

import type { Extras, SearchCriteria } from "../booking-draft/types.ts";
import { calculateBookingTotal, resolveBookingPricing } from "../commercial/pricing.ts";
import type { BookingPricingSnapshotV1 } from "../commercial/types.ts";
import type { Booking } from "./booking.ts";

export interface BookingTotalInput {
  outbound: Flight | null;
  inbound: Flight | null;
  fareId: Booking["fareId"];
  criteria: SearchCriteria;
  seats: Record<string, string>;
  extras: Extras;
}

export interface BookingTotalResult {
  fare: number;
  taxes: number;
  extras: number;
  total: number;
}

/**
 * Computes fare, taxes, seat fees, baggage/extras fees, and grand total
 * deterministically from current booking criteria, selected flights, seats, and extras.
 */
/** Default resolution is frozen legacy compatibility, never current catalog authority.
 * New previews/writers must pass an explicit current snapshot. Historical writers resolve the PNR basis. */
export function bookingTotal(draft: BookingTotalInput & { pricingSnapshot?: BookingPricingSnapshotV1 | undefined }, basis: BookingPricingSnapshotV1 = resolveBookingPricing(draft)): BookingTotalResult {
 return calculateBookingTotal(draft, basis);
}
