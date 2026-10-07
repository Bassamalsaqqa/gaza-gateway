/**
 * Gaza Gateway — Canonical Activity Query Keys (Phase 6C)
 */

import type { ActivityFilter } from "./types.ts";

export const activityKeys = {
  all: ["activity"] as const,
  list: (filter?: ActivityFilter) => [...activityKeys.all, "list", filter ?? {}] as const,
  detail: (id: string) => [...activityKeys.all, "detail", id] as const,
};
