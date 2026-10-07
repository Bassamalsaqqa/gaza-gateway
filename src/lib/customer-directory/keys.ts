/**
 * Gaza Gateway — Customer Directory TanStack Query Keys (Phase 6C)
 */

export const customerKeys = {
  all: ["customers"] as const,
  list: () => [...customerKeys.all, "list"] as const,
  detail: (id: string) => [...customerKeys.all, "detail", id] as const,
};
