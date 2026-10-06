import type { Booking } from "../domain/booking.ts";
import type { Flight } from "../data.ts";

/** Includes historical/cancelled PNRs. Booking lifecycle does not erase a physical flight. */
export function bookingFlightSnapshots(bookings: Booking[]): Flight[] {
  const flights = new Map<string, Flight>();
  for (const booking of bookings) {
    for (const flight of [booking.outbound, booking.inbound]) {
      if (flight && !flights.has(flight.id)) flights.set(flight.id, structuredClone(flight));
    }
  }
  return [...flights.values()];
}

/** Board relevance is retained by confirmed PNRs only; history keeps every snapshot. */
export function confirmedBookingFlightSnapshots(bookings: Booking[]): Flight[] {
  return bookingFlightSnapshots(bookings.filter(booking => booking.status === "confirmed"));
}
