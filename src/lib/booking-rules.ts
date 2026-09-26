/**
 * Gaza Gateway — Booking Correctness & Bookability Domain Rules
 *
 * Canonical frontend rules governing flight bookability, inventory checks,
 * status validation, departure time cutoff, and safe draft/selection gating.
 *
 * Status & Date Semantics:
 * - Future scheduled sellable service is bookable ("Scheduled", "OnTime", "Delayed").
 * - "Delayed" is bookable if the departure is in the future and inventory remains.
 * - "Boarding" represents active gate operations where ticket sales are closed.
 * - "Departed", "Landed", and "Cancelled" flights are strictly non-bookable.
 * - Flights with departure time in the past relative to the evaluation clock (`now`) are non-bookable.
 * - Flights with zero remaining inventory (`seatsLeft <= 0`) or insufficient seats for requested passengers are non-bookable.
 * - In accordance with international civil aviation conventions, infants under 2 travel on an adult's lap
 *   and do not occupy an allocated aircraft seat. Seat inventory checks strictly require: adults + children.
 * - Flight departure cutoffs are evaluated against the origin station's IANA timezone ("Asia/Gaza" for GZA,
 *   or the respective destination airport timezone for inbound flights), converting local departure to UTC
 *   milliseconds deterministically, independent of the visitor's local computer/browser timezone.
 */

import type { Flight, FlightStatus } from "./data";

export type FlightUnbookableReason =
  | "past"
  | "cancelled"
  | "departed"
  | "landed"
  | "boarding"
  | "sold_out"
  | "insufficient_seats";

export interface BookabilityOptions {
  /** Evaluation clock time (Date, epoch ms, or ISO string). Defaults to current system time. */
  now?: Date | string | number | undefined;
  /** Number of dedicated seats requested (excluding lap infants). Defaults to 1. */
  paxCount?: number | undefined;
  /** Departure station timezone override. Defaults to flight departure airport station timezone. */
  timeZone?: string | undefined;
}

export interface FlightBookabilityResult {
  bookable: boolean;
  reason?: FlightUnbookableReason;
  status: FlightStatus;
  seatsLeft: number;
}

/** Non-bookable flight statuses by definition */
export const NON_BOOKABLE_STATUSES: ReadonlySet<FlightStatus> = new Set([
  "Cancelled",
  "Departed",
  "Landed",
  "Boarding",
]);

/**
 * Standard project mock schedule station timezone.
 * Gaza International Airport operates in Palestine time ("Asia/Gaza", UTC+2 winter / UTC+3 summer).
 */
export const DEFAULT_STATION_TIMEZONE = "Asia/Gaza";

/**
 * Departure airport station timezones across the Gaza Gateway network.
 * Flight departure times are local to the origin station.
 */
export const STATION_TIMEZONES: Record<string, string> = {
  GZA: "Asia/Gaza",
  AMM: "Asia/Amman",
  CAI: "Africa/Cairo",
  IST: "Europe/Istanbul",
  DOH: "Asia/Qatar",
  DXB: "Asia/Dubai",
  JED: "Asia/Riyadh",
  RUH: "Asia/Riyadh",
};

/**
 * Resolves the departure station timezone for a flight.
 * Falls back to DEFAULT_STATION_TIMEZONE if the origin station is not mapped.
 */
export function getFlightDepartureTimeZone(flight: Flight): string {
  const code = flight.originCode;
  if (code && STATION_TIMEZONES[code]) {
    return STATION_TIMEZONES[code];
  }
  return DEFAULT_STATION_TIMEZONE;
}

/**
 * Converts a station local date string ("YYYY-MM-DD") and local time string ("HH:mm")
 * in the specified IANA timeZone into an absolute UTC millisecond epoch timestamp.
 *
 * This conversion is 100% deterministic and independent of the client's/visitor's
 * local computer timezone (e.g. evaluating a GZA flight in New York, London, or Tokyo
 * yields the exact same UTC epoch timestamp).
 */
export function localToUtcEpoch(
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_STATION_TIMEZONE,
): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh = 0, mm = 0] = timeStr.split(":").map(Number);
  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) return 0;

  // Initial approximation: treat the components as UTC
  const guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0);

  // Format guessUtc in the target station timezone to find the timezone offset
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const getPartsEpoch = (epoch: number): number => {
    const parts = dtf.formatToParts(new Date(epoch));
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    let hour = Number(map["hour"] ?? 0);
    if (hour === 24) hour = 0;
    return Date.UTC(
      Number(map["year"] ?? y),
      Number(map["month"] ?? m) - 1,
      Number(map["day"] ?? d),
      hour,
      Number(map["minute"] ?? mm),
      Number(map["second"] ?? 0),
    );
  };

  const targetLocal = Date.UTC(y, m - 1, d, hh, mm, 0);
  const localAtGuess = getPartsEpoch(guessUtc);
  const offset = localAtGuess - guessUtc;
  let finalUtc = targetLocal - offset;

  // Refine once for DST edge transitions
  const localAtFinal = getPartsEpoch(finalUtc);
  if (localAtFinal !== targetLocal) {
    finalUtc += targetLocal - localAtFinal;
  }
  return finalUtc;
}

/**
 * Returns departure timestamp for a flight in milliseconds UTC.
 * Combines `flight.date` ("YYYY-MM-DD") and `flight.departTime` ("HH:mm")
 * evaluated in the departure station's local timezone.
 */
export function flightDepartureEpoch(flight: Flight, timeZone?: string): number {
  const tz = timeZone ?? getFlightDepartureTimeZone(flight);
  return localToUtcEpoch(flight.date, flight.departTime, tz);
}

/**
 * Computes the number of dedicated aircraft passenger seats required for a booking party.
 * In civil aviation, infants under 2 travel on an adult's lap and do not occupy an allocated aircraft seat.
 * Thus seat requirement is: adults + children (minimum 1 seat).
 */
export function getSeatRequiredPaxCount(
  party:
    | {
        adults?: number | undefined;
        children?: number | undefined;
        infants?: number | undefined;
      }
    | readonly { type: string }[]
    | number,
): number {
  if (typeof party === "number") {
    return Math.max(1, Math.floor(party));
  }
  if (Array.isArray(party)) {
    const seatable = (party as readonly { type: string }[]).filter((p) => p.type !== "infant");
    return Math.max(1, seatable.length);
  }
  const p = party as { adults?: number; children?: number; infants?: number };
  const adults = Math.max(1, p.adults ?? 1);
  const children = Math.max(0, p.children ?? 0);
  return adults + children;
}

/**
 * Parses an evaluation clock parameter into a unix epoch timestamp (ms).
 */
function parseNowMs(now?: Date | string | number): number {
  if (now === undefined || now === null) return Date.now();
  if (typeof now === "number") return now;
  if (now instanceof Date) return now.getTime();
  const parsed = new Date(now).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Determines detailed bookability information for a flight.
 */
export function getFlightBookability(
  flight: Flight | null | undefined,
  options?: BookabilityOptions | Date | string | number,
): FlightBookabilityResult {
  if (!flight) {
    return {
      bookable: false,
      reason: "past",
      status: "Cancelled",
      seatsLeft: 0,
    };
  }

  const opts: BookabilityOptions =
    options instanceof Date || typeof options === "string" || typeof options === "number"
      ? { now: options }
      : (options ?? {});

  // 1. Terminal / Operational statuses that preclude booking (using NON_BOOKABLE_STATUSES)
  if (NON_BOOKABLE_STATUSES.has(flight.status)) {
    const reasonMap: Record<FlightStatus, FlightUnbookableReason> = {
      Cancelled: "cancelled",
      Departed: "departed",
      Landed: "landed",
      Boarding: "boarding",
      Scheduled: "cancelled",
      OnTime: "cancelled",
      Delayed: "cancelled",
    };
    return {
      bookable: false,
      reason: reasonMap[flight.status] ?? "cancelled",
      status: flight.status,
      seatsLeft: flight.seatsLeft,
    };
  }

  // 2. Past flights (departure time in origin station timezone has passed UTC instant)
  const nowMs = parseNowMs(opts.now);
  const departureMs = flightDepartureEpoch(flight, opts.timeZone);
  if (departureMs <= nowMs) {
    return {
      bookable: false,
      reason: "past",
      status: flight.status,
      seatsLeft: flight.seatsLeft,
    };
  }

  // 3. Inventory checks (paxNeeded represents seat-requiring passengers)
  const paxNeeded = getSeatRequiredPaxCount(opts.paxCount ?? 1);
  if (flight.seatsLeft <= 0) {
    return {
      bookable: false,
      reason: "sold_out",
      status: flight.status,
      seatsLeft: flight.seatsLeft,
    };
  }
  if (flight.seatsLeft < paxNeeded) {
    return {
      bookable: false,
      reason: "insufficient_seats",
      status: flight.status,
      seatsLeft: flight.seatsLeft,
    };
  }

  return {
    bookable: true,
    status: flight.status,
    seatsLeft: flight.seatsLeft,
  };
}

/**
 * Canonical boolean check: is this flight currently available for customer booking?
 */
export function isFlightBookable(
  flight: Flight | null | undefined,
  options?: BookabilityOptions | Date | string | number,
): boolean {
  return getFlightBookability(flight, options).bookable;
}

/**
 * Localized description key mapping for unbookable reasons.
 */
export function unbookableReasonLabelKey(reason?: FlightUnbookableReason): string {
  switch (reason) {
    case "cancelled":
      return "book.flightCancelled";
    case "departed":
      return "book.flightDeparted";
    case "landed":
      return "book.flightLanded";
    case "boarding":
      return "book.flightBoarding";
    case "past":
      return "book.flightPast";
    case "sold_out":
      return "book.flightSoldOut";
    case "insufficient_seats":
      return "book.flightInsufficientSeats";
    default:
      return "book.flightUnavailable";
  }
}
