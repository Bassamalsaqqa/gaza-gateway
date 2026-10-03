/**
 * Gaza Gateway — Contact Query Keys
 *
 * Hierarchical TanStack Query key factories for the Contact domain.
 */

import type { ContactFilterOptions } from "./types.ts";

export const contactKeys = {
  all: ["contact"] as const,
  lists: () => [...contactKeys.all, "list"] as const,
  list: (filters?: ContactFilterOptions) => [...contactKeys.lists(), filters ?? {}] as const,
  details: () => [...contactKeys.all, "detail"] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
  unread: () => [...contactKeys.all, "unread"] as const,
};
