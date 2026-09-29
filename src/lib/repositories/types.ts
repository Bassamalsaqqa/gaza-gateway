/**
 * Gaza Gateway — Repository Interfaces & Contracts
 *
 * Defines asynchronous, backend-ready repository contracts for:
 * 1. BookingRepository: Canonical aggregate root for bookings, passengers, seats, check-in.
 * 2. FlightRepository: Canonical aggregate root for flights and operational overrides.
 */

import type { Booking, BookingCreateInput, Leg } from "../domain/booking.ts";
import type { Flight, FlightOverride } from "../domain/flight.ts";

export interface BookingRepository {
  /** Retrieves all confirmed and cancelled bookings. */
  list(): Promise<Booking[]>;

  /** Retrieves a single booking by reference (case-insensitive). */
  getByRef(ref: string): Promise<Booking | null>;

  /** Creates and persists a new booking with stable passenger IDs. */
  create(data: BookingCreateInput): Promise<Booking>;

  /** Updates fields on an existing booking. */
  update(ref: string, patch: Partial<Booking>): Promise<Booking | null>;

  /** Marks specific passenger indices as checked in on the given leg. */
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

export interface FlightRepository {
  /** Retrieves scheduled flights for a given date with operational overrides applied. */
  getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]>;

  /** Resolves a single flight instance with operational overrides applied. */
  getFlightById(id: string): Promise<Flight | null>;

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
  booking: BookingRepository;
  flight: FlightRepository;
  passenger: import("../passenger/repository.ts").PassengerRepository;
}
