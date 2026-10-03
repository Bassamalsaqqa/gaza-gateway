/**
 * Gaza Gateway — Canonical Booking Domain Model
 *
 * Provides the backend-ready canonical contract for passenger bookings on
 * Palestinian Airlines services from Gaza International Airport (GZA).
 *
 * Key Architectural Decisions:
 * 1. Stable Passenger ID:
 *    Every passenger is assigned a deterministic, stable identifier `pax-${ref}-${index}`.
 *    This preserves passenger identity across seat changes, extras updates, and check-in
 *    without relying on fragile mutable array indices, while retaining the 0-based index
 *    and `withAdult` field for infant lap-seat association.
 *
 * 2. Outbound / Inbound vs Legs:
 *    Preserves `outbound: Flight` and `inbound: Flight | null` as first-class fields on
 *    the canonical `Booking` object to guarantee 100% lossless compatibility with existing
 *    public booking views, confirmation cards, manage flows, check-in, boarding passes,
 *    and admin dashboards. Canonical accessor `getBookingLegs(booking)` provides the
 *    iterable `BookingLeg[]` view for multi-leg operations.
 *
 * 3. Bidirectional Adapter:
 *    `bookingToMockBooking()` maps canonical bookings to the view model expected by
 *    Admin Bookings tables, customer profiles, and admin search, calculating computed
 *    status ("confirmed", "cancelled", "checkedin", "partial", "upcoming") deterministically.
 */

import { type Flight, todayISO } from "../data.ts";
import type {
  Contact,
  Extras,
  Passenger,
  PassengerType,
  SearchCriteria,
} from "../booking-draft.ts";
import { makePnr } from "../format.ts";
import { isFlightBookable } from "../booking-rules.ts";

export type Leg = "out" | "in";
export type BookingChannel = "web" | "desk";
export type { SearchCriteria };

/** Per-leg check-in: the passenger indexes that completed check-in on that leg. */
export type CheckedIn = { out: number[]; in: number[] };

/** Canonical Passenger with stable unique identifier. */
export interface BookingPassenger extends Passenger {
  /** Stable unique identifier (e.g. `pax-GZA4TQ-0`). */
  id: string;
}

/** Canonical Booking contract. */
export interface Booking {
  ref: string;
  createdAt: string;
  criteria: SearchCriteria;
  outbound: Flight;
  inbound: Flight | null;
  fareId: "essential" | "classic" | "flex";
  passengers: BookingPassenger[];
  seats: Record<string, string>; // "out-0" | "in-0" -> "12A"
  extras: Extras;
  contact: Contact;
  total: number;
  status: "confirmed" | "cancelled";
  checkedIn: CheckedIn;
  channel: BookingChannel;
  /** Local-only ownership: the account email this booking is linked to. */
  ownerEmail: string | null;
  /** Stable client submission identity for duplicate prevention. */
  submissionId?: string | undefined;
  /** Backward compatibility with legacy booking shape. */
  account?: boolean;
}

/** Input shape for creating a new booking in the repository. */
export interface BookingCreateInput {
  criteria: SearchCriteria;
  outbound: Flight;
  inbound?: Flight | null;
  fareId: "essential" | "classic" | "flex";
  passengers: (Passenger | BookingPassenger)[];
  seats: Record<string, string>;
  extras: Extras;
  contact: Contact;
  total: number;
  channel?: BookingChannel;
  ownerEmail?: string | null;
  submissionId?: string | undefined;
  account?: boolean;
  ref?: string;
  createdAt?: string;
  checkedIn?: CheckedIn;
  status?: "confirmed" | "cancelled";
}

export type BookingCreationFailureReason =
  | "synthetic_fixture"
  | "flight_missing"
  | "cancelled"
  | "departed"
  | "landed"
  | "boarding"
  | "past"
  | "sold_out"
  | "insufficient_seats"
  | "route_mismatch"
  | "date_mismatch"
  | "unavailable"
  | "invalid_passengers"
  | "invalid_infant"
  | "invalid_contact"
  | "invalid_seats"
  | "invalid_extras";

export class BookingCreationError extends Error {
  public override readonly name = "BookingCreationError";
  public readonly reason: BookingCreationFailureReason;
  public readonly leg?: "out" | "in" | undefined;

  constructor(reason: BookingCreationFailureReason, message: string, leg?: "out" | "in") {
    super(message);
    this.reason = reason;
    this.leg = leg;
  }
}

/** Canonical iterable leg representation. */
export interface BookingLeg {
  leg: Leg;
  flight: Flight;
  seatKeyPrefix: "out" | "in";
}

/** Generates a stable passenger ID. */
export function makePassengerId(ref: string, index: number): string {
  const cleanRef = ref.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `pax-${cleanRef}-${index}`;
}

/** Legs that actually exist on this booking. */
export function bookingLegs(booking: Pick<Booking, "inbound">): Leg[] {
  return booking.inbound ? ["out", "in"] : ["out"];
}

/** Returns the canonical iterable legs for a booking. */
export function getBookingLegs(booking: Booking): BookingLeg[] {
  const legs: BookingLeg[] = [
    { leg: "out", flight: booking.outbound, seatKeyPrefix: "out" },
  ];
  if (booking.inbound) {
    legs.push({ leg: "in", flight: booking.inbound, seatKeyPrefix: "in" });
  }
  return legs;
}

/** Passengers who occupy a seat (infants travel on an adult's lap). */
export function seatedPassengers(booking: Pick<Booking, "passengers">): number[] {
  return (booking.passengers ?? []).flatMap((p, i) =>
    p.type === "infant" ? [] : [i],
  );
}

/** Infants travelling on the lap of the given adult index. */
export function infantsWith(
  booking: Pick<Booking, "passengers">,
  adultIndex: number,
): number[] {
  return (booking.passengers ?? []).flatMap((p, i) =>
    p.type === "infant" && (p.withAdult ?? 0) === adultIndex ? [i] : [],
  );
}

/** Passenger indexes checked in on this leg. Cancelled bookings have none. */
export function checkedInPax(
  booking: Pick<Booking, "status" | "checkedIn"> | null | undefined,
  leg: Leg,
): number[] {
  if (!booking || booking.status !== "confirmed") return [];
  return booking.checkedIn?.[leg] ?? [];
}

export function isPaxCheckedIn(
  booking: Pick<Booking, "status" | "checkedIn"> | null | undefined,
  leg: Leg,
  paxIndex: number,
): boolean {
  if (!booking) return false;
  return checkedInPax(booking, leg).includes(paxIndex);
}

/** True when at least one passenger is checked in on this leg. */
export function isCheckedIn(
  booking: Pick<Booking, "status" | "checkedIn">,
  leg: Leg,
): boolean {
  return checkedInPax(booking, leg).length > 0;
}

/** Eligible passengers on this leg who have not checked in yet. */
export function openPaxForLeg(
  booking: Pick<Booking, "status" | "checkedIn" | "passengers">,
  leg: Leg,
): number[] {
  if (booking.status !== "confirmed") return [];
  const done = checkedInPax(booking, leg);
  return seatedPassengers(booking).filter((i) => !done.includes(i));
}

export function legFullyCheckedIn(
  booking: Pick<Booking, "status" | "checkedIn" | "passengers">,
  leg: Leg,
): boolean {
  return (
    booking.status === "confirmed" && openPaxForLeg(booking, leg).length === 0
  );
}

/** Legs that still have at least one passenger to check in. */
export function openLegs(booking: Booking): Leg[] {
  return bookingLegs(booking).filter(
    (leg) => openPaxForLeg(booking, leg).length > 0,
  );
}

/** True when at least one leg has at least one checked-in passenger. */
export function anyCheckedIn(booking: Booking): boolean {
  return bookingLegs(booking).some((leg) => isCheckedIn(booking, leg));
}

/** How many boarding passes this booking currently has. */
export function passCount(booking: Booking): number {
  return bookingLegs(booking).reduce(
    (sum, leg) => sum + checkedInPax(booking, leg).length,
    0,
  );
}

interface RawPaxExtraShape {
  extraBags?: unknown;
  meal?: unknown;
  assistance?: unknown;
}

interface RawExtrasShape {
  pax?: unknown;
}

interface RawContactShape {
  email?: unknown;
  phone?: unknown;
}

interface RawPassengerShape {
  id?: unknown;
  type?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  dob?: unknown;
  nationality?: unknown;
  document?: unknown;
  withAdult?: unknown;
}

interface RawBookingShape {
  ref?: unknown;
  createdAt?: unknown;
  criteria?: unknown;
  outbound?: unknown;
  inbound?: unknown;
  fareId?: unknown;
  passengers?: unknown;
  seats?: unknown;
  extras?: unknown;
  contact?: unknown;
  total?: unknown;
  status?: unknown;
  checkedIn?: unknown;
  ownerEmail?: unknown;
  submissionId?: unknown;
}

/**
 * Robust, pure normalization function. Converts any persisted or legacy
 * booking object into a strict, validated canonical `Booking`.
 */
export function normalizeBooking(raw: unknown): Booking | null {
  const b = (raw && typeof raw === "object" ? raw : {}) as RawBookingShape;
  // A valid booking must possess a non-empty reference string.
  // Normalization must never invent new random PNRs for malformed inputs.
  if (typeof b.ref !== "string" || !b.ref.trim()) {
    return null;
  }
  const ref = b.ref.trim().toUpperCase();

  // Deterministic timestamp policy for missing createdAt:
  // Derive from outbound flight date at midnight UTC if available, or static epoch.
  const deterministicFallbackDate =
    typeof (b.outbound as { date?: unknown })?.date === "string" && (b.outbound as { date: string }).date
      ? `${(b.outbound as { date: string }).date}T00:00:00.000Z`
      : "2026-01-01T00:00:00.000Z";
  const createdAt =
    typeof b.createdAt === "string" && b.createdAt.trim() ? b.createdAt.trim() : deterministicFallbackDate;
  const status: "confirmed" | "cancelled" = b.status === "cancelled" ? "cancelled" : "confirmed";
  const fareId: "essential" | "classic" | "flex" =
    b.fareId === "essential" || b.fareId === "flex" ? b.fareId : "classic";
  const ownerEmail = typeof b.ownerEmail === "string" ? b.ownerEmail.trim() : null;
  const total = typeof b.total === "number" && !isNaN(b.total) ? Math.max(0, b.total) : 0;

  if (!b.outbound || typeof b.outbound !== "object") return null;
  const outbound = b.outbound as Flight;
  const inbound = b.inbound && typeof b.inbound === "object" ? (b.inbound as Flight) : null;

  const rawPassengers = Array.isArray(b.passengers) ? b.passengers : [];
  const passengers: BookingPassenger[] = rawPassengers.map((p, idx) => {
    const rawPax = (p && typeof p === "object" ? p : {}) as RawPassengerShape;
    const pType: PassengerType =
      rawPax.type === "child" || rawPax.type === "infant" ? rawPax.type : "adult";
    const stableId =
      typeof rawPax.id === "string" && rawPax.id.trim()
        ? rawPax.id.trim()
        : makePassengerId(ref, idx);

    return {
      id: stableId,
      type: pType,
      firstName: typeof rawPax.firstName === "string" ? rawPax.firstName : "",
      lastName: typeof rawPax.lastName === "string" ? rawPax.lastName : "",
      dob: typeof rawPax.dob === "string" ? rawPax.dob : "",
      nationality: typeof rawPax.nationality === "string" ? rawPax.nationality : "Palestine",
      document: typeof rawPax.document === "string" ? rawPax.document : "",
      withAdult: typeof rawPax.withAdult === "number" ? rawPax.withAdult : undefined,
    };
  });

  const seated = passengers.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
  const asList = (value: unknown): number[] => {
    if (Array.isArray(value)) return value.filter((v): v is number => typeof v === "number");
    return value === true ? seated : [];
  };

  const storedChecked = b.checkedIn as { out?: unknown; in?: unknown } | boolean | undefined;
  const checkedIn: CheckedIn =
    typeof storedChecked === "boolean"
      ? { out: storedChecked ? seated : [], in: storedChecked ? seated : [] }
      : { out: asList(storedChecked?.out), in: asList(storedChecked?.in) };

  const rawSeats = b.seats && typeof b.seats === "object" && !Array.isArray(b.seats) ? b.seats : {};
  const seats: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawSeats as Record<string, unknown>)) {
    if (typeof k === "string" && typeof v === "string") {
      seats[k] = v;
    }
  }

  const rawContact = (b.contact && typeof b.contact === "object" ? b.contact : {}) as RawContactShape;
  const contact: Contact = {
    email: typeof rawContact.email === "string" ? rawContact.email : "",
    phone: typeof rawContact.phone === "string" ? rawContact.phone : "",
  };

  const rawExtras = (b.extras && typeof b.extras === "object" ? b.extras : {}) as RawExtrasShape;
  const rawPaxExtras = Array.isArray(rawExtras.pax) ? rawExtras.pax : [];
  const extras: Extras = {
    pax: passengers.map((_, i) => {
      const pe = (rawPaxExtras[i] && typeof rawPaxExtras[i] === "object" ? rawPaxExtras[i] : {}) as RawPaxExtraShape;
      return {
        extraBags: typeof pe.extraBags === "number" ? pe.extraBags : 0,
        meal: typeof pe.meal === "string" ? pe.meal : "standard",
        assistance: Array.isArray(pe.assistance)
          ? pe.assistance.filter((item): item is string => typeof item === "string")
          : [],
      };
    }),
  };

  const criteria = (b.criteria && typeof b.criteria === "object"
    ? b.criteria
    : {
        tripType: inbound ? "round" : "oneway",
        origin: outbound.originCode ?? "GZA",
        destination: outbound.destinationCode ?? "AMM",
        departDate: outbound.date,
        returnDate: inbound ? inbound.date : "",
        adults: passengers.filter((p) => p.type === "adult").length || 1,
        children: passengers.filter((p) => p.type === "child").length,
        infants: passengers.filter((p) => p.type === "infant").length,
        cabin: "economy",
      }) as SearchCriteria;

  return {
    ref,
    createdAt,
    criteria,
    outbound,
    inbound,
    fareId,
    passengers,
    seats,
    extras,
    contact,
    total,
    status,
    checkedIn,
    ownerEmail,
    submissionId:
      typeof b.submissionId === "string" && b.submissionId.trim() ? b.submissionId.trim() : undefined,
    channel: (b as Record<string, unknown>)["channel"] === "desk" ? "desk" : "web",
  };
}

/** Admin view model status for bookings */
export type MockBookingStatus =
  | "confirmed"
  | "cancelled"
  | "checkedin"
  | "partial"
  | "upcoming";

export interface AdaptedAdminPassenger {
  id: string;
  name: string;
  type: "adult" | "child" | "infant";
  dob: string;
  nationality: string;
  document: string;
  companion?: string;
  seatOut: string | null;
  seatIn: string | null;
  bags: number;
  meal: string;
  assistance: string | null;
  checkedOut: boolean;
  checkedIn: boolean;
}

export interface AdaptedAdminBooking {
  ref: string;
  lead: string;
  route: string;
  destination: string;
  flightOut: string;
  flightIn: string | null;
  date: string;
  returnDate: string | null;
  paxCount: number;
  fare: "Essential" | "Classic" | "Flex";
  cabin: string;
  total: number;
  status: MockBookingStatus;
  channel: "web" | "desk";
  account: boolean;
  email: string;
  phone: string;
  booked: string;
  passengers: AdaptedAdminPassenger[];
  history: { id: string; when: string; what: { en: string; ar: string } }[];
  /** Reference back to canonical source */
  canonical: Booking;
}

/**
 * Lossless adapter mapping canonical `Booking` into `AdaptedAdminBooking`
 * (structurally compatible with `MockBooking` in `src/lib/admin-mock.ts`).
 */
export function bookingToMockBooking(booking: Booking): AdaptedAdminBooking {
  const leadPax = booking.passengers[0];
  const leadName = leadPax
    ? `${leadPax.firstName} ${leadPax.lastName}`.trim() || "Lead Passenger"
    : "Lead Passenger";

  const route = `${booking.outbound.originCode} → ${booking.outbound.destinationCode}`;
  const destination = booking.outbound.destinationCode;
  const flightOut = booking.outbound.number;
  const flightIn = booking.inbound ? booking.inbound.number : null;
  const date = booking.outbound.date;
  const returnDate = booking.inbound ? booking.inbound.date : null;
  const paxCount = booking.passengers.length;

  const fare =
    booking.fareId === "essential"
      ? "Essential"
      : booking.fareId === "flex"
        ? "Flex"
        : "Classic";

  const cabin =
    booking.criteria?.cabin === "business"
      ? "Business"
      : booking.criteria?.cabin === "premium"
        ? "Premium"
        : "Economy";

  // Derive granular admin status
  let status: MockBookingStatus = "confirmed";
  if (booking.status === "cancelled") {
    status = "cancelled";
  } else if (legFullyCheckedIn(booking, "out")) {
    status = "checkedin";
  } else if (isCheckedIn(booking, "out")) {
    status = "partial";
  } else {
    // Check if flight is in the future
    const today = todayISO();
    if (booking.outbound.date > today) {
      status = "upcoming";
    } else {
      status = "confirmed";
    }
  }

  const passengers: AdaptedAdminPassenger[] = booking.passengers.map((p, i) => {
    const companionPax =
      p.type === "infant" && typeof p.withAdult === "number"
        ? booking.passengers[p.withAdult]
        : undefined;
    const companion = companionPax
      ? `${companionPax.firstName} ${companionPax.lastName}`.trim()
      : undefined;

    const paxExtra = booking.extras?.pax?.[i];
    const assistanceList = paxExtra?.assistance ?? [];

    return {
      id: p.id || `p${i + 1}`,
      name: `${p.firstName} ${p.lastName}`.trim() || `Passenger ${i + 1}`,
      type: p.type,
      dob: p.dob || "",
      nationality: p.nationality || "",
      document: p.document || "",
      ...(companion ? { companion } : {}),
      seatOut: booking.seats?.[`out-${i}`] ?? null,
      seatIn: booking.seats?.[`in-${i}`] ?? null,
      bags: paxExtra?.extraBags ?? 0,
      meal: paxExtra?.meal ?? "standard",
      assistance: assistanceList.length > 0 ? assistanceList.join(", ") : null,
      checkedOut: isPaxCheckedIn(booking, "out", i),
      checkedIn: booking.inbound ? isPaxCheckedIn(booking, "in", i) : false,
    };
  });

  const bookedDate = (booking.createdAt ?? "").slice(0, 10);
  // Only creation has a canonical event timestamp. Seats/check-in/cancellation are
  // current state, not evidence of when a mutation happened (activity log: Phase 6C).
  const history: { id: string; when: string; what: { en: string; ar: string } }[] = [];
  if (booking.createdAt && Number.isFinite(Date.parse(booking.createdAt))) {
    history.push({id:"h1", when:booking.createdAt, what:{
      en:booking.channel === "desk" ? "Booking created at the desk." : "Booking created on the website.",
      ar:booking.channel === "desk" ? "أُنشئ الحجز من المكتب." : "أُنشئ الحجز من الموقع.",
    }});
  }

  return {
    ref: booking.ref,
    lead: leadName,
    route,
    destination,
    flightOut,
    flightIn,
    date,
    returnDate,
    paxCount,
    fare,
    cabin,
    total: booking.total,
    status,
    channel: booking.channel || "web",
    account: Boolean(booking.ownerEmail || (booking as { account?: boolean }).account),
    email: booking.contact?.email ?? "",
    phone: booking.contact?.phone ?? "",
    booked: bookedDate,
    passengers,
    history,
    canonical: booking,
  };
}
