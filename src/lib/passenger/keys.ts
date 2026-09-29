/**
 * Gaza Gateway — Passenger Query Keys (Phase 5A)
 */

export const passengerKeys = {
  all: ["passenger"] as const,
  account: () => [...passengerKeys.all, "account"] as const,
  travelers: () => [...passengerKeys.all, "travelers"] as const,
};
