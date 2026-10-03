import { isISOCalendarDate } from "./booking-validation.ts";
/**
 * Gaza Gateway — Admin Commercial Desk Domain Logic & Pure Selectors
 *
 * Provides pure domain functions and view-model builders for the airport check-in desk
 * and counter operations, keeping pure selectors decoupled from React route components.
 */

import { flightById, type Flight } from "../data.ts";
import { type Booking, type Leg, isPaxCheckedIn, getBookingLegs } from "./booking.ts";
import { type CheckInEligibilityResult, getCheckInEligibility } from "./check-in.ts";

export type DeskPassengerStatus = "done" | "closed" | "docs" | "seat" | "ready";

/** Presentation only; timing and operational eligibility are supplied by the canonical policy. */
export function adminCheckInStatusKey(
  row: Pick<AdminCheckInRow, "status" | "eligibility">,
): string {
  if (row.status !== "closed") return `a2.ci.st.${row.status}`;
  if (row.eligibility.reason === "too_early") return "a2.ci.st.early";
  if (row.eligibility.reason === "closed") return "a2.ci.st.closed";
  return "a2.ci.st.unavailable";
}

export function sanitizeAdminCheckInSearch(search: Record<string, unknown>): {
  date?: string | undefined;
  ref?: string | undefined;
  flightId?: string | undefined;
} {
  const date = isISOCalendarDate(search["date"]) ? search["date"] : undefined;
  const ref =
    typeof search["ref"] === "string" && /^[A-Z0-9][A-Z0-9-]{3,19}$/i.test(search["ref"].trim())
      ? search["ref"].trim().toUpperCase()
      : undefined;
  const flightId =
    typeof search["flightId"] === "string" && flightById(search["flightId"])
      ? search["flightId"]
      : undefined;
  return { date, ref, flightId };
}

export interface AdminCheckInRow {
  id: string;
  ref: string;
  paxIndex: number;
  leg: Leg;
  passengerId: string;
  name: string;
  document: string;
  seat: string | null;
  bags: number;
  meal: string;
  assistance: string | null;
  checkedIn: boolean;
  status: DeskPassengerStatus;
  eligibility: CheckInEligibilityResult;
  booking: Booking;
}

/**
 * Pure selector building admin check-in view model rows from flight and canonical bookings.
 * Status precedence: Checked in -> Ineligible/closed -> Needs document -> Needs seat -> Ready.
 * Infants on lap travel with accompanying adult and have no independent seat or row.
 */
export function buildAdminCheckInRows(
  flight: Flight | null | undefined,
  bookings: Booking[],
  now: Date | string | number = new Date(),
): AdminCheckInRow[] {
  if (!flight || flight.originCode !== "GZA") return [];

  const rows: AdminCheckInRow[] = [];

  for (const b of bookings) {
    if (b.status === "cancelled") continue;

    const matchingLeg = getBookingLegs(b).find((entry) => entry.flight.id === flight.id);
    if (!matchingLeg) continue;
    const leg = matchingLeg.leg;
    const eligibility = getCheckInEligibility(b, leg, flight, { now });

    b.passengers.forEach((p, idx) => {
      if (p.type === "infant") return;

      const isChecked = isPaxCheckedIn(b, leg, idx);
      const seat = b.seats?.[`${leg}-${idx}`] ?? null;
      const document = p.document?.trim() ?? "";
      const paxExtra = b.extras?.pax?.[idx];
      const assistanceList = paxExtra?.assistance ?? [];

      let status: DeskPassengerStatus;
      if (isChecked) {
        status = "done";
      } else if (!eligibility.eligible) {
        status = "closed";
      } else if (!document) {
        status = "docs";
      } else if (!seat) {
        status = "seat";
      } else {
        status = "ready";
      }

      rows.push({
        id: `${b.ref}-${leg}-${idx}`,
        leg,
        ref: b.ref,
        paxIndex: idx,
        passengerId: p.id,
        name: `${p.firstName} ${p.lastName}`.trim() || `Passenger ${idx + 1}`,
        document,
        seat,
        bags: paxExtra?.extraBags ?? 0,
        meal: paxExtra?.meal ?? "standard",
        assistance: assistanceList.length > 0 ? assistanceList.join(", ") : null,
        checkedIn: isChecked,
        status,
        eligibility,
        booking: b,
      });
    });
  }

  return rows;
}
