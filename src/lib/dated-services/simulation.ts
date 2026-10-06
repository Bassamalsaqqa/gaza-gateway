/**
 * Gaza Gateway — Dated-Service Prototype Simulation
 *
 * Deterministic simulation for prototype operational presentation fields:
 * - status
 * - gate
 * - terminal
 * - seatsLeft
 * - basePrice adjustment
 *
 * Invariants:
 * 1. Strictly deterministic from stable serviceId (hash of svc1-...).
 * 2. Mutable schedule fields (number, departTime, aircraft, etc.) DO NOT change simulation facts.
 * 3. Controlled `now` affects date-relative status presentation (Scheduled/OnTime/Landed) without mutating identity.
 * 4. Reference timezone for calendar date comparison is Asia/Gaza.
 * 5. Price is derived purely from explicit route merchandising input, never Network/Schedule persistence.
 */

import type { FlightStatus } from "../data.ts";
import { DatedServiceMaterializationError } from "./types.ts";

/**
 * Pure 32-bit FNV-1a hash algorithm.
 */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Returns today's ISO date (YYYY-MM-DD) in the authoritative Asia/Gaza reference timezone.
 */
export function toGazaISODate(now?: Date | string | number): string {
  const d =
    now !== undefined
      ? typeof now === "number"
        ? new Date(now)
        : typeof now === "string"
          ? new Date(now)
          : now
      : new Date();
  if (!Number.isFinite(d.getTime()))
    throw new DatedServiceMaterializationError("invalid_clock", "Invalid simulation clock.");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Gaza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Deterministically computes operational status for a dated service.
 * Respects explicit cancellation effect over temporal simulation.
 */
export function simulateServiceStatus(
  serviceId: string,
  date: string,
  isCancelledEffect: boolean,
  now?: Date | string | number,
): FlightStatus {
  if (isCancelledEffect) return "Cancelled";

  const today = toGazaISODate(now);
  if (date > today) return "Scheduled";

  const h = hashString(serviceId);
  if (date < today) return h % 11 === 0 ? "Cancelled" : "Landed";

  const pool: FlightStatus[] = [
    "OnTime",
    "OnTime",
    "Boarding",
    "Delayed",
    "Departed",
    "Scheduled",
    "OnTime",
    "Landed",
    "Cancelled",
  ];
  return pool[h % pool.length] ?? "Scheduled";
}

/**
 * Simulates gate assignment from stable service ID.
 * Format: A1 - A8.
 */
export function simulateServiceGate(serviceId: string): string {
  const seed = hashString(serviceId);
  return `A${(seed % 8) + 1}`;
}

/**
 * Simulates terminal assignment. Default is "1".
 */
export function simulateServiceTerminal(_serviceId: string): string {
  return "1";
}

/**
 * Simulates remaining seat inventory from stable service ID.
 * Returns integer in range [4, 27].
 */
export function simulateServiceSeatsLeft(serviceId: string): number {
  const seed = hashString(serviceId);
  return 4 + (seed % 24);
}

/**
 * Computes deterministic base price from route merchandising price input and serviceId seed.
 */
export function simulateServiceBasePrice(serviceId: string, routeBasePrice: number): number {
  const seed = hashString(serviceId);
  const adjustment = (seed % 6) * 12;
  return Math.round(routeBasePrice + adjustment);
}
