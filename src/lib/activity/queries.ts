/**
 * Gaza Gateway — Canonical Activity Query Hooks (Phase 6C)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { activityKeys } from "./keys.ts";
import type { ActivityEvent, ActivityFilter, CreateActivityInput } from "./types.ts";

export function useActivityQuery(filter?: ActivityFilter) {
  const { activity } = useRepositories();
  return useQuery<ActivityEvent[]>({
    queryKey: activityKeys.list(filter),
    queryFn: () => activity.list(filter),
  });
}

export function useActivityEventQuery(id: string) {
  const { activity } = useRepositories();
  return useQuery<ActivityEvent | null>({
    queryKey: activityKeys.detail(id),
    queryFn: () => activity.getById(id),
    enabled: Boolean(id),
  });
}

export function useRecordActivityMutation() {
  const { activity } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActivityInput) => {
      return activity.append(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}
