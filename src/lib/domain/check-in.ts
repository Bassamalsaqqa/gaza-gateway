/**
 * Gaza Gateway — Canonical Check-In Eligibility & Policy
 *
 * Implements the single source of truth for check-in window and eligibility:
 * - Window opens: exactly 24 hours before scheduled departure (inclusive).
 * - Window closes: exactly 60 minutes before scheduled departure (exclusive).
 * - Governed strictly by SCHEDULED departure time evaluated in origin station timezone.
 *   `revisedDepart` never extends or alters the check-in window.
 * - Flight status requirements: "Scheduled", "OnTime", and "Delayed" can qualify.
 *   "Cancelled", "Boarding", "Departed", and "Landed" cannot permit new check-in.
 * - Non-infant passengers who have not yet checked in for the leg can qualify.
 */

import type { Flight, FlightStatus } from "../data.ts";
import { flightDepartureEpoch } from "../booking-rules.ts";
import type { Booking, Leg } from "./booking.ts";

export type CheckInIneligibilityReason =
  | "missing_booking"
  | "missing_leg"
  | "missing_flight"
  | "booking_cancelled"
  | "flight_cancelled"
  | "flight_boarding"
  | "flight_departed"
  | "flight_landed"
  | "too_early"
  | "closed"
  | "already_checked_in"
  | "no_eligible_passengers";

export interface CheckInEligibilityResult {
  eligible: boolean;
  reason?: CheckInIneligibilityReason;
  opensAt?: number; // UTC ms epoch
  closesAt?: number; // UTC ms epoch
  eligiblePaxIndexes?: number[];
}

export const PERMITTED_CHECKIN_STATUSES: ReadonlySet<FlightStatus> = new Set([
  "Scheduled",
  "OnTime",
  "Delayed",
]);

/** 24 hours in milliseconds */
export const CHECKIN_WINDOW_OPENS_BEFORE_MS = 24 * 60 * 60 * 1000;

/** 60 minutes in milliseconds */
export const CHECKIN_WINDOW_CLOSES_BEFORE_MS = 60 * 60 * 1000;

export interface CheckInEligibilityOptions {
  /** Clock override for evaluation (UTC ms, Date, or ISO string). Defaults to Date.now(). */
  now?: Date | string | number | undefined;
}

/**
 * Pure evaluation of check-in eligibility for a given booking, leg, and effective flight.
 */
export function getCheckInEligibility(
  booking: Booking | null | undefined,
  leg: Leg,
  effectiveFlight: Flight | null | undefined,
  options?: CheckInEligibilityOptions,
): CheckInEligibilityResult {
  if (!booking) {
    return { eligible: false, reason: "missing_booking" };
  }

  if (booking.status === "cancelled") {
    return { eligible: false, reason: "booking_cancelled" };
  }

  const bookedFlight = leg === "in" ? booking.inbound : booking.outbound;
  if (!bookedFlight) {
    return { eligible: false, reason: "missing_leg" };
  }

  if (!effectiveFlight) {
    return { eligible: false, reason: "missing_flight" };
  }

  // 1. Evaluate operational flight status
  const flightStatus = effectiveFlight.status;
  if (!PERMITTED_CHECKIN_STATUSES.has(flightStatus)) {
    if (flightStatus === "Cancelled") {
      return { eligible: false, reason: "flight_cancelled" };
    }
    if (flightStatus === "Boarding") {
      return { eligible: false, reason: "flight_boarding" };
    }
    if (flightStatus === "Departed") {
      return { eligible: false, reason: "flight_departed" };
    }
    if (flightStatus === "Landed") {
      return { eligible: false, reason: "flight_landed" };
    }
    return { eligible: false, reason: "flight_cancelled" };
  }

  // 2. Evaluate scheduled departure window (in departure station timezone)
  // Scheduled departure governs: revised departure NEVER extends this window.
  const scheduledEpoch = flightDepartureEpoch(effectiveFlight);
  const opensAt = scheduledEpoch - CHECKIN_WINDOW_OPENS_BEFORE_MS;
  const closesAt = scheduledEpoch - CHECKIN_WINDOW_CLOSES_BEFORE_MS;

  const currentClock = options?.now !== undefined
    ? (options.now instanceof Date ? options.now.getTime() : typeof options.now === "string" ? new Date(options.now).getTime() : options.now)
    : Date.now();

  // Open boundary inclusive: now >= opensAt
  if (currentClock < opensAt) {
    return { eligible: false, reason: "too_early", opensAt, closesAt };
  }

  // Close boundary exclusive: now < closesAt (if now >= closesAt, checkin is closed)
  if (currentClock >= closesAt) {
    return { eligible: false, reason: "closed", opensAt, closesAt };
  }

  // 3. Evaluate eligible seat-requiring passengers
  const checked = booking.checkedIn?.[leg] ?? [];
  const seatable = (booking.passengers ?? []).flatMap((p, i) =>
    p.type === "infant" ? [] : [i],
  );

  if (seatable.length === 0) {
    return { eligible: false, reason: "no_eligible_passengers", opensAt, closesAt };
  }

  const eligiblePaxIndexes = seatable.filter((i) => !checked.includes(i));
  if (eligiblePaxIndexes.length === 0) {
    return { eligible: false, reason: "already_checked_in", opensAt, closesAt, eligiblePaxIndexes: [] };
  }

  return {
    eligible: true,
    opensAt,
    closesAt,
    eligiblePaxIndexes,
  };
}
