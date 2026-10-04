/**
 * Gaza Gateway — Booking Draft Factory Functions
 *
 * Pure factory functions for creating empty/default booking draft structures.
 */

import {
  addDaysISO,
  todayISO,
} from "../data.ts";
import type {
  Contact,
  Draft,
  Extras,
  Passenger,
  PassengerType,
  PaxExtras,
  SearchCriteria,
} from "./types.ts";

export function emptyPaxExtras(meal = "standard"): PaxExtras {
  return { extraBags: 0, meal, assistance: [] };
}

export function extrasFor(extras: Extras, index: number): PaxExtras {
  return extras.pax[index] ?? emptyPaxExtras();
}

export function totalExtraBags(extras: Extras): number {
  return extras.pax.reduce((sum, p) => sum + (p?.extraBags ?? 0), 0);
}

export function extrasForPassengers(extras: Extras, count: number, meal = "standard"): Extras {
  const pax: PaxExtras[] = [];
  for (let i = 0; i < count; i += 1) {
    pax.push(extras.pax[i] ?? emptyPaxExtras(meal));
  }
  return { pax };
}

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

export { bookingTotal } from "../domain/pricing.ts";
