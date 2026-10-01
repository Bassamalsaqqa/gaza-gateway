/**
 * Gaza Gateway — Booking Pricing Domain Calculations
 *
 * Canonical shared pricing calculation for bookings, drafts, and passenger commands.
 */

import type { Flight } from "../data.ts";
import { EXTRA_BAG_PRICE, farePrice, seatFee } from "../data.ts";
import type { Extras, SearchCriteria } from "../booking-draft/types.ts";
import { totalExtraBags } from "../booking-draft/factories.ts";
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
export function bookingTotal(draft: BookingTotalInput): BookingTotalResult {
  const pax = Math.max(1, (draft.criteria.adults ?? 1) + (draft.criteria.children ?? 0));
  const legs = [draft.outbound, draft.inbound].filter((f): f is Flight => Boolean(f));
  const fare = legs.reduce(
    (sum, leg) => sum + farePrice(leg.basePrice, draft.fareId, draft.criteria.cabin) * pax,
    0,
  );
  const taxes = Math.round(fare * 0.14);
  const seatCharges = Object.values(draft.seats ?? {}).reduce(
    (sum, seat) => (seat ? sum + seatFee(Number(seat.replace(/\D/g, ""))) : sum),
    0,
  );
  const extras = seatCharges + totalExtraBags(draft.extras) * EXTRA_BAG_PRICE;
  return { fare, taxes, extras, total: fare + taxes + extras };
}
