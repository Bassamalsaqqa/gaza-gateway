import { type Flight } from "../data.ts";
import { type Booking, type Leg, checkedInPax, infantsWith, isPaxCheckedIn } from "./booking.ts";

/** Facts supported by the current booking and flight models. No barcode or boarding-time claim. */
export interface BoardingPassData {
  bookingRef: string;
  passengerId: string;
  passengerName: string;
  passengerType: Booking["passengers"][number]["type"];
  accompanyingInfantNames: string[];
  leg: Leg;
  flightId: string;
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  date: string;
  scheduledDepartureTime: string;
  revisedDepartureTime?: string;
  terminal?: string;
  gate?: string;
  seat?: string;
  cabin: Booking["criteria"]["cabin"];
  fareId: Booking["fareId"];
}

export function getBoardingPassData(
  booking: Booking,
  leg: Leg,
  paxIndex: number,
  effectiveFlight?: Flight & { revisedDepart?: string },
): BoardingPassData | null {
  const bookedFlight = leg === "in" ? booking.inbound : booking.outbound;
  const passenger = booking.passengers[paxIndex];
  if (
    !bookedFlight ||
    !passenger ||
    passenger.type === "infant" ||
    booking.status !== "confirmed" ||
    !isPaxCheckedIn(booking, leg, paxIndex) ||
    (effectiveFlight && effectiveFlight.id !== bookedFlight.id)
  ) return null;

  const flight = effectiveFlight ?? bookedFlight;
  const data: BoardingPassData = {
    bookingRef: booking.ref,
    passengerId: passenger.id,
    passengerName: `${passenger.lastName} / ${passenger.firstName}`,
    passengerType: passenger.type,
    accompanyingInfantNames: infantsWith(booking, paxIndex).map((index) => {
      const infant = booking.passengers[index];
      return `${infant?.firstName ?? ""} ${infant?.lastName ?? ""}`.trim();
    }),
    leg,
    flightId: flight.id,
    flightNumber: flight.number,
    originCode: flight.originCode,
    destinationCode: flight.destinationCode,
    date: flight.date,
    scheduledDepartureTime: bookedFlight.departTime,
    cabin: booking.criteria.cabin,
    fareId: booking.fareId,
  };
  if (effectiveFlight?.revisedDepart) data.revisedDepartureTime = effectiveFlight.revisedDepart;
  if (flight.terminal) data.terminal = flight.terminal;
  if (flight.gate) data.gate = flight.gate;
  const seat = booking.seats[`${leg}-${paxIndex}`];
  if (seat) data.seat = seat;
  return data;
}

/** Existing prototype pass presentation fields; separate from canonical facts above. */
export type BoardingPassViewModel = {
  ref: string;
  leg: Leg;
  paxIndex: number;
  passengerName: string;
  isInfant: boolean;
  infantNames: string[];
  flight: Flight;
  seat: string | null;
  sequence: number;
  totalCheckedIn: number;
  boardingTime: string;
  fareId: string;
};

export function flightForLeg(booking: Booking, leg: Leg): Flight {
  return leg === "in" && booking.inbound ? booking.inbound : booking.outbound;
}

export function computeBoardingTime(departTime: string): string {
  const [h, m] = departTime.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return departTime;
  const total = (h * 60 + m - 45 + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function buildBoardingPassViewModel(
  booking: Booking,
  leg: Leg,
  paxIndex: number,
  effectiveFlight?: Flight
): BoardingPassViewModel {
  const passenger = booking.passengers[paxIndex];
  if (!passenger) {
    throw new Error(`Passenger at index ${paxIndex} not found in booking ${booking.ref}`);
  }
  if (passenger.type === "infant") {
    throw new Error(`Cannot generate boarding pass for infant passenger directly`);
  }
  if (!isPaxCheckedIn(booking, leg, paxIndex)) {
    throw new Error(`Passenger at index ${paxIndex} is not checked in for leg ${leg}`);
  }
  if (leg === "in" && !booking.inbound) {
    throw new Error(`Cannot generate inbound boarding pass for one-way booking ${booking.ref}`);
  }

  const infantIdxs = infantsWith(booking, paxIndex);
  const infantNames = infantIdxs.map(i => {
    const inf = booking.passengers[i];
    return `${inf?.firstName ?? ""} ${inf?.lastName ?? ""}`.trim();
  });

  const flight = effectiveFlight ?? flightForLeg(booking, leg);
  if (!getBoardingPassData(booking, leg, paxIndex, flight)) {
    throw new Error(`Boarding pass data is unavailable for ${booking.ref}`);
  }
  const seat = booking.seats[`${leg}-${paxIndex}`] ?? null;
  const checkedForLeg = checkedInPax(booking, leg);
  const sequence = Math.max(1, checkedForLeg.indexOf(paxIndex) + 1);

  return {
    ref: booking.ref,
    leg,
    paxIndex,
    passengerName: `${passenger.lastName} / ${passenger.firstName}`,
    isInfant: false,
    infantNames,
    flight,
    seat,
    sequence,
    totalCheckedIn: checkedForLeg.length,
    boardingTime: computeBoardingTime(flight.departTime),
    fareId: booking.fareId,
  };
}
