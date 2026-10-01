/**
 * Gaza Gateway — Booking Draft Management & Sanitization Domain Logic
 *
 * Canonical frontend rules for creating, validating, and sanitizing booking drafts.
 * Pure TypeScript domain module independent of React context or UI state.
 */

import type { Flight } from "./data.ts";
import {
  addDaysISO,
  getSeatRequiredPaxCount,
  isFlightBookable,
  todayISO,
} from "./data.ts";
import { sanitizeDraftStructure } from "./booking-draft/sanitization.ts";

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
  departDate = addDaysISO(todayISO(), 1),
  returnDate = addDaysISO(departDate, 7),
): Draft {
  return {
    entry: "search",
    criteria: defaultCriteria(departDate, returnDate),
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
 * Validates and sanitizes a raw or stored draft structurally.
 * Preserves passenger details (names, dob, document, nationality) even when route criteria change.
 * Structural sanitization is independent of static schedule tables; operational validation
 * is handled by `reconcileDraft` through the canonical repository.
 */
export function validateAndSanitizeDraft(
  raw: unknown,
  clientToday = todayISO(),
  clientReturn = addDaysISO(clientToday, 6),
): Draft {
  return sanitizeDraftStructure(raw, clientToday, clientReturn);
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

/**
 * Merges updated draft into existing legacy envelope while preserving
 * existing keys (account, travelers, bookings, unknown keys) semantically
 * and keeping absent keys absent. Retained for migration reference and rollback.
 */
export function buildLegacyStoreEnvelope(
  originalEnvelope: Record<string, unknown> | null,
  draft: Draft,
): Record<string, unknown> {
  const base =
    originalEnvelope && typeof originalEnvelope === "object" && !Array.isArray(originalEnvelope)
      ? originalEnvelope
      : {};
  return {
    ...base,
    draft,
  };
}

export { getSeatRequiredPaxCount };
export { sanitizeDraftStructure };
export * from "./booking-draft/index.ts";
