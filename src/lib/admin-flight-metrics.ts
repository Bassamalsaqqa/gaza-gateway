import { todayISO } from "./data.ts";
import type { Booking, Leg } from "./domain/booking.ts";
import { seatedPassengers, checkedInPax } from "./domain/booking.ts";
/** Local booking counts are independent of compiled seatsLeft snapshots. */
export function flightBookingMetrics(flightId: string, bookings: Booking[]) {
  let total = 0,
    checked = 0,
    bookingCount = 0;
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    const legs = (["out", "in"] as Leg[]).filter(
      (leg) => (leg === "out" ? booking.outbound : booking.inbound)?.id === flightId,
    );
    if (legs.length) bookingCount++;
    for (const leg of legs) {
      total += seatedPassengers(booking).length;
      checked += checkedInPax(booking, leg).length;
    }
  }
  return { total, checked, bookingCount };
}
export function dailyBookingMetrics(bookings: Booking[], stationDate: string) {
  const travelling = bookings
    .filter((booking) => booking.status !== "cancelled")
    .flatMap((booking) =>
      (["out", "in"] as Leg[]).flatMap((leg) => {
        const flight = leg === "out" ? booking.outbound : booking.inbound;
        return flight?.date === stationDate ? [{ booking, leg, flight }] : [];
      }),
    );
  return {
    travelling,
    bookingsToday: bookings.filter((booking) => todayISO(booking.createdAt) === stationDate).length,
    passengersTravelling: travelling.reduce(
      (sum, item) => sum + seatedPassengers(item.booking).length,
      0,
    ),
    passengersCheckedIn: travelling.reduce(
      (sum, item) => sum + checkedInPax(item.booking, item.leg).length,
      0,
    ),
    recent: [...bookings]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.ref.localeCompare(b.ref))
      .slice(0, 6),
  };
}
