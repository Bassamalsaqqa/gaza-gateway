/**
 * Gaza Gateway — Booking Draft Pure Structural Sanitization
 *
 * Provides purely structural sanitization for search criteria, passenger lists,
 * extras, contact info, seats, and flight snapshot containers.
 *
 * INVARIANT: This module never performs static or operational flight lookups.
 * Operational validation and bookability checks are strictly handled by
 * `reconcileDraft()` via the canonical `FlightRepository`.
 */

import { addDaysISO, destinationByCode, todayISO, type Flight } from "../data.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
import {
  createFreshDraft,
  defaultCriteria,
  emptyPassenger,
  emptyPaxExtras,
  extrasForPassengers,
  passengersFor,
} from "./factories.ts";
import type {
  Contact,
  Draft,
  Extras,
  Passenger,
  PassengerType,
  PaxExtras,
  SearchCriteria,
} from "./types.ts";

export function sanitizeSearchCriteria(
  raw: unknown,
  clientToday = todayISO(),
  clientReturn = addDaysISO(clientToday, 6),
): SearchCriteria {
  const fallback = defaultCriteria(clientToday, clientReturn);
  if (!raw || typeof raw !== "object") return fallback;

  const r = raw as Record<string, unknown>;

  const tripType = r["tripType"] === "oneway" ? "oneway" : "round";
  const origin = typeof r["origin"] === "string" ? r["origin"].trim().toUpperCase() : fallback.origin;
  const destination =
    typeof r["destination"] === "string" ? r["destination"].trim().toUpperCase() : fallback.destination;

  // Validate station codes: at least one must be GZA, and they cannot be identical
  const isValidRoute =
    (origin === "GZA" || destination === "GZA") &&
    origin !== destination &&
    Boolean(origin) &&
    Boolean(destination);

  const effectiveOrigin = isValidRoute ? origin : fallback.origin;
  const effectiveDest = isValidRoute ? destination : fallback.destination;

  // Dates
  let departDate =
    typeof r["departDate"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r["departDate"])
      ? r["departDate"]
      : clientToday;

  let datesRolled = false;
  if (!departDate || departDate < clientToday) {
    departDate = clientToday;
    datesRolled = true;
  }

  let returnDate =
    typeof r["returnDate"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r["returnDate"])
      ? r["returnDate"]
      : clientReturn;

  if (tripType === "round") {
    if (!returnDate || returnDate < departDate || (datesRolled && returnDate < clientToday)) {
      returnDate = clientReturn;
    }
  } else {
    returnDate = "";
  }

  // Passenger counts
  const adults = typeof r["adults"] === "number" && r["adults"] >= 1 ? Math.min(9, Math.floor(r["adults"])) : 1;
  const children =
    typeof r["children"] === "number" && r["children"] >= 0 ? Math.min(8, Math.floor(r["children"])) : 0;
  const infants =
    typeof r["infants"] === "number" && r["infants"] >= 0
      ? Math.min(adults, Math.floor(r["infants"]))
      : 0;

  const cabin =
    r["cabin"] === "premium" || r["cabin"] === "business" ? r["cabin"] : "economy";

  return {
    tripType,
    origin: effectiveOrigin,
    destination: effectiveDest,
    departDate,
    returnDate,
    adults,
    children,
    infants,
    cabin,
  };
}

export function sanitizePassenger(raw: unknown, defaultType: PassengerType = "adult"): Passenger {
  if (!raw || typeof raw !== "object") return emptyPassenger(defaultType);
  const p = raw as Record<string, unknown>;
  const type: PassengerType =
    p["type"] === "child" || p["type"] === "infant" ? p["type"] : "adult";
  const withAdult =
    typeof p["withAdult"] === "number" ? Math.max(0, Math.floor(p["withAdult"])) : undefined;

  return {
    type,
    ...(type === "infant" && withAdult !== undefined ? { withAdult } : {}),
    firstName: typeof p["firstName"] === "string" ? p["firstName"].trim() : "",
    lastName: typeof p["lastName"] === "string" ? p["lastName"].trim() : "",
    dob: typeof p["dob"] === "string" ? p["dob"].trim() : "",
    nationality: typeof p["nationality"] === "string" && p["nationality"].trim() ? p["nationality"].trim() : "PS",
    document: typeof p["document"] === "string" ? p["document"].trim() : "",
  };
}

export function sanitizePassengers(raw: unknown, criteria: SearchCriteria): Passenger[] {
  const totalCount = criteria.adults + criteria.children + criteria.infants;
  const defaultList = passengersFor(criteria);

  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultList;
  }

  const result: Passenger[] = [];
  for (let i = 0; i < totalCount; i += 1) {
    const rawPax = raw[i];
    const defaultPax = defaultList[i] ?? emptyPassenger("adult");
    if (rawPax && typeof rawPax === "object") {
      const sanitized = sanitizePassenger(rawPax, defaultPax.type);
      // Ensure type strictly conforms to slot definition
      result.push({
        ...sanitized,
        type: defaultPax.type,
        withAdult: defaultPax.type === "infant" ? (sanitized.withAdult ?? defaultPax.withAdult ?? 0) : undefined,
      });
    } else {
      result.push(defaultPax);
    }
  }

  return result;
}

export function sanitizeExtras(raw: unknown, count: number): Extras {
  if (!raw || typeof raw !== "object") {
    return { pax: Array.from({ length: count }, () => emptyPaxExtras()) };
  }
  const rawObj = raw as Record<string, unknown>;
  const rawPax = rawObj["pax"];
  if (!Array.isArray(rawPax)) {
    return { pax: Array.from({ length: count }, () => emptyPaxExtras()) };
  }
  return extrasForPassengers({ pax: rawPax as PaxExtras[] }, count);
}

export function sanitizeContact(raw: unknown): Contact {
  if (!raw || typeof raw !== "object") return { email: "", phone: "" };
  const r = raw as Record<string, unknown>;
  return {
    email: typeof r["email"] === "string" ? r["email"].trim() : "",
    phone: typeof r["phone"] === "string" ? r["phone"].trim() : "",
  };
}

export function sanitizeSeats(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string" && (key.startsWith("out-") || key.startsWith("in-"))) {
      clean[key] = val.trim().toUpperCase();
    }
  }
  return clean;
}

export function sanitizeFlightSnapshot(raw: unknown): Flight | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  if (
    typeof f["id"] !== "string" ||
    typeof f["number"] !== "string" ||
    typeof f["originCode"] !== "string" ||
    typeof f["destinationCode"] !== "string" ||
    typeof f["date"] !== "string" ||
    typeof f["basePrice"] !== "number"
  ) {
    return null;
  }
  return f as unknown as Flight;
}

/**
 * Pure structural sanitization of a draft object.
 * Guarantees a well-formed Draft object without calling static schedule tables or overrides.
 */
export function sanitizeDraftStructure(
  raw: unknown,
  clientToday = todayISO(),
  clientReturn = addDaysISO(clientToday, 6),
): Draft {
  const fallback = createFreshDraft(clientToday, clientReturn);
  if (!raw || typeof raw !== "object") return fallback;

  const criteria = sanitizeSearchCriteria(
    (raw as Record<string, unknown>)["criteria"],
    clientToday,
    clientReturn,
  );

  const rawObj = raw as Record<string, unknown>;

  const passengers = sanitizePassengers(rawObj["passengers"], criteria);
  const seats = sanitizeSeats(rawObj["seats"]);
  const extras = sanitizeExtras(rawObj["extras"], passengers.length);
  const contact = sanitizeContact(rawObj["contact"]);

  const fareId =
    rawObj["fareId"] === "essential" || rawObj["fareId"] === "flex"
      ? rawObj["fareId"]
      : "classic";

  let outbound = sanitizeFlightSnapshot(rawObj["outbound"]);
  if (
    outbound &&
    ((outbound.id.startsWith("CAP-PROOF") && !isStudioPreviewActive()) ||
      outbound.originCode.toUpperCase() !== criteria.origin ||
      outbound.destinationCode.toUpperCase() !== criteria.destination ||
      outbound.date !== criteria.departDate)
  ) {
    outbound = null;
  }

  let inbound = criteria.tripType === "round" ? sanitizeFlightSnapshot(rawObj["inbound"]) : null;
  if (
    inbound &&
    ((inbound.id.startsWith("CAP-PROOF") && !isStudioPreviewActive()) ||
      inbound.originCode.toUpperCase() !== criteria.destination ||
      inbound.destinationCode.toUpperCase() !== criteria.origin ||
      inbound.date !== criteria.returnDate)
  ) {
    inbound = null;
  }

  const cleanSeats: Record<string, string> = {};
  for (const [key, val] of Object.entries(seats)) {
    if (key.startsWith("out-") && outbound) {
      cleanSeats[key] = val;
    } else if (key.startsWith("in-") && inbound && criteria.tripType === "round") {
      cleanSeats[key] = val;
    }
  }

  const hasCompleteFlights = Boolean(
    outbound && (criteria.tripType !== "round" || inbound),
  );
  const entry: "search" | "results" =
    rawObj["entry"] === "search" && !hasCompleteFlights
      ? "search"
      : rawObj["entry"] === "results"
        ? "results"
        : "search";

  return {
    entry,
    criteria,
    outbound,
    inbound,
    fareId,
    passengers,
    seats: cleanSeats,
    extras,
    contact,
  };
}
