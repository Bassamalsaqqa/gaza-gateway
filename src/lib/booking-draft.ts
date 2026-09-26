/**
 * Gaza Gateway — Booking Draft Management & Sanitization Domain Logic
 *
 * Canonical frontend rules for creating, validating, and sanitizing booking drafts.
 * Pure TypeScript domain module independent of React context or UI state.
 */

import type { Flight } from "./data.ts";
import {
  addDaysISO,
  destinationByCode,
  getSeatRequiredPaxCount,
  isFlightBookable,
  searchFlights,
  todayISO,
} from "./data.ts";

export type PassengerType = "adult" | "child" | "infant";

export type Passenger = {
  type: PassengerType;
  /** For infants: index of the accompanying adult in the passenger list. */
  withAdult?: number | undefined;
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  document: string;
};

/** Extras belong to a single passenger, not the whole booking. */
export type PaxExtras = {
  extraBags: number;
  meal: string;
  assistance: string[];
};

/** Per-passenger extras, aligned by index with the passenger list. */
export type Extras = {
  pax: PaxExtras[];
};

export function emptyPaxExtras(meal = "standard"): PaxExtras {
  return { extraBags: 0, meal, assistance: [] };
}

export function extrasFor(extras: Extras, index: number): PaxExtras {
  return extras.pax[index] ?? emptyPaxExtras();
}

export function totalExtraBags(extras: Extras): number {
  return extras.pax.reduce((sum, p) => sum + (p?.extraBags ?? 0), 0);
}

/** Grow/shrink the per-passenger extras list so it matches the passenger list. */
export function extrasForPassengers(extras: Extras, count: number, meal = "standard"): Extras {
  const pax: PaxExtras[] = [];
  for (let i = 0; i < count; i += 1) {
    pax.push(extras.pax[i] ?? emptyPaxExtras(meal));
  }
  return { pax };
}

export type Contact = {
  email: string;
  phone: string;
};

export type SearchCriteria = {
  tripType: "round" | "oneway";
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  cabin: string;
};

export type Draft = {
  entry: "search" | "results";
  criteria: SearchCriteria;
  outbound: Flight | null;
  inbound: Flight | null;
  fareId: "essential" | "classic" | "flex";
  passengers: Passenger[];
  seats: Record<string, string>;
  extras: Extras;
  contact: Contact;
};

export function emptyPassenger(type: PassengerType = "adult", withAdult?: number): Passenger {
  return {
    type,
    ...(type === "infant" ? { withAdult: withAdult ?? 0 } : {}),
    firstName: "",
    lastName: "",
    dob: "",
    nationality: "",
    document: "",
  };
}

/**
 * Passenger forms for a search: adults, then children, then infants.
 * Each infant is associated with an adult (index in the same list).
 */
export function passengersFor(criteria: SearchCriteria): Passenger[] {
  const adults = Math.max(1, criteria.adults);
  const list: Passenger[] = [];
  for (let i = 0; i < adults; i += 1) list.push(emptyPassenger("adult"));
  for (let i = 0; i < criteria.children; i += 1) list.push(emptyPassenger("child"));
  for (let i = 0; i < Math.min(criteria.infants, adults); i += 1)
    list.push(emptyPassenger("infant", i));
  return list;
}

export function defaultCriteria(departDate: string, returnDate: string): SearchCriteria {
  return {
    tripType: "round",
    origin: "GZA",
    destination: "AMM",
    departDate,
    returnDate,
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "economy",
  };
}

export function paxCount(c: SearchCriteria): number {
  return c.adults + c.children + c.infants;
}

export function initialDraft(): Draft {
  return {
    entry: "search",
    criteria: defaultCriteria("", ""),
    outbound: null,
    inbound: null,
    fareId: "classic",
    passengers: [emptyPassenger()],
    seats: {},
    extras: { pax: [emptyPaxExtras()] },
    contact: { email: "", phone: "" },
  };
}

export function createFreshDraft(
  today = todayISO(),
  ret = addDaysISO(today, 6),
): Draft {
  return {
    entry: "search",
    criteria: defaultCriteria(today, ret),
    outbound: null,
    inbound: null,
    fareId: "classic",
    passengers: [emptyPassenger()],
    seats: {},
    extras: { pax: [emptyPaxExtras()] },
    contact: { email: "", phone: "" },
  };
}

/**
 * Validates and sanitizes a raw or stored draft against real criteria and bookability rules.
 * Preserves passenger details (names, dob, document, nationality) even when route criteria change.
 * Clears unbookable flights (cancelled, past, sold out) and their dependent seats.
 */
export function validateAndSanitizeDraft(
  raw: unknown,
  clientToday = todayISO(),
  clientReturn = addDaysISO(clientToday, 6),
): Draft {
  const fallback = createFreshDraft(clientToday, clientReturn);
  if (!raw || typeof raw !== "object") return fallback;

  try {
    const rawDraft = raw as Record<string, unknown>;
    const rawCriteria = rawDraft["criteria"] as Record<string, unknown> | undefined;
    if (!rawCriteria || typeof rawCriteria !== "object") return fallback;

    const tripType = rawCriteria["tripType"] === "oneway" ? "oneway" : "round";
    let origin =
      typeof rawCriteria["origin"] === "string"
        ? rawCriteria["origin"].trim().toUpperCase()
        : "GZA";
    let destination =
      typeof rawCriteria["destination"] === "string"
        ? rawCriteria["destination"].trim().toUpperCase()
        : "AMM";

    const isKnown = (code: string) => code === "GZA" || Boolean(destinationByCode(code));
    const isValidRoute =
      isKnown(origin) && isKnown(destination) && origin !== destination && (origin === "GZA" || destination === "GZA");

    let routeReset = false;
    if (!isValidRoute) {
      origin = "GZA";
      destination = "AMM";
      routeReset = true;
    }

    const today = clientToday;
    let departDate =
      typeof rawCriteria["departDate"] === "string" ? rawCriteria["departDate"].trim() : "";
    let returnDate =
      typeof rawCriteria["returnDate"] === "string" ? rawCriteria["returnDate"].trim() : "";

    const isValidIso = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    let datesRolled = false;

    if (!isValidIso(departDate) || departDate < today) {
      departDate = today;
      datesRolled = true;
    }

    if (tripType === "round") {
      if (!isValidIso(returnDate) || returnDate < departDate || datesRolled) {
        returnDate = addDaysISO(departDate, 6);
        datesRolled = true;
      }
    } else {
      returnDate = "";
    }

    const adults =
      typeof rawCriteria["adults"] === "number" && rawCriteria["adults"] >= 1
        ? Math.floor(rawCriteria["adults"])
        : 1;
    const children =
      typeof rawCriteria["children"] === "number" && rawCriteria["children"] >= 0
        ? Math.floor(rawCriteria["children"])
        : 0;
    const infants =
      typeof rawCriteria["infants"] === "number" && rawCriteria["infants"] >= 0
        ? Math.floor(rawCriteria["infants"])
        : 0;
    const cabin =
      rawCriteria["cabin"] === "premium" || rawCriteria["cabin"] === "business"
        ? rawCriteria["cabin"]
        : "economy";

    const effectiveCriteria: SearchCriteria = {
      tripType,
      origin,
      destination,
      departDate,
      returnDate,
      adults,
      children,
      infants,
      cabin,
    };

    const totalPaxNeeded = getSeatRequiredPaxCount(effectiveCriteria);

    let validOutbound: Flight | null = null;
    let validInbound: Flight | null = null;

    // Validate outbound flight against effectiveCriteria and bookability
    const rawOut = rawDraft["outbound"] as Record<string, unknown> | null | undefined;
    if (
      !datesRolled &&
      !routeReset &&
      rawOut &&
      typeof rawOut === "object" &&
      typeof rawOut["id"] === "string" &&
      !rawOut["id"].startsWith("CAP-PROOF") &&
      typeof rawOut["originCode"] === "string" &&
      typeof rawOut["destinationCode"] === "string" &&
      typeof rawOut["date"] === "string"
    ) {
      if (
        rawOut["originCode"].toUpperCase() === origin &&
        rawOut["destinationCode"].toUpperCase() === destination &&
        rawOut["date"] === departDate
      ) {
        const availableOut = searchFlights(origin, destination, departDate);
        const match = availableOut.find((f) => f.id === rawOut["id"]);
        if (match && isFlightBookable(match, { paxCount: totalPaxNeeded })) {
          validOutbound = match;
        }
      }
    }

    // Validate inbound flight against effectiveCriteria and bookability
    const rawIn = rawDraft["inbound"] as Record<string, unknown> | null | undefined;
    if (
      !datesRolled &&
      !routeReset &&
      tripType === "round" &&
      rawIn &&
      typeof rawIn === "object" &&
      typeof rawIn["id"] === "string" &&
      !rawIn["id"].startsWith("CAP-PROOF") &&
      typeof rawIn["originCode"] === "string" &&
      typeof rawIn["destinationCode"] === "string" &&
      typeof rawIn["date"] === "string"
    ) {
      if (
        rawIn["originCode"].toUpperCase() === destination &&
        rawIn["destinationCode"].toUpperCase() === origin &&
        rawIn["date"] === returnDate
      ) {
        const availableIn = searchFlights(destination, origin, returnDate);
        const match = availableIn.find((f) => f.id === rawIn["id"]);
        if (match && isFlightBookable(match, { paxCount: totalPaxNeeded })) {
          validInbound = match;
        }
      }
    }

    // Seat assignments: only retain seats for currently valid flights
    const rawSeats =
      rawDraft["seats"] && typeof rawDraft["seats"] === "object"
        ? (rawDraft["seats"] as Record<string, unknown>)
        : {};
    const cleanSeats: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawSeats)) {
      if (typeof val !== "string") continue;
      if (key.startsWith("out-") && validOutbound) {
        cleanSeats[key] = val;
      } else if (key.startsWith("in-") && validInbound && tripType === "round") {
        cleanSeats[key] = val;
      }
    }

    // Passengers: preserve names, dob, document, nationality from raw draft
    let passengers: Passenger[] = [];
    const rawPax = rawDraft["passengers"];
    if (Array.isArray(rawPax) && rawPax.length > 0) {
      passengers = rawPax.map((p) => {
        if (!p || typeof p !== "object") return emptyPassenger();
        const pObj = p as Record<string, unknown>;
        const withAdult =
          typeof pObj["withAdult"] === "number" ? pObj["withAdult"] : undefined;
        return {
          type: pObj["type"] === "child" || pObj["type"] === "infant" ? pObj["type"] : "adult",
          ...(withAdult !== undefined ? { withAdult } : {}),
          firstName: typeof pObj["firstName"] === "string" ? pObj["firstName"] : "",
          lastName: typeof pObj["lastName"] === "string" ? pObj["lastName"] : "",
          dob: typeof pObj["dob"] === "string" ? pObj["dob"] : "",
          nationality: typeof pObj["nationality"] === "string" ? pObj["nationality"] : "PS",
          document: typeof pObj["document"] === "string" ? pObj["document"] : "",
        };
      });
    } else {
      passengers = passengersFor(effectiveCriteria);
    }

    const totalCount = adults + children + infants;
    if (passengers.length < totalCount) {
      const defaultPax = passengersFor(effectiveCriteria);
      while (passengers.length < totalCount) {
        passengers.push(defaultPax[passengers.length] ?? emptyPassenger());
      }
    } else if (passengers.length > totalCount) {
      passengers = passengers.slice(0, totalCount);
    }

    // Extras
    const rawExtras = rawDraft["extras"] as Record<string, unknown> | undefined;
    const rawExtrasPax = rawExtras?.["pax"];
    const extras: Extras = Array.isArray(rawExtrasPax)
      ? extrasForPassengers({ pax: rawExtrasPax as PaxExtras[] }, passengers.length)
      : { pax: passengers.map(() => emptyPaxExtras()) };

    // Contact details
    const rawContact = rawDraft["contact"] as Record<string, unknown> | undefined;
    const contact: Contact = {
      email: typeof rawContact?.["email"] === "string" ? rawContact["email"] : "",
      phone: typeof rawContact?.["phone"] === "string" ? rawContact["phone"] : "",
    };

    const fareId =
      rawDraft["fareId"] === "essential" || rawDraft["fareId"] === "flex"
        ? rawDraft["fareId"]
        : "classic";

    const hasCompleteFlights = Boolean(
      validOutbound && (tripType !== "round" || validInbound),
    );

    const entry: "search" | "results" =
      rawDraft["entry"] === "search" && !hasCompleteFlights ? "search" : "results";

    return {
      entry,
      criteria: effectiveCriteria,
      outbound: validOutbound,
      inbound: validInbound,
      fareId,
      passengers,
      seats: cleanSeats,
      extras,
      contact,
    };
  } catch {
    return fallback;
  }
}

export type BookingStep =
  | "search"
  | "results"
  | "fare"
  | "passengers"
  | "seats"
  | "extras"
  | "review"
  | "confirmation";

export const stepRanks: Record<BookingStep, number> = {
  search: 0,
  results: 1,
  fare: 2,
  passengers: 3,
  seats: 4,
  extras: 5,
  review: 6,
  confirmation: 7,
};

export function isFlightValidForCriteria(
  flight: Flight | null | undefined,
  origin: string,
  destination: string,
  date: string,
  options?: { paxCount?: number; now?: Date | string | number },
): flight is Flight {
  if (!flight) return false;
  return (
    flight.originCode?.toUpperCase() === origin.toUpperCase() &&
    flight.destinationCode?.toUpperCase() === destination.toUpperCase() &&
    flight.date === date &&
    isFlightBookable(flight, options)
  );
}

/**
 * Calculates the maximum allowed booking wizard step based on draft completeness and bookability.
 */
export function calculateMaxStep(
  draft: Draft,
  paxList: Passenger[] = draft.passengers,
  options?: { now?: Date | string | number },
): BookingStep {
  if (!draft.criteria.origin || !draft.criteria.destination || !draft.criteria.departDate) {
    return "search";
  }
  const effectivePax = paxList.length > 0 ? paxList : draft.passengers;
  const seatableCount = getSeatRequiredPaxCount(effectivePax);
  const opts = options?.now !== undefined ? { paxCount: seatableCount, now: options.now } : { paxCount: seatableCount };
  const outboundValid = isFlightValidForCriteria(
    draft.outbound,
    draft.criteria.origin,
    draft.criteria.destination,
    draft.criteria.departDate,
    opts,
  );
  const inboundValid =
    draft.criteria.tripType !== "round"
      ? true
      : isFlightValidForCriteria(
          draft.inbound,
          draft.criteria.destination,
          draft.criteria.origin,
          draft.criteria.returnDate,
          opts,
        );

  const hasFlights = outboundValid && inboundValid;
  if (!hasFlights) return "results";
  if (!draft.fareId) return "fare";

  const arePassengersValid =
    effectivePax.length > 0 &&
    effectivePax.every((p) => Boolean(p.firstName.trim() && p.lastName.trim() && p.dob)) &&
    /.+@.+\..+/.test(draft.contact.email.trim());
  if (!arePassengersValid) return "passengers";

  return "review";
}

export { getSeatRequiredPaxCount };
