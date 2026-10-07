/**
 * Gaza Gateway — Fleet React Query Hooks
 *
 * Provides typed TanStack Query query and mutation hooks for fleet data.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { fleetKeys } from "./keys.ts";
import type {
  AircraftCreateInput,
  AircraftUpdatePatch,
  FleetAircraftMutationReceipt,
  FleetLayoutMutationReceipt,
  LayoutUpdateInput,
} from "./types.ts";

export function useFleetQuery() {
  const { fleet } = useRepositories();
  return useQuery({
    queryKey: fleetKeys.current(),
    queryFn: () => fleet.get(),
    retry: false,
  });
}

export function useCreateAircraftMutation() {
  const { fleet } = useRepositories();
  return useMutation({
    mutationFn: (input: AircraftCreateInput) => fleet.createAircraft(input),
  });
}

export function useUpdateAircraftMutation() {
  const { fleet } = useRepositories();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: AircraftUpdatePatch;
    }): Promise<FleetAircraftMutationReceipt> => fleet.updateAircraftWithReceipt(id, patch),
  });
}

export function useUpdateLayoutMutation() {
  const { fleet } = useRepositories();
  return useMutation({
    mutationFn: ({
      aircraftId,
      input,
    }: {
      aircraftId: string;
      input: LayoutUpdateInput;
    }): Promise<FleetLayoutMutationReceipt> => fleet.updateLayoutWithReceipt(aircraftId, input),
  });
}
