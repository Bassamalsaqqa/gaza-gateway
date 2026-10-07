import { useMutation, useQuery } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { scheduleKeys } from "./keys.ts";
import type { ScheduleCreateInput, ScheduleMutationReceipt, ScheduleUpdateInput } from "./types.ts";

/** One subscription/invalidation authority in RepositoryProvider. */
export function useSchedulesQuery() {
  const { schedule } = useRepositories();
  return useQuery({ queryKey: scheduleKeys.lists(), queryFn: () => schedule.list() });
}

export function useScheduleQuery(id: string | null | undefined) {
  const { schedule } = useRepositories();
  const cleanId = id?.trim() ?? "";
  return useQuery({
    queryKey: scheduleKeys.detail(cleanId),
    queryFn: () => schedule.getById(cleanId),
    enabled: Boolean(cleanId),
  });
}

export function useCreateScheduleMutation() {
  const { schedule } = useRepositories();
  return useMutation({
    mutationFn: (input: ScheduleCreateInput): Promise<ScheduleMutationReceipt> =>
      schedule.createWithReceipt(input),
  });
}

export function useUpdateScheduleMutation() {
  const { schedule } = useRepositories();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: ScheduleUpdateInput;
    }): Promise<ScheduleMutationReceipt> => schedule.updateWithReceipt(id, patch),
  });
}
