/**
 * Gaza Gateway — Booking Lookup & Identity Normalization Domain Logic
 *
 * Implements shared PNR, last name, and email matching rules for
 * public /manage and /check-in entry points.
 *
 * Invariants:
 * - Case-insensitive, trimmed PNR matching.
 * - Case-insensitive, trimmed last name or contact email matching.
 * - Does not persist lookup credentials to localStorage or sessionStorage.
 * - Browser-local static prototype; no long-lived session authority.
 */

import type { Booking } from "./booking.ts";

export function normalizePnr(pnr: string | null | undefined): string {
  return (pnr ?? "").trim().toUpperCase();
}

export function normalizeIdentifier(val: string | null | undefined): string {
  return (val ?? "").trim().toLowerCase();
}

/**
 * Checks whether an entered identifier (family name or contact email) matches
 * any passenger's last name or the booking's contact email.
 */
export function matchesBookingIdentifier(
  booking: Booking | null | undefined,
  identifier: string | null | undefined,
): boolean {
  if (!booking) return false;
  const cleanId = normalizeIdentifier(identifier);
  if (!cleanId) return false;

  // 1. Match any passenger's last name
  const matchesLastName = (booking.passengers ?? []).some(
    (p) => normalizeIdentifier(p.lastName) === cleanId,
  );
  if (matchesLastName) return true;

  // 2. Match contact email
  if (booking.contact?.email && normalizeIdentifier(booking.contact.email) === cleanId) {
    return true;
  }

  return false;
}
