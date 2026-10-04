/**
 * Gaza Gateway — Repository Interfaces & Contracts
 *
 * Defines asynchronous, backend-ready repository contracts for:
 * 1. BookingRepository: Canonical aggregate root for bookings, passengers, seats, check-in.
 * 2. FlightRepository: Canonical aggregate root for flights and operational overrides.
 */

import type { Booking, BookingCreateInput, Leg } from "../domain/booking.ts";
import type { Extras } from "../booking-draft/types.ts";
import type { Flight, FlightOverride } from "../domain/flight.ts";

export interface CheckInCommandInput {
  ref: string;
  leg: Leg;
  selectedPaxIndexes: number[];
  documents: Record<number, string>;
  seats?: Record<number, string>;
  now?: Date | string | number;
}

export interface UndoCheckInCommandInput {
  ref: string;
  leg: Leg;
  selectedPaxIndexes: number[];
}

export interface BookingRepository {
  /** Retrieves all confirmed and cancelled bookings. */
  list(): Promise<Booking[]>;

  /** Retrieves a single booking by reference (case-insensitive). */
  getByRef(ref: string): Promise<Booking | null>;

  /** Creates and persists a new booking with stable passenger IDs. */
  create(data: BookingCreateInput): Promise<Booking>;

  /** Cancels a confirmed booking. Idempotently returns booking if already cancelled. Rejects if booking not found. */
  cancel(ref: string): Promise<Booking>;

  /** Updates passenger contact details. Rejects if booking is cancelled or invalid email. */
  updateContact(ref: string, contact: { email: string; phone?: string }): Promise<Booking>;

  /** Updates seat assignments and canonically recalculates totals. Rejects if booking cancelled, modifying checked-in seats, invalid seat format/cabin/availability, duplicate seats, or infant/invalid passenger. */
  updateSeats(ref: string, seats: Record<string, string>): Promise<Booking>;

  /** Updates passenger extras and canonically recalculates totals. Rejects if booking cancelled. */
  updateExtras(ref: string, extras: Extras): Promise<Booking>;

  /** Atomically completes check-in for selected passengers, validating window, flight status, duplicate indexes, passenger eligibility, documents, and seats. Returns idempotent booking if identical request is resubmitted. */
  completeCheckIn(input: CheckInCommandInput): Promise<Booking>;

  /**
   * Undoes check-in for selected passenger indexes on a given leg.
   * Removes only selected checkedIn indexes; preserves documents, seats, Extras, other leg, contact and price.
   * Rejects if booking is cancelled or leg invalid.
   * No-op (no write/revision/notification) if selected passengers are already not checked in.
   */
  undoCheckIn(input: UndoCheckInCommandInput): Promise<Booking>;

  /** Marks specific passenger indices as checked in on the given leg (generic internal method). */
  checkIn(ref: string, leg: Leg, paxIndexes: number[]): Promise<Booking | null>;

  /**
   * Links a booking to an account email with explicit status:
   * - "claimed": unowned booking with matching contact email was claimed
   * - "already-owned-by-user": already owned by this normalized account (idempotent)
   * - "not-found": booking does not exist
   * - "owned-by-another": booking is already owned by a different account
   * - "contact-mismatch": unowned booking whose contact email does not match
   */
  claim(ref: string, accountEmail: string): Promise<ClaimResult>;

  /** Removes a booking by reference (used for smoke test isolation / cleanup). */
  delete(ref: string): Promise<boolean>;

  /** Subscribes to changes in the booking repository. */
  subscribe(listener: () => void): () => void;
}

export type ClaimStatus =
  | "claimed"
  | "already-owned-by-user"
  | "not-found"
  | "owned-by-another"
  | "contact-mismatch";

export type ClaimResult =
  | { status: "claimed"; booking: Booking }
  | { status: "already-owned-by-user"; booking: Booking }
  | { status: "not-found" }
  | { status: "owned-by-another" }
  | { status: "contact-mismatch" };

export interface MonthlyDayService {
  date: string;
  hasService: boolean;
  lowestFare: number | null;
  flightCount: number;
}

export type MonthlyServiceMap = Record<string, MonthlyDayService>;

export interface FlightRepository {
  /** Retrieves scheduled flights for a given date with operational overrides applied. */
  getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]>;

  /** Resolves a single flight instance with operational overrides applied. */
  getFlightById(id: string): Promise<Flight | null>;

  /** Searches effective flights for a route on a specific date with operational overrides composed. */
  searchFlights(origin: string, destination: string, date: string): Promise<Flight[]>;

  /** Retrieves a monthly service and lowest fare map for a route with operational overrides composed. */
  getMonthlyServiceMap(
    year: number,
    month: number,
    origin: string,
    destination: string,
    options?: { paxCount?: number; now?: Date | string | number },
  ): Promise<MonthlyServiceMap>;

  /** Retrieves all stored operational overrides. */
  getOverrides(): Promise<Record<string, FlightOverride>>;

  /** Retrieves the stored operational override for a flight if present. */
  getOverride(flightId: string): Promise<FlightOverride | null>;

  /** Applies an operational override to a flight. */
  setOverride(flightId: string, override: FlightOverride): Promise<void>;

  /** Clears an operational override on a flight. */
  clearOverride(flightId: string): Promise<void>;

  /** Subscribes to changes in flight overrides. */
  subscribe(listener: () => void): () => void;
}

export interface RepositoryRegistry {
  commercial: import("../commercial/types.ts").CommercialCatalogRepository;
  booking: BookingRepository;
  flight: FlightRepository;
  passenger: import("../passenger/repository.ts").PassengerRepository;
  bookingDraft: import("../booking-draft/types.ts").BookingDraftRepository;
  contact: import("../contact/types.ts").ContactRepository;
  schedule: import("../schedules/types.ts").ScheduleRepository;
}
