/**
 * Gaza Gateway — Canonical Seat Assignment Validation
 *
 * Implements pure domain validation for passenger seat assignments across
 * BookingRepository commands (`updateSeats` and `completeCheckIn`).
 *
 * Enforces:
 * 1. Assignment keys resolve real, seat-requiring passengers on existing booking legs.
 * 2. Strict syntax: row number (1-28) followed by valid seat letter (A-F).
 * 3. In-cabin enforcement: seat must fall within the booked cabin zone.
 * 4. Deterministic availability: new/reassigned seats must be available on the canonical flight.
 * 5. Same-owner privilege: a passenger retaining their existing canonical seat bypasses
 *    availability for that seat, but no other passenger may acquire that privilege.
 * 6. Checked-in seat immutability: checked-in passengers' seat assignments (including absent seats)
 *    are strictly immutable.
 * 7. Duplicate prevention: no two passengers may occupy the same physical seat on a leg.
 * 8. Leg preservation: unrelated leg assignments are preserved.
 */

import { SEAT_LETTERS, SEAT_ROWS, cabinZone, isSeatAvailable, type Flight } from "../data.ts";
import type { Booking, Leg } from "./booking.ts";

/** Field identity for presentation; existing seat rules and error messages remain authoritative. */
export class SeatValidationError extends Error {
  readonly seatKeys: string[];
  constructor(message: string, seatKeys: string[]) {
    super(message);
    this.name = "SeatValidationError";
    this.seatKeys = seatKeys;
  }
}

export interface ParsedSeatCode {
  row: number;
  letter: (typeof SEAT_LETTERS)[number];
}

export interface ParsedSeatKey {
  leg: Leg;
  paxIndex: number;
}

/**
 * Validates canonical seat code syntax: 1-28 followed by A-F (e.g. "12A", "1B").
 */
export function isValidSeatSyntax(seat: unknown): boolean {
  return parseSeatCode(seat) !== null;
}

/**
 * Parses a seat string into row and letter, returning null if malformed.
 * Strictly requires canonical syntax: row (1-28) followed by uppercase letter (A-F)
 * with no leading zeros and no leading/trailing whitespace.
 */
export function parseSeatCode(seat: unknown): ParsedSeatCode | null {
  if (typeof seat !== "string") return null;
  const match = /^([1-9]|[12]\d)([A-F])$/.exec(seat);
  if (!match) return null;
  const row = Number.parseInt(match[1] as string, 10);
  const letter = match[2] as (typeof SEAT_LETTERS)[number];
  if (row < 1 || row > SEAT_ROWS) return null;
  if (!SEAT_LETTERS.includes(letter)) return null;
  return { row, letter };
}

/**
 * Checks whether a given row or seat string is inside the booked cabin zone.
 */
export function isSeatInCabinZone(rowOrSeat: number | string, cabin: string): boolean {
  let row: number;
  if (typeof rowOrSeat === "number") {
    row = rowOrSeat;
  } else {
    const parsed = parseSeatCode(rowOrSeat);
    if (!parsed) return false;
    row = parsed.row;
  }
  const zone = cabinZone(cabin);
  return row >= zone.firstRow && row <= zone.lastRow;
}

/**
 * Parses a canonical seat key (e.g. "out-0", "in-1") into leg and passenger index.
 * Strictly requires exact canonical format: 'out-N' or 'in-N' where N is 0 or a
 * non-zero digit followed by digits, with no leading zeros and no whitespace.
 */
export function parseSeatKey(key: unknown): ParsedSeatKey | null {
  if (typeof key !== "string") return null;
  const match = /^(out|in)-(0|[1-9]\d*)$/.exec(key);
  if (!match) return null;
  const leg = match[1] as Leg;
  const paxIndex = Number.parseInt(match[2] as string, 10);
  if (!Number.isInteger(paxIndex) || paxIndex < 0 || !Number.isSafeInteger(paxIndex)) return null;
  return { leg, paxIndex };
}

/**
 * Validates a single proposed seat assignment against booking, passenger, cabin, and flight availability.
 */
export function validateSeatAssignment({
  seat,
  paxIndex,
  leg,
  booking,
  flight,
  isSameOwnerExistingSeat,
}: {
  seat: string;
  paxIndex: number;
  leg: Leg;
  booking: Booking;
  flight: Flight;
  isSameOwnerExistingSeat: boolean;
}): void {
  try {
    // 1. Leg existence
    if (leg === "in" && !booking.inbound) {
      throw new Error(
        `Cannot assign seat on inbound leg: booking ${booking.ref} is a one-way trip.`,
      );
    }

    // 2. Passenger existence
    if (paxIndex < 0 || paxIndex >= booking.passengers.length) {
      throw new Error(`Invalid passenger index ${paxIndex} on booking ${booking.ref}.`);
    }

    const pax = booking.passengers[paxIndex];
    if (!pax) {
      throw new Error(`Passenger ${paxIndex} does not exist on booking ${booking.ref}.`);
    }

    // 3. Infant check
    if (pax.type === "infant") {
      throw new Error(
        `Cannot assign seat to infant passenger at index ${paxIndex}. Infants travel on an adult's lap.`,
      );
    }

    // 4. Seat syntax
    const parsed = parseSeatCode(seat);
    if (!parsed) {
      throw new Error(
        `Invalid seat syntax '${seat}' for passenger ${paxIndex} on leg ${leg}. Must be row (1-${SEAT_ROWS}) followed by letter (${SEAT_LETTERS.join("")}).`,
      );
    }

    // 5. Cabin zone
    const bookedCabin = booking.criteria.cabin;
    if (!isSeatInCabinZone(parsed.row, bookedCabin)) {
      const zone = cabinZone(bookedCabin);
      throw new Error(
        `Seat ${seat} is outside booked cabin zone '${bookedCabin}' (rows ${zone.firstRow}–${zone.lastRow}).`,
      );
    }

    // 6. Availability check
    // Retaining the SAME passenger's EXISTING canonical seat bypasses availability,
    // but another passenger cannot acquire that privilege.
    if (!isSameOwnerExistingSeat) {
      if (!isSeatAvailable(flight.id, parsed.row, parsed.letter)) {
        throw new Error(`Seat ${seat} is not available on flight ${flight.id}.`);
      }
    }
  } catch (error) {
    if (error instanceof Error)
      throw new SeatValidationError(error.message, [`${leg}-${paxIndex}`]);
    throw error;
  }
}

/**
 * Validates and merges proposed seat assignments for `updateSeats()`.
 * Preserves unrelated leg assignments and enforces exact checked-in immutability.
 */
export function validateUpdateSeatsAssignments(
  booking: Booking,
  proposedSeats: Record<string, string>,
  flightsOrOutbound: { outbound: Flight | null; inbound: Flight | null } | Flight | null,
  inboundArg?: Flight | null,
): Record<string, string> {
  const flights: { outbound: Flight | null; inbound: Flight | null } =
    flightsOrOutbound && typeof flightsOrOutbound === "object" && "outbound" in flightsOrOutbound
      ? flightsOrOutbound
      : { outbound: flightsOrOutbound as Flight | null, inbound: inboundArg ?? null };

  if (booking.status === "cancelled") {
    throw new Error(`Cannot update seats: booking ${booking.ref} is cancelled.`);
  }

  // 1. Validate every key and basic syntax/cabin in proposedSeats
  for (const [key, seat] of Object.entries(proposedSeats)) {
    const parsedKey = parseSeatKey(key);
    if (!parsedKey) {
      throw new Error(`Invalid seat assignment key '${key}'. Expected format 'out-0' or 'in-0'.`);
    }

    if (parsedKey.leg === "in" && !booking.inbound) {
      throw new Error(
        `Cannot assign seat on inbound leg: booking ${booking.ref} is a one-way trip.`,
      );
    }

    if (parsedKey.paxIndex < 0 || parsedKey.paxIndex >= booking.passengers.length) {
      throw new Error(`Invalid passenger index ${parsedKey.paxIndex} on booking ${booking.ref}.`);
    }

    const pax = booking.passengers[parsedKey.paxIndex];
    if (pax?.type === "infant") {
      throw new Error(
        `Cannot assign seat to infant passenger at index ${parsedKey.paxIndex}. Infants travel on an adult's lap.`,
      );
    }

    const parsed = parseSeatCode(seat);
    if (!parsed) {
      throw new SeatValidationError(
        `Invalid seat syntax '${seat}' for passenger ${parsedKey.paxIndex} on leg ${parsedKey.leg}. Must be row (1-${SEAT_ROWS}) followed by letter (${SEAT_LETTERS.join("")}).`,
        [key],
      );
    }

    const bookedCabin = booking.criteria.cabin;
    if (!isSeatInCabinZone(parsed.row, bookedCabin)) {
      const zone = cabinZone(bookedCabin);
      throw new SeatValidationError(
        `Seat ${seat} is outside booked cabin zone '${bookedCabin}' (rows ${zone.firstRow}–${zone.lastRow}).`,
        [key],
      );
    }
  }

  // 2. Build prospective next seats preserving unrelated leg assignments
  const hasOutProposed = Object.keys(proposedSeats).some((k) => parseSeatKey(k)?.leg === "out");
  const hasInProposed = Object.keys(proposedSeats).some((k) => parseSeatKey(k)?.leg === "in");

  const nextSeats: Record<string, string> = {};

  // For Outbound leg:
  if (hasOutProposed) {
    for (const [k, v] of Object.entries(proposedSeats)) {
      const parsedKey = parseSeatKey(k);
      if (parsedKey && parsedKey.leg === "out") {
        nextSeats[`out-${parsedKey.paxIndex}`] = v;
      }
    }
  } else {
    // Preserve existing outbound seats
    for (const [k, v] of Object.entries(booking.seats)) {
      const parsedKey = parseSeatKey(k);
      if (parsedKey && parsedKey.leg === "out") {
        nextSeats[`out-${parsedKey.paxIndex}`] = v;
      }
    }
  }

  // For Inbound leg:
  if (booking.inbound) {
    if (hasInProposed) {
      for (const [k, v] of Object.entries(proposedSeats)) {
        const parsedKey = parseSeatKey(k);
        if (parsedKey && parsedKey.leg === "in") {
          nextSeats[`in-${parsedKey.paxIndex}`] = v;
        }
      }
    } else {
      // Preserve existing inbound seats
      for (const [k, v] of Object.entries(booking.seats)) {
        const parsedKey = parseSeatKey(k);
        if (parsedKey && parsedKey.leg === "in") {
          nextSeats[`in-${parsedKey.paxIndex}`] = v;
        }
      }
    }
  }

  // 3. Determine changed legs by comparing prospective seat map against existing booking.seats
  const candidateLegs: Leg[] = booking.inbound ? ["out", "in"] : ["out"];
  const changedLegs = new Set<Leg>();

  for (const leg of candidateLegs) {
    let legChanged = false;
    for (let i = 0; i < booking.passengers.length; i++) {
      if (booking.passengers[i]?.type === "infant") continue;
      const key = `${leg}-${i}`;
      const currentSeat = booking.seats[key];
      const prospectiveSeat = nextSeats[key];
      if (currentSeat !== prospectiveSeat) {
        legChanged = true;
        break;
      }
    }
    if (legChanged) {
      changedLegs.add(leg);
    }
  }

  // 4. For EACH leg whose actual seat state changes, require resolvable canonical flight authority
  for (const leg of changedLegs) {
    const flight = leg === "in" ? flights.inbound : flights.outbound;
    const bookedFlight = leg === "in" ? booking.inbound : booking.outbound;
    if (!flight) {
      throw new Error(
        `Cannot update seats on ${leg === "in" ? "inbound" : "outbound"} leg: flight ${bookedFlight?.id ?? "unknown"} is unavailable.`,
      );
    }
  }

  // 5. For each proposed seat assignment on changed legs, validate availability
  for (const [key, seat] of Object.entries(proposedSeats)) {
    const parsedKey = parseSeatKey(key)!;
    const flight = parsedKey.leg === "in" ? flights.inbound : flights.outbound;
    if (flight) {
      const isSameOwnerExistingSeat =
        booking.seats[`${parsedKey.leg}-${parsedKey.paxIndex}`] === seat;
      validateSeatAssignment({
        seat,
        paxIndex: parsedKey.paxIndex,
        leg: parsedKey.leg,
        booking,
        flight,
        isSameOwnerExistingSeat,
      });
    }
  }

  // 6. Enforce exact checked-in seat immutability
  for (const leg of candidateLegs) {
    const checkedPax = booking.checkedIn?.[leg] ?? [];
    for (const paxIdx of checkedPax) {
      const key = `${leg}-${paxIdx}`;
      const currentSeat = booking.seats[key];
      const newSeat = nextSeats[key];
      if (currentSeat !== newSeat) {
        throw new SeatValidationError(
          `Cannot change seat for checked-in passenger ${paxIdx} on leg ${leg}. Current: ${currentSeat ?? "none"}, Requested: ${newSeat ?? "none"}`,
          [key],
        );
      }
    }
  }

  // 7. Duplicate physical seat check on each leg
  for (const leg of candidateLegs) {
    const seen = new Map<string, number>();
    for (let i = 0; i < booking.passengers.length; i++) {
      if (booking.passengers[i]?.type === "infant") continue;
      const s = nextSeats[`${leg}-${i}`];
      if (s) {
        const parsed = parseSeatCode(s);
        const canonicalCode = parsed ? `${parsed.row}${parsed.letter}` : s;
        const existingOwner = seen.get(canonicalCode);
        if (existingOwner !== undefined) {
          throw new SeatValidationError(
            `Duplicate seat assignment ${s} for passengers ${existingOwner} and ${i} on leg ${leg}.`,
            [`${leg}-${existingOwner}`, `${leg}-${i}`],
          );
        }
        seen.set(canonicalCode, i);
      }
    }
  }

  return nextSeats;
}

/**
 * Validates and allocates seats for `completeCheckIn()`.
 * Checks syntax, cabin zone, leg flight availability, same-owner privilege, and duplicate prevention.
 */
export function validateCheckInSeats(
  booking: Booking,
  leg: Leg,
  selectedPaxIndexes: number[],
  proposedSeats: Record<number, string> | undefined,
  flight: Flight,
): Record<string, string> {
  const nextSeats: Record<string, string> = { ...booking.seats };

  // 1. If explicit seats were provided in check-in input, validate them
  if (proposedSeats) {
    for (const [paxStr, seat] of Object.entries(proposedSeats)) {
      if (!/^(0|[1-9]\d*)$/.test(paxStr)) {
        throw new Error(`Invalid passenger index key '${paxStr}' in check-in seats.`);
      }
      const paxIndex = Number.parseInt(paxStr, 10);
      if (!Number.isInteger(paxIndex) || paxIndex < 0 || paxIndex >= booking.passengers.length) {
        throw new Error(`Invalid passenger index ${paxIndex} in check-in seats.`);
      }
      if (!selectedPaxIndexes.includes(paxIndex)) {
        throw new Error(
          `Cannot assign seat for unselected passenger index ${paxIndex} during check-in.`,
        );
      }

      const pax = booking.passengers[paxIndex];
      if (pax?.type === "infant") {
        throw new Error(
          `Cannot assign seat to infant passenger at index ${paxIndex}. Infants travel on an adult's lap.`,
        );
      }

      const key = `${leg}-${paxIndex}`;
      const isSameOwnerExistingSeat = booking.seats[key] === seat;

      // Checked-in passengers on this leg cannot change their seat via check-in
      if ((booking.checkedIn?.[leg] ?? []).includes(paxIndex)) {
        if (booking.seats[key] !== seat) {
          throw new Error(
            `Cannot change seat for checked-in passenger ${paxIndex} on leg ${leg}. Current: ${booking.seats[key] ?? "none"}, Requested: ${seat}`,
          );
        }
      }

      validateSeatAssignment({
        seat,
        paxIndex,
        leg,
        booking,
        flight,
        isSameOwnerExistingSeat,
      });

      nextSeats[key] = seat;
    }
  }

  // 2. For selected passengers without explicit seats in input, validate their existing seat if assigned
  for (const paxIndex of selectedPaxIndexes) {
    const key = `${leg}-${paxIndex}`;
    const explicit = proposedSeats?.[paxIndex];
    if (!explicit) {
      const existingSeat = booking.seats[key];
      if (existingSeat) {
        validateSeatAssignment({
          seat: existingSeat,
          paxIndex,
          leg,
          booking,
          flight,
          isSameOwnerExistingSeat: true,
        });
        nextSeats[key] = existingSeat;
      }
    }
  }

  // 3. Duplicate physical seat check on the check-in leg
  const seen = new Map<string, number>();
  for (let i = 0; i < booking.passengers.length; i++) {
    if (booking.passengers[i]?.type === "infant") continue;
    const s = nextSeats[`${leg}-${i}`];
    if (s) {
      const parsed = parseSeatCode(s);
      const canonicalCode = parsed ? `${parsed.row}${parsed.letter}` : s;
      const existingOwner = seen.get(canonicalCode);
      if (existingOwner !== undefined && existingOwner !== i) {
        throw new Error(
          `Duplicate seat assignment ${s} for passengers ${existingOwner} and ${i} on leg ${leg}.`,
        );
      }
      seen.set(canonicalCode, i);
    }
  }

  return nextSeats;
}
