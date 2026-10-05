/**
 * Gaza Gateway — Fleet Query Keys
 *
 * Provides central TanStack Query keys for fleet data queries and cache invalidation.
 */

export const fleetKeys = {
  all: ["fleet"] as const,
  current: () => [...fleetKeys.all, "current"] as const,
  aircraft: (id: string) => [...fleetKeys.all, "aircraft", id] as const,
  layout: (aircraftId: string) => [...fleetKeys.all, "layout", aircraftId] as const,
};
