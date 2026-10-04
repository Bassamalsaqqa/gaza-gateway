/**
 * Gaza Gateway — Schedule Query Keys
 *
 * Hierarchical deterministic TanStack Query key factories for the Schedule domain.
 */

export const scheduleKeys = {
  all: ["schedules"] as const,
  lists: () => [...scheduleKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...scheduleKeys.lists(), filters] as const,
  details: () => [...scheduleKeys.all, "detail"] as const,
  detail: (id: string) => [...scheduleKeys.details(), id ? id.trim() : ""] as const,
};
