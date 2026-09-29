/**
 * Gaza Gateway — Central Query Keys
 *
 * Provides hierarchical TanStack Query key factories for the Booking and Flight aggregates.
 */

/** Hierarchical Query Keys for the Booking domain */
export const bookingKeys = {
  all: ["bookings"] as const,
  lists: () => [...bookingKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...bookingKeys.lists(), filters] as const,
  details: () => [...bookingKeys.all, "detail"] as const,
  detail: (ref: string) => [...bookingKeys.details(), ref ? ref.toUpperCase() : ""] as const,
};

/** Hierarchical Query Keys for the Flight domain */
export const flightKeys = {
  all: ["flights"] as const,
  lists: () => [...flightKeys.all, "list"] as const,
  list: (date: string, direction?: "dep" | "arr") => [...flightKeys.lists(), { date, direction }] as const,
  details: () => [...flightKeys.all, "detail"] as const,
  detail: (id: string) => [...flightKeys.details(), id] as const,
  overrides: () => [...flightKeys.all, "overrides"] as const,
};

export { passengerKeys } from "../passenger/keys.ts";
