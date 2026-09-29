/**
 * Gaza Gateway — Passenger Domain Module (Phase 5A)
 *
 * Defines canonical passenger types, identity normalization, storage sanitization,
 * and pure ownership selection predicates.
 */

import type { Booking } from "../domain/booking.ts";

export interface PassengerAccount {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  seatPreference: string;
  mealPreference: string;
  newsletter: boolean;
}

/** Alias for backward compatibility */
export type Account = PassengerAccount;

export interface Traveler {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  document: string;
}

export interface PassengerStorageV1 {
  schemaVersion: 1;
  account: PassengerAccount | null;
  travelers: Traveler[];
}

export const VALID_SEAT_PREFERENCES = ["none", "window", "aisle"] as const;
export type SeatPreference = (typeof VALID_SEAT_PREFERENCES)[number];

export const VALID_MEAL_PREFERENCES = [
  "standard",
  "halal",
  "vegetarian",
  "vegan",
  "kosher",
  "none",
] as const;
export type MealPreference = (typeof VALID_MEAL_PREFERENCES)[number];

/**
 * Normalizes email identity for canonical comparison and ownership checks:
 * trims leading/trailing whitespace and lowercases.
 */
export function normalizeEmailIdentity(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * Generates a stable unique traveler identifier using crypto.randomUUID()
 * with a secure fallback when unavailable.
 */
export function generateTravelerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `trv-${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `trv-${timestamp}-${randomSuffix}`;
}

/**
 * Sanitizes and validates a passenger account record.
 * Normalizes email and enforces valid field shapes.
 */
export function sanitizePassengerAccount(raw: unknown): PassengerAccount | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Record<string, unknown>;
  const emailRaw = typeof candidate["email"] === "string" ? candidate["email"] : "";
  const normalizedEmail = normalizeEmailIdentity(emailRaw);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return null;
  }

  const firstName = typeof candidate["firstName"] === "string" ? candidate["firstName"].trim() : "";
  const lastName = typeof candidate["lastName"] === "string" ? candidate["lastName"].trim() : "";
  const phone = typeof candidate["phone"] === "string" ? candidate["phone"].trim() : "";

  const seatRaw = typeof candidate["seatPreference"] === "string" ? candidate["seatPreference"].trim() : "";
  const seatPreference = VALID_SEAT_PREFERENCES.includes(seatRaw as SeatPreference) ? seatRaw : "none";

  const mealRaw = typeof candidate["mealPreference"] === "string" ? candidate["mealPreference"].trim() : "";
  const mealPreference = VALID_MEAL_PREFERENCES.includes(mealRaw as MealPreference) ? mealRaw : "standard";

  const newsletter = candidate["newsletter"] === true;

  return {
    email: normalizedEmail,
    firstName,
    lastName,
    phone,
    seatPreference,
    mealPreference,
    newsletter,
  };
}

/**
 * Sanitizes an array of saved travelers.
 * Guarantees unique, non-empty IDs, trims strings, and filters malformed entries.
 */
export function sanitizeTravelers(raw: unknown): Traveler[] {
  if (!Array.isArray(raw)) return [];

  const seenIds = new Set<string>();
  const sanitized: Traveler[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const entry = item as Record<string, unknown>;
    const firstName = typeof entry["firstName"] === "string" ? entry["firstName"].trim() : "";
    const lastName = typeof entry["lastName"] === "string" ? entry["lastName"].trim() : "";
    const dob = typeof entry["dob"] === "string" ? entry["dob"].trim() : "";
    const nationality = typeof entry["nationality"] === "string" ? entry["nationality"].trim() : "";
    const document = typeof entry["document"] === "string" ? entry["document"].trim() : "";

    // A traveler must have at least a first or last name
    if (!firstName && !lastName) continue;

    let id = typeof entry["id"] === "string" && entry["id"].trim().length > 0 ? entry["id"].trim() : "";
    if (!id || seenIds.has(id)) {
      id = generateTravelerId();
    }
    seenIds.add(id);

    sanitized.push({
      id,
      firstName,
      lastName,
      dob,
      nationality: nationality || "Palestinian",
      document,
    });
  }

  return sanitized;
}

/**
 * Validates and sanitizes the complete canonical passenger storage envelope.
 */
export function sanitizePassengerStorage(raw: unknown): PassengerStorageV1 {
  if (!raw || typeof raw !== "object") {
    return {
      schemaVersion: 1,
      account: null,
      travelers: [],
    };
  }

  const envelope = raw as Record<string, unknown>;
  const account = sanitizePassengerAccount(envelope["account"]);
  const travelers = sanitizeTravelers(envelope["travelers"]);

  return {
    schemaVersion: 1,
    account,
    travelers,
  };
}

/**
 * Pure predicate checking whether a booking belongs to a given passenger account.
 * Compares normalized email identities.
 */
export function bookingBelongsToAccount(
  booking: Pick<Booking, "ownerEmail"> | null | undefined,
  accountOrEmail: PassengerAccount | string | null | undefined,
): boolean {
  if (!booking?.ownerEmail) return false;

  const targetEmail =
    typeof accountOrEmail === "string"
      ? accountOrEmail
      : accountOrEmail && typeof accountOrEmail === "object"
        ? accountOrEmail.email
        : "";

  const normalizedOwner = normalizeEmailIdentity(booking.ownerEmail);
  const normalizedTarget = normalizeEmailIdentity(targetEmail);

  if (!normalizedOwner || !normalizedTarget) return false;
  return normalizedOwner === normalizedTarget;
}

/**
 * Pure selector filtering bookings that belong to a given passenger account.
 */
export function bookingsForAccount<T extends Pick<Booking, "ownerEmail">>(
  bookings: T[],
  accountOrEmail: PassengerAccount | string | null | undefined,
): T[] {
  if (!Array.isArray(bookings)) return [];
  return bookings.filter((b) => bookingBelongsToAccount(b, accountOrEmail));
}
