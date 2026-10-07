/**
 * Gaza Gateway — Canonical Staff TanStack Query Keys
 */

export const staffKeys = {
  all: ["staff"] as const,
  list: () => [...staffKeys.all, "list"] as const,
  detail: (id: string) => [...staffKeys.all, "detail", id] as const,
  byEmail: (email: string) => [...staffKeys.all, "byEmail", email.trim().toLowerCase()] as const,
};
